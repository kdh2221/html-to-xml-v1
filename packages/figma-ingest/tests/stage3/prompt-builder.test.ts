import { describe, expect, it } from 'vitest';
import { buildPrompt, submitDataCollectionTool } from '../../src/stage3/prompt-builder';
import type { Region } from '../../src/stage3/xml-region-parser';

const regions: Region[] = [
  {
    kind: 'schbox',
    labels: ['사번', '부서'],
    innerXml: '<xf:group class="schbox">...</xf:group>',
    screenName: '사원 조회',
  },
  {
    kind: 'gvwbox',
    columns: [
      { label: '사번', bodyId: 'EMP_CD' },
      { label: '성명', bodyId: 'EMP_NM' },
    ],
    innerXml: '<xf:group class="gvwbox">...</xf:group>',
    screenName: '사원 조회',
  },
];

describe('buildPrompt', () => {
  it('system prompt에 deepsquare 지침 포함', () => {
    const p = buildPrompt(regions);
    const sysText = p.system.map(b => b.text).join('\n');
    expect(sysText).toContain('UI-01');
    expect(sysText).toContain('dma_');
    expect(sysText).toContain('dlt_');
    expect(sysText).toContain('UPPER_SNAKE');
  });

  it('system 블록에 cache_control 설정', () => {
    const p = buildPrompt(regions);
    expect(p.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('user prompt에 region 정보 포함', () => {
    const p = buildPrompt(regions);
    expect(p.user).toContain('사번');
    expect(p.user).toContain('부서');
    expect(p.user).toContain('EMP_CD');
    expect(p.user).toContain('사원 조회');
  });

  it('tools에 submit_data_collection 1개', () => {
    const p = buildPrompt(regions);
    expect(p.tools.length).toBe(1);
    expect(p.tools[0].name).toBe('submit_data_collection');
  });

  it('region 없는 경우 → user prompt는 비어있지 않음 (LLM에게 빈 결과 요청)', () => {
    const p = buildPrompt([]);
    expect(p.user.length).toBeGreaterThan(0);
  });

  it('submitDataCollectionTool 도구 스키마 검증', () => {
    const tool = submitDataCollectionTool;
    expect(tool.input_schema.required).toContain('dataMaps');
    expect(tool.input_schema.required).toContain('dataLists');
    expect(tool.input_schema.required).toContain('confidence');
  });
});
