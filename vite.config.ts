import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import packageInfo from './package.json';

const repository = 'https://github.com/otanim/userscript-vk-workspace-signature-cleaner';
const fileName = 'vk-workspace-signature-cleaner.user.js';
const releaseDownload = `${repository}/releases/latest/download/${fileName}`;

export default defineConfig({
  plugins: [monkey({
    entry: 'src/main.ts',
    userscript: {
      name: 'VK Workspace Signature Cleaner',
      namespace: repository,
      version: packageInfo.version,
      description: packageInfo.description,
      author: packageInfo.author,
      match: ['https://e.mail.ru/*'],
      grant: 'none',
      sandbox: 'raw',
      'run-at': 'document-start',
      downloadURL: releaseDownload,
      updateURL: releaseDownload,
    },
    build: { fileName },
  })],
});
