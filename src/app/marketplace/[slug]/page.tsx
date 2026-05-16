import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getBySlug } from "@/server/marketplace/list";

export const revalidate = 60;

type Params = Promise<{ slug: string }>;

export default async function ListingPage({
  params,
}: {
  params: Params;
}): Promise<React.ReactNode> {
  const { slug } = await params;
  const listing = await getBySlug(slug);
  if (listing === null) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <Link
        href="/marketplace"
        className="self-start text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Marketplace
      </Link>

      <header className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{listing.headline}</h1>
        {listing.featured && <Badge>Featured</Badge>}
      </header>

      {listing.founder_handle !== null && (
        <p className="text-sm text-zinc-500">
          By{" "}
          <Link href={`/founder/${listing.founder_handle}`} className="underline">
            @{listing.founder_handle}
          </Link>
        </p>
      )}

      <article className="prose prose-zinc max-w-none dark:prose-invert">
        <pre className="whitespace-pre-wrap text-sm">{listing.body_md}</pre>
      </article>
    </main>
  );
}
