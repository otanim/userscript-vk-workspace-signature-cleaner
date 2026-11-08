import { cleanRequestBody, isSendRequest } from './payload.ts';

export function installNetworkHooks(
  realm: Window & typeof globalThis,
  onClean: (removed: number) => void,
): () => void {
  const prototype = realm.XMLHttpRequest.prototype;
  const originalOpen = prototype.open;
  const originalSend = prototype.send;
  const originalFetch = realm.fetch;
  const requests = new WeakMap<XMLHttpRequest, boolean>();
  const isSend = (method: string, url: string) => isSendRequest(method, url, realm.location.href);
  const clean = (body: Parameters<typeof cleanRequestBody>[0]) => {
    const result = cleanRequestBody(body, realm.document);
    if (result.removed) onClean(result.removed);
    return result.body;
  };

  const open: typeof originalOpen = function (
    this: XMLHttpRequest,
    ...args: [method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null]
  ) {
    const result = Reflect.apply(originalOpen, this, args);
    requests.set(this, isSend(args[0], String(args[1])));
    return result;
  };
  const send: typeof originalSend = function (this: XMLHttpRequest, body) {
    return originalSend.call(this, requests.get(this) ? clean(body) : body);
  };
  const fetch: typeof originalFetch = function (input, init) {
    const request = input instanceof realm.Request ? input : null;
    const method = init?.method ?? request?.method ?? 'GET';
    if (!isSend(method, request?.url ?? String(input))) return originalFetch.call(realm, input, init);
    if (init?.body != null) {
      const body = clean(init.body as XMLHttpRequestBodyInit) as BodyInit | null | undefined;
      return originalFetch.call(realm, input, body === init.body ? init : { ...init, body });
    }
    if (request && request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
      return request.clone().text().then(originalBody => {
        const body = clean(originalBody) as string;
        return originalFetch.call(realm, input, body === originalBody ? init : { ...init, body });
      });
    }
    return originalFetch.call(realm, input, init);
  };

  prototype.open = open;
  prototype.send = send;
  realm.fetch = fetch;
  return () => {
    if (prototype.open === open) prototype.open = originalOpen;
    if (prototype.send === send) prototype.send = originalSend;
    if (realm.fetch === fetch) realm.fetch = originalFetch;
  };
}
