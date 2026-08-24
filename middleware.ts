import { NextRequest, NextResponse } from 'next/server';

/**
 * The app is deployed with basePath /app, but client code intentionally
 * uses root-relative /api/* URLs. Rewrite those requests to the actual
 * deployed route while preserving the HTTP method and request body.
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api/')) {
    const url = request.nextUrl.clone();
    url.pathname = `/app${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
