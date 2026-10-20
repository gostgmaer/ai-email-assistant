import { escapeHtml, textToSafeHtml } from './text-to-html.util';

describe('textToSafeHtml', () => {
  it('escapes markup instead of passing it through', () => {
    const html = textToSafeHtml(
      'Click <a href="https://evil.example">here</a> & <img src=x onerror=alert(1)>',
    );

    expect(html).not.toContain('<a');
    expect(html).not.toContain('<img');
    expect(html).toBe(
      '<p>Click &lt;a href=&quot;https://evil.example&quot;&gt;here&lt;/a&gt; &amp; &lt;img src=x onerror=alert(1)&gt;</p>',
    );
  });

  it('turns blank lines into paragraphs and single newlines into <br />', () => {
    expect(textToSafeHtml('Hi Sam,\n\nThanks.\nBest,\r\nAlex')).toBe(
      '<p>Hi Sam,</p><p>Thanks.<br />Best,<br />Alex</p>',
    );
  });

  it('escapes quotes', () => {
    expect(escapeHtml(`"a" 'b'`)).toBe('&quot;a&quot; &#39;b&#39;');
  });
});
