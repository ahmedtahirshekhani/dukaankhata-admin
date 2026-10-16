/**
 * Market Leads Priority & Scoring Helper
 * Evaluates commercial relevance, identifying genuine Wholesalers, Traders, Distributors, and Impex businesses.
 */

export interface MarketLeadScoreInput {
  shopName?: string;
  place?: string;
  marketName?: string;
  category?: string;
  businessType?: string;
}

export function calculateTraderWholesaleScore(lead: MarketLeadScoreInput): number {
  const name = (lead.shopName || '').toLowerCase();
  const place = (lead.place || lead.marketName || '').toLowerCase();
  const cat = (lead.category || '').toLowerCase();
  const type = (lead.businessType || '').toLowerCase();

  // Non-commercial consumer retail / dining exclusions (Score: 0)
  const isConsumerService =
    /\b(restaurant|dining|cafe|juice|burger|pizza|bun kabab|tikka|fast food|bakery|bakes|chai|hotel|games|gaming|club|snooker|salon|parlour|parlor|beauty|barber|transport|pick & drop|fitness|gym)\b/i.test(name) ||
    /restaurant|dining|cafe|juice|fast food/i.test(cat);

  if (isConsumerService) {
    return 0;
  }

  let score = 5; // Base commercial merchant score

  // 1. Explicit Trader / Wholesaler terms in shop name (+15 points)
  if (/\b(trader|traders|trading|wholesale|wholesaler|wholesalers)\b/i.test(name)) {
    score += 15;
  } else if (/trader|wholesale/i.test(name)) {
    score += 12;
  }

  // 2. Commercial Wholesale / Distribution terminology in name (+8 points)
  if (
    /\b(distributor|distributors|distribution|importer|importers|exporter|exporters|impex|stockist|stockiest|agency|agencies|enterprise|enterprises|corporation|corp|supplies|supply|suppliers)\b/i.test(
      name
    )
  ) {
    score += 8;
  }

  // 3. Wholesale goods / trade commodities in name (+6 points)
  if (
    /\b(cloth|fabrics|fabric|textile|textiles|garments|hardware|steel|iron|timber|wood|plywood|paper|chemical|chemicals|auto parts|autos|spare parts|electronics|electric|machinery|plastic|polymers|commodities|rice|flour|pulses|grain|oil|mobile|mobiles|accessories|gadgets)\b/i.test(
      name
    )
  ) {
    score += 6;
  }

  // 4. Major Wholesale Hubs in place / market (+5 to +8 points)
  if (
    /saddar.*mobile|mobile.*market|star city|amma tower/i.test(place)
  ) {
    score += 8;
  } else if (
    /jodia|bolton|gordhandas|cochinwala|cloth|timber|paper|steel|hardware|light house|plaza|shershah|urdu bazaar|marriot|chemical|saddar/i.test(
      place
    )
  ) {
    score += 5;
  }

  // 5. Category / BusinessType signals (+4 points)
  if (/wholesal/i.test(cat) || /wholesal/i.test(type)) {
    score += 4;
  }
  if (/trader/i.test(type) || /distributor/i.test(type)) {
    score += 3;
  }

  return score;
}

export function isWholesalerOrTrader(lead: MarketLeadScoreInput): boolean {
  return calculateTraderWholesaleScore(lead) >= 15;
}
