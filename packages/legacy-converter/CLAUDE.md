# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A browser-based **WebSquare absolute → relative XML converter**, targeting KB국민은행 단말 차세대 화면 (KAA/KBC/KEA/... screen IDs) that have already been pre-converted by Inswave Craft. The dominant tab is **XML to XML** (sample-pattern based), with a legacy rule-based tab and a **Batch Compare** tab that renders pre/post XML on a real WebSquare server via Puppeteer and computes preservation rates.

Tool itself is not KB-specific — only the class mapping table (`btn_def1` → `btn_cm`, etc., from `samples/[KB국민은행] 전환 매핑 요소.xlsx`) is hardcoded for KB. Re-target by changing mappings only.

## Running

```
# Editor only (no batch compare) — open in browser
start index.html

# Editor + capture server (required for 배치 비교 tab)
start-editor.bat        # Spawns capture-server (port 5678) + opens index.html

# First-time setup for batch compare
cd tools && npm install   # ~170MB, pulls Puppeteer + Chrome

# Capture server alone (manual)
cd tools && node capture-server.js
# Health check: GET http://localhost:5678/health
# Capture:      POST http://localhost:5678/capture  {url, waitMs, viewport}
```

No build step, no test runner. The editor itself has **zero npm dependencies** — only `tools/` does (express + puppeteer).

### Regression / inspection scripts

```
cd tools
node regression-check.js              # Re-converts KB_ABS_REL_test pairs and diffs vs *_rel_v*.xml refs
node inspect-one.js <src.xml> <ref.xml>   # Line-level diff of single converted file vs reference
```

Both scripts `eval()` `js/sample-converter.js` inside a `jsdom` context, since the converter is a browser IIFE (`const SampleConverter = (() => {...})()`) with no `module.exports`. Requires `jsdom` to be installed (not in tools/package.json — install ad-hoc if missing).

Hardcoded paths to be aware of when running regression checks:
- `D:/AI_KB/KB_ABS_REL_test/WebContent/pub/exc_verify/{default,default_ver}`
- `D:/AI_KB/KB_ABS_REL_test/WebContent/pub/kb_21{,_ver}`

## Architecture

### Two converters, one editor

| Tab | Engine | When to touch |
|-----|--------|---------------|
| XML to XML (primary) | `js/sample-converter.js` — pattern derived from `samples/reference-pairs/*.xml` ↔ `*_pub.xml` | Almost all conversion work |
| XML 좌표변환 (legacy) | `js/abs-to-rel-converter.js` — rules from `skill/convert-xml.md` hardcoded into JS | Avoid; kept for parity comparison |

Two diverge intentionally — see "기존 방식과의 차이" in `readme.md`. Key differences: sample-converter preserves `hierarchy`/`orgid`, sorts attrs alphabetically (with `ctype` pinned first), outputs open/close tags rather than self-closing, and wraps hidden fields in `.hidden_field` instead of comments.

### Pipeline (sample-converter.js)

```
XML → xml-parser.js (parse, classify sections, Row/cell analysis)
    → overlap detection → horizontal-split detection → standalone merge
    → section look-ahead: standalone button → next section's titbox .rt
    → processSection per section:
        groupbox/standalone → Row clustering → th/td tblbox | titbox | msgbox | btngroup
        grid → gvwbox  (hidden ⇒ display:none)
        tab → tbcbox (recurse into TAB children)
        Panel (w2:pageFrame) → self-closing pnlbox
    → hidden sections: same processSection, wrapped in .hidden_field
    → missing-ID safe recovery
    → assemble XML + apply TAG_RENAME_MAP + emit btnbox
```

`w2:IBSheet` is force-normalized to `w2:gridView` on grid output. Other grid tags pass through.

### Coordinate handling (critical invariant)

Every component's **absolute coordinate is computed by accumulating parent offsets** before section classification. Sections without their own coords inherit the min top of their children. Section order is `top`-sorted, so table/grid/table sequences in the source must appear in the same order in the output — never reorder. The `.lybox > .col_N` 2/3/4-column split fires only when same-Y (within 30px) groupboxes are separated by ≥50px on `left`.

### Tag renaming hook

`sample-converter.js` exports `TAG_RENAME_MAP` (top of file). Adding `'xf:input': 'w2:kb_input'` rewrites tag names in **all** serialization paths (section components, grid columns/headers, hidden fields, buttons) without touching attributes or children. Empty map = pass-through.

### Wireframe & validation modules

| File | Role |
|------|------|
| `js/xml-parser.js` | Shared parsing / Row+cell analysis / section classification (TAB ctype split) |
| `js/abs-wireframe-gen.js` | Absolute-coord wireframe (raw layout view) |
| `js/rel-wireframe-gen.js` | Relative wireframe — uses dispatcher pattern (`renderGenericGroupFromDom`, `renderGrpboxWrapFromDom`) so unknown classes / `grpbox_wrap` / class-less wrappers still render. Cell-ID toggle is a separate button (off by default). |
| `js/script-validator.js` | Event handler / `{id}.Value` / ref / dataList / attribute-preservation checks |
| `js/wireframe-gen.js` | Tab 2 (legacy) wireframe MD |
| `js/xml-generator.js` + `js/html-converter.js` | HTML → WebSquare XML (separate inbound path) |

### Batch Compare (`tools/capture-server.js`)

Local Puppeteer service on `:5678`. Editor sends `{url, waitMs, viewport}`, gets back base64 JPEG + per-frame component counts (input/button/link/image/table/tableRow/tableCell/wsqGrid/wsqTab/wsqPanel) and visible text tokens.

- **Preservation rate per category** = `min(orig, conv) / max(orig, conv)`; **text** uses Jaccard on tokens; **overall** = equal-weighted mean over categories where at least one side is non-zero.
- Reports are **chunked at 100 screens** per HTML file under `runs/{runId}/chunk_NNN.html`. Reason: avoids single-file blowup and O(N²) append. New runs never modify existing chunks.
- Chunk relative links **only work when entry HTML is double-clicked from Explorer**. The editor's "엔트리 열기" button uses a blob URL and breaks them — leave it as summary-only.
- Check/memo state per screen is persisted in `localStorage`.

## Conversion rules to remember

These shape converter output and have caught regressions before — see `readme.md` "변환 패턴" for the full table.

- **`schbox` detection**: first GroupBox + has form elements + no grid + button text is **exactly** `조회`/`검색`/`초기화` (or button at ≥60% right). Buttons like `상품조회` / `가능번호조회` are **not** search buttons.
- **Standalone button before a content section (grid/tab/groupbox)**: pull into that section's `titbox .rt`. If section has `title_h2`, join existing titbox; else create one. **GroupBox-internal buttons stay in the table** — do not extract.
- **Unit text adjacent to form (`%`, `~`, `-`, `/` within 30px)**: keep inside same `td`, don't split into its own `th`.
- **Hidden propagation**: parent groupbox `display:none` → all descendants hidden. Run them through normal `processSection`, wrap output in `.hidden_field`. Skip IDs already emitted (e.g. a hidden `gvwbox` that also exists visibly).
- **ID uniqueness**: every ID appears exactly once in output. Single GroupBox screens put id on `sub_contents` with empty wrapper id; multi-GroupBox put empty id on `sub_contents` and real ids on each wrapper.
- **Attribute order**: alphabetical, `ctype` first. Output tags are open/close (not self-closing) except `Panel`/`w2:pageFrame`.

## Class mapping (KB)

| AS-IS | TO-BE |
|-------|-------|
| `btn_def1` / `btn_def2` / `btn_def3` / `btn_def_link` | `btn_cm` |
| `btn_ico_search` | `btn_cm search icon` |
| `kb_btn_white` | `btn_cm pt` |
| `kb_txt_red` | `txt_red` |
| `kb_title_h2` | `tit_main` |
| `kb_title_h3` | `tit_sub` |

Source of truth: `samples/[KB국민은행] 전환 매핑 요소.xlsx`.

## External reference docs (skill/convert-xml.md)

The legacy tab's rules cite these absolute paths. Read them if rule semantics are unclear:
- `D:/AI_workspace/AI_WRM/deepsquare/websquare/DeepSquare.md` (WRM 표준)
- `D:/AI_workspace/AI_WRM/deepsquare/websquare/publishing/Publishing_Skeleton.md`
- `D:/AI_workspace/AI_WRM/deepsquare/websquare/publishing/Publishing_Snippets.md`
- `D:/AI_workspace/AI_WRM/deepsquare/websquare/codeRule/CodeRules.md`

Output target path for converted files: `D:/AI_workspace/AI_WRM/WebContent/pub/wcraft/{screenId}_rel_v{N}.xml`.

## Bulk-folder converter (XML to XML tab)

- Uses **File System Access API** (Chromium only — Edge/Chrome).
- Recursively scans selected folder; converts `*.xml` only if no sibling `_rel_v*.xml` exists.
- Output is written next to source as `<name>_rel_v1.xml`.
- Failures dump to console (F12), not UI.
