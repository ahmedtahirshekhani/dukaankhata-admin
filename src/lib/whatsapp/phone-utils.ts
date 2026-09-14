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

export function replaceTemplateVariables(template: string, user: RecipientUser): string {
  let result = template || '';
  const vars: Record<string, string> = {
    name: user.name || 'Valued User',
    shopName: user.shopName || user.resolvedShopName || 'Your Shop',
    email: user.email || '',
    phone: user.phone || '',
    plan: user.subscription?.plan || user.plan || 'Free',
    expiresAt: user.subscription?.expiresAt || user.expiresAt || 'N/A',
    status: user.status || 'Active',
    monthlyRevenue: user.monthlyRevenue !== undefined ? `Rs. ${user.monthlyRevenue}` : 'Rs. 0',
  };

  Object.entries(vars).forEach(([key, val]) => {
    const reg = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(reg, val);
  });

  return result;
}
