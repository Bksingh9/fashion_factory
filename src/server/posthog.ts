/**
 * Server-side PostHog capture — STUBBED.
 *
 * Used from server actions, route handlers, and Inngest functions where a
 * client-side capture isn't appropriate. Logs to console and an in-memory
 * array tests can inspect. Real wiring: posthog-node `PostHog.capture()`.
 */

interface CapturedServerEvent {
  event: string;
  distinctId: string;
  properties: Record<string, unknown> | undefined;
  ts: number;
}
const buffer: CapturedServerEvent[] = [];

export function capture(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  buffer.push({ event, distinctId, properties, ts: Date.now() });
  console.warn(
    `[OBS-STUB] PostHog (server) would capture: ${event} (distinctId=${distinctId}) ${JSON.stringify(properties ?? {})}`,
  );
}

export function __phServerStubBuffer(): readonly CapturedServerEvent[] {
  return [...buffer];
}
export function __phServerStubReset(): void {
  buffer.length = 0;
}
