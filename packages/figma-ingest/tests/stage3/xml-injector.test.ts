import { describe, expect, it } from 'vitest';
import { injectDataCollection } from '../../src/stage3/xml-injector';
import type { DataCollectionIR } from '../../src/types';

const EMPTY_DC_XML = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:w2="http://www.inswave.com/websquare" xmlns:xf="http://www.w3.org/2002/xforms">
  <head>
    <xf:model>
      <w2:dataCollection>
      </w2:dataCollection>
    </xf:model>
  </head>
  <body><xf:group>test</xf:group></body>
</html>`;

const sampleIR: DataCollectionIR = {
  dataMaps: [{
    id: 'dma_search',
    name: '검색조건',
    keys: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'DEPT_CD', name: '부서 코드', dataType: 'text' },
    ],
  }],
  dataLists: [{
    id: 'dlt_list',
    name: '사원목록',
    saveRemovedData: true,
    columns: [
      { id: 'chk', name: '선택', dataType: 'text' },
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
    ],
  }],
  confidence: 0.9,
};

describe('injectDataCollection', () => {
  it('빈 dataCollection에 DataMap + DataList 주입', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toContain('<w2:dataMap id="dma_search"');
    expect(out).toContain('<w2:key id="EMP_CD" name="사번" dataType="text"');
    expect(out).toContain('<w2:dataList id="dlt_list"');
    expect(out).toContain('saveRemovedData="true"');
    expect(out).toContain('<w2:column id="EMP_CD" name="사번" dataType="text"');
    expect(out).toContain('<w2:column id="chk" name="선택" dataType="text"');
  });

  it('dataMap에 baseNode="map" 부여', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toContain('baseNode="map"');
  });

  it('dataList에 baseNode="list" + repeatNode="map" 부여', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toMatch(/baseNode="list".*repeatNode="map"/s);
  });

  it('빈 IR (dataMaps/dataLists 모두 빈 배열) → dataCollection 빈 채로 유지', () => {
    const emptyIR: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 0 };
    const out = injectDataCollection(EMPTY_DC_XML, emptyIR);
    expect(out).not.toContain('<w2:dataMap');
    expect(out).not.toContain('<w2:dataList');
    expect(out).toContain('<w2:dataCollection>');
  });

  it('XML 다른 부분은 변경되지 않음', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toContain('<body><xf:group>test</xf:group></body>');
    expect(out).toContain('<?xml version="1.0"?>');
  });

  it('이미 채워진 dataCollection이 있어도 덮어씀', () => {
    const filled = EMPTY_DC_XML.replace(
      '<w2:dataCollection>\n      </w2:dataCollection>',
      '<w2:dataCollection><w2:dataMap id="dma_old"/></w2:dataCollection>'
    );
    const out = injectDataCollection(filled, sampleIR);
    expect(out).not.toContain('dma_old');
    expect(out).toContain('dma_search');
  });
});
