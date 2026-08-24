import { NextRequest, NextResponse } from 'next/server';

/**
 * Keep root-relative API requests compatible with the application's /app
 * basePath. Next.js route handlers are deployed at /api/*, so API requests
 * must pass through unchanged; basePath does not move route handlers.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
