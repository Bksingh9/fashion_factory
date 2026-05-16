import { redirect } from "next/navigation";
import { supabaseServer } from "@/server/db/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  magicLinkAction,
  googleOauthAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  error?: string;
  sent?: string;
  email?: string;
  next?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<React.ReactNode> {
  // If already authed, skip the login UI.
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user !== null) {
    redirect("/app");
  }

  const params = await searchParams;
  const next = params.next ?? "/app";
  const error = params.error;
  const sent = params.sent === "1";
  const sentTo = params.email;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in to PainPilot</CardTitle>
          <CardDescription>
            Use a magic link, or continue with Google. We&apos;ll send a one-time link to your inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error !== undefined && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {error}
            </div>
          )}
          {sent && (
            <div
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            >
              Check{sentTo !== undefined ? ` ${sentTo}` : " your inbox"} for the magic link.
            </div>
          )}

          <form action={magicLinkAction} className="flex flex-col gap-3">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Button type="submit" className="w-full">
              Send magic link
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-xs uppercase tracking-wide text-zinc-500">
                or
              </span>
            </div>
          </div>

          <form action={googleOauthAction}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
