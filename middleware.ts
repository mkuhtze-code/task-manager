import { NextRequest, NextResponse } from 'next/server';

/**
 * Compatibility bridge for legacy root-relative client requests while the
 * application is mounted at /app via Next.js basePath.
 *
 * The current client calls /api/account/initialize directly. With basePath
 * enabled, the actual route is /app/api/account/initialize. Keep the bridge
 * narrow and limited to API requests so normal /app routing is untouched.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    const target = request.nextUrl.clone();
    target.pathname = `/app${pathname}`;
    return NextResponse.rewrite(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
