import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Match all routes; we hard-bypass certain paths below.
export const config = { matcher: '/:path*' };

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) NEVER touch API or static/runtime assets
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/favicon.')
  ) {
    return NextResponse.next();
  }

  // 2) Always allow the login page itself
  if (pathname === '/login') {
    return NextResponse.next();
  }

  // 3) Host-based LAN detection (works in Docker better than req.ip)
  const allowLan = (process.env.ALLOW_LAN_GUEST || 'true').toLowerCase() === 'true';
  const hostHeader = req.headers.get('host') || '';
  const host = hostHeader.split(':')[0]; // drop port

  const isPrivateHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    (host.startsWith('172.') && (() => {
      const n = Number(host.split('.')[1] || '0');
      return n >= 16 && n <= 31;
    })());

  // 4) Auth cookie presence (we don't validate here, just presence)
  const hasAuth =
    !!req.cookies.get('access_token') ||
    !!req.cookies.get('refresh_token');

  // LAN browsing allowed without login?
  if (isPrivateHost && allowLan) {
    return NextResponse.next();
  }

  // External host: require login if no auth cookies
  if (!hasAuth) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname || '/');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
