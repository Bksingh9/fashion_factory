/**
 * Supabase server client bound to the request cookies.
 *
 * Use from RSC pages, Server Actions, and route handlers when you want auth
 * to flow from the current user's session. NEVER use the service-role client
 * here — those mutations bypass RLS.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";
import type { Database } from "@/types/database";

export async function supabaseServer(): Promise<
  ReturnType<typeof createServerClient<Database>>
> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll(): { name: string; value: string }[] {
          return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(items: { name: string; value: string; options: CookieOptions }[]): void {
          // Server Components cannot mutate cookies; the middleware refreshes
          // the session and writes cookies on response. Calls from Server
          // Actions / route handlers will succeed.
          try {
            for (const { name, value, options } of items) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Ignored: read-only context (RSC). The middleware keeps the
            // session fresh by handling refreshes there.
          }
        },
      },
    },
  );
}
