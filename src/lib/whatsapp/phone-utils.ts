export interface RecipientUser {
  id?: string;
  _id?: string;
  name: string;
  phone?: string;
  shopName?: string;
  email?: string;
  plan?: string;
  expiresAt?: string;
  status?: string;
  monthlyRevenue?: number;
  category?: string;
  place?: string;
  market?: string;
  businessType?: string;
  address?: string;
  [key: string]: any;
}

export function formatWhatsAppPhone(phone: string): string {
  let clean = (phone || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('0092')) {
    clean = clean.slice(2);
  } else if (clean.startsWith('920')) {
    clean = `92${clean.slice(3)}`;
  } else if (clean.startsWith('0')) {
    clean = `92${clean.slice(1)}`;
  } else if (clean.length === 10 && clean.startsWith('3')) {
    clean = `92${clean}`;
  }
  return clean;
}

/**
 * Checks whether a given string is an actual individual human name,
 * rather than a placeholder, missing value, or a business/shop title.
 */
export function isRealPersonName(name?: string | null, shopName?: string | null): boolean {
  if (!name) return false;
  const clean = name.trim();
  if (!clean || clean.length < 2) return false;

  const lower = clean.toLowerCase();
  const placeholders = [
    'n/a',
    'na',
    'none',
    'null',
    'undefined',
    'unknown',
    'user',
    'merchant',
    'valued user',
    'valued merchant',
    'trader',
    'customer',
    'lead',
    'visit lead',
    'market lead',
    'test',
    'test merchant',
    'sample user',
  ];
  if (placeholders.includes(lower)) return false;

  // If the name is identical to the shop name, it's not an individual person's name
  if (shopName && lower === shopName.trim().toLowerCase()) return false;

  // If the name contains typical business / shop suffixes
  const businessIndicators = [
    'store',
    'stores',
    'trader',
    'traders',
    'mart',
    'marts',
    'shop',
    'center',
    'centre',
    'enterprise',
    'enterprises',
    'corporation',
    'corp',
    'motors',
    'auto',
    'autos',
    'hardware',
    'cloth',
    'fabrics',
    'electric',
    'electronics',
    'mill',
    'mills',
    'agency',
    'agencies',
    'company',
    'co.',
    'khata',
  ];
  const words = lower.split(/[\s,.-]+/);
  if (words.some((w) => businessIndicators.includes(w))) return false;

  return true;
}

export function replaceTemplateVariables(template: string, user: RecipientUser): string {
  let result = template || '';

  const rawShop = (user.shopName || user.resolvedShopName || '').trim();
  const shopBase =
    rawShop && !['n/a', 'na', 'none', 'your shop', 'shop'].includes(rawShop.toLowerCase())
      ? rawShop
      : 'Dukan';

  const shopWaleBhai = /wale\s+bhai$/i.test(shopBase)
    ? shopBase
    : `${shopBase} wale bhai`;

  const hasName = isRealPersonName(user.name, user.shopName);

  if (hasName) {
    // When we know the real name, {name} is replaced by the actual person's name
    result = result.replace(/\{name\}/gi, user.name!.trim());
  } else {
    // When name is not known, do NOT add a name to the message:
    // Replace "{name} bhai", "{name} sahib", "{name} bhaiya", etc. with "{shop_name} wale bhai"
    // to avoid awkward phrasing like "{shop_name} wale bhai bhai"
    result = result.replace(/\{name\}\s+(bhai|sahib|bhaiya|janab)/gi, shopWaleBhai);
    // Replace any standalone {name} with "{shop_name} wale bhai"
    result = result.replace(/\{name\}/gi, shopWaleBhai);
  }

  const rawPlace = user.place || user.marketName || 'Karachi';
  const cleanPlace = rawPlace.replace(/\s+(traders?\s*&\s*wholesalers?|wholesale.*)$/i, '').trim() || rawPlace;

  // Standard variables
  const vars: Record<string, string> = {
    shopName: shopBase,
    email: user.email || '',
    phone: user.phone || '',
    plan: user.subscription?.plan || user.plan || 'Free',
    expiresAt: user.subscription?.expiresAt || user.expiresAt || 'N/A',
    status: user.status || 'Active',
    monthlyRevenue: user.monthlyRevenue !== undefined ? `Rs. ${user.monthlyRevenue}` : 'Rs. 0',
    category: user.category || 'Commercial Business',
    place: cleanPlace,
    market: cleanPlace,
    businessType: user.businessType || 'Trader / Wholesaler',
    address: user.address || 'Karachi',
  };

  Object.entries(vars).forEach(([key, val]) => {
    const reg = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(reg, val);
  });

  return result;
}

export function parseSpintax(text: string): string {
  if (!text) return '';
  return text.replace(/\{([^{}]+)\}/g, (match, choicesStr) => {
    if (choicesStr.includes('|')) {
      const choices = choicesStr.split('|');
      return choices[Math.floor(Math.random() * choices.length)].trim();
    }
    return match;
  });
}
