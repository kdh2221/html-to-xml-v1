import { describe, expect, it } from 'vitest';
import { extractSourceCss, extractSourceScript, injectSourceReference } from '../src/source-assets';

describe('extractSourceCss', () => {
  it('인라인 <style> 본문 + 안내 헤더', () => {
    const css = extractSourceCss('<html><head><style>.a{color:red}</style></head></html>');
    expect(css).toContain('.a{color:red}');
    expect(css).toContain('참조용');
  });
  it('다중 <style> 모두 + 외부 link URL 주석', () => {
    const css = extractSourceCss('<style>.a{}</style><link rel="stylesheet" href="x.css"><style>.b{}</style>');
    expect(css).toContain('.a{}');
    expect(css).toContain('.b{}');
    expect(css).toContain('x.css');
  });
  it('CSS 없으면 빈 문자열', () => {
    expect(extractSourceCss('<html><body><p>hi</p></body></html>')).toBe('');
  });
});

describe('extractSourceScript', () => {
  it('인라인 <script> 본문 + 헤더', () => {
    const js = extractSourceScript('<script>var a=1;</script>');
    expect(js).toContain('var a=1;');
    expect(js).toContain('참조용');
  });
  it('외부 src 있으면 URL 주석', () => {
    const js = extractSourceScript('<script src="lib.js"></script>');
    expect(js).toContain('lib.js');
  });
  it('script 없으면 빈 문자열', () => {
    expect(extractSourceScript('<html><body></body></html>')).toBe('');
  });
});

describe('injectSourceReference', () => {
  const xml = `<html>\n\t<head xmlns="x" meta_screenId="S">\n\t\t<w2:type>COMPONENT</w2:type>\n\t</head>\n\t<body></body>\n</html>`;
  it('css+js 둘 다 → 헤드 뒤 포인터 주석 (파일명 포함)', () => {
    const out = injectSourceReference(xml, { css: 'A.source.css', js: 'A.source.js' });
    expect(out).toMatch(/<head\b[^>]*>\s*<!-- 원본 소스 참조[^>]*A\.source\.css[^>]*A\.source\.js[^>]*-->/);
    expect(out).toContain('<w2:type>');
  });
  it('css만 → css만 주석', () => {
    const out = injectSourceReference(xml, { css: 'A.source.css' });
    expect(out).toContain('A.source.css');
    expect(out).not.toContain('.source.js');
  });
  it('refs 없으면 원본 그대로', () => {
    expect(injectSourceReference(xml, {})).toBe(xml);
  });
  it('<head> 없으면 원본 그대로', () => {
    expect(injectSourceReference('<html><body/></html>', { css: 'A.source.css' })).toBe('<html><body/></html>');
  });
});
