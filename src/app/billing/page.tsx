import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/server/db/server";
import { PLAN_AMOUNTS_CENTS } from "@/server/payments/stripe";
import type { Plan } from "@/types/database";
import { CheckoutButton, ManageButton } from "./buttons";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string }>;

const PLAN_COPY: Record<Plan, { title: string; tagline: string }> = {
  free: { title: "Free", tagline: "Up to 20 LLM calls/day. Crawlers run; saves are gated." },
  pro: { title: "Pro", tagline: "500 LLM calls/day. Ship 1 product/month." },
  studio: { title: "Studio", tagline: "2,500 LLM calls/day. Ship up to 5/month." },
  agency: { title: "Agency", tagline: "10,000 LLM calls/day. White-label." },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.ReactNode> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect("/login?next=/billing");
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("plan, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const plan: Plan = profile?.plan ?? "free";
  const hasCustomer = profile?.stripe_customer_id !== null && profile?.stripe_customer_id !== undefined;
  const params = await searchParams;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage your PainPilot plan. Current plan:{" "}
            <Badge variant="secondary" className="ml-1">
              {PLAN_COPY[plan].title}
            </Badge>
          </p>
        </div>
        {hasCustomer && <ManageButton />}
      </header>

      {params.status === "success" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Subscription activated. It can take a few seconds for the webhook to reflect your new
          plan above.
        </div>
      )}
      {params.status === "cancelled" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Checkout cancelled. No changes were made.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(["pro", "studio", "agency"] as const).map((p) => (
          <Card key={p} className={plan === p ? "border-zinc-900 dark:border-zinc-200" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{PLAN_COPY[p].title}</span>
                <span className="text-base font-normal text-zinc-500">
                  ${(PLAN_AMOUNTS_CENTS[p] / 100).toFixed(0)}/mo
                </span>
              </CardTitle>
              <CardDescription>{PLAN_COPY[p].tagline}</CardDescription>
            </CardHeader>
            <CardContent>
              {plan === p ? (
                <Badge variant="outline">Current plan</Badge>
              ) : (
                <CheckoutButton plan={p} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
