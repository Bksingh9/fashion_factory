"use client";

/**
 * PostHog provider — STUBBED per Phase 1 ops decision.
 *
 * Real init (Phase 1.5):
 *   posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, { api_host: env.NEXT_PUBLIC_POSTHOG_HOST });
 *
 * For now: a context that exposes `capture(event, props?)` which logs to
 * console and writes to a module-local array tests can inspect via
 * `__phStubCapturedEvents()`. The interface matches the real one so
 * downstream code stays unchanged.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";

interface PostHogClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
}

const capturedEvents: { event: string; properties: Record<string, unknown> | undefined; ts: number }[] = [];

export function __phStubCapturedEvents(): readonly typeof capturedEvents[number][] {
  return [...capturedEvents];
}

export function __phStubReset(): void {
  capturedEvents.length = 0;
}

function makeStubClient(): PostHogClient {
  return {
    capture(event, properties): void {
      capturedEvents.push({ event, properties, ts: Date.now() });
      console.warn(`[OBS-STUB] PostHog would capture: ${event} ${JSON.stringify(properties ?? {})}`);
    },
    identify(distinctId, properties): void {
      console.warn(`[OBS-STUB] PostHog would identify: ${distinctId} ${JSON.stringify(properties ?? {})}`);
    },
  };
}

const Ctx = createContext<PostHogClient | null>(null);

export function PostHogProvider({ children }: { children: ReactNode }): React.ReactNode {
  const client = useMemo(() => makeStubClient(), []);
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function usePostHog(): PostHogClient {
  const c = useContext(Ctx);
  if (c === null) {
    throw new Error("usePostHog must be used inside <PostHogProvider>");
  }
  return c;
}
