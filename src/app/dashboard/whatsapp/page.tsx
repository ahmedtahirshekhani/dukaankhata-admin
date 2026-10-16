'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Users,
  Search,
  Filter,
  Info,
  Clock,
  Sparkles,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Zap,
  Check,
  Ban,
  Shield,
  Dices,
  Shuffle,
  Plus,
  Trash2,
  StopCircle,
  Coffee,
  Store,
  ShoppingBag,
  Tag,
  Layers,
  Calendar,
  Flame,
  Sun,
  Moon,
} from 'lucide-react';
import { formatDisplayDate, formatTimeAgo } from '@/lib/format-date';
import { formatWhatsAppPhone, parseSpintax, replaceTemplateVariables, isRealPersonName } from '@/lib/whatsapp/phone-utils';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  shopName?: string;
  phone?: string;
  lastWaMessageSentAt?: string;
  subscription?: {
    plan?: string;
    status?: string;
    expiresAt?: string;
  };
  monthlyRevenue?: number;
  createdAt?: string;
  lastActivity?: string;
  category?: string;
  businessType?: string;
  market?: string;
  place?: string;
  address?: string;
  whatsappSent?: boolean;
  whatsappSentAt?: string;
  whatsappSentCount?: number;
  lastWhatsappStatus?: string;
  traderWholesaleScore?: number;
  isWholesalerOrTrader?: boolean;
  isSaddarMobileLead?: boolean;
  marketName?: string;
}

export type TargetFilterType =
  | 'all'
  | 'new7'
  | 'active'
  | 'pro'
  | 'free'
  | 'suspended'
  | 'custom'
  | 'inactive7'
  | 'inactive15'
  | 'inactive30'
  | 'inactive90'
  | 'potential_leads'
  | 'market_leads'
  | 'saddar_mobile';

interface WhatsAppStatusState {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';
  qrCodeUrl: string | null;
  phoneNumber: string | null;
  userName: string | null;
  error: string | null;
  connectedAt: string | null;
}

interface SendLog {
  phone: string;
  name: string;
  success: boolean;
  error?: string;
  sentAt?: string;
}

export interface CategoryPreset {
  id: string;
  categoryKeys: string[];
  title: string;
  badge: string;
  description: string;
  variants: string[];
}

const TEMPLATE_VARIABLES = [
  { label: 'Name', tag: '{name}' },
  { label: 'Shop Name', tag: '{shopName}' },
  { label: 'Category', tag: '{category}' },
  { label: 'Market / Place', tag: '{place}' },
  { label: 'Business Type', tag: '{businessType}' },
  { label: 'Email', tag: '{email}' },
  { label: 'Plan', tag: '{plan}' },
  { label: 'Expiry Date', tag: '{expiresAt}' },
  { label: 'Revenue', tag: '{monthlyRevenue}' },
  { label: 'Spintax Greeting', tag: '{Assalam o Alaikum|Hello|Salam}' },
];

export const WEEKDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Assalam o Alaikum {name} bhai! Umeed hai dukan aur karobar behtareen chal raha hoga.\n\nOnline market par {shopName} dekhi thi. Hum jante hain ke {place} mein saara din gahakon ka rush aur udhaar ka hisaab sambhalna kitna mushkil kaam hai - purane registeron par likhte likhte hath dukh jata hai aur parcha ghum hone ka darr rehta hai.\n\nDukaanKhata app se aap ka saara hisaab kitaab ungliyon par hoga. Har transaction ka safe record banta hai aur customer ko automatic WhatsApp payment reminder bhej kar udhaar ki recovery 3 guna tez ho jati hai!\n\n📲 App link: https://dukaankhata.app\nFree setup ke liye rabta karein:\nKashan: 0335-2575725 | Hammad: 0335-2787275\nAllah aap ke karobar mein barkat ataa farmaye!',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nRaat ko dukan band karne ke baad hisaab kitaab tally karne mein ghanton lagte the? {shopName} ke liye ab purane registeron se azaadi payein.\n\nDukaanKhata app ke sath rozana ki total sales, khareedari aur udhaar sirf 2 minute mein final ho jata hai. Shutter girayein aur baghair kisi tension ke time par ghar ja kar sukoon karein!\n\nAap ki shop online market par dekhi thi.\n📲 Aaj hi download karein: https://dukaankhata.app\nDirect guidance: 0335-2575725',
  'Assalam o Alaikum {name} sahib, umeed hai aap khairiyat se honge.\n\nKarobaari bhaiyon ka sab se bada masla: "Customer se udhaar mangte hue sharm aati hai aur taaluqat kharab hone ka darr hota hai."\n\nDukaanKhata se ab aap {shopName} ke customers ko ek click par ba-izzat aur professional WhatsApp reminder bhej sakte hain. Udhaar ki recovery bhi waqt par hogi aur gahak se taaluqat bhi khushgawar rahenge!\n\nOnline market se aap ka rabta mila tha.\n📲 App link: https://dukaankhata.app\nHelp chahiye ho toh call karein: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nDukaanKhata par aap sirf retail customers ka nahi balkay apne wholesale suppliers aur maal khareedari ka hisaab bhi ba-asani manage kar sakte hain. {place} ke tamam mandi traders aur dukaandaron ke liye ye behtareen sahulat hai.\n\nNa kisi computer ki zaroorat hai na accounting course ki - saaf shaffaf Urdu mein poori dukan aap ke mobile mein!\n\n📲 Free download: https://dukaankhata.app\n{shopName} ko digital banane mein hum aap ki madad karenge:\nKashan: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nPurane register bheege ka khadsha, safha phatne ya diary gum hone ka darr hamesha rehta hai. Lekin DukaanKhata par {shopName} ka ek ek rupaye ka hisaab 100% cloud par mehfooz rehta hai.\n\nAgar mobile kharab ya tabdeel bhi ho jaye toh aap ka data hamesha mehfooz rehta hai - naye mobile mein login karte hi pura hisaab wapas aa jata hai.\n\nOnline market platform par aap ka karobaar dekha tha.\n📲 Try karein: https://dukaankhata.app\nDemo ke liye WhatsApp karein: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nSirf rozana ke 2 minute aap ko maheene ke aakhir mein lakho rupaye ke hisaab ki tension aur ghalat fehmiyon se bacha sakte hain. DukaanKhata kholein, customer ka naam likhein aur udhaar darj karein.\n\nKarachi ki mandi aur {place} ke karobaari bhai tez tareen dhandhe ke liye DukaanKhata par shift ho rahe hain. {shopName} ka hisaab bhi digital karein!\n\n📲 App download: https://dukaankhata.app\nDirect support line: 0335-2575725',
  'Assalam o Alaikum {name} sahib!\n\nSubah se raat tak dukan par baith kar halal rizq kamana ibadat hai. Hum chahte hain ke hisaab kitaab ki bhool chook se aap ka ek rupaya bhi zaya na ho.\n\nJab customer ko {shopName} ke naam se professional PDF ledger statement aur bill jata hai toh dukan ka mayaar aur customer ka aetimad barhta hai.\n\n📲 Check karein: https://dukaankhata.app\nFree setup aur app demo ke liye rabta karein:\nKashan: 0335-2575725 | Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nAaj ke daur mein tezi se hisaab kitaab karna hi kamyabi hai. Purane bahi khate mein customer ka safha dhoondne mein 10 minute lagte the, DukaanKhata mein sirf 5 second mein pura khata screen par samne hota hai.\n\n{place} mein aap ki shop online dekhi thi. Farq khud dekhein:\n📲 https://dukaankhata.app\n\nDirect call/WhatsApp: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nAgar aap ko lagta hai ke purane register se mobile app par aana mushkil hoga, toh bilkul fikar na karein. Hamari team phone par ya {place} mein aap ki dukan par aa kar pura hisaab transfer karne mein FREE madad karegi.\n\n{shopName} hamare liye qeemti hai. Ek baar zaroor aazmayein!\n📲 App link: https://dukaankhata.app\nKashan: 0335-2575725 | Hammad: 0335-2787275\nKhush rahein aur aage badhein!',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nDukan par kaam dhandha tez ho aur hisaab kitaab bilkul saaf shaffaf rahe, iss se badi zehni sukoon ki koi baat nahi.\n\nDukaanKhata app khas tor par aap jaise mehnti traders aur dukaandaron ke liye banayi gayi hai. Aaj hi {shopName} ki pehli digital entry karein aur purane registers se hamesha ke liye azaadi payein.\n\n📲 Link: https://dukaankhata.app\nOnline market se aap ka rabta mila tha. Helpline: 0335-2575725',
];

export const SUNDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Assalam o Alaikum {name} bhai! Umeed hai khariyat se honge.\n\nAaj Sunday hai - subah se raat dukan ki bhag dor ke baad aaj ka din sakoon se apni family aur bacchon ke sath guzarein. {shopName} ke khate aur registeron ki chinta ab chhor dein.\n\nKal peer se jab {place} mein kaam dhandha dobara shuru hoga toh DukaanKhata par ek click mein hisaab kitaab hoga taake aap ka qeemti waqt bache aur shaam ko jaldi ghar ja sakein.\n\n📲 App link: https://dukaankhata.app\nKoi bhi help chahiye ho toh hum hamesha hazir hain:\nKashan: 0335-2575725 | Hammad: 0335-2787275\n\nApna aur ghar walon ka khayal rakhein!',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nEk karobaari bhai ki mehnat wahi samajh sakta hai jo subah pehle shutter uthata hai aur raat ko thak haar kar sab se aakhir mein ghar jata hai.\n\nHumne DukaanKhata isi liye banaya hai ke {shopName} ka udhaar aur ledger sambhalne mein aap ki raatein na kharab hon. Aaj Sunday sakoon se aaram karein. Kal se dukan ka hisaab digital karein, taake dukan ke baad ka waqt aap ke apno aur bacchon ke liye bache.\n\nOnline market par aap ki shop dekhi thi: https://dukaankhata.app\nHumari team se rabta karein: 0335-2575725',
  'Assalam o Alaikum {name} bhai, kya haal hain?\n\nAaj Sunday hai - sakoon se chai piyen, aaraam karein aur family ko pura waqt dein. Kal subah se phir wahi mandi, gahak aur kaam dhandha shuru hoga.\n\nLekin iss baar farq ye hoga ke {shopName} ka hisaab purane registeron mein gum nahi hoga, seedha DukaanKhata app mein mehfooz rahega. Dil laga kar mehnat karein, hisaab kitaab ki tension humari!\n\n📲 Check karein: https://dukaankhata.app\n{place} ke karobar mein taraqqi ki duayein. Rabta: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} sahib, umeed hai sab khairiyat hogi.\n\nDukaan chalana asaan kaam nahi - saara din customer dealing aur phir raat ko hisaab mein ulajh jana. DukaanKhata ka maqsad ye hai ke {shopName} ka ek ek rupaye ka hisaab ungliyon par ho aur aap ka dimaag bilkul pursukoon rahe.\n\nAaj Sunday chhutti ka din sukoon se enjoy karein. Jab kal dukan band kar ke ghar jayein toh chehre par thakan nahi balkay bacchon ke liye muskurahat ho. Khush rahein aur aage badhein!\n\n📲 App link: https://dukaankhata.app\nHelp line: 0335-2575725 / 0335-2787275',
  'Assalam o Alaikum {name} bhai!\n\nDukaandaar hi dukaandaar ka dard samajhta hai. Log kehte hain dukan par baithna asaan hai, lekin udhaar mangne ki jhijhak aur register ke page palatne ki sar dard sirf karobaari janta hai.\n\nAaj Sunday hai, hisaab ki fikar chhoriye aur family ke sath waqt guzariye. Kal se {shopName} par customer ko automatic WhatsApp payment reminder jayegi, izzat ke sath recovery hogi. Kal se kaam dhandha aur bhi aasan ho jayega InshaAllah.\n\n📲 Download: https://dukaankhata.app\nKashan: 0335-2575725',
  '{Assalam o Alaikum|Salam} {name}!\n\nAaj Sunday chhutti ka din hai - thoda sukoon karein aur aane wale pure hafte ke liye khud ko recharge karein. Kal se naye jazbay ke sath kaam dhandha shuru hoga!\n\n{shopName} ka hisaab kitaab pehle se 10 guna tez aur accurate hoga. Na koi parcha phatne ka darr, na register bheege ka khadsha. {place} ke tamam karobaari bhaiyon ke liye free demo dastiyab hai:\n📲 https://dukaankhata.app\nKashan: 0335-2575725 | Hammad: 0335-2787275',
  'Assalam o Alaikum {name} bhai, Allah Ta\'ala aap ke karobaar aur {shopName} mein be-hisaab barkat ataa farmaye.\n\nHalal rozi ki koshish ibadat hai. Hum chahte hain ke hisaab ki choti choti bhool chook se aap ka ek rupaya bhi zaya na ho. Aaj Sunday ka din sukoon se family ke sath guzaarein, kal subah jab dukaan khule gi toh DukaanKhata aap ka digital sathi hoga.\n\n📲 Free app: https://dukaankhata.app\nKoi bhi sawaal ho toh Kashan (0335-2575725) ya Hammad (0335-2787275) ko WhatsApp karein.',
  '{Assalam o Alaikum|Salam} {name} bhai, kaisay hain aap?\n\nEk sach bataon? Zindagi mein sab se qeemti cheez waqt aur zehni sukoon hai. Poora hafta mehnat ke baad aaj Sunday family time enjoy karein, kal se phir dukan aur rozi roti ka silsila.\n\nLekin ab {shopName} ka hisaab 2 minute mein final hoga, registeron par ghanton sar khapana band. {place} ke wholesale & retail bhaiyon ke sath DukaanKhata hamesha khara hai.\n\n📲 Visit: https://dukaankhata.app\nKabhi bhi madad chahiye ho: 0335-2575725',
  'Assalam o Alaikum {name}! Aaj Sunday chhutti ka din hai, mazeedaar nashta karein aur ghar walon ko time dein.\n\nKaam dhandha kal se dobara dhoom dham se shuru karenge! {shopName} ka sara khata ab DukaanKhata par 100% safe cloud par hoga. Ek bhai ki tarah hum aap ke sath khare hain, koi bhi masla aaye toh bila jhijhak call kar lena:\n📲 https://dukaankhata.app\n0335-2575725 / 0335-2787275\n\nBohot bohot duayein aap ke liye!',
  '{Assalam o Alaikum|Salam} {name} bhai, poore hafte ki thakan ke baad aaj family ke sath relaxing Sunday guzarein.\n\nKarachi ka karobaar asan nahi, par aap jaise mehnti bhaion ki wajah se hi ye shehar chalta hai. Kal se jab {shopName} khule gi toh purane tareeqe chhoriye aur modern dhandha kariye! DukaanKhata app try karein aur registeron se azaadi payein.\n\n📲 https://dukaankhata.app\nHumari team har qadam par aap ke sath hai: 0335-2575725',
];

export const SATURDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Assalam o Alaikum {name} bhai! Umeed hai hafte ka karobar behtareen chal raha hoga.\n\nAaj Saturday hai - market mein rush aur counter par tezi ka din! Lekin sab se bada masla raat ko dukan badhane ke baad weekly hisaab kitaab tally karna aur gahakon ka udhaar yaad rakhna hota hai.\n\nDukaanKhata app se aap ka saara hafte ka ledger ek click par ready ho jata hai. Gahakon ko automatic WhatsApp payment reminder bhejein taake kal Sunday se pehle udhaar ki recovery ho sake!\n\n📲 Free app: https://dukaankhata.app\nHelp ke liye rabta karein:\nKashan: 0335-2575725 | Hammad: 0335-2787275\nAllah aap ke karobar mein barkat de!',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nSaturday night ko dukan band karne ke baad register ke panne palat-te palat-te raat ke 12 baj jate hain? {shopName} ke liye ab iss thakan se nijaat payein!\n\nDukaanKhata ke sath aaj pure hafte ki sales, khareedari aur udhaar sirf 2 minute mein final karein. Shutter girayein aur time par sukoon se ghar ja kar kal Sunday chhutti enjoy karein!\n\n📲 Aaj hi try karein: https://dukaankhata.app\nDirect guidance: 0335-2575725',
  'Assalam o Alaikum {name} sahib, umeed hai aap khairiyat se honge.\n\nKarobaari bhaiyon ke liye Saturday sab se ahem din hota hai: "Hafte bhar ka udhaar recover karna aur suppliers ka hisaab barabar karna."\n\nDukaanKhata se ab aap {shopName} ke tamaam udhaar customers ko ba-izzat WhatsApp payment reminder bhej kar aaj hi recovery kar sakte hain, taake kal bank aur market band hone se pehle aap ka paisa aap ke paas ho!\n\n📲 App link: https://dukaankhata.app\nSupport line: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nSaturday ke rush mein bahi khate par likhne ka time nahi milta aur parcha ghum hone ka darr rehta hai? DukaanKhata par mobile se sirf 5 second mein entry ho jati hai.\n\n{place} ke sekron traders Saturday ki tez tareen sales ke liye DukaanKhata par shift ho chuke hain. {shopName} ka hisaab bhi digital karein!\n\n📲 Free download: https://dukaankhata.app\nHelp line: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nPure hafte ki mehnat ke baad aaj Saturday sham ko register bahi khata dekh kar sar dukhne lagta hai? DukaanKhata par ek button dabayein aur pure hafte ka PDF ledger tayyar!\n\nNa kisi computer ki zaroorat na kisi munshi ki - poori dukan aap ke mobile mein. Kal Sunday sukoon se guzarein!\n\n📲 Try karein: https://dukaankhata.app\nDemo ke liye WhatsApp karein: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nSaturday ko sab se zaroori kaam: Wholesale distributors aur suppliers ke bahaal ka hisaab clear karna. DukaanKhata par aap customers ke sath sath suppliers ka khata bhi alag se manage kar sakte hain.\n\n{shopName} ka har paisa hisaab mein rahega aur koi ghalat fehmi nahi hogi!\n\n📲 Download: https://dukaankhata.app\nKashan: 0335-2575725',
  'Assalam o Alaikum {name} sahib!\n\nSaturday night par shutter girate waqt dil mein sukoon hona chahiye ke hisaab kitaab bilkul saaf shaffaf hai. DukaanKhata par data 100% cloud par mehfooz rehta hai - mobile kharab hone par bhi record ghum nahi hota.\n\n{shopName} ko digital banayein aur kal Sunday chhutti tension-free guzarein.\n📲 https://dukaankhata.app\nRabta: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nAaj hafte ki shaam hai - customer payment mangne par aana kaani kare toh professional PDF bill WhatsApp karein. Jab customer ko receipt milti hai toh wo ba-khushi foran udhaar clear karta hai.\n\n{place} ke karobaari bhaiyon ke liye best tool! Farq khud dekhein:\n📲 https://dukaankhata.app\nCall/WhatsApp: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nPure hafte dukan chalane ke baad agar Saturday raat ko hisaab mein 2000 rupaye ki bhi bhool chook ho jaye toh bohot dukh hota hai. DukaanKhata mein ek ek pai ka automated hisaab rehta hai.\n\n{shopName} ke digital safar mein hum aap ki madad karenge. Free app download karein:\n📲 https://dukaankhata.app\nKashan: 0335-2575725 | Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nSaturday market closing ko aasan banayein! DukaanKhata app khas tor par Karachi ki mandiyon aur {place} ke dukaandaron ke liye design ki gayi hai. Aaj hi pehla khata add karein aur registeron ki chinta se hamesha ke liye azaadi payein.\n\n📲 Link: https://dukaankhata.app\nHelpline: 0335-2575725',
];

export const FRIDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Jumma Mubarak {name} bhai! Allah Ta\'ala aap ke karobar aur {shopName} mein be-panah barkat ataa farmaye.\n\nJumma ka mubarak din hai - halal rozi ki koshish ibadat hai. Hisaab kitaab saaf aur shaffaf rakhna Sunnat hai. DukaanKhata app se aap ka pura bahi khata bina kisi bhool chook ke 100% accurate rehta hai.\n\n📲 Free app: https://dukaankhata.app\nSetup mein koi madad chahiye ho toh hamesha hazir hain:\nKashan: 0335-2575725 | Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, Jumma Mubarak!\n\nJumma ki namaz ke waqt dukan jaldi band karni hoti hai aur sham ko dobara kholni hoti hai. DukaanKhata se cash aur sales ka hisaab sirf 1 minute mein verify ho jata hai.\n\n{shopName} ko purane registeron ke jhanjhat se nijaat dilayein.\n📲 Link: https://dukaankhata.app\nDirect contact: 0335-2575725',
  'Jumma Mubarak {name} sahib! Umeed hai aap aur ghar wale khairiyat se honge.\n\nKarobaari barkat ka raaz ye hai ke kisi customer ka haq na mare aur na aap ka ek rupaya doobe. DukaanKhata par har transaction ka time-stamped record banta hai aur customer ko ba-izzat WhatsApp reminder jata hai.\n\nOnline market platform par aap ki shop dekhi thi.\n📲 Download: https://dukaankhata.app\nHelpline: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, Jumma Mubarak!\n\nJumma ke din apne karobar ki kamyabi ke liye duayein karein aur dukan ko digital banayein. {place} ke be-shumar dukaandar DukaanKhata use kar ke apna qeemti waqt bacha rahe hain.\n\n{shopName} ke liye aaj hi install karein:\n📲 https://dukaankhata.app\nGuidance: 0335-2575725',
  'Jumma Mubarak {name} bhai! Aaj ke ba-barkat din par {shopName} ka hisaab digital karein.\n\nAgar purane register se mobile par data transfer karna mushkil lage toh fikar na karein - hamari team call par ya dukan par aa kar free setup karwayegi.\n\n📲 App link: https://dukaankhata.app\nKashan: 0335-2575725 | Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, Jumma Mubarak!\n\nJumma ke baad weekend ka rush shuru hone wala hai. Kal Saturday se pehle apna udhaar khata DukaanKhata par organize karein taake rush ke dauran koi entry miss na ho.\n\n📲 Free setup: https://dukaankhata.app\nHelpline: 0335-2575725',
  'Jumma Mubarak {name} sahib! Allah aap ke rizq mein farakhi aur barkat ataa farmaye.\n\nDukaanKhata Urdu mein asaan tareen app hai jo aap ke mobile mein puri dukan ka record mehfooz rakhti hai. Na computer ki zaroorat na accounting course ki.\n\n📲 Check karein: https://dukaankhata.app\nRabta: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, Jumma Mubarak!\n\nJab hisaab kitaab saaf ho toh dimaag pursukoon rehta hai aur ibadat mein bhi dil lagta hai. DukaanKhata par {shopName} ka har khata 100% cloud par safe rehta hai.\n\n📲 Try karein: https://dukaankhata.app\nKashan: 0335-2575725',
  'Jumma Mubarak {name} bhai! Aaj Jumma par apne karobar ko nayi raftaar dein. Customers ko automatic WhatsApp payment reminders bhejein aur udhaar ki recovery 3 guna tez karein.\n\n{place} ke karobaari bhaiyon ke liye free sahulat!\n📲 https://dukaankhata.app\n0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, Jumma Mubarak! Dua hai ke Allah Ta\'ala aap ke dhandhe mein be-misaal barkatein dalein aur aap ki dukan khoob phale phoole. DukaanKhata hamesha aap ke sath khara hai.\n\n📲 https://dukaankhata.app\nHelpline: 0335-2575725',
];

export const MONDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Assalam o Alaikum {name} bhai! Peer ka din mubarak aur naye hafte ka aaghaaz pur-umeed ho!\n\nMonday subah se hi mandi aur {place} mein naye maal ki supply aur karobar ki dhoom shuru ho chuki hai. Iss hafte purane registeron se chhutkara payein aur pehle din se hi DukaanKhata par hisaab digital karein!\n\n📲 App link: https://dukaankhata.app\nFree demo & setup: Kashan: 0335-2575725 | Hammad: 0335-2787275\nAllah pure hafte aap ke karobar mein barkat ataa farmaye!',
  '{Assalam o Alaikum|Salam} {name} bhai, naya hafta mubarak!\n\nMonday morning sab se behtareen waqt hota hai pure hafte ki udhaar recovery plan karne ka. DukaanKhata par ek click se un customers ki list samne aa jati hai jin se payment leni hai.\n\n{shopName} ki recovery tez banayein:\n📲 https://dukaankhata.app\nDirect call: 0335-2575725',
  'Assalam o Alaikum {name} sahib, umeed hai Sunday sukoon se guzra hoga aur ab naye jazbay ke sath Monday shuru ho raha hai!\n\nJab subah dukan kholein toh hisaab kitaab ka pura control ungliyon par hona chahiye. DukaanKhata kholein aur rozana ki sales aur khareedari register karein.\n\nOnline market par aap ka karobaar dekha tha.\n📲 https://dukaankhata.app\nHelp: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai! Peer ka din hai - naye hafte ka pehla din.\n\nSuppliers se naya stock mangwana hai? Wholesale khareedari ka hisaab DukaanKhata par darj karein taake supplier ki ek ek payment ka record time par clear rahe.\n\n{shopName} ko modern banayein:\n📲 Download: https://dukaankhata.app\nKashan: 0335-2575725',
  'Assalam o Alaikum {name} bhai! Naye hafte mein purani galtiyan nahi dohrani - register ke phatte panne aur khoe hue parche ab maazi ki baat hain.\n\nDukaanKhata par {shopName} ka record 100% cloud safe hai. Aaj Monday se nayi digital shuruat karein!\n\n📲 Try free: https://dukaankhata.app\nRabta: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, Monday morning greeting!\n\nKarachi ka karobaar subah se tez raftaar hota hai. Tezi se entry karein aur customer ko counter par zyada intezar na karwayein. DukaanKhata sirf 5 second mein entry save karta hai.\n\n{place} ke traders ke liye behtareen app:\n📲 https://dukaankhata.app\n0335-2575725',
  'Assalam o Alaikum {name} sahib! Monday se Saturday tak dukan ki bhag dor aasan ho sakti hai agar dukan ka hisaab digital ho.\n\nSham ko dukan badhate waqt sirf 2 minute mein daily summary screen par hogi. Aazma kar dekhein:\n📲 https://dukaankhata.app\nKashan: 0335-2575725 / Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai! Naya hafta, naye gahak aur naya dhandha! Allah Ta\'ala aap ke karobar aur {shopName} mein be-hisaab rizq ataa farmaye.\n\nDukaanKhata app free install karein aur registeron se hamesha ke liye azaadi payein:\n📲 https://dukaankhata.app\nHelp line: 0335-2575725',
  'Assalam o Alaikum {name} bhai! Agar Monday subah hi pichle hafte ka udhaar recover ho jaye toh naya maal khareedna kitna aasan ho jata hai! DukaanKhata se customer ko WhatsApp reminder bhejein aur farq dekhein.\n\n📲 App link: https://dukaankhata.app\n0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, have a profitable week ahead! Hamari team har qadam par aap ke sath hai. Kisi bhi maslay par bila jhijhak rabta karein:\n\n📲 https://dukaankhata.app\nKashan: 0335-2575725 | Hammad: 0335-2787275\nKhush rahein aur aage badhein!',
];

export const TUESDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Assalam o Alaikum {name} bhai! Mangal ka din mubarak ho.\n\nMonday ke baad aaj Mangal ko {place} mein wholesale maal ki delivery aur dukandaron ki aamad zor pakadti hai. Tez gahaki ke dauran purane register par likhna mushkil ho jata hai aur baaz auqat entry chhoot jati hai.\n\nDukaanKhata app se aap counter par khare khare sirf 5 second mein entry save kar sakte hain. Customer ko automated WhatsApp alert chala jata hai aur aap ka khata 100% update rehta hai!\n\n📲 App link: https://dukaankhata.app\nFree setup & demo ke liye rabta karein:\nKashan: 0335-2575725 | Hammad: 0335-2787275\nAllah aap ke karobar mein barkat dale!',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nMangal ke din dukan par cash circulation aur stock rotation tez hoti hai. Lekin agar udhaar ka hisaab yaad na rahe toh sara munafa phans jata hai.\n\n{shopName} ke liye DukaanKhata app download karein - ek click par pata chal jata hai kis customer se kitna vasool karna hai aur kis supplier ko kab ada karna hai. Shutter girayein aur sukoon se ghar jayein!\n\n📲 Aaj hi try karein: https://dukaankhata.app\nDirect support: 0335-2575725',
  'Assalam o Alaikum {name} sahib, umeed hai karobar behtareen chal raha hoga.\n\nKarachi ki marketon mein Mangal ko naye orders aur recovery ki dor dhoop rehti hai. Karobaari bhaiyon ke liye sab se behtar sahulat ye hai ke customer ko dukan ka professional digital ledger PDF WhatsApp par bheja jaye.\n\nOnline market platform par {shopName} dekhi thi.\n📲 Download karein: https://dukaankhata.app\nHelp line: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nPurane bahi khate mein Mangal ke rush ke dauran customer ka safha dhoondne mein waqt zaya hota hai. DukaanKhata mein sirf search bar mein naam likhein aur pura hisaab screen par!\n\n{place} ke sekron traders aur wholesalers ab digital ho chuke hain. {shopName} ka hisaab bhi modern karein!\n\n📲 Free app: https://dukaankhata.app\nKashan: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nMangal ke din stock rotation tez hoti hai. DukaanKhata par aap sirf customers ka nahi balkay wholesale suppliers aur maal khareedari ka hisaab bhi ba-asani manage kar sakte hain.\n\nMobile kharab hone ya tabdeel hone par bhi aap ka data cloud par 100% mehfooz rehta hai.\n\n📲 Check karein: https://dukaankhata.app\nFree setup: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nRozana ke 2 minute aap ko maheene ke aakhir mein hazaron rupaye ke nuqsan aur ghalat fehmiyon se bacha sakte hain. DukaanKhata install karein aur {shopName} ki pehli entry aaj hi karein!\n\nUrdu mein aasan aur bilkul muft:\n📲 https://dukaankhata.app\nDirect guidance: 0335-2575725',
  'Assalam o Alaikum {name} sahib!\n\nHalal kamai mein barkat hisaab ki shaffafiat se aati hai. Jab customer ko {shopName} ke naam se payment reminder jata hai toh wo izzat ke sath foran payment karta hai.\n\n📲 Try karein: https://dukaankhata.app\nKashan: 0335-2575725 | Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nAaj Mangal hai - un tamam customers ko reminder bhejein jin ki pichle hafte ki payment baqi hai. DukaanKhata ke 1-click WhatsApp reminder se udhaar recovery 3 guna tez ho jati hai.\n\n{place} ke karobaari bhaiyon ke liye khas tohfa:\n📲 https://dukaankhata.app\nHelpline: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nAgar aap ko lagta hai ke purane register se mobile par hisaab shift karna mushkil hoga, toh bilkul fikar na karein. Hamari team phone par ya dukan par aa kar FREE setup karwayegi.\n\n{shopName} ko naye daur ka karobar banayein!\n📲 https://dukaankhata.app\nKashan: 0335-2575725 / Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, dukan par gahaki tez rahe aur hisaab asaan! DukaanKhata app khas tor par Karachi ke mandi traders ke liye bani hai. Aaj hi test karein aur farq dekhein.\n\n📲 https://dukaankhata.app\nRabta: 0335-2575725',
];

export const WEDNESDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Assalam o Alaikum {name} bhai! Budh ka din mubarak ho.\n\nHafte ke darmiyan ka din hai - ye dekhne ka behtareen waqt ke pichle 3 dinon mein dukan par kitna maal bika aur kitna udhaar market mein phansa hai. DukaanKhata app se {shopName} ki mid-week summary sirf 1 minute mein screen par samne hoti hai.\n\nPurane registeron ke panne palatna chhoriye aur hisaab ungliyon par rakhein!\n\n📲 Free app: https://dukaankhata.app\nDirect setup helpline: Kashan: 0335-2575725 | Hammad: 0335-2787275\nKhush rahein aur aage badhein!',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nBudh tak aate aate counter cash aur bahi khate ka tally karna bohot zaroori hota hai taake weekend ke rush se pehle koi farq na aaye. DukaanKhata par har entry waqt aur tareeq ke sath mehfooz hoti hai.\n\n{place} ke sekron karobaari bhai rozana sukoon se karobar kar rahe hain:\n📲 https://dukaankhata.app\nHelp line: 0335-2575725',
  'Assalam o Alaikum {name} sahib, umeed hai aap khairiyat se honge.\n\nMid-week mein stock dobara re-order karte waqt aksar purane suppliers ki payments confuse ho jati hain. DukaanKhata par aap suppliers ka khata alag aur customers ka khata alag manage kar sakte hain.\n\nOnline market par aap ki shop dekhi thi.\n📲 Download: https://dukaankhata.app\nSupport: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nKarachi ke {place} mein tez dhandhe mein hisaab saaf na ho toh zehni pareshani rehti hai. DukaanKhata aap ke mobile mein ek mukammal munshi ki tarah kaam karta hai - na koi tankhwah, na koi chhutti!\n\n{shopName} ka ledger digital karein:\n📲 https://dukaankhata.app\nKashan: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nRegister mein safha phatne ya diary par paani girne ka khatra hamesha rehta hai. DukaanKhata par aap ka record 100% cloud par safe hai - phone badal bhi jaye toh hisaab wapas aa jata hai.\n\nBudh ke din nayi digital shuruat karein:\n📲 https://dukaankhata.app\nDemo ke liye rabta karein: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} sahib! Gahak se udhaar mangte waqt aana kaani ho toh unhein dukan ki PDF slip WhatsApp karein. Receipt dekh kar gahak fauran payment transfer kar deta hai.\n\n{shopName} ki recovery tez banayein:\n📲 https://dukaankhata.app\nDirect contact: 0335-2575725',
  'Assalam o Alaikum {name} bhai! Sham ko dukan band karne ke baad dukan par baith kar ghanton hisaab tally karna band karein. DukaanKhata se 2 minute mein closing karein aur time par ghar ja kar aaraam karein.\n\n📲 App link: https://dukaankhata.app\nKashan: 0335-2575725 | Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nBudh ka din hai - hafta aadha guzar gaya. Friday se pehle apne saare udhaar customer accounts clear karein taake Jumma Mubarak pursukoon guzre. DukaanKhata app try karein!\n\n📲 https://dukaankhata.app\nHelpline: 0335-2575725',
  'Assalam o Alaikum {name} sahib! Halal rozi aur emandari se dukan chalane wale karobaari bhaiyon ke sath DukaanKhata hamesha khara hai. Hamari team aap ko complete free training degi.\n\n📲 https://dukaankhata.app\nRabta: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, dukan ki taraqqi hisaab ki paki mein hai. Purane tareeqon ko chhoriye aur modern technology apnayein. DukaanKhata app aaj hi install karein!\n\n📲 https://dukaankhata.app\nHelp line: 0335-2575725',
];

export const THURSDAY_MARKET_LEADS_VARIANTS: string[] = [
  'Assalam o Alaikum {name} bhai! Jumeraat ka din mubarak ho.\n\nKal Jumma hai aur kal banks half-day open honge. Aaj Jumeraat ko suppliers ka hisaab final karna aur customer se pending udhaar mangna sab se zaroori kaam hai taake kal Jumma aur weekend par cash ki tangi na ho.\n\nDukaanKhata app se aap ek click par tamam pending payments dekh kar WhatsApp reminder bhej sakte hain. Aaj hi dukan ka hisaab clear karein!\n\n📲 Free app: https://dukaankhata.app\nDirect guidance: Kashan: 0335-2575725 | Hammad: 0335-2787275\nAllah Ta\'ala karobar mein barkat de!',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nJumeraat ki shaam dukan ki weekly closing ki tayyari hoti hai. Purane registeron ke panne palatna aur ghanton hisaab milana band karein. DukaanKhata se sirf 2 minute mein daily summary aur ledger ready ho jata hai.\n\n{shopName} ko modern banayein:\n📲 https://dukaankhata.app\nKashan: 0335-2575725',
  'Assalam o Alaikum {name} sahib, umeed hai karobar behtareen chal raha hoga.\n\nKal Jumma Mubarak hai - ba-barkat din se pehle dukan ka bahi khata saaf shaffaf rakhna behtareen aadat hai. DukaanKhata par aap ka ek ek rupaye ka hisaab cloud par 100% mehfooz rehta hai.\n\nOnline market par {shopName} dekhi thi.\n📲 Download: https://dukaankhata.app\nSupport: 0335-2575725 / 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nJumeraat ko wholesale distributors aur mandi suppliers ko hisaab clear karne ke liye DukaanKhata ka PDF ledger feature use karein. Professional bill dekh kar koi ghalat fehmi paida nahi hoti.\n\n{place} ke sekron karobaari bhaiyon ki pehli pasand:\n📲 https://dukaankhata.app\nHelpline: 0335-2575725',
  'Assalam o Alaikum {name} bhai!\n\nKal Jumma ki namaz aur break ki wajah se dukan jaldi band hoti hai. Aaj Jumeraat ko hi apni saari sales aur udhaar entries DukaanKhata par complete kar lein taake kal koi pareshani na ho.\n\n📲 Try free: https://dukaankhata.app\nSetup help: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} sahib! Customer se udhaar mangna mushkil lagta hai? DukaanKhata se izzatdaar aur meetha WhatsApp reminder bhejein. Gahak foran payment transfer karega aur taaluqat bhi khushgawar rahenge.\n\n📲 https://dukaankhata.app\nDirect line: 0335-2575725',
  'Assalam o Alaikum {name} bhai! Agar phone gum ya kharab bhi ho jaye toh {shopName} ka hisaab bilkul zaya nahi hota - naye phone mein login karte hi pura record wapas aa jata hai.\n\nJumeraat ke din digital shuruat karein:\n📲 https://dukaankhata.app\nKashan: 0335-2575725 / Hammad: 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai!\n\nWeekend ka rush shuru hone se pehle apna bahi khata DukaanKhata par shift karein. Hamari team dukan par aa kar ya call par FREE setup karwayegi.\n\n{place} ke dukaandar bhaiyon ke liye special support:\n📲 https://dukaankhata.app\nHelpline: 0335-2575725',
  'Assalam o Alaikum {name} sahib! Sham ko shutter girate waqt dimaag pursukoon hona chahiye. DukaanKhata par rozana ki closing sirf 2 minute ka kaam hai. Aaj hi download karein!\n\n📲 https://dukaankhata.app\nRabta: 0335-2575725 | 0335-2787275',
  '{Assalam o Alaikum|Salam} {name} bhai, kal Jumma Mubarak ki tayyari aur aaj ka karobar dono kamyab rahein. DukaanKhata app aap ke karobar ka sachha digital sathi hai.\n\n📲 https://dukaankhata.app\nHelp: 0335-2575725',
];

export type MarketLeadsDayMode = 'weekday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export function getAutoDayMode(): MarketLeadsDayMode {
  try {
    const dayStr = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Karachi' }).format(new Date());
    switch (dayStr.toLowerCase()) {
      case 'sun': return 'sunday';
      case 'mon': return 'monday';
      case 'tue': return 'tuesday';
      case 'wed': return 'wednesday';
      case 'thu': return 'thursday';
      case 'fri': return 'friday';
      case 'sat': return 'saturday';
      default: return 'weekday';
    }
  } catch {
    const day = new Date().getDay();
    if (day === 0) return 'sunday';
    if (day === 1) return 'monday';
    if (day === 2) return 'tuesday';
    if (day === 3) return 'wednesday';
    if (day === 4) return 'thursday';
    if (day === 5) return 'friday';
    if (day === 6) return 'saturday';
    return 'weekday';
  }
}

export const DAY_MODE_VARIANTS_MAP: Record<MarketLeadsDayMode, string[]> = {
  weekday: WEEKDAY_MARKET_LEADS_VARIANTS,
  monday: MONDAY_MARKET_LEADS_VARIANTS,
  tuesday: TUESDAY_MARKET_LEADS_VARIANTS,
  wednesday: WEDNESDAY_MARKET_LEADS_VARIANTS,
  thursday: THURSDAY_MARKET_LEADS_VARIANTS,
  friday: FRIDAY_MARKET_LEADS_VARIANTS,
  saturday: SATURDAY_MARKET_LEADS_VARIANTS,
  sunday: SUNDAY_MARKET_LEADS_VARIANTS,
};

export const DAY_MODE_TO_PRESET_ID: Record<MarketLeadsDayMode, string> = {
  weekday: 'market_leads',
  monday: 'market_leads_monday',
  tuesday: 'market_leads_tuesday',
  wednesday: 'market_leads_wednesday',
  thursday: 'market_leads_thursday',
  friday: 'market_leads_friday',
  saturday: 'market_leads_saturday',
  sunday: 'market_leads_sunday',
};

export function getDayModeDescription(mode: MarketLeadsDayMode): string {
  switch (mode) {
    case 'saturday':
      return '🔥 Saturday Special: Weekend peak rush, weekly udhaar recovery before Sunday & late-night closing relief';
    case 'sunday':
      return '☀️ Sunday Special: Family time, emotional connection, peaceful tea, Monday readiness & peace of mind';
    case 'monday':
      return '🚀 Monday Special: New week kickoff, fresh mandi stock arrival, weekly recovery targets & energetic start';
    case 'tuesday':
      return '💼 Tuesday Special: Midweek wholesale momentum, fast cash circulation & zero ledger discrepancies';
    case 'wednesday':
      return '⚖️ Wednesday Special: Midweek ledger balancing, halfway check, supplier reconciling & zero credit leak';
    case 'thursday':
      return '📋 Thursday Special: Jumeraat pre-Jumma closing, bank half-day supplier settlement & weekend readiness';
    case 'friday':
      return '🕌 Friday Jumma Special: Jumma Mubarak, karobar barkat, prayer break cash handling & transparent halal ledger';
    default:
      return '⚡ Week Day General: Active market rush ({place}), daily counter sales, instant recovery & evening closing relief';
  }
}

export const CATEGORY_PRESETS: CategoryPreset[] = [
  {
    id: 'welcome',
    categoryKeys: ['welcome', 'new', 'signup', 'general_merchant', 'merchant'],
    title: '1. Welcome',
    badge: '10 Onboarding Variants',
    description: 'Merchant welcome greeting, account activation, digital ledger onboarding, first entry, cloud safety & helpline.',
    variants: [
      'Assalam o Alaikum {name} bhai! DukaanKhata par aap ka account kamyabi se ban gaya hai.\n\n{shopName} ko digital banane par dili mubarakbaad! Ab purane registeron ke panne palatna aur parcha gum hone ka darr hamesha ke liye khatam.\n\nSirf 2 minute mein apna pehla customer ya udhaar khata add karein. Kisi bhi madad ke liye Kashan (0335-2575725) ya Hammad (0335-2787275) hamesha hazir hain.\n\nKhush rahein aur aage badhein!',
      '{Assalam o Alaikum|Salam} {name} bhai!\n\nWelcome to DukaanKhata family! {shopName} ka khata ab aap ki ungliyon par hai.\n\nApp mein pehla customer add karna nihayat asaan hai - bas "Add Customer" par click karein aur unka naam aur udhaar darj karein. Har entry ka time-stamped record banta hai.\n\nKoi bhi sawaal ho toh seedha rabta karein: 0335-2575725',
      'Assalam o Alaikum {name} sahib, umeed hai aap khairiyat se honge.\n\nDukaanKhata chunne par aap ka bohot shukriya! Sab se achi baat ye hai ke agar mobile kharab ya ghum bhi ho jaye, toh {shopName} ka ek rupaye ka hisaab bhi zaya nahi hoga - sab cloud par 100% mehfooz rehta hai.\n\nNaye dhandhe ki nayi digital shuruat mubarak ho!\nHelpline: 0335-2575725 / 0335-2787275',
      '{Assalam o Alaikum|Salam} {name} bhai!\n\nKarobaari bhaiyon ki sab se badi pareshani: "Udhaar mangte hue sharm aati hai".\n\nDukaanKhata se ab aap ek click par customer ko izzatdaar tareeqay se WhatsApp payment reminder bhej sakte hain. {shopName} ki recovery tez hogi aur taaluqat bhi khushgawar rahenge.\n\nTry karein aur farq dekhein! Support: 0335-2575725',
      'Assalam o Alaikum {name} bhai! DukaanKhata install karne ka shukriya.\n\nAgar aap chahein toh hamari team phone par ya dukan par aap ko pura ledger aur purana register ka hisaab transfer karne mein free madad karegi.\n\n{shopName} ko agle level par le jana hamari zimmedari hai. Bila jhijhak call karein:\nKashan: 0335-2575725 | Hammad: 0335-2787275',
      '{Assalam o Alaikum|Salam} {name}!\n\nShaam ko dukan badhane ke baad hisaab tally karne mein ghanton lagte the? DukaanKhata ke sath ab rozana ki sales aur bahi khata sirf 2 minute mein final ho jata hai.\n\n{shopName} ka digital safar mubarak! Shutter girayein aur sukoon se ghar jayein.\nRabta: 0335-2575725',
      'Assalam o Alaikum {name} bhai! DukaanKhata par aap sirf customers ka nahi balkay apne wholesale suppliers aur maal khareedari ka hisaab bhi ba-asani manage kar sakte hain.\n\n{shopName} ka har paisa hisaab mein rahega. Welcome aboard!\nDirect helpline: 0335-2575725 / 0335-2787275',
      '{Assalam o Alaikum|Salam} {name} bhai!\n\nWelcome to DukaanKhata! Ek zabardast feature ye hai ke aap kisi bhi customer ka pura hisaab PDF bana kar WhatsApp par share kar sakte hain, bilkul professional receipt ki tarah.\n\n{shopName} ka image bhi behtar aur hisaab bhi saaf shaffaf. Support: 0335-2575725',
      'Assalam o Alaikum {name} sahib, Allah Ta\'ala aap ke karobar aur {shopName} mein be-panah barkat ataa farmaye.\n\nDukaanKhata par aana aap ka behtareen faisla hai. Hum 24/7 aap ke sath khare hain, taake aap baghair kisi tension ke sirf dukan ki taraqqi par dhyan dein.\n\nKashan: 0335-2575725 | Hammad: 0335-2787275',
      '{Assalam o Alaikum|Salam} {name} bhai, dukan ka digital sathi DukaanKhata aap ko welcome kehta hai!\n\nNa kisi computer ki zaroorat hai na kisi accounting course ki - nihayat aasan Urdu mein aap ke haath mein poori dukan ka nizam hai. Aaj hi {shopName} ki pehli entry karein!\n\nKoi mushkil aaye toh hamesha hazir hain: 0335-2575725',
    ],
  },
  {
    id: 'visit_followup',
    categoryKeys: ['visit_followup', 'visit', 'potential_leads', 'visited', 'lead'],
    title: '2. Visit followup we visited them',
    badge: '8 Follow-up Variants',
    description: 'Personalized follow-up after DukaanKhata team visited their shop with offer for free setup and team guidance.',
    variants: [
      'Assalam o Alaikum {name} bhai! Hum ne kuch din pehle {shopName} visit ki thi aur DukaanKhata app ke baare mein btaya tha. Bas ye dekhne aaye the ke aap ne try ki ya nahi?\n\nAgar nahi ki abhi tak toh koi baat nahi - jab bhi aap free hon, hum personally pura khata setup karwa denge. Hazaron karobaari bhai kehte hain ke kaash ye app pehle use ki hoti!\n\nKashan: 0335-2575725 | Hammad: 0335-2787275\n\nApna khayal rakhein!',
      '{Assalam o Alaikum|Salam} {name} bhai!\n\n{shopName} par aap se mulaqaat bohot achi rahi. DukaanKhata app test karne ka mauqa mila? Daily sales, customer ka udhaar khata aur WhatsApp recovery reminders - sab mobile mein 2 minute mein manage ho jata hai.\n\nSetup mein koi bhi help chahiye ho toh bila jhijhak batayein: 0335-2575725',
      'Assalam o Alaikum {name} sahib, umeed hai sab khairiyat hogi.\n\n{shopName} par team visit ke baad socha follow-up kar loon. Registeron mein udhaar likhne se parcha ghum hone ka darr rehta hai, jab ke DukaanKhata par ek ek rupaye ka hisaab 100% cloud par mehfooz rehta hai.\n\nFree demo ya guidance ke liye rabta karein: 0335-2575725 / 0335-2787275',
      '{Assalam o Alaikum|Salam} {name}!\n\nPurane register chhor kar digital par aane mein thodi jhijhak sab ko hoti hai, lekin hamari team dukan par dobara aa kar aap ko pura hisaab transfer karwayegi.\n\nKarachi ka karobaar tez hai, aap ka hisaab bhi tez hona chahiye. Kashan bhai se direct call karein: 0335-2575725',
      'Assalam o Alaikum {name} bhai! Sirf 5 minute ka waqt nikal kar app try karein. Agar pasand na aaye toh beshak delete kar dein, lekin ek baar zaroor aazmayein!\n\n{shopName} ke digital safar mein hum aap ke sath hain.\nKashan: 0335-2575725 | Hammad: 0335-2787275',
      '{Assalam o Alaikum|Salam} {name} bhai, dukan visit par aap ki hosla afzai ka shukriya. Udhaar recovery ke automatic WhatsApp alerts feature ne karobaari bhaiyon ke lakho rupaye recover karwaye hain.\n\n{shopName} ke liye bhi ye feature zaroor try karein! Helpline: 0335-2575725',
      'Assalam o Alaikum {name} sahib! Hamari team ne {shopName} par jo demo diya tha, uss ke hawale se koi sawaal ya confusion ho toh bila-jhijhak Kashan (0335-2575725) ya Hammad (0335-2787275) ko WhatsApp karein. Khush rahein!',
      '{Assalam o Alaikum|Salam} {name} bhai! Aap ke qeemti waqt ka shukriya jab hamari team ne visit kiya tha. DukaanKhata install karne ke baad pehle din se hi register ka sar dard khatam ho jata hai.\n\nDirect support: 0335-2575725',
    ],
  },
  {
    id: 'market_leads',
    categoryKeys: ['market_leads', 'online_market', 'market', 'scraped_leads', 'dukaankhata_market', 'wholesale', 'retail', 'trader'],
    title: '3. Market Leads (Weekday General)',
    badge: '10 Weekday Rush Variants',
    description: 'Active market rush ({place}), daily sales & udhaar ledger, instant WhatsApp recovery reminders, and evening closing relief.',
    variants: WEEKDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'market_leads_saturday',
    categoryKeys: ['market_leads_saturday', 'saturday_leads', 'saturday'],
    title: 'Market Leads (Saturday Special)',
    badge: '10 Weekend Rush Variants',
    description: 'Saturday peak rush ({place}), weekly udhaar recovery before Sunday, supplier balancing & stress-free weekend closing.',
    variants: SATURDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'market_leads_sunday',
    categoryKeys: ['market_leads_sunday', 'sunday_leads', 'sunday'],
    title: 'Market Leads (Sunday Special)',
    badge: '10 Sunday Emotional Variants',
    description: 'Sunday family time, peaceful relaxation, Monday prep, Karachi market hustle ({place}), and peace of mind.',
    variants: SUNDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'market_leads_friday',
    categoryKeys: ['market_leads_friday', 'friday_leads', 'friday', 'jumma'],
    title: 'Market Leads (Friday Jumma Special)',
    badge: '10 Jumma & Barkat Variants',
    description: 'Jumma Mubarak blessings, transparent halal ledger, prayer break cash handling, and business prosperity prayers.',
    variants: FRIDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'market_leads_monday',
    categoryKeys: ['market_leads_monday', 'monday_leads', 'monday'],
    title: 'Market Leads (Monday Special)',
    badge: '10 New Week Kickoff Variants',
    description: 'Fresh week energy, new mandi wholesale stock arrival, weekly sales targets, and energetic Monday start.',
    variants: MONDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'market_leads_tuesday',
    categoryKeys: ['market_leads_tuesday', 'tuesday_leads', 'tuesday'],
    title: 'Market Leads (Tuesday Special)',
    badge: '10 Mangal Wholesale Variants',
    description: 'Midweek wholesale momentum ({place}), fast cash circulation, supplier payments & zero notebook loss.',
    variants: TUESDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'market_leads_wednesday',
    categoryKeys: ['market_leads_wednesday', 'wednesday_leads', 'wednesday'],
    title: 'Market Leads (Wednesday Special)',
    badge: '10 Budh Midweek Variants',
    description: 'Midweek ledger balancing, halfway check ({place}), supplier reconciling & zero credit leak.',
    variants: WEDNESDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'market_leads_thursday',
    categoryKeys: ['market_leads_thursday', 'thursday_leads', 'thursday', 'jumeraat'],
    title: 'Market Leads (Thursday Special)',
    badge: '10 Pre-Jumma Closing Variants',
    description: 'Jumeraat pre-Jumma closing ({place}), bank half-day supplier settlement & weekend readiness.',
    variants: THURSDAY_MARKET_LEADS_VARIANTS,
  },
  {
    id: 'winback_churned',
    categoryKeys: ['winback_churned', 'churned', 'inactive', 'dormant'],
    title: '4. Win back churned customers',
    badge: '6 Win-Back Variants',
    description: 'Re-engaging dormant merchants, solving issues, and showcasing auto-sync and new feature updates.',
    variants: [
      'Assalam o Alaikum {name} bhai, umeed hai sab theek hai aap ki taraf?\n\nBas ye check karne aaya tha ke {shopName} ka hisaab up-to-date hai ya nahi. Kaafi dino se app open nahi hui, toh socha puch loon ke sab theek toh hai na.\n\nAgar koi masla aaya ho app mein, ya koi cheez confusing lagi ho, toh mujhe bta dein - hum fix kar denge. Hum ne kuch naye features bhi add kiye hain jo aap ke kaam aayenge.\n\nKabhi bhi rabta karein: 0335-2575725\n\nKhayal rakhein,\nDukaanKhata Team',
      '{Assalam o Alaikum|Salam} {name}!\n\n{shopName} ka DukaanKhata account miss kar raha hai aap ko. Kaafi din ho gaye - dukan ka hisaab pending toh nahi?\n\nNaye updates aaye hain app mein, auto-sync aur PDF reports bohot tez ho gaye hain: https://dukaankhata.app\n\nKoi dikkat ho toh btayein: 0335-2575725',
      'Assalam o Alaikum {name} bhai,\n\nBas chhota sa reminder ke {shopName} ka hisaab DukaanKhata par properly manage ho sakta hai. Kaafi merchants daily use kar rahe hain ab.\n\nApp kholein aur apna record update karein - sirf 2 minute ka kaam hai.\n\nSupport: 0335-2575725',
      '{Assalam o Alaikum|Salam} {name} sahib! Aap hamare qeemti merchant hain. Agar kisi feature mein mushkil pesh aayi ho toh hum personal visit kar ke ya phone par setup theek karwa dete hain.\n\nSeedha call karein: 0335-2575725 / 0335-2787275',
      'Assalam o Alaikum {name} bhai! Halal karobar mein hisaab kitaab ka ba-qaida hona hi barkat ki zamanat hai. {shopName} ka purana record app mein mehfooz hai, aaj hi login kar ke dobara shuru karein!\n\nKashan: 0335-2575725',
      '{Assalam o Alaikum|Salam} {name} bhai, agar app mein koi cheez pasand nahi aayi thi toh please zaroor batayein. Hum aap jaise mehnti bhaiyon ke mashwaray se hi app ko behtar banate hain.\n\nDirect contact: 0335-2575725',
    ],
  },
  {
    id: 'ask_feedback',
    categoryKeys: ['ask_feedback', 'feedback', 'suggestions', 'review'],
    title: '5. Ask for Feedback',
    badge: '6 Feedback Variants',
    description: 'Asking active merchants for their honest feedback, feature requests, and satisfaction check.',
    variants: [
      'Assalam o Alaikum {name} bhai, kaisay hain aap?\n\nAap {shopName} ke liye DukaanKhata use kar rahe hain, is par dil se shukriya.\n\nEk personal guzarish hai - aap ka honest feedback chahiye. Kya acha laga app mein? Kya aur behtar ho sakta hai? Koi aesa feature hai jo aap chahte hain?\n\nHum actually padhte hain har ek reply aur koshish karte hain ke jaldi improve karein. Seedha reply kar dein iss message par, ya call karein:\nKashan: 0335-2575725\nHammad: 0335-2787275\n\nShukriya {name} bhai!',
      '{Assalam o Alaikum|Salam} {name}!\n\n{shopName} par DukaanKhata kaisa chal raha hai? Sach mein btayein - acha ho ya bura, hum sunna chahte hain.\n\nKoi masla ho ya suggestion ho, reply kar dein ya call karein: 0335-2575725\n\nAap ki feedback hi humein behtar banati hai.\nShukriya!',
      'Assalam o Alaikum {name} sahib,\n\nAap se ek minute ka waqt chahiye tha - DukaanKhata app ke baare mein aap ka kya tajurba raha ab tak? {shopName} ke hisaab mein asani hui ya kuch aur improve hona chahiye?\n\nHonest reply ki qadr karenge. Support: 0335-2575725 / 0335-2787275',
      '{Assalam o Alaikum|Salam} {name} bhai! Hum DukaanKhata ko Pakistan ke har dukaandaar ke liye asaan tareen banana chahte hain. Aap ka ek mashwara hazaron karobaari bhaiyon ke kaam aa sakta hai.\n\nAap ko app mein sab se behtar feature konsa laga? Kashan: 0335-2575725',
      'Assalam o Alaikum {name} bhai! Kya {shopName} par customer payment recovery pehle se behtar hui hai? Koi naya feature jo aap chahte hon ke app mein add ho?\n\nBila jhijhak share karein: 0335-2575725',
      '{Assalam o Alaikum|Salam} {name} sahib, aap ke taawun aur bharose ka bohot shukriya. App mein koi mushkil aaye toh hamesha feedback dein, hum foran theek karenge: 0335-2575725 / 0335-2787275',
    ],
  },
  {
    id: 'general_announcement',
    categoryKeys: ['general_announcement', 'announcement', 'updates', 'broadcast'],
    title: '6. General announcement',
    badge: '6 Announcement Variants',
    description: 'New feature updates, cloud backup enhancements, PDF statements, and general business announcements.',
    variants: [
      'Assalam o Alaikum {name} bhai! DukaanKhata app mein naye features aur fast cloud sync update aa gaya hai.\n\n{shopName} ke transactions ab pehle se 2 guna tez aur offline bhi save honge. Aaj hi app open karein aur naye updates check karein!\n\nKoi sawal ho toh rabta karein: 0335-2575725 | 0335-2787275',
      '{Assalam o Alaikum|Salam} {name} bhai!\n\nZaroori itlaa: DukaanKhata par ab PDF ledger statement aur customer recovery reminder direct WhatsApp par send karna aur bhi aasan ho gaya hai.\n\n{shopName} ka hisaab modernize karein. App link: https://dukaankhata.app\nSupport: 0335-2575725',
      'Assalam o Alaikum {name} sahib, Allah Ta\'ala aap ke karobar mein be-panah taraqqi ataa farmaye.\n\nDukaanKhata team ki taraf se har waqt muft customer support dastiyab hai. Kisi bhi setting ya report mein madad chahiye ho toh bila jhijhak call karein: 0335-2575725',
      '{Assalam o Alaikum|Salam} {name}! DukaanKhata par naya security update live ho gaya hai. Aap ka saara hisaab kitaab aur ledger data 100% encrypted aur secure backup ke sath mehfooz hai.\n\n{shopName} ke sath hum hamesha khare hain. Support: 0335-2787275',
      'Assalam o Alaikum {name} bhai! Purane register par hisaab likhna band karein aur apne staff/karigar ko bhi DukaanKhata se jodein. Ek click par daily shop report check karein.\n\nDetails ke liye rabta karein: 0335-2575725',
      '{Assalam o Alaikum|Salam} {name} bhai, dukan ka hisaab digital banana hi taraqqi ki pehli seedhi hai. DukaanKhata family ka hissa banne par shukriya. Kisi bhi waqt help ke liye call karein: 0335-2575725 / 0335-2787275',
    ],
  },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

export default function WhatsAppAdminPage() {
  // Connection State
  const [waState, setWaState] = useState<WhatsAppStatusState>({
    status: 'disconnected',
    qrCodeUrl: null,
    phoneNumber: null,
    userName: null,
    error: null,
    connectedAt: null,
  });
  const [waLogs, setWaLogs] = useState<SendLog[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Users & Target Selection State
  const [users, setUsers] = useState<User[]>([]);
  const [potentialLeads, setPotentialLeads] = useState<User[]>([]);
  const [marketLeads, setMarketLeads] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [targetFilter, setTargetFilter] = useState<TargetFilterType>('all');
  const [marketLeadsSubFilter, setMarketLeadsSubFilter] = useState<'all' | 'unsent' | 'saddar' | 'wholesalers' | 'sent'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);

  // Category & Variants State
  const [marketLeadsMode, setMarketLeadsMode] = useState<MarketLeadsDayMode>(() => {
    return getAutoDayMode();
  });
  const [selectedCategoryPreset, setSelectedCategoryPreset] = useState<string>(() => {
    const autoMode = getAutoDayMode();
    return DAY_MODE_TO_PRESET_ID[autoMode] || 'market_leads';
  });
  const [variants, setVariants] = useState<string[]>(() => {
    const autoMode = getAutoDayMode();
    return DAY_MODE_VARIANTS_MAP[autoMode] || WEEKDAY_MARKET_LEADS_VARIANTS;
  });
  const [activeVariantTab, setActiveVariantTab] = useState<number>(0);
  const [autoMatchCategory, setAutoMatchCategory] = useState<boolean>(true);
  const [previewWithName, setPreviewWithName] = useState<boolean>(false);

  // Batching & Anti-Spam Safeguards State
  // Rule: Send in batches of 10. Gap of random 5 to 10 mins (300-600s) after every 10 messages, and random 30-60s gap between each message.
  const [batchSize, setBatchSize] = useState<number>(10);
  const [batchCooldownMinSec, setBatchCooldownMinSec] = useState<number>(300); // 5 mins
  const [batchCooldownMaxSec, setBatchCooldownMaxSec] = useState<number>(600); // 10 mins
  const [minDelaySec, setMinDelaySec] = useState<number>(30); // 30s
  const [maxDelaySec, setMaxDelaySec] = useState<number>(60); // 60s
  const [recipientLimit, setRecipientLimit] = useState<number>(20); // 20 (2 batches of 10) by default
  const [forceSend, setForceSend] = useState(false);

  // Live Dispatch Progress State
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ total: number; sent: number; fail: number } | null>(null);
  const [countdownSec, setCountdownSec] = useState<number>(0);
  const [batchCooldownInfo, setBatchCooldownInfo] = useState<{
    isBatchCooldown: boolean;
    batchCooldownTotalSec: number;
    currentBatchNumber: number;
    batchStatusText?: string;
  }>({
    isBatchCooldown: false,
    batchCooldownTotalSec: 0,
    currentBatchNumber: 1,
    batchStatusText: '',
  });
  const [currentSendingInfo, setCurrentSendingInfo] = useState<{
    currentIndex: number;
    total: number;
    name: string;
    variantIdx: number;
  } | null>(null);

  const [sendResultMsg, setSendResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testPhone, setTestPhone] = useState('03352575725');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [todaySentCount, setTodaySentCount] = useState<number>(0);
  const [dailyLimit, setDailyLimit] = useState<number>(150);
  const [accountHealth, setAccountHealth] = useState<any>(null);
  const [safetyInfo, setSafetyInfo] = useState<any>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [waitReason, setWaitReason] = useState<string | null>(null);

  // Fetch WhatsApp status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp/status');
      const data = await res.json();
      if (data.success && data.state) {
        setWaState(data.state);
        if (data.health) setAccountHealth(data.health);
        if (data.safety) setSafetyInfo(data.safety);
        if (data.logs) setWaLogs(data.logs);
        if (typeof data.todaySentCount === 'number') setTodaySentCount(data.todaySentCount);
        if (typeof data.dailyLimit === 'number') setDailyLimit(data.dailyLimit);
      }
    } catch (err) {
      console.error('Error fetching WA status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Poll status every 4 seconds if connecting or qr_ready
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Fetch Users List and Potential Leads for recipient selection
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const [usersRes, leadsRes, marketLeadsRes] = await Promise.all([
        fetch('/api/admin/users?limit=5000&page=1'),
        fetch('/api/admin/potential-leads?limit=5000&page=1'),
        fetch('/api/admin/market-leads?limit=5000&page=1'),
      ]);
      const usersData = await usersRes.json();
      const leadsData = await leadsRes.json();
      const marketLeadsData = await marketLeadsRes.json();

      if (usersData.success) {
        setUsers(usersData.users || []);
      }

      if (leadsData.success && Array.isArray(leadsData.leads)) {
        const formattedLeads: User[] = leadsData.leads.map((lead: any) => {
          const rawName = (lead.name || '').trim();
          const hasKnownName = isRealPersonName(rawName, lead.shopName);
          return {
            _id: lead._id,
            name: hasKnownName ? rawName : '',
            shopName: lead.shopName || '',
            phone: lead.number,
            email: `${lead.number}@visit.lead`,
            role: 'user',
            status: 'active',
            subscription: { plan: 'Visit Lead', status: 'trial' },
            category: 'Visit Lead',
            businessType: 'Retailer',
            market: lead.market || 'Karachi',
            place: lead.market || 'Karachi',
            address: lead.market || 'Karachi',
            createdAt: lead.createdAt,
            lastActivity: lead.createdAt,
          };
        });
        setPotentialLeads(formattedLeads);
      }

      if (marketLeadsData.success && Array.isArray(marketLeadsData.leads)) {
        const formattedMarketLeads: User[] = marketLeadsData.leads.map((lead: any) => {
          const rawName = (lead.name || '').trim();
          const hasKnownName = isRealPersonName(rawName, lead.shopName);
          return {
            _id: lead._id,
            name: hasKnownName ? rawName : '',
            shopName: lead.shopName || '',
            phone: lead.number,
            email: `${lead.cleanNumber || lead.number}@scraped.lead`,
            role: 'user',
            status: 'active',
            subscription: { plan: `${lead.businessType || 'Wholesaler'} • ${lead.place || 'Karachi'}`, status: 'trial' },
            category: lead.businessType || 'Wholesale',
            market: lead.place || 'Karachi',
            place: lead.place || 'Karachi',
            marketName: lead.marketName || lead.place || '',
            isSaddarMobileLead: Boolean(lead.isSaddarMobileLead || /saddar.*mobile|mobile.*market|star city/i.test(lead.place || lead.marketName || '')),
            address: lead.address || lead.place || 'Karachi',
            whatsappSent: Boolean(lead.whatsappSent),
            whatsappSentAt: lead.whatsappSentAt || undefined,
            whatsappSentCount: lead.whatsappSentCount || 0,
            lastWhatsappStatus: lead.lastWhatsappStatus || undefined,
            traderWholesaleScore: typeof lead.traderWholesaleScore === 'number' ? lead.traderWholesaleScore : 0,
            isWholesalerOrTrader: Boolean(lead.isWholesalerOrTrader),
            createdAt: lead.createdAt,
            lastActivity: lead.createdAt,
          };
        });
        setMarketLeads(formattedMarketLeads);
      }
    } catch (err) {
      console.error('Error fetching users/leads for WA:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Auto-select user query param if redirected from Users or Potential Leads page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filterParam = params.get('filter');
    const preselectedId = params.get('userId');

    if (filterParam === 'potential_leads') {
      setTargetFilter('potential_leads');
      const preset = CATEGORY_PRESETS.find((p) => p.id === 'visit_followup');
      if (preset) {
        setSelectedCategoryPreset(preset.id);
        setVariants([...preset.variants]);
      }
    } else if (filterParam === 'market_leads' || filterParam === 'saddar' || filterParam === 'saddar_mobile') {
      setTargetFilter(filterParam === 'saddar' || filterParam === 'saddar_mobile' ? 'saddar_mobile' : 'market_leads');
      if (filterParam === 'saddar') {
        setMarketLeadsSubFilter('saddar');
      }
      const autoMode = getAutoDayMode();
      setMarketLeadsMode(autoMode);
      const targetPresetId = DAY_MODE_TO_PRESET_ID[autoMode] || 'market_leads';
      const preset = CATEGORY_PRESETS.find((p) => p.id === targetPresetId) || CATEGORY_PRESETS.find((p) => p.id === 'market_leads');
      if (preset) {
        setSelectedCategoryPreset(preset.id);
        setVariants([...(DAY_MODE_VARIANTS_MAP[autoMode] || SATURDAY_MARKET_LEADS_VARIANTS)]);
      }
    }

    if (preselectedId) {
      setTargetFilter('custom');
      const ids = preselectedId.split(',').filter(Boolean);
      setSelectedUserIds(new Set(ids));
      if (ids.length > 20) {
        setRecipientLimit(Math.min(500, ids.length));
      }
    }
  }, [users, potentialLeads, marketLeads]);

  // Server-side broadcast polling — runs every 2s while broadcast is active or paused
  useEffect(() => {
    if (!sending) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/whatsapp/broadcast');
        const data = await res.json();
        if (data.success && data.progress) {
          const p = data.progress;

          setSendProgress({ total: p.total, sent: p.sent, fail: p.failed });
          setCountdownSec(p.countdownSec);
          setIsPaused(Boolean(p.paused));
          setPauseReason(p.pauseReason || null);
          setWaitReason(p.waitReason || null);
          setBatchCooldownInfo({
            isBatchCooldown: !!p.isBatchCooldown,
            batchCooldownTotalSec: p.batchCooldownTotalSec || 0,
            currentBatchNumber: p.currentBatchNumber || 1,
            batchStatusText: p.batchStatusText || '',
          });

          if (p.active || p.paused) {
            setCurrentSendingInfo({
              currentIndex: p.currentIndex,
              total: p.total,
              name: p.currentName,
              variantIdx: p.currentVariantIdx,
            });
          }

          if (!p.active && !p.paused) {
            // Broadcast finished or cancelled on server
            setSending(false);
            setIsPaused(false);
            setSendProgress(null);
            setCurrentSendingInfo(null);
            setCountdownSec(0);
            setBatchCooldownInfo({
              isBatchCooldown: false,
              batchCooldownTotalSec: 0,
              currentBatchNumber: 1,
              batchStatusText: '',
            });
            if (p.resultMessage) {
              setSendResultMsg({ type: p.resultType || 'success', text: p.resultMessage });
            }
            fetchStatus(); // Refresh logs from DB
          }
        }
      } catch (err) {
        console.error('Error polling broadcast progress:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sending, fetchStatus]);

  // On page load, check if a broadcast is already running or paused
  useEffect(() => {
    fetch('/api/admin/whatsapp/broadcast?notick=true')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.progress && (data.progress.active || data.progress.paused)) {
          setSending(true);
          const p = data.progress;
          setIsPaused(Boolean(p.paused));
          setPauseReason(p.pauseReason || null);
          setWaitReason(p.waitReason || null);
          setSendProgress({ total: p.total, sent: p.sent, fail: p.failed });
          setCountdownSec(p.countdownSec);
          setBatchCooldownInfo({
            isBatchCooldown: !!p.isBatchCooldown,
            batchCooldownTotalSec: p.batchCooldownTotalSec || 0,
            currentBatchNumber: p.currentBatchNumber || 1,
            batchStatusText: p.batchStatusText || '',
          });
          setCurrentSendingInfo({
            currentIndex: p.currentIndex,
            total: p.total,
            name: p.currentName,
            variantIdx: p.currentVariantIdx,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Connect QR trigger
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp/connect', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.state) {
        setWaState(data.state);
      }
      setTimeout(() => fetchStatus(), 1000);
      setTimeout(() => fetchStatus(), 2500);
    } catch (err) {
      console.error('Error connecting WhatsApp:', err);
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect session
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/admin/whatsapp/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.state) {
        setWaState(data.state);
      }
    } catch (err) {
      console.error('Error disconnecting WhatsApp:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  // Category switch handler
  const handleSelectCategory = (preset: CategoryPreset) => {
    setSelectedCategoryPreset(preset.id);
    if (preset.id === 'market_leads') {
      setMarketLeadsMode('weekday');
      setVariants([...WEEKDAY_MARKET_LEADS_VARIANTS]);
    } else if (preset.id.startsWith('market_leads_')) {
      const mode = preset.id.replace('market_leads_', '') as MarketLeadsDayMode;
      setMarketLeadsMode(mode);
      setVariants([...(DAY_MODE_VARIANTS_MAP[mode] || SATURDAY_MARKET_LEADS_VARIANTS)]);
    } else {
      setVariants([...preset.variants]);
    }
    setActiveVariantTab(0);
  };

  const handleSwitchMarketLeadsMode = (mode: MarketLeadsDayMode) => {
    setMarketLeadsMode(mode);
    setSelectedCategoryPreset(DAY_MODE_TO_PRESET_ID[mode] || 'market_leads');
    setVariants([...(DAY_MODE_VARIANTS_MAP[mode] || SATURDAY_MARKET_LEADS_VARIANTS)]);
    setActiveVariantTab(0);
  };

  // Variant editing handlers
  const handleUpdateVariant = (index: number, val: string) => {
    setVariants((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleAddVariant = () => {
    if (variants.length >= 20) return;
    setVariants((prev) => [...prev, '']);
    setActiveVariantTab(variants.length);
  };

  const handleRemoveVariant = (index: number) => {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, idx) => idx !== index));
    if (activeVariantTab >= index && activeVariantTab > 0) {
      setActiveVariantTab(activeVariantTab - 1);
    }
  };

  // Insert template variable into active variant text field
  const handleInsertVariable = (tag: string) => {
    const currentText = variants[activeVariantTab] || '';
    if (!textareaRef.current) {
      handleUpdateVariant(activeVariantTab, currentText + ' ' + tag);
      return;
    }
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const newText = currentText.substring(0, start) + tag + currentText.substring(end);
    handleUpdateVariant(activeVariantTab, newText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + tag.length, start + tag.length);
      }
    }, 0);
  };

  // Handle filter change cleanly
  const handleTargetFilterChange = (filter: TargetFilterType) => {
    setTargetFilter(filter);
    setSelectedUserIds(new Set());
    setSelectionWarning(null);
  };

  // Filter matching users based on selected target audience filter & search query
  const getMatchingFilterUsers = useCallback(() => {
    let result = users;
    const daysAgo = (d: number) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      return dt;
    };

    if (targetFilter === 'market_leads') {
      if (marketLeadsSubFilter === 'saddar') {
        result = marketLeads.filter(
          (m) =>
            m.isSaddarMobileLead ||
            /saddar.*mobile|mobile.*market|star city/i.test(m.place || m.market || '') ||
            /saddar.*mobile|mobile.*market|star city/i.test((m as any).marketName || '')
        );
      } else if (marketLeadsSubFilter === 'unsent') {
        result = marketLeads.filter((m) => !m.whatsappSent);
      } else if (marketLeadsSubFilter === 'sent') {
        result = marketLeads.filter((m) => m.whatsappSent);
      } else if (marketLeadsSubFilter === 'wholesalers') {
        result = marketLeads.filter((m) => m.isWholesalerOrTrader || (m.traderWholesaleScore || 0) >= 15);
      } else {
        result = marketLeads;
      }
    } else if (targetFilter === 'saddar_mobile') {
      result = marketLeads.filter(
        (m) =>
          m.isSaddarMobileLead ||
          /saddar.*mobile|mobile.*market|star city/i.test(m.place || m.market || '') ||
          /saddar.*mobile|mobile.*market|star city/i.test((m as any).marketName || '')
      );
    } else if (targetFilter === 'potential_leads') {
      result = potentialLeads;
    } else if (targetFilter === 'new7') {
      result = users.filter((u) => u.createdAt && new Date(u.createdAt) >= daysAgo(7));
    } else if (targetFilter === 'inactive7') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(7));
    } else if (targetFilter === 'inactive15') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(15));
    } else if (targetFilter === 'inactive30') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(30));
    } else if (targetFilter === 'inactive90') {
      result = users.filter((u) => !u.lastActivity || new Date(u.lastActivity) <= daysAgo(90));
    } else if (targetFilter === 'pro') {
      result = users.filter((u) => u.subscription?.plan === 'pro');
    } else if (targetFilter === 'free') {
      result = users.filter((u) => u.subscription?.plan !== 'pro');
    } else if (targetFilter === 'active') {
      result = users.filter((u) => u.status !== 'suspended' && u.status !== 'blocked');
    } else if (targetFilter === 'suspended') {
      result = users.filter((u) => u.status === 'suspended' || u.status === 'blocked');
    }

    if (userSearch) {
      const query = userSearch.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          (u.shopName || '').toLowerCase().includes(query) ||
          (u.phone || '').includes(query) ||
          (u.category || '').toLowerCase().includes(query) ||
          (u.place || '').toLowerCase().includes(query)
      );
    }

    // Sort logic:
    // 1. Valid Phone + Never Sent -> Super Top (Tier 1)
    // 2. Valid Phone + Previously Sent -> Next (Tier 2)
    // 3. No Phone -> Very bottom (Tier 3)
    // Within Tier 1 & Tier 2:
    //  a. High trader/wholesaler score first (commercial traders, cloth/hardware/steel/paper wholesalers)
    //  b. Most recent activity / creation date
    return [...result].sort((a, b) => {
      const aPhoneClean = formatWhatsAppPhone(a.phone || (a as any).whatsapp || (a as any).mobile || '');
      const bPhoneClean = formatWhatsAppPhone(b.phone || (b as any).whatsapp || (b as any).mobile || '');

      const aHasPhone = aPhoneClean.length >= 10;
      const bHasPhone = bPhoneClean.length >= 10;

      const aWasSent = Boolean(a.lastWaMessageSentAt || a.whatsappSent || a.whatsappSentAt);
      const bWasSent = Boolean(b.lastWaMessageSentAt || b.whatsappSent || b.whatsappSentAt);

      const aTier = !aHasPhone ? 3 : !aWasSent ? 1 : 2;
      const bTier = !bHasPhone ? 3 : !bWasSent ? 1 : 2;

      if (aTier !== bTier) {
        return aTier - bTier;
      }

      // Prioritize Saddar Mobile Market traders & wholesalers on TOP!
      const aIsSaddar = Boolean(
        a.isSaddarMobileLead ||
        /saddar.*mobile|mobile.*market|star city/i.test(a.place || a.market || '') ||
        /saddar.*mobile|mobile.*market|star city/i.test((a as any).marketName || '')
      );
      const bIsSaddar = Boolean(
        b.isSaddarMobileLead ||
        /saddar.*mobile|mobile.*market|star city/i.test(b.place || b.market || '') ||
        /saddar.*mobile|mobile.*market|star city/i.test((b as any).marketName || '')
      );

      if (aIsSaddar !== bIsSaddar) {
        return aIsSaddar ? -1 : 1;
      }

      // Traders & Wholesalers prioritized on top
      const aScore = a.traderWholesaleScore || (a as any).traderWholesaleScore || 0;
      const bScore = b.traderWholesaleScore || (b as any).traderWholesaleScore || 0;
      if (aScore !== bScore) {
        return bScore - aScore;
      }

      const aActivity = a.lastActivity
        ? new Date(a.lastActivity).getTime()
        : a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;
      const bActivity = b.lastActivity
        ? new Date(b.lastActivity).getTime()
        : b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;

      return bActivity - aActivity;
    });
  }, [users, potentialLeads, marketLeads, targetFilter, marketLeadsSubFilter, userSearch]);

  const matchingFilterUsers = getMatchingFilterUsers();

  // Final Target Recipients (controlled by recipientLimit batch selector):
  const getFilteredRecipients = useCallback(() => {
    const allUsersPool = [...users, ...potentialLeads, ...marketLeads];
    const pool =
      selectedUserIds.size > 0
        ? allUsersPool.filter((u) => selectedUserIds.has(u._id))
        : matchingFilterUsers;

    if (recipientLimit > 0) {
      return pool.slice(0, recipientLimit);
    }
    return pool;
  }, [users, potentialLeads, marketLeads, matchingFilterUsers, selectedUserIds, recipientLimit]);

  const targetRecipients = getFilteredRecipients();
  const validRecipients = targetRecipients.filter(
    (u) => formatWhatsAppPhone(u.phone || (u as any).whatsapp || (u as any).mobile || '').length >= 10
  );

  // Toggle user selection
  const toggleSelectUser = (id: string) => {
    setSelectionWarning(null);
    const maxAllowed = recipientLimit === 0 ? 500 : Math.max(recipientLimit, 50);
    const next = new Set(selectedUserIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= maxAllowed) {
        setSelectionWarning(`Maximum ${maxAllowed} recipients can be selected at a time.`);
        return;
      }
      next.add(id);
    }
    setSelectedUserIds(next);
  };

  const toggleSelectAllCustom = (count?: number) => {
    setSelectionWarning(null);
    const limit = count !== undefined ? count : recipientLimit;
    if (selectedUserIds.size > 0 && count === undefined) {
      setSelectedUserIds(new Set());
    } else {
      const targetSlice = limit === 0 ? matchingFilterUsers : matchingFilterUsers.slice(0, limit);
      setSelectedUserIds(new Set(targetSlice.map((u) => u._id)));
      if (limit > 0 && matchingFilterUsers.length > limit) {
        setSelectionWarning(`Selected top ${limit} merchants from list.`);
      }
    }
  };

  // Stop dispatch execution — tells the server to cancel
  const handleStopSending = async () => {
    try {
      await fetch('/api/admin/whatsapp/broadcast', { method: 'DELETE' });
    } catch (err) {
      console.error('Error cancelling broadcast:', err);
    }
  };

  const handlePauseBroadcast = async () => {
    try {
      await fetch('/api/admin/whatsapp/broadcast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
      setIsPaused(true);
    } catch (err) {
      console.error('Error pausing broadcast:', err);
    }
  };

  const handleResumeBroadcast = async () => {
    try {
      await fetch('/api/admin/whatsapp/broadcast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      setIsPaused(false);
    } catch (err) {
      console.error('Error resuming broadcast:', err);
    }
  };

  // Start server-side broadcast: sends in batches of 10 with random 5-10 min cooldown and 30-60s gaps
  const handleSendMessages = async () => {
    if (waState.status !== 'connected') {
      setSendResultMsg({
        type: 'error',
        text: 'WhatsApp is not connected. Please scan the QR code first.',
      });
      return;
    }

    const activeVariants = variants.map((v) => v.trim()).filter(Boolean);
    if (activeVariants.length === 0) {
      setSendResultMsg({
        type: 'error',
        text: 'Please enter at least one message variant to send.',
      });
      return;
    }

    if (validRecipients.length === 0) {
      setSendResultMsg({
        type: 'error',
        text: 'No valid target users with phone numbers selected.',
      });
      return;
    }

    setSending(true);
    setSendResultMsg(null);
    setSendProgress({ total: validRecipients.length, sent: 0, fail: 0 });

    const validRecipientsPayload = validRecipients.map((u) => {
      const isKnown = isRealPersonName(u.name, u.shopName);
      return {
        _id: u._id,
        id: u._id,
        name: isKnown ? u.name.trim() : '',
        phone: u.phone || (u as any).whatsapp || (u as any).mobile || '',
        shopName: u.shopName || '',
        email: u.email || '',
        category: u.category || (u as any).businessType || '',
        businessType: u.businessType || u.category || '',
        place: u.place || u.market || '',
        market: u.market || u.place || '',
        address: u.address || '',
        plan: u.subscription?.plan || (u as any).plan || 'Free',
        expiresAt: u.subscription?.expiresAt || '',
        monthlyRevenue: u.monthlyRevenue || 0,
      };
    });

    // Build categoryVariants map from CATEGORY_PRESETS if autoMatchCategory is enabled
    const categoryVariantsMap: Record<string, string[]> = {};
    if (autoMatchCategory) {
      const effectiveMarketLeadsVariants =
        DAY_MODE_VARIANTS_MAP[marketLeadsMode] || SATURDAY_MARKET_LEADS_VARIANTS;

      CATEGORY_PRESETS.forEach((preset) => {
        let pool = preset.variants;
        if (preset.id.startsWith('market_leads')) {
          if (selectedCategoryPreset === preset.id) {
            pool = activeVariants;
          } else {
            const mode = preset.id === 'market_leads' ? 'weekday' : (preset.id.replace('market_leads_', '') as MarketLeadsDayMode);
            pool = DAY_MODE_VARIANTS_MAP[mode] || effectiveMarketLeadsVariants;
          }
        } else if (selectedCategoryPreset === preset.id) {
          pool = activeVariants;
        }
        preset.categoryKeys.forEach((key) => {
          categoryVariantsMap[key] = pool;
        });
      });
    }

    try {
      const res = await fetch('/api/admin/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: validRecipientsPayload,
          variants: activeVariants,
          categoryVariants: autoMatchCategory ? categoryVariantsMap : undefined,
          forceSend,
          minDelaySec,
          maxDelaySec,
          batchSize: 10,
          batchCooldownMinSec,
          batchCooldownMaxSec,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setSending(false);
        setSendProgress(null);
        setSendResultMsg({ type: 'error', text: data.error || 'Failed to start broadcast.' });
        return;
      }
    } catch (err: any) {
      setSending(false);
      setSendProgress(null);
      setSendResultMsg({ type: 'error', text: err.message || 'Failed to start broadcast.' });
    }
  };

  // Send Single Test WhatsApp Message
  const handleSendTestMessage = async () => {
    if (waState.status !== 'connected') {
      setTestResult({
        type: 'error',
        text: 'WhatsApp is not connected. Please scan the QR code first.',
      });
      return;
    }

    const cleanPhone = formatWhatsAppPhone(testPhone);
    if (!cleanPhone || cleanPhone.length < 10) {
      setTestResult({
        type: 'error',
        text: 'Please enter a valid Pakistani phone number (e.g. 03352575725 or +923352575725).',
      });
      return;
    }

    const activeVariants = variants.map((v) => v.trim()).filter(Boolean);
    if (activeVariants.length === 0) {
      setTestResult({ type: 'error', text: 'Please enter a message variant to send.' });
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [
            {
              phone: testPhone,
              name: 'Test Merchant',
              shopName: 'Test Wholesale Store',
              email: 'test@dukaankhata.app',
              plan: 'Pro',
              category: 'Wholesale & Mandi',
              place: 'Jodia Bazar',
              businessType: 'Wholesaler',
              expiresAt: '2026-12-31',
            },
          ],
          variants: activeVariants,
          forceSend: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.sentCount > 0) {
        setTestResult({
          type: 'success',
          text: `Test message successfully delivered to +${cleanPhone}!`,
        });
      } else {
        const errDetail = data.results?.[0]?.error || data.error || 'Failed to send test message.';
        setTestResult({
          type: 'error',
          text: `Error: ${errDetail}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        type: 'error',
        text: err.message || 'Failed to send test message.',
      });
    } finally {
      setSendingTest(false);
      fetchStatus();
    }
  };

  // Generate direct wa.me link for first selected or single recipient
  const handleOpenDirectWeb = (user?: User) => {
    const target = user || validRecipients[0];
    if (!target) return;
    const rawPhone = target.phone || (target as any).whatsapp || (target as any).mobile || '';
    const cleanPhone = formatWhatsAppPhone(rawPhone);

    const activeVariants = variants.map((v) => v.trim()).filter(Boolean);
    const chosenVariant = activeVariants[activeVariantTab] || activeVariants[0] || '';
    const formattedMsg = parseSpintax(replaceTemplateVariables(chosenVariant, target));

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(formattedMsg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Preview user for variable replacement (supports simulation of known name vs unknown name)
  const previewUser: User = {
    _id: 'preview_sample_user',
    name: previewWithName ? 'Muhammad Tariq' : '',
    shopName: 'Bismillah Wholesale Traders',
    email: 'tariq@jodiabazar.com',
    phone: '03352575725',
    category: 'Wholesale & Mandi',
    place: 'Jodia Bazar, Karachi',
    businessType: 'Commodity Wholesaler',
    role: 'user',
    status: 'active',
    subscription: { plan: 'Pro', expiresAt: '2026-12-31' },
    monthlyRevenue: 250000,
  };

  const getSamplePreviewText = (variantIdx: number) => {
    const rawText = variants[variantIdx] || variants[0] || '';
    const replaced = replaceTemplateVariables(rawText, previewUser);
    return parseSpintax(replaced);
  };

  // Total Recipients and Batches of 10 calculations
  const totalRecipientsCount = validRecipients.length;
  const totalBatchesCount = Math.max(1, Math.ceil(totalRecipientsCount / 10));
  const totalCooldownsCount = Math.max(0, totalBatchesCount - 1);

  const estimatedMinTotalSec =
    totalRecipientsCount * minDelaySec + totalCooldownsCount * batchCooldownMinSec;
  const estimatedMaxTotalSec =
    totalRecipientsCount * maxDelaySec + totalCooldownsCount * batchCooldownMaxSec;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-6 md:p-8 text-white shadow-xl shadow-emerald-600/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
          <MessageSquare className="w-80 h-80 text-white" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-emerald-100">
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Admin Messaging Suite & Anti-Ban Batch Engine</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              WhatsApp Broadcast & Random Category Variants
            </h1>
            <p className="text-emerald-100 text-xs md:text-sm max-w-2xl leading-relaxed">
              Dispatches random message variants tailored to each merchant’s category. Sends in <strong>safe batches of 10</strong> with a <strong>random 5–10 minute rest interval</strong> between batches and <strong>30–60s individual gaps</strong> to keep your WhatsApp account 100% ban-proof.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={fetchStatus}
              disabled={loadingStatus}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-2 shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>

            {waState.status === 'connected' ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-4 py-2.5 bg-rose-500/90 hover:bg-rose-600 text-white text-xs font-semibold rounded-xl transition flex items-center space-x-2 shadow-md"
              >
                {disconnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                <span>Disconnect WA</span>
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl transition flex items-center space-x-2 shadow-lg"
              >
                {connecting ? <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" /> : <QrCode className="w-4 h-4 text-emerald-700" />}
                <span>{waState.status === 'qr_ready' ? 'Refresh QR Code' : 'Connect WhatsApp QR'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account Health & WhatsApp Anti-Ban Safety Status Cards */}
      {(accountHealth?.reachoutLocked || (safetyInfo && !safetyInfo.insideSendWindow) || todaySentCount >= dailyLimit) && (
        <div className="space-y-3">
          {accountHealth?.reachoutLocked && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start space-x-3 text-rose-900 shadow-sm">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <h4 className="font-extrabold text-sm text-rose-950">WhatsApp Reachout Restriction Active (Anti-Spam Timelock)</h4>
                <p className="leading-relaxed">
                  WhatsApp has flagged this number for rapid messaging and placed a temporary restriction on starting new chats
                  {accountHealth.reachoutLockEndsAt ? ` until ${new Date(accountHealth.reachoutLockEndsAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}` : ''}.
                  Campaigns are paused to safeguard your number from permanent bans.
                </p>
              </div>
            </div>
          )}

          {safetyInfo && !safetyInfo.insideSendWindow && (
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between text-xs text-indigo-900 shadow-xs">
              <div className="flex items-center space-x-2.5">
                <Moon className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Safe Sending Window (9:00 AM – 9:00 PM PKT):</strong> Current time is outside commercial hours. Dispatches pause automatically and resume at 9:00 AM PKT to avoid spam reports.
                </span>
              </div>
              <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg font-mono font-bold text-[11px] shrink-0">
                Resumes 9:00 AM
              </span>
            </div>
          )}

          {todaySentCount >= dailyLimit && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between text-xs text-amber-950 shadow-xs">
              <div className="flex items-center space-x-2.5">
                <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Daily Safety Limit Reached ({todaySentCount} / {dailyLimit}):</strong> To keep your WhatsApp account safe from detection, automated campaigns pause until tomorrow morning.
                </span>
              </div>
              <span className="px-2.5 py-1 bg-amber-200 text-amber-900 rounded-lg font-mono font-bold text-[11px] shrink-0">
                Daily Cap Active
              </span>
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Connection Status & Messaging Composer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: QR Code & Connection Status Card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">WhatsApp Device Connection</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Baileys WebSocket Authentication</p>
                </div>
              </div>

              {/* Status Badge */}
              {waState.status === 'connected' && (
                <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Connected</span>
                </span>
              )}
              {waState.status === 'qr_ready' && (
                <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>Scan QR Code</span>
                </span>
              )}
              {waState.status === 'connecting' && (
                <span className="px-3 py-1 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
                  <span>Initializing...</span>
                </span>
              )}
              {(waState.status === 'disconnected' || waState.status === 'error') && (
                <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-full flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Disconnected</span>
                </span>
              )}
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200/80 rounded-2xl relative min-h-[300px]">
              {waState.status === 'connected' ? (
                <div className="text-center space-y-4 py-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 border-2 border-emerald-300 flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">WhatsApp Account Active</h4>
                    <p className="text-xs text-emerald-700 font-semibold mt-1">
                      Phone: +{waState.phoneNumber || 'Connected'}
                    </p>
                    {waState.userName && (
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">Account: {waState.userName}</p>
                    )}
                    {waState.connectedAt && (
                      <p className="text-[10px] text-slate-400 font-medium mt-2">
                        Connected: {formatDisplayDate(waState.connectedAt)}
                      </p>
                    )}
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="px-4 py-2 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold rounded-xl transition shadow-2xs"
                    >
                      Disconnect Device
                    </button>
                  </div>
                </div>
              ) : waState.status === 'qr_ready' && waState.qrCodeUrl ? (
                <div className="text-center space-y-4">
                  <div className="p-3 bg-white rounded-2xl shadow-md border-2 border-emerald-500/30 inline-block relative">
                    <img src={waState.qrCodeUrl} alt="WhatsApp QR Code" className="w-56 h-56 rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-slate-800">Scan QR Code from WhatsApp</p>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      Open WhatsApp on phone &gt; Settings &gt; Linked Devices &gt; Link a Device.
                    </p>
                  </div>
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition"
                  >
                    Refresh QR Code
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-4 py-8">
                  <div className="w-14 h-14 rounded-2xl bg-slate-200/60 text-slate-500 flex items-center justify-center mx-auto">
                    <QrCode className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-slate-800">No Active WhatsApp Session</p>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      Click below to generate a fresh QR code and connect your business WhatsApp account.
                    </p>
                  </div>
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-600/20"
                  >
                    {connecting ? 'Initializing Engine...' : 'Generate WhatsApp QR Code'}
                  </button>
                </div>
              )}
            </div>

            {/* Anti-Ban Safeguards Summary Box */}
            <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/70">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-900">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>Active Anti-Ban Safeguards</span>
              </div>
              <ul className="text-[11px] text-slate-600 space-y-2">
                <li className="flex items-start space-x-2">
                  <Coffee className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span><strong>10-Message Batches:</strong> Pauses for random 5 to 10 mins (300–600s) after every 10 messages.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                  <span><strong>Individual Gap:</strong> Random 30–60s delay between each message in a batch.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Shuffle className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
                  <span><strong>Random Variants per Category:</strong> Rotates emotional variants tailored to each trade/market.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                  <span><strong>Frequency Protection:</strong> Prevents sending to the same merchant within 15 days unless bypassed.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Column: Category Variant Composer & Recipient Batch Manager */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">Broadcast Engine & Category Templates</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Batch dispatches of 10 with 5–10 min resting pauses</p>
                </div>
              </div>

              <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-full flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>{matchingFilterUsers.length} in Audience</span>
              </span>
            </div>

            {/* Audience Segment Filters */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Filter className="w-3.5 h-3.5 text-sky-500" />
                <span>Target Audience Segment</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleTargetFilterChange('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All Registered Users ({users.length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('market_leads')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    targetFilter === 'market_leads'
                      ? 'bg-sky-600 text-white shadow-2xs ring-2 ring-sky-300'
                      : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Market Leads ({marketLeads.length})</span>
                </button>
                <button
                  onClick={() => {
                    handleTargetFilterChange('saddar_mobile');
                    const autoMode = getAutoDayMode();
                    setMarketLeadsMode(autoMode);
                    const targetPresetId = DAY_MODE_TO_PRESET_ID[autoMode] || 'market_leads';
                    const preset = CATEGORY_PRESETS.find((p) => p.id === targetPresetId) || CATEGORY_PRESETS.find((p) => p.id === 'market_leads');
                    if (preset) {
                      setSelectedCategoryPreset(preset.id);
                      setVariants([...(DAY_MODE_VARIANTS_MAP[autoMode] || SATURDAY_MARKET_LEADS_VARIANTS)]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    targetFilter === 'saddar_mobile'
                      ? 'bg-rose-600 text-white shadow-2xs ring-2 ring-rose-300'
                      : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <Store className="w-3.5 h-3.5 text-rose-500" />
                  <span>📱 Saddar Mobile ({marketLeads.filter((m) => m.isSaddarMobileLead || /saddar.*mobile|mobile.*market|star city/i.test(m.place || m.market || '')).length})</span>
                </button>
                <button
                  onClick={() => handleTargetFilterChange('potential_leads')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                    targetFilter === 'potential_leads'
                      ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-300'
                      : 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Visit Leads ({potentialLeads.length})</span>
                </button>
                <button
                  onClick={() => handleTargetFilterChange('new7')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'new7'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  New (Last 7 Days) (
                  {
                    users.filter((u) => {
                      const ago = new Date();
                      ago.setDate(ago.getDate() - 7);
                      return u.createdAt && new Date(u.createdAt) >= ago;
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => handleTargetFilterChange('active')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'active'
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Active ({users.filter((u) => u.status !== 'suspended' && u.status !== 'blocked').length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('pro')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'pro'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Pro Plan ({users.filter((u) => u.subscription?.plan === 'pro').length})
                </button>
                <button
                  onClick={() => handleTargetFilterChange('inactive7')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'inactive7'
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Inactive 7d (
                  {
                    users.filter((u) => {
                      const ago = new Date();
                      ago.setDate(ago.getDate() - 7);
                      return !u.lastActivity || new Date(u.lastActivity) <= ago;
                    }).length
                  }
                  )
                </button>
                <button
                  onClick={() => handleTargetFilterChange('custom')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    targetFilter === 'custom'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Specific Selection ({selectedUserIds.size > 0 ? `${selectedUserIds.size} Selected` : 'Manual'})
                </button>
              </div>

              {/* Market Leads Sub-Filter: Unsent vs Sent vs Wholesalers */}
              {targetFilter === 'market_leads' && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-sky-50/90 border border-sky-200/90 rounded-xl">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-sky-950">Market Outreach Status:</span>
                    <div className="inline-flex rounded-lg bg-white p-0.5 border border-sky-200 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => {
                          setMarketLeadsSubFilter('all');
                          setSelectedUserIds(new Set());
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                          marketLeadsSubFilter === 'all'
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All Leads ({marketLeads.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMarketLeadsSubFilter('unsent');
                          setSelectedUserIds(new Set());
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center space-x-1 ${
                          marketLeadsSubFilter === 'unsent'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-amber-800 hover:text-amber-900'
                        }`}
                      >
                        <span>⏳ Unsent Only ({marketLeads.filter((m) => !m.whatsappSent).length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMarketLeadsSubFilter('saddar');
                          setSelectedUserIds(new Set());
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center space-x-1 ${
                          marketLeadsSubFilter === 'saddar'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-rose-800 hover:text-rose-900 bg-rose-50/70 border border-rose-200/60'
                        }`}
                      >
                        <span>📱 Saddar Mobile Only ({marketLeads.filter((m) => m.isSaddarMobileLead || /saddar.*mobile|mobile.*market|star city/i.test(m.place || m.market || '')).length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMarketLeadsSubFilter('wholesalers');
                          setSelectedUserIds(new Set());
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center space-x-1 ${
                          marketLeadsSubFilter === 'wholesalers'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-indigo-800 hover:text-indigo-900'
                        }`}
                      >
                        <span>🏢 Traders & Wholesalers ({marketLeads.filter((m) => m.isWholesalerOrTrader || (m.traderWholesaleScore || 0) >= 15).length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMarketLeadsSubFilter('sent');
                          setSelectedUserIds(new Set());
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center space-x-1 ${
                          marketLeadsSubFilter === 'sent'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-emerald-800 hover:text-emerald-900'
                        }`}
                      >
                        <span>✓ Contacted ({marketLeads.filter((m) => m.whatsappSent).length})</span>
                      </button>
                    </div>
                  </div>
                  <span className="text-[11px] text-sky-700 font-medium">
                    {marketLeadsSubFilter === 'saddar'
                      ? '📱 Targeting exclusively Saddar Mobile Market Traders & Wholesalers'
                      : marketLeadsSubFilter === 'wholesalers'
                      ? '🏢 Targeting verified commercial Traders, Wholesalers & Impex suppliers (Saddar Mobile ranked top)'
                      : marketLeadsSubFilter === 'unsent'
                      ? '🎯 Targeting never-contacted leads (Saddar Mobile Market ranked top priority)'
                      : marketLeadsSubFilter === 'sent'
                      ? '🔄 Retargeting previously contacted leads'
                      : 'Showing all scraped market leads (Saddar Mobile Market Traders & Wholesalers ranked top)'}
                  </span>
                </div>
              )}

              {/* Recipient Batch Limit Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-extrabold text-slate-900">Batch Quantity Selector:</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { label: '10 (1 Batch)', count: 10 },
                    { label: '20 (2 Batches)', count: 20 },
                    { label: '30 (3 Batches)', count: 30 },
                    { label: '50 (5 Batches)', count: 50 },
                    { label: '100 (10 Batches)', count: 100 },
                    { label: `All (${matchingFilterUsers.length})`, count: 0 },
                  ].map((b) => (
                    <button
                      key={b.count}
                      onClick={() => {
                        setRecipientLimit(b.count);
                        if (b.count > 0 && selectedUserIds.size > b.count) {
                          const trimmed = Array.from(selectedUserIds).slice(0, b.count);
                          setSelectedUserIds(new Set(trimmed));
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                        recipientLimit === b.count
                          ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* User Picker & Preview List */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={`Search ${matchingFilterUsers.length} matching merchant${matchingFilterUsers.length !== 1 ? 's' : ''}...`}
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        setSelectionWarning(null);
                      }}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-2 shrink-0">
                    <span className="text-[10px] font-bold text-indigo-900 bg-indigo-50 px-2 py-1 border border-indigo-200 rounded-lg">
                      {targetFilter === 'market_leads'
                        ? '🏢 Priority: Traders & Wholesalers Top (Never Sent First)'
                        : '🔥 Priority: Never Sent Top (Highest Active)'}
                    </span>
                    <button
                      onClick={() => toggleSelectAllCustom()}
                      className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                    >
                      {selectedUserIds.size > 0 ? 'Deselect All' : `Select Top ${recipientLimit || matchingFilterUsers.length}`}
                    </button>
                  </div>
                </div>

                {selectionWarning && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center space-x-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{selectionWarning}</span>
                  </div>
                )}

                {matchingFilterUsers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500 font-medium bg-white rounded-lg border border-slate-200">
                    No merchants match the selected filter or search query.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {matchingFilterUsers.slice(0, 50).map((u) => {
                      const isSelected = selectedUserIds.has(u._id);
                      const rawPh = u.phone || (u as any).whatsapp || (u as any).mobile || '';
                      const cleanPh = formatWhatsAppPhone(rawPh);
                      const hasPhone = cleanPh.length >= 10;

                      return (
                        <div
                          key={u._id}
                          onClick={() => toggleSelectUser(u._id)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs transition border cursor-pointer ${
                            isSelected
                              ? 'bg-sky-50 border-sky-300 text-sky-950 font-semibold'
                              : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2 overflow-hidden mr-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-sky-600 focus:ring-sky-500"
                            />
                            <span className="font-bold truncate">
                              {isRealPersonName(u.name, u.shopName) ? (
                                u.name
                              ) : (
                                <span className="text-amber-800 font-semibold">
                                  {u.shopName ? `${u.shopName} wale bhai` : 'Dukan wale bhai'}
                                </span>
                              )}
                            </span>
                            {isRealPersonName(u.name, u.shopName) && u.shopName && (
                              <span className="text-slate-500 text-[11px] truncate">({u.shopName})</span>
                            )}
                            {Boolean(u.isSaddarMobileLead || /saddar.*mobile|mobile.*market|star city/i.test(u.place || u.market || '')) && (
                              <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-bold shrink-0">
                                📱 Saddar Mobile
                              </span>
                            )}
                            {Boolean(u.isWholesalerOrTrader || (u.traderWholesaleScore && u.traderWholesaleScore >= 15)) && (
                              <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-bold shrink-0">
                                🏢 Trader/Wholesaler
                              </span>
                            )}
                            {u.place && <span className="text-sky-600 text-[10px] font-medium bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100 truncate">{u.place}</span>}
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {u.whatsappSent ? (
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[9px] font-bold">
                                ✓ Contacted ({u.whatsappSentCount || 1}x)
                              </span>
                            ) : targetFilter === 'market_leads' ? (
                              <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[9px] font-medium">
                                ⏳ Unsent
                              </span>
                            ) : null}

                            {hasPhone ? (
                              <div className="flex flex-col items-end shrink-0">
                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-mono text-[11px]">
                                  +{cleanPh}
                                </span>
                                <span className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                  Last: {formatTimeAgo(u.lastWaMessageSentAt || u.whatsappSentAt)}
                                </span>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-md font-semibold text-[10px]">
                                No Phone
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Category Variants Selection Header */}
            <div className="space-y-3 bg-gradient-to-r from-slate-50 to-emerald-50/40 p-4 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Select Category Variant Pool</span>
                  </label>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Random variants will be picked from the chosen category or auto-matched per recipient.
                  </p>
                </div>

                {/* Auto Match Toggle */}
                <label className="flex items-center space-x-2 text-xs font-bold text-emerald-900 bg-emerald-100/70 border border-emerald-300 px-3 py-1.5 rounded-xl cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={autoMatchCategory}
                    onChange={(e) => setAutoMatchCategory(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Auto-Match Category per Lead</span>
                </label>
              </div>

              {/* Category Pills Selector - 6 Workflow Categories */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {CATEGORY_PRESETS.map((preset) => {
                  const isSelected = selectedCategoryPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectCategory(preset)}
                      className={`p-3 rounded-xl text-left transition border flex flex-col justify-between ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-300'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {preset.badge}
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              isSelected ? 'text-emerald-200' : 'text-slate-400'
                            }`}
                          >
                            {preset.variants.length} Variants
                          </span>
                        </div>
                        <h4 className="text-xs font-extrabold line-clamp-1 mt-1">{preset.title}</h4>
                      </div>
                      <p
                        className={`text-[11px] line-clamp-2 mt-1.5 font-medium leading-relaxed ${
                          isSelected ? 'text-emerald-100' : 'text-slate-500'
                        }`}
                      >
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Multi-Variant Message Composer Tabs */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center space-x-2">
                  <Shuffle className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                    Message Variants ({variants.filter((v) => v.trim()).length} Active in Pool)
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {variants.length < 20 && (
                    <button
                      onClick={handleAddVariant}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Variant {variants.length + 1}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Market Leads Sub-Pool Switcher (Day Specials) */}
              {(selectedCategoryPreset.startsWith('market_leads') || targetFilter === 'market_leads' || targetFilter === 'saddar_mobile') && (
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-amber-50/50 border border-sky-200/90 rounded-2xl shadow-xs">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black text-slate-900 tracking-tight">Market Day Campaign Specials:</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Today: {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                        {getDayModeDescription(marketLeadsMode)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('weekday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'weekday'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Week Day (10)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('monday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'monday'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-blue-800 hover:text-blue-900 hover:bg-blue-50'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Monday (10){new Date().getDay() === 1 ? ' • Today' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('tuesday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'tuesday'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'text-teal-800 hover:text-teal-900 hover:bg-teal-50'
                      }`}
                    >
                      <Store className="w-3.5 h-3.5" />
                      <span>Tuesday (10){new Date().getDay() === 2 ? ' • Today' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('wednesday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'wednesday'
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'text-violet-800 hover:text-violet-900 hover:bg-violet-50'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Wednesday (10){new Date().getDay() === 3 ? ' • Today' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('thursday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'thursday'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-indigo-800 hover:text-indigo-900 hover:bg-indigo-50'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Thursday (10){new Date().getDay() === 4 ? ' • Today' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('friday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'friday'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-emerald-800 hover:text-emerald-900 hover:bg-emerald-50'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Friday Jumma (10){new Date().getDay() === 5 ? ' • Today' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('saturday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'saturday'
                          ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300'
                          : 'text-rose-800 hover:text-rose-900 hover:bg-rose-50'
                      }`}
                    >
                      <Flame className="w-3.5 h-3.5 text-rose-300" />
                      <span>🔥 Saturday Special (10){new Date().getDay() === 6 ? ' • Today' : ''}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMarketLeadsMode('sunday')}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center space-x-1 ${
                        marketLeadsMode === 'sunday'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-amber-800 hover:text-amber-900 hover:bg-amber-50'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5 text-amber-300" />
                      <span>☀️ Sunday Special (10){new Date().getDay() === 0 ? ' • Today' : ''}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Variant Tabs Header */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {variants.map((v, idx) => (
                  <div key={idx} className="flex items-center shrink-0">
                    <button
                      onClick={() => setActiveVariantTab(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border ${
                        activeVariantTab === idx
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>Variant {idx + 1}</span>
                      {v.trim() ? (
                        <span className={`w-2 h-2 rounded-full ${activeVariantTab === idx ? 'bg-emerald-200' : 'bg-emerald-500'}`} />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-300" />
                      )}
                    </button>
                    {variants.length > 1 && (
                      <button
                        onClick={() => handleRemoveVariant(idx)}
                        className="ml-1 p-1 text-slate-400 hover:text-rose-600 transition"
                        title="Remove Variant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Insert Variables Pills */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Insert Variables into Variant {activeVariantTab + 1}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.tag}
                      onClick={() => handleInsertVariable(v.tag)}
                      className="px-2 py-0.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold rounded-md transition"
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea Editor for Active Variant */}
              <div className="space-y-1">
                <textarea
                  ref={textareaRef}
                  rows={6}
                  value={variants[activeVariantTab] || ''}
                  onChange={(e) => handleUpdateVariant(activeVariantTab, e.target.value)}
                  placeholder={`Type Variant ${activeVariantTab + 1} text here. Use placeholders like {name}, {shopName}, {category}, {place} or Spintax {Salam|Assalam o Alaikum}...`}
                  className="w-full text-xs p-3.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-800 leading-relaxed shadow-2xs"
                />
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
                  <span>Variant {activeVariantTab + 1} of {variants.length}</span>
                  <span>{(variants[activeVariantTab] || '').length} characters</span>
                </div>
              </div>
            </div>

            {/* Anti-Spam Safeguards & Batch Engine Configurator */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200/90 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/60 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Coffee className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider">
                      Batching & Anti-Ban Cooldown Safeguards
                    </h4>
                    <p className="text-[11px] text-emerald-700 font-medium">
                      10 msgs per batch • 5–10 min rest cooldown • 30–60s gap between messages
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full font-bold text-xs flex items-center space-x-1.5 shrink-0">
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Batches of 10</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-emerald-900 flex items-center space-x-1">
                    <span>Individual Gap (30s – 60s)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={minDelaySec}
                      onChange={(e) => setMinDelaySec(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                    />
                    <input
                      type="number"
                      min={minDelaySec}
                      max={120}
                      value={maxDelaySec}
                      onChange={(e) => setMaxDelaySec(Math.max(minDelaySec, parseInt(e.target.value) || minDelaySec))}
                      className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-emerald-900 flex items-center space-x-1">
                    <span>Batch Cooldown Rest (5m – 10m)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        min={60}
                        max={1800}
                        value={batchCooldownMinSec}
                        onChange={(e) => setBatchCooldownMinSec(Math.max(60, parseInt(e.target.value) || 60))}
                        className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                      />
                      <span className="text-[10px] text-slate-400 absolute right-2 top-2.5">
                        {Math.floor(batchCooldownMinSec / 60)}m
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min={batchCooldownMinSec}
                        max={3600}
                        value={batchCooldownMaxSec}
                        onChange={(e) => setBatchCooldownMaxSec(Math.max(batchCooldownMinSec, parseInt(e.target.value) || batchCooldownMinSec))}
                        className="w-full text-xs px-3 py-2 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                      />
                      <span className="text-[10px] text-slate-400 absolute right-2 top-2.5">
                        {Math.floor(batchCooldownMaxSec / 60)}m
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Duration Breakdown Card */}
              <div className="p-3.5 bg-white/80 rounded-xl border border-emerald-200/90 text-xs text-emerald-900 space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span>Estimated Total Run Time: ~{formatDuration(estimatedMinTotalSec)} to {formatDuration(estimatedMaxTotalSec)}</span>
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[11px] font-mono">
                    {totalBatchesCount} {totalBatchesCount === 1 ? 'Batch' : 'Batches'} of 10
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  <strong>Schedule Breakdown:</strong> {totalRecipientsCount} recipients will be sent in{' '}
                  <strong>{totalBatchesCount} batch{totalBatchesCount > 1 ? 'es' : ''} of 10</strong>. Individual messages within each batch will have a{' '}
                  <strong>random {minDelaySec}s–{maxDelaySec}s gap</strong>.
                  {totalCooldownsCount > 0 ? (
                    <> After every 10 messages, the system automatically pauses for a <strong>random {Math.floor(batchCooldownMinSec / 60)} to {Math.floor(batchCooldownMaxSec / 60)} minutes cooldown ({totalCooldownsCount} resting interval{totalCooldownsCount > 1 ? 's' : ''})</strong> to guarantee anti-ban safety.</>
                  ) : (
                    <> Single batch of {totalRecipientsCount} messages (no batch pause required).</>
                  )}
                </p>
                <div className="pt-1 flex items-center justify-between">
                  <label className="flex items-center space-x-2 font-bold cursor-pointer text-slate-900 select-none">
                    <input
                      type="checkbox"
                      checked={forceSend}
                      onChange={(e) => setForceSend(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Bypass 15-day message frequency protection</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Live Message Sample Preview Box */}
            <div className="bg-emerald-950/90 text-emerald-100 p-4 rounded-xl border border-emerald-800 space-y-3 shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                <span className="flex items-center space-x-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Live Variant Preview ({variants.filter((v) => v.trim()).length} variants in category pool)</span>
                </span>

                <div className="flex items-center space-x-1.5 bg-emerald-900/80 px-2 py-1 rounded-lg border border-emerald-800 text-[10px] lowercase tracking-normal">
                  <span className="text-emerald-300 font-semibold uppercase text-[9px] tracking-wider">Simulate Recipient:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewWithName(false)}
                    className={`px-2 py-0.5 rounded transition font-bold ${
                      !previewWithName
                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                        : 'text-emerald-300 hover:text-white'
                    }`}
                  >
                    No Name (&quot;Shop wale bhai&quot;)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewWithName(true)}
                    className={`px-2 py-0.5 rounded transition font-bold ${
                      previewWithName
                        ? 'bg-emerald-400 text-slate-950 shadow-xs'
                        : 'text-emerald-300 hover:text-white'
                    }`}
                  >
                    With Name (&quot;Tariq bhai&quot;)
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
                {variants.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveVariantTab(idx)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition ${
                      activeVariantTab === idx
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-emerald-900/60 text-emerald-300 hover:bg-emerald-800'
                    }`}
                  >
                    Preview Variant {idx + 1}
                  </button>
                ))}
              </div>

              <p className="text-xs font-sans whitespace-pre-wrap leading-relaxed text-emerald-50 bg-emerald-900/40 p-3 rounded-lg border border-emerald-800/60">
                {getSamplePreviewText(activeVariantTab)}
              </p>
            </div>

            {/* Live Broadcast Progress & Cooldown Banner */}
            {sending && (
              <div className="space-y-3">
                {isPaused ? (
                  /* Paused Banner */
                  <div className="p-5 bg-amber-50 border-2 border-amber-500 rounded-2xl space-y-4 shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-md">
                          <Ban className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md text-[10px] font-black uppercase tracking-wider">
                              Campaign Paused
                            </span>
                            <span className="text-xs font-bold text-amber-800">
                              {sendProgress?.sent || 0} of {sendProgress?.total || 0} Sent
                            </span>
                          </div>
                          <h4 className="text-sm font-extrabold text-amber-950 mt-0.5">
                            {pauseReason || 'Broadcast is currently paused'}
                          </h4>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={handleResumeBroadcast}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Resume Broadcast</span>
                        </button>
                        <button
                          onClick={handleStopSending}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-xs"
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-amber-800 bg-amber-100/60 p-2.5 rounded-lg border border-amber-200/80">
                      You can safely click <strong>Resume Broadcast</strong> when ready. All recipient progress is saved in MongoDB.
                    </p>
                  </div>
                ) : batchCooldownInfo.isBatchCooldown ? (
                  /* Anti-Ban Batch Cooldown Alert Banner */
                  <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-2xl space-y-4 shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                          <Coffee className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-md text-[10px] font-black uppercase tracking-wider">
                              Anti-Ban Rest Interval Active
                            </span>
                            <span className="text-xs font-bold text-amber-800">
                              Batch {batchCooldownInfo.currentBatchNumber} Complete
                            </span>
                          </div>
                          <h4 className="text-sm font-extrabold text-amber-950 mt-0.5">
                            Resting 5 to 10 Minutes Between Batches of 10
                          </h4>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={handlePauseBroadcast}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-2xs"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </button>
                        <button
                          onClick={handleStopSending}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shrink-0 shadow-2xs"
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                          <span>Stop</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3.5 bg-white rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-900">
                          {batchCooldownInfo.batchStatusText || `Batch ${batchCooldownInfo.currentBatchNumber} (10 msgs) delivered successfully!`}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium">
                          Progress: {sendProgress?.sent || 0} of {sendProgress?.total || 0} messages delivered so far
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
                        <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                        <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-lg font-mono font-black text-sm tracking-wide border border-amber-300">
                          ⏱️ {formatDuration(countdownSec)} remaining
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-amber-800 bg-amber-100/60 p-2.5 rounded-lg border border-amber-200/80 flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        <strong>WhatsApp Safety Guarantee:</strong> Continuous bulk messaging triggers account flags. Pausing for a random 5–10 minutes after every 10 messages ensures your WhatsApp number stays safe.
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Active Sending within batch */
                  <div className="p-4 bg-sky-50 border-2 border-sky-400 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <RefreshCw className="w-4 h-4 text-sky-600 animate-spin" />
                        <span className="text-xs font-extrabold text-sky-950">
                          Broadcasting — Batch {batchCooldownInfo.currentBatchNumber || Math.floor(((currentSendingInfo?.currentIndex || 1) - 1) / 10) + 1} of {totalBatchesCount} ({sendProgress?.sent || 0} / {sendProgress?.total || 0} Sent)
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handlePauseBroadcast}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </button>
                        <button
                          onClick={handleStopSending}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1"
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                          <span>Stop</span>
                        </button>
                      </div>
                    </div>

                    {currentSendingInfo && (
                      <p className="text-xs text-sky-800 font-medium">
                        Sending to <strong>{currentSendingInfo.name}</strong> ({currentSendingInfo.currentIndex} of {currentSendingInfo.total}) using <strong>Random Variant {currentSendingInfo.variantIdx}</strong>...
                      </p>
                    )}

                    {waitReason && countdownSec > 0 && (
                      <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium flex items-center space-x-2">
                        <Info className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{waitReason}</span>
                      </div>
                    )}

                    {countdownSec > 0 && (
                      <div className="p-3 bg-white rounded-xl border border-sky-200 flex items-center justify-between text-xs text-sky-900 font-bold">
                        <span className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-sky-600 animate-spin" />
                          <span>Message Gap Cooldown Active</span>
                        </span>
                        <span className="px-2.5 py-1 bg-sky-100 text-sky-800 rounded-md font-mono font-extrabold text-xs">
                          ⏱️ Next message in {countdownSec}s
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Test WhatsApp Message Section */}
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Smartphone className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-extrabold text-emerald-900">
                    Send Single Test WhatsApp Message (Any 03xx Number)
                  </span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium">Instant Single Test</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Enter phone number starting with 03 (e.g. 03352575725)"
                    className="w-full text-xs px-3.5 py-2.5 bg-white border border-emerald-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-900"
                  />
                </div>
                <button
                  onClick={handleSendTestMessage}
                  disabled={sendingTest || !testPhone.trim() || waState.status !== 'connected'}
                  className="w-full sm:w-auto px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50 shadow-2xs"
                >
                  {sendingTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send Test Message</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-medium flex items-center space-x-2 ${
                    testResult.type === 'success'
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                      : 'bg-rose-100 border-rose-300 text-rose-900'
                  }`}
                >
                  {testResult.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                  )}
                  <span>{testResult.text}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {sendResultMsg && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-medium flex items-center space-x-2 ${
                  sendResultMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {sendResultMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{sendResultMsg.text}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button
                onClick={() => handleOpenDirectWeb()}
                disabled={validRecipients.length === 0}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2"
              >
                <ExternalLink className="w-4 h-4 text-slate-500" />
                <span>Open in Web WhatsApp (wa.me)</span>
              </button>

              <button
                onClick={handleSendMessages}
                disabled={sending || validRecipients.length === 0 || waState.status !== 'connected'}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/25 disabled:opacity-50"
              >
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>
                  {sending
                    ? 'Broadcasting Messages...'
                    : `Send Automated Broadcast (${validRecipients.length} Users • ${totalBatchesCount} Batches)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sent Campaign History Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Recent Dispatch Activity Logs</h3>
              <p className="text-[11px] text-slate-500 font-medium">History of sent WhatsApp messages from this session</p>
            </div>
          </div>

          <span className="text-xs font-semibold text-slate-500">{waLogs.length} Records</span>
        </div>

        {waLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 font-medium">
            No message dispatch logs recorded yet in this session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">Recipient Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Sent Time</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {waLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{log.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">+{log.phone}</td>
                    <td className="py-3 px-4">
                      {log.success ? (
                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[11px] inline-flex items-center space-x-1">
                          <Check className="w-3 h-3" />
                          <span>Sent</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[11px] inline-flex items-center space-x-1">
                          <XCircle className="w-3 h-3" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {log.sentAt ? formatDisplayDate(log.sentAt) : 'Just now'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {log.error || 'Delivered to socket'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
