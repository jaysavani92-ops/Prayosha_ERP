/**
 * Prayosha ERP - Universal Executive Shell, Tri-Lingual Localization & Central Notification Engine
 * File: /common/shell.js
 * 
 * Features:
 * 1. Central Notification Engine: Real-time listener, unread count badge, glassmorphic dropdown, mark-all-read & deep-linking.
 * 2. Complete Action Hub Drawer: All suites intact (Tasks, Inventory, Purchase, Petty Cash, Plan Change, Drawings, Possession, Workforce, Pre-Dev, Admin, Site Map).
 * 3. Case-Insensitive Deep DOM Scanner: Automatically translates visible text, labels, and placeholders on any page.
 * 4. Bidirectional Caching: Remembers original English strings in a WeakMap for seamless EN <-> GU <-> HI toggles.
 * 5. Live MutationObserver: Automatically translates dynamically rendered cards, tables, and floor accordions.
 * 6. Full Mobile-First Shell: Top executive bar, bottom navigation dock with raised Action Hub, and smart scroll hide.
 * 7. UUID-Safe Filter: Validates project UUIDs before querying PostgreSQL tables to eliminate 22P02 casting exceptions.
 */

import * as Config from '../config.js';

// Central Supabase Client from config.js
export const supabase = Config.supabase || Config.default?.supabase || window.supabaseClient;

/**
 * Validates RFC 4122 UUID strings before sending to PostgreSQL UUID columns
 */
function isValidUUID(str) {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

// ==============================================================================
// 1. MASTER MULTI-LINGUAL CONSTRUCTION DICTIONARY (Case-Insensitive Index)
// ==============================================================================
const RAW_DICTIONARY = {
    // --- Navigation & Core Shell ---
    "prayosha": { gu: "પ્રયોશા", hi: "प्रयोशा" },
    "select site project": { gu: "પ્રોજેક્ટ પસંદ કરો", hi: "પ્રૉજેક્ટ ચુનેં" },
    "user": { gu: "વપરાશકર્તા", hi: "उपયોગકર્તા" },
    "engineer": { gu: "ઈજનેર", hi: "અભિયંતા" },
    "overview": { gu: "ડેશબોર્ડ", hi: "ડેશબોર્ડ" },
    "tasks": { gu: "કાર્યો", hi: "કાર્ય" },
    "hub": { gu: "હબ", hi: "હબ" },
    "workforce": { gu: "શ્રમિક દળ", hi: "શ્રમિક દલ" },
    "pre-dev": { gu: "આયોજન", hi: "આયોજન" },
    "prayosha action hub": { gu: "પ્રયોશા એક્શન હબ", hi: "પ્રયોશા એક્શન હબ" },
    "quick entries & master navigation": { gu: "ઝડપી એન્ટ્રી અને માસ્ટર નેવિગેશન", hi: "ત્વરિત પ્રવિષ્ટિયાં અને નેવિગેશન" },
    "site fast actions": { gu: "સાઇટ ઝડપી ક્રિયાઓ", hi: "સાઇટ ત્વરિત કાર્ય" },
    "raise issue": { gu: "સમસ્યા નોંધો", hi: "સમસ્યા દર્જ કરેં" },
    "log task": { gu: "કાર્ય ઉમેરો", hi: "કાર્ય જોડેં" },
    "log invoice": { gu: "ઇન્વોઇસ લોગ કરો", hi: "ચાલાન લોગ કરેં" },
    "daily report": { gu: "દૈનિક અહેવાલ", hi: "દૈનિક રિપોર્ટ" },
    "site map & spatial suite": { gu: "સાઇટ મેપ અને ઝોન સૂટ", hi: "સાઇટ મેપ તેમજ ઝોન સૂટ" },
    "site map (zones)": { gu: "સાઇટ મેપ (ઝોન)", hi: "સાઇટ મેપ (ઝોન)" },
    "interactive 3d map": { gu: "ઇન્ટરેક્ટિવ 3D મેપ", hi: "ઇન્ટરએક્ટિવ 3D મેપ" },
    "original 2d drawings": { gu: "ઓરિજિનલ 2D ડ્રોઇંગ્સ", hi: "મૂલ 2D ડ્રોઇંગ્સ" },
    "zone kpis & grid": { gu: "ઝોન વિહંગાવલોકન અને ગ્રીડ", hi: "ઝોન અવલોકન તેમજ ગ્રિડ" },
    "floor plan manager": { gu: "ફ્લોર પ્લાન મેનેજર", hi: "ફ્લોર પ્લાન પ્રબંધક" },
    "civil tasks suite": { gu: "સિવિલ કાર્યો સૂટ", hi: "સિવિલ કાર્ય સૂટ" },
    "active tasks": { gu: "સક્રિય કાર્યો", hi: "સક્રિય કાર્ય" },
    "pending tasks": { gu: "બાકી કાર્યો", hi: "લંબિત કાર્ય" },
    "delayed tasks": { gu: "વિલંબિત કાર્યો", hi: "વિલંબિત કાર્ય" },
    "issue logs": { gu: "સમસ્યા લોગ", hi: "સમસ્યા લોગ" },
    "zone timeline": { gu: "ઝોન સમયરેખા", hi: "ઝોન સમયરેખા" },
    "tasks history": { gu: "કાર્ય ઇતિહાસ", hi: "કાર્ય ઇતિહાસ" },
    "inventory & materials suite": { gu: "ઇન્વેન્ટરી અને સામગ્રી સૂટ", hi: "ઇન્વેન્ટ્રી તેમજ સામગ્રી સૂટ" },
    "stock overview": { gu: "સ્ટોક વિહંગાવલોકન", hi: "સ્ટોક અવલોકન" },
    "log transaction": { gu: "ટ્રાન્ઝેક્શન લોગ", hi: "લેન-દેન લોગ" },
    "civil issue logs": { gu: "ઇશ્યુ લોગ્સ", hi: "ઇશ્યુ લોગ્સ" },
    "request indent": { gu: "ઇન્ડેન્ટ વિનંતી", hi: "ઇન્ડેન્ટ અનુરોધ" },
    "damage & returns": { gu: "નુકસાન અને વળતર", hi: "ક્ષતિ તેમજ વાપસી" },
    "generate report": { gu: "અહેવાલ બનાવો", hi: "રિપોર્ટ બનાયેં" },
    "purchase & indents suite": { gu: "ખરીદી અને ઇન્ડેન્ટ સૂટ", hi: "ખરીદ તેમજ ઇન્ડેન્ટ સૂટ" },
    "purchase ledger": { gu: "ખરીદી લેજર", hi: "ખરીદ લેઝર" },
    "indent status": { gu: "ઇન્ડેન્ટ સ્ટેટસ", hi: "ઇન્ડેન્ટ સ્થિતિ" },
    "pending payments": { gu: "બાકી ચૂકવણી", hi: "લંબિત ભુગતાન" },
    "cash ledger": { gu: "રોકડ લેજર", hi: "નકદ લેઝર" },
    "bank ledger": { gu: "બેંક લેજર", hi: "બેંક લેઝર" },

    // --- Notification Center Translations ---
    "notifications": { gu: "સૂચનાઓ", hi: "सूचनाएं" },
    "site notifications": { gu: "સાઇટ સૂચનાઓ", hi: "साइट सूचनाएं" },
    "mark all read": { gu: "બધી વંચાઈ ગઈ", hi: "सभी पढ़ी गईं" },
    "mark all as read": { gu: "બધી વંચાઈ ગઈ તરીકે ચિહ્નિત કરો", hi: "सभी को पढ़ा हुआ चिह्नित करें" },
    "no notifications": { gu: "કોઈ નવી સૂચના નથી", hi: "कोई नई सूचना नहीं है" },
    "unread": { gu: "ન વંચાયેલ", hi: "अपठित" },
    "all": { gu: "બધી", hi: "सभी" },

    // --- Plan Change Suite Translations ---
    "plan change & customization suite": { gu: "પ્લાન ફેરફાર અને ગ્રાહક વિશિષ્ટતા સૂટ", hi: "પ્લાન બદલાવ તેમજ ગ્રાહક અનુકૂલન સૂટ" },
    "plan change suite": { gu: "પ્લાન ફેરફાર સૂટ", hi: "પ્લાન બદલાવ સૂટ" },
    "plan change master": { gu: "પ્લાન ફેરફાર રજિસ્ટર", hi: "પ્લાન બદલાવ માસ્ટર" },
    "plan change": { gu: "પ્લાન ફેરફાર", hi: "પ્લાન બદલાવ" },
    "record plan change": { gu: "પ્લાન ફેરફાર નોંધો", hi: "પ્લાન બદલાવ દર્જ કરેં" },
    "+ record plan change": { gu: "+ પ્લાન ફેરફાર નોંધો", hi: "+ નયા પ્લાન બદલાવ" },
    "custom units": { gu: "કસ્ટમ યુનિટ્સ", hi: "કસ્ટમ યુનિટ્સ" },
    "customer customization": { gu: "ગ્રાહક વિશેષ જરૂરિયાત", hi: "ગ્રાહક અનુકૂલન" },
    "signed proof": { gu: "સહી કરેલ દસ્તાવેજ", hi: "હસ્તાક્ષરિત પ્રમાણ" },

    // --- Petty Cash Suite Translations ---
    "petty cash suite": { gu: "પેટ્ટી કેશ સૂટ", hi: "પેટ્ટી કેશ સૂટ" },
    "petty cash": { gu: "પેટ્ટી કેશ", hi: "પેટ્ટી કેશ" },
    "petty cash ledger": { gu: "પેટ્ટી કેશ લેજર", hi: "પેટ્ટી કેશ લેઝર" },
    "log expense": { gu: "ખર્ચ નોંધો", hi: "ખર્ચ નોંધો" },
    "record site expense": { gu: "સાઇટ ખર્ચ નોંધણી", hi: "સાઇટ ખર્ચ દર્જ કરેં" },
    "reconciliation & audit": { gu: "હિસાબ ચકાસણી અને ઓડિટ", hi: "મિલાન તેમજ ઓડિટ" },
    "monthly reconciliation": { gu: "માસિક હિસાબ / ઓડિટ", hi: "માસિક હિસાબ / ઓડિટ" },

    // --- Drawing Issues & Agency Cases Suite Translations ---
    "drawing issues & agency cases": { gu: "ડ્રોઇંગ અને કન્સલ્ટન્ટ કેસ સૂટ", hi: "ડ્રૉઇંગ તેમજ કન્સલ્ટન્ટ કેસ સૂટ" },
    "drawing cases & agency register": { gu: "ડ્રોઇંગ કેસ અને એજન્સી રજિસ્ટર", hi: "ડ્રૉઇંગ કેસ તેમજ એજન્સી રજિસ્ટર" },
    "drawing cases": { gu: "ડ્રોઇંગ કેસો", hi: "ડ્રૉઇંગ કેસ" },
    "drawing cases register": { gu: "ડ્રોઇંગ કેસ રજિસ્ટર", hi: "ડ્રૉઇંગ કેસ રજિસ્ટર" },
    "raise drawing request": { gu: "ડ્રોઇંગ વિનંતી નોંધો", hi: "ડ્રૉઇંગ અનુરોધ દર્જ કરેં" },
    "+ raise drawing request": { gu: "+ ડ્રોઇંગ વિનંતી નોંધો", hi: "+ નયા ડ્રૉઇંગ અનુરોધ" },
    "consultant cases": { gu: "કન્સલ્ટન્ટ કેસ", hi: "કન્સલ્ટન્ટ કેસ" },
    "case workspace": { gu: "કેસ વર્કસ્પેસ", hi: "કેસ વર્કસ્પેસ" },

    // --- Possession & Handover Suite Translations ---
    "possession & handover suite": { gu: "કબ્જો અને ફ્લેટ સોંપણી સૂટ", hi: "कब्जा एवं फ्लैट सुपुर्दगी सूट" },
    "possession suite": { gu: "કબ્જો (પઝેશન) સૂટ", hi: "कब्जा (पजेशन) सूट" },
    "possession & unit matrix": { gu: "કબ્જો અને યુનિટ મેટ્રિક્સ", hi: "कब्जा एवं यूनिट मैट्रिक्स" },
    "possession matrix": { gu: "પઝેશન મેટ્રિક્સ", hi: "पजेशन मैट्रिक्स" },
    "unit handover workspace": { gu: "યુનિટ સોંપણી વર્કસ્પેસ", hi: "यूनिट सुपुर्दगी वर्कस्पेस" },
    "unit handover": { gu: "ફ્લેટ / યુનિટ સોંપણી", hi: "फ्लैट / यूनिट सुपुर्दगी" },
    "unit handover & snags": { gu: "યુનિટ સોંપણી અને સ્નેગ્સ", hi: "यूनिट सुपुर्दगी एवं स्नैग्स" },
    "priority dispatch log": { gu: "પ્રાથમિકતા ડિસ્પેચ લોગ", hi: "प्राथमिकता प्रेषण लॉग" },
    "priority dispatch": { gu: "પ્રાથમિકતા ડિસ્પેચ", hi: "प्राथमिकता डिस्पैच" },
    "site alerts & priority work orders": { gu: "સાઇટ ચેતવણીઓ અને કાર્ય આદેશ", hi: "साइट अलर्ट एवं कार्य आदेश" },
    "hard chabi (key) security lock": { gu: "કડક ચાવી સુરક્ષા લોક", hi: "कठोर चाबी सुरक्षा लॉक" },
    "keys locked": { gu: "ચાવીઓ લોક કરેલ છે", hi: "चाबियां लॉक हैं" },
    "keys delivered": { gu: "ચાવીઓ સોંપેલ છે", hi: "चाबियां सौंप दी गई हैं" },
    "sold units": { gu: "વેચાયેલ યુનિટ્સ", hi: "બિકે હુએ યુનિટ્સ" },
    "available (unsold)": { gu: "ઉપલબ્ધ (બાકી વેચાણ)", hi: "ઉપલબ્ધ (બિક્રી હેતુ શેષ)" },
    "keys handed over": { gu: "ચાવીઓ સોંપેલ", hi: "ચાબિયાં સોંપી ગઈં" },

    "pre-development": { gu: "પ્રી-ડેવલપમેન્ટ (આયોજન)", hi: "પ્રી-ડેવલપમેન્ટ (આયોજન)" },
    "liasoning & boq master": { gu: "લાયઝનિંગ અને BOQ માસ્ટર", hi: "લાયઝનિંગ તેમજ BOQ માસ્ટર" },
    "• liasoning & boq master": { gu: "• લાયઝનિંગ અને BOQ માસ્ટર", hi: "• લાયઝનિંગ તેમજ BOQ માસ્ટર" },
    "workforce & equipment": { gu: "શ્રમિક અને સાધન સામગ્રી", hi: "શ્રમિક તેમજ ઉપકરણ" },
    "daily labor & equipment diary": { gu: "દૈનિક મજૂર અને સાધન ડાયરી", hi: "દૈનિક શ્રમિક વ ઉપકરણ ડાયરી" },
    "• daily labor & equipment diary": { gu: "• દૈનિક મજૂર અને સાધન ડાયરી", hi: "• દૈનિક શ્રમિક વ ઉપકરણ ડાયરી" },
    "administration": { gu: "વહીવટ / એડમિન", hi: "પ્રશાસન / એડમિન" },
    "+ new project": { gu: "+ નવો પ્રોજેક્ટ", hi: "+ નયા પ્રોજેક્ટ" },
    "new project": { gu: "નવો પ્રોજેક્ટ", hi: "નયા પ્રોજેક્ટ" },
    "employee directory": { gu: "કર્મચારી ડિરેક્ટરી", hi: "કર્મચારી નિર્દેશિકા" },
    "vendor directory": { gu: "વેન્ડર ડિરેક્ટરી", hi: "વેન્ડર નિર્દેશિકા" },
    "logout": { gu: "લોગઆઉટ", hi: "લોગઆઉટ" },

    // --- Project Directory Dashboard & Cards ---
    "project directory": { gu: "પ્રોજેક્ટ ડિરેક્ટરી", hi: "પ્રોજેક્ટ નિર્દેશિકા" },
    "multi-site portfolio, structural zones, and live progress tracking": { gu: "સાઇટ પોર્ટફોલિયો, માળખાકીય ઝોન અને લાઈવ પ્રગતિ ટ્રેકિંગ", hi: "મલ્ટી-સાઇટ પોર્ટફોલિયો, સંરચનાત્મક ઝોન ઓર લાઇવ પ્રગતિ ટ્રેકિંગ" },
    "active workspace": { gu: "સક્રિય કાર્યક્ષેત્ર", hi: "સક્રિય કાર્યક્ષેત્ર" },
    "quick access to operational suites for this site project": { gu: "આ સાઇટ પ્રોજેક્ટ માટે કાર્યકારી સ્યુટ્સની ઝડપી ઍક્સેસ", hi: "ઇસ સાઇટ પ્રોજેક્ટ કે લિએ પરિચાલન સુઇટ્સ તક ત્વરિત પહોંચ" },
    "civil tasks": { gu: "સિવિલ કાર્યો", hi: "સિવિલ કાર્ય" },
    "live site execution": { gu: "લાઈવ સાઇટ અમલીકરણ", hi: "લાઈવ સાઇટ નિષ્પાદન" },
    "inventory & stock": { gu: "ઇન્વેન્ટરી અને સ્ટોક", hi: "ઇન્વેન્ટ્રી તેમજ સ્ટોક" },
    "store & receipts": { gu: "સ્ટોર અને પહોંચ", hi: "સ્ટોર તેમજ રસીદ" },
    "workforce roll": { gu: "શ્રમિક રોલ", hi: "શ્રમિક રોલ" },
    "labor & contractors": { gu: "મજૂરો અને કોન્ટ્રાક્ટરો", hi: "શ્રમિક તેમજ ઠેકેદાર" },
    "approvals & liasoning": { gu: "મંજૂરીઓ અને લાયઝનિંગ", hi: "સ્વીકૃતિયાં તેમજ લાયઝનિંગ" },
    "create project": { gu: "+ પ્રોજેક્ટ બનાવો", hi: "+ પ્રોજેક્ટ બનાવો" },
    "+ create project": { gu: "+ પ્રોજેક્ટ બનાવો", hi: "+ પ્રોજેક્ટ બનાવો" },
    "refresh": { gu: "રીફ્રેશ", hi: "તાઝા કરેં" },
    "all statuses": { gu: "તમામ સ્થિતિઓ", hi: "સભી સ્થિતિયાં" },
    "total area": { gu: "કુલ ક્ષેત્રફળ", hi: "કુલ ક્ષેત્રફળ" },
    "est. budget": { gu: "અંદાજિત બજેટ", hi: "અનુમાનિત બજેટ" },
    "type": { gu: "પ્રકાર", hi: "પ્રકાર" },
    "contract": { gu: "કરાર", hi: "અનુબંધ" },
    "residential": { gu: "રહેણાંક", hi: "આવાસીય" },
    "commercial": { gu: "વ્યાપારી", hi: "વ્યવસાયિક" },
    "residential+commercial": { gu: "રહેણાંક + વ્યાપારી", hi: "આવાસીય + વ્યવસાયિક" },
    "residential + commercial": { gu: "રહેણાંક + વ્યાપારી", hi: "આવાસીય + વ્યવસાયિક" },
    "material only": { gu: "માત્ર મટિરિયલ", hi: "કેવલ સામગ્રી" },
    "with material": { gu: "મટિરિયલ સાથે", hi: "સામગ્રી સહિત" },
    "labor contract": { gu: "મજૂરી કરાર (લેબર)", hi: "મજદૂરી અનુબંધ" },
    "planning": { gu: "આયોજન", hi: "યોજના" },
    "active": { gu: "સક્રિય", hi: "સક્રિય" },
    "completed": { gu: "પૂર્ણ", hi: "પૂર્ણ" },
    "on hold": { gu: "મોકૂફ", hi: "રોકા ગયા" }
};

// Internal cache for original node text values to allow clean toggling back to English
const nodeCache = new WeakMap();

// Dynamic Root Path Resolver
function getRootPrefix() {
    const path = window.location.pathname.replace(/\\/g, '/');
    if (
        path.includes('/projects/') ||
        path.includes('/pre-development/') ||
        path.includes('/workforce/') ||
        path.includes('/tasks/') ||
        path.includes('/inventory/') ||
        path.includes('/purchase/') ||
        path.includes('/petty-cash/') ||
        path.includes('/plan-change/') ||
        path.includes('/drawings/') ||
        path.includes('/possession/') ||
        path.includes('/users/') ||
        path.includes('/vendors/') ||
        path.includes('/site-map/') ||
        path.includes('/common/')
    ) {
        return '../';
    }
    return './';
}

const ROOT_PATH = getRootPrefix();

/**
 * Normalizes text strings for flexible dictionary lookup
 */
function normalizeKey(str) {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Universal Global Translation Helper
 */
export function t(phrase, fallback = '') {
    if (!phrase || typeof phrase !== 'string') return phrase;
    const currentLang = localStorage.getItem('prayosha_lang') || 'en';
    if (currentLang === 'en') return phrase;

    const normalized = normalizeKey(phrase);
    const match = RAW_DICTIONARY[normalized];
    if (match && match[currentLang]) {
        return match[currentLang];
    }
    return fallback || phrase;
}

/**
 * Deep DOM Scanner: Translates all visible text nodes, labels, placeholders, and select options
 */
export function applyTranslations(lang) {
    const targetLang = lang || localStorage.getItem('prayosha_lang') || 'en';
    const isEn = (targetLang === 'en');

    // 1. Text Nodes via TreeWalker
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;

                const tag = parent.tagName;
                if (['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT'].includes(tag)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let textNode;
    while ((textNode = walker.nextNode())) {
        if (!nodeCache.has(textNode)) {
            nodeCache.set(textNode, textNode.nodeValue);
        }
        const originalVal = nodeCache.get(textNode);
        const normalized = normalizeKey(originalVal);

        if (isEn) {
            if (textNode.nodeValue !== originalVal) {
                textNode.nodeValue = originalVal;
            }
        } else {
            const entry = RAW_DICTIONARY[normalized];
            if (entry && entry[targetLang]) {
                const trimmedOrig = originalVal.trim();
                textNode.nodeValue = originalVal.replace(trimmedOrig, entry[targetLang]);
            }
        }
    }

    // 2. Input & Textarea Placeholders
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
        if (!el.dataset.origPh) {
            el.dataset.origPh = el.placeholder;
        }
        const origPh = el.dataset.origPh;
        const normalized = normalizeKey(origPh);

        if (isEn) {
            el.placeholder = origPh;
        } else {
            const entry = RAW_DICTIONARY[normalized];
            if (entry && entry[targetLang]) {
                el.placeholder = entry[targetLang];
            }
        }
    });

    // 3. Dropdown Options
    document.querySelectorAll('select option').forEach(opt => {
        if (!opt.dataset.origText) {
            opt.dataset.origText = opt.text;
        }
        const origText = opt.dataset.origText;
        const normalized = normalizeKey(origText);

        if (isEn) {
            opt.text = origText;
        } else {
            const entry = RAW_DICTIONARY[normalized];
            if (entry && entry[targetLang]) {
                opt.text = entry[targetLang];
            }
        }
    });

    // 4. Fallback for Explicit data-i18n tags
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const normalized = normalizeKey(key);

        if (isEn) {
            if (el.dataset.origText) el.textContent = el.dataset.origText;
        } else {
            if (!el.dataset.origText) el.dataset.origText = el.textContent;
            const entry = RAW_DICTIONARY[normalized];
            if (entry && entry[targetLang]) {
                el.textContent = entry[targetLang];
            }
        }
    });

    // 5. Keep Language Select Value in Sync
    const langSelect = document.getElementById('shell-lang-select');
    if (langSelect && langSelect.value !== targetLang) {
        langSelect.value = targetLang;
    }
}

/**
 * Live MutationObserver to automatically translate dynamically injected content
 */
let translationObserver = null;
function startMutationTranslationObserver() {
    if (translationObserver) return;

    translationObserver = new MutationObserver((mutations) => {
        const currentLang = localStorage.getItem('prayosha_lang') || 'en';
        if (currentLang === 'en') return;

        let hasNewNodes = false;
        for (const m of mutations) {
            if (m.addedNodes.length > 0) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        hasNewNodes = true;
                        break;
                    }
                }
            }
            if (hasNewNodes) break;
        }

        if (hasNewNodes) {
            applyTranslations(currentLang);
        }
    });

    translationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// ==============================================================================
// 2. CENTRAL NOTIFICATION ENGINE & DISPATCH SERVICE
// ==============================================================================
let cachedNotifications = [];
let currentFilter = 'ALL'; // 'ALL' | 'UNREAD'

/**
 * Exported Universal Dispatcher for all modules
 */
export async function sendNotification({
    projectId = null,
    recipientRole = null,
    recipientId = null,
    title,
    message,
    phase = 'General',
    linkUrl = null
}) {
    if (!supabase) return;
    try {
        const rawProjectId = projectId || localStorage.getItem('activeProjectId') || null;
        const validProjectId = isValidUUID(rawProjectId) ? rawProjectId : null;

        const payload = {
            project_id: validProjectId,
            recipient_role: recipientRole,
            recipient_id: recipientId,
            title: title ? title.trim() : '',
            message: message ? message.trim() : '',
            phase: phase,
            link_url: linkUrl,
            is_read: false
        };

        const { data, error } = await supabase.from('notifications').insert([payload]).select().single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('[Notification Dispatch Error]:', err);
    }
}

/**
 * Plays a pleasant site notification tone via Web Audio API
 */
function playNotificationChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5 note
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
}

/**
 * Formats relative timestamp
 */
function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const past = new Date(dateString);
    const diffSec = Math.floor((now - past) / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffHr / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return past.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Returns intuitive icons per operational phase
 */
function getPhaseIcon(phase, title = '') {
    const p = (phase || '').toLowerCase();
    const t = (title || '').toLowerCase();

    if (p.includes('task') || t.includes('task') || t.includes('civil')) return '🏗️';
    if (p.includes('inventory') || p.includes('stock') || t.includes('stock')) return '📦';
    if (p.includes('purchase') || p.includes('indent') || t.includes('po') || t.includes('invoice')) return '🧾';
    if (p.includes('liasoning') || p.includes('pre-dev') || t.includes('approval') || t.includes('rera')) return '📋';
    if (p.includes('workforce') || p.includes('labor') || t.includes('muster')) return '👷';
    if (p.includes('drawing') || t.includes('cad') || t.includes('blueprint')) return '📐';
    if (p.includes('cash') || p.includes('rokdu') || t.includes('petty cash')) return '💵';
    if (p.includes('possession') || t.includes('handover') || t.includes('key')) return '🔑';
    return '🔔';
}

/**
 * Loads notifications from Supabase
 */
async function loadNotifications() {
    if (!supabase) return;

    const userRole = localStorage.getItem('userRole') || '';
    const activeProjectId = localStorage.getItem('activeProjectId');

    try {
        let query = supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(35);

        // Safely filter by project only if activeProjectId is a valid UUID
        if (isValidUUID(activeProjectId)) {
            query = query.or(`project_id.is.null,project_id.eq.${activeProjectId}`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Filter role-based visibility if target_role is defined
        cachedNotifications = (data || []).filter(item => {
            if (!item.recipient_role) return true;
            if (userRole === 'Owner' || userRole === 'General Manager') return true;
            return item.recipient_role.toLowerCase() === userRole.toLowerCase();
        });

        renderNotificationBadgeAndList();

    } catch (err) {
        console.warn('[Notification Fetch Warning]:', err);
    }
}

/**
 * Renders the top badge and dropdown list
 */
function renderNotificationBadgeAndList() {
    const badgeContainer = document.getElementById('shell-notify-badge');
    const panelBadgeCount = document.getElementById('shell-unread-badge-count');
    const listEl = document.getElementById('shell-notifications-list');

    const unreadCount = cachedNotifications.filter(n => !n.is_read).length;

    // 1. Update Navbar Bell Badge
    if (badgeContainer) {
        if (unreadCount > 0) {
            badgeContainer.innerHTML = `
                <span class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center border-2 border-[#1E3A5F] shadow-sm animate-pulse">
                    ${unreadCount > 9 ? '9+' : unreadCount}
                </span>
            `;
        } else {
            badgeContainer.innerHTML = '';
        }
    }

    if (panelBadgeCount) {
        panelBadgeCount.textContent = `${unreadCount} unread`;
    }

    // 2. Render List Items
    if (!listEl) return;

    let displayList = cachedNotifications;
    if (currentFilter === 'UNREAD') {
        displayList = cachedNotifications.filter(n => !n.is_read);
    }

    if (displayList.length === 0) {
        listEl.innerHTML = `
            <div class="py-10 text-center text-slate-400">
                <span class="text-3xl block mb-2">🎉</span>
                <p class="text-xs font-semibold text-slate-600" data-i18n="no notifications">No notifications</p>
                <p class="text-[10px] text-slate-400 mt-0.5">All site alerts and tasks are up to date</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = displayList.map(item => {
        const icon = getPhaseIcon(item.phase, item.title);
        const timeStr = formatTimeAgo(item.created_at);
        const isUnread = !item.is_read;

        return `
            <div class="notification-item p-3 rounded-xl transition cursor-pointer flex gap-3 items-start border ${
                isUnread 
                    ? 'bg-amber-50/70 border-amber-200/90 hover:bg-amber-100/70' 
                    : 'bg-white border-slate-100 hover:bg-slate-50'
            }" data-id="${item.id}" data-link="${item.link_url || ''}">
                <div class="w-8 h-8 rounded-lg ${isUnread ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'} flex items-center justify-center text-sm shrink-0 shadow-2xs">
                    ${icon}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1 mb-0.5">
                        <h4 class="text-xs font-bold ${isUnread ? 'text-[#1E3A5F]' : 'text-slate-800'} truncate">
                            ${item.title || 'Site Alert'}
                        </h4>
                        <span class="text-[9px] font-semibold text-slate-400 shrink-0">${timeStr}</span>
                    </div>
                    <p class="text-[11px] ${isUnread ? 'text-slate-700 font-medium' : 'text-slate-500'} line-clamp-2 leading-relaxed">
                        ${item.message || ''}
                    </p>
                    ${item.phase ? `
                        <div class="mt-1 flex items-center gap-1.5">
                            <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                                ${item.phase}
                            </span>
                        </div>
                    ` : ''}
                </div>
                ${isUnread ? '<span class="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5 shadow-xs"></span>' : ''}
            </div>
        `;
    }).join('');

    // Attach click listeners to notification rows
    listEl.querySelectorAll('.notification-item').forEach(el => {
        el.addEventListener('click', async () => {
            const id = el.getAttribute('data-id');
            const link = el.getAttribute('data-link');

            // Mark as read in Supabase
            try {
                await supabase.from('notifications').update({ is_read: true }).eq('id', id);
                const found = cachedNotifications.find(n => n.id === id);
                if (found) found.is_read = true;
                renderNotificationBadgeAndList();
            } catch (err) {
                console.warn('Could not mark notification as read:', err);
            }

            // Close notification popover
            const popover = document.getElementById('prayosha-notification-panel');
            if (popover) popover.classList.add('hidden');

            // Navigate if link exists
            if (link && link !== 'null' && link.trim() !== '') {
                window.location.href = link;
            }
        });
    });
}

/**
 * Initializes Supabase Realtime Channel for Notifications
 */
function initRealtimeNotifications() {
    if (!supabase || !supabase.channel) return;

    try {
        supabase
            .channel('public:notifications-stream')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                payload => {
                    const newNotif = payload.new;
                    const userRole = localStorage.getItem('userRole') || '';
                    const activeProjectId = localStorage.getItem('activeProjectId');

                    // Filter check
                    if (newNotif.project_id && activeProjectId && isValidUUID(activeProjectId) && newNotif.project_id !== activeProjectId) {
                        return;
                    }
                    if (newNotif.recipient_role && userRole !== 'Owner' && userRole !== 'General Manager') {
                        if (newNotif.recipient_role.toLowerCase() !== userRole.toLowerCase()) return;
                    }

                    // Prepend new notification & play chime
                    cachedNotifications.unshift(newNotif);
                    playNotificationChime();
                    renderNotificationBadgeAndList();
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'notifications' },
                payload => {
                    const updated = payload.new;
                    const idx = cachedNotifications.findIndex(n => n.id === updated.id);
                    if (idx !== -1) {
                        cachedNotifications[idx] = updated;
                        renderNotificationBadgeAndList();
                    }
                }
            )
            .subscribe();
    } catch (err) {
        console.warn('[Realtime Notifications Warning]:', err);
    }
}

// ==============================================================================
// 3. MAIN SHELL CONTROLLER
// ==============================================================================
export async function initShell(options = {}) {
    let activeModule = options.activeModule || '';
    if (!activeModule) {
        const currentPath = window.location.pathname.toLowerCase().replace(/\\/g, '/');
        if (currentPath.includes('/projects/')) activeModule = 'dashboard';
        else if (currentPath.includes('/drawings/')) activeModule = 'drawings';
        else if (currentPath.includes('/tasks/')) activeModule = 'tasks';
        else if (currentPath.includes('/inventory/')) activeModule = 'inventory';
        else if (currentPath.includes('/purchase/')) activeModule = 'purchase';
        else if (currentPath.includes('/petty-cash/')) activeModule = 'petty-cash';
        else if (currentPath.includes('/plan-change/')) activeModule = 'plan-change';
        else if (currentPath.includes('/possession/')) activeModule = 'possession';
        else if (currentPath.includes('/workforce/')) activeModule = 'workforce';
        else if (currentPath.includes('/pre-development/')) activeModule = 'pre-dev';
        else if (currentPath.includes('/users/')) activeModule = 'users';
        else if (currentPath.includes('/vendors/')) activeModule = 'vendors';
        else if (currentPath.includes('/site-map/')) activeModule = 'site-map';
    }

    const prayoshaUserStr = localStorage.getItem('prayosha_user');
    let currentUser = null;
    try {
        currentUser = prayoshaUserStr ? JSON.parse(prayoshaUserStr) : null;
    } catch (_) {}

    const storedRole = localStorage.getItem('userRole') || 'Engineer';

    let availableProjects = [];
    if (supabase) {
        try {
            const { data, error } = await supabase.from('projects').select('*');
            if (!error && data && data.length > 0) {
                availableProjects = data.map(p => ({
                    id: p.id,
                    project_name: p.project_name || p.name || 'Project ' + (p.project_code || p.id),
                    project_code: p.project_code || ''
                })).sort((a, b) => a.project_name.localeCompare(b.project_name));
            }
        } catch (err) {
            console.warn('[Shell] Could not fetch projects list:', err);
        }
    }

    let activeProjectId = localStorage.getItem('activeProjectId');
    let activeProjectName = localStorage.getItem('activeProjectName');
    let activeProjectCode = localStorage.getItem('activeProjectCode');

    if (availableProjects.length > 0) {
        const found = availableProjects.find(p => p.id === activeProjectId || (p.project_code && p.project_code === activeProjectId));
        if (found) {
            activeProjectId = found.id;
            activeProjectName = found.project_name;
            activeProjectCode = found.project_code;
        } else {
            // Self-healing fallback: If stored project is invalid (e.g. "All Projects"), bind to primary project
            activeProjectId = availableProjects[0].id;
            activeProjectName = availableProjects[0].project_name;
            activeProjectCode = availableProjects[0].project_code;
        }
        localStorage.setItem('activeProjectId', activeProjectId);
        localStorage.setItem('activeProjectName', activeProjectName);
        localStorage.setItem('activeProjectCode', activeProjectCode);
    }

    const currentLang = localStorage.getItem('prayosha_lang') || 'en';

    injectShellHTML({
        activeModule,
        currentUser,
        userRole: storedRole,
        availableProjects,
        activeProjectId,
        activeProjectName: activeProjectName || 'Select Site Project',
        activeProjectCode: activeProjectCode || 'SITE',
        currentLang
    });

    // 1. Initial Translation Run
    applyTranslations(currentLang);

    // 2. Start Live MutationObserver
    startMutationTranslationObserver();

    // 3. Attach Shell & Notification Center Listeners
    setupShellListeners();

    // 4. Initialize Notification Center Data & Realtime Sync
    await loadNotifications();
    initRealtimeNotifications();
}

/**
 * Injects Top Bar, Bottom Bar, Notification Dropdown & Action Hub Drawer
 */
function injectShellHTML(data) {
    document.body.classList.add('pt-16', 'pb-24');

    const existing = document.getElementById('prayosha-shell-container');
    if (existing) existing.remove();

    let projectOptionsHtml = '';
    if (data.availableProjects && data.availableProjects.length > 0) {
        for (let i = 0; i < data.availableProjects.length; i++) {
            const p = data.availableProjects[i];
            const isSelected = p.id === data.activeProjectId ? ' selected' : '';
            const codePrefix = p.project_code ? '[' + p.project_code + '] ' : '';
            projectOptionsHtml += '<option value="' + p.id + '" class="text-slate-800 font-medium"' + isSelected + '>' + codePrefix + p.project_name + '</option>';
        }
    } else {
        projectOptionsHtml = '<option value="' + (data.activeProjectId || '') + '" class="text-slate-800">' + data.activeProjectName + '</option>';
    }

    const isDashboard = data.activeModule === 'dashboard';
    const isTasks = data.activeModule === 'tasks';
    const isWorkforce = data.activeModule === 'workforce';
    const isPreDev = data.activeModule === 'pre-dev';
    const isSiteMap = data.activeModule === 'site-map';
    const isPettyCash = data.activeModule === 'petty-cash';
    const isPlanChange = data.activeModule === 'plan-change';
    const isDrawings = data.activeModule === 'drawings';
    const isPossession = data.activeModule === 'possession';

    const dashColorClass = isDashboard ? 'text-[#1E3A5F]' : 'text-slate-400 hover:text-slate-600';
    const dashFontClass = isDashboard ? 'font-bold text-[#1E3A5F]' : 'font-medium';

    const taskColorClass = isTasks ? 'text-[#1E3A5F]' : 'text-slate-400 hover:text-slate-600';
    const taskFontClass = isTasks ? 'font-bold text-[#1E3A5F]' : 'font-medium';

    const wfColorClass = isWorkforce ? 'text-[#1E3A5F]' : 'text-slate-400 hover:text-slate-600';
    const wfFontClass = isWorkforce ? 'font-bold text-[#1E3A5F]' : 'font-medium';

    const preColorClass = isPreDev ? 'text-[#1E3A5F]' : 'text-slate-400 hover:text-slate-600';
    const preFontClass = isPreDev ? 'font-bold text-[#1E3A5F]' : 'font-medium';

    const userName = data.currentUser?.full_name 
        || data.currentUser?.displayName 
        || data.currentUser?.user_metadata?.full_name 
        || data.currentUser?.email?.split('@')[0] 
        || 'User';
    const userRole = (data.userRole || data.currentUser?.role || 'Engineer').replace(/_/g, ' ');

    const shellContainer = document.createElement('div');
    shellContainer.id = 'prayosha-shell-container';

    shellContainer.innerHTML = `
        <!-- ================= TOP EXECUTIVE BAR ================= -->
        <header id="prayosha-topbar" class="fixed top-0 left-0 right-0 z-40 bg-[#1E3A5F] text-white shadow-md transition-transform duration-300 ease-in-out">
            <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3 relative">
                
                <!-- Left: Logo & Project Switcher Dropdown -->
                <div class="flex items-center gap-3 min-w-0">
                    <a href="${ROOT_PATH}projects/project-dashboard.html" class="flex items-center gap-2 flex-shrink-0 group">
                        <div class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 group-hover:bg-[#FFBF00]/20 transition">
                            <span class="text-[#FFBF00] text-xl font-bold">⬢</span>
                        </div>
                        <span data-i18n="prayosha" class="font-bold text-lg tracking-tight hidden sm:inline">Prayosha</span>
                    </a>

                    <!-- Project Context Dropdown -->
                    <div class="relative min-w-0 max-w-[190px] sm:max-w-xs">
                        <select id="shell-project-selector" class="w-full bg-white/10 hover:bg-white/15 focus:bg-[#152a45] text-xs font-semibold text-white py-1.5 pl-3 pr-7 rounded-lg border border-white/20 outline-none appearance-none cursor-pointer truncate transition">
                            ${projectOptionsHtml}
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white/60">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>

                <!-- Right: Tri-Lingual Selector, Notifications Bell, Profile & Logout -->
                <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    
                    <!-- Language Selector (EN / GU / HI) -->
                    <div class="relative">
                        <select id="shell-lang-select" class="bg-white/10 hover:bg-white/15 focus:bg-[#152a45] text-xs font-bold text-[#FFBF00] py-1.5 pl-2.5 pr-6 rounded-lg border border-white/20 outline-none appearance-none cursor-pointer transition">
                            <option value="en" class="text-slate-800 font-medium" ${data.currentLang === 'en' ? 'selected' : ''}>English</option>
                            <option value="gu" class="text-slate-800 font-medium" ${data.currentLang === 'gu' ? 'selected' : ''}>ગુજરાતી</option>
                            <option value="hi" class="text-slate-800 font-medium" ${data.currentLang === 'hi' ? 'selected' : ''}>हिन्दी</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-[#FFBF00]">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>

                    <!-- Notifications Indicator Bell -->
                    <div class="relative">
                        <button id="shell-notify-btn" type="button" title="Site Notifications" class="relative p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                            <span id="shell-notify-badge"></span>
                        </button>

                        <!-- ================= GLASSMORPHIC NOTIFICATION CENTER POPOVER ================= -->
                        <div id="prayosha-notification-panel" class="hidden absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200/90 text-slate-800 z-50 overflow-hidden">
                            <!-- Popover Header -->
                            <div class="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-xs uppercase tracking-wider text-[#1E3A5F]">Site Notifications</span>
                                    <span id="shell-unread-badge-count" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">0 unread</span>
                                </div>
                                <button id="shell-mark-all-read-btn" class="text-[11px] text-blue-600 hover:text-blue-800 font-bold transition cursor-pointer">
                                    Mark all read
                                </button>
                            </div>

                            <!-- Filter Tabs -->
                            <div class="flex border-b border-slate-100 text-[11px] font-bold bg-white">
                                <button id="notif-tab-all" class="flex-1 py-2 text-center border-b-2 border-[#1E3A5F] text-[#1E3A5F]">
                                    All
                                </button>
                                <button id="notif-tab-unread" class="flex-1 py-2 text-center text-slate-400 hover:text-slate-700">
                                    Unread
                                </button>
                            </div>

                            <!-- Scrollable Notifications List -->
                            <div id="shell-notifications-list" class="p-2.5 max-h-80 overflow-y-auto space-y-2 custom-scroll bg-slate-50/30">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                    </div>

                    <!-- User Profile & Logout -->
                    <div class="flex items-center gap-1.5">
                        <div class="hidden md:flex flex-col text-right">
                            <span class="text-xs font-semibold text-white leading-tight">${userName}</span>
                            <span class="text-[10px] text-white/60 capitalize leading-tight">${userRole}</span>
                        </div>
                        <button id="shell-logout-btn" type="button" title="Logout Session" class="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 hover:text-white transition border border-red-500/30 cursor-pointer">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </button>
                    </div>
                </div>

            </div>
        </header>

        <!-- ================= BOTTOM DOCK NAVIGATION ================= -->
        <nav id="prayosha-bottomdock" class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-in-out">
            <div class="max-w-lg mx-auto px-3 h-16 flex items-center justify-around relative">
                
                <!-- 1. Overview -->
                <a href="${ROOT_PATH}projects/project-dashboard.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${dashColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                    <span data-i18n="overview" class="text-[10px] ${dashFontClass}">Overview</span>
                </a>

                <!-- 2. Tasks -->
                <a href="${ROOT_PATH}tasks/active-tasks.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${taskColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                    <span data-i18n="tasks" class="text-[10px] ${taskFontClass}">Tasks</span>
                </a>

                <!-- 3. CENTER ACTION HUB -->
                <div class="flex-1 flex justify-center -mt-6">
                    <button id="shell-hub-toggle" type="button" class="relative group focus:outline-none cursor-pointer" aria-label="Open Action Hub">
                        <div class="w-14 h-14 rounded-full bg-[#1E3A5F] text-[#FFBF00] flex items-center justify-center shadow-lg border-4 border-white transition-transform transform group-hover:scale-105 active:scale-95 group-hover:shadow-amber-500/20">
                            <span class="text-2xl transition-transform duration-300 group-hover:rotate-90">⬢</span>
                        </div>
                        <span data-i18n="hub" class="block text-center text-[10px] font-bold text-[#1E3A5F] mt-0.5">HUB</span>
                    </button>
                </div>

                <!-- 4. Workforce -->
                <a href="${ROOT_PATH}workforce/workforce.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${wfColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <span data-i18n="workforce" class="text-[10px] ${wfFontClass}">Workforce</span>
                </a>

                <!-- 5. Pre-Dev -->
                <a href="${ROOT_PATH}pre-development/pre-development.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${preColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    <span data-i18n="pre-dev" class="text-[10px] ${preFontClass}">Pre-Dev</span>
                </a>

            </div>
        </nav>

        <!-- ================= COMPLETE BOTTOM SHEET: ACTION HUB DRAWER ================= -->
        <div id="prayosha-hub-drawer" class="fixed inset-0 z-50 hidden opacity-0 transition-opacity duration-300">
            <div id="shell-drawer-backdrop" class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"></div>

            <div id="shell-drawer-panel" class="absolute bottom-0 left-0 right-0 max-h-[88vh] bg-[#F8FAFC] rounded-t-3xl shadow-2xl flex flex-col transform translate-y-full transition-transform duration-300 ease-out border-t border-slate-200">
                
                <div class="px-6 pt-4 pb-3 border-b border-slate-200/80 bg-white rounded-t-3xl flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <span class="text-[#FFBF00] text-xl font-bold">⬢</span>
                        <div>
                            <h2 data-i18n="prayosha action hub" class="text-sm font-bold text-[#1E3A5F]">Prayosha Action Hub</h2>
                            <p data-i18n="quick entries & master navigation" class="text-[11px] text-slate-500 font-medium">Quick entries & master navigation</p>
                        </div>
                    </div>
                    <button id="shell-drawer-close" type="button" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div class="p-6 overflow-y-auto space-y-6">
                    
                    <!-- 1. Quick Actions -->
                    <div>
                        <span data-i18n="site fast actions" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">Site Fast Actions</span>
                        <div class="grid grid-cols-3 gap-2.5">
                            <a href="${ROOT_PATH}tasks/raise-issue.html" class="p-3 bg-red-50 hover:bg-red-100/80 border border-red-200/70 rounded-xl flex flex-col items-center text-center transition group">
                                <span class="text-red-600 mb-1 text-lg">🚨</span>
                                <span data-i18n="raise issue" class="text-xs font-semibold text-red-900">Raise Issue</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/log-task.html" class="p-3 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/70 rounded-xl flex flex-col items-center text-center transition group">
                                <span class="text-[#FFBF00] mb-1 text-lg">📝</span>
                                <span data-i18n="log task" class="text-xs font-semibold text-amber-900">Log Task</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/log-invoice.html" class="p-3 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/70 rounded-xl flex flex-col items-center text-center transition group">
                                <span class="text-indigo-600 mb-1 text-lg">🧾</span>
                                <span data-i18n="log invoice" class="text-xs font-semibold text-indigo-900">Log Invoice</span>
                            </a>
                        </div>
                    </div>

                    <!-- 2. SITE MAP & SPATIAL BLUEPRINTS SUITE -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span data-i18n="site map & spatial suite" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Site Map & Spatial Suite</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#1E3A5F] border border-amber-300">Live 3D & CAD</span>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition ${isSiteMap ? 'ring-2 ring-[#1E3A5F] bg-blue-50/50 font-bold text-[#1E3A5F]' : ''}">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="interactive 3d map">Interactive 3D Map</span>
                            </a>
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="original 2d drawings">Original 2D Drawings</span>
                            </a>
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="zone kpis & grid">Zone KPIs & Grid</span>
                            </a>
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="floor plan manager">Floor Plan Manager</span>
                            </a>
                        </div>
                    </div>

                    <!-- 3. DRAWING ISSUES & AGENCY CASES SUITE -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span data-i18n="drawing issues & agency cases" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Drawing Issues & Agency Cases</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-[#1E3A5F] border border-blue-300">RFI & Revisions</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <a href="${ROOT_PATH}drawings/drawing-cases.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition ${isDrawings ? 'ring-2 ring-[#1E3A5F] bg-blue-50/50 font-bold text-[#1E3A5F]' : ''}">
                                <span class="w-2 h-2 rounded-full bg-[#1E3A5F]"></span> <span data-i18n="drawing cases register">Drawing Cases Register</span>
                            </a>
                            <a href="${ROOT_PATH}drawings/raise-request.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="raise drawing request">Raise Drawing Request</span>
                            </a>
                        </div>
                    </div>

                    <!-- 4. PLAN CHANGE & CUSTOMIZATION SUITE -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span data-i18n="plan change & customization suite" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Plan Change & Customization Suite</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-brand-navy border border-amber-300">Customer Specs</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <a href="${ROOT_PATH}plan-change/plan-change-list.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition ${isPlanChange ? 'ring-2 ring-[#1E3A5F] bg-blue-50/50 font-bold text-[#1E3A5F]' : ''}">
                                <span class="w-2 h-2 rounded-full bg-[#1E3A5F]"></span> <span data-i18n="plan change master">Plan Change Master</span>
                            </a>
                            <a href="${ROOT_PATH}plan-change/plan-change-form.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="record plan change">Record Plan Change</span>
                            </a>
                        </div>
                    </div>

                    <!-- 5. POSSESSION & HANDOVER SUITE -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span data-i18n="possession & handover suite" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Possession & Handover Suite</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">Key Security Gate</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}possession/possession-matrix.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition ${isPossession ? 'ring-2 ring-[#1E3A5F] bg-blue-50/50 font-bold text-[#1E3A5F]' : ''}">
                                <span class="w-2 h-2 rounded-full bg-[#1E3A5F]"></span> <span data-i18n="possession & unit matrix">Possession Matrix</span>
                            </a>
                            <a href="${ROOT_PATH}possession/unit-handover.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="unit handover & snags">Unit Handover & Snags</span>
                            </a>
                            <a href="${ROOT_PATH}possession/possession-alerts.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="priority dispatch log">Priority Dispatch Log</span>
                            </a>
                        </div>
                    </div>

                    <!-- 6. Civil Tasks Suite -->
                    <div>
                        <span data-i18n="civil tasks suite" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Civil Tasks Suite</span>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}tasks/active-tasks.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="active tasks">Active Tasks</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/pending-tasks.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-amber-500"></span> <span data-i18n="pending tasks">Pending Tasks</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/delayed-tasks.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-red-500"></span> <span data-i18n="delayed tasks">Delayed Tasks</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/issue-logs.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-slate-400"></span> <span data-i18n="issue logs">Issue Logs</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/zone-timeline.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="zone timeline">Zone Timeline</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/tasks-history.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="tasks history">Tasks History</span>
                            </a>
                        </div>
                    </div>

                    <!-- 7. INVENTORY & MATERIALS SUITE -->
                    <div>
                        <span data-i18n="inventory & materials suite" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Inventory & Materials Suite</span>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}inventory/stock-overview.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="stock overview">Stock Overview</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/log-transaction.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-amber-500"></span> <span data-i18n="log transaction">Log Transaction</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/issue-logs.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="civil issue logs">Civil Issue Logs</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/request-indent.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="request indent">Request Indent</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/report.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-rose-500"></span> <span data-i18n="damage & returns">Damage & Returns</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/generate-report.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-slate-500"></span> <span data-i18n="generate report">Generate Report</span>
                            </a>
                        </div>
                    </div>

                    <!-- 8. PURCHASE & INDENTS SUITE -->
                    <div>
                        <span data-i18n="purchase & indents suite" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Purchase & Indents Suite</span>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}purchase/purchase-ledger.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#1E3A5F]"></span> <span data-i18n="purchase ledger">Purchase Ledger</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/log-invoice.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="log invoice">Log Invoice</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/indent-status.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="indent status">Indent Status</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/pending-payments.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-red-500"></span> <span data-i18n="pending payments">Pending Payments</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/cash-ledger.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="cash ledger">Cash Ledger</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/bank-ledger.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="bank ledger">Bank Ledger</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/generate-report.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-slate-500"></span> <span data-i18n="generate report">Generate Report</span>
                            </a>
                        </div>
                    </div>

                    <!-- 9. PETTY CASH SUITE -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span data-i18n="petty cash suite" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Petty Cash Suite</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">Site Float & Expenses</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}petty-cash/petty-cash.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition ${isPettyCash ? 'ring-2 ring-[#1E3A5F] bg-blue-50/50 font-bold text-[#1E3A5F]' : ''}">
                                <span class="w-2 h-2 rounded-full bg-[#1E3A5F]"></span> <span data-i18n="petty cash ledger">Petty Cash Ledger</span>
                            </a>
                            <a href="${ROOT_PATH}petty-cash/log-expense.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="log expense">Log Expense</span>
                            </a>
                            <a href="${ROOT_PATH}petty-cash/monthly-report.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="reconciliation & audit">Reconciliation & Audit</span>
                            </a>
                        </div>
                    </div>

                    <!-- 10. Pre-Development & Workforce -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="bg-white p-3.5 rounded-2xl border border-slate-200">
                            <span data-i18n="pre-development" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Pre-Development</span>
                            <div class="space-y-1.5">
                                <a href="${ROOT_PATH}pre-development/pre-development.html" class="block text-xs font-medium text-slate-700 hover:text-[#1E3A5F] hover:underline">
                                    <span data-i18n="• liasoning & boq master">• Liasoning & BOQ Master</span>
                                </a>
                            </div>
                        </div>

                        <div class="bg-white p-3.5 rounded-2xl border border-slate-200">
                            <span data-i18n="workforce & equipment" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Workforce & Equipment</span>
                            <div class="space-y-1.5">
                                <a href="${ROOT_PATH}workforce/workforce.html" class="block text-xs font-medium text-slate-700 hover:text-[#1E3A5F] hover:underline">
                                    <span data-i18n="• daily labor & equipment diary">• Daily Labor & Equipment Diary</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <!-- 11. Administration & Masters -->
                    <div class="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap gap-3 items-center justify-between">
                        <span data-i18n="administration" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Administration</span>
                        <div class="flex items-center gap-3">
                            <a href="${ROOT_PATH}projects/create-project.html" class="text-xs font-semibold text-[#1E3A5F] hover:underline">
                                <span data-i18n="+ new project">+ New Project</span>
                            </a>
                            <span class="text-slate-300">|</span>
                            <a href="${ROOT_PATH}users/employee-directory.html" class="text-xs font-semibold text-[#1E3A5F] hover:underline">
                                <span data-i18n="employee directory">Employee Directory</span>
                            </a>
                            <span class="text-slate-300">|</span>
                            <a href="${ROOT_PATH}vendors/vendors.html" class="text-xs font-semibold text-[#1E3A5F] hover:underline">
                                <span data-i18n="vendor directory">Vendor Directory</span>
                            </a>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;

    document.body.appendChild(shellContainer);
}

/**
 * Event Listeners & Interaction Logic
 */
function setupShellListeners() {
    // 1. Project Switcher
    const projectSelector = document.getElementById('shell-project-selector');
    if (projectSelector) {
        projectSelector.addEventListener('change', (e) => {
            const selectedId = e.target.value;
            const selectedOpt = e.target.options[e.target.selectedIndex];
            const selectedText = selectedOpt ? selectedOpt.text.replace(/^\[.*?\]\s*/, '') : '';
            
            localStorage.setItem('activeProjectId', selectedId);
            localStorage.setItem('activeProjectName', selectedText);

            window.dispatchEvent(new CustomEvent('projectChanged', { 
                detail: { projectId: selectedId, projectName: selectedText } 
            }));

            window.location.reload();
        });
    }

    // 2. Action Hub Drawer Controls
    const hubToggle = document.getElementById('shell-hub-toggle');
    const drawer = document.getElementById('prayosha-hub-drawer');
    const drawerPanel = document.getElementById('shell-drawer-panel');
    const drawerBackdrop = document.getElementById('shell-drawer-backdrop');
    const drawerClose = document.getElementById('shell-drawer-close');

    function openDrawer(e) {
        if (e) e.preventDefault();
        if (!drawer || !drawerPanel) return;
        drawer.classList.remove('hidden');
        void drawer.offsetWidth;
        drawer.classList.remove('opacity-0');
        drawer.classList.add('opacity-100');
        drawerPanel.classList.remove('translate-y-full');
        drawerPanel.classList.add('translate-y-0');
    }

    function closeDrawer(e) {
        if (e) e.preventDefault();
        if (!drawer || !drawerPanel) return;
        drawer.classList.remove('opacity-100');
        drawer.classList.add('opacity-0');
        drawerPanel.classList.remove('translate-y-0');
        drawerPanel.classList.add('translate-y-full');
        setTimeout(() => {
            drawer.classList.add('hidden');
        }, 300);
    }

    if (hubToggle) hubToggle.addEventListener('click', openDrawer);
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);

    // 3. Notification Center Popover Controls
    const notifyBtn = document.getElementById('shell-notify-btn');
    const notifyPanel = document.getElementById('prayosha-notification-panel');
    const markAllReadBtn = document.getElementById('shell-mark-all-read-btn');
    const tabAll = document.getElementById('notif-tab-all');
    const tabUnread = document.getElementById('notif-tab-unread');

    if (notifyBtn && notifyPanel) {
        notifyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notifyPanel.classList.toggle('hidden');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!notifyPanel.contains(e.target) && !notifyBtn.contains(e.target)) {
                notifyPanel.classList.add('hidden');
            }
        });
    }

    // Tab Filters
    if (tabAll && tabUnread) {
        tabAll.addEventListener('click', () => {
            currentFilter = 'ALL';
            tabAll.className = 'flex-1 py-2 text-center border-b-2 border-[#1E3A5F] text-[#1E3A5F] font-bold';
            tabUnread.className = 'flex-1 py-2 text-center text-slate-400 hover:text-slate-700 font-medium';
            renderNotificationBadgeAndList();
        });

        tabUnread.addEventListener('click', () => {
            currentFilter = 'UNREAD';
            tabUnread.className = 'flex-1 py-2 text-center border-b-2 border-[#1E3A5F] text-[#1E3A5F] font-bold';
            tabAll.className = 'flex-1 py-2 text-center text-slate-400 hover:text-slate-700 font-medium';
            renderNotificationBadgeAndList();
        });
    }

    // Mark All As Read
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', async () => {
            if (!supabase) return;
            try {
                const unreadIds = cachedNotifications.filter(n => !n.is_read).map(n => n.id);
                if (unreadIds.length === 0) return;

                await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
                cachedNotifications.forEach(n => n.is_read = true);
                renderNotificationBadgeAndList();
            } catch (err) {
                console.warn('Could not mark all notifications as read:', err);
            }
        });
    }

    // 4. Language Selector
    const langSelect = document.getElementById('shell-lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            const chosenLang = e.target.value;
            localStorage.setItem('prayosha_lang', chosenLang);
            applyTranslations(chosenLang);
            window.dispatchEvent(new CustomEvent('prayosha-language-changed', { detail: { lang: chosenLang } }));
        });
    }

    // 5. Logout Action
    const logoutBtn = document.getElementById('shell-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const currentLang = localStorage.getItem('prayosha_lang') || 'en';
            const confirmMsg = currentLang === 'gu' 
                ? 'શું તમે ખરેખર પ્રયોશા ERP માંથી લોગઆઉટ કરવા માંગો છો?' 
                : (currentLang === 'hi' ? 'क्या आप वास्तव में प्रयोशा ERP से लॉगआउट करना चाहते हैं?' : 'Are you sure you want to sign out of Prayosha ERP?');
            
            if (!confirm(confirmMsg)) return;

            if (supabase && supabase.auth) {
                try {
                    await supabase.auth.signOut();
                } catch (err) {
                    console.warn('[Shell Logout Error]:', err);
                }
            }

            localStorage.removeItem('userId');
            localStorage.removeItem('prayosha_user');
            localStorage.removeItem('userRole');

            window.location.replace(`${ROOT_PATH}login.html`);
        });
    }

    // 6. Smart Auto-Hide on Scroll
    const topBar = document.getElementById('prayosha-topbar');
    const bottomDock = document.getElementById('prayosha-bottomdock');

    let lastScrollY = window.scrollY;
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const currentScrollY = window.scrollY;
                const scrollDiff = currentScrollY - lastScrollY;

                if (Math.abs(scrollDiff) > 8) {
                    if (currentScrollY > 70 && scrollDiff > 0) {
                        if (topBar) topBar.classList.add('-translate-y-full');
                        if (bottomDock) bottomDock.classList.add('translate-y-full');
                        if (notifyPanel) notifyPanel.classList.add('hidden');
                    } else if (scrollDiff < 0) {
                        if (topBar) topBar.classList.remove('-translate-y-full');
                        if (bottomDock) bottomDock.classList.remove('translate-y-full');
                    }
                }

                lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// Global window fallbacks
if (typeof window !== 'undefined') {
    window.initShell = initShell;
    window.applyTranslations = applyTranslations;
    window.t = t;
    window.sendNotification = sendNotification;
}