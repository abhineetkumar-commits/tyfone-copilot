import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isUserAllowed, recordLogin } from '@/lib/users';

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 }, // re-check allowlist hourly
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const allowed = await isUserAllowed(user.email);
      if (!allowed) return '/login?error=AccessDenied';
      await recordLogin(user.email, user.name || undefined);
      return true;
    },
    async jwt({ token }) {
      // Re-validate on every token refresh so a blocked user is cut off without
      // waiting for their session to fully expire.
      if (token.email) {
        const allowed = await isUserAllowed(token.email);
        token.blocked = !allowed;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.blocked) {
        // Returning an empty session forces the client to treat the user as signed out.
        return { ...session, user: undefined, expires: new Date(0).toISOString() };
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };