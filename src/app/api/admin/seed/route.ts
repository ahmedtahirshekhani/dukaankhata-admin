import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'Sample seeding is disabled. Only real database users are managed.' },
    { status: 400 }
  );
}
