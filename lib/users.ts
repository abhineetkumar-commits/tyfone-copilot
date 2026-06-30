import { Redis } from '@upstash/redis';

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export interface AllowedUser {
  email: string;
  name?: string;
  role: 'admin' | 'member';
  status: 'active' | 'blocked';
  addedBy: string;
  addedAt: string;
  lastLoginAt?: string;
}

const USERS_KEY = 'tyfone:allowed_users';

// Seed admins — these always have access regardless of KV state, so the
// person deploying the app can never lock themselves out.
const SEED_ADMIN_EMAILS = (process.env.SEED_ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

export async function getAllUsers(): Promise<AllowedUser[]> {
  const r = getRedis();
  if (!r) return seedOnlyUsers();
  try {
    const users = await r.get<AllowedUser[]>(USERS_KEY);
    return users || seedOnlyUsers();
  } catch {
    return seedOnlyUsers();
  }
}

function seedOnlyUsers(): AllowedUser[] {
  return SEED_ADMIN_EMAILS.map(email => ({
    email,
    role: 'admin' as const,
    status: 'active' as const,
    addedBy: 'system',
    addedAt: new Date(0).toISOString(),
  }));
}

async function saveUsers(users: AllowedUser[]): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error('Redis (KV) not configured — cannot persist user changes');
  await r.set(USERS_KEY, users);
}

export async function isUserAllowed(email: string): Promise<boolean> {
  const e = email.toLowerCase();
  if (SEED_ADMIN_EMAILS.includes(e)) return true;
  const users = await getAllUsers();
  const u = users.find(u => u.email.toLowerCase() === e);
  return !!u && u.status === 'active';
}

export async function isUserAdmin(email: string): Promise<boolean> {
  const e = email.toLowerCase();
  if (SEED_ADMIN_EMAILS.includes(e)) return true;
  const users = await getAllUsers();
  const u = users.find(u => u.email.toLowerCase() === e);
  return !!u && u.role === 'admin' && u.status === 'active';
}

export async function recordLogin(email: string, name?: string): Promise<void> {
  if (!getRedis()) return;
  const e = email.toLowerCase();
  const users = await getAllUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === e);
  if (idx >= 0) {
    users[idx].lastLoginAt = new Date().toISOString();
    if (name) users[idx].name = name;
    await saveUsers(users);
  } else if (SEED_ADMIN_EMAILS.includes(e)) {
    // First login of a seed admin — persist them into KV so they show in the admin UI
    users.push({
      email: e, name, role: 'admin', status: 'active',
      addedBy: 'system', addedAt: new Date().toISOString(), lastLoginAt: new Date().toISOString(),
    });
    await saveUsers(users);
  }
}

export async function addUser(email: string, role: 'admin' | 'member', addedBy: string): Promise<AllowedUser> {
  const e = email.toLowerCase().trim();
  if (!e || !e.includes('@')) throw new Error('Invalid email address');
  const users = await getAllUsers();
  if (users.some(u => u.email.toLowerCase() === e)) throw new Error('User already exists');
  const newUser: AllowedUser = { email: e, role, status: 'active', addedBy, addedAt: new Date().toISOString() };
  users.push(newUser);
  await saveUsers(users);
  return newUser;
}

export async function setUserStatus(email: string, status: 'active' | 'blocked'): Promise<void> {
  const e = email.toLowerCase();
  if (SEED_ADMIN_EMAILS.includes(e) && status === 'blocked') {
    throw new Error('Cannot block a seed admin — remove from SEED_ADMIN_EMAILS env var instead');
  }
  const users = await getAllUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === e);
  if (idx < 0) throw new Error('User not found');
  users[idx].status = status;
  await saveUsers(users);
}

export async function setUserRole(email: string, role: 'admin' | 'member'): Promise<void> {
  const e = email.toLowerCase();
  const users = await getAllUsers();
  const idx = users.findIndex(u => u.email.toLowerCase() === e);
  if (idx < 0) throw new Error('User not found');
  users[idx].role = role;
  await saveUsers(users);
}

export async function removeUser(email: string): Promise<void> {
  const e = email.toLowerCase();
  if (SEED_ADMIN_EMAILS.includes(e)) throw new Error('Cannot remove a seed admin');
  const users = await getAllUsers();
  const filtered = users.filter(u => u.email.toLowerCase() !== e);
  if (filtered.length === users.length) throw new Error('User not found');
  await saveUsers(filtered);
}