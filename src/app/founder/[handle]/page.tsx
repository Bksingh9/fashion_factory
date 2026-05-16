import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseService } from "@/server/db/service";

export const revalidate = 300;

type Params = Promise<{ handle: string }>;

export default async function FounderPage({
  params,
}: {
  params: Params;
}): Promise<React.ReactNode> {
  const { handle } = await params;
  const sb = supabaseService();

  const { data: profile } = await sb
    .from("profiles")
    .select("handle, full_name")
    .eq("handle", handle)
    .maybeSingle();
  if (profile === null) notFound();

  const { data: listings } = await sb
    .from("marketplace_listings")
    .select("id, slug, headline")
    .eq("founder_handle", handle)
    .not("published_at", "is", null)
    .order("sort_score", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <Link
        href="/marketplace"
        className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Marketplace
      </Link>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {profile.full_name ?? `@${profile.handle ?? handle}`}
        </h1>
        {profile.handle !== null && (
          <p className="text-sm text-zinc-500">@{profile.handle}</p>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Shipped products ({(listings ?? []).length})</h2>
        {(listings ?? []).map((l) => (
          <Link
            key={l.id}
            href={`/marketplace/${l.slug}`}
            className="rounded-md border border-zinc-200 p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            {l.headline}
          </Link>
        ))}
      </section>
    </main>
  );
}
