# fashion_factory

Fresh Playwright test project.

## Setup

```bash
npm install
npx playwright install --with-deps
```

## Run tests

```bash
npm test               # headless across all browsers
npm run test:headed    # headed
npm run test:ui        # interactive UI mode
npm run test:debug     # debug mode
npm run report         # open last HTML report
npm run codegen        # record a new test
```

## Layout

- `playwright.config.ts` — project config (chromium/firefox/webkit)
- `tests/` — your test specs
- `.mcp.json` — `@playwright/mcp` server config (Claude Code picks it up automatically)

## Playwright MCP

`@playwright/mcp` is installed as a dev dependency. In Claude Code (or any
MCP-compatible client), the server defined in `.mcp.json` lets the agent
drive a real browser — navigate, click, fill forms, take snapshots — for
debugging tests or generating new ones.

Run it standalone:

```bash
npm run mcp
```
