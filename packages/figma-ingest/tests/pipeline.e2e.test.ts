import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';
import { MockLLMClient } from '../src/stage3/llm-mock';
import type { DataCollectionIR } from '../src/types';

const FIX_DIR = path.join(__dirname, 'fixtures');

describe('pipeline.convertHtmlToWebSquare', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('simple-form.html → 유효한 WebSquare XML', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html);

    // 기본 XML 골격
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('xmlns:w2="http://www.inswave.com/websquare"');

    // ID prefix가 UI-01로 변환되었는지
    expect(xml).toMatch(/id="ibx_/);     // edt → ibx
    expect(xml).toMatch(/id="sbx_/);     // sel → sbx
    expect(xml).not.toMatch(/id="edt_/); // 잔존 없음
    expect(xml).not.toMatch(/id="sel_/);

    // 버튼 modifier
    expect(xml).toMatch(/class="btn_cm sch"/);

    // 상대좌표 (position:absolute 제거됨)
    expect(xml).not.toContain('position:absolute');
  }, 60000);

  it('search-grid.html → 다양한 버튼 modifier 자동 분류', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'search-grid.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html);

    // 조회 → sch, 초기화 → btn_cm (modifier 없음), 엑셀 다운로드 → download, 저장 → pt
    expect(xml).toMatch(/class="btn_cm sch"/);
    expect(xml).toMatch(/class="btn_cm download"/);
    expect(xml).toMatch(/class="btn_cm pt"/);
  }, 60000);

  it('XML이 well-formed인지 (간단한 파싱 검증)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html);

    // <html> 짝, <body> 짝, <head> 짝
    expect((xml.match(/<html\b/g) || []).length).toBe(1);
    expect((xml.match(/<\/html>/g) || []).length).toBe(1);
    expect((xml.match(/<body\b/g) || []).length).toBe(1);
    expect((xml.match(/<\/body>/g) || []).length).toBe(1);
  }, 60000);
});

function loadMockResponse(name: string): DataCollectionIR {
  return JSON.parse(fs.readFileSync(
    path.join(FIX_DIR, 'llm-responses', `${name}.json`), 'utf-8'
  ));
}

function makeMock(name: string): MockLLMClient {
  const mock = new MockLLMClient();
  mock.recordResponse(name, loadMockResponse(name));
  return mock;
}

describe('pipeline.convertHtmlToWebSquare with Stage 3 (Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  it('simple-form: DataMap + DataList 자동 생성', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toContain('<w2:dataMap id="dma_search"');
    expect(xml).toContain('<w2:key id="EMP_CD"');
    expect(xml).toContain('<w2:key id="DEPT_CD"');
    expect(xml).toContain('<w2:dataList id="dlt_list"');
    expect(xml).toContain('<w2:column id="EMP_CD"');
    expect(xml).toContain('<w2:column id="EMP_NM"');
  }, 60000);

  it('search-grid: ORDER_DATE에 date 타입 부여', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'search-grid.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('search-grid') });
    expect(xml).toContain('<w2:dataMap id="dma_search"');
    expect(xml).toContain('id="ORDER_DATE" name="주문일" dataType="date"');
    expect(xml).toContain('id="AMOUNT" name="금액" dataType="number"');
    expect(xml).toMatch(/<xf:inputCalendar\b[^>]*\bid="ica_orderDate"[^>]*ref="data:dma_search\.ORDER_DATE"/);
  }, 60000);

  it('master-detail: DataList만 생성 (DataMap 없음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).toContain('<w2:dataList id="dlt_memberBasic"');
  }, 60000);

  it('simple-form: ref 바인딩 + grid dataList + submission (Phase 2B)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toMatch(/<xf:input\b[^>]*\bid="ibx_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
    expect(xml).toMatch(/<xf:select1\b[^>]*\bid="sbx_deptCd"[^>]*ref="data:dma_search\.DEPT_CD"/);
    expect(xml).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
    expect(xml).toContain('<xf:submission id="sbm_search"');
    expect(xml).not.toContain('id="col_1"');
  }, 60000);

  it('master-detail: grid 바인딩 O, sbm_search 없음 (DataMap 없음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toMatch(/<w2:gridView[^>]*dataList="data:dlt_memberBasic"/);
    // DataMap 없음 → 조회 submission(sbm_search) 없음. (저장 submission sbm_save는 2C-3에서 추가됨)
    expect(xml).not.toContain('id="sbm_search"');
  }, 60000);

  it('simple-form: 검색영역이 표준 schbox 구조 (Phase 2C-0)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toContain('<xf:group class="schbox_inner" id="tbl_search">');
    expect(xml).toContain('<xf:group class="btn_schbox">');
    expect(xml).not.toContain('grp_search');
    expect(xml).not.toContain('tblbox');
    expect(xml).toMatch(/<xf:group class="btn_schbox">[\s\S]*btn_cm sch/);
    expect(xml).toMatch(/schbox_inner[\s\S]*ibx_empCd[^>]*ref="data:dma_search\.EMP_CD"/);
  }, 60000);

  it('noLlm: true → Phase 0+1 동작 (DataCollection 비어있음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { noLlm: true });
    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).not.toContain('<w2:dataList');
  }, 60000);

  it('simple-form: scwin 조회 핸들러 (Phase 2C-1)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toContain('$c.win.setEnterKeyEvent(tbl_search, scwin.');
    expect(xml).toContain('$c.sbm.execute(sbm_search);');
    expect(xml).toContain('scwin.sbm_search_submitdone = function(e) {');
    expect(xml).toMatch(/<xf:trigger\b[^>]*class="btn_cm sch"[^>]*ev:onclick="scwin\.\w+_onclick"/);
  }, 60000);

  it('master-detail: grid 호출 O, 조회 흐름(sbm_search) 없음 (Phase 2C-1)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toContain('$c.util.setGridViewDelCheckBox([');
    // DataMap 없음 → 조회 submission 실행/핸들러 없음. (저장 흐름 sbm_save는 2C-3에서 추가됨)
    expect(xml).not.toContain('$c.sbm.execute(sbm_search)');
    expect(xml).not.toContain('sbm_search_submitdone');
  }, 60000);

  it('master-detail: 상세 입력이 DataList에 바인딩 (Phase 2C-2)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toMatch(/id="ibx_empCdDetail"[^>]*ref="data:dlt_memberBasic\.EMP_CD"/);
    expect(xml).toMatch(/id="ibx_empNmDetail"[^>]*ref="data:dlt_memberBasic\.EMP_NM"/);
    expect(xml).toMatch(/id="sbx_deptNmDetail"[^>]*ref="data:dlt_memberBasic\.DEPT_NM"/);
    expect(xml).toContain('dataList="data:dlt_memberBasic"');
    expect(xml).toContain('$c.util.setGridViewDelCheckBox([');
  }, 60000);

  it('search-grid: 검색 입력은 dma_search 유지, DataList ref 미주입 (Phase 2C-2 회귀)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'search-grid.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('search-grid') });
    expect(xml).toMatch(/id="ibx_orderNo"[^>]*ref="data:dma_search\.ORDER_NO"/);
    expect(xml).not.toMatch(/id="ibx_orderNo"[^>]*ref="data:dlt_/);
  }, 60000);

  it('master-detail: 저장 흐름 (sbm_save + validateGroup + 키 mandatory + 취소) (Phase 2C-3)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toContain('<xf:submission id="sbm_save"');
    expect(xml).toMatch(/_onclick = async function\(\) \{[\s\S]*\$c\.data\.validateGroup\(grp_detail\)/);
    expect(xml).toContain('$c.sbm.execute(sbm_save);');
    expect(xml).toContain('$c.data.undoGridView(grd_005)');
    expect(xml).toContain('scwin.sbm_save_submitdone');
    expect(xml).toContain('MSG_CM_00031');
    expect(xml).toContain('MSG_CM_00032');
    expect(xml).toContain('<xf:group class="tblbox" id="grp_detail"');
    expect(xml).toMatch(/id="ibx_empCdDetail"[^>]*mandatory="true"/);
  }, 60000);

  it('search-grid: sbm_save + 저장(validateGroup 생략); 취소 없음 (Phase 2C-3)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'search-grid.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('search-grid') });
    expect(xml).toContain('<xf:submission id="sbm_save"');
    expect(xml).toContain('$c.sbm.execute(sbm_save);');
    expect(xml).not.toContain('validateGroup');
    expect(xml).not.toContain('undoGridView');
  }, 60000);

  it('simple-form: 저장 흐름 없음 (Phase 2C-3 회귀)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).not.toContain('sbm_save');
    expect(xml).not.toContain('grp_detail');
  }, 60000);

  it('파이프라인 onStage(validation) 발생 + simple-form critical 0 (Phase 3A)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    let violations: Array<{ severity: string }> | null = null;
    await convertHtmlToWebSquare(html, {
      llmClient: makeMock('simple-form'),
      onStage: (name, payload) => { if (name === 'validation') violations = payload as Array<{ severity: string }>; },
    });
    expect(violations).not.toBeNull();
    expect((violations as unknown as Array<{ severity: string }>).filter(v => v.severity === 'critical')).toEqual([]);
  }, 60000);

  for (const pname of ['simple-form', 'search-grid', 'master-detail']) {
    it(`${pname}: 변환 보존율 1.0 — field/button/gridColumn 유실 0 (Phase 4)`, async () => {
      const html = fs.readFileSync(path.join(FIX_DIR, `${pname}.html`), 'utf-8');
      let report: { rate: number; lost: unknown[] } | null = null;
      await convertHtmlToWebSquare(html, {
        llmClient: makeMock(pname),
        onStage: (n, p) => { if (n === 'preservation') report = p as { rate: number; lost: unknown[] }; },
      });
      expect(report).not.toBeNull();
      expect((report as unknown as { lost: unknown[] }).lost).toEqual([]);
      expect((report as unknown as { rate: number }).rate).toBe(1);
    }, 60000);
  }
});
