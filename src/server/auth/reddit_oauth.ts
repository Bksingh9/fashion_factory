/**
 * Reddit OAuth — `client_credentials` flow.
 *
 * Reddit's API gates all programmatic reads behind a bearer token. We mint
 * one via POST https://www.reddit.com/api/v1/access_token (NOT a content
 * post — the no_auto_post CI guard rule (a) is refined in this chunk to
 * whitelist `/access_token` paths).
 *
 * Token is cached in Upstash under `reddit:oauth:token` with TTL = the
 * server-advertised `expires_in` minus a 60s safety margin. In `STUB_CRAWLER`
 * mode the cache is bypassed and a sentinel token is returned so tests
 * can run without network.
 */
import { Redis } from "@upstash/redis";
import { env } from "@/env";

const CACHE_KEY = "reddit:oauth:token";
const SAFETY_MARGIN_S = 60;

interface CachedToken {
  access_token: string;
  expires_at: number; // epoch ms
}

let stubToken: string | null = null;
let forceAnonymous = false;
/**
 * Tests set this to bypass the network entirely. Pass `"ANONYMOUS"` to
 * force the null return that triggers the anonymous-JSON fallback in
 * reddit.ts. Pass `null` to clear any prior stub.
 */
export function setStubRedditToken(t: string | null | "ANONYMOUS"): void {
  if (t === "ANONYMOUS") {
    forceAnonymous = true;
    stubToken = null;
  } else {
    forceAnonymous = false;
    stubToken = t;
  }
}

let redisCached: Redis | null = null;
function redis(): Redis {
  if (redisCached !== null) return redisCached;
  redisCached = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisCached;
}

/**
 * Returns null when OAuth creds aren't configured. Callers should treat
 * null as a signal to fall back to anonymous JSON (reddit.com/r/X/new.json).
 */
export async function getRedditAccessToken(
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (forceAnonymous) return null;
  if (stubToken !== null) return stubToken;
  if (process.env.STUB_CRAWLER === "1") return "stub-reddit-token";

  // OAuth creds are optional. Without them, return null and let the
  // caller use anonymous mode.
  if (env.REDDIT_CLIENT_ID === undefined || env.REDDIT_CLIENT_SECRET === undefined) {
    return null;
  }

  // Cache lookup.
  const cached = (await redis().get(CACHE_KEY)) as CachedToken | null;
  if (cached !== null && cached.expires_at > Date.now()) {
    return cached.access_token;
  }

  const basic = Buffer.from(
    `${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`,
  ).toString("base64");

  // NOTE: This is the OAuth token-grant endpoint, not a content POST.
  // The no_auto_post CI guard whitelists URL paths matching `/access_token`.
  const res = await fetcher("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": env.REDDIT_USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`reddit oauth: HTTP ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
    token_type?: unknown;
  };
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new Error(`reddit oauth: malformed response ${JSON.stringify(body)}`);
  }

  const expiresAt = Date.now() + (body.expires_in - SAFETY_MARGIN_S) * 1000;
  const cachedValue: CachedToken = {
    access_token: body.access_token,
    expires_at: expiresAt,
  };
  // exat = epoch seconds. Round down so the key expires strictly before the token does.
  await redis().set(CACHE_KEY, cachedValue, {
    exat: Math.floor(expiresAt / 1000),
  });

  return body.access_token;
}
