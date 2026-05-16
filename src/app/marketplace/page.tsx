import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFeatured } from "@/server/marketplace/list";

// ISR — public marketplace stays inside the §6 TTFB < 200ms p95 budget.
export const revalidate = 60;

export default async function MarketplacePage(): Promise<React.ReactNode> {
  const listings = await getFeatured(24);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">PainPilot Marketplace</h1>
        <p className="text-sm text-zinc-500">
          AI micro-SaaS shipped by solo founders from validated demand signals.
        </p>
      </header>

      {listings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
          No listings published yet. Be the first to ship.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {listings.map((l) => (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <Link href={`/marketplace/${l.slug}`} className="hover:underline">
                    {l.headline}
                  </Link>
                  {l.featured && <Badge>Featured</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">
                {l.founder_handle !== null && (
                  <Link href={`/founder/${l.founder_handle}`} className="underline">
                    @{l.founder_handle}
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
