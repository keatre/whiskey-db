import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Keep middleware lightweight and NEVER run it for /api/* or static assets.
 * Using a negative-lookahead matcher means requests to /api/* won't even enter
 * this function (so they can't get stuck here).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Explicit bypass for static and public assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(?:png|jpg|jpeg|gif|webp|ico|svg|json|txt)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 2) Always allow /signin
  if (pathname === '/signin') {
    return NextResponse.next();
  }

  // 3) Example: LAN + cookie presence checks could go here
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
