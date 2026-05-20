/**
 * WebSquare 변환 파이프라인의 핵심 타입 정의.
 */

export type LegacyCtype =
  | 'Text' | 'Desc' | 'Edit' | 'Calendar' | 'SelectBox'
  | 'CheckBox' | 'Radio' | 'TextArea' | 'Button' | 'Trigger'
  | 'GridView' | 'Group' | 'GroupBox' | 'Image' | 'Tab';

export interface ComponentSpec {
  id: string;
  rawHtmlId?: string;  // 원본 HTML id (Phase 2 Semantic Enricher가 의미 추론에 사용)
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

// ─── Phase 2A: LLM Semantic Enricher IR 타입 ─────────────────────────────

export interface DataMapKeyIR {
  id: string;         // UPPER_SNAKE, e.g., "EMP_CD"
  name: string;       // 한글 라벨, e.g., "사번"
  dataType: 'text' | 'number' | 'date';
  boundComponentId?: string;  // Phase 2B — 바인딩될 컴포넌트 id (pre-rename, 예: "edt_empCd")
}

export interface DataMapIR {
  id: string;         // ^dma_
  name: string;
  keys: DataMapKeyIR[];
}

export interface DataListColumnIR {
  id: string;         // UPPER_SNAKE | 'chk'
  name: string;
  dataType: 'text' | 'number' | 'date';
  sourceBodyId?: string;      // Phase 2B — 원본 grid body 컬럼 id (예: "col_1")
}

export interface DataListIR {
  id: string;         // ^dlt_
  name: string;
  saveRemovedData?: boolean;
  columns: DataListColumnIR[];
}

export interface DataCollectionIR {
  dataMaps: DataMapIR[];
  dataLists: DataListIR[];
  confidence: number;
  notes?: string;
}

export interface UsageEntry {
  timestamp: number;
  model: string;
  inputTokens: number;          // 캐시 미스 부분
  cachedInputTokens: number;    // 캐시 히트 부분
  cacheCreationTokens: number;  // 캐시 첫 작성 시 (입력가 + 25%)
  outputTokens: number;
  costUsd: number;
}
