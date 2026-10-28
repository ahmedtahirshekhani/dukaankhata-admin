import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

async function checkAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('dukaankhata_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

// GET all comments for a specific user lead
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    let userObjectId: ObjectId;
    try {
      userObjectId = toObjectId(id);
    } catch {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const db = await getDatabase();
    const user = await db.collection(COLLECTIONS.CURRENT_USERS).findOne(
      { _id: userObjectId },
      { projection: { comments: 1, name: 1, shopName: 1 } }
    );

    if (!user) {
      return NextResponse.json({ error: 'User lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      comments: user.comments || [],
    });
  } catch (error: any) {
    console.error('Error fetching comments:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST a new comment with a datetime stamp
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    let userObjectId: ObjectId;
    try {
      userObjectId = toObjectId(id);
    } catch {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: 'Comment text cannot be empty' }, { status: 400 });
    }

    const db = await getDatabase();
    const now = new Date();

    const newComment = {
      _id: new ObjectId().toString(),
      text,
      createdAt: now,
      author: (admin.name as string) || (admin.email as string) || 'Admin',
    };

    const result = await db.collection(COLLECTIONS.CURRENT_USERS).updateOne(
      { _id: userObjectId },
      {
        $push: { comments: newComment } as any,
        $set: { updatedAt: now },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Comment added successfully',
      comment: newComment,
    });
  } catch (error: any) {
    console.error('Error adding comment:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE a comment by commentId
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    let userObjectId: ObjectId;
    try {
      userObjectId = toObjectId(id);
    } catch {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json({ error: 'commentId query parameter is required' }, { status: 400 });
    }

    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.CURRENT_USERS).updateOne(
      { _id: userObjectId },
      {
        $pull: { comments: { _id: commentId } } as any,
        $set: { updatedAt: new Date() },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting comment:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
