/**
 * 기존 변환 도구의 JS 모듈들은 IIFE로 정의되어 있어 (`const SampleConverter = (() => {...})()`)
 * Node에서 직접 require 불가하다. jsdom 컨텍스트에서 eval하여 노출한다.
 *
 * IIFE가 `const Name = (() => {...})()` 패턴이므로 const 선언은 window/globalThis에
 * 자동으로 붙지 않는다. 따라서 eval 직후 `globalThis.Name = Name` 한 줄을 덧붙여
 * 명시적으로 전역에 노출시킨다 (원본 regression-check.js와 동일한 패턴).
 *
 * ⚠️ 중요한 제약 — 호출자는 반드시 숙지할 것:
 *
 * 1) 전역 오염 (Global pollution):
 *    `makeWindow()`는 매 호출마다 Node `global.*` 을 덮어쓴다 —
 *    `window`, `document`, `DOMParser`, `XMLSerializer`, `Node`, `Element`.
 *    다른 코드가 동시에 이 globals를 사용 중이면 깨진다.
 *    → **동시 호출(concurrent use) 금지**. 단일 스레드, 순차 호출만 안전.
 *
 * 2) 1회성 eval (Single-eval re-entry limitation):
 *    원본 소스가 `const SampleConverter = (() => {...})()` 형태이므로
 *    같은 loader (예: `loadSampleConverter`) 를 한 프로세스에서 **두 번 호출하면**
 *    `eval` 시점에 `SyntaxError: Identifier 'SampleConverter' has already been declared`
 *    가 발생한다. const 재선언은 같은 스코프(globalThis eval)에서 불가.
 *    → 호출자는 결과를 **모듈 레벨에서 캐싱**하고 재사용해야 한다.
 *    예시 패턴: Task 11의 `relative-converter.ts` 의 `cachedConverter` 참고.
 *
 *      let cached = null;
 *      function getConverter() {
 *        if (!cached) cached = loadSampleConverter();
 *        return cached;
 *      }
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const JS_DIR = path.join(__dirname, 'js');

function makeWindow() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  // 변환기들이 사용하는 브라우저 API를 Node 전역에 주입
  global.window = dom.window;
  global.document = dom.window.document;
  global.DOMParser = dom.window.DOMParser;
  global.XMLSerializer = dom.window.XMLSerializer;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  return dom.window;
}

function loadSource(filename, globalName) {
  const source = fs.readFileSync(path.join(JS_DIR, filename), 'utf-8');
  // const Foo = (() => {...})() 패턴이므로 globalThis에 명시적으로 노출
  return source + `\nglobalThis.${globalName} = ${globalName};`;
}

function evalAndGet(sources, globalName) {
  const window = makeWindow();
  const code = sources.join('\n');
  // 현재 Node 컨텍스트에서 eval — global.* 가 변환기에서 보임
  eval.call(globalThis, code);
  const mod = globalThis[globalName];
  if (!mod) throw new Error(`Module ${globalName} not exposed after eval`);
  return { mod, window };
}

function loadXmlParser() {
  return evalAndGet([loadSource('xml-parser.js', 'XmlParser')], 'XmlParser');
}

function loadSampleConverter() {
  // sample-converter.js는 xml-parser.js에 의존
  return evalAndGet(
    [
      loadSource('xml-parser.js', 'XmlParser'),
      loadSource('sample-converter.js', 'SampleConverter')
    ],
    'SampleConverter'
  );
}

function loadHtmlConverter() {
  return evalAndGet([loadSource('html-converter.js', 'HtmlConverter')], 'HtmlConverter');
}

function loadXmlGenerator() {
  return evalAndGet([loadSource('xml-generator.js', 'XmlGenerator')], 'XmlGenerator');
}

function loadScriptValidator() {
  return evalAndGet([loadSource('script-validator.js', 'ScriptValidator')], 'ScriptValidator');
}

module.exports = {
  loadXmlParser,
  loadSampleConverter,
  loadHtmlConverter,
  loadXmlGenerator,
  loadScriptValidator
};
