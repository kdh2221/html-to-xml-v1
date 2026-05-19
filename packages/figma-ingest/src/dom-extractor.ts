import puppeteer, { Browser } from 'puppeteer';
import { computeQualityScore } from './quality-score';
import type {
  ComponentSpec, ExtractionResult, ScreenMeta, LegacyCtype,
} from './types';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const br = await browserPromise;
    await br.close();
    browserPromise = null;
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
  let rawResult: any;
  try {
    await page.setViewport({ width: 1100, height: 800 });
    await page.setContent(htmlString, { waitUntil: 'load' });

    // 페이지 컨텍스트에서 컴포넌트 + 좌표 추출
    rawResult = await page.evaluate(() => {
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

    // NOTE: Classification logic below MIRRORS element-map.ts.
    // Browser context cannot import Node modules, so the maps are inlined.
    // Drift check: see tests/dom-extractor.test.ts ('inlined classification stays in sync').
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
  } finally {
    await page.close();
  }

  // ID 생성기 (legacy prefix를 항상 적용)
  // HTML id가 있으면 prefix_id 형태로, 없으면 prefix_NNN 시퀀스로 생성한다.
  // 이렇게 해야 id-renamer가 prefix만 UI-01 prefix로 일관되게 변환할 수 있다.
  //
  // Phase 1 워크어라운드: HTML user-defined id (예: "empCd") 앞에 legacy prefix를 붙여
  // id-renamer가 UI-01 prefix로 매핑할 수 있게 한다 (edt_empCd → ibx_empCd).
  //
  // ⚠️ Phase 2 재검토 예정: 이 prepend → rename 라운드트립은 의미명(empCd)을 prefix에 묻어버린다.
  // Phase 2 Semantic Enricher가 의미 ID를 생성할 때 원본 HTML id를 별도 채널로 전달받아야 함.
  // 임시 해법: 현재는 round-trip이 invertible하므로 (prefix는 항상 \w_, 의미명은 prefix 뒤) 작동.
  let idCounter = 0;
  const components: ComponentSpec[] = rawResult.components.map((c: any) => {
    idCounter++;
    const prefix = PREFIX_BY_CTYPE[c.ctype as LegacyCtype];
    const rawId: string | null = c.id;
    let id: string;
    if (rawId) {
      // 이미 prefix가 붙어 있으면 그대로, 아니면 prefix_<rawId> 형태로
      const hasKnownPrefix = Object.values(PREFIX_BY_CTYPE).some(p => rawId.startsWith(`${p}_`));
      id = hasKnownPrefix ? rawId : `${prefix}_${rawId}`;
    } else {
      id = `${prefix}_${String(idCounter).padStart(3, '0')}`;
    }
    // Phase 2 채널: 원본 HTML id를 prefix 없이 별도 필드로 보존
    // (Semantic Enricher가 의미명 추론에 사용)
    const rawHtmlId = rawId || undefined;
    return {
      id,
      rawHtmlId,
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
