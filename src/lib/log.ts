/**
 * Structured logger.
 *
 * Real backend (Phase 1.5): Axiom HTTP ingest with AXIOM_TOKEN + AXIOM_DATASET.
 * Current: STUBBED — logs to console as JSON. The interface and call sites
 * are correct so the swap is a one-file change.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: Level, msg: string, fields: LogFields | undefined): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ?? {}),
  };
  // STUB warning is one-line; the actual log is JSON one-line so it's still
  // grep-able from a terminal scrollback.
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
  if (process.env.OBSERVABILITY_STUB === "1" || process.env.AXIOM_TOKEN === undefined) {
    // One-line stub note. Suppressed in NODE_ENV=test to keep test output tidy.
    if (process.env.NODE_ENV !== "test") {
      console.warn(`[OBS-STUB] Axiom would receive: ${msg}`);
    }
  }
}

export const log = {
  debug(msg: string, fields?: LogFields): void {
    emit("debug", msg, fields);
  },
  info(msg: string, fields?: LogFields): void {
    emit("info", msg, fields);
  },
  warn(msg: string, fields?: LogFields): void {
    emit("warn", msg, fields);
  },
  error(msg: string, fields?: LogFields): void {
    emit("error", msg, fields);
  },
};
