/**
 * 버튼 라벨 텍스트로 deepsquare UI-04-1 modifier를 자동 분류한다.
 *
 * 분류 표:
 *   조회 / 검색      → btn_cm sch
 *   저장 / 확인      → btn_cm pt
 *   행추가 / 추가    → btn_cm row_add
 *   엑셀 / 다운로드  → btn_cm download
 *   일반 / 취소 / 그 외 → btn_cm
 */

const PATTERNS: Array<[RegExp, string]> = [
  [/조회|검색|search|inquiry/i, 'btn_cm sch'],
  [/저장|확인|save|confirm|submit|등록/i, 'btn_cm pt'],
  [/행추가|추가|add\s*row|add$/i, 'btn_cm row_add'],
  [/엑셀|다운로드|download|export/i, 'btn_cm download'],
];

export function classifyButtonModifier(label: string): string {
  const trimmed = (label || '').trim();
  for (const [re, cls] of PATTERNS) {
    if (re.test(trimmed)) return cls;
  }
  return 'btn_cm';
}

/**
 * XML 문자열에서 xf:trigger 요소의 라벨을 읽어 class 속성을 자동 부여한다.
 * 기존 class는 덮어쓴다.
 */
export function applyButtonModifiersInXml(xml: string): string {
  // xf:trigger 블록 단위로 매칭
  // 라벨은 <xf:label><![CDATA[...]]></xf:label> 또는 텍스트로 들어있음
  return xml.replace(
    /<xf:trigger\b([^>]*?)>([\s\S]*?)<\/xf:trigger>/g,
    (_full, attrsStr: string, inner: string) => {
      // 라벨 추출: CDATA 우선, 없으면 텍스트
      const cdataMatch = inner.match(/<xf:label[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/xf:label>/);
      const textMatch = inner.match(/<xf:label[^>]*>\s*([^<]*?)\s*<\/xf:label>/);
      const label = cdataMatch ? cdataMatch[1] : (textMatch ? textMatch[1] : '');
      const modifier = classifyButtonModifier(label);

      // 기존 class 속성 제거 후 재부여
      let newAttrs = attrsStr.replace(/\s+class="[^"]*"/, '');
      newAttrs = `${newAttrs} class="${modifier}"`;
      return `<xf:trigger${newAttrs}>${inner}</xf:trigger>`;
    }
  );
}
