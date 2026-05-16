/**
 * Test helper — typed fetch mocks for the crawler unit tests.
 *
 * Returns a `typeof fetch`-compatible function that records every call
 * (URL + init) and dispatches to a per-test handler. Avoids the
 * `as unknown as typeof fetch` escape hatch (banned by the project's
 * ESLint config) by adapting the handler's input/output to the real
 * fetch signature.
 */

export interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

export interface MockFetch {
  /** Drop-in `typeof fetch`. */
  fetch: typeof fetch;
  /** Every call made through this mock, in order. */
  calls: FetchCall[];
}

export type FetchHandler = (url: string, init: RequestInit | undefined) => Promise<Response>;

export function createMockFetch(handler: FetchHandler): MockFetch {
  const calls: FetchCall[] = [];
  const f: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetch: f, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
