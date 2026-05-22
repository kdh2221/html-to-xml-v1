import { describe, expect, it } from 'vitest';
import { fixAsyncAwait } from '../../src/validate/anti-pattern-fixer';

describe('fixAsyncAwait (#2)', () => {
  it('await 있는데 async 없으면 async 삽입', () => {
    const xml = `scwin.btn_x_onclick = function() {\n\tawait $c.win.confirm("x");\n};`;
    expect(fixAsyncAwait(xml)).toBe(`scwin.btn_x_onclick = async function() {\n\tawait $c.win.confirm("x");\n};`);
  });
  it('이미 async면 불변', () => {
    const xml = `scwin.btn_x_onclick = async function() {\n\tawait $c.win.confirm("x");\n};`;
    expect(fixAsyncAwait(xml)).toBe(xml);
  });
  it('await 없으면 불변', () => {
    const xml = `scwin.onpageload = function() {\n\t$c.util.x();\n};`;
    expect(fixAsyncAwait(xml)).toBe(xml);
  });
});
