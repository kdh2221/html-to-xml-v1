/**
 * Phase 3A — #2 await/async 불일치 자동수정 (순수·결정론).
 * scwin 핸들러 본문에 await가 있는데 async가 없으면 `function`→`async function` 삽입.
 * 이미 async인 핸들러는 정규식이 매칭 안 함(function 앞에 async가 있어 `\s*function` 직결 실패).
 * 핸들러는 `\n};` 종료 형식 가정 (scwin-scaffolder 출력).
 */
export function fixAsyncAwait(xml: string): string {
  return xml.replace(
    /(scwin\.\w+\s*=\s*)function(\b[^{]*\{[\s\S]*?\n\};)/g,
    (full, head: string, rest: string) => (/\bawait\b/.test(rest) ? `${head}async function${rest}` : full),
  );
}
