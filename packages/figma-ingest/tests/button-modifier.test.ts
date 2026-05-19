import { describe, expect, it } from 'vitest';
import { classifyButtonModifier, applyButtonModifiersInXml } from '../src/button-modifier';

describe('classifyButtonModifier', () => {
  it('조회 → btn_cm sch', () => {
    expect(classifyButtonModifier('조회')).toBe('btn_cm sch');
  });

  it('검색 → btn_cm sch', () => {
    expect(classifyButtonModifier('검색')).toBe('btn_cm sch');
  });

  it('저장 → btn_cm pt', () => {
    expect(classifyButtonModifier('저장')).toBe('btn_cm pt');
  });

  it('확인 → btn_cm pt', () => {
    expect(classifyButtonModifier('확인')).toBe('btn_cm pt');
  });

  it('행추가 → btn_cm row_add', () => {
    expect(classifyButtonModifier('행추가')).toBe('btn_cm row_add');
  });

  it('추가 → btn_cm row_add', () => {
    expect(classifyButtonModifier('추가')).toBe('btn_cm row_add');
  });

  it('엑셀 다운로드 → btn_cm download', () => {
    expect(classifyButtonModifier('엑셀 다운로드')).toBe('btn_cm download');
  });

  it('취소 → btn_cm', () => {
    expect(classifyButtonModifier('취소')).toBe('btn_cm');
  });

  it('일반/알 수 없는 라벨 → btn_cm', () => {
    expect(classifyButtonModifier('뭔가')).toBe('btn_cm');
  });

  it('빈 라벨 → btn_cm', () => {
    expect(classifyButtonModifier('')).toBe('btn_cm');
  });

  it('대소문자 무시', () => {
    expect(classifyButtonModifier('SAVE')).toBe('btn_cm pt');
    expect(classifyButtonModifier('Search')).toBe('btn_cm sch');
  });
});

describe('applyButtonModifiersInXml', () => {
  it('xf:trigger 라벨에 따라 class 자동 부여', () => {
    const xml = `
      <xf:trigger id="btn_001">
        <xf:label><![CDATA[조회]]></xf:label>
      </xf:trigger>
      <xf:trigger id="btn_002">
        <xf:label><![CDATA[저장]]></xf:label>
      </xf:trigger>
    `;
    const out = applyButtonModifiersInXml(xml);
    expect(out).toContain('id="btn_001" class="btn_cm sch"');
    expect(out).toContain('id="btn_002" class="btn_cm pt"');
  });

  it('이미 class가 있으면 덮어쓰기', () => {
    const xml = `<xf:trigger id="btn_001" class="old_class">
      <xf:label><![CDATA[조회]]></xf:label>
    </xf:trigger>`;
    const out = applyButtonModifiersInXml(xml);
    expect(out).toContain('class="btn_cm sch"');
    expect(out).not.toContain('old_class');
  });

  it('CDATA 라벨에 ] 문자 포함되어도 매칭 (regex tighten)', () => {
    const xml = `<xf:trigger id="btn_001"><xf:label><![CDATA[리]스트]]></xf:label></xf:trigger>`;
    const out = applyButtonModifiersInXml(xml);
    // 라벨 '리]스트'에 매칭 키워드 없음 → default btn_cm
    expect(out).toContain('class="btn_cm"');
    // 원본 보존
    expect(out).toContain('<![CDATA[리]스트]]>');
  });
});
