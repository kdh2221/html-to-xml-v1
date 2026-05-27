/**
 * 입력 HTML의 원본 CSS/JS를 참조용으로 보존.
 * - extractSourceCss/Script: 인라인 본문 + 외부 URL(주석) + 안내 헤더 (없으면 '').
 * - injectSourceReference: 출력 XML <head> 뒤에 사이드카 포인터 주석 삽입.
 * 자동 적용은 하지 않음(수동 포팅 참고용). 순수·non-throw.
 */

const CSS_HEADER =
  '/* 원본 HTML에서 추출한 CSS (참조용). WebSquare 출력에 자동 적용되지 않음 —\n' +
  '   변환 중 id/구조 변경으로 셀렉터가 맞지 않을 수 있음. 수동 포팅 참고. */';
const JS_HEADER =
  '/* 원본 HTML에서 추출한 JS (참조용). WebSquare 출력에 자동 적용되지 않음 —\n' +
  '   원본 div 기반 DOM 대상이라 WebSquare DOM에서 동작하지 않음. 수동 포팅 참고. */';

function collectLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[0].match(/\bhref=["']([^"']+)["']/i);
    if (href) out.push(href[1]);
  }
  return out;
}

export function extractSourceCss(html: string): string {
  const links = collectLinks(html);
  const styles: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = m[1].trim();
    if (body) styles.push(body);
  }
  if (links.length === 0 && styles.length === 0) return '';
  const parts = [CSS_HEADER];
  if (links.length) {
    parts.push('', '/* 외부 stylesheet (원본 link 참조) */');
    for (const l of links) parts.push(`/*   ${l} */`);
  }
  if (styles.length) parts.push('', ...styles);
  return parts.join('\n') + '\n';
}

export function extractSourceScript(html: string): string {
  const srcs: string[] = [];
  const inline: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (srcMatch) {
      srcs.push(srcMatch[1]);
    } else {
      const body = m[2].trim();
      if (body) inline.push(body);
    }
  }
  if (srcs.length === 0 && inline.length === 0) return '';
  const parts = [JS_HEADER];
  if (srcs.length) {
    parts.push('', '/* 외부 script (원본 src 참조) */');
    for (const s of srcs) parts.push(`/*   ${s} */`);
  }
  if (inline.length) parts.push('', ...inline);
  return parts.join('\n') + '\n';
}

export function injectSourceReference(xml: string, refs: { css?: string; js?: string }): string {
  const names = [refs.css, refs.js].filter(Boolean) as string[];
  if (names.length === 0) return xml;
  // 파일명에 '--'가 있으면 XML 주석이 깨지므로 치환(주석 안전 보장)
  const safe = names.join(' / ').replace(/--+/g, '-');
  const comment = `<!-- 원본 소스 참조(자동 적용 안 됨, 수동 포팅용): ${safe} -->`;
  return xml.replace(/(<head\b[^>]*>)/, (full) => `${full}\n${comment}`);
}
