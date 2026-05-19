# Phase 0+1: Foundation Import + Figma Ingest (Deterministic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma → AI 추출 HTML을 입력으로 받아, 의미 ID 없이도 wpack 컴파일이 통과하는 WebSquare RELATIVE-coord XML을 결정론적 룰만으로 생성한다. 데이터 바인딩(DataMap/DataList/Submission) 추론은 Phase 2 플랜에서 처리.

**Architecture:** pnpm 모노레포 구조. 기존 변환 도구는 `packages/legacy-converter`로 그대로 import (zero-modification). 신규 `packages/figma-ingest`(TypeScript)가 Stage 0 + Stage 1 + Phase 1 결정론 룰(ID 리네임·버튼 modifier)을 담당하고, legacy-converter의 sample-converter.js에 ABSOLUTE XML을 넘긴다. 최종 CLI는 `figma-to-ws <input.html> <output.xml>`.

**Tech Stack:** pnpm workspaces, TypeScript 5, Node.js 20+, Vitest, Puppeteer (좌표 추출), cheerio (테스트용 DOM 조작), 기존 변환 도구의 JS 모듈 그대로 사용.

**Spec reference:** [`docs/superpowers/specs/2026-05-13-html-to-websquare-design.md`](../specs/2026-05-13-html-to-websquare-design.md)

---

## File Structure (이 플랜에서 생성·수정되는 파일 전체)

```
kdh-proj-0513-1/
├── package.json                              # 루트 (신규)
├── pnpm-workspace.yaml                       # 신규
├── tsconfig.base.json                        # 신규
├── .gitignore                                # 신규
├── README.md                                 # 신규
├── packages/
│   ├── legacy-converter/                     # 신규 (기존 도구 복사)
│   │   ├── js/                               # 기존 도구의 js/ 전체 복사
│   │   ├── samples/                          # 기존 reference-pairs 전체 복사
│   │   ├── tools/                            # 기존 tools/ 복사
│   │   ├── package.json                      # 기존 그대로
│   │   └── adapter.js                        # 신규: Node에서 IIFE 모듈 로드 헬퍼
│   └── figma-ingest/                         # 신규
│       ├── src/
│       │   ├── types.ts                      # ComponentSpec 등 타입
│       │   ├── dom-extractor.ts              # html-converter.js의 TS+Puppeteer 포팅
│       │   ├── element-map.ts                # ELEMENT_MAP + ARIA/role/class 휴리스틱
│       │   ├── quality-score.ts              # HTML 품질 점수 (semantic/label/aria)
│       │   ├── id-renamer.ts                 # legacy prefix → UI-01 prefix 매핑
│       │   ├── button-modifier.ts            # 라벨 → btn_cm modifier (UI-04-1)
│       │   ├── absolute-xml-builder.ts       # xml-generator.js의 TS 포팅
│       │   ├── relative-converter.ts         # legacy sample-converter.js 호출 래퍼
│       │   ├── pipeline.ts                   # Stage 0→1→2 오케스트레이터
│       │   └── cli.ts                        # CLI 엔트리
│       ├── tests/
│       │   ├── fixtures/
│       │   │   ├── simple-form.html
│       │   │   ├── search-grid.html
│       │   │   └── master-detail.html
│       │   ├── element-map.test.ts
│       │   ├── id-renamer.test.ts
│       │   ├── button-modifier.test.ts
│       │   ├── quality-score.test.ts
│       │   ├── dom-extractor.test.ts
│       │   └── pipeline.e2e.test.ts
│       ├── package.json
│       └── tsconfig.json
```

---

### Task 1: 모노레포 초기화

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: 루트 package.json 작성**

Create `package.json`:

```json
{
  "name": "kdh-figma-to-websquare",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: pnpm-workspace.yaml 작성**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: tsconfig.base.json 작성**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: .gitignore 작성**

Create `.gitignore`:

```
node_modules/
dist/
*.log
.DS_Store
coverage/
.turbo/
```

- [ ] **Step 5: README.md 작성**

Create `README.md`:

```markdown
# Figma → WebSquare XML 변환 파이프라인

Figma → AI 추출 HTML을 WebSquare XML로 변환하는 사내 도구.

## 설치
\`\`\`
pnpm install
\`\`\`

## 사용
\`\`\`
pnpm --filter figma-ingest cli convert input.html output.xml
\`\`\`

## 설계
\`docs/superpowers/specs/2026-05-13-html-to-websquare-design.md\`
```

- [ ] **Step 6: pnpm 설치 검증**

Run: `pnpm install`
Expected: `node_modules/` 생성, `Done in <Ns>` 출력. 워크스페이스 패키지는 아직 없어서 워닝 가능 — 무시.

- [ ] **Step 7: 커밋 (사용자가 git init 후)**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore README.md
git commit -m "feat: initialize pnpm monorepo for figma-to-websquare"
```

(git이 아직 init 안 되어있으면 사용자가 init 후 진행. 현재 환경은 non-git이므로 이 step은 사용자 작업.)

---

### Task 2: 기존 변환 도구를 packages/legacy-converter로 import

**Files:**
- Create: `packages/legacy-converter/` (전체 디렉터리)
- Create: `packages/legacy-converter/package.json`
- Create: `packages/legacy-converter/adapter.js`

- [ ] **Step 1: 기존 도구 디렉터리 복사**

기존 도구 위치: `C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/`

복사 대상 (Bash 명령):

```bash
mkdir -p packages/legacy-converter
cp -r /c/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/js packages/legacy-converter/
cp -r /c/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/samples packages/legacy-converter/
cp -r /c/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/tools packages/legacy-converter/
cp /c/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/CLAUDE.md packages/legacy-converter/
cp /c/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/readme.md packages/legacy-converter/
```

- [ ] **Step 2: packages/legacy-converter/package.json 작성**

Create `packages/legacy-converter/package.json`:

```json
{
  "name": "@kdh/legacy-converter",
  "version": "0.1.0",
  "private": true,
  "main": "adapter.js",
  "scripts": {
    "regression": "cd tools && node regression-check.js"
  },
  "dependencies": {
    "jsdom": "^24.0.0"
  }
}
```

(jsdom은 IIFE 모듈을 Node에서 eval하기 위한 의존성 — 기존 도구의 `regression-check.js`가 사용)

- [ ] **Step 3: adapter.js 작성 — IIFE 모듈을 Node에서 사용 가능하게**

Create `packages/legacy-converter/adapter.js`:

```javascript
/**
 * 기존 변환 도구의 JS 모듈들은 IIFE로 정의되어 있어 (`const SampleConverter = (() => {...})()`)
 * Node에서 직접 require 불가하다. jsdom 컨텍스트에서 eval하여 노출한다.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const JS_DIR = path.join(__dirname, 'js');

function loadModule(filename, globalName) {
  const source = fs.readFileSync(path.join(JS_DIR, filename), 'utf-8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only'
  });
  dom.window.eval(source);
  const mod = dom.window[globalName];
  if (!mod) throw new Error(`Module ${globalName} not exported by ${filename}`);
  return { mod, window: dom.window };
}

function loadXmlParser() {
  return loadModule('xml-parser.js', 'XmlParser');
}

function loadSampleConverter() {
  // sample-converter.js는 xml-parser.js에 의존
  const source = [
    fs.readFileSync(path.join(JS_DIR, 'xml-parser.js'), 'utf-8'),
    fs.readFileSync(path.join(JS_DIR, 'sample-converter.js'), 'utf-8')
  ].join('\n');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only'
  });
  dom.window.eval(source);
  return { mod: dom.window.SampleConverter, window: dom.window };
}

function loadHtmlConverter() {
  return loadModule('html-converter.js', 'HtmlConverter');
}

function loadXmlGenerator() {
  return loadModule('xml-generator.js', 'XmlGenerator');
}

function loadScriptValidator() {
  return loadModule('script-validator.js', 'ScriptValidator');
}

module.exports = {
  loadXmlParser,
  loadSampleConverter,
  loadHtmlConverter,
  loadXmlGenerator,
  loadScriptValidator
};
```

- [ ] **Step 4: 의존성 설치**

Run: `pnpm install`
Expected: `jsdom` 설치 완료.

- [ ] **Step 5: 어댑터 로드 smoke 테스트**

Create `packages/legacy-converter/smoke.js`:

```javascript
const { loadSampleConverter } = require('./adapter');
const { mod: SampleConverter } = loadSampleConverter();
console.log('SampleConverter loaded:', typeof SampleConverter);
console.log('TAG_RENAME_MAP:', SampleConverter.TAG_RENAME_MAP || 'undefined');
console.log('exports:', Object.keys(SampleConverter));
```

Run: `node packages/legacy-converter/smoke.js`
Expected output:
```
SampleConverter loaded: object
TAG_RENAME_MAP: {}
exports: [ 'convert', 'TAG_RENAME_MAP', ... ]
```

(정확한 export 키는 sample-converter.js의 return 절에 따라 다름. `convert` 또는 유사한 함수가 보이면 OK)

- [ ] **Step 6: smoke 파일 정리**

Run: `rm packages/legacy-converter/smoke.js`

- [ ] **Step 7: 커밋**

```bash
git add packages/legacy-converter/
git commit -m "feat: import legacy converter as monorepo package"
```

---

### Task 3: Legacy 회귀 테스트 통과 검증

**Files:**
- Modify: `packages/legacy-converter/tools/regression-check.js` (경로 조정만)
- Create: `packages/legacy-converter/tests/regression.smoke.js`

- [ ] **Step 1: 기존 regression-check.js의 하드코딩 경로 조사**

Read `packages/legacy-converter/tools/regression-check.js` (전체)

확인 사항: 하드코딩된 경로 `D:/AI_KB/KB_ABS_REL_test/...` 가 있는지. 있으면 회귀 테스트가 *외부 테스트 데이터*에 의존하므로 우리 환경에서 그대로 못 돌림.

- [ ] **Step 2: 자체 회귀 smoke (reference-pairs 기반)**

Create `packages/legacy-converter/tests/regression.smoke.js`:

```javascript
/**
 * Reference-pairs 회귀 smoke 테스트.
 * samples/reference-pairs/ 의 입력 XML을 sample-converter로 돌려서
 * crashes 없이 string output이 나오는지만 확인한다.
 * 출력 정확도 비교는 별도 골든 회귀(Phase 0의 다음 단계)에서.
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
    if (typeof result !== 'string' || result.length === 0) {
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
```

- [ ] **Step 3: smoke 실행**

Run: `node packages/legacy-converter/tests/regression.smoke.js`
Expected output: `PASS: 42/42` (또는 reference-pairs의 실제 입력 XML 수)

만약 `SampleConverter.convert is not a function` 에러가 나면, 실제 export 함수명을 확인 (예: `SampleConverter.convertXml`, `SampleConverter.toRelative` 등)하고 smoke 코드의 호출명을 그것에 맞춰 수정.

- [ ] **Step 4: 회귀 스크립트를 package.json scripts에 등록**

Modify `packages/legacy-converter/package.json` — `scripts`에 추가:

```json
{
  "scripts": {
    "regression": "node tests/regression.smoke.js"
  }
}
```

- [ ] **Step 5: pnpm 명령 검증**

Run: `pnpm --filter @kdh/legacy-converter regression`
Expected: 위 PASS 출력 동일.

- [ ] **Step 6: 커밋**

```bash
git add packages/legacy-converter/tests/regression.smoke.js packages/legacy-converter/package.json
git commit -m "test: add reference-pairs smoke regression"
```

---

### Task 4: figma-ingest 패키지 초기화

**Files:**
- Create: `packages/figma-ingest/package.json`
- Create: `packages/figma-ingest/tsconfig.json`
- Create: `packages/figma-ingest/src/types.ts`

- [ ] **Step 1: package.json 작성**

Create `packages/figma-ingest/package.json`:

```json
{
  "name": "@kdh/figma-ingest",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "cli": "node dist/cli.js"
  },
  "dependencies": {
    "@kdh/legacy-converter": "workspace:*",
    "cheerio": "^1.0.0",
    "puppeteer": "^22.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: tsconfig.json 작성**

Create `packages/figma-ingest/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "tests", "node_modules"]
}
```

- [ ] **Step 3: types.ts 작성 — 핵심 타입 정의**

Create `packages/figma-ingest/src/types.ts`:

```typescript
/**
 * WebSquare 변환 파이프라인의 핵심 타입 정의.
 */

export type LegacyCtype =
  | 'Text' | 'Desc' | 'Edit' | 'Calendar' | 'SelectBox'
  | 'CheckBox' | 'Radio' | 'TextArea' | 'Button' | 'Trigger'
  | 'GridView' | 'Group' | 'GroupBox' | 'Image' | 'Tab';

export interface ComponentSpec {
  id: string;
  ctype: LegacyCtype;
  label: string;
  left: number;
  top: number;
  width: number | null;
  height: number | null;
  maxlength?: string;
  columns?: TableColumn[];
  hintRole?: HintRole;
}

export interface TableColumn {
  id: string;
  label: string;
  width: number;
}

export type HintRole =
  | 'schbox' | 'gvwbox' | 'titbox' | 'btnbox' | 'tblbox'
  | 'tabContainer' | 'accordion' | 'unknown';

export interface ScreenMeta {
  screenId: string;
  screenName: string;
  width: number;
  height: number;
}

export interface ExtractionResult {
  meta: ScreenMeta;
  components: ComponentSpec[];
  qualityScore: QualityScore;
}

export interface QualityScore {
  overall: number;
  semanticRatio: number;
  labelIdRatio: number;
  ariaRatio: number;
}
```

- [ ] **Step 4: pnpm install (figma-ingest 의존성)**

Run: `pnpm install`
Expected: Puppeteer 다운로드 (~170MB Chrome 번들), cheerio, vitest 설치.

(Puppeteer는 첫 설치 시 Chrome 다운로드로 시간 걸림. 환경에 따라 5~10분.)

- [ ] **Step 5: 빌드 smoke**

Run: `pnpm --filter @kdh/figma-ingest build`
Expected: `dist/types.js`, `dist/types.d.ts` 생성. 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add packages/figma-ingest/package.json packages/figma-ingest/tsconfig.json packages/figma-ingest/src/types.ts
git commit -m "feat: scaffold figma-ingest package with core types"
```

---

### Task 5: ELEMENT_MAP + ARIA/role/class 휴리스틱

**Files:**
- Create: `packages/figma-ingest/src/element-map.ts`
- Create: `packages/figma-ingest/tests/element-map.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/figma-ingest/tests/element-map.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { classifyElement, classifyHintRole } from '../src/element-map';

describe('classifyElement', () => {
  it('input[type=text] → Edit', () => {
    expect(classifyElement('input', { type: 'text' })).toBe('Edit');
  });

  it('input[type=date] → Calendar', () => {
    expect(classifyElement('input', { type: 'date' })).toBe('Calendar');
  });

  it('input[type=checkbox] → CheckBox', () => {
    expect(classifyElement('input', { type: 'checkbox' })).toBe('CheckBox');
  });

  it('select → SelectBox', () => {
    expect(classifyElement('select', {})).toBe('SelectBox');
  });

  it('button → Button', () => {
    expect(classifyElement('button', {})).toBe('Button');
  });

  it('table → GridView', () => {
    expect(classifyElement('table', {})).toBe('GridView');
  });

  it('div with role="combobox" → SelectBox', () => {
    expect(classifyElement('div', { role: 'combobox' })).toBe('SelectBox');
  });

  it('div with role="grid" → GridView', () => {
    expect(classifyElement('div', { role: 'grid' })).toBe('GridView');
  });

  it('div with role="searchbox" → Edit', () => {
    expect(classifyElement('div', { role: 'searchbox' })).toBe('Edit');
  });

  it('div without role → null (skip, walk children)', () => {
    expect(classifyElement('div', {})).toBeNull();
  });
});

describe('classifyHintRole', () => {
  it('class contains "search" → schbox', () => {
    expect(classifyHintRole({ class: 'search-area' })).toBe('schbox');
  });

  it('class contains "grid" → gvwbox', () => {
    expect(classifyHintRole({ class: 'data-grid' })).toBe('gvwbox');
  });

  it('class contains "tab" → tabContainer', () => {
    expect(classifyHintRole({ class: 'tab-panel' })).toBe('tabContainer');
  });

  it('aria-label "조회 영역" → schbox', () => {
    expect(classifyHintRole({ 'aria-label': '조회 영역' })).toBe('schbox');
  });

  it('아무 힌트 없음 → unknown', () => {
    expect(classifyHintRole({ class: 'foo-bar-baz' })).toBe('unknown');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test`
Expected: 모든 테스트 FAIL (`Cannot find module '../src/element-map'`)

- [ ] **Step 3: element-map.ts 구현**

Create `packages/figma-ingest/src/element-map.ts`:

```typescript
import type { LegacyCtype, HintRole } from './types';

const TAG_MAP: Record<string, LegacyCtype | null> = {
  input: 'Edit',           // input[type] 분기로 재결정됨
  select: 'SelectBox',
  textarea: 'TextArea',
  button: 'Button',
  table: 'GridView',
  label: 'Text',
  span: 'Desc',
  h1: 'Text', h2: 'Text', h3: 'Text', h4: 'Text', h5: 'Text', h6: 'Text',
  p: 'Desc',
  img: 'Image',
  a: 'Button',
  fieldset: 'GroupBox',
  // div/section/form/nav/header/footer는 null 반환 (자식 walk)
};

const INPUT_TYPE_MAP: Record<string, LegacyCtype> = {
  text: 'Edit', password: 'Edit', number: 'Edit', email: 'Edit',
  tel: 'Edit', search: 'Edit',
  date: 'Calendar', 'datetime-local': 'Calendar',
  checkbox: 'CheckBox',
  radio: 'Radio',
  button: 'Button', submit: 'Button', reset: 'Button',
};

const ROLE_MAP: Record<string, LegacyCtype> = {
  combobox: 'SelectBox',
  listbox: 'SelectBox',
  searchbox: 'Edit',
  textbox: 'Edit',
  spinbutton: 'Edit',
  checkbox: 'CheckBox',
  radio: 'Radio',
  button: 'Button',
  link: 'Button',
  grid: 'GridView',
  table: 'GridView',
  tab: 'Tab',
  tabpanel: 'Group',
  img: 'Image',
};

export function classifyElement(
  tag: string,
  attrs: Record<string, string | undefined>
): LegacyCtype | null {
  const lowerTag = tag.toLowerCase();

  if (lowerTag === 'input') {
    const type = (attrs.type || 'text').toLowerCase();
    return INPUT_TYPE_MAP[type] ?? 'Edit';
  }

  if (attrs.role && ROLE_MAP[attrs.role.toLowerCase()]) {
    return ROLE_MAP[attrs.role.toLowerCase()];
  }

  return TAG_MAP[lowerTag] ?? null;
}

const HINT_CLASS_PATTERNS: Array<[RegExp, HintRole]> = [
  [/search|조회|검색/i, 'schbox'],
  [/grid|table-list|data-list/i, 'gvwbox'],
  [/title|header|tit_/i, 'titbox'],
  [/btn-area|button-area|footer-action/i, 'btnbox'],
  [/tab/i, 'tabContainer'],
  [/accordion|collapse/i, 'accordion'],
  [/form-table|input-table/i, 'tblbox'],
];

const HINT_ARIA_PATTERNS: Array<[RegExp, HintRole]> = [
  [/조회|검색|search/i, 'schbox'],
  [/그리드|grid|list/i, 'gvwbox'],
  [/탭|tab/i, 'tabContainer'],
];

export function classifyHintRole(
  attrs: Record<string, string | undefined>
): HintRole {
  const cls = attrs.class || '';
  for (const [re, role] of HINT_CLASS_PATTERNS) {
    if (re.test(cls)) return role;
  }
  const aria = attrs['aria-label'] || '';
  for (const [re, role] of HINT_ARIA_PATTERNS) {
    if (re.test(aria)) return role;
  }
  return 'unknown';
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test`
Expected: 모든 `classifyElement` + `classifyHintRole` 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/element-map.ts packages/figma-ingest/tests/element-map.test.ts
git commit -m "feat(figma-ingest): element classifier + hint role detector"
```

---

### Task 6: HTML 품질 점수 산출

**Files:**
- Create: `packages/figma-ingest/src/quality-score.ts`
- Create: `packages/figma-ingest/tests/quality-score.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/figma-ingest/tests/quality-score.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeQualityScore } from '../src/quality-score';

describe('computeQualityScore', () => {
  it('완전 시맨틱 HTML → 높은 점수', () => {
    const html = `
      <form>
        <label for="empCd">사번</label>
        <input type="text" id="empCd" aria-required="true" />
        <label for="deptCd">부서</label>
        <select id="deptCd" aria-label="부서 선택"><option>전체</option></select>
        <button type="button" aria-label="조회">조회</button>
        <table aria-label="결과 목록">
          <thead><tr><th>사번</th></tr></thead>
          <tbody><tr><td>EMP001</td></tr></tbody>
        </table>
      </form>
    `;
    const score = computeQualityScore(html);
    expect(score.overall).toBeGreaterThan(0.7);
    expect(score.semanticRatio).toBeGreaterThan(0.5);
    expect(score.labelIdRatio).toBe(1);
    expect(score.ariaRatio).toBeGreaterThan(0.5);
  });

  it('div 범벅 (Figma 노이즈) → 낮은 점수', () => {
    const html = `
      <div class="figma-node-1">
        <div class="figma-node-2">사번</div>
        <div class="figma-node-3">
          <div class="figma-node-4"></div>
        </div>
        <div class="figma-node-5">조회</div>
      </div>
    `;
    const score = computeQualityScore(html);
    expect(score.overall).toBeLessThan(0.3);
    expect(score.semanticRatio).toBeLessThan(0.2);
  });

  it('빈 HTML → overall = 0', () => {
    const score = computeQualityScore('<div></div>');
    expect(score.overall).toBe(0);
  });

  it('label 없는 input → labelIdRatio = 0', () => {
    const html = `<input type="text" id="x"/><input type="text" id="y"/>`;
    const score = computeQualityScore(html);
    expect(score.labelIdRatio).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test quality-score`
Expected: FAIL (`Cannot find module '../src/quality-score'`)

- [ ] **Step 3: quality-score.ts 구현**

Create `packages/figma-ingest/src/quality-score.ts`:

```typescript
import * as cheerio from 'cheerio';
import type { QualityScore } from './types';

const SEMANTIC_TAGS = new Set([
  'input', 'select', 'button', 'textarea', 'table', 'form',
  'fieldset', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'nav',
  'header', 'footer', 'main', 'section', 'article', 'aside',
]);

const INTERACTIVE_TAGS = new Set([
  'input', 'select', 'button', 'textarea', 'a',
]);

export function computeQualityScore(html: string): QualityScore {
  const $ = cheerio.load(html);
  const allElements = $('body *').toArray();
  const totalCount = allElements.length;

  if (totalCount === 0) {
    return { overall: 0, semanticRatio: 0, labelIdRatio: 0, ariaRatio: 0 };
  }

  let semanticCount = 0;
  let interactiveCount = 0;
  let ariaUsedCount = 0;

  for (const el of allElements) {
    const tag = (el as any).tagName?.toLowerCase();
    if (!tag) continue;
    if (SEMANTIC_TAGS.has(tag)) semanticCount++;
    if (INTERACTIVE_TAGS.has(tag)) interactiveCount++;
    const attrs = (el as any).attribs || {};
    const hasAria = Object.keys(attrs).some(a => a.startsWith('aria-') || a === 'role');
    if (hasAria) ariaUsedCount++;
  }

  const semanticRatio = semanticCount / totalCount;

  // label-id 페어링: input/select/textarea 마다 연관 label 존재 여부
  let inputCount = 0, labeledCount = 0;
  $('input, select, textarea').each((_, el) => {
    inputCount++;
    const id = $(el).attr('id');
    if (id && $(`label[for="${id}"]`).length > 0) {
      labeledCount++;
    } else if ($(el).attr('aria-label') || $(el).attr('aria-labelledby')) {
      labeledCount++;
    }
  });
  const labelIdRatio = inputCount === 0 ? 0 : labeledCount / inputCount;

  // ARIA 사용률: 인터랙티브 요소 대비 ARIA 속성/role 사용
  const ariaRatio = interactiveCount === 0 ? 0 : ariaUsedCount / Math.max(interactiveCount, 1);

  const overall = (semanticRatio + labelIdRatio + Math.min(ariaRatio, 1)) / 3;

  return {
    overall: Math.min(1, overall),
    semanticRatio,
    labelIdRatio,
    ariaRatio: Math.min(1, ariaRatio),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test quality-score`
Expected: 4개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/quality-score.ts packages/figma-ingest/tests/quality-score.test.ts
git commit -m "feat(figma-ingest): HTML quality score (semantic/label/aria)"
```

---

### Task 7: ID 리네이머 (legacy prefix → UI-01 prefix)

**Files:**
- Create: `packages/figma-ingest/src/id-renamer.ts`
- Create: `packages/figma-ingest/tests/id-renamer.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/figma-ingest/tests/id-renamer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { renameIdToUi01, mapPrefix, LEGACY_TO_UI01_PREFIX } from '../src/id-renamer';

describe('mapPrefix', () => {
  it('txt_001 → tbx_001', () => {
    expect(mapPrefix('txt_001')).toBe('tbx_001');
  });

  it('edt_001 → ibx_001', () => {
    expect(mapPrefix('edt_001')).toBe('ibx_001');
  });

  it('sel_002 → sbx_002', () => {
    expect(mapPrefix('sel_002')).toBe('sbx_002');
  });

  it('chk_003 → cbx_003', () => {
    expect(mapPrefix('chk_003')).toBe('cbx_003');
  });

  it('rdo_004 → rad_004', () => {
    expect(mapPrefix('rdo_004')).toBe('rad_004');
  });

  it('cal_005 → ica_005', () => {
    expect(mapPrefix('cal_005')).toBe('ica_005');
  });

  it('tab_006 → tac_006', () => {
    expect(mapPrefix('tab_006')).toBe('tac_006');
  });

  it('btn_007 → btn_007 (변경 없음)', () => {
    expect(mapPrefix('btn_007')).toBe('btn_007');
  });

  it('grd_008 → grd_008 (변경 없음)', () => {
    expect(mapPrefix('grd_008')).toBe('grd_008');
  });

  it('알 수 없는 prefix → 원본 유지', () => {
    expect(mapPrefix('foo_001')).toBe('foo_001');
  });

  it('prefix 없는 ID → 원본 유지', () => {
    expect(mapPrefix('empCd')).toBe('empCd');
  });
});

describe('renameIdToUi01', () => {
  it('XML 문자열의 모든 id 속성을 일괄 변환', () => {
    const xml = `<root>
      <input id="edt_001"/>
      <select id="sel_002"/>
      <button id="btn_003">조회</button>
    </root>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('id="ibx_001"');
    expect(out).toContain('id="sbx_002"');
    expect(out).toContain('id="btn_003"');
    expect(out).not.toContain('id="edt_001"');
  });

  it('id 속성 외의 동일 문자열은 변경하지 않음', () => {
    // 안전 — id= 속성만 매칭
    const xml = `<root><span>edt_001 is a label</span><input id="edt_001"/></root>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('>edt_001 is a label<');
    expect(out).toContain('id="ibx_001"');
  });

  it('ref="data:..." 안의 ID 참조도 변환', () => {
    const xml = `<input id="edt_001" ref="data:dma_search.X"/>
                 <span>ref points to ibx_001</span>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('id="ibx_001"');
    // ref 안의 IDs는 별도 처리 — Phase 1에서는 id만 변경
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test id-renamer`
Expected: FAIL

- [ ] **Step 3: id-renamer.ts 구현**

Create `packages/figma-ingest/src/id-renamer.ts`:

```typescript
/**
 * Legacy 변환 도구는 ID prefix로 txt_/edt_/sel_/chk_/rdo_/cal_/tab_ 등을 사용한다.
 * deepsquare CodeRules UI-01은 tbx_/ibx_/sbx_/cbx_/rad_/ica_/tac_ 등을 요구한다.
 * 이 모듈은 ID prefix만 변환한다 (의미 명명은 Phase 2 Semantic Enricher에서).
 */

export const LEGACY_TO_UI01_PREFIX: Record<string, string> = {
  txt_: 'tbx_',  // 텍스트박스
  edt_: 'ibx_',  // input
  sel_: 'sbx_',  // select1 (minimal)
  chk_: 'cbx_',  // checkbox
  rdo_: 'rad_',  // radio
  cal_: 'ica_',  // inputCalendar
  tab_: 'tac_',  // tabControl
  txa_: 'txa_',  // textarea (동일)
  btn_: 'btn_',  // trigger (동일)
  grd_: 'grd_',  // gridView (동일)
  grp_: 'grp_',  // group (동일)
  img_: 'img_',  // image (동일)
  pfm_: 'pfm_',  // pageFrame (동일)
};

export function mapPrefix(id: string): string {
  for (const [legacy, ui01] of Object.entries(LEGACY_TO_UI01_PREFIX)) {
    if (id.startsWith(legacy)) {
      return ui01 + id.slice(legacy.length);
    }
  }
  return id;
}

/**
 * XML 문자열에서 id="..." 속성값만 안전하게 변환한다.
 * 텍스트 컨텐츠나 다른 속성은 건드리지 않는다.
 */
export function renameIdToUi01(xml: string): string {
  return xml.replace(/\bid="([^"]+)"/g, (match, idValue) => {
    return `id="${mapPrefix(idValue)}"`;
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test id-renamer`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/id-renamer.ts packages/figma-ingest/tests/id-renamer.test.ts
git commit -m "feat(figma-ingest): ID prefix renamer (legacy → UI-01)"
```

---

### Task 8: 버튼 modifier 분류기

**Files:**
- Create: `packages/figma-ingest/src/button-modifier.ts`
- Create: `packages/figma-ingest/tests/button-modifier.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/figma-ingest/tests/button-modifier.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { classifyButtonModifier, applyButtonModifiersInXml } from '../src/button-modifier';

describe('classifyButtonModifier', () => {
  it('조회 → btn_cm sch', () => {
    expect(classifyButtonModifier('조회')).toBe('btn_cm sch');
  });

  it('검색 → btn_cm sch', () => {
    expect(classifyButtonModifier('검색')).toBe('btn_cm sch');
  });

  it('저장 → btn_cm pt', () => {
    expect(classifyButtonModifier('저장')).toBe('btn_cm pt');
  });

  it('확인 → btn_cm pt', () => {
    expect(classifyButtonModifier('확인')).toBe('btn_cm pt');
  });

  it('행추가 → btn_cm row_add', () => {
    expect(classifyButtonModifier('행추가')).toBe('btn_cm row_add');
  });

  it('추가 → btn_cm row_add', () => {
    expect(classifyButtonModifier('추가')).toBe('btn_cm row_add');
  });

  it('엑셀 다운로드 → btn_cm download', () => {
    expect(classifyButtonModifier('엑셀 다운로드')).toBe('btn_cm download');
  });

  it('취소 → btn_cm', () => {
    expect(classifyButtonModifier('취소')).toBe('btn_cm');
  });

  it('일반/알 수 없는 라벨 → btn_cm', () => {
    expect(classifyButtonModifier('뭔가')).toBe('btn_cm');
  });

  it('빈 라벨 → btn_cm', () => {
    expect(classifyButtonModifier('')).toBe('btn_cm');
  });

  it('대소문자 무시', () => {
    expect(classifyButtonModifier('SAVE')).toBe('btn_cm pt');
    expect(classifyButtonModifier('Search')).toBe('btn_cm sch');
  });
});

describe('applyButtonModifiersInXml', () => {
  it('xf:trigger 라벨에 따라 class 자동 부여', () => {
    const xml = `
      <xf:trigger id="btn_001">
        <xf:label><![CDATA[조회]]></xf:label>
      </xf:trigger>
      <xf:trigger id="btn_002">
        <xf:label><![CDATA[저장]]></xf:label>
      </xf:trigger>
    `;
    const out = applyButtonModifiersInXml(xml);
    expect(out).toContain('id="btn_001" class="btn_cm sch"');
    expect(out).toContain('id="btn_002" class="btn_cm pt"');
  });

  it('이미 class가 있으면 덮어쓰기', () => {
    const xml = `<xf:trigger id="btn_001" class="old_class">
      <xf:label><![CDATA[조회]]></xf:label>
    </xf:trigger>`;
    const out = applyButtonModifiersInXml(xml);
    expect(out).toContain('class="btn_cm sch"');
    expect(out).not.toContain('old_class');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test button-modifier`
Expected: FAIL

- [ ] **Step 3: button-modifier.ts 구현**

Create `packages/figma-ingest/src/button-modifier.ts`:

```typescript
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
    (full, attrsStr, inner) => {
      // 라벨 추출: CDATA 우선, 없으면 텍스트
      const cdataMatch = inner.match(/<xf:label[^>]*>\s*<!\[CDATA\[([^\]]*?)\]\]>\s*<\/xf:label>/);
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test button-modifier`
Expected: 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/button-modifier.ts packages/figma-ingest/tests/button-modifier.test.ts
git commit -m "feat(figma-ingest): button modifier classifier (UI-04-1)"
```

---

### Task 9: Puppeteer 기반 DOM extractor

**Files:**
- Create: `packages/figma-ingest/src/dom-extractor.ts`
- Create: `packages/figma-ingest/tests/dom-extractor.test.ts`
- Create: `packages/figma-ingest/tests/fixtures/simple-form.html`

- [ ] **Step 1: 픽스처 HTML 생성**

Create `packages/figma-ingest/tests/fixtures/simple-form.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>사원 조회</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .search-area { display: flex; gap: 10px; margin-bottom: 16px; }
    label { font-weight: 600; }
    input, select { padding: 4px 8px; border: 1px solid #999; }
    button { padding: 6px 16px; background: #4a7dff; color: #fff; border: none; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 8px; }
    th { background: #f0f4ff; }
  </style>
</head>
<body>
  <h2>사원 조회</h2>
  <div class="search-area">
    <label for="empCd">사번</label>
    <input type="text" id="empCd" placeholder="사번 입력" />
    <label for="deptCd">부서</label>
    <select id="deptCd"><option>전체</option><option>개발부</option></select>
    <button type="button">조회</button>
  </div>
  <table>
    <thead><tr><th>사번</th><th>성명</th><th>부서명</th></tr></thead>
    <tbody><tr><td></td><td></td><td></td></tr></tbody>
  </table>
</body>
</html>
```

- [ ] **Step 2: 실패하는 테스트 작성**

Create `packages/figma-ingest/tests/dom-extractor.test.ts`:

```typescript
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { extractFromHtml, closeBrowser } from '../src/dom-extractor';

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
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test dom-extractor`
Expected: FAIL (`Cannot find module '../src/dom-extractor'`)

- [ ] **Step 4: dom-extractor.ts 구현**

Create `packages/figma-ingest/src/dom-extractor.ts`:

```typescript
import puppeteer, { Browser } from 'puppeteer';
import { classifyElement, classifyHintRole } from './element-map';
import { computeQualityScore } from './quality-score';
import type {
  ComponentSpec, ExtractionResult, ScreenMeta, LegacyCtype, TableColumn,
} from './types';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

const PREFIX_BY_CTYPE: Record<LegacyCtype, string> = {
  Text: 'txt', Desc: 'txt', Edit: 'edt', Calendar: 'cal',
  SelectBox: 'sel', CheckBox: 'chk', Radio: 'rdo', TextArea: 'txa',
  Button: 'btn', Trigger: 'btn', GridView: 'grd', Group: 'grp',
  GroupBox: 'grp', Image: 'img', Tab: 'tab',
};

export async function extractFromHtml(htmlString: string): Promise<ExtractionResult> {
  const br = await getBrowser();
  const page = await br.newPage();
  await page.setViewport({ width: 1100, height: 800 });
  await page.setContent(htmlString, { waitUntil: 'load' });

  // 페이지 컨텍스트에서 컴포넌트 + 좌표 추출
  const rawResult = await page.evaluate(() => {
    const SKIP = new Set(['script', 'style', 'link', 'meta', 'title', 'head', 'html', 'body', 'br', 'hr']);

    function getAttrs(el: Element): Record<string, string> {
      const o: Record<string, string> = {};
      for (const a of Array.from(el.attributes)) {
        o[a.name] = a.value;
      }
      return o;
    }

    function getLabel(el: Element): string {
      const tag = el.tagName.toLowerCase();
      if (['input', 'select', 'textarea'].includes(tag)) {
        const id = el.getAttribute('id');
        if (id) {
          const lab = document.querySelector(`label[for="${id}"]`);
          if (lab) return (lab.textContent || '').trim();
        }
        return el.getAttribute('placeholder') ||
               el.getAttribute('value') ||
               el.getAttribute('aria-label') ||
               el.getAttribute('title') || '';
      }
      if (tag === 'button' || tag === 'a') {
        return ((el.textContent || '').trim()).slice(0, 30);
      }
      if (['label', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        return ((el.textContent || '').trim()).slice(0, 50);
      }
      if (tag === 'fieldset') {
        const legend = el.querySelector('legend');
        return legend ? (legend.textContent || '').trim() : '';
      }
      return '';
    }

    function getColumns(table: Element): Array<{id:string; label:string; width:number}> {
      const cols: Array<{id:string; label:string; width:number}> = [];
      const ths = table.querySelectorAll('th');
      if (ths.length > 0) {
        ths.forEach((th, i) => {
          const rect = th.getBoundingClientRect();
          cols.push({
            id: `col_${i + 1}`,
            label: (th.textContent || '').trim(),
            width: Math.max(Math.round(rect.width), 60),
          });
        });
      } else {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          firstRow.querySelectorAll('td').forEach((td, i) => {
            const rect = td.getBoundingClientRect();
            cols.push({
              id: `col_${i + 1}`,
              label: `컬럼${i + 1}`,
              width: Math.max(Math.round(rect.width), 60),
            });
          });
        }
      }
      return cols;
    }

    const components: any[] = [];
    const processedTables = new Set<Element>();

    function walk(el: Element): void {
      const tag = el.tagName.toLowerCase();
      if (SKIP.has(tag)) return;

      // table 내부 (table 자체 제외) 건너뜀
      const closestTable = el.closest('table');
      if (closestTable && tag !== 'table' && processedTables.has(closestTable)) {
        return;
      }

      // element-map.ts 로직을 페이지 컨텍스트에 인라인으로 (브라우저 컨텍스트라 import 불가)
      const attrs = getAttrs(el);
      let ctype: string | null = null;

      if (tag === 'input') {
        const t = (attrs.type || 'text').toLowerCase();
        const m: Record<string,string> = {
          text:'Edit', password:'Edit', number:'Edit', email:'Edit',
          tel:'Edit', search:'Edit',
          date:'Calendar', 'datetime-local':'Calendar',
          checkbox:'CheckBox', radio:'Radio',
          button:'Button', submit:'Button', reset:'Button',
        };
        ctype = m[t] || 'Edit';
      } else if (attrs.role) {
        const r: Record<string,string> = {
          combobox:'SelectBox', listbox:'SelectBox',
          searchbox:'Edit', textbox:'Edit', spinbutton:'Edit',
          checkbox:'CheckBox', radio:'Radio',
          button:'Button', link:'Button',
          grid:'GridView', table:'GridView',
          tab:'Tab', tabpanel:'Group', img:'Image',
        };
        ctype = r[attrs.role.toLowerCase()] || null;
      }
      if (!ctype) {
        const t: Record<string,string> = {
          select:'SelectBox', textarea:'TextArea', button:'Button',
          table:'GridView', label:'Text', span:'Desc',
          h1:'Text', h2:'Text', h3:'Text', h4:'Text', h5:'Text', h6:'Text',
          p:'Desc', img:'Image', a:'Button', fieldset:'GroupBox',
        };
        ctype = t[tag] || null;
      }

      if (!ctype) {
        Array.from(el.children).forEach(walk);
        return;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width < 5 && rect.height < 5) {
        Array.from(el.children).forEach(walk);
        return;
      }

      const comp: any = {
        id: el.getAttribute('id') || el.getAttribute('name') || null,
        ctype,
        label: getLabel(el),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width) || null,
        height: Math.round(rect.height) || null,
      };

      if (ctype === 'Edit') {
        comp.maxlength = el.getAttribute('maxlength') || '';
      }
      if (ctype === 'GridView') {
        processedTables.add(el);
        comp.columns = getColumns(el);
      }

      components.push(comp);

      if (ctype !== 'GridView') {
        Array.from(el.children).forEach(walk);
      }
    }

    Array.from(document.body.children).forEach(walk);

    const bodyRect = document.body.getBoundingClientRect();
    const title = (document.querySelector('title')?.textContent || '').trim() ||
                  (document.querySelector('h1, h2, h3')?.textContent || '').trim() ||
                  '변환된 화면';

    return {
      meta: {
        screenName: title.slice(0, 30),
        bodyLeft: bodyRect.left,
        bodyTop: bodyRect.top,
        bodyWidth: Math.round(bodyRect.width),
        bodyHeight: Math.round(bodyRect.height),
      },
      components,
    };
  });

  await page.close();

  // ID 생성기 (raw 결과에서 누락 ID 채움)
  let idCounter = 0;
  const components: ComponentSpec[] = rawResult.components.map((c) => {
    idCounter++;
    const id = c.id || `${PREFIX_BY_CTYPE[c.ctype as LegacyCtype]}_${String(idCounter).padStart(3, '0')}`;
    return {
      id,
      ctype: c.ctype,
      label: c.label,
      left: Math.max(0, c.left - rawResult.meta.bodyLeft),
      top: Math.max(0, c.top - rawResult.meta.bodyTop),
      width: c.width,
      height: c.height,
      maxlength: c.maxlength,
      columns: c.columns,
    };
  });

  const meta: ScreenMeta = {
    screenId: 'SCREEN001',
    screenName: rawResult.meta.screenName,
    width: Math.max(rawResult.meta.bodyWidth, 1056),
    height: Math.max(rawResult.meta.bodyHeight, 600),
  };

  const qualityScore = computeQualityScore(htmlString);

  return { meta, components, qualityScore };
}
```

- [ ] **Step 5: 테스트 실행 (Puppeteer 첫 실행은 느릴 수 있음)**

Run: `pnpm --filter @kdh/figma-ingest test dom-extractor`
Expected: 모든 테스트 PASS. 첫 실행 시 Puppeteer Chrome 부팅으로 5~10초 추가.

만약 `Failed to launch browser` 에러: WSL/Linux 환경이면 `apt-get install libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libxshmfence1` 필요. Windows native라면 Puppeteer가 기본 작동.

- [ ] **Step 6: 커밋**

```bash
git add packages/figma-ingest/src/dom-extractor.ts packages/figma-ingest/tests/dom-extractor.test.ts packages/figma-ingest/tests/fixtures/simple-form.html
git commit -m "feat(figma-ingest): puppeteer-based DOM extractor with coords"
```

---

### Task 10: ABSOLUTE-coord XML builder

**Files:**
- Create: `packages/figma-ingest/src/absolute-xml-builder.ts`
- Create: `packages/figma-ingest/tests/absolute-xml-builder.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/figma-ingest/tests/absolute-xml-builder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildAbsoluteXml } from '../src/absolute-xml-builder';
import type { ComponentSpec, ScreenMeta } from '../src/types';

const meta: ScreenMeta = {
  screenId: 'TEST001',
  screenName: '테스트',
  width: 1056,
  height: 600,
};

describe('buildAbsoluteXml', () => {
  it('기본 XML 골격 생성', () => {
    const xml = buildAbsoluteXml(meta, []);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns:w2="http://www.inswave.com/websquare"');
    expect(xml).toContain('xmlns:xf="http://www.w3.org/2002/xforms"');
    expect(xml).toContain('meta_screenId="TEST001"');
    expect(xml).toContain('meta_screenName="테스트"');
    expect(xml).toContain('<w2:dataCollection>');
    expect(xml).toContain('<body ev:onpageload="scwin.onpageload">');
  });

  it('Edit 컴포넌트 → xf:input', () => {
    const comps: ComponentSpec[] = [{
      id: 'edt_001', ctype: 'Edit', label: '사번',
      left: 100, top: 50, width: 150, height: 24,
    }];
    const xml = buildAbsoluteXml(meta, comps);
    expect(xml).toMatch(/<xf:input[^>]*ctype="Edit"[^>]*id="edt_001"/);
    expect(xml).toContain('left:100px');
    expect(xml).toContain('top:50px');
  });

  it('Button → xf:trigger with xf:label child', () => {
    const comps: ComponentSpec[] = [{
      id: 'btn_001', ctype: 'Button', label: '조회',
      left: 300, top: 50, width: 60, height: 30,
    }];
    const xml = buildAbsoluteXml(meta, comps);
    expect(xml).toMatch(/<xf:trigger[^>]*id="btn_001"/);
    expect(xml).toContain('<![CDATA[조회]]>');
    expect(xml).toContain('</xf:trigger>');
  });

  it('GridView → w2:gridView with header + gBody', () => {
    const comps: ComponentSpec[] = [{
      id: 'grd_001', ctype: 'GridView', label: '',
      left: 0, top: 100, width: 800, height: 200,
      columns: [
        { id: 'col1', label: '사번', width: 100 },
        { id: 'col2', label: '성명', width: 100 },
      ],
    }];
    const xml = buildAbsoluteXml(meta, comps);
    expect(xml).toContain('<w2:gridView');
    expect(xml).toContain('<w2:header id="header1">');
    expect(xml).toContain('<w2:gBody id="gBody1">');
    expect(xml).toMatch(/value="사번"/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test absolute-xml-builder`
Expected: FAIL

- [ ] **Step 3: absolute-xml-builder.ts 구현**

Create `packages/figma-ingest/src/absolute-xml-builder.ts`:

```typescript
/**
 * Stage 1: 컴포넌트 리스트 → ABSOLUTE-coord WebSquare XML.
 * legacy xml-generator.js의 TS 포팅 (의미 동일).
 */
import type { ComponentSpec, ScreenMeta, LegacyCtype } from './types';

const XMLNS = {
  xhtml: 'http://www.w3.org/1999/xhtml',
  ev: 'http://www.w3.org/2001/xml-events',
  w2: 'http://www.inswave.com/websquare',
  xf: 'http://www.w3.org/2002/xforms',
};

interface TagMapping { ns: 'w2'|'xf'; tag: string; ctype: string; }
const TAG_MAP: Record<LegacyCtype, TagMapping> = {
  Text:      { ns: 'w2', tag: 'textbox',       ctype: 'Text' },
  Desc:      { ns: 'w2', tag: 'textbox',       ctype: 'Text' },
  Edit:      { ns: 'xf', tag: 'input',         ctype: 'Edit' },
  Calendar:  { ns: 'xf', tag: 'inputCalendar', ctype: 'Calendar' },
  SelectBox: { ns: 'xf', tag: 'select1',       ctype: 'SelectBox' },
  CheckBox:  { ns: 'xf', tag: 'checkbox',      ctype: 'CheckBox' },
  TextArea:  { ns: 'xf', tag: 'textarea',      ctype: 'TextArea' },
  Button:    { ns: 'xf', tag: 'trigger',       ctype: 'Button' },
  Trigger:   { ns: 'xf', tag: 'trigger',       ctype: 'Button' },
  GridView:  { ns: 'w2', tag: 'gridView',      ctype: 'IBSheet' },
  Group:     { ns: 'xf', tag: 'group',         ctype: 'GroupBox' },
  GroupBox:  { ns: 'xf', tag: 'group',         ctype: 'GroupBox' },
  Radio:     { ns: 'xf', tag: 'select1',       ctype: 'RadioButton' },
  Image:     { ns: 'xf', tag: 'output',        ctype: 'Image' },
  Tab:       { ns: 'w2', tag: 'tabControl',    ctype: 'Tab' },
};

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCdata(s: string): string {
  return String(s || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function buildStyle(c: ComponentSpec): string {
  const parts = ['position:absolute'];
  if (c.left != null) parts.push(`left:${c.left}px`);
  if (c.top != null) parts.push(`top:${c.top}px`);
  if (c.width) parts.push(`width:${c.width}px`);
  if (c.height) parts.push(`height:${c.height}px`);
  return parts.join('; ') + ';';
}

function genComponent(c: ComponentSpec, indent: number): string {
  const m = TAG_MAP[c.ctype];
  const pad = '\t'.repeat(indent);
  const style = buildStyle(c);
  const id = escapeXml(c.id || '');
  const label = escapeXml(c.label || '');

  if (c.ctype === 'Button' || c.ctype === 'Trigger') {
    return [
      `${pad}<${m.ns}:${m.tag} ctype="${m.ctype}" style="${style}" id="${id}" tabIndex="1" type="button">`,
      `${pad}\t<xf:label><![CDATA[${escapeCdata(c.label || '')}]]></xf:label>`,
      `${pad}</${m.ns}:${m.tag}>`,
    ].join('\n');
  }

  if (c.ctype === 'GridView') {
    const cols = c.columns || [];
    let xml = `${pad}<${m.ns}:${m.tag} ctype="${m.ctype}" style="${style}" id="${id}" tabIndex="1">`;
    if (cols.length > 0) {
      xml += `\n${pad}\t<w2:header id="header1">\n${pad}\t\t<w2:row>`;
      cols.forEach((col, i) => {
        xml += `\n${pad}\t\t\t<w2:column id="column${i + 1}" inputType="text" value="${escapeXml(col.label || col.id || '')}" width="${col.width || 100}"/>`;
      });
      xml += `\n${pad}\t\t</w2:row>\n${pad}\t</w2:header>`;
      xml += `\n${pad}\t<w2:gBody id="gBody1">\n${pad}\t\t<w2:row>`;
      cols.forEach(col => {
        xml += `\n${pad}\t\t\t<w2:column id="${escapeXml(col.id || '')}" inputType="text" width="${col.width || 100}"/>`;
      });
      xml += `\n${pad}\t\t</w2:row>\n${pad}\t</w2:gBody>`;
    }
    xml += `\n${pad}</${m.ns}:${m.tag}>`;
    return xml;
  }

  let attrs = `ctype="${m.ctype}" style="${style}" id="${id}"`;
  if (label) attrs += ` label="${label}"`;
  if (c.maxlength) attrs += ` maxlength="${c.maxlength}"`;
  attrs += ` tabIndex="1"`;
  return `${pad}<${m.ns}:${m.tag} ${attrs}/>`;
}

export function buildAbsoluteXml(meta: ScreenMeta, components: ComponentSpec[]): string {
  const screenId = escapeXml(meta.screenId);
  const screenName = escapeXml(meta.screenName);
  const w = meta.width;
  const h = meta.height;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<html xmlns="${XMLNS.xhtml}" xmlns:ev="${XMLNS.ev}" xmlns:w2="${XMLNS.w2}" xmlns:xf="${XMLNS.xf}">`);
  lines.push(`\t<head meta_screenId="${screenId}" meta_screenName="${screenName}">`);
  lines.push(`\t\t<w2:type>COMPONENT</w2:type>`);
  lines.push(`\t\t<w2:buildDate/>`);
  lines.push(`\t\t<xf:model>`);
  lines.push(`\t\t\t<w2:dataCollection>`);
  lines.push(`\t\t\t</w2:dataCollection>`);
  lines.push(`\t\t</xf:model>`);
  lines.push(`\t\t<script type="text/javascript" lazy="false"><![CDATA[`);
  lines.push(`scwin.onpageload = function() {`);
  lines.push(`};`);
  lines.push(`]]></script>`);
  lines.push(`\t</head>`);
  lines.push(`\t<body ev:onpageload="scwin.onpageload">`);
  lines.push(`\t\t<xf:group screentitle="${screenName}" screenno="${screenId}" style="width:${w}px; height:${h}px;" class="content_body">`);
  components.forEach(c => {
    lines.push(genComponent(c, 3));
  });
  lines.push(`\t\t</xf:group>`);
  lines.push(`\t</body>`);
  lines.push(`</html>`);
  return lines.join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test absolute-xml-builder`
Expected: 4개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/absolute-xml-builder.ts packages/figma-ingest/tests/absolute-xml-builder.test.ts
git commit -m "feat(figma-ingest): absolute-coord XML builder (Stage 1)"
```

---

### Task 11: Relative converter 래퍼 (legacy 호출)

**Files:**
- Create: `packages/figma-ingest/src/relative-converter.ts`
- Create: `packages/figma-ingest/tests/relative-converter.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `packages/figma-ingest/tests/relative-converter.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { convertAbsoluteToRelative } from '../src/relative-converter';

const ABSOLUTE_XML_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ev="http://www.w3.org/2001/xml-events"
      xmlns:w2="http://www.inswave.com/websquare" xmlns:xf="http://www.w3.org/2002/xforms">
  <head meta_screenId="TEST001" meta_screenName="테스트">
    <w2:type>COMPONENT</w2:type>
    <w2:buildDate/>
    <xf:model><w2:dataCollection></w2:dataCollection></xf:model>
  </head>
  <body ev:onpageload="scwin.onpageload">
    <xf:group screentitle="테스트" screenno="TEST001" style="width:1056px; height:600px;" class="content_body">
      <xf:input ctype="Edit" style="position:absolute; left:100px; top:50px; width:150px;" id="edt_001" tabIndex="1"/>
      <xf:trigger ctype="Button" style="position:absolute; left:300px; top:50px; width:60px;" id="btn_001" tabIndex="1" type="button">
        <xf:label><![CDATA[조회]]></xf:label>
      </xf:trigger>
    </xf:group>
  </body>
</html>`;

describe('convertAbsoluteToRelative', () => {
  it('legacy sample-converter를 호출해서 상대좌표 XML 반환', () => {
    const out = convertAbsoluteToRelative(ABSOLUTE_XML_SAMPLE, { adaptive: false });
    expect(out).toBeDefined();
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('xmlns:w2="http://www.inswave.com/websquare"');
    // 상대좌표 변환 후에는 position:absolute이 사라져야 함
    expect(out).not.toContain('position:absolute');
  });

  it('adaptive 옵션 전달 가능', () => {
    const out = convertAbsoluteToRelative(ABSOLUTE_XML_SAMPLE, { adaptive: true });
    expect(out).toBeDefined();
    expect(out.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test relative-converter`
Expected: FAIL

- [ ] **Step 3: relative-converter.ts 구현**

Create `packages/figma-ingest/src/relative-converter.ts`:

```typescript
/**
 * Stage 2 래퍼: legacy sample-converter.js를 호출하여 절대→상대 변환.
 * sample-converter는 IIFE 모듈이므로 @kdh/legacy-converter/adapter를 통해 로드한다.
 */
// @ts-ignore  — 어댑터는 JS 파일이며 타입 없음
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
  // legacy의 SampleConverter export 함수명이 환경에 따라 다를 수 있음.
  // convert / convertXml / toRelative 순으로 시도.
  const candidates = ['convert', 'convertXml', 'toRelative'];
  for (const name of candidates) {
    if (typeof conv[name] === 'function') {
      const result = conv[name](absoluteXml, options);
      if (typeof result === 'string') return result;
    }
  }
  throw new Error(
    `SampleConverter export 함수를 찾을 수 없음. 다음 중 하나여야 함: ${candidates.join(', ')}. ` +
    `실제 export: ${Object.keys(conv).join(', ')}`
  );
}
```

- [ ] **Step 4: 어댑터를 패키지 export로 노출**

Modify `packages/legacy-converter/package.json` — `exports` 필드 추가:

```json
{
  "name": "@kdh/legacy-converter",
  "version": "0.1.0",
  "private": true,
  "main": "adapter.js",
  "exports": {
    ".": "./adapter.js",
    "./adapter": "./adapter.js"
  },
  "scripts": {
    "regression": "node tests/regression.smoke.js"
  },
  "dependencies": {
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test relative-converter`
Expected: 2개 테스트 PASS.

실패 시: Step 3의 candidates 배열에 실제 export 함수명을 추가해서 매칭. legacy `sample-converter.js`의 IIFE return 절을 봐서 확인.

- [ ] **Step 6: 커밋**

```bash
git add packages/figma-ingest/src/relative-converter.ts packages/figma-ingest/tests/relative-converter.test.ts packages/legacy-converter/package.json
git commit -m "feat(figma-ingest): relative-converter wrapper around legacy sample-converter"
```

---

### Task 12: 파이프라인 오케스트레이터

**Files:**
- Create: `packages/figma-ingest/src/pipeline.ts`
- Create: `packages/figma-ingest/tests/fixtures/search-grid.html`
- Create: `packages/figma-ingest/tests/pipeline.e2e.test.ts`

- [ ] **Step 1: 두 번째 픽스처 생성**

Create `packages/figma-ingest/tests/fixtures/search-grid.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>주문 조회</title>
</head>
<body>
  <h2>주문 조회</h2>
  <div class="search-area">
    <label for="orderNo">주문번호</label>
    <input type="text" id="orderNo" />
    <label for="orderDate">주문일</label>
    <input type="date" id="orderDate" />
    <button type="button">조회</button>
    <button type="button">초기화</button>
  </div>
  <div class="btn-area">
    <button type="button">엑셀 다운로드</button>
    <button type="button">저장</button>
  </div>
  <table>
    <thead><tr><th>주문번호</th><th>주문일</th><th>금액</th></tr></thead>
    <tbody>
      <tr><td>O001</td><td>2026-05-01</td><td>1000</td></tr>
      <tr><td>O002</td><td>2026-05-02</td><td>2000</td></tr>
    </tbody>
  </table>
</body>
</html>
```

- [ ] **Step 2: 실패하는 E2E 테스트 작성**

Create `packages/figma-ingest/tests/pipeline.e2e.test.ts`:

```typescript
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm --filter @kdh/figma-ingest test pipeline.e2e`
Expected: FAIL (`Cannot find module '../src/pipeline'`)

- [ ] **Step 4: pipeline.ts 구현**

Create `packages/figma-ingest/src/pipeline.ts`:

```typescript
/**
 * Phase 1 파이프라인 오케스트레이터.
 *
 * Stage 0: HTML → 컴포넌트 + 좌표 (dom-extractor)
 * Stage 1: 컴포넌트 → ABSOLUTE-coord XML (absolute-xml-builder)
 * Stage 2: ABSOLUTE → RELATIVE XML (relative-converter, legacy 호출)
 * Phase 1 룰: ID prefix 변환 (id-renamer) + 버튼 modifier 부여 (button-modifier)
 *
 * Phase 2 이후에 추가될 단계 (현재는 미포함):
 *   - Stage 3 Semantic Enricher (LLM)
 *   - Stage 4 안티패턴 검증
 *   - Stage 5 시각 회귀
 */
import { extractFromHtml } from './dom-extractor';
import { buildAbsoluteXml } from './absolute-xml-builder';
import { convertAbsoluteToRelative, RelativeOptions } from './relative-converter';
import { renameIdToUi01 } from './id-renamer';
import { applyButtonModifiersInXml } from './button-modifier';
import type { ExtractionResult } from './types';

export interface PipelineOptions extends RelativeOptions {
  /** 디버그용: 중간 단계 결과를 반환받기 위한 콜백 */
  onStage?: (name: string, payload: unknown) => void;
}

export async function convertHtmlToWebSquare(
  html: string,
  options: PipelineOptions = {}
): Promise<string> {
  // Stage 0: HTML → 컴포넌트 추출
  const extraction: ExtractionResult = await extractFromHtml(html);
  options.onStage?.('stage0-extraction', extraction);

  // Stage 1: 컴포넌트 → ABSOLUTE XML
  const absoluteXml = buildAbsoluteXml(extraction.meta, extraction.components);
  options.onStage?.('stage1-absolute', absoluteXml);

  // Stage 2: ABSOLUTE → RELATIVE
  const relativeXml = convertAbsoluteToRelative(absoluteXml, {
    adaptive: options.adaptive ?? false,
  });
  options.onStage?.('stage2-relative', relativeXml);

  // Phase 1 룰: ID prefix UI-01 + 버튼 modifier
  let result = renameIdToUi01(relativeXml);
  result = applyButtonModifiersInXml(result);
  options.onStage?.('phase1-finalized', result);

  return result;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test pipeline.e2e`
Expected: 3개 테스트 PASS. (각 테스트는 Puppeteer 부팅 + legacy 모듈 로드로 ~5초 걸림)

- [ ] **Step 6: 커밋**

```bash
git add packages/figma-ingest/src/pipeline.ts packages/figma-ingest/tests/fixtures/search-grid.html packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "feat(figma-ingest): pipeline orchestrator (Stages 0-2 + Phase 1 rules)"
```

---

### Task 13: CLI 엔트리 + 골든 회귀

**Files:**
- Create: `packages/figma-ingest/src/cli.ts`
- Create: `packages/figma-ingest/tests/fixtures/master-detail.html`
- Create: `packages/figma-ingest/tests/golden/simple-form.expected.xml` (CLI로 생성)
- Modify: `packages/figma-ingest/package.json` (bin 필드 추가)

- [ ] **Step 1: 세 번째 픽스처 (master-detail) 생성**

Create `packages/figma-ingest/tests/fixtures/master-detail.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>사원 정보 관리</title>
</head>
<body>
  <h2>사원 정보 관리</h2>
  <div class="search-area">
    <label for="empNm">성명</label>
    <input type="text" id="empNm" />
    <button type="button">조회</button>
  </div>
  <div class="grid-wrap">
    <table>
      <thead><tr><th>사번</th><th>성명</th><th>부서명</th></tr></thead>
      <tbody><tr><td>E001</td><td>홍길동</td><td>개발부</td></tr></tbody>
    </table>
  </div>
  <fieldset>
    <legend>상세 정보</legend>
    <label for="empCdDetail">사번</label>
    <input type="text" id="empCdDetail" disabled />
    <label for="empNmDetail">성명</label>
    <input type="text" id="empNmDetail" />
    <label for="deptNmDetail">부서명</label>
    <select id="deptNmDetail"><option>전체</option></select>
  </fieldset>
  <div class="btn-area">
    <button type="button">저장</button>
    <button type="button">취소</button>
  </div>
</body>
</html>
```

- [ ] **Step 2: cli.ts 구현**

Create `packages/figma-ingest/src/cli.ts`:

```typescript
#!/usr/bin/env node
/**
 * CLI 엔트리: figma-to-ws <input.html> <output.xml> [--adaptive]
 */
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from './pipeline';
import { closeBrowser } from './dom-extractor';

async function main() {
  const args = process.argv.slice(2);
  const adaptive = args.includes('--adaptive');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.error('Usage: figma-to-ws <input.html> <output.xml> [--adaptive]');
    process.exit(1);
  }

  const [inputPath, outputPath] = positional;
  const absInput = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);

  if (!fs.existsSync(absInput)) {
    console.error(`Input not found: ${absInput}`);
    process.exit(1);
  }

  const html = fs.readFileSync(absInput, 'utf-8');
  console.log(`Converting ${absInput} → ${absOutput} (adaptive=${adaptive})`);

  try {
    const xml = await convertHtmlToWebSquare(html, { adaptive });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`✓ Wrote ${xml.length} chars`);
  } catch (e) {
    console.error('Conversion failed:', e);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

main();
```

- [ ] **Step 3: bin 필드 추가**

Modify `packages/figma-ingest/package.json` — `bin` 추가:

```json
{
  "name": "@kdh/figma-ingest",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "figma-to-ws": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "cli": "node dist/cli.js"
  },
  "dependencies": {
    "@kdh/legacy-converter": "workspace:*",
    "cheerio": "^1.0.0",
    "puppeteer": "^22.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: 빌드 및 CLI 동작 확인**

Run:
```bash
pnpm --filter @kdh/figma-ingest build
node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/simple-form.html \
  /tmp/simple-form-output.xml
```

Expected output:
```
Converting .../simple-form.html → /tmp/simple-form-output.xml (adaptive=false)
✓ Wrote NNNN chars
```

XML 파일을 열어서 다음 확인:
- `<?xml version="1.0"` 으로 시작
- `xmlns:w2`, `xmlns:xf` 네임스페이스 선언
- ID에 `ibx_`, `sbx_`, `btn_` prefix
- 버튼에 `class="btn_cm sch"` 등 modifier
- `position:absolute` 잔존 없음

- [ ] **Step 5: 세 픽스처 모두 CLI로 변환 + 골든 저장**

Run:
```bash
mkdir -p packages/figma-ingest/tests/golden
node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/simple-form.html \
  packages/figma-ingest/tests/golden/simple-form.expected.xml

node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/search-grid.html \
  packages/figma-ingest/tests/golden/search-grid.expected.xml

node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/master-detail.html \
  packages/figma-ingest/tests/golden/master-detail.expected.xml
```

각 파일을 열어 사람 눈으로 *합리적인 XML*인지 확인. 합리적이면 골든 파일로 채택.

- [ ] **Step 6: 골든 회귀 테스트 작성**

Create `packages/figma-ingest/tests/golden.regression.test.ts`:

```typescript
import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';

const FIX_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const cases = [
  { name: 'simple-form', html: 'simple-form.html', expected: 'simple-form.expected.xml' },
  { name: 'search-grid', html: 'search-grid.html', expected: 'search-grid.expected.xml' },
  { name: 'master-detail', html: 'master-detail.html', expected: 'master-detail.expected.xml' },
];

describe('golden regression', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  cases.forEach(({ name, html, expected }) => {
    it(`${name}: 골든 파일과 일치`, async () => {
      const input = fs.readFileSync(path.join(FIX_DIR, html), 'utf-8');
      const expectedXml = fs.readFileSync(path.join(GOLDEN_DIR, expected), 'utf-8');
      const actualXml = await convertHtmlToWebSquare(input);
      expect(actualXml).toBe(expectedXml);
    }, 60000);
  });
});
```

- [ ] **Step 7: 골든 회귀 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test golden`
Expected: 3개 케이스 PASS.

만약 실패: Step 5에서 만든 골든이 이번 빌드 출력과 다르면 — 둘 중 하나의 *비결정성*을 찾아 제거 필요(좌표 반올림 등). 일반적으로 같은 입력은 같은 출력이어야 함. Puppeteer 렌더 미세 차이가 원인이면 viewport·waitUntil 옵션 고정.

- [ ] **Step 8: 전체 테스트 스위트 통과 확인**

Run: `pnpm --filter @kdh/figma-ingest test`
Expected: 모든 unit + e2e + golden 테스트 PASS.

- [ ] **Step 9: 커밋**

```bash
git add packages/figma-ingest/src/cli.ts \
        packages/figma-ingest/tests/fixtures/master-detail.html \
        packages/figma-ingest/tests/golden/ \
        packages/figma-ingest/tests/golden.regression.test.ts \
        packages/figma-ingest/package.json
git commit -m "feat(figma-ingest): CLI entry + golden regression for 3 fixtures"
```

---

## Self-Review Notes

**Spec coverage:**
- §3-1 Stage 0 HTML Normalizer → Task 9 (dom-extractor) + Task 5 (element-map) + Task 6 (quality-score). ✓
- §3-2 Stage 1 ABSOLUTE XML → Task 10 (absolute-xml-builder). ✓
- §3-3 Stage 2 RELATIVE 섹션 분류 → Task 11 (relative-converter 래퍼, legacy 호출). ✓
- §3-4 Stage 3 Semantic Enricher → **Phase 2 플랜으로 지연**. 이 플랜 범위 외.
- §3-5 Stage 4 Validator → **Phase 3 플랜으로 지연**.
- §3-6 Stage 5 시각 회귀 → **Phase 4 플랜으로 지연**.
- §6 보완점 #1 ID 네이밍 → Task 7 (id-renamer). ✓
- §6 보완점 #2 ELEMENT_MAP 확장 → Task 5 (element-map, ARIA/role/class). ✓
- §6 보완점 #3 WRM modifier → Task 8 (button-modifier). ✓
- §6 보완점 #4 Reference-pair few-shot → Phase 2.
- §6 보완점 #5 시각 회귀 → Phase 4.
- §6 보완점 #6 안티패턴 자동수정 → Phase 3.
- §6 보완점 #7 품질점수 분기 → Phase 2 (이 플랜에서는 점수만 계산, 분기는 LLM 호출이 생긴 후에).

**Placeholder scan:** TBD/TODO 없음. 모든 step에 실제 코드/명령/기대 출력 있음.

**Type consistency:** `ComponentSpec`/`ScreenMeta`/`ExtractionResult`/`QualityScore` 4개 타입이 types.ts에서 정의되고 모든 모듈이 동일 이름으로 import. ✓ `LegacyCtype` 유니온도 일관됨.

**잠재적 리스크:**
- Task 11에서 legacy `SampleConverter.convert()` 함수명 확신 못함. Step 5에서 실제 export를 보고 candidates 배열에 추가하도록 fallback 적어둠. ✓
- Task 13 golden 회귀가 비결정적 출력에서 실패할 수 있음. Step 7에 디버깅 가이드 적어둠. ✓
- Puppeteer 첫 설치 시 Chrome 다운로드 시간(5~10분). Step 4 description에 명시. ✓

---

*문서 끝.*
