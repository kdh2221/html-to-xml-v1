/**
 * Inferred DataCollection IR을 XML의 <w2:dataCollection>...</w2:dataCollection>
 * 안에 주입한다. 다른 영역은 건드리지 않는다.
 */
import type {
  DataCollectionIR, DataMapIR, DataMapKeyIR, DataListIR, DataListColumnIR,
} from '../types';

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderKey(k: DataMapKeyIR): string {
  return `\t\t\t\t\t<w2:key id="${escapeXml(k.id)}" name="${escapeXml(k.name)}" dataType="${k.dataType}"/>`;
}

function renderDataMap(dm: DataMapIR): string {
  const keys = dm.keys.map(renderKey).join('\n');
  return [
    `\t\t\t<w2:dataMap id="${escapeXml(dm.id)}" baseNode="map">`,
    `\t\t\t\t<w2:keyInfo>`,
    keys,
    `\t\t\t\t</w2:keyInfo>`,
    `\t\t\t</w2:dataMap>`,
  ].join('\n');
}

function renderColumn(c: DataListColumnIR): string {
  return `\t\t\t\t\t<w2:column id="${escapeXml(c.id)}" name="${escapeXml(c.name)}" dataType="${c.dataType}"/>`;
}

function renderDataList(dl: DataListIR): string {
  const cols = dl.columns.map(renderColumn).join('\n');
  const saveAttr = dl.saveRemovedData !== false ? ' saveRemovedData="true"' : '';
  return [
    `\t\t\t<w2:dataList id="${escapeXml(dl.id)}" baseNode="list" repeatNode="map"${saveAttr}>`,
    `\t\t\t\t<w2:columnInfo>`,
    cols,
    `\t\t\t\t</w2:columnInfo>`,
    `\t\t\t</w2:dataList>`,
  ].join('\n');
}

export function injectDataCollection(xml: string, ir: DataCollectionIR): string {
  if (ir.dataMaps.length === 0 && ir.dataLists.length === 0) {
    return xml;
  }

  const inner = [
    ...ir.dataMaps.map(renderDataMap),
    ...ir.dataLists.map(renderDataList),
  ].join('\n');

  const pattern = /<w2:dataCollection\b[^>]*>[\s\S]*?<\/w2:dataCollection>/;

  if (!pattern.test(xml)) {
    throw new Error('XML에 <w2:dataCollection> 블록이 없음. Phase 0+1 출력 형식이 깨졌을 수 있음.');
  }

  const newBlock = `<w2:dataCollection baseNode="map">\n${inner}\n\t\t</w2:dataCollection>`;
  return xml.replace(pattern, newBlock);
}
