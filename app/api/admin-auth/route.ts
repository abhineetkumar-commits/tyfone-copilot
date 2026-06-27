import { NextResponse } from 'next/server';
export async function POST() { return NextResponse.json({ error: 'Use Google sign-in' }, { status: 410 }); }
export async function DELETE() { return NextResponse.json({ success: true }); }
