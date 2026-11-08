const WIDGET = 'div[data-signature-widget="container"]';
const CONTENT = 'div[data-signature-widget="content"]';
const BRAND_TEXT = '--ОтправленоизVKWorkSpace';
const EMPTY_TEXT = /^[\s\u200b\ufeff]*$/u;

function compact(text: string): string {
  return text.replace(/[\s\u200b\ufeff]+/gu, '');
}

function isBrandLink(anchor: Element): boolean {
  try {
    const url = new URL(anchor.getAttribute('href') ?? '');
    return url.origin === 'https://workspace.vk.ru'
      && url.pathname === '/'
      && url.searchParams.get('utm_campaign') === 'vk_ws_free_sign'
      && url.searchParams.get('utm_source') === 'email_free';
  } catch {
    return false;
  }
}

function isBrandedWidget(element: Element): boolean {
  const content = element.querySelector(CONTENT);
  if (!content || compact(element.textContent ?? '') !== BRAND_TEXT) return false;
  const links = [...content.querySelectorAll('a')];
  return links.length === 1 && isBrandLink(links[0])
    && !element.querySelector('img, svg, video, audio, object, iframe');
}

function isEmptyWidget(element: Element): boolean {
  return EMPTY_TEXT.test(element.textContent ?? '')
    && [...element.querySelectorAll('*')].every(node => ['DIV', 'BR', 'SPAN'].includes(node.tagName));
}

function previousContent(node: ChildNode | null): ChildNode | null {
  while (node && (node.nodeType === 8 || (node.nodeType === 3 && EMPTY_TEXT.test(node.textContent ?? '')))) {
    node = node.previousSibling;
  }
  return node;
}

// The observed onSend handler appends its widget directly to the HTML fragment.
// Only inspect that trailing run: never walk into quoted messages or user content.
export function stripSignatureHtml(html: string, document: Document): { html: string; removed: number } {
  if (!html.includes('data-signature-widget')) return { html, removed: 0 };
  const template = document.createElement('template');
  template.innerHTML = html;
  const candidates: Element[] = [];
  let removed = 0;
  let node = previousContent(template.content.lastChild);
  while (node?.nodeType === 1) {
    const element = node as Element;
    if (!element.matches(WIDGET)) break;
    if (isBrandedWidget(element)) removed++;
    else if (!isEmptyWidget(element)) break;
    candidates.push(element);
    node = previousContent(node.previousSibling);
  }
  // Empty editor widgets alone are harmless. Remove them only alongside the brand.
  if (!removed) return { html, removed: 0 };
  for (const candidate of candidates) candidate.remove();
  return { html: template.innerHTML, removed };
}

const TEXT_FOOTER = /(?:^|\r?\n)[\t \u00a0]*--[\t \u00a0]*\r?\n[\t \u00a0]*Отправлено[\t \u00a0]+из[\t \u00a0]+VK[\t \u00a0]+WorkSpace(?:[\t \r\n]*[<(]?https:\/\/workspace\.vk\.ru\/\?[^\s<>)]*[>)]?)?[\t \r\n\u00a0]*$/u;

export function stripSignatureText(text: string, removed: number): string {
  for (let index = 0; index < removed; index++) {
    const next = text.replace(TEXT_FOOTER, '');
    if (next === text) break;
    text = next.replace(/[\t \r\n\u00a0]+$/u, '');
  }
  return text;
}
