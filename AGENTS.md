# Agent Guide

A Tampermonkey userscript (TypeScript, Vite, `vite-plugin-monkey`) that removes VK WorkSpace's promotional footer from outgoing mail. [`README.md`](./README.md) describes the behaviour and its limits; `package.json` is the command source of truth.

## Layout

- `src/main.ts` - entry point; runs only in an `e.mail.ru` frame embedded in `app.workspace.vk.ru`
- `src/network.ts` - XHR and fetch hooks
- `src/payload.ts` - request body decoding and send/schedule request matching
- `src/signature.ts` - footer detection and removal for HTML and plain text
- `tests/` - Vitest with jsdom; `fixtures.ts` holds made-up payloads
- `scripts/build-and-install-userscript.mjs` - dependency-free install helper, tested with `node:test`

## Commands

```bash
npm test
npm run test:scripts
npm run typecheck
npm run build
npm run build:install
```

## Rules

- This is a public repository. Never commit personal data, real message content, account details, tokens, cookies or local machine paths. Fixtures must be made up.
- Tests must not make network requests or send email; mock the transports.
- Write unit and behavioural tests only, no end-to-end tests. A bug fix comes with a regression test.
- Keep the scope narrow: only POST send/schedule requests to `https://e.mail.ru` are changed, and anything unrecognised passes through unchanged.
- Keep `@grant none` and add no runtime dependencies.
- Do not change `@name` or `@namespace`: Tampermonkey identifies the script by them, so changing either installs a separate copy.
- After a change, run `npm run build:install`. It opens Tampermonkey's install page; the user confirms the install.
- Commit messages carry no `Co-Authored-By` trailers or tool attribution.

## Releasing

1. Bump `version` in `package.json`; the script header and runtime status read it from there.
2. Run `npm test`, `npm run typecheck` and `npm run build`.
3. Commit and tag `vX.Y.Z`. Push only with the maintainer's approval.
4. Publish with `gh release create vX.Y.Z dist/vk-workspace-signature-cleaner.user.js`. Installed copies update from `releases/latest/download/`.
