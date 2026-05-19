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
  [/(^|[\s_-])tab([s_-]|$)/i, 'tabContainer'],
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
