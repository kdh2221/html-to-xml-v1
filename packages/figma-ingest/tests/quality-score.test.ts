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
