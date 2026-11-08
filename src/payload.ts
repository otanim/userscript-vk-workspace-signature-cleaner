import { stripSignatureHtml, stripSignatureText } from './signature.ts';

export interface CleanResult<T> {
  body: T;
  removed: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanBodyField(value: string, document: Document): CleanResult<string> {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return { body: value, removed: 0 }; }
  if (!isRecord(parsed) || typeof parsed.html !== 'string' || typeof parsed.text !== 'string') {
    return { body: value, removed: 0 };
  }
  const result = stripSignatureHtml(parsed.html, document);
  if (!result.removed) return { body: value, removed: 0 };
  return {
    body: JSON.stringify({ ...parsed, html: result.html, text: stripSignatureText(parsed.text, result.removed) }),
    removed: result.removed,
  };
}

type OutgoingBody = Document | XMLHttpRequestBodyInit | null | undefined;

// Current Mail API: URL-encoded fields with JSON {html,text} in the "body" field.
// Preserve every other serialized field exactly, including credentials/attachments.
export function cleanRequestBody(body: OutgoingBody, document: Document): CleanResult<OutgoingBody> {
  if (typeof body === 'string') {
    let removed = 0;
    const cleaned = body.replace(/(^|&)(body=)([^&]*)/gu, (match, separator: string, key: string, value: string) => {
      let decoded: string;
      try { decoded = decodeURIComponent(value.replace(/\+/gu, ' ')); } catch { return match; }
      const result = cleanBodyField(decoded, document);
      if (!result.removed) return match;
      removed += result.removed;
      return separator + key + encodeURIComponent(result.body);
    });
    return { body: removed ? cleaned : body, removed };
  }
  if (body instanceof URLSearchParams || body instanceof FormData) {
    const value = body.get('body');
    if (typeof value !== 'string') return { body, removed: 0 };
    const result = cleanBodyField(value, document);
    if (!result.removed) return { body, removed: 0 };
    if (body instanceof URLSearchParams) {
      const copy = new URLSearchParams(body);
      copy.set('body', result.body);
      return { body: copy, removed: result.removed };
    }
    const copy = new FormData();
    for (const [key, entry] of body) copy.append(key, key === 'body' ? result.body : entry);
    return { body: copy, removed: result.removed };
  }
  return { body, removed: 0 };
}

export function isSendRequest(method: string, url: string, baseUrl: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  try {
    const resolved = new URL(url, baseUrl);
    return resolved.origin === 'https://e.mail.ru'
      && /^\/api\/v1\/messages\/(send|schedule)\/?$/u.test(resolved.pathname);
  } catch { return false; }
}
