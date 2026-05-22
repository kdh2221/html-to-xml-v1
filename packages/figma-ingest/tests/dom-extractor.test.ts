import { describe, expect, it, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { extractFromHtml, closeBrowser, captureInputScreenshot } from '../src/dom-extractor';

const FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'simple-form.html'),
  'utf-8'
);

describe('extractFromHtml', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('simple-form.html에서 컴포넌트 추출', async () => {
    const result = await extractFromHtml(FIXTURE);
    expect(result.meta.screenName).toBe('사원 조회');
    expect(result.components.length).toBeGreaterThan(0);

    // 기대: input, select, button, table 발견
    const types = new Set(result.components.map(c => c.ctype));
    expect(types.has('Edit')).toBe(true);
    expect(types.has('SelectBox')).toBe(true);
    expect(types.has('Button')).toBe(true);
    expect(types.has('GridView')).toBe(true);
  }, 30000);

  it('실제 좌표가 0이 아닌 값으로 들어옴', async () => {
    const result = await extractFromHtml(FIXTURE);
    const editComp = result.components.find(c => c.ctype === 'Edit');
    expect(editComp).toBeDefined();
    expect(editComp!.left).toBeGreaterThanOrEqual(0);
    expect(editComp!.top).toBeGreaterThan(0);
    expect(editComp!.width).toBeGreaterThan(0);
  }, 30000);

  it('GridView에 columns 정보 포함', async () => {
    const result = await extractFromHtml(FIXTURE);
    const grid = result.components.find(c => c.ctype === 'GridView');
    expect(grid).toBeDefined();
    expect(grid!.columns).toBeDefined();
    expect(grid!.columns!.length).toBe(3);
    expect(grid!.columns![0].label).toBe('사번');
  }, 30000);

  it('quality score도 함께 반환', async () => {
    const result = await extractFromHtml(FIXTURE);
    expect(result.qualityScore.overall).toBeGreaterThan(0);
    expect(result.qualityScore.overall).toBeLessThanOrEqual(1);
  }, 30000);

  it('user-defined HTML id에 legacy prefix가 prepended됨', async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title></head>
      <body><input type="text" id="empCd"/><select id="deptCd"><option>X</option></select></body></html>`;
    const result = await extractFromHtml(html);
    const editComp = result.components.find(c => c.ctype === 'Edit');
    const selComp = result.components.find(c => c.ctype === 'SelectBox');
    expect(editComp?.id).toBe('edt_empCd');
    expect(selComp?.id).toBe('sel_deptCd');
  }, 30000);

  it('rawHtmlId 필드에 원본 HTML id 보존 (Phase 2 채널)', async () => {
    const html = `<!DOCTYPE html><html><head><title>T</title></head>
      <body><input type="text" id="empCd"/><select id="deptCd"><option>X</option></select></body></html>`;
    const result = await extractFromHtml(html);
    const editComp = result.components.find(c => c.ctype === 'Edit');
    const selComp = result.components.find(c => c.ctype === 'SelectBox');
    // rawHtmlId는 prefix 없이 원본 그대로
    expect(editComp?.rawHtmlId).toBe('empCd');
    expect(selComp?.rawHtmlId).toBe('deptCd');
    // 합성된 id는 별도
    expect(editComp?.id).toBe('edt_empCd');
    expect(selComp?.id).toBe('sel_deptCd');
  }, 30000);

  it('inlined classification stays in sync with element-map.ts', async () => {
    // Drift detector: classify simple HTML via dom-extractor (browser inlined logic)
    // and via element-map.ts (Node logic), compare results for core ctypes.
    const result = await extractFromHtml(FIXTURE);
    // dom-extractor must have produced Edit/SelectBox/Button/GridView
    const expectedCtypes = new Set(['Edit', 'SelectBox', 'Button', 'GridView']);
    const foundCtypes = new Set(result.components.map(c => c.ctype));
    for (const expected of expectedCtypes) {
      expect(foundCtypes.has(expected as any)).toBe(true);
    }
    // If element-map.ts adds a new ctype (e.g., 'DatePicker') without updating
    // dom-extractor's inlined map, this fixture-based test won't catch it directly,
    // but the bonus check below at least proves both modules have non-empty maps.
    const { classifyElement } = await import('../src/element-map');
    expect(classifyElement('input', { type: 'text' })).toBe('Edit');
    expect(classifyElement('select', {})).toBe('SelectBox');
    expect(classifyElement('button', {})).toBe('Button');
    expect(classifyElement('table', {})).toBe('GridView');
  }, 30000);
});

describe('captureInputScreenshot', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  it('입력 HTML 렌더 PNG Buffer 반환 (PNG 매직바이트)', async () => {
    const png = await captureInputScreenshot('<html><body><button>조회</button></body></html>');
    expect(png.length).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);  // PNG magic
    expect(png[1]).toBe(0x50);  // 'P'
  }, 60000);
});
