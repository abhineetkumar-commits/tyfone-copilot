import { cookies } from 'next/headers';
import * as bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.ADMIN_SECRET_KEY || 'fallback-secret-change-in-production'
);

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return password === 'admin123';
  return bcrypt.compare(password, hash);
}

export async function generateAdminToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .setIssuedAt()
    .sign(SECRET);
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try { await jwtVerify(token, SECRET); return true; } catch { return false; }
}

export async function getAdminTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('admin_token')?.value || null;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const token = await getAdminTokenFromCookies();
  if (!token) return false;
  return verifyAdminToken(token);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
