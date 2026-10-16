import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { formatWhatsAppPhone } from '@/lib/whatsapp/phone-utils';

async function checkAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('dukaankhata_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== 'admin') return null;
  return payload;
}

export async function GET(request: Request) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = await getDatabase();
    const { searchParams } = new URL(request.url);

    const search = (searchParams.get('search') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (search) {
      const regex = { $regex: search, $options: 'i' };
      query.$or = [
        { name: regex },
        { shopName: regex },
        { number: regex },
        { place: regex },
      ];
    }

    const collection = db.collection(COLLECTIONS.POTENTIAL_LEADS);
    const totalLeads = await collection.countDocuments(query);
    const leads = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const formattedLeads = leads.map((lead) => ({
      _id: lead._id.toString(),
      name: lead.name || '',
      shopName: lead.shopName || '',
      number: lead.number || '',
      place: lead.place || '',
      createdAt: lead.createdAt || new Date(),
      updatedAt: lead.updatedAt || new Date(),
    }));

    const totalPages = Math.max(1, Math.ceil(totalLeads / limit));

    return NextResponse.json({
      success: true,
      leads: formattedLeads,
      totalLeads,
      count: formattedLeads.length,
      page,
      totalPages,
    });
  } catch (error: any) {
    console.error('Error fetching potential leads:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, shopName, number, place } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!number || typeof number !== 'string' || !number.trim()) {
      return NextResponse.json({ error: 'Number (Phone) is required' }, { status: 400 });
    }

    if (!place || typeof place !== 'string' || !place.trim()) {
      return NextResponse.json({ error: 'Place/Location is required' }, { status: 400 });
    }

    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.POTENTIAL_LEADS);

    const cleanInputPhone = formatWhatsAppPhone(number.trim());
    const digitsOnlyInput = number.trim().replace(/\D/g, '');

    // Check for duplicate phone number
    const allLeads = await collection.find({}).toArray();
    const existingDuplicate = allLeads.find((lead) => {
      const leadClean = formatWhatsAppPhone(lead.number || '');
      const leadDigits = (lead.number || '').replace(/\D/g, '');
      if (cleanInputPhone && leadClean && cleanInputPhone === leadClean) return true;
      if (digitsOnlyInput && leadDigits && digitsOnlyInput === leadDigits) return true;
      return false;
    });

    if (existingDuplicate) {
      return NextResponse.json(
        {
          error: `A lead with phone number "${number.trim()}" already exists (${existingDuplicate.name} - ${existingDuplicate.shopName}). Duplicate phone numbers are not allowed.`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const newLeadDoc = {
      name: name.trim(),
      shopName: shopName && typeof shopName === 'string' && shopName.trim() ? shopName.trim() : 'N/A',
      number: number.trim(),
      cleanNumber: cleanInputPhone,
      place: place.trim(),
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(newLeadDoc);

    return NextResponse.json({
      success: true,
      lead: {
        _id: result.insertedId.toString(),
        ...newLeadDoc,
      },
      message: 'Potential lead created successfully',
    });
  } catch (error: any) {
    console.error('Error creating potential lead:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Lead ID is required for deletion' }, { status: 400 });
    }

    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.POTENTIAL_LEADS);

    const deleteResult = await collection.deleteOne({ _id: toObjectId(id) });

    if (deleteResult.deletedCount === 0) {
      return NextResponse.json({ error: 'Lead not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Potential lead deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting potential lead:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
