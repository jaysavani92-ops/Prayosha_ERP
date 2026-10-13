/**
 * Prayosha ERP - Universal Executive Shell & Navigation System
 * File: /common/shell.js
 * 
 * Features:
 * 1. Tri-Lingual Engine: Universal support for English (EN), Gujarati (GU), and Hindi (HI).
 * 2. Top Executive Bar: Monogram, active project selector, tri-lingual dropdown, alerts, logout.
 * 3. Mobile-First Bottom Dock: 5 ergonomic destinations with raised center Action Hub.
 * 4. Action Hub Drawer: Zero click-blocking when closed, smooth slide-up when opened.
 * 5. Automatic Module Highlighting: Auto-detects current URL subfolder (including /inventory/, /purchase/, /vendors/, and /site-map/).
 * 6. Smart Auto-Hide on Scroll: Disappears on downward scroll, reappears on upward scroll.
 * 7. Workspace Session Synchronization: activeProjectId, activeProjectName, activeProjectCode.
 * 8. Full Suite Navigation: Civil Tasks, Inventory, Purchase & Indents, Workforce, Pre-Dev, Admin, Vendors, Site Map (Zones).
 */

import * as Config from '../config.js';

// Central Supabase Client from config.js
const supabase = Config.supabase || Config.default?.supabase || window.supabaseClient;

// Universal Tri-Lingual Dictionary
const I18N_DICTIONARY = {
    en: {
        brandSubtitle: 'Prayosha',
        selectSiteProject: 'Select Site Project',
        userFallback: 'User',
        roleFallback: 'Engineer',
        navOverview: 'Overview',
        navTasks: 'Tasks',
        navHub: 'HUB',
        navWorkforce: 'Workforce',
        navPreDev: 'Pre-Dev',
        hubTitle: 'Prayosha Action Hub',
        hubSubtitle: 'Quick entries & master navigation',
        sectionFastActions: 'Site Fast Actions',
        actionRaiseIssue: 'Raise Issue',
        actionLogTask: 'Log Task',
        actionDailyReport: 'Daily Report',
        sectionSiteMap: 'Site Map & Spatial Suite',
        navSiteMap: 'Site Map (Zones)',
        linkInteractiveMap: 'Interactive 3D Map',
        linkCadDrawings: 'Original 2D Drawings',
        linkZoneGrid: 'Zone KPIs & Grid',
        linkFloorManager: 'Floor Plan Manager',
        sectionCivilTasks: 'Civil Tasks Suite',
        taskActive: 'Active Tasks',
        taskPending: 'Pending Tasks',
        taskDelayed: 'Delayed Tasks',
        taskIssues: 'Issue Logs',
        taskTimeline: 'Zone Timeline',
        taskHistory: 'Tasks History',
        sectionInventory: 'Inventory & Materials Suite',
        invStock: 'Stock Overview',
        invLog: 'Log Transaction',
        invIssues: 'Civil Issue Logs',
        invIndent: 'Request Indent',
        invReport: 'Damage & Returns',
        invAnalytics: 'Generate Report',
        sectionPurchase: 'Purchase & Indents Suite',
        purLedger: 'Purchase Ledger',
        purLog: 'Log Invoice',
        purIndent: 'Indent Status',
        purPending: 'Pending Payments',
        purCash: 'Cash Ledger',
        purBank: 'Bank Ledger',
        purReport: 'Generate Report',
        sectionPreDev: 'Pre-Development',
        linkLiasoning: '• Liasoning & BOQ Master',
        sectionWorkforce: 'Workforce & Equipment',
        linkWorkforce: '• Daily Labor & Equipment Diary',
        sectionAdmin: 'Administration',
        linkNewProject: '+ New Project',
        linkDirectory: 'Employee Directory',
        linkVendors: 'Vendor Directory',
        logoutConfirm: 'Are you sure you want to sign out of Prayosha ERP?'
    },
    gu: {
        brandSubtitle: 'પ્રયોશા',
        selectSiteProject: 'પ્રોજેક્ટ પસંદ કરો',
        userFallback: 'વપરાશકર્તા',
        roleFallback: 'ઈજનેર',
        navOverview: 'ડેશબોર્ડ',
        navTasks: 'કાર્યો',
        navHub: 'હબ',
        navWorkforce: 'શ્રમિક દળ',
        navPreDev: 'આયોજન',
        hubTitle: 'પ્રયોશા એક્શન હબ',
        hubSubtitle: 'ઝડપી એન્ટ્રી અને નેવિગેશન',
        sectionFastActions: 'સાઇટ ઝડપી ક્રિયાઓ',
        actionRaiseIssue: 'સમસ્યા નોંધો',
        actionLogTask: 'કાર્ય ઉમેરો',
        actionDailyReport: 'દૈનિક અહેવાલ',
        sectionSiteMap: 'સાઇટ મેપ અને ઝોન સૂટ',
        navSiteMap: 'સાઇટ મેપ (ઝોન)',
        linkInteractiveMap: 'ઇન્ટરેક્ટિવ 3D મેપ',
        linkCadDrawings: 'ઓરિજિનલ 2D ડ્રોઇંગ્સ',
        linkZoneGrid: 'ઝોન વિહંગાવલોકન',
        linkFloorManager: 'ફ્લોર પ્લાન મેનેજર',
        sectionCivilTasks: 'સિવિલ કાર્યો સૂટ',
        taskActive: 'સક્રિય કાર્યો',
        taskPending: 'બાકી કાર્યો',
        taskDelayed: 'વિલંબિત કાર્યો',
        taskIssues: 'સમસ્યા લોગ',
        taskTimeline: 'ઝોન સમયરેખા',
        taskHistory: 'કાર્ય ઇતિહાસ',
        sectionInventory: 'ઇન્વેન્ટરી અને સામગ્રી સૂટ',
        invStock: 'સ્ટોક વિહંગાવલોકન',
        invLog: 'ટ્રાન્ઝેક્શન લોગ',
        invIssues: 'ઇશ્યુ લોગ્સ',
        invIndent: 'ઇન્ડેન્ટ વિનંતી',
        invReport: 'નુકસાન અને વળતર',
        invAnalytics: 'અહેવાલ બનાવો',
        sectionPurchase: 'ખરીદી અને ઇન્ડેન્ટ સૂટ',
        purLedger: 'ખરીદી લેજર',
        purLog: 'ઇન્વોઇસ લોગ કરો',
        purIndent: 'ઇન્ડેન્ટ સ્ટેટસ',
        purPending: 'બાકી ચૂકવણી',
        purCash: 'રોકડ લેજર',
        purBank: 'બેંક લેજર',
        purReport: 'અહેવાલ બનાવો',
        sectionPreDev: 'પ્રી-ડેવલપમેન્ટ (આયોજન)',
        linkLiasoning: '• લાયઝનિંગ અને BOQ માસ્ટર',
        sectionWorkforce: 'શ્રમિક અને સાધન સામગ્રી',
        linkWorkforce: '• દૈનિક મજૂર અને સાધન ડાયરી',
        sectionAdmin: 'વહીવટ / એડમિન',
        linkNewProject: '+ નવો પ્રોજેક્ટ',
        linkDirectory: 'કર્મચારી ડિરેક્ટરી',
        linkVendors: 'વેન્ડર ડિરેક્ટરી',
        logoutConfirm: 'શું તમે ખરેખર પ્રયોશા ERP માંથી લોગઆઉટ કરવા માંગો છો?'
    },
    hi: {
        brandSubtitle: 'प्रयोशा',
        selectSiteProject: 'प्रोजेक्ट चुनें',
        userFallback: 'उपयोगकर्ता',
        roleFallback: 'अभियंता',
        navOverview: 'डैशबोर्ड',
        navTasks: 'कार्य',
        navHub: 'हब',
        navWorkforce: 'श्रमिक दल',
        navPreDev: 'आयोजन',
        hubTitle: 'प्रयोशा एक्शन हब',
        hubSubtitle: 'त्वरित प्रविष्टियां और नेविगेशन',
        sectionFastActions: 'साइट त्वरित कार्य',
        actionRaiseIssue: 'समस्या दर्ज करें',
        actionLogTask: 'कार्य जोड़ें',
        actionDailyReport: 'दैनिक रिपोर्ट',
        sectionSiteMap: 'साइट मैप एवं ज़ोन सूट',
        navSiteMap: 'साइट मैप (ज़ोन)',
        linkInteractiveMap: 'इंटरैक्टिव 3D मैप',
        linkCadDrawings: 'मूल 2D ड्रॉइंग्स',
        linkZoneGrid: 'ज़ोन अवलोकन एवं ग्रिड',
        linkFloorManager: 'फ्लोर प्लान प्रबंधक',
        sectionCivilTasks: 'सिविल कार्य सूट',
        taskActive: 'सक्रिय कार्य',
        taskPending: 'लंबित कार्य',
        taskDelayed: 'विलंबित कार्य',
        taskIssues: 'समस्या लॉग',
        taskTimeline: 'ज़ोन समयरेखा',
        taskHistory: 'कार्य इतिहास',
        sectionInventory: 'इन्वेंट्री एवं सामग्री सूट',
        invStock: 'स्टॉक अवलोकन',
        invLog: 'लेन-देन लॉग',
        invIssues: 'इश्यू लॉग्स',
        invIndent: 'इंडेंट अनुरोध',
        invReport: 'क्षति एवं वापसी',
        invAnalytics: 'रिपोर्ट बनाएं',
        sectionPurchase: 'खरीद और इंडेंट सूट',
        purLedger: 'खरीद लेज़र',
        purLog: 'चालान लॉग करें',
        purIndent: 'इंडेंट स्थिति',
        purPending: 'लंबित भुगतान',
        purCash: 'नकद लेज़र',
        purBank: 'बैंक लेज़र',
        purReport: 'रिपोर्ट बनाएं',
        sectionPreDev: 'प्री-डेवलपमेंट (आयोजन)',
        linkLiasoning: '• लायजनिंग एवं BOQ मास्टर',
        sectionWorkforce: 'श्रमिक एवं उपकरण',
        linkWorkforce: '• दैनिक श्रमिक व उपकरण डायरी',
        sectionAdmin: 'प्रशासन / एडमिन',
        linkNewProject: '+ नया प्रोजेक्ट',
        linkDirectory: 'कर्मचारी निर्देशिका',
        linkVendors: 'वेंडर निर्देशिका',
        logoutConfirm: 'क्या आप वास्तव में प्रयोशा ERP से लॉगआउट करना चाहते हैं?'
    }
};

// Determine root path dynamically across directory depths
function getRootPrefix() {
    const path = window.location.pathname.replace(/\\/g, '/');
    if (
        path.includes('/projects/') ||
        path.includes('/pre-development/') ||
        path.includes('/workforce/') ||
        path.includes('/tasks/') ||
        path.includes('/inventory/') ||
        path.includes('/purchase/') ||
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
 * Main Shell Controller
 */
export async function initShell(options = {}) {
    // 1. Auto-detect active module from URL
    let activeModule = options.activeModule || '';
    if (!activeModule) {
        const currentPath = window.location.pathname.toLowerCase().replace(/\\/g, '/');
        if (currentPath.includes('/projects/')) {
            activeModule = 'dashboard';
        } else if (currentPath.includes('/tasks/')) {
            activeModule = 'tasks';
        } else if (currentPath.includes('/inventory/')) {
            activeModule = 'inventory';
        } else if (currentPath.includes('/purchase/')) {
            activeModule = 'purchase';
        } else if (currentPath.includes('/workforce/')) {
            activeModule = 'workforce';
        } else if (currentPath.includes('/pre-development/')) {
            activeModule = 'pre-dev';
        } else if (currentPath.includes('/users/')) {
            activeModule = 'users';
        } else if (currentPath.includes('/vendors/')) {
            activeModule = 'vendors';
        } else if (currentPath.includes('/site-map/')) {
            activeModule = 'site-map';
        }
    }

    // 2. Session & Auth Verification from localStorage
    const prayoshaUserStr = localStorage.getItem('prayosha_user');
    let currentUser = null;
    try {
        currentUser = prayoshaUserStr ? JSON.parse(prayoshaUserStr) : null;
    } catch (e) {
        currentUser = null;
    }

    const storedRole = localStorage.getItem('userRole') || 'Engineer';

    // 3. Fetch Projects for Switcher using config.js Supabase client
    let availableProjects = [];
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*');

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

    // Active Language (Defaults to English)
    const currentLang = localStorage.getItem('prayosha_lang') || 'en';

    // 4. Inject Shell HTML Elements
    injectShellHTML({
        activeModule: activeModule,
        currentUser: currentUser,
        userRole: storedRole,
        availableProjects: availableProjects,
        activeProjectId: activeProjectId,
        activeProjectName: activeProjectName || 'Select Site Project',
        activeProjectCode: activeProjectCode || 'SITE',
        currentLang: currentLang
    });

    // 5. Apply Initial Language Translation
    applyTranslations(currentLang);

    // 6. Attach Event Handlers
    setupShellListeners();
}

/**
 * Swaps UI Text based on selected Language
 */
export function applyTranslations(lang) {
    const dict = I18N_DICTIONARY[lang] || I18N_DICTIONARY.en;
    
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
            el.textContent = dict[key];
        }
    });

    const langSelect = document.getElementById('shell-lang-select');
    if (langSelect && langSelect.value !== lang) {
        langSelect.value = lang;
    }
}

/**
 * Injects Top Bar, Bottom Bar, and Hub Drawer
 */
function injectShellHTML(data) {
    document.body.classList.add('pt-16', 'pb-24');

    const existing = document.getElementById('prayosha-shell-container');
    if (existing) {
        existing.remove();
    }

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
    const isInventory = data.activeModule === 'inventory';
    const isPurchase = data.activeModule === 'purchase';
    const isWorkforce = data.activeModule === 'workforce';
    const isPreDev = data.activeModule === 'pre-dev';
    const isSiteMap = data.activeModule === 'site-map';

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
                        <span data-i18n="brandSubtitle" class="font-bold text-lg tracking-tight hidden sm:inline">Prayosha</span>
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
                    
                    <!-- Tri-Lingual Language Selector (EN / GU / HI) -->
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
                    <button id="shell-notify-btn" type="button" title="Site Notifications" class="relative p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                        <span class="absolute top-1 right-1 w-2 h-2 bg-[#FFBF00] rounded-full animate-pulse"></span>
                    </button>

                    <!-- User Profile & Logout -->
                    <div class="flex items-center gap-1.5">
                        <div class="hidden md:flex flex-col text-right">
                            <span class="text-xs font-semibold text-white leading-tight">${userName}</span>
                            <span class="text-[10px] text-white/60 capitalize leading-tight">${userRole}</span>
                        </div>
                        <button id="shell-logout-btn" type="button" title="Logout Session" class="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 hover:text-white transition border border-red-500/30">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                        </button>
                    </div>
                </div>

            </div>
        </header>

        <!-- ================= BOTTOM DOCK NAVIGATION ================= -->
        <nav id="prayosha-bottomdock" class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-in-out">
            <div class="max-w-lg mx-auto px-3 h-16 flex items-center justify-around relative">
                
                <!-- 1. Dashboard -->
                <a href="${ROOT_PATH}projects/project-dashboard.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${dashColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                    <span data-i18n="navOverview" class="text-[10px] ${dashFontClass}">Overview</span>
                </a>

                <!-- 2. Tasks -->
                <a href="${ROOT_PATH}tasks/active-tasks.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${taskColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                    <span data-i18n="navTasks" class="text-[10px] ${taskFontClass}">Tasks</span>
                </a>

                <!-- 3. CENTER ACTION HUB -->
                <div class="flex-1 flex justify-center -mt-6">
                    <button id="shell-hub-toggle" type="button" class="relative group focus:outline-none cursor-pointer" aria-label="Open Action Hub">
                        <div class="w-14 h-14 rounded-full bg-[#1E3A5F] text-[#FFBF00] flex items-center justify-center shadow-lg border-4 border-white transition-transform transform group-hover:scale-105 active:scale-95 group-hover:shadow-amber-500/20">
                            <span class="text-2xl transition-transform duration-300 group-hover:rotate-90">⬢</span>
                        </div>
                        <span data-i18n="navHub" class="block text-center text-[10px] font-bold text-[#1E3A5F] mt-0.5">HUB</span>
                    </button>
                </div>

                <!-- 4. Workforce -->
                <a href="${ROOT_PATH}workforce/workforce.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${wfColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <span data-i18n="navWorkforce" class="text-[10px] ${wfFontClass}">Workforce</span>
                </a>

                <!-- 5. Pre-Dev -->
                <a href="${ROOT_PATH}pre-development/pre-development.html" class="flex flex-col items-center justify-center flex-1 py-1 transition ${preColorClass}">
                    <svg class="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    <span data-i18n="navPreDev" class="text-[10px] ${preFontClass}">Pre-Dev</span>
                </a>

            </div>
        </nav>

        <!-- ================= BOTTOM SHEET: ACTION HUB DRAWER ================= -->
        <div id="prayosha-hub-drawer" class="fixed inset-0 z-50 hidden opacity-0 transition-opacity duration-300">
            <div id="shell-drawer-backdrop" class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"></div>

            <div id="shell-drawer-panel" class="absolute bottom-0 left-0 right-0 max-h-[88vh] bg-[#F8FAFC] rounded-t-3xl shadow-2xl flex flex-col transform translate-y-full transition-transform duration-300 ease-out border-t border-slate-200">
                
                <div class="px-6 pt-4 pb-3 border-b border-slate-200/80 bg-white rounded-t-3xl flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <span class="text-[#FFBF00] text-xl font-bold">⬢</span>
                        <div>
                            <h2 data-i18n="hubTitle" class="text-sm font-bold text-[#1E3A5F]">Prayosha Action Hub</h2>
                            <p data-i18n="hubSubtitle" class="text-[11px] text-slate-500 font-medium">Quick entries & master navigation</p>
                        </div>
                    </div>
                    <button id="shell-drawer-close" type="button" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div class="p-6 overflow-y-auto space-y-6">
                    
                    <!-- 1. Quick Actions -->
                    <div>
                        <span data-i18n="sectionFastActions" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">Site Fast Actions</span>
                        <div class="grid grid-cols-3 gap-2.5">
                            <a href="${ROOT_PATH}tasks/raise-issue.html" class="p-3 bg-red-50 hover:bg-red-100/80 border border-red-200/70 rounded-xl flex flex-col items-center text-center transition group">
                                <span class="text-red-600 mb-1 text-lg">🚨</span>
                                <span data-i18n="actionRaiseIssue" class="text-xs font-semibold text-red-900">Raise Issue</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/log-task.html" class="p-3 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/70 rounded-xl flex flex-col items-center text-center transition group">
                                <span class="text-[#FFBF00] mb-1 text-lg">📝</span>
                                <span data-i18n="actionLogTask" class="text-xs font-semibold text-amber-900">Log Task</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/log-invoice.html" class="p-3 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/70 rounded-xl flex flex-col items-center text-center transition group">
                                <span class="text-indigo-600 mb-1 text-lg">🧾</span>
                                <span data-i18n="purLog" class="text-xs font-semibold text-indigo-900">Log Invoice</span>
                            </a>
                        </div>
                    </div>

                    <!-- 2. SITE MAP & SPATIAL BLUEPRINTS SUITE -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span data-i18n="sectionSiteMap" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Site Map & Spatial Suite</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#1E3A5F] border border-amber-300">Live 3D & CAD</span>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition ${isSiteMap ? 'ring-2 ring-[#1E3A5F] bg-blue-50/50 font-bold text-[#1E3A5F]' : ''}">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="linkInteractiveMap">Interactive 3D Map</span>
                            </a>
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="linkCadDrawings">Original 2D Drawings</span>
                            </a>
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="linkZoneGrid">Zone KPIs & Grid</span>
                            </a>
                            <a href="${ROOT_PATH}site-map/site-map.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="linkFloorManager">Floor Plan Manager</span>
                            </a>
                        </div>
                    </div>

                    <!-- 3. Civil Tasks Suite -->
                    <div>
                        <span data-i18n="sectionCivilTasks" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Civil Tasks Suite</span>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}tasks/active-tasks.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="taskActive">Active Tasks</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/pending-tasks.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-amber-500"></span> <span data-i18n="taskPending">Pending Tasks</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/delayed-tasks.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-red-500"></span> <span data-i18n="taskDelayed">Delayed Tasks</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/issue-logs.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-slate-400"></span> <span data-i18n="taskIssues">Issue Logs</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/zone-timeline.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="taskTimeline">Zone Timeline</span>
                            </a>
                            <a href="${ROOT_PATH}tasks/tasks-history.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="taskHistory">Tasks History</span>
                            </a>
                        </div>
                    </div>

                    <!-- 4. INVENTORY & MATERIALS SUITE -->
                    <div>
                        <span data-i18n="sectionInventory" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Inventory & Materials Suite</span>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}inventory/stock-overview.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="invStock">Stock Overview</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/log-transaction.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-amber-500"></span> <span data-i18n="invLog">Log Transaction</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/issue-logs.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="invIssues">Civil Issue Logs</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/request-indent.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="invIndent">Request Indent</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/report.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-rose-500"></span> <span data-i18n="invReport">Damage & Returns</span>
                            </a>
                            <a href="${ROOT_PATH}inventory/generate-report.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-slate-500"></span> <span data-i18n="invAnalytics">Generate Report</span>
                            </a>
                        </div>
                    </div>

                    <!-- 5. PURCHASE & INDENTS SUITE -->
                    <div>
                        <span data-i18n="sectionPurchase" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Purchase & Indents Suite</span>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <a href="${ROOT_PATH}purchase/purchase-ledger.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#1E3A5F]"></span> <span data-i18n="purLedger">Purchase Ledger</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/log-invoice.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-[#FFBF00]"></span> <span data-i18n="purLog">Log Invoice</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/indent-status.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span> <span data-i18n="purIndent">Indent Status</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/pending-payments.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-red-500"></span> <span data-i18n="purPending">Pending Payments</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/cash-ledger.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> <span data-i18n="purCash">Cash Ledger</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/bank-ledger.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-indigo-500"></span> <span data-i18n="purBank">Bank Ledger</span>
                            </a>
                            <a href="${ROOT_PATH}purchase/generate-report.html" class="p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-[#1E3A5F] flex items-center gap-2 transition">
                                <span class="w-2 h-2 rounded-full bg-slate-500"></span> <span data-i18n="purReport">Generate Report</span>
                            </a>
                        </div>
                    </div>

                    <!-- 6. Pre-Development & Workforce -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="bg-white p-3.5 rounded-2xl border border-slate-200">
                            <span data-i18n="sectionPreDev" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Pre-Development</span>
                            <div class="space-y-1.5">
                                <a href="${ROOT_PATH}pre-development/pre-development.html" class="block text-xs font-medium text-slate-700 hover:text-[#1E3A5F] hover:underline">
                                    <span data-i18n="linkLiasoning">• Liasoning & BOQ Master</span>
                                </a>
                            </div>
                        </div>

                        <div class="bg-white p-3.5 rounded-2xl border border-slate-200">
                            <span data-i18n="sectionWorkforce" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Workforce & Equipment</span>
                            <div class="space-y-1.5">
                                <a href="${ROOT_PATH}workforce/workforce.html" class="block text-xs font-medium text-slate-700 hover:text-[#1E3A5F] hover:underline">
                                    <span data-i18n="linkWorkforce">• Daily Labor & Equipment Diary</span>
                                </a>
                            </div>
                        </div>
                    </div>

                    <!-- 7. Administration & Masters -->
                    <div class="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap gap-3 items-center justify-between">
                        <span data-i18n="sectionAdmin" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Administration</span>
                        <div class="flex items-center gap-3">
                            <a href="${ROOT_PATH}projects/create-project.html" class="text-xs font-semibold text-[#1E3A5F] hover:underline">
                                <span data-i18n="linkNewProject">+ New Project</span>
                            </a>
                            <span class="text-slate-300">|</span>
                            <a href="${ROOT_PATH}users/employee-directory.html" class="text-xs font-semibold text-[#1E3A5F] hover:underline">
                                <span data-i18n="linkDirectory">Employee Directory</span>
                            </a>
                            <span class="text-slate-300">|</span>
                            <a href="${ROOT_PATH}vendors/vendors.html" class="text-xs font-semibold text-[#1E3A5F] hover:underline">
                                <span data-i18n="linkVendors">Vendor Directory</span>
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
    // 1. Project Switcher Change
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

    // 2. Action Hub Drawer Open / Close
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

    // 3. Tri-Lingual Language Selector Handler
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
            const dict = I18N_DICTIONARY[currentLang] || I18N_DICTIONARY.en;
            const confirmLogout = confirm(dict.logoutConfirm);
            if (!confirmLogout) return;

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

// Global window fallback
if (typeof window !== 'undefined') {
    window.initShell = initShell;
    window.applyTranslations = applyTranslations;
}