/**
 * Stage 3.5 orchestrator — 채워진 DataCollection IR을 화면 컴포넌트에 바인딩.
 * 순서: ref 부착 → grid 정렬 → submission 주입.
 */
import { bindRefs } from './ref-binder';
import { reconcileGrids } from './grid-reconciler';
import { generateSubmissions } from './submission-generator';
import type { DataCollectionIR } from '../types';

export function bindDataCollection(xml: string, ir: DataCollectionIR): string {
  let result = bindRefs(xml, ir);
  result = reconcileGrids(result, ir);
  result = generateSubmissions(result, ir);
  return result;
}
