/**
 * Prayosha ERP - Universal Executive Shell & Full Tri-Lingual Localization System
 * File: /common/shell.js
 * 
 * Features:
 * 1. Complete Action Hub Drawer: All suites intact (Tasks, Inventory, Purchase, Petty Cash, Plan Change, Drawings, Workforce, Pre-Dev, Admin, Site Map).
 * 2. Case-Insensitive Deep DOM Scanner: Automatically translates visible text, labels, and placeholders on any page.
 * 3. Bidirectional Caching: Remembers original English strings in a WeakMap for seamless EN <-> GU <-> HI toggles.
 * 4. Live MutationObserver: Automatically translates dynamically rendered cards, tables, and floor accordions.
 * 5. Full Mobile-First Shell: Top executive bar, bottom navigation dock with raised Action Hub, and smart scroll hide.
 */

import * as Config from '../config.js';

// Central Supabase Client from config.js
const supabase = Config.supabase || Config.default?.supabase || window.supabaseClient;

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
    "on hold": { gu: "મોકૂફ", hi: "રોકા ગયા" },

    // --- Create Project Architecture View ---
    "create project architecture": { gu: "નવી પ્રોજેક્ટ રચના બનાવો", hi: "નયા પ્રોજેક્ટ ઢાંચા બનાયેં" },
    "define metadata, scope, financials, and multi-level floor & zone hierarchy": { gu: "પ્રોજેક્ટ વિગતો, સ્કોપ, બજેટ અને ફ્લોર/ઝોન માળખું વ્યાખ્યાયિત કરો", hi: "મેટાડેટા, દાયરા, વિત્તીય બજેટ ઓર ફ્લોર/ઝોન પદાનુક્રમ કો પરિભાષિત કરેં" },
    "back to directory": { gu: "ડિરેક્ટરી પર પાછા જાઓ", hi: "નિર્દેશિકા પર વાપસ જાઓ" },
    "new project setup": { gu: "નવો પ્રોજેક્ટ સેટઅપ", hi: "નયા પ્રોજેક્ટ સેટઅપ" },
    "basic project details": { gu: "મૂળભૂત પ્રોજેક્ટ વિગતો", hi: "મૂલ પ્રોજેક્ટ વિવરણ" },
    "project code": { gu: "પ્રોજેક્ટ કોડ", hi: "પ્રોજેક્ટ કોડ" },
    "project name": { gu: "પ્રોજેક્ટનું નામ", hi: "પ્રોજેક્ટ કા નામ" },
    "project type": { gu: "પ્રોજેક્ટ પ્રકાર", hi: "પ્રોજેક્ટ કા પ્રકાર" },
    "contract type": { gu: "કરારનો પ્રકાર", hi: "અનુબંધ કા પ્રકાર" },
    "current status": { gu: "વર્તમાન સ્થિતિ", hi: "વર્તમાન સ્થિતિ" },
    "project description": { gu: "પ્રોજેક્ટ વર્ણન", hi: "પ્રોજેક્ટ વિવરણ" },
    "rera number": { gu: "રેરા નંબર (RERA)", hi: "રેરા નંબર (RERA)" },
    "project address": { gu: "પ્રોજેક્ટ સરનામું", hi: "પ્રોજેક્ટ કા પતા" },
    "map link": { gu: "ગૂગલ મેપ લિંક", hi: "ગૂગલ મેપ લિંક" },
    "scope, financials & media": { gu: "કાર્યક્ષેત્ર, નાણાકીય અને મીડિયા", hi: "દાયરા, વિત્તીય તેમજ મીડિયા" },

    // --- Pending Tasks & Zone Tree ---
    "pending tasks & zone tree": { gu: "બાકી કાર્યો અને ઝોન ટ્રી", hi: "લંબિત કાર્ય તેમજ ઝોન ટ્રી" },
    "floor-wise hierarchical zone registry and pending civil packages": { gu: "માળ-વાર વંશવેલો ઝોન રજિસ્ટ્રી અને બાકી સિવિલ પેકેજો", hi: "મંજિલ-વાર શ્રેણીબદ્ધ ઝોન રજિસ્ટ્રી ઓર લંબિત સિવિલ પૈકેજ" },
    "+ log new task": { gu: "+ નવું કાર્ય ઉમેરો", hi: "+ નયા કાર્ય જોડેં" },
    "log new task": { gu: "નવું કાર્ય ઉમેરો", hi: "નયા કાર્ય જોડેં" },
    "filtered project:": { gu: "પસંદ કરેલ પ્રોજેક્ટ:", hi: "ચયનિત પ્રોજેક્ટ:" },
    "all towers / blocks": { gu: "તમામ ટાવર / બ્લોક્સ", hi: "સભી ટાવર / બ્લોક" },
    "expand all": { gu: "બધા ખોલો (Expand All)", hi: "સભી ખોલેં (Expand All)" },
    "collapse all": { gu: "બધા બંધ કરો (Collapse All)", hi: "સભી બંધ કરેં (Collapse All)" },
    "basement 2": { gu: "બેઝમેન્ટ ૨", hi: "બેસમેન્ટ 2" },
    "basement 1": { gu: "બેઝમેન્ટ ૧", hi: "બેસમેન્ટ 1" },
    "ground floor": { gu: "ગ્રાઉન્ડ ફ્લોર", hi: "ગ્રાઉન્ડ ફ્લોર" },
    "1st floor": { gu: "પહેલો માળ (1st Floor)", hi: "પહલી મંજિલ (1st Floor)" },
    "2nd floor": { gu: "બીજો માળ (2nd Floor)", hi: "દૂસરી મંજિલ (2nd Floor)" },
    "3rd floor": { gu: "ત્રીજો માળ (3rd Floor)", hi: "તીસરી મંજિલ (3rd Floor)" },
    "4th floor": { gu: "ચોથો માળ (4th Floor)", hi: "ચૌથી મંજિલ (4th Floor)" },
    "5th floor": { gu: "પાંચમો માળ (5th Floor)", hi: "પાંચવીં મંજિલ (5th Floor)" },
    "floor level package": { gu: "માળ સ્તર પેકેજ", hi: "મંજિલ સ્તર પૈકેજ" },
    "1 zone": { gu: "૧ ઝોન", hi: "1 ઝોન" },
    "4 zones": { gu: "૪ ઝોન", hi: "4 ઝોન" },
    "9 zones": { gu: "૯ ઝોન", hi: "9 ઝોન" },

    // --- Log Task Page ---
    "+ નવું કાર્ય ઉમેરો": { gu: "+ નવું કાર્ય ઉમેરો", hi: "+ નયા કાર્ય જોડેં" },
    "assign civil work packages, priority levels, and milestone dates to project zones": { gu: "પ્રોજેક્ટ ઝોનમાં સિવિલ કાર્ય, પ્રાથમિકતા અને સમયમર્યાદા સોંપો", hi: "પ્રોજેક્ટ ઝોન મેં કાર્ય, પ્રાથમિકતા ઓર સમય સીમા સોંપેં" },
    "view active tasks": { gu: "સક્રિય કાર્યો જુઓ", hi: "સક્રિય કાર્ય દેખેં" },
    "project context": { gu: "પ્રોજેક્ટ સંદર્ભ", hi: "પ્રોજેક્ટ સંદર્ભ" },
    "tower / block": { gu: "ટાવર / બ્લોક", hi: "ટાવર / બ્લોક" },
    "floor level": { gu: "માળ (Floor Level)", hi: "મંજિલ (Floor Level)" },
    "-- select floor --": { gu: "-- માળ પસંદ કરો --", hi: "-- મંજિલ ચુનેં --" },
    "work category": { gu: "કામનો પ્રકાર", hi: "કાર્ય શ્રેણી" },
    "-- select work category --": { gu: "-- કામનો પ્રકાર પસંદ કરો --", hi: "-- કાર્ય શ્રેણી ચુનેં --" },
    "zone id / target area": { gu: "ઝોન આઈડી / લક્ષિત વિસ્તાર", hi: "ઝોન આઈડી / લક્ષિત ક્ષેત્ર" },
    "-- select floor first --": { gu: "-- પહેલા માળ પસંદ કરો --", hi: "-- પહલે મંજિલ ચુનેં --" },
    "assigned agency": { gu: "સોંપેલ એજન્સી / કોન્ટ્રાક્ટર", hi: "સૌંપી ગઈ એજન્સી / ઠેકેદાર" },
    "-- select agency --": { gu: "-- એજન્સી પસંદ કરો --", hi: "-- એજન્સી ચુનેં --" },
    "priority": { gu: "પ્રાથમિકતા", hi: "પ્રાથમિકતા" },
    "low": { gu: "સામાન્ય (Low)", hi: "સામાન્ય (Low)" },
    "medium": { gu: "મધ્યમ (Medium)", hi: "મધ્યમ (Medium)" },
    "high": { gu: "ઉચ્ચ (High)", hi: "ઉચ્ચ (High)" },
    "urgent": { gu: "તાકીદનું (Urgent)", hi: "અત્યાવશ્યક (Urgent)" },
    "execution status": { gu: "કામની સ્થિતિ", hi: "કાર્ય સ્થિતિ" },
    "not started": { gu: "શરૂ થયેલ નથી", hi: "શુરૂ નહીં હુઆ" },
    "in progress": { gu: "ચાલુ કામગીરી", hi: "કાર્ય પ્રગતિ પર" },
    "ready for qc": { gu: "QC તપાસ માટે તૈયાર", hi: "QC જાંચ હેતુ તૈયાર" },
    "target date": { gu: "લક્ષ્ય તારીખ", hi: "લક્ષ્ય તિથિ" },
    "task description / scope notes": { gu: "કામની વિગતો / નોંધ", hi: "કાર્ય વિવરણ / નોટ્સ" },
    "clear fields": { gu: "વિગતો સાફ કરો", hi: "વિવરણ સાફ કરેં" },
    "assign task to zone": { gu: "ઝોનમાં કાર્ય સોંપો", hi: "ઝોન મેં કાર્ય સોંપેં" },

    // --- Workforce & Equipment Page ---
    "muster & plant": { gu: "મસ્ટર અને પ્લાન્ટ", hi: "મસ્ટર તેમજ પ્લાન્ટ" },
    "site operations / muster & plant": { gu: "સાઇટ કામગીરી / મસ્ટર અને પ્લાન્ટ", hi: "સાઇટ પરિચાલન / મસ્ટર તેમજ પ્લાન્ટ" },
    "total workforce": { gu: "કુલ શ્રમિકો", hi: "કુલ શ્રમિક" },
    "workers": { gu: "શ્રમિકો", hi: "શ્રમિક" },
    "active site muster": { gu: "સક્રિય સાઇટ મસ્ટર", hi: "સક્રિય સાઇટ મસ્ટર" },
    "contractor labours": { gu: "કોન્ટ્રાક્ટર મજૂરો", hi: "ઠેકેદાર શ્રમિક" },
    "headcount": { gu: "કુલ સંખ્યા", hi: "કુલ સંખ્યા" },
    "active agencies": { gu: "સક્રિય એજન્સીઓ", hi: "સક્રિય એજન્સિયાં" },
    "in-house staff": { gu: "ઇન-હાઉસ સ્ટાફ", hi: "ઇન-હાઉસ સ્ટાફ" },
    "direct site payroll": { gu: "ડાયરેક્ટ સાઇટ પેરોલ", hi: "પ્રત્યક્ષ સાઇટ પેરોલ" },
    "machinery deployed": { gu: "સાધનો / મશીનરી તૈનાત", hi: "તૈનાત મશીનરી / ઉપકરણ" },
    "machines active": { gu: "સક્રિય મશીનો", hi: "સક્રિય મશીનેં" },
    "est. daily burn": { gu: "અંદાજિત દૈનિક ખર્ચ", hi: "અનુમાનિત દૈનિક ખર્ચ" },
    "wages mode: off": { gu: "વેતન મોડ: બંધ", hi: "વેતન મોડ: બંધ" },
    "log attendance": { gu: "હાજરી નોંધો", hi: "ઉપસ્થિતિ દર્જ કરેં" },
    "daily logs": { gu: "દૈનિક લોગ", hi: "દૈનિક લોગ" },
    "add wages": { gu: "વેતન ઉમેરો", hi: "વેતન જોડેં" },
    "whatsapp summary": { gu: "વોટ્સએપ સારાંશ", hi: "વ્હોટ્સએપ સારાંશ" },
    "select record type": { gu: "રેકોર્ડ પ્રકાર પસંદ કરો", hi: "રિકોર્ડ પ્રકાર ચુનેં" },
    "1. labor log (agencies)": { gu: "૧. મજૂર લોગ (એજન્સીઓ)", hi: "1. શ્રમિક લોગ (એજન્સિયાં)" },
    "2. equipment log (machinery)": { gu: "૨. સાધન લોગ (મશીનરી)", hi: "2. ઉપકરણ લોગ (મશીનરી)" },
    "3. in-house labor log": { gu: "૩. ઇન-હાઉસ મજૂર લોગ", hi: "3. ઇન-હાઉસ શ્રમિક લોગ" },
    "site weather & work conditions": { gu: "સાઇટનું હવામાન અને કામની સ્થિતિ", hi: "સાઇટ મૌસમ તેમજ કાર્ય સ્થિતિ" },
    "sunny": { gu: "તડકો (Sunny)", hi: "ધૂપ (Sunny)" },
    "extreme heat": { gu: "અતિશય ગરમી", hi: "અત્યધિક ગરમી" },
    "rain / wet site": { gu: "વરસાદ / ભીની સાઇટ", hi: "બારિશ / ગીલી સાઇટ" },
    "overcast": { gu: "વાદળછાયું વાતાવરણ", hi: "બાદલ છાએ હુએ" },
    "strong winds": { gu: "તેજ પવન", hi: "તેજ હવાએં" },
    "legal site productivity context for rera documentation and contractor claims.": { gu: "રેરા દસ્તાવેજીકરણ અને કોન્ટ્રાક્ટર દાવાઓ માટે કાયદેસર સાઇટ ઉત્પાદકતા સંદર્ભ.", hi: "રેરા દસ્તાવેઝીકરણ ઓર ઠેકેદાર કે દાવા કે લિએ કાનૂની સાઇટ ઉત્પાદકતા સંદર્ભ." },
    "project": { gu: "પ્રોજેક્ટ", hi: "પ્રોજેક્ટ" },
    "1 project assigned (auto-selected)": { gu: "૧ પ્રોજેક્ટ સોંપેલ (ઓટો-પસંદ)", hi: "1 પ્રોજેક્ટ આવંટિત (સ્વતઃ ચયનિત)" },
    "date": { gu: "તારીખ", hi: "તિથિ" },
    "recorded by (auto)": { gu: "નોંધણી કરનાર (ઓટો)", hi: "દર્જકર્તા (ઓટો)" },
    "site engineer": { gu: "સાઇટ એન્જિનિયર", hi: "સાઇટ ઈજનેર" },
    "agency attendance entries": { gu: "એજન્સી હાજરી નોંધણી", hi: "એજન્સી ઉપસ્થિતિ પ્રવિષ્ટિયાં" },
    "copy all yesterday": { gu: "ગઈકાલની નકલ કરો", hi: "કલ કી પ્રતિલિપિ બનાયેં" },
    "+ add agency row": { gu: "+ એજન્સી પંક્તિ ઉમેરો", hi: "+ એજન્સી પંક્તિ જોડેં" },
    "contractor": { gu: "કોન્ટ્રાક્ટર", hi: "ઠેકેદાર" },
    "senting (shuttering)": { gu: "સેન્ટિંગ (શટરિંગ)", hi: "સેન્ટિંગ (શટરિંગ)" },
    "steel (fitters)": { gu: "સ્ટીલ (ફિટર્સ)", hi: "સ્ટીલ (ફિટર્સ)" },
    "masonary (kadia)": { gu: "કડિયાકામ (ચણતર)", hi: "ચિનાઈ (કડિયા)" },
    "plaster": { gu: "પ્લાસ્ટર", hi: "પ્લાસ્ટર" },
    "casting (concrete)": { gu: "કાસ્ટિંગ (કોંક્રીટ)", hi: "કાસ્ટિંગ (કોંક્રીટ)" },

    // --- Pre-Development Module ---
    "pre-development master": { gu: "પ્રી-ડેવલપમેન્ટ માસ્ટર", hi: "પ્રી-ડેવલપમેન્ટ માસ્ટર" },
    "statutory liasoning, comparative boq benchmarks, and site mobilization milestones": { gu: "સરકારી મંજૂરીઓ (લાયઝનિંગ), તુલનાત્મક BOQ અને સાઇટ તૈયારી માઇલસ્ટોન", hi: "સરકારી સ્વીકૃતિયાં (લાયઝનિંગ), તુલનાત્મક BOQ તેમજ સાઇટ તૈયારી માઇલસ્ટોન" },
    "pre-construction operations": { gu: "પ્રી-કન્સ્ટ્રક્શન કામગીરી", hi: "પ્રી-કન્સ્ટ્રક્શન પરિચાલન" },
    "audit logs": { gu: "ઓડિટ લોગ્સ", hi: "ઓડિટ લોગ્સ" },
    "super engine": { gu: "સુપર એન્જિન", hi: "સુપર એન્જિન" },
    "phase 1: liasoning": { gu: "તબક્કો ૧: લાયઝનિંગ", hi: "ચરણ 1: લાયઝનિંગ" },
    "phase 2: development cost": { gu: "તબક્કો ૨: પ્રોજેક્ટ ખર્ચ (BOQ)", hi: "ચરણ 2: નિર્માણ લાગત (BOQ)" },
    "phase 3: site readiness": { gu: "તબક્કો ૩: સાઇટ સજ્જતા", hi: "ચરણ 3: સાઇટ તૈયારી" },
    "total boq budget": { gu: "કુલ BOQ બજેટ", hi: "કુલ BOQ બજેટ" },
    "benchmark variance": { gu: "બેન્ચમાર્ક તફાવત", hi: "બેન્ચમાર્ક અંતર" },
    "calculated across line items": { gu: "તમામ આઇટમ્સ પર ગણતરી કરેલ", hi: "સભી મદોં પર ગણના કી ગઈ" },
    "baseline setup": { gu: "બેઝલાઇન સેટઅપ", hi: "બેઝલાઇન સેટઅપ" },
    "save phase 1": { gu: "તબક્કો ૧ સાચવો", hi: "ચરણ 1 સુરક્ષિત કરેં" },
    "save phase 2 (boq)": { gu: "તબક્કો ૨ સાચવો", hi: "ચરણ 2 સુરક્ષિત કરેં" },
    "save phase 3": { gu: "તબક્કો ૩ સાચવો", hi: "ચરણ 3 સુરક્ષિત કરેં" },
    "track all required town planning, government permissions, and statutory approvals. saving dispatches notifications to owner, construction head & pm.": { gu: "તમામ જરૂરી ટાઉન પ્લાનિંગ, સરકારી મંજૂરીઓ અને કાયદાકીય પરવાનગીઓ ટ્રેક કરો. સાચવતી વખતે ઓનર, કન્સ્ટ્રક્શન હેડ અને PM ને સૂચનાઓ મોકલવામાં આવે છે.", hi: "સભી આવશ્યક નગર નિયોજન, સરકારી અનુમતિયોં ઓર વૈધાનિક અનુમોદનોં કો ટ્રેક કરેં।" },
    "approved (yes)": { gu: "મંજૂર (હા)", hi: "સ્વીકૃત (હાઁ)" },
    "pending (no)": { gu: "બાકી (ના)", hi: "લંબિત (નહીં)" },
    "ready (yes)": { gu: "તૈયાર (હા)", hi: "તૈયાર (હાઁ)" },
    "clearance sub-category": { gu: "મંજૂરી પેટા-કેટેગરી", hi: "સ્વીકૃતિ ઉપ-શ્રેણી" },
    "status": { gu: "સ્થિતિ", hi: "સ્થિતિ" },
    "ref / inward no.": { gu: "સંદર્ભ / આવક નં.", hi: "સંદર્ભ / આવક સંખ્યા" },
    "clearance date": { gu: "મંજૂરી તારીખ", hi: "સ્વીકૃતિ તિથિ" },
    "document (r2)": { gu: "દસ્તાવેજ (R2)", hi: "દસ્તાવેઝ (R2)" },
    "remark": { gu: "નોંધ / રીમાર્ક", hi: "ટિપ્પણી / રિમાર્ક" },
    "action": { gu: "ક્રિયા", hi: "કાર્રવાઈ" },
    "attach file": { gu: "ફાઇલ જોડો", hi: "ફાઇલ સંલગ્ન કરેં" },

    // --- Placeholders ---
    "search by project name, code, or location...": { gu: "પ્રોજેક્ટ નામ, કોડ અથવા સ્થાન દ્વારા શોધો...", hi: "પ્રોજેક્ટ નામ, કોડ યા સ્થાન સે ખોજેં..." },
    "search zone id or catego": { gu: "ઝોન આઈડી અથવા કેટેગરી શોધો...", hi: "ઝોન આઈડી યા શ્રેણી ખોજેં..." },
    "search zone id or category...": { gu: "ઝોન આઈડી અથવા કેટેગરી શોધો...", hi: "ઝોન આઈડી યા શ્રેણી ખોજેં..." },
    "search zone id or room...": { gu: "ઝોન અથવા રૂમ શોધો...", hi: "ઝોન અથવા રૂમ શોધો..." },
    "brief summary of the project...": { gu: "પ્રોજેક્ટનો સંક્ષિપ્ત સારાંશ...", hi: "પ્રોજેક્ટ કા સંક્ષિપ્ત વિવરણ..." },
    "filter clearances...": { gu: "મંજૂરીઓ ફિલ્ટર કરો...", hi: "સ્વીકૃતિયાં ફિલ્ટર કરેં..." },
    "inward / sanction no.": { gu: "આવક / મંજૂરી નં.", hi: "આવક / સ્વીકૃતિ સંખ્યા" },
    "enter detailed work instructions, scope specifications, material details, or site guidelines...": { gu: "કામની વિગતો, સ્પેસિફિકેશન, મટિરિયલ અથવા સાઇટ માર્ગદર્શિકા દાખલ કરો...", hi: "વિસ્તૃત કાર્ય નિર્દેશ, વિનિર્દેશ, સામગ્રી વિવરણ યા સાઇટ દિશાનિર્દેશ દર્જ કરેં..." }
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
 * Normalizes text strings (trims and converts to lowercase) for flexible dictionary lookup
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

/**
 * Main Shell Controller (Injects Top Bar, Bottom Dock, Action Hub & Starts Translator)
 */
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
        const found = availableProjects.find(p => p.id === activeProjectId || p.project_code === activeProjectId);
        if (found) {
            activeProjectId = found.id;
            activeProjectName = found.project_name;
            activeProjectCode = found.project_code;
        } else if (!activeProjectId) {
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

    // 2. Start Live MutationObserver for dynamic tables, cards, and accordions
    startMutationTranslationObserver();

    // 3. Attach Shell Listeners
    setupShellListeners();
}

/**
 * Injects Top Bar, Bottom Bar, and Complete Action Hub Drawer
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
            <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
                
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

                <!-- Right: Tri-Lingual Selector, Alerts, Profile & Logout -->
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

                    <!-- Notifications Indicator -->
                    <button id="shell-notify-btn" type="button" title="Site Notifications" class="relative p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                        <span class="absolute top-1 right-1 w-2 h-2 bg-[#FFBF00] rounded-full animate-pulse"></span>
                    </button>

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

                    <!-- 5. Civil Tasks Suite -->
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

                    <!-- 6. INVENTORY & MATERIALS SUITE -->
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

                    <!-- 7. PURCHASE & INDENTS SUITE -->
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

                    <!-- 8. PETTY CASH SUITE -->
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

                    <!-- 9. Pre-Development & Workforce -->
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

                    <!-- 10. Administration & Masters -->
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

    // 3. Language Selector
    const langSelect = document.getElementById('shell-lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            const chosenLang = e.target.value;
            localStorage.setItem('prayosha_lang', chosenLang);
            applyTranslations(chosenLang);
            window.dispatchEvent(new CustomEvent('prayosha-language-changed', { detail: { lang: chosenLang } }));
        });
    }

    // 4. Logout Action
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

    // 5. Smart Auto-Hide on Scroll
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
}