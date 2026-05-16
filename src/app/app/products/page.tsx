import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseServer } from "@/server/db/server";

export const dynamic = "force-dynamic";

export default async function ProductsPage(): Promise<React.ReactNode> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user === null) {
    redirect("/login?next=/app/products");
  }

  const { data: products } = await sb
    .from("products")
    .select("id, name, slug, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Everything you&apos;ve shipped via PainPilot. Hourly metric snapshots roll up here.
          </p>
        </div>
        <Link
          href="/app/payouts"
          className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          Payouts →
        </Link>
      </header>

      {(products ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
          No products yet. Validate a cluster and ship it.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(products ?? []).map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <Link href={`/app/products/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                  <Badge variant={p.status === "public" ? "default" : "outline"}>{p.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">
                Shipped {new Date(p.created_at).toLocaleDateString()} · slug: {p.slug}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
