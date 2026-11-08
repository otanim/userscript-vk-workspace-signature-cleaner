export const emptyWidget = '<div data-signature-widget="container"><div data-signature-widget="content"><div>&nbsp;</div></div></div>';
export const brandWidget = '<div data-signature-widget="container" data-signature-id="current"><div data-signature-widget="content">--<br>Отправлено из <a href="https://workspace.vk.ru/?utm_campaign=vk_ws_free_sign&amp;utm_medium=email&amp;utm_source=email_free">VK WorkSpace</a></div></div>';
export const footerText = '--\nОтправлено из VK WorkSpace';
export const originalHtml = '<div>wow</div>' + emptyWidget + brandWidget;
export const originalText = 'wow\n\n\n\n' + footerText + '\n';

export function encodedPayload(html = originalHtml, text = originalText): string {
  return 'subject=Test+%26+subject&body=' + encodeURIComponent(JSON.stringify({ html, text }))
    + '&correspondents=%7B%22to%22%3A%22test%40example.com%22%7D'
    + '&attaches=%7B%22list%22%3A%5B%7B%22id%22%3A%22attachment-1%22%7D%5D%7D'
    + '&token=synthetic%3Atest+value&email=test%40example.com&htmlencoded=false';
}

export function decodedBody(payload: string): { html: string; text: string } {
  return JSON.parse(new URLSearchParams(payload).get('body')!);
}
