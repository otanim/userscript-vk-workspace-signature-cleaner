import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://e.mail.ru/inbox/' } },
    include: ['tests/**/*.test.ts'],
  },
});
