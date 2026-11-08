import { describe, expect, it } from 'vitest';
import { cleanRequestBody, isSendRequest } from '../src/payload.ts';
import { decodedBody, encodedPayload, originalHtml, originalText } from './fixtures.ts';

describe('Mail API payload', () => {
  it('cleans both body formats and preserves all other encoded bytes', () => {
    const original = encodedPayload();
    const result = cleanRequestBody(original, document);
    expect(result.removed).toBe(1);
    expect(decodedBody(result.body as string)).toEqual({ html: '<div>wow</div>', text: 'wow' });
    expect((result.body as string).replace(/body=[^&]*/u, 'body=OMITTED'))
      .toBe(original.replace(/body=[^&]*/u, 'body=OMITTED'));
  });

  it('accepts the plus-for-space encoding used by the live page', () => {
    const result = cleanRequestBody(encodedPayload().replaceAll('%20', '+'), document);
    expect(decodedBody(result.body as string).text).toBe('wow');
  });

  it('does not mutate caller-owned URLSearchParams', () => {
    const params = new URLSearchParams(encodedPayload());
    const original = params.toString();
    const result = cleanRequestBody(params, document);
    expect(result.body).toBeInstanceOf(URLSearchParams);
    expect(decodedBody(String(result.body)).html).toBe('<div>wow</div>');
    expect(params.toString()).toBe(original);
  });

  it('keeps multipart file objects and repeated fields intact', () => {
    const form = new FormData();
    form.append('body', JSON.stringify({ html: originalHtml, text: originalText }));
    form.append('attachment', new File(['photo'], 'photo.png', { type: 'image/png' }));
    form.append('tag', 'one');
    form.append('tag', 'two');
    const result = cleanRequestBody(form, document);
    const cleaned = result.body as FormData;
    expect(cleaned).not.toBe(form);
    expect(cleaned.get('attachment')).toBe(form.get('attachment'));
    expect(cleaned.getAll('tag')).toEqual(['one', 'two']);
    expect(JSON.parse(String(cleaned.get('body'))).text).toBe('wow');
    expect(JSON.parse(String(form.get('body'))).text).toBe(originalText);
  });

  it('preserves unknown message-body properties', () => {
    const params = new URLSearchParams({ body: JSON.stringify({ html: originalHtml, text: originalText, extra: 'keep' }) });
    const result = cleanRequestBody(params, document);
    expect(JSON.parse(String((result.body as URLSearchParams).get('body'))).extra).toBe('keep');
  });

  it('returns unchanged bodies when no targeted signature can be removed', () => {
    for (const body of [undefined, null, '', 'body=oops', 'body=%E0%A4%A', 'body=null', 'body=[]',
      'body=%7B%22html%22%3A42%7D', encodedPayload('<div>Normal message</div>', 'Normal message'), new FormData()]) {
      expect(cleanRequestBody(body, document)).toEqual({ body, removed: 0 });
    }
  });
});

describe('request scope', () => {
  const base = 'https://e.mail.ru/inbox/';
  it.each(['/api/v1/messages/send', '/api/v1/messages/send/?x=1', '/api/v1/messages/schedule'])('targets POST %s', url => {
    expect(isSendRequest('POST', url, base)).toBe(true);
  });
  it.each([
    ['GET', '/api/v1/messages/send'],
    ['POST', '/api/v1/messages/draft'],
    ['POST', '/api/v1/messages/attaches/add'],
    ['POST', '/api/v1/messages/send-extra'],
    ['POST', 'https://example.com/api/v1/messages/send'],
    ['POST', 'https://e.mail.ru.example.com/api/v1/messages/send'],
  ])('ignores %s %s', (method, url) => {
    expect(isSendRequest(method, url, base)).toBe(false);
  });
});
