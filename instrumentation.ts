/**
 * Next.js instrumentation hook — server & edge bootstrap.
 *
 * Per Phase 1 ops decision: Sentry is STUBBED. We still wire the hook so
 * unhandled errors flow through register() / onRequestError; the
 * stub-emit just logs loudly. Replace with @sentry/nextjs init in Phase 1.5.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register(): Promise<void> {
  console.warn(
    "[OBS-STUB] Sentry would init here. Wire @sentry/nextjs in Phase 1.5. " +
      "NEVER ship to prod with this stub.",
  );
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, unknown> },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(
    `[OBS-STUB] Sentry would capture request error: ${msg} (path=${request.path} kind=${context.routerKind})`,
  );
}
