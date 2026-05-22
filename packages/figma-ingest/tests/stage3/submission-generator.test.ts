import { describe, expect, it } from 'vitest';
import { generateSubmissions } from '../../src/stage3/submission-generator';
import type { DataCollectionIR } from '../../src/types';

const MODEL_XML = `<root>
  <xf:model>
    <w2:dataCollection baseNode="map">
      <w2:dataMap id="dma_search"/>
    </w2:dataCollection>
  </xf:model>
</root>`;

describe('generateSubmissions', () => {
  it('DataMap+DataList 있으면 submission 생성 (ref/target/action)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [{ id: 'dlt_list', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toContain('<xf:submission id="sbm_search"');
    expect(out).toContain('ref="data:json,dma_search"');
    expect(out).toContain('target="data:json,dlt_list"');
    expect(out).toContain('action="/TODO_VERIFY"');
    expect(out).toContain('ev:submitdone="scwin.sbm_search_submitdone"');
    expect(out).toContain('TODO: [서버 확인]');
  });

  it('DataList 없으면 target 생략', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toContain('<xf:submission id="sbm_search"');
    expect(out).not.toContain('target=');
  });

  it('DataMap 없으면 submission 생략 (마스터-디테일)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_memberBasic', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toBe(MODEL_XML);
  });

  it('submission은 </w2:dataCollection> 뒤에 주입', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [{ id: 'dlt_list', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    const dcEnd = out.indexOf('</w2:dataCollection>');
    const sbm = out.indexOf('<xf:submission');
    expect(sbm).toBeGreaterThan(dcEnd);
    expect(out.indexOf('</xf:model>')).toBeGreaterThan(sbm);
  });
});

const DLT_ONLY: DataCollectionIR = {
  dataMaps: [],
  dataLists: [{ id: 'dlt_memberBasic', name: '사원목록', columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  confidence: 0.9,
};

const XML_WITH_SAVE = `<xf:model><w2:dataCollection></w2:dataCollection></xf:model>
<xf:trigger id="btn_013"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>`;
const XML_NO_SAVE = `<xf:model><w2:dataCollection></w2:dataCollection></xf:model>
<xf:trigger id="btn_006"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>`;

describe('generateSubmissions — sbm_save (2C-3)', () => {
  it('저장버튼 + DataList → sbm_save 생성 (ref=target=DataList, submitdone)', () => {
    const out = generateSubmissions(XML_WITH_SAVE, DLT_ONLY);
    expect(out).toContain('<xf:submission id="sbm_save" ref="data:json,dlt_memberBasic" target="data:json,dlt_memberBasic"');
    expect(out).toContain('ev:submitdone="scwin.sbm_save_submitdone"');
    expect(out).toContain('action="/TODO_VERIFY"');
  });

  it('저장버튼 없으면 sbm_save 미생성', () => {
    const out = generateSubmissions(XML_NO_SAVE, DLT_ONLY);
    expect(out).not.toContain('sbm_save');
    expect(out).toBe(XML_NO_SAVE);
  });

  it('DataList 없으면 sbm_save 미생성', () => {
    const emptyIr: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 0.5 };
    expect(generateSubmissions(XML_WITH_SAVE, emptyIr)).toBe(XML_WITH_SAVE);
  });

  it('기존 sbm_search 회귀 (DataMap 있으면 sbm_search 생성)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [{ id: 'ORDER_NO', name: '주문번호', dataType: 'text' }] }],
      dataLists: [{ id: 'dlt_orderList', name: '주문', columns: [{ id: 'ORDER_NO', name: '주문번호', dataType: 'text' }] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(XML_WITH_SAVE, ir);
    expect(out).toContain('<xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_orderList"');
    expect(out).toContain('id="sbm_save"');
  });
});
