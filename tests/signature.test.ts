import { describe, expect, it } from 'vitest';
import { stripSignatureHtml, stripSignatureText } from '../src/signature.ts';
import { brandWidget, emptyWidget, footerText, originalHtml, originalText } from './fixtures.ts';

describe('appended signature cleanup', () => {
  it('removes the exact reported HTML and adjacent empty widget', () => {
    expect(stripSignatureHtml(originalHtml, document)).toEqual({ html: '<div>wow</div>', removed: 1 });
    expect(stripSignatureText(originalText, 1)).toBe('wow');
  });

  it('leaves the empty editor widget alone before VK appends the brand', () => {
    const html = '<DIV>wow</DIV>' + emptyWidget;
    expect(stripSignatureHtml(html, document)).toEqual({ html, removed: 0 });
  });

  it('preserves a custom signature and quoted branded signatures', () => {
    const kept = '<div>My reply</div><blockquote>' + brandWidget + '</blockquote>'
      + '<div data-signature-widget="container"><div data-signature-widget="content">Jane Doe<br>Example Ltd</div></div>';
    expect(stripSignatureHtml(kept + emptyWidget + brandWidget, document)).toEqual({ html: kept, removed: 1 });
  });

  it('does not strip a branded widget inside a quote or followed by user content', () => {
    for (const html of ['<blockquote>' + brandWidget + '</blockquote>', brandWidget + '<div>User text</div>']) {
      expect(stripSignatureHtml(html, document)).toEqual({ html, removed: 0 });
    }
  });

  it('preserves signature widgets with extra text or an image', () => {
    for (const addition of ['<div>My contact information</div>', '<img src="cid:signature-logo">']) {
      const html = brandWidget.replace('--<br>', addition + '--<br>');
      expect(stripSignatureHtml(html, document)).toEqual({ html, removed: 0 });
    }
  });

  it('requires the exact promotional link instead of any mention of VK', () => {
    for (const html of [
      brandWidget.replace('workspace.vk.ru', 'example.com'),
      brandWidget.replace('vk_ws_free_sign', 'ordinary-link'),
      brandWidget.replace('email_free', 'user-link'),
    ]) expect(stripSignatureHtml(html, document)).toEqual({ html, removed: 0 });
  });

  it('preserves rich content, inline attachments, non-Latin text and body whitespace', () => {
    const kept = '<div style="color: red">Բարև 👋 &amp; hello</div><pre>  code\n  line</pre>'
      + '<table><tbody><tr><td>Cell</td></tr></tbody></table><img src="cid:photo">';
    expect(stripSignatureHtml(kept + brandWidget, document)).toEqual({ html: kept, removed: 1 });
  });

  it('handles repeated footer appends on retry and is idempotent', () => {
    const result = stripSignatureHtml(originalHtml + brandWidget, document);
    expect(result).toEqual({ html: '<div>wow</div>', removed: 2 });
    expect(stripSignatureHtml(result.html, document)).toEqual({ html: result.html, removed: 0 });
    expect(stripSignatureText(originalText + footerText, 2)).toBe('wow');
  });

  it('handles trailing whitespace and comments without discarding comments', () => {
    const result = stripSignatureHtml('<div>wow</div>' + brandWidget + ' \n<!--keep-->', document);
    expect(result).toEqual({ html: '<div>wow</div> \n<!--keep-->', removed: 1 });
  });

  it('cleans CRLF plain text and a link-expanded plain-text footer', () => {
    expect(stripSignatureText(originalText.replaceAll('\n', '\r\n'), 1)).toBe('wow');
    expect(stripSignatureText(originalText.trimEnd() + ' <https://workspace.vk.ru/?utm_campaign=vk_ws_free_sign>', 1)).toBe('wow');
  });

  it('leaves quoted plaintext and ordinary mentions intact', () => {
    const quoted = '> --\n> Отправлено из VK WorkSpace';
    expect(stripSignatureText(quoted + '\n\n' + footerText, 1)).toBe(quoted);
    expect(stripSignatureText('I use VK WorkSpace', 1)).toBe('I use VK WorkSpace');
    expect(stripSignatureText(originalText, 0)).toBe(originalText);
  });
});
