import { NextResponse, type NextRequest } from 'next/server'

/**
 * Expose the current pathname to server components via a request header.
 *
 * The App Router gives layouts no access to the pathname, and the alternative —
 * making the sidebar a client component just to call usePathname() — would ship
 * the whole navigation tree as JS for one string. This is cheaper.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    // Everything except static assets and the service worker.
    '/((?!_next/static|_next/image|favicon.ico|sw.js|icon.svg|manifest.webmanifest).*)',
  ],
}
