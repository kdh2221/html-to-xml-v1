/**
 * Stage 3.5 orchestrator — 채워진 DataCollection IR을 화면 컴포넌트에 바인딩.
 * 순서: ref 부착 → grid 정렬 → submission 주입 → 상세영역 바인딩.
 */
import { bindRefs } from './ref-binder';
import { reconcileGrids } from './grid-reconciler';
import { generateSubmissions } from './submission-generator';
import { bindDetailTables } from './detail-binder';
import type { DataCollectionIR } from '../types';

export function bindDataCollection(xml: string, ir: DataCollectionIR): string {
  let result = bindRefs(xml, ir);
  result = reconcileGrids(result, ir);
  result = generateSubmissions(result, ir);
  result = bindDetailTables(result, ir);   // 2C-2: 상세영역 → DataList
  return result;
}
