import { describe, expect, it } from 'vitest';
import { convertAbsoluteToRelative } from '../src/relative-converter';

const ABSOLUTE_XML_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ev="http://www.w3.org/2001/xml-events"
      xmlns:w2="http://www.inswave.com/websquare" xmlns:xf="http://www.w3.org/2002/xforms">
  <head meta_screenId="TEST001" meta_screenName="테스트">
    <w2:type>COMPONENT</w2:type>
    <w2:buildDate/>
    <xf:model><w2:dataCollection></w2:dataCollection></xf:model>
  </head>
  <body ev:onpageload="scwin.onpageload">
    <xf:group screentitle="테스트" screenno="TEST001" style="width:1056px; height:600px;" class="content_body">
      <xf:input ctype="Edit" style="position:absolute; left:100px; top:50px; width:150px;" id="edt_001" tabIndex="1"/>
      <xf:trigger ctype="Button" style="position:absolute; left:300px; top:50px; width:60px;" id="btn_001" tabIndex="1" type="button">
        <xf:label><![CDATA[조회]]></xf:label>
      </xf:trigger>
    </xf:group>
  </body>
</html>`;

describe('convertAbsoluteToRelative', () => {
  it('legacy sample-converter를 호출해서 상대좌표 XML 반환 (string)', () => {
    const out = convertAbsoluteToRelative(ABSOLUTE_XML_SAMPLE, { adaptive: false });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('xmlns:w2="http://www.inswave.com/websquare"');
    // 상대좌표 변환 후에는 position:absolute가 모두 사라져야 함
    expect(out).not.toContain('position:absolute');
  });

  it('adaptive 옵션 전달 가능', () => {
    const out = convertAbsoluteToRelative(ABSOLUTE_XML_SAMPLE, { adaptive: true });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('연속 호출 시에도 동작 (singleton 캐싱)', () => {
    // 같은 프로세스에서 두 번 호출 → 캐싱 덕분에 두 번째도 동작해야 함
    const out1 = convertAbsoluteToRelative(ABSOLUTE_XML_SAMPLE);
    const out2 = convertAbsoluteToRelative(ABSOLUTE_XML_SAMPLE);
    expect(out1).toBe(out2);
  });
});
