import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  sent: "default",
  pending: "secondary",
  failed: "outline",
};

export default async function PayoutsPage(): Promise<React.ReactNode> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect("/login?next=/app/payouts");
  }

  const { data: payouts } = await sb
    .from("payouts")
    .select("id, period_start, period_end, gross_usd, fee_usd, net_usd, status, polar_payout_id")
    .eq("user_id", user.id)
    .order("period_start", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Payouts</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Monthly rollup. PainPilot retains a configurable revenue share (default 10%).
          </p>
        </div>
        <Link
          href="/app/products"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Products
        </Link>
      </header>

      {(payouts ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
          No payouts yet. Monthly computation runs on the 1st at 06:00 UTC.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(payouts ?? []).map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    {p.period_start} → {p.period_end}
                  </span>
                  <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>{p.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase text-zinc-500">Gross</p>
                  <p className="font-semibold">${p.gross_usd.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-zinc-500">PainPilot fee</p>
                  <p className="font-semibold">${p.fee_usd.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-zinc-500">Net</p>
                  <p className="font-semibold">${p.net_usd.toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
