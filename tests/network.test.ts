import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { installNetworkHooks } from '../src/network.ts';
import { decodedBody, encodedPayload } from './fixtures.ts';

describe('outgoing request interception without network traffic', () => {
  let uninstall: () => void;
  const onClean = vi.fn();
  const nativeFetch = vi.fn<typeof fetch>();
  let nativeSend: MockInstance<XMLHttpRequest['send']>;

  beforeEach(() => {
    vi.clearAllMocks();
    nativeFetch.mockResolvedValue(new Response('accepted'));
    vi.stubGlobal('fetch', nativeFetch);
    vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => undefined);
    nativeSend = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => undefined);
    uninstall = installNetworkHooks(window, onClean);
  });
  afterEach(() => {
    uninstall();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('cleans the final XHR send body and keeps the native receiver', () => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v1/messages/send', true);
    xhr.send(encodedPayload());
    expect(nativeSend).toHaveBeenCalledTimes(1);
    expect(nativeSend.mock.contexts[0]).toBe(xhr);
    expect(decodedBody(nativeSend.mock.calls[0][0] as string)).toEqual({ html: '<div>wow</div>', text: 'wow' });
    expect(onClean).toHaveBeenCalledWith(1);
  });

  it('tracks XHR reuse and leaves draft/autosave requests unchanged', () => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v1/messages/send', true);
    xhr.open('POST', '/api/v1/messages/draft', true);
    const body = encodedPayload();
    xhr.send(body);
    expect(nativeSend).toHaveBeenCalledWith(body);
    expect(onClean).not.toHaveBeenCalled();
  });

  it('intercepts fetch with explicit body, preserving options and response', async () => {
    const abort = new AbortController();
    const options: RequestInit = { method: 'POST', body: encodedPayload(), credentials: 'include', signal: abort.signal };
    const response = await fetch('/api/v1/messages/send', options);
    const sent = nativeFetch.mock.calls[0][1]!;
    expect(await response.text()).toBe('accepted');
    expect(sent.credentials).toBe('include');
    expect(sent.signal).toBe(abort.signal);
    expect(decodedBody(sent.body as string).text).toBe('wow');
    expect(options.body).toBe(encodedPayload());
  });

  it('supports fetch(Request) without consuming the original request body', async () => {
    const request = new Request('https://e.mail.ru/api/v1/messages/send', {
      method: 'POST', body: encodedPayload(), headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    await fetch(request);
    expect(request.bodyUsed).toBe(false);
    expect(nativeFetch.mock.calls[0][0]).toBe(request);
    expect(decodedBody(nativeFetch.mock.calls[0][1]!.body as string).text).toBe('wow');
  });

  it('honors a fetch method override and leaves unrelated requests untouched', async () => {
    const request = new Request('https://e.mail.ru/api/v1/messages/send', { method: 'POST' });
    const options = { method: 'PUT', body: encodedPayload() };
    await fetch(request, options);
    expect(nativeFetch).toHaveBeenCalledWith(request, options);
    expect(onClean).not.toHaveBeenCalled();
  });

  it('preserves native fetch rejection', async () => {
    const failure = new TypeError('Network unavailable');
    nativeFetch.mockRejectedValueOnce(failure);
    await expect(fetch('/api/v1/messages/send', { method: 'POST', body: encodedPayload() })).rejects.toBe(failure);
  });

  it('does not initiate any request when installed', () => {
    expect(nativeFetch).not.toHaveBeenCalled();
    expect(nativeSend).not.toHaveBeenCalled();
  });
});
