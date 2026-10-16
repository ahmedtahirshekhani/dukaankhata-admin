import { NextResponse } from 'next/server';
import { getDatabase, COLLECTIONS, toObjectId } from '@/lib/db/mongodb';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { formatWhatsAppPhone } from '@/lib/whatsapp/phone-utils';
import { calculateTraderWholesaleScore, isWholesalerOrTrader } from '@/lib/market-leads/scoring';

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
    const market = (searchParams.get('market') || '').trim();
    const category = (searchParams.get('category') || '').trim();
    const businessType = (searchParams.get('businessType') || '').trim();
    const sortParam = (searchParams.get('sort') || 'never_sent').trim();
    const filter = (searchParams.get('filter') || '').trim(); // 'with_owner', 'with_alternates', 'wholesalers'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    // Text search across multiple fields
    if (search) {
      const regex = { $regex: search, $options: 'i' };
      query.$or = [
        { name: regex },
        { shopName: regex },
        { number: regex },
        { place: regex },
        { marketName: regex },
        { area: regex },
        { category: regex },
        { address: regex },
        { businessType: regex },
      ];
    }

    // Market / Place filter
    if (market && market !== 'all') {
      if (/saddar.*mobile|mobile.*electronics|mobile.*trader/i.test(market)) {
        query.$or = [
          { isSaddarMobileLead: true },
          { place: { $regex: 'saddar.*mobile|mobile.*electronics|mobile.*trader', $options: 'i' } },
          { marketName: { $regex: 'saddar.*mobile|mobile.*electronics|mobile.*trader', $options: 'i' } },
          { marketId: { $in: ['saddar_mobile_electronics', 'saddar_mobile_traders_wholesalers'] } },
        ];
      } else {
        query.$or = [
          { place: market },
          { marketName: market },
          { marketId: market },
        ];
      }
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Business Type filter
    if (businessType && businessType !== 'all') {
      query.businessType = businessType;
    }

    // Quick filter presets
    if (filter === 'whatsapp_sent') {
      query.whatsappSent = true;
    } else if (filter === 'whatsapp_unsent') {
      query.$or = [{ whatsappSent: false }, { whatsappSent: { $exists: false } }, { whatsappSent: null }];
    } else if (filter === 'with_owner') {
      query.name = { $nin: ['N/A', '', null] };
    } else if (filter === 'with_alternates') {
      query.alternateNumbers = { $exists: true, $not: { $size: 0 } };
    } else if (filter === 'saddar') {
      query.$or = [
        { isSaddarMobileLead: true },
        { place: { $regex: 'saddar.*mobile|mobile.*electronics|mobile.*trader', $options: 'i' } },
        { marketName: { $regex: 'saddar.*mobile|mobile.*electronics|mobile.*trader', $options: 'i' } },
        { marketId: { $in: ['saddar_mobile_electronics', 'saddar_mobile_traders_wholesalers'] } },
      ];
    } else if (filter === 'wholesalers') {
      query.$or = [
        { isWholesalerOrTrader: true },
        { traderWholesaleScore: { $gte: 15 } },
        { businessType: { $regex: 'Wholesal|Trader', $options: 'i' } },
        { shopName: { $regex: 'trader|wholesale', $options: 'i' } },
      ];
    }

    const collection = db.collection(COLLECTIONS.MARKET_LEADS);

    let sortObj: Record<string, 1 | -1> = {
      whatsappSent: 1,
      isSaddarMobileLead: -1,
      traderWholesaleScore: -1,
      createdAt: -1,
      _id: -1,
    };

    if (sortParam === 'newest') {
      sortObj = { createdAt: -1, _id: -1 };
    } else if (sortParam === 'oldest') {
      sortObj = { createdAt: 1, _id: 1 };
    } else if (sortParam === 'wholesalers_first') {
      sortObj = { isSaddarMobileLead: -1, traderWholesaleScore: -1, whatsappSent: 1, createdAt: -1, _id: -1 };
    } else if (sortParam === 'recently_sent') {
      sortObj = { whatsappSentAt: -1, createdAt: -1, _id: -1 };
    } else {
      // Default: Never sent on top, Saddar Mobile Traders on top, with Wholesalers and Traders prioritized
      sortObj = { whatsappSent: 1, isSaddarMobileLead: -1, traderWholesaleScore: -1, createdAt: -1, _id: -1 };
    }

    // Run parallel count and query
    const [
      totalLeads,
      leads,
      totalCollectionCount,
      withOwnerCount,
      withAltsCount,
      whatsappSentCount,
      distinctMarkets,
      distinctCategories,
    ] = await Promise.all([
      collection.countDocuments(query),
      collection
        .find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments({}),
      collection.countDocuments({ name: { $nin: ['N/A', '', null] } }),
      collection.countDocuments({ alternateNumbers: { $exists: true, $not: { $size: 0 } } }),
      collection.countDocuments({ whatsappSent: true }),
      collection.distinct('place'),
      collection.distinct('category'),
    ]);

    const formattedLeads = leads.map((lead) => ({
      _id: lead._id.toString(),
      name: lead.name || 'N/A',
      shopName: lead.shopName || 'N/A',
      number: lead.number || '',
      cleanNumber: lead.cleanNumber || formatWhatsAppPhone(lead.number || ''),
      place: lead.place || lead.marketName || 'Karachi',
      marketId: lead.marketId || '',
      marketName: lead.marketName || lead.place || '',
      area: lead.area || '',
      category: lead.category || '',
      subCategory: lead.subCategory || '',
      businessType: lead.businessType || 'Wholesaler',
      address: lead.address || '',
      whatsappUrl: lead.whatsappUrl || (lead.cleanNumber ? `https://wa.me/${lead.cleanNumber}` : ''),
      whatsappSent: Boolean(lead.whatsappSent),
      whatsappSentAt: lead.whatsappSentAt || null,
      whatsappSentCount: typeof lead.whatsappSentCount === 'number' ? lead.whatsappSentCount : (lead.whatsappSent ? 1 : 0),
      lastWhatsappStatus: lead.lastWhatsappStatus || (lead.whatsappSent ? 'sent' : null),
      lastWhatsappMessage: lead.lastWhatsappMessage || '',
      lastWhatsappVariant: lead.lastWhatsappVariant || null,
      lastWhatsappError: lead.lastWhatsappError || null,
      traderWholesaleScore: typeof lead.traderWholesaleScore === 'number' ? lead.traderWholesaleScore : calculateTraderWholesaleScore(lead as any),
      isWholesalerOrTrader: Boolean(lead.isWholesalerOrTrader ?? isWholesalerOrTrader(lead as any)),
      isSaddarMobileLead: Boolean(lead.isSaddarMobileLead || /saddar.*mobile|mobile.*electronics|mobile.*trader/i.test(lead.place || lead.marketName || '')),
      alternateNumbers: lead.alternateNumbers || [],
      cleanAlternateNumbers: lead.cleanAlternateNumbers || [],
      alternateWhatsappUrls: lead.alternateWhatsappUrls || [],
      latitude: lead.latitude || null,
      longitude: lead.longitude || null,
      googleMapsUrl: lead.googleMapsUrl || '',
      source: lead.source || 'Scraped Market Data',
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
      markets: (distinctMarkets || []).filter(Boolean).sort(),
      categories: (distinctCategories || []).filter(Boolean).sort(),
      summary: {
        total: totalCollectionCount,
        withOwner: withOwnerCount,
        withAlternates: withAltsCount,
        whatsappSent: whatsappSentCount,
        whatsappUnsent: Math.max(0, totalCollectionCount - whatsappSentCount),
        marketsCount: (distinctMarkets || []).length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching market leads:', error);
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
    const {
      name,
      shopName,
      number,
      place,
      category = '🏬 General Retail & Commercial',
      businessType = 'Wholesaler',
      address = '',
      alternateNumbers = [],
    } = body;

    if (!shopName || typeof shopName !== 'string' || !shopName.trim()) {
      return NextResponse.json({ error: 'Shop Name is required' }, { status: 400 });
    }

    if (!number || typeof number !== 'string' || !number.trim()) {
      return NextResponse.json({ error: 'Phone Number is required' }, { status: 400 });
    }

    if (!place || typeof place !== 'string' || !place.trim()) {
      return NextResponse.json({ error: 'Market / Location is required' }, { status: 400 });
    }

    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.MARKET_LEADS);

    const cleanInputPhone = formatWhatsAppPhone(number.trim());
    const digitsOnlyInput = number.trim().replace(/\D/g, '');

    // Check for duplicate phone number
    const existingDuplicate = await collection.findOne({
      $or: [
        { cleanNumber: cleanInputPhone },
        { number: number.trim() },
      ],
    });

    if (existingDuplicate) {
      return NextResponse.json(
        {
          error: `A lead with phone number "${number.trim()}" already exists (${existingDuplicate.shopName || existingDuplicate.name}). Duplicate phone numbers are not allowed.`,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const score = calculateTraderWholesaleScore({ shopName, place, category, businessType });
    const newLeadDoc = {
      name: name && typeof name === 'string' && name.trim() ? name.trim() : 'N/A',
      shopName: shopName.trim(),
      number: number.trim(),
      cleanNumber: cleanInputPhone,
      place: place.trim(),
      marketName: place.trim(),
      category: category.trim(),
      businessType: businessType.trim(),
      address: address.trim(),
      traderWholesaleScore: score,
      isWholesalerOrTrader: score >= 15,
      whatsappSent: false,
      whatsappSentCount: 0,
      whatsappUrl: cleanInputPhone ? `https://wa.me/${cleanInputPhone}` : '',
      alternateNumbers: Array.isArray(alternateNumbers) ? alternateNumbers : [],
      source: 'Admin Portal Entry',
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
      message: 'Market lead created successfully',
    });
  } catch (error: any) {
    console.error('Error creating market lead:', error);
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
    const collection = db.collection(COLLECTIONS.MARKET_LEADS);

    const deleteResult = await collection.deleteOne({ _id: toObjectId(id) });

    if (deleteResult.deletedCount === 0) {
      return NextResponse.json({ error: 'Lead not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Market lead deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting market lead:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await checkAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { id, whatsappSent, action, note } = body;

    const db = await getDatabase();
    const collection = db.collection(COLLECTIONS.MARKET_LEADS);

    // Optional action: sync historical logs if requested
    if (action === 'sync_logs') {
      const logs = await db.collection(COLLECTIONS.WHATSAPP_LOGS).find({ status: 'sent' }).toArray();
      let syncedCount = 0;
      for (const log of logs) {
        if (!log.phone) continue;
        const res = await collection.updateMany(
          {
            $or: [{ cleanNumber: log.phone }, { number: log.phone }],
          },
          {
            $set: {
              whatsappSent: true,
              whatsappSentAt: log.sentAt || new Date(),
              lastWhatsappStatus: 'sent',
              lastWhatsappMessage: log.message || '',
              lastWhatsappVariant: log.variantIndex || 1,
              lastWhatsappError: null,
              updatedAt: new Date(),
            },
            $inc: { whatsappSentCount: 1 },
          }
        );
        syncedCount += res.modifiedCount;
      }
      return NextResponse.json({ success: true, syncedCount });
    }

    if (!id) {
      return NextResponse.json({ error: 'Lead ID is required' }, { status: 400 });
    }

    const now = new Date();
    const isSent = Boolean(whatsappSent);

    const updateDoc: any = {
      whatsappSent: isSent,
      lastWhatsappStatus: isSent ? 'sent' : null,
      updatedAt: now,
    };

    if (isSent) {
      updateDoc.whatsappSentAt = now;
      if (note) updateDoc.lastWhatsappMessage = note;
    }

    const result = await collection.updateOne(
      { _id: toObjectId(id) },
      {
        $set: updateDoc,
        ...(isSent ? { $inc: { whatsappSentCount: 1 } } : {}),
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Lead WhatsApp status updated to ${isSent ? 'Sent' : 'Unsent'}.`,
    });
  } catch (error: any) {
    console.error('Error updating market lead WhatsApp status:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

