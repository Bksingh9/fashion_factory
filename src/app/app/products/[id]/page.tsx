import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function ProductDetail({
  params,
}: {
  params: Params;
}): Promise<React.ReactNode> {
  const { id } = await params;
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect(`/login?next=/app/products/${id}`);
  }

  const { data: product } = await sb
    .from("products")
    .select("id, name, slug, status, polar_product_id, revenue_share_bps, created_at")
    .eq("id", id)
    .maybeSingle();
  if (product === null) notFound();

  const { data: latest } = await sb
    .from("product_metrics")
    .select("mrr_usd, arr_usd, users_count, active_users_count, churn_30d, snapshot_at, source")
    .eq("product_id", id)
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <Link href="/app/products" className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400">
        ← All products
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-xs text-zinc-500">
            slug: {product.slug} · revenue share: {(product.revenue_share_bps / 100).toFixed(2)}%
          </p>
        </div>
        <Badge variant={product.status === "public" ? "default" : "outline"}>{product.status}</Badge>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-xs uppercase tracking-wide">MRR</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            ${latest?.mrr_usd?.toFixed(2) ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xs uppercase tracking-wide">ARR</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">
            ${latest?.arr_usd?.toFixed(2) ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xs uppercase tracking-wide">Users</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{latest?.users_count ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-xs uppercase tracking-wide">Active 30d</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{latest?.active_users_count ?? "—"}</CardContent>
        </Card>
      </section>

      {latest === null && (
        <p className="text-sm text-zinc-500">
          No metrics snapshot yet. The hourly snapshot cron runs at the top of every hour.
        </p>
      )}
    </main>
  );
}
