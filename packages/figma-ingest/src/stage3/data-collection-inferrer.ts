/**
 * Stage 3 메인 orchestrator.
 *
 * 입력 XML에서 region이 없으면 LLM 호출 없이 빈 IR 반환.
 * LLM 호출이 실패하면 graceful degradation — 빈 IR + confidence=0 + 오류 notes.
 */
import { extractRegions } from './xml-region-parser';
import type { LLMClientLike } from './llm-mock';
import type { DataCollectionIR } from '../types';

const EMPTY_IR_CONFIDENT: DataCollectionIR = {
  dataMaps: [],
  dataLists: [],
  confidence: 1.0,
  notes: '추출된 region 없음 — DataCollection 불필요',
};

export async function inferDataCollection(
  xml: string,
  llmClient: LLMClientLike,
): Promise<DataCollectionIR> {
  const regions = extractRegions(xml);
  if (regions.length === 0) {
    return EMPTY_IR_CONFIDENT;
  }

  try {
    return await llmClient.inferDataCollection(xml);
  } catch (e) {
    return {
      dataMaps: [],
      dataLists: [],
      confidence: 0,
      notes: `LLM 추론 실패 — fallback 빈 IR. 원인: ${(e as Error).message}`,
    };
  }
}
