import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';

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
