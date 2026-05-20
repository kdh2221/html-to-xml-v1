/**
 * Phase 1 파이프라인 오케스트레이터.
 *
 * Stage 0: HTML → 컴포넌트 + 좌표 (dom-extractor)
 * Stage 1: 컴포넌트 → ABSOLUTE-coord XML (absolute-xml-builder)
 * Stage 2: ABSOLUTE → RELATIVE XML (relative-converter, legacy 호출)
 * Stage 3: LLM Semantic Enricher (DataCollection 추론) — Phase 2A에서 통합됨
 * Stage 3.5: DataCollection 바인딩 (ref 부착 + grid 정렬 + submission 주입) — Phase 2B
 * Phase 1 룰: ID prefix 변환 (id-renamer) + 버튼 modifier 부여 (button-modifier)
 *
 * Phase 2 이후에 추가될 단계 (현재는 미포함):
 *   - Stage 4 안티패턴 검증
 *   - Stage 5 시각 회귀
 */
import { extractFromHtml } from './dom-extractor';
import { buildAbsoluteXml } from './absolute-xml-builder';
import { convertAbsoluteToRelative, RelativeOptions } from './relative-converter';
import { renameIdToUi01 } from './id-renamer';
import { applyButtonModifiersInXml } from './button-modifier';
import { inferDataCollection } from './stage3/data-collection-inferrer';
import { injectDataCollection } from './stage3/xml-injector';
import { bindDataCollection } from './stage3/data-binder';
import type { LLMClientLike } from './stage3/llm-mock';
import type { ExtractionResult } from './types';

export interface PipelineOptions extends RelativeOptions {
  /** 디버그용: 중간 단계 결과를 반환받기 위한 콜백 */
  onStage?: (name: string, payload: unknown) => void;
  /** Stage 3 LLM 클라이언트 (없으면 Stage 3 skip) */
  llmClient?: LLMClientLike;
  /** Stage 3를 명시적으로 건너뛰는 escape hatch */
  noLlm?: boolean;
}

export async function convertHtmlToWebSquare(
  html: string,
  options: PipelineOptions = {}
): Promise<string> {
  // Stage 0: HTML → 컴포넌트 추출
  const extraction: ExtractionResult = await extractFromHtml(html);
  options.onStage?.('stage0-extraction', extraction);

  // Stage 1: 컴포넌트 → ABSOLUTE XML
  const absoluteXml = buildAbsoluteXml(extraction.meta, extraction.components);
  options.onStage?.('stage1-absolute', absoluteXml);

  // Stage 2: ABSOLUTE → RELATIVE
  const relativeXml = convertAbsoluteToRelative(absoluteXml, {
    adaptive: options.adaptive ?? false,
  });
  options.onStage?.('stage2-relative', relativeXml);

  // Stage 3: LLM Semantic Enricher (skip if --no-llm or no llmClient)
  let enrichedXml = relativeXml;
  if (!options.noLlm && options.llmClient) {
    const ir = await inferDataCollection(relativeXml, options.llmClient);
    enrichedXml = injectDataCollection(relativeXml, ir);
    enrichedXml = bindDataCollection(enrichedXml, ir);   // Stage 3.5: ref + grid + submission
    options.onStage?.('stage3-enriched', { ir, xml: enrichedXml });
  }

  // Phase 1 룰: ID prefix UI-01 + 버튼 modifier
  let result = renameIdToUi01(enrichedXml);
  result = applyButtonModifiersInXml(result);
  options.onStage?.('phase1-finalized', result);

  return result;
}
