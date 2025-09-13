import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Keep middleware lightweight and NEVER run it for /api/* or static assets.
 * Using a negative-lookahead matcher means requests to /api/* won't even enter
 * this function (so they can't get stuck here).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // (Optional) keep your LAN guest logic etc. here — it runs only for pages.
  // Example: allow /signin always
  if (pathname === '/signin') {
    return NextResponse.next();
  }

  // Example LAN + cookie presence checks could go here
  // ...
  return NextResponse.next();
}

/**
 * Exclude API and static assets from middleware entirely.
 */
export const config = {
  matcher: [
    // Run on everything EXCEPT:
    // - /api routes
    // - Next static/image assets
    // - common root files
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
