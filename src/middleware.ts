/**
 * Next.js middleware — gates /app/* and /api/v1/* on a live Supabase session.
 *
 * Two responsibilities:
 *   1. Refresh the Supabase auth cookie on every request that passes through.
 *   2. Redirect unauthenticated requests on protected paths to /login?next=<path>.
 *
 * Runs on the Node runtime so we can import `env` (zod-parses 37 vars) and
 * @supabase/ssr without bundling Node-only deps for the edge.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import type { Database } from "@/types/database";

export const runtime = "nodejs";

function isProtected(pathname: string): boolean {
  return pathname.startsWith("/app") || pathname.startsWith("/api/v1");
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll(): { name: string; value: string }[] {
          return request.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(items: { name: string; value: string; options: CookieOptions }[]): void {
          for (const { name, value } of items) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of items) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session if one exists. getUser() is the one that actually
  // validates the JWT — getSession() would only read the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (user === null && isProtected(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Excludes Next internals + common static asset extensions. Everything else
  // flows through so the auth cookie stays fresh on regular page loads.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
