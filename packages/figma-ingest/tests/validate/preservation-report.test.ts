import { describe, expect, it } from 'vitest';
import {
  multisetLost,
  extractOutputFieldLabels,
  extractOutputButtonLabels,
  extractOutputGridColumnLabels,
  computePreservation,
} from '../../src/validate/preservation-report';
import type { ExtractionResult } from '../../src/types';

describe('multisetLost', () => {
  it('출력에 없는 입력 라벨만 유실 (중복 개수 정확)', () => {
    expect(multisetLost(['사번', '성명', '성명'], ['사번', '성명'])).toEqual(['성명']);
    expect(multisetLost(['사번'], ['사번'])).toEqual([]);
    expect(multisetLost(['a', 'b'], [])).toEqual(['a', 'b']);
  });
  it('trim + 빈 라벨 제외', () => {
    expect(multisetLost([' 사번 ', ''], ['사번'])).toEqual([]);
  });
});

describe('output 라벨 추출', () => {
  it('extractOutputFieldLabels: 필드 태그 label만 (textbox 제외)', () => {
    const xml = `<root>
      <xf:input id="a" label="사번"/>
      <xf:select1 id="b" label="부서"/>
      <xf:inputCalendar id="c" label="주문일"/>
      <w2:textbox id="t" label="제목"/>
    </root>`;
    expect(extractOutputFieldLabels(xml).sort()).toEqual(['부서', '사번', '주문일']);
  });
  it('extractOutputButtonLabels: trigger CDATA', () => {
    const xml = `<root><xf:trigger id="b1"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
      <xf:trigger id="b2"><xf:label><![CDATA[저장]]></xf:label></xf:trigger></root>`;
    expect(extractOutputButtonLabels(xml)).toEqual(['조회', '저장']);
  });
  it('extractOutputGridColumnLabels: header column value', () => {
    const xml = `<root><w2:gridView><w2:header><w2:row>
      <w2:column id="A" value="사번"/><w2:column id="B" value="성명"/>
    </w2:row></w2:header><w2:gBody><w2:row><w2:column id="A"/></w2:row></w2:gBody></w2:gridView></root>`;
    expect(extractOutputGridColumnLabels(xml)).toEqual(['사번', '성명']);
  });
});

function ext(components: ExtractionResult['components']): ExtractionResult {
  return { meta: { screenId: 'S', screenName: 'x', width: 1000, height: 600 }, components, qualityScore: { overall: 1, semanticRatio: 1, labelIdRatio: 1, ariaRatio: 1 } };
}

describe('computePreservation', () => {
  it('전부 보존 → rate 1, lost []', () => {
    const extraction = ext([
      { id: 'edt_a', ctype: 'Edit', label: '사번', left: 0, top: 0, width: 100, height: 20 },
      { id: 'btn_a', ctype: 'Button', label: '조회', left: 0, top: 0, width: 50, height: 20 },
      { id: 'grd_a', ctype: 'GridView', label: '', left: 0, top: 0, width: 100, height: 100, columns: [{ id: 'col_1', label: '사번', width: 60 }] },
    ]);
    const xml = `<root><xf:input label="사번"/><xf:trigger><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
      <w2:gridView><w2:header><w2:row><w2:column value="사번"/></w2:row></w2:header></w2:gridView></root>`;
    const r = computePreservation(extraction, xml);
    expect(r.total).toBe(3);
    expect(r.lost).toEqual([]);
    expect(r.rate).toBe(1);
  });
  it('버튼 누락 → lost에 button', () => {
    const extraction = ext([
      { id: 'edt_a', ctype: 'Edit', label: '사번', left: 0, top: 0, width: 100, height: 20 },
      { id: 'btn_a', ctype: 'Button', label: '조회', left: 0, top: 0, width: 50, height: 20 },
    ]);
    const xml = `<root><xf:input label="사번"/></root>`;
    const r = computePreservation(extraction, xml);
    expect(r.lost).toEqual([{ family: 'button', label: '조회' }]);
    expect(r.preserved).toBe(1);
    expect(r.total).toBe(2);
  });
  it('빈 입력 → rate 1', () => {
    expect(computePreservation(ext([]), `<root/>`)).toEqual({ total: 0, preserved: 0, rate: 1, lost: [] });
  });
  it('깨진 xml에도 throw 안 함', () => {
    expect(() => computePreservation(ext([{ id: 'x', ctype: 'Edit', label: '사번', left: 0, top: 0, width: 1, height: 1 }]), `<broken`)).not.toThrow();
  });
});
