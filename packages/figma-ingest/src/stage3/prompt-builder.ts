/**
 * LLM에게 보낼 프롬프트와 tool 정의를 조립한다.
 * 시스템 프롬프트는 deepsquare 지침 — 프롬프트 캐싱 대상.
 */
import type { Region } from './xml-region-parser';

export const submitDataCollectionTool = {
  name: 'submit_data_collection',
  description: '입력된 화면 XML 영역을 분석해서 적합한 WebSquare DataCollection (DataMap + DataList)을 제출한다',
  input_schema: {
    type: 'object',
    properties: {
      dataMaps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^dma_[a-zA-Z0-9_]+$' },
            name: { type: 'string', description: 'DataMap의 한글 의미 — 예: "검색조건"' },
            keys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', pattern: '^[A-Z][A-Z0-9_]*$', description: 'UPPER_SNAKE_CASE' },
                  name: { type: 'string', description: '한글 라벨 — 예: "사번"' },
                  dataType: { type: 'string', enum: ['text', 'number', 'date'] },
                  boundComponentId: { type: 'string', description: '이 key가 바인딩될 컴포넌트 id (예: edt_empCd) — schbox 영역에 표시된 component id 사용' },
                },
                required: ['id', 'name', 'dataType'],
              },
            },
          },
          required: ['id', 'name', 'keys'],
        },
      },
      dataLists: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^dlt_[a-zA-Z0-9_]+$' },
            name: { type: 'string' },
            saveRemovedData: { type: 'boolean' },
            columns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', pattern: '^([A-Z][A-Z0-9_]*|chk)$' },
                  name: { type: 'string' },
                  dataType: { type: 'string', enum: ['text', 'number', 'date'] },
                  sourceBodyId: { type: 'string', description: '원본 grid body 컬럼 id (예: col_1) — gvwbox 영역에 표시된 body id 사용' },
                },
                required: ['id', 'name', 'dataType'],
              },
            },
          },
          required: ['id', 'name', 'columns'],
        },
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      notes: { type: 'string', description: '추론 근거 — 디버그용, 1~2문장' },
    },
    required: ['dataMaps', 'dataLists', 'confidence'],
  },
} as const;

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface BuiltPrompt {
  system: SystemBlock[];
  user: string;
  tools: (typeof submitDataCollectionTool)[];
}

const SYSTEM_INSTRUCTIONS = `당신은 WebSquare 화면 XML을 분석해서 적절한 DataCollection(DataMap + DataList)을 추론하는 전문가입니다.

## 출력 규칙 (deepsquare CodeRules 기반)

### DataMap (검색조건 등 단일 객체 컨테이너)
- ID는 \`dma_\` prefix + 의미 식별자 (예: \`dma_search\`, \`dma_detail\`)
- name은 한글 의미명 (예: "검색조건", "상세 정보")
- keys[].id는 UPPER_SNAKE_CASE (예: \`EMP_CD\`, \`DEPT_CD\`)
- keys[].name은 한글 라벨 — UI에 표시되는 라벨에서 가져옴
- keys[].dataType은 \`text\` | \`number\` | \`date\` 중 하나. 라벨에 "코드"/"명" 있으면 text, "금액"/"건수" 있으면 number, "일자"/"날짜" 있으면 date

### DataList (그리드 데이터 컨테이너)
- ID는 \`dlt_\` prefix + 의미 식별자 (예: \`dlt_list\`, \`dlt_memberBasic\`)
- name은 한글 의미명
- columns[].id는 UPPER_SNAKE_CASE 또는 \`chk\` (선택 체크박스 컬럼)
- columns[].id는 헤더 라벨의 의미를 담은 UPPER_SNAKE_CASE로 생성 (예: 헤더 '사번' → EMP_CD, '주문번호' → ORDER_NO). 그리드 body의 col_1 같은 자동생성 ID를 그대로 쓰지 말 것 — 의미 기반 ID를 만들 것.

## 명명 규칙 (UI-01)
- ID prefix는 반드시 \`dma_\` (DataMap), \`dlt_\` (DataList) 사용
- 키/컬럼 ID는 UPPER_SNAKE_CASE만 사용 (소문자 금지)
- \`saveRemovedData\`는 그리드가 수정 가능하면 true (기본 true)

## 바인딩 힌트 (Phase 2B)
- 각 DataMap key에는 그 값이 입력될 컴포넌트 id를 boundComponentId로 함께 반환하라. schbox 영역에 "(component: edt_empCd)"로 표시된 id를 사용.
- 각 DataList 컬럼에는 대응하는 grid body 컬럼 id를 sourceBodyId로 반환하라. gvwbox 영역에 "(body id: col_1)"로 표시된 id를 사용.
- 컴포넌트 id를 모르면 해당 힌트는 생략 가능 (시스템이 라벨/위치로 fallback).

## 작업 절차
1. 화면의 schbox 영역을 보고 → 검색조건 DataMap을 만든다
2. 화면의 gvwbox 영역을 보고 → DataList를 만든다
3. 확신도를 0~1로 반환 (라벨이 명확하면 높음, 추측이 많으면 낮음)
4. 반드시 \`submit_data_collection\` 도구를 호출해서 결과를 제출한다`;

export function buildPrompt(regions: Region[]): BuiltPrompt {
  const system: SystemBlock[] = [
    { type: 'text', text: SYSTEM_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
  ];

  const screenName = regions[0]?.screenName ?? '(미지정)';
  const parts: string[] = [`# 화면명: ${screenName}\n`];

  const schboxes = regions.filter(r => r.kind === 'schbox');
  const gvwboxes = regions.filter(r => r.kind === 'gvwbox');

  if (schboxes.length === 0 && gvwboxes.length === 0) {
    parts.push('## 영역\n현재 화면에 schbox나 gvwbox가 없습니다. 빈 DataCollection을 반환하세요 (dataMaps: [], dataLists: []).');
  } else {
    schboxes.forEach((r, i) => {
      if (r.kind !== 'schbox') return;
      parts.push(`\n## 검색조건 영역 ${i + 1} (schbox)`);
      const fieldDesc = r.fields.length > 0
        ? r.fields.map(f => `${f.label} (component: ${f.componentId})`).join(', ')
        : r.labels.join(', ');
      parts.push(`필드: ${fieldDesc}`);
    });
    gvwboxes.forEach((r, i) => {
      if (r.kind !== 'gvwbox') return;
      parts.push(`\n## 그리드 영역 ${i + 1} (gvwbox)`);
      const colDesc = r.columns.map(c => `${c.label} (body id: ${c.bodyId})`).join(', ');
      parts.push(`컬럼: ${colDesc}`);
    });

    parts.push(`\n위 영역들을 바탕으로 적절한 DataMap/DataList를 만들어 \`submit_data_collection\` 도구를 호출하세요.`);
  }

  return {
    system,
    user: parts.join('\n'),
    tools: [submitDataCollectionTool],
  };
}
