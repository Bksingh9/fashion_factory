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
