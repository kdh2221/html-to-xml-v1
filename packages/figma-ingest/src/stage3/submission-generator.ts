/**
 * Stage 3.5 — <xf:submission> 선언 생성 + <xf:model>에 주입.
 *
 * sbm_search: DataMap 있을 때 (ref=DataMap, target=첫 DataList).
 * sbm_save:   저장 라벨 버튼 + DataList 있을 때 (ref=target=첫 DataList).
 * 둘 다 action=/TODO_VERIFY (DL-08 주석 동반), ev:submitdone=핸들러(Stage 4).
 * </w2:dataCollection> 바로 뒤에 주입.
 */
import type { DataCollectionIR } from '../types';

// 저장 버튼 탐지는 라벨(CDATA) 정확 일치 — scwin-scaffolder.detectButtonByLabel과 동일 기준.
// (substring 매칭이면 "임시저장" 등이 sbm_save만 만들고 핸들러는 안 생겨 orphan submission이 됨)

/** xml에 라벨(CDATA)이 정확히 '저장'인 trigger가 있으면 true. */
function hasSaveButton(xml: string): boolean {
  const triggers = xml.match(/<xf:trigger\b[\s\S]*?<\/xf:trigger>/g) || [];
  return triggers.some(t => {
    const lblM = t.match(/<xf:label>\s*<!\[CDATA\[([^\]]*)\]\]>\s*<\/xf:label>/);
    return lblM != null && lblM[1].trim() === '저장';
  });
}

export function generateSubmissions(xml: string, ir: DataCollectionIR): string {
  const blocks: string[] = [];

  // sbm_search — DataMap 있을 때
  if (ir.dataMaps.length > 0) {
    const dm = ir.dataMaps[0];
    const target = ir.dataLists.length > 0 ? ` target="data:json,${ir.dataLists[0].id}"` : '';
    blocks.push(
      `\n\t\t\t<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->\n` +
      `\t\t\t<xf:submission id="sbm_search" ref="data:json,${dm.id}"${target}` +
      ` action="/TODO_VERIFY" method="post" mediatype="application/json"` +
      ` ev:submitdone="scwin.sbm_search_submitdone"/>`,
    );
  }

  // sbm_save — 저장버튼 + DataList 있을 때
  if (ir.dataLists.length > 0 && hasSaveButton(xml)) {
    const dlt = ir.dataLists[0];
    blocks.push(
      `\n\t\t\t<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->\n` +
      `\t\t\t<xf:submission id="sbm_save" ref="data:json,${dlt.id}" target="data:json,${dlt.id}"` +
      ` action="/TODO_VERIFY" method="post" mediatype="application/json"` +
      ` ev:submitdone="scwin.sbm_save_submitdone"/>`,
    );
  }

  if (blocks.length === 0) return xml;
  if (!/<\/w2:dataCollection>/.test(xml)) return xml;
  return xml.replace(/(<\/w2:dataCollection>)/, `$1${blocks.join('')}`);
}
