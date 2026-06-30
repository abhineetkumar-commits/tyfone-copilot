import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAllUsers, addUser, setUserStatus, setUserRole, removeUser, isUserAdmin } from '@/lib/users';

async function requireAdmin() {
  const session = await getServerSession();
  if (!session?.user?.email) return null;
  const admin = await isUserAdmin(session.user.email);
  if (!admin) return null;
  return session.user.email;
}

export async function GET() {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
  const users = await getAllUsers();
  const sorted = users.sort((a, b) => (b.lastLoginAt || b.addedAt).localeCompare(a.lastLoginAt || a.addedAt));
  return NextResponse.json({ users: sorted, currentUser: adminEmail });
}

export async function POST(req: NextRequest) {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 403 });

  try {
    const { action, email, role } = await req.json();

    if (action === 'add') {
      const user = await addUser(email, role === 'admin' ? 'admin' : 'member', adminEmail);
      return NextResponse.json({ success: true, user });
    }
    if (action === 'block') {
      await setUserStatus(email, 'blocked');
      return NextResponse.json({ success: true });
    }
    if (action === 'unblock') {
      await setUserStatus(email, 'active');
      return NextResponse.json({ success: true });
    }
    if (action === 'setRole') {
      await setUserRole(email, role === 'admin' ? 'admin' : 'member');
      return NextResponse.json({ success: true });
    }
    if (action === 'remove') {
      await removeUser(email);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}