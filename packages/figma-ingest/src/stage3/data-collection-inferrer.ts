/**
 * Stage 3 메인 orchestrator.
 *
 * 입력 XML에서 region이 없으면 LLM 호출 없이 빈 IR 반환.
 * LLM 호출이 실패하면 graceful degradation — 빈 IR + confidence=0 + 오류 notes.
 */
import { extractRegions } from './xml-region-parser';
import type { LLMClientLike } from './llm-mock';
import type { DataCollectionIR } from '../types';

/** 매 호출마다 새 객체를 반환 — 공유 가변 상태 방지. */
function emptyIR(confidence: number, notes: string): DataCollectionIR {
  return { dataMaps: [], dataLists: [], confidence, notes };
}

export async function inferDataCollection(
  xml: string,
  llmClient: LLMClientLike,
): Promise<DataCollectionIR> {
  const regions = extractRegions(xml);
  if (regions.length === 0) {
    return emptyIR(1.0, '추출된 region 없음 — DataCollection 불필요');
  }

  try {
    return await llmClient.inferDataCollection(xml);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyIR(0, `LLM 추론 실패 — fallback 빈 IR. 원인: ${msg}`);
  }
}
