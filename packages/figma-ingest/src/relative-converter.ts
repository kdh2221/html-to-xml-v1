/**
 * Stage 2 래퍼: legacy sample-converter.js를 호출하여 절대→상대 변환.
 * sample-converter는 IIFE 모듈이므로 @kdh/legacy-converter/adapter를 통해 로드한다.
 *
 * 중요 — legacy API:
 *   SampleConverter.convert(xml, options) → { convertedXml, meta, missingVisible, analysis }
 *   따라서 이 래퍼는 result.convertedXml을 풀어서 string으로 반환한다.
 *
 * 캐싱: legacy adapter는 같은 IIFE를 같은 프로세스에서 두 번 eval하면 const 재선언 에러가 난다.
 *      모듈 레벨에서 cachedConverter로 캐싱하여 한 번만 로드.
 */
// @ts-ignore — 어댑터는 JS 파일이며 타입 없음
import { loadSampleConverter } from '@kdh/legacy-converter/adapter';

let cachedConverter: any = null;

function getConverter(): any {
  if (!cachedConverter) {
    const { mod } = loadSampleConverter();
    cachedConverter = mod;
  }
  return cachedConverter;
}

export interface RelativeOptions {
  adaptive?: boolean;
}

export function convertAbsoluteToRelative(
  absoluteXml: string,
  options: RelativeOptions = {}
): string {
  const conv = getConverter();
  if (typeof conv.convert !== 'function') {
    throw new Error(
      `SampleConverter.convert 함수를 찾을 수 없음. ` +
      `실제 exports: ${Object.keys(conv).join(', ')}`
    );
  }
  const result = conv.convert(absoluteXml, options);

  // 실제 legacy API는 { convertedXml, meta, missingVisible, analysis } 형태의 객체 반환
  if (result && typeof result === 'object' && typeof result.convertedXml === 'string') {
    return result.convertedXml;
  }
  // (fallback: 일부 빌드에서 string 직접 반환할 가능성)
  if (typeof result === 'string') {
    return result;
  }
  throw new Error(
    `예상치 못한 convert() 반환 형태: ${typeof result}, keys=${result ? Object.keys(result).join(',') : 'null'}`
  );
}
