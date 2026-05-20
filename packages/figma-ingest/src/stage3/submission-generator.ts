/**
 * Stage 3.5 — <xf:submission> 선언 생성 + <xf:model>에 주입.
 *
 * DataMap이 있으면 조회 submission(sbm_search) 생성:
 *   - ref  = data:json,{첫 DataMap id}
 *   - target = data:json,{첫 DataList id}  (DataList 있을 때만)
 *   - action = /TODO_VERIFY (placeholder, DL-08 주석 동반)
 *   - ev:submitdone = scwin.sbm_search_submitdone (핸들러는 Plan 2C)
 * DataMap 없으면 생략.
 *
 * </w2:dataCollection> 바로 뒤에 주입 (xf:model 안).
 */
import type { DataCollectionIR } from '../types';

export function generateSubmissions(xml: string, ir: DataCollectionIR): string {
  if (ir.dataMaps.length === 0) return xml;

  const dm = ir.dataMaps[0];
  const target = ir.dataLists.length > 0 ? ` target="data:json,${ir.dataLists[0].id}"` : '';

  const block =
    `\n\t\t\t<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->\n` +
    `\t\t\t<xf:submission id="sbm_search" ref="data:json,${dm.id}"${target}` +
    ` action="/TODO_VERIFY" method="post" mediatype="application/json"` +
    ` ev:submitdone="scwin.sbm_search_submitdone"/>`;

  if (!/<\/w2:dataCollection>/.test(xml)) {
    return xml;
  }
  return xml.replace(/(<\/w2:dataCollection>)/, `$1${block}`);
}
