#!/usr/bin/env tsx
/**
 * Idempotently provision PainPilot's Stripe products + prices.
 *
 * Usage: `pnpm tsx scripts/setup-stripe.ts`
 *
 * Reads STRIPE_SECRET_KEY from .env.local. Writes the resulting
 * (product_id, price_id, amount_cents) tuple per paid plan into
 * scripts/stripe.json. Subsequent runs are no-ops for already-present plans.
 *
 * To rename / re-price: edit PLANS below, delete the corresponding entry
 * from scripts/stripe.json, and re-run. Existing Stripe products are
 * intentionally not mutated — Stripe doesn't allow editing a price amount
 * (you have to create a new price).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { env } from "@/env";

interface PlanSpec {
  key: "pro" | "studio" | "agency";
  name: string;
  amountCents: number;
  description: string;
}

const PLANS: PlanSpec[] = [
  {
    key: "pro",
    name: "PainPilot Pro",
    amountCents: 2900,
    description: "Solo founder workspace: 500 LLM calls/day, ship 1 product/month.",
  },
  {
    key: "studio",
    name: "PainPilot Studio",
    amountCents: 9900,
    description: "Higher ceilings: 2,500 LLM calls/day, ship up to 5/month, deeper analytics.",
  },
  {
    key: "agency",
    name: "PainPilot Agency",
    amountCents: 29900,
    description: "Bring multiple operators: 10,000 LLM calls/day, white-label, audit log.",
  },
];

const OUTPUT_PATH = path.resolve(process.cwd(), "scripts/stripe.json");

interface PriceEntry {
  productId: string;
  priceId: string;
  amountCents: number;
}
type PlanMap = Record<string, PriceEntry>;

function loadExisting(): PlanMap {
  if (!existsSync(OUTPUT_PATH)) return {};
  const text = readFileSync(OUTPUT_PATH, "utf8").trim();
  if (text === "" || text === "{}") return {};
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null) return {};
  return parsed as PlanMap;
}

async function main(): Promise<void> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { typescript: true });
  const existing = loadExisting();
  const updated: PlanMap = { ...existing };

  for (const plan of PLANS) {
    const have = existing[plan.key];
    if (have !== undefined) {
      console.log(`✓ ${plan.key}: already provisioned (${have.priceId})`);
      continue;
    }
    console.log(`+ ${plan.key}: creating product + price…`);
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { plan: plan.key, source: "painpilot/setup-stripe.ts" },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amountCents,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { plan: plan.key },
    });
    updated[plan.key] = {
      productId: product.id,
      priceId: price.id,
      amountCents: plan.amountCents,
    };
    console.log(`  product=${product.id}  price=${price.id}  $${(plan.amountCents / 100).toFixed(2)}/mo`);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
