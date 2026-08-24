import { NextRequest, NextResponse } from 'next/server';

/**
 * Compatibility bridge for legacy root-relative client API requests while
 * the application is mounted at /app via Next.js basePath.
 *
 * Client code currently calls /api/* directly. With basePath enabled, the
 * public API endpoint is /app/api/*. Use a 307 redirect rather than an
 * internal rewrite so the request is routed through Next/Vercel's normal
 * basePath handling. 307 preserves the original HTTP method and body.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    const target = request.nextUrl.clone();
    target.pathname = `/app${pathname}`;
    return NextResponse.redirect(target, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
