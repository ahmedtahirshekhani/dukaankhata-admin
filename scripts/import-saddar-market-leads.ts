import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { formatWhatsAppPhone, isRealPersonName } from '../src/lib/whatsapp/phone-utils';
import { calculateTraderWholesaleScore } from '../src/lib/market-leads/scoring';

config({ path: resolve(__dirname, '..', '.env') });

const MONGODB_URL = process.env.MONGODB_URL || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'dukaankhata-admin-prod';

if (!MONGODB_URL) {
  console.error('ERROR: MONGODB_URL is missing in environment variables.');
  process.exit(1);
}

const shopKeywords = [
  'trader', 'traders', 'trading', 'mobile', 'mobiles', 'accessories', 'accesssories',
  'galaxy', 'express', 'xpress', 'zone', 'city', 'tech', 'communication', 'comunication',
  'enterprise', 'enterprises', 'pakistan', 'multisolution', 'multipower', 'network',
  'gadget', 'solutions', 'mall', 'outlet', 'store', 'center', 'centre'
];

function isShopName(name: string): boolean {
  const lower = name.toLowerCase();
  return shopKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(lower));
}

async function importLeads() {
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const marketLeadsCol = db.collection('market_leads');
    const leadsByMarketCol = db.collection('leads_by_market');

    const csvPath = resolve(__dirname, '../src/data/saddar_mobile_leads.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(1);

    console.log(`Read ${lines.length} lead entries from CSV.`);

    const PLACE_NAME = 'Saddar Mobile Market Traders & Wholesalers';
    const MARKET_ID = 'saddar_mobile_traders_wholesalers';
    const CATEGORY = '📱 Mobile Phones & Accessories';
    const BUSINESS_TYPE = 'Trader & Wholesaler';
    const AREA = 'Abdullah Haroon Road / Saddar Mobile Market';

    const now = new Date();
    const seen = new Set<string>();

    const bulkOpsMarketLeads: any[] = [];
    const bulkOpsLeadsByMarket: any[] = [];

    let idx = 0;
    for (const line of lines) {
      const firstComma = line.indexOf(',');
      if (firstComma === -1) continue;
      const rawName = line.substring(0, firstComma).trim();
      const rawNumber = line.substring(firstComma + 1).trim();

      let cleanNumber = '';
      if (rawNumber.startsWith('+44') || rawNumber.startsWith('44')) {
        cleanNumber = rawNumber.replace(/\D/g, '');
      } else {
        cleanNumber = formatWhatsAppPhone(rawNumber);
      }

      if (!cleanNumber || cleanNumber.length < 10) {
        console.warn(`Skipping invalid phone: ${rawName} - ${rawNumber}`);
        continue;
      }

      if (seen.has(cleanNumber)) {
        continue;
      }
      seen.add(cleanNumber);
      idx++;

      const isGeneric = /^mobile\s+market\s+wale\s+bhai$/i.test(rawName);

      let name = 'N/A';
      let shopName = 'Saddar Mobile Market';

      if (isGeneric) {
        name = 'N/A';
        shopName = 'Saddar Mobile Market';
      } else if (isShopName(rawName)) {
        name = 'N/A';
        shopName = rawName;
      } else if (isRealPersonName(rawName, 'Saddar Mobile Market')) {
        name = rawName;
        shopName = 'Saddar Mobile Market';
      } else {
        name = 'N/A';
        shopName = rawName;
      }

      let score = calculateTraderWholesaleScore({
        shopName,
        place: PLACE_NAME,
        category: CATEGORY,
        businessType: BUSINESS_TYPE,
      });

      // Priority boost for Saddar Mobile Market campaign leads
      score = Math.max(score, 25);
      if (name !== 'N/A') {
        score += 5; // Named leads get priority for higher conversion
      }

      const originalId = `saddar_mobile_lead_${String(idx).padStart(3, '0')}`;
      const createdAtStaggered = new Date(now.getTime() - idx * 1000);

      const doc = {
        name,
        shopName,
        number: rawNumber,
        cleanNumber,
        place: PLACE_NAME,
        marketName: PLACE_NAME,
        marketId: MARKET_ID,
        area: AREA,
        category: CATEGORY,
        subCategory: 'Mobile Wholesale & Trade',
        businessType: BUSINESS_TYPE,
        address: 'Saddar Mobile Market, Karachi',
        whatsappUrl: `https://wa.me/${cleanNumber}`,
        traderWholesaleScore: score,
        isWholesalerOrTrader: true,
        isSaddarMobileLead: true,
        priorityOrder: idx,
        alternateNumbers: [],
        cleanAlternateNumbers: [],
        alternateWhatsappUrls: [],
        source: 'Saddar Mobile Market Traders & Wholesalers Directory',
        originalId,
        updatedAt: now,
      };

      const setOnInsert = {
        whatsappSent: false,
        whatsappSentCount: 0,
        lastWhatsappStatus: null,
        createdAt: createdAtStaggered,
      };

      bulkOpsMarketLeads.push({
        updateOne: {
          filter: { cleanNumber },
          update: {
            $set: doc,
            $setOnInsert: setOnInsert,
          },
          upsert: true,
        },
      });

      bulkOpsLeadsByMarket.push({
        updateOne: {
          filter: { cleanNumber },
          update: {
            $set: doc,
            $setOnInsert: setOnInsert,
          },
          upsert: true,
        },
      });
    }

    console.log(`Executing bulkWrite for ${bulkOpsMarketLeads.length} leads in 'market_leads'...`);
    const resMarketLeads = await marketLeadsCol.bulkWrite(bulkOpsMarketLeads);
    console.log(`market_leads: Upserted ${resMarketLeads.upsertedCount}, Modified ${resMarketLeads.modifiedCount}, Matched ${resMarketLeads.matchedCount}`);

    console.log(`Executing bulkWrite for ${bulkOpsLeadsByMarket.length} leads in 'leads_by_market'...`);
    const resLeadsByMarket = await leadsByMarketCol.bulkWrite(bulkOpsLeadsByMarket);
    console.log(`leads_by_market: Upserted ${resLeadsByMarket.upsertedCount}, Modified ${resLeadsByMarket.modifiedCount}, Matched ${resLeadsByMarket.matchedCount}`);

    // Verify final count in database
    const totalMarketLeads = await marketLeadsCol.countDocuments();
    const saddarLeadsCount = await marketLeadsCol.countDocuments({
      $or: [
        { isSaddarMobileLead: true },
        { place: PLACE_NAME },
      ],
    });
    const unsentSaddarCount = await marketLeadsCol.countDocuments({
      $or: [
        { isSaddarMobileLead: true },
        { place: PLACE_NAME },
      ],
      $and: [
        { $or: [{ whatsappSent: false }, { whatsappSent: { $exists: false } }] }
      ]
    });

    console.log('\n--- IMPORT COMPLETED SUCCESSFULLY ---');
    console.log(`Total market_leads in DB: ${totalMarketLeads}`);
    console.log(`Saddar Mobile Market leads: ${saddarLeadsCount}`);
    console.log(`Unsent Saddar Mobile Market leads: ${unsentSaddarCount}`);

    // Also update the existing 29 scraped Saddar leads so they are marked with isSaddarMobileLead: true
    const updateScrapedRes = await marketLeadsCol.updateMany(
      { place: 'Saddar Mobile & Electronics Wholesale' },
      {
        $set: {
          isSaddarMobileLead: true,
          updatedAt: now,
        },
      }
    );
    console.log(`Updated ${updateScrapedRes.modifiedCount} previously scraped Saddar leads with isSaddarMobileLead flag.`);

    const totalAllSaddar = await marketLeadsCol.countDocuments({
      isSaddarMobileLead: true,
    });
    console.log(`Grand Total Saddar Mobile Market leads across DB: ${totalAllSaddar}`);

  } catch (error) {
    console.error('Import failed with error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

importLeads();
