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
  }, 60000);

  it('master-detail: DataList만 생성 (DataMap 없음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).toContain('<w2:dataList id="dlt_memberBasic"');
  }, 60000);

  it('noLlm: true → Phase 0+1 동작 (DataCollection 비어있음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { noLlm: true });
    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).not.toContain('<w2:dataList');
  }, 60000);
});
