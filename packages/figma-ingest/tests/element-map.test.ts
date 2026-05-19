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

  it('class "database" → unknown (not tabContainer false positive)', () => {
    expect(classifyHintRole({ class: 'database-row' })).toBe('unknown');
  });

  it('aria-label "조회 영역" → schbox', () => {
    expect(classifyHintRole({ 'aria-label': '조회 영역' })).toBe('schbox');
  });

  it('아무 힌트 없음 → unknown', () => {
    expect(classifyHintRole({ class: 'foo-bar-baz' })).toBe('unknown');
  });
});
