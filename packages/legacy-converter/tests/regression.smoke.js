/**
 * Reference-pairs 회귀 smoke 테스트.
 * samples/reference-pairs/ 의 입력 XML을 sample-converter로 돌려서
 * crashes 없이 string output이 나오는지만 확인한다.
 * 출력 정확도 비교는 별도 골든 회귀(Phase 0의 다음 단계)에서.
 *
 * NOTE: SampleConverter.convert() 의 실제 반환 형태는
 *   { convertedXml, meta, missingVisible, analysis }
 * 이므로 string 체크는 result.convertedXml 에 대해 수행한다.
 */
const fs = require('fs');
const path = require('path');
const { loadSampleConverter } = require('../adapter');

const PAIRS_DIR = path.join(__dirname, '..', 'samples', 'reference-pairs');
const { mod: SampleConverter } = loadSampleConverter();

const xmlFiles = fs.readdirSync(PAIRS_DIR)
  .filter(f => f.endsWith('.xml') && !f.endsWith('_pub.xml'));

let pass = 0, fail = 0;
const failures = [];

for (const file of xmlFiles) {
  const xmlPath = path.join(PAIRS_DIR, file);
  const xml = fs.readFileSync(xmlPath, 'utf-8');
  try {
    const result = SampleConverter.convert(xml, { adaptive: false });
    const out = (result && typeof result === 'object') ? result.convertedXml : result;
    if (typeof out !== 'string' || out.length === 0) {
      throw new Error('Empty output');
    }
    pass++;
  } catch (e) {
    fail++;
    failures.push({ file, error: e.message });
  }
}

console.log(`PASS: ${pass}/${xmlFiles.length}`);
if (fail > 0) {
  console.log(`FAIL: ${fail}`);
  failures.forEach(f => console.log(`  - ${f.file}: ${f.error}`));
  process.exit(1);
}
