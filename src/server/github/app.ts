/**
 * GitHub App integration — JWT minting, installation token cache, webhook
 * signature verification.
 *
 * `GITHUB_STUB=1` short-circuits the JWT + token-fetch paths so tests +
 * verify can drive the pipeline without real GitHub. The signature
 * verifier always runs the real HMAC math; tests pass a known secret +
 * pre-computed signature.
 */
import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

export function isGithubStubbed(): boolean {
  return process.env.GITHUB_STUB === "1";
}

// ---------- JWT minting (RS256) ----------

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Mint a 9-minute App JWT (GitHub caps at 10min). RS256 over App ID + iat/exp.
 */
export function appJwt(): string {
  if (isGithubStubbed()) return "stub-app-jwt";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60, // clock skew
    exp: now + 9 * 60,
    iss: env.GITHUB_APP_ID,
  };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const sign = createSign("RSA-SHA256");
  sign.update(data);
  // The private key is stored in env. Newlines may be literal "\n"; normalise.
  const pem = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");
  const signature = sign.sign(pem);
  return `${data}.${base64url(signature)}`;
}

// ---------- Installation token cache ----------

interface CachedInstallationToken {
  token: string;
  expires_at: number; // epoch ms
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

const stubTokenMemory = new Map<number, CachedInstallationToken>();

export async function installationToken(installationId: number): Promise<string> {
  if (isGithubStubbed()) {
    return `stub-installation-token-${String(installationId)}`;
  }
  const key = `github:install:${String(installationId)}`;
  const cached = (await redis().get(key)) as CachedInstallationToken | null;
  if (cached !== null && cached.expires_at > Date.now()) {
    return cached.token;
  }
  const res = await fetch(
    `https://api.github.com/app/installations/${String(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appJwt()}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "PainPilot/0.1",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`github installation token: HTTP ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as { token?: unknown; expires_at?: unknown };
  if (typeof body.token !== "string" || typeof body.expires_at !== "string") {
    throw new Error(`github installation token: malformed response ${JSON.stringify(body)}`);
  }
  // Token lives ~60min; reserve a 5min cushion.
  const expires = new Date(body.expires_at).getTime() - 5 * 60 * 1000;
  await redis().set(
    key,
    { token: body.token, expires_at: expires },
    { exat: Math.floor(expires / 1000) },
  );
  stubTokenMemory.set(installationId, { token: body.token, expires_at: expires });
  return body.token;
}

// ---------- Webhook signature verification ----------

/**
 * Verify a `x-hub-signature-256` header against a raw body + secret.
 * Format: `sha256=<hex>`. Constant-time comparison via timingSafeEqual.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (signature === null) return false;
  if (!signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.slice("sha256=".length);
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

/**
 * Test hook used by verify-phase-4 — same signature as the internal helper
 * but with the secret as an explicit arg so the test can supply its own.
 */
export function verifyWebhookSignatureForTest(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  return verifyWebhookSignature(rawBody, signature, secret);
}
