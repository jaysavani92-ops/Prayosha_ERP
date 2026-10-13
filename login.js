// Prayosha - Authentication Controller
// Synchronizes Supabase Auth, Profiles, Multilingual State, and Site Session Storage

import { supabase } from './config.js';

// ==========================================
// 1. CLIENT INITIALIZATION & INSTANCE RESOLUTION
// ==========================================
const supabaseClient = supabase || window.supabaseClient;

// ==========================================
// 2. TRI-LINGUAL LOCALIZATION DICTIONARY
// ==========================================
const TRANSLATIONS = {
    en: {
        brandTitle: "Prayosha",
        brandSubtitle: "Construction Management Portal",
        lblUsername: "Username",
        phUsername: "Enter username",
        lblPin: "4-Digit PIN",
        forgotPin: "Forgot PIN?",
        submitBtn: "Secure Login",
        authenticating: "Authenticating...",
        siteOnline: "Site Online",
        siteOffline: "Site Offline",
        modalTitle: "Forgot 4-Digit PIN?",
        modalDesc: "For site security, PIN recovery is verified directly by the Prayosha Administrator. Contact the admin desk to instantly reset your access credentials.",
        btnWhatsapp: "Message Admin on WhatsApp",
        btnCall: "Call Site Office Desk",
        btnDismiss: "Dismiss",
        errorEmpty: "Please enter both your username and 4-digit PIN.",
        errorInvalidPin: "PIN must be exactly 4 digits.",
        errorSupabaseInit: "System configuration error: Supabase client not initialized.",
        errorNoProfile: "Account authenticated, but no active role profile was found in the directory. Contact Admin.",
        errorDenied: "Access Denied: Invalid username or PIN."
    },
    gu: {
        brandTitle: "પ્રયોશા",
        brandSubtitle: "કન્સ્ટ્રક્શન મેનેજમેન્ટ પોર્ટલ",
        lblUsername: "વપરાશકર્તા નામ (Username)",
        phUsername: "યુઝરનેમ દાખલ કરો",
        lblPin: "૪-અંકનો પિન (PIN)",
        forgotPin: "પિન ભૂલી ગયા?",
        submitBtn: "સુરક્ષિત લૉગિન",
        authenticating: "ચકાસણી ચાલુ છે...",
        siteOnline: "સાઇટ ઑનલાઇન",
        siteOffline: "સાઇટ ઑફલાઇન",
        modalTitle: "૪-અંકનો પિન ભૂલી ગયા?",
        modalDesc: "સાઇટ સુરક્ષા માટે, પિન રીસેટ ફક્ત પ્રયોશા એડમિનિસ્ટ્રેટર દ્વારા જ કરવામાં આવે છે. તમારા ઓળખપત્ર તાત્કાલિક રીસેટ કરવા માટે સંપર્ક કરો.",
        btnWhatsapp: "વોટ્સએપ પર એડમિનને મેસેજ કરો",
        btnCall: "સાઇટ ઓફિસ ડેસ્ક પર કૉલ કરો",
        btnDismiss: "બંધ કરો",
        errorEmpty: "કૃપા કરીને વપરાશકર્તા નામ અને ૪-અંકનો પિન બંને દાખલ કરો.",
        errorInvalidPin: "પિન બરાબર ૪ અંકનો હોવો આવશ્યક છે.",
        errorSupabaseInit: "સિસ્ટમ રૂપરેખાંકન ભૂલ: Supabase ક્લાયંટ શરૂ થયું નથી.",
        errorNoProfile: "ખાતું પ્રમાણિત થયું છે, પરંતુ ડિરેક્ટરીમાં કોઈ સક્રિય રોલ પ્રોફાઇલ મળ્યો નથી. એડમિનનો સંપર્ક કરો.",
        errorDenied: "પ્રવેશ નકારાયો: અમાન્ય વપરાશકર્તા નામ અથવા પિન."
    },
    hi: {
        brandTitle: "प्रयोशा",
        brandSubtitle: "कंस्ट्रक्शन मैनेजमेंट पोर्टल",
        lblUsername: "यूज़रनेम (Username)",
        phUsername: "यूज़रनेम दर्ज करें",
        lblPin: "४-अंकों का पिन (PIN)",
        forgotPin: "पिन भूल गए?",
        submitBtn: "सुरक्षित लॉगिन",
        authenticating: "प्रमाणीकरण जारी है...",
        siteOnline: "साइट ऑनलाइन",
        siteOffline: "साइट ऑफ़लाइन",
        modalTitle: "४-अंकों का पिन भूल गए?",
        modalDesc: "साइट सुरक्षा के लिए, पिन रीसेट सीधे प्रयोशा व्यवस्थापक (Admin) द्वारा किया जाता है। तुरंत क्रेडेंशियल रीसेट के लिए संपर्क करें।",
        btnWhatsapp: "व्हाट्सएप पर एडमिन को संदेश भेजें",
        btnCall: "साइट ऑफिस डेस्क को कॉल करें",
        btnDismiss: "रद्द करें",
        errorEmpty: "कृपया यूज़रनेम और ४-अंकों का पिन दोनों दर्ज करें।",
        errorInvalidPin: "पिन ठीक ४ अंकों का होना चाहिए।",
        errorSupabaseInit: "सिस्टम कॉन्फ़िगरेशन त्रुटि: Supabase क्लाइंट प्रारंभ नहीं हुआ।",
        errorNoProfile: "खाता प्रमाणित हो गया, लेकिन डायरेक्टरी में कोई सक्रिय रोल प्रोफ़ाइल नहीं मिली। व्यवस्थापक से संपर्क करें।",
        errorDenied: "प्रवेश अस्वीकृत: अमान्य यूज़रनेम या पिन।"
    }
};

let currentLang = localStorage.getItem('prayosha_lang') || 'en';

// ==========================================
// 3. UI LOCALIZATION HANDLERS
// ==========================================
function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) return;
    currentLang = lang;
    localStorage.setItem('prayosha_lang', lang);

    const t = TRANSLATIONS[lang];

    // Language switcher buttons styling
    const btnEn = document.getElementById('lang-en');
    const btnGu = document.getElementById('lang-gu');
    const btnHi = document.getElementById('lang-hi');

    [btnEn, btnGu, btnHi].forEach(btn => {
        if (!btn) return;
        btn.className = "lang-btn px-3 py-1 text-xs font-medium rounded-full transition duration-150 text-white/80 hover:text-white";
    });

    const activeBtn = document.getElementById(`lang-${lang}`);
    if (activeBtn) {
        activeBtn.className = "lang-btn px-3 py-1 text-xs font-semibold rounded-full transition duration-150 bg-brand-amber text-brand-navy shadow";
    }

    // Dynamic UI Labels
    const txtBrandTitle = document.getElementById('txt-brand-title');
    const txtBrandSubtitle = document.getElementById('txt-brand-subtitle');
    const lblUsername = document.getElementById('lbl-username');
    const inputUsername = document.getElementById('username');
    const lblPin = document.getElementById('lbl-pin');
    const btnForgotPin = document.getElementById('btn-forgot-pin');
    const txtSubmitBtn = document.getElementById('txt-submit-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const txtWhatsappBtn = document.getElementById('txt-whatsapp-btn');
    const txtCallBtn = document.getElementById('txt-call-btn');
    const btnCloseModal = document.getElementById('btn-close-modal');

    if (txtBrandTitle) txtBrandTitle.textContent = t.brandTitle;
    if (txtBrandSubtitle) txtBrandSubtitle.textContent = t.brandSubtitle;
    if (lblUsername) lblUsername.textContent = t.lblUsername;
    if (inputUsername) inputUsername.placeholder = t.phUsername;
    if (lblPin) lblPin.textContent = t.lblPin;
    if (btnForgotPin) btnForgotPin.textContent = t.forgotPin;
    if (txtSubmitBtn) txtSubmitBtn.textContent = t.submitBtn;

    // Modal Content
    if (modalTitle) modalTitle.textContent = t.modalTitle;
    if (modalDesc) modalDesc.textContent = t.modalDesc;
    if (txtWhatsappBtn) txtWhatsappBtn.textContent = t.btnWhatsapp;
    if (txtCallBtn) txtCallBtn.textContent = t.btnCall;
    if (btnCloseModal) btnCloseModal.textContent = t.btnDismiss;

    // Update Network Indicator text
    updateNetworkStatus();
}

// ==========================================
// 4. NETWORK CONNECTIVITY MONITOR
// ==========================================
function updateNetworkStatus() {
    const networkDot = document.getElementById('networkDot');
    const networkText = document.getElementById('networkText');
    const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

    if (!networkDot || !networkText) return;

    if (navigator.onLine) {
        networkDot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
        networkText.textContent = t.siteOnline;
    } else {
        networkDot.className = "w-2 h-2 rounded-full bg-rose-500";
        networkText.textContent = t.siteOffline;
    }
}

// ==========================================
// 5. PIN VISIBILITY TOGGLE CONTROLLER
// ==========================================
function setupPinToggle() {
    const toggleBtn = document.getElementById('togglePinBtn');
    const pinInput = document.getElementById('pin');
    const eyeIcon = document.getElementById('eyeIcon');

    if (!toggleBtn || !pinInput || !eyeIcon) return;

    toggleBtn.addEventListener('click', () => {
        const isPassword = pinInput.getAttribute('type') === 'password';
        if (isPassword) {
            pinInput.setAttribute('type', 'text');
            eyeIcon.innerHTML = `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path>
            `;
        } else {
            pinInput.setAttribute('type', 'password');
            eyeIcon.innerHTML = `
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.257-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            `;
        }
    });
}

// ==========================================
// 6. FORGOT PIN MODAL MANAGEMENT
// ==========================================
function setupForgotPinModal() {
    const btnForgotPin = document.getElementById('btn-forgot-pin');
    const modal = document.getElementById('forgotPinModal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnWhatsapp = document.getElementById('btn-whatsapp-admin');
    const usernameInput = document.getElementById('username');

    if (!btnForgotPin || !modal) return;

    const openModal = () => {
        const username = usernameInput ? usernameInput.value.trim() : '';
        const adminPhone = "919876543210"; // Prayosha Admin Support Desk
        
        let messageText = "Hello Prayosha Admin, I need help recovering my 4-digit PIN.";
        if (username) {
            messageText = `Hello Prayosha Admin, I forgot my 4-digit PIN for username: "${username}". Please help me reset my access credentials.`;
        }
        
        if (btnWhatsapp) {
            btnWhatsapp.href = `https://wa.me/${adminPhone}?text=${encodeURIComponent(messageText)}`;
        }

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            const inner = modal.querySelector('div');
            if (inner) {
                inner.classList.remove('scale-95');
                inner.classList.add('scale-100');
            }
        });
    };

    const closeModal = () => {
        modal.classList.add('opacity-0');
        const inner = modal.querySelector('div');
        if (inner) {
            inner.classList.remove('scale-100');
            inner.classList.add('scale-95');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    };

    btnForgotPin.addEventListener('click', openModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });
}

// ==========================================
// 7. AUTHENTICATION & LOGIN WORKFLOW
// ==========================================
function setupAuthForm() {
    const form = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const pinInput = document.getElementById('pin');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const feedbackBox = document.getElementById('login-feedback');

    if (!form || !submitBtn || !feedbackBox) return;

    // Auto-advance cursor from Username to PIN upon pressing Enter
    if (usernameInput && pinInput) {
        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                pinInput.focus();
            }
        });
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
        const rawUsername = usernameInput.value.trim().toLowerCase();
        const rawPin = pinInput.value.trim();

        if (!rawUsername || !rawPin) {
            showFeedback(t.errorEmpty, 'error');
            return;
        }

        if (rawPin.length !== 4) {
            showFeedback(t.errorInvalidPin, 'error');
            return;
        }

        if (!supabaseClient) {
            showFeedback(t.errorSupabaseInit, 'error');
            return;
        }

        // Credentials translation format for Prayosha infrastructure
        const translatedEmail = `${rawUsername}@prayosha.erp`;
        const translatedPassword = `${rawPin}-Prayosha`;

        // Loading State UI
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 text-brand-amber inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span>${t.authenticating}</span>
        `;

        try {
            // 1. Supabase Auth Verification
            const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                email: translatedEmail,
                password: translatedPassword,
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("No user returned from authentication server.");

            const authUserId = authData.user.id;

            // 2. Fetch User Profile & Assigned Roles
            let profile = null;

            const { data: roleData } = await supabaseClient
                .from('user_roles')
                .select('*')
                .eq('username', rawUsername)
                .maybeSingle();

            if (roleData) {
                profile = roleData;
            } else {
                const { data: masterProfile } = await supabaseClient
                    .from('profiles')
                    .select('*')
                    .or(`id.eq.${authUserId},username.eq.${rawUsername}`)
                    .maybeSingle();

                if (masterProfile) {
                    profile = masterProfile;
                }
            }

            if (!profile) {
                throw new Error(t.errorNoProfile);
            }

            const userRole = profile.role || 'site_engineer';
            const displayName = profile.display_name || profile.full_name || rawUsername;
            const assignedProject = profile.assigned_project || profile.project_id || null;

            // 3. Persist Workspace Session in LocalStorage
            localStorage.setItem('userId', authUserId);
            localStorage.setItem('userRole', userRole);
            localStorage.setItem('prayosha_user', JSON.stringify({
                id: authUserId,
                username: rawUsername,
                displayName: displayName,
                role: userRole,
                project: assignedProject
            }));

            // 4. Resolve Project Context if Assigned
            if (assignedProject) {
                const { data: projectRecord } = await supabaseClient
                    .from('projects')
                    .select('id, project_code, project_name')
                    .or(`id.eq.${assignedProject},project_code.eq.${assignedProject}`)
                    .maybeSingle();

                if (projectRecord) {
                    localStorage.setItem('activeProjectId', projectRecord.id);
                    localStorage.setItem('activeProjectCode', projectRecord.project_code || '');
                    localStorage.setItem('activeProjectName', projectRecord.project_name || '');
                } else {
                    localStorage.setItem('activeProjectId', assignedProject);
                }
            }

            // 5. Success UI & Smooth Workspace Transition
            showFeedback(`Welcome, ${displayName}! Loading workspace...`, 'success');

            setTimeout(() => {
                window.location.href = "projects/project-dashboard.html";
            }, 800);

        } catch (err) {
            console.error('[Prayosha Auth Error]:', err);
            showFeedback(t.errorDenied, 'error');

            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg class="w-5 h-5 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                <span id="txt-submit-btn">${t.submitBtn}</span>
            `;
            pinInput.value = '';
            pinInput.focus();
        }
    });

    function showFeedback(message, type) {
        feedbackBox.classList.remove('hidden', 'bg-red-100', 'text-red-800', 'border-red-200', 'bg-green-100', 'text-green-800', 'border-green-200');
        
        if (type === 'success') {
            feedbackBox.classList.add('bg-green-100', 'text-green-800', 'border-green-200', 'block');
        } else {
            feedbackBox.classList.add('bg-red-100', 'text-red-800', 'border-red-200', 'block');
        }
        feedbackBox.textContent = message;
    }
}

// ==========================================
// 8. LIFECYCLE INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Set current copyright year
    const yearEl = document.getElementById('currentYear');
    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }

    // 2. Language Switcher Triggers
    const btnEn = document.getElementById('lang-en');
    const btnGu = document.getElementById('lang-gu');
    const btnHi = document.getElementById('lang-hi');

    if (btnEn) btnEn.addEventListener('click', () => setLanguage('en'));
    if (btnGu) btnGu.addEventListener('click', () => setLanguage('gu'));
    if (btnHi) btnHi.addEventListener('click', () => setLanguage('hi'));

    // Apply stored or default language
    setLanguage(currentLang);

    // 3. Online/Offline Network Listeners
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    // 4. Feature Enhancements
    setupPinToggle();
    setupForgotPinModal();
    setupAuthForm();
});