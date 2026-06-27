import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware() { return NextResponse.next(); },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const p = req.nextUrl.pathname;
        if (p === '/' || p === '/login' || p.startsWith('/api/auth') ||
            p.startsWith('/_next') || p.startsWith('/favicon') || p.startsWith('/public'))
          return true;
        return !!token;
      },
    },
    pages: { signIn: '/login' },
  }
);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|public/).*)'],
};
