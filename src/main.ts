import { version } from '../package.json';
import { installNetworkHooks } from './network.ts';

// The Workspace shell embeds e.mail.ru on a different origin. Tampermonkey must
// inject directly into that frame; ordinary personal Mail tabs are out of scope.
const isWorkspaceFrame = window.self !== window.top
  && (document.referrer.startsWith('https://app.workspace.vk.ru/')
    || [...(location.ancestorOrigins ?? [])].includes('https://app.workspace.vk.ru'));

if (isWorkspaceFrame) {
  const key = Symbol.for('vk-workspace-signature-cleaner');
  const state = window as unknown as Record<symbol, unknown>;
  if (!state[key]) {
    const status = { version, cleanedRequests: 0, removedSignatures: 0 };
    installNetworkHooks(window, removed => {
      status.cleanedRequests++;
      status.removedSignatures += removed;
      console.info('[VK Signature Cleaner] Removed promotional signature from outgoing request.');
    });
    state[key] = status;
    console.info('[VK Signature Cleaner] Ready in Workspace mail frame.');
  }
}
