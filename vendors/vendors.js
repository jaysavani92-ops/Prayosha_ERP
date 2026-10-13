/**
 * Prayosha ERP - Vendor Management Sub-Module
 * File: /vendors/vendors.js
 * Description: Client-side controller for Vendor Directory, CRUD operations,
 *              Supabase real-time queries, GSTIN/PAN auto-sync, and export utilities.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. SUPABASE CLIENT INITIALIZATION
  // =========================================================================
  let supabase = null;

  function initSupabase() {
    if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient) {
      supabase = window.supabaseClient;
      return true;
    }
    const url = window.SUPABASE_URL || (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null);
    const key = window.SUPABASE_ANON_KEY || (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : null);

    if (window.supabase && typeof window.supabase.createClient === 'function' && url && key) {
      supabase = window.supabase.createClient(url, key);
      window.supabaseClient = supabase;
      return true;
    }

    console.error('Prayosha ERP Error: Primary Supabase credentials or SDK missing.');
    showToast('Failed to initialize Supabase connection. Check config.js', 'error');
    return false;
  }

  // =========================================================================
  // 2. STATE REPOSITORY
  // =========================================================================
  const state = {
    vendors: [],
    filteredVendors: [],
    currentView: 'directory', // 'directory' | 'form'
    editingVendorId: null,
    isLoading: false,
    filters: {
      search: '',
      category: 'ALL',
      status: 'ALL',
    },
  };

  // Indian State Code Mapping for GSTIN
  const GST_STATE_CODES = {
    '01': 'Jammu & Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '25': 'Daman & Diu',
    '26': 'Dadra & Nagar Haveli',
    '27': 'Maharashtra',
    '29': 'Karnataka',
    '30': 'Goa',
    '31': 'Lakshadweep',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
  };

  // =========================================================================
  // 3. DOM ELEMENTS CACHE
  // =========================================================================
  const DOM = {
    // Navigation Tabs & Views
    tabDirectoryBtn: document.getElementById('tabDirectoryBtn'),
    tabAddVendorBtn: document.getElementById('tabAddVendorBtn'),
    directoryView: document.getElementById('directoryView'),
    formView: document.getElementById('formView'),
    totalVendorsBadge: document.getElementById('totalVendorsBadge'),

    // Directory Controls & Metrics
    searchInput: document.getElementById('searchInput'),
    categoryFilter: document.getElementById('categoryFilter'),
    statusFilter: document.getElementById('statusFilter'),
    refreshBtn: document.getElementById('refreshBtn'),
    refreshIcon: document.getElementById('refreshIcon'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    vendorCardsContainer: document.getElementById('vendorCardsContainer'),
    emptyState: document.getElementById('emptyState'),
    resetFilterBtn: document.getElementById('resetFilterBtn'),
    loadingSkeleton: document.getElementById('loadingSkeleton'),

    // Quick Stats
    statActive: document.getElementById('statActive'),
    statMaterial: document.getElementById('statMaterial'),
    statContractor: document.getElementById('statContractor'),
    statCashAllowed: document.getElementById('statCashAllowed'),

    // Form Elements
    vendorForm: document.getElementById('vendorForm'),
    formTitle: document.getElementById('formTitle'),
    editingVendorId: document.getElementById('editingVendorId'),
    saveVendorSubmitBtn: document.getElementById('saveVendorSubmitBtn'),
    saveBtnText: document.getElementById('saveBtnText'),
    cancelFormBtn: document.getElementById('cancelFormBtn'),
    cancelFormBottomBtn: document.getElementById('cancelFormBottomBtn'),

    // Form Fields
    vendor_code: document.getElementById('vendor_code'),
    name: document.getElementById('name'),
    trade_name: document.getElementById('trade_name'),
    category: document.getElementById('category'),
    status: document.getElementById('status'),
    allows_cash_rokdu: document.getElementById('allows_cash_rokdu'),
    gstin: document.getElementById('gstin'),
    gstStateBadge: document.getElementById('gstStateBadge'),
    pan: document.getElementById('pan'),
    msme_reg_no: document.getElementById('msme_reg_no'),
    contact_person: document.getElementById('contact_person'),
    mobile_primary: document.getElementById('mobile_primary'),
    mobile_secondary: document.getElementById('mobile_secondary'),
    office_phone: document.getElementById('office_phone'),
    email: document.getElementById('email'),
    address_line: document.getElementById('address_line'),
    area_gidc: document.getElementById('area_gidc'),
    city: document.getElementById('city'),
    state: document.getElementById('state'),
    pincode: document.getElementById('pincode'),
    speciality_items_input: document.getElementById('speciality_items_input'),
    credit_period_days: document.getElementById('credit_period_days'),
    bank_name: document.getElementById('bank_name'),
    account_holder_name: document.getElementById('account_holder_name'),
    account_number: document.getElementById('account_number'),
    ifsc_code: document.getElementById('ifsc_code'),
    remarks: document.getElementById('remarks'),

    // Modal Elements
    vendorDetailModal: document.getElementById('vendorDetailModal'),
    closeDetailModalBtn: document.getElementById('closeDetailModalBtn'),
    modalContent: document.getElementById('modalContent'),
    toastContainer: document.getElementById('toastContainer'),
  };

  // =========================================================================
  // 4. UTILITIES & TOAST ENGINE
  // =========================================================================
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanPhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/[^0-9]/g, '');
  }

  function showToast(message, type = 'info') {
    if (!DOM.toastContainer) return;
    const toast = document.createElement('div');
    const bgColors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      info: 'bg-brand-navy text-white',
      warning: 'bg-amber-500 text-slate-900',
    };

    const icons = {
      success: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>',
      error: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>',
      info: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      warning: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>',
    };

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold backdrop-blur-md transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-auto ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `
      <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        ${icons[type] || icons.info}
      </svg>
      <span class="flex-1">${escapeHtml(message)}</span>
    `;

    DOM.toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // =========================================================================
  // 5. VIEW SWITCHING & CODE GENERATION
  // =========================================================================
  function switchView(viewName) {
    state.currentView = viewName;
    if (viewName === 'directory') {
      DOM.directoryView.classList.remove('hidden');
      DOM.formView.classList.add('hidden');

      DOM.tabDirectoryBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 bg-brand-navy text-white shadow-sm';
      DOM.tabAddVendorBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 text-slate-600 hover:text-brand-navy';
    } else {
      DOM.directoryView.classList.add('hidden');
      DOM.formView.classList.remove('hidden');

      DOM.tabAddVendorBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 bg-brand-navy text-white shadow-sm';
      DOM.tabDirectoryBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 text-slate-600 hover:text-brand-navy';
    }
  }

  function suggestNextVendorCode() {
    let maxNum = 1000;
    state.vendors.forEach((v) => {
      if (v.vendor_code && /^VEND-\d+$/i.test(v.vendor_code)) {
        const num = parseInt(v.vendor_code.replace(/\D/g, ''), 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `VEND-${maxNum + 1}`;
  }

  function openAddVendorView() {
    state.editingVendorId = null;
    DOM.editingVendorId.value = '';
    DOM.vendorForm.reset();
    DOM.formTitle.textContent = 'Add New Vendor Profile';
    DOM.saveBtnText.textContent = 'Save Vendor Profile';

    DOM.city.value = 'Surat';
    DOM.state.value = 'Gujarat';
    DOM.status.value = 'Active';
    DOM.category.value = 'Material Supplier';
    DOM.credit_period_days.value = '30';
    DOM.allows_cash_rokdu.checked = false;

    DOM.vendor_code.value = suggestNextVendorCode();
    DOM.gstStateBadge.classList.add('hidden');

    switchView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openEditVendorView(vendor) {
    state.editingVendorId = vendor.id;
    DOM.editingVendorId.value = vendor.id;
    DOM.formTitle.textContent = `Edit Vendor: ${vendor.name}`;
    DOM.saveBtnText.textContent = 'Update Vendor Profile';

    DOM.vendor_code.value = vendor.vendor_code || '';
    DOM.name.value = vendor.name || '';
    DOM.trade_name.value = vendor.trade_name || '';
    DOM.category.value = vendor.category || 'Material Supplier';
    DOM.status.value = vendor.status || 'Active';
    DOM.allows_cash_rokdu.checked = Boolean(vendor.allows_cash_rokdu);

    DOM.gstin.value = vendor.gstin || '';
    DOM.pan.value = vendor.pan || '';
    DOM.msme_reg_no.value = vendor.msme_reg_no || '';

    handleGstinInputLogic(vendor.gstin || '');

    DOM.contact_person.value = vendor.contact_person || '';
    DOM.mobile_primary.value = vendor.mobile_primary || '';
    DOM.mobile_secondary.value = vendor.mobile_secondary || '';
    DOM.office_phone.value = vendor.office_phone || '';
    DOM.email.value = vendor.email || '';

    DOM.address_line.value = vendor.address_line || '';
    DOM.area_gidc.value = vendor.area_gidc || '';
    DOM.city.value = vendor.city || 'Surat';
    DOM.state.value = vendor.state || 'Gujarat';
    DOM.pincode.value = vendor.pincode || '';

    if (Array.isArray(vendor.speciality_items)) {
      DOM.speciality_items_input.value = vendor.speciality_items.join(', ');
    } else {
      DOM.speciality_items_input.value = vendor.speciality_items || '';
    }

    DOM.credit_period_days.value = String(vendor.credit_period_days ?? 30);
    DOM.bank_name.value = vendor.bank_name || '';
    DOM.account_holder_name.value = vendor.account_holder_name || '';
    DOM.account_number.value = vendor.account_number || '';
    DOM.ifsc_code.value = vendor.ifsc_code || '';
    DOM.remarks.value = vendor.remarks || '';

    switchView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // 6. GSTIN & PAN INTELLIGENCE
  // =========================================================================
  function handleGstinInputLogic(val) {
    const raw = (val || '').trim().toUpperCase();
    DOM.gstin.value = raw;

    if (raw.length >= 2) {
      const statePrefix = raw.substring(0, 2);
      const stateName = GST_STATE_CODES[statePrefix] || `Code ${statePrefix}`;
      DOM.gstStateBadge.textContent = `${statePrefix} - ${stateName}`;
      DOM.gstStateBadge.classList.remove('hidden');
    } else {
      DOM.gstStateBadge.classList.add('hidden');
    }

    // Auto-derive Indian PAN from GSTIN (Characters 3 to 12)
    if (raw.length >= 12) {
      const derivedPan = raw.substring(2, 12);
      if (/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(derivedPan)) {
        DOM.pan.value = derivedPan;
      }
    }
  }

  // =========================================================================
  // 7. SUPABASE DATA FETCHING
  // =========================================================================
  async function fetchVendors() {
    if (!supabase) {
      if (!initSupabase()) return;
    }

    state.isLoading = true;
    DOM.loadingSkeleton.classList.remove('hidden');
    DOM.vendorCardsContainer.classList.add('hidden');
    DOM.emptyState.classList.add('hidden');
    if (DOM.refreshIcon) DOM.refreshIcon.classList.add('animate-spin');

    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      state.vendors = data || [];
      applyFilters();
      updateMetricBadges();
    } catch (err) {
      console.error('Prayosha ERP Vendor fetch error:', err);
      showToast(`Error fetching vendors: ${err.message || 'Database connection error'}`, 'error');
    } finally {
      state.isLoading = false;
      DOM.loadingSkeleton.classList.add('hidden');
      if (DOM.refreshIcon) DOM.refreshIcon.classList.remove('animate-spin');
    }
  }

  // =========================================================================
  // 8. FILTER & METRIC CALCULATIONS
  // =========================================================================
  function applyFilters() {
    const query = state.filters.search.toLowerCase().trim();
    const cat = state.filters.category;
    const stat = state.filters.status;

    state.filteredVendors = state.vendors.filter((v) => {
      // Category Match
      if (cat !== 'ALL' && v.category !== cat) return false;

      // Status Match
      if (stat !== 'ALL' && v.status !== stat) return false;

      // Search Query Match
      if (query) {
        const nameMatch = (v.name || '').toLowerCase().includes(query);
        const tradeMatch = (v.trade_name || '').toLowerCase().includes(query);
        const codeMatch = (v.vendor_code || '').toLowerCase().includes(query);
        const gstinMatch = (v.gstin || '').toLowerCase().includes(query);
        const panMatch = (v.pan || '').toLowerCase().includes(query);
        const contactMatch = (v.contact_person || '').toLowerCase().includes(query);
        const phoneMatch = (v.mobile_primary || '').toLowerCase().includes(query) || (v.mobile_secondary || '').toLowerCase().includes(query);
        const cityMatch = (v.city || '').toLowerCase().includes(query) || (v.area_gidc || '').toLowerCase().includes(query);

        let itemsMatch = false;
        if (Array.isArray(v.speciality_items)) {
          itemsMatch = v.speciality_items.some((item) => (item || '').toLowerCase().includes(query));
        } else if (typeof v.speciality_items === 'string') {
          itemsMatch = v.speciality_items.toLowerCase().includes(query);
        }

        return nameMatch || tradeMatch || codeMatch || gstinMatch || panMatch || contactMatch || phoneMatch || cityMatch || itemsMatch;
      }

      return true;
    });

    renderCards();
  }

  function updateMetricBadges() {
    const all = state.vendors;
    const total = all.length;
    const activeCount = all.filter((v) => v.status === 'Active').length;
    const matCount = all.filter((v) => v.category === 'Material Supplier').length;
    const contCount = all.filter((v) => v.category === 'Labor Contractor').length;
    const cashCount = all.filter((v) => Boolean(v.allows_cash_rokdu)).length;

    DOM.totalVendorsBadge.textContent = total;
    DOM.statActive.textContent = `Active: ${activeCount}`;
    DOM.statMaterial.textContent = `Material: ${matCount}`;
    DOM.statContractor.textContent = `Contractors: ${contCount}`;
    DOM.statCashAllowed.textContent = `Rokdu Allowed: ${cashCount}`;
  }

  // =========================================================================
  // 9. VENDOR CARD RENDERING
  // =========================================================================
  function renderCards() {
    DOM.vendorCardsContainer.innerHTML = '';

    if (state.filteredVendors.length === 0) {
      DOM.vendorCardsContainer.classList.add('hidden');
      DOM.emptyState.classList.remove('hidden');
      return;
    }

    DOM.emptyState.classList.add('hidden');
    DOM.vendorCardsContainer.classList.remove('hidden');

    const fragment = document.createDocumentFragment();

    state.filteredVendors.forEach((vendor) => {
      const card = document.createElement('div');
      card.className = 'glass-card rounded-2xl shadow-glass hover:shadow-glassHover transition-all duration-300 p-5 flex flex-col justify-between border border-white/80 group';

      // Status pill styling
      let statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Active</span>';
      if (vendor.status === 'Inactive') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Inactive</span>';
      } else if (vendor.status === 'Blacklisted') {
        statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Blacklisted</span>';
      }

      // Rokdu badge
      const rokduBadge = vendor.allows_cash_rokdu
        ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">Rokdu OK</span>'
        : '';

      // Items list tags
      let itemsHtml = '';
      if (Array.isArray(vendor.speciality_items) && vendor.speciality_items.length > 0) {
        itemsHtml = vendor.speciality_items
          .slice(0, 3)
          .map((it) => `<span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium truncate max-w-[150px]">${escapeHtml(it)}</span>`)
          .join('');
        if (vendor.speciality_items.length > 3) {
          itemsHtml += `<span class="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">+${vendor.speciality_items.length - 3}</span>`;
        }
      } else {
        itemsHtml = '<span class="text-xs text-slate-400 italic">No supply scope specified</span>';
      }

      const primaryPhoneClean = cleanPhone(vendor.mobile_primary);
      const whatsappNumber = primaryPhoneClean.length === 10 ? `91${primaryPhoneClean}` : primaryPhoneClean;

      card.innerHTML = `
        <div>
          <!-- Header Row -->
          <div class="flex items-start justify-between gap-2 mb-2.5">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-brand-navy border border-blue-200/60">
                ${escapeHtml(vendor.category || 'Supplier')}
              </span>
              ${statusBadge}
              ${rokduBadge}
            </div>
            <span class="font-mono text-[11px] font-bold text-slate-400 bg-slate-100/80 px-2 py-0.5 rounded-md">
              ${escapeHtml(vendor.vendor_code || 'VEND')}
            </span>
          </div>

          <!-- Vendor Name -->
          <h3 class="text-base font-bold text-brand-navy group-hover:text-brand-navyLight transition-colors leading-tight mb-0.5">
            ${escapeHtml(vendor.name)}
          </h3>
          ${
            vendor.trade_name && vendor.trade_name !== vendor.name
              ? `<p class="text-xs font-semibold text-slate-500 mb-2 truncate">(${escapeHtml(vendor.trade_name)})</p>`
              : '<div class="h-2"></div>'
          }

          <!-- Supplied Materials / Services -->
          <div class="mb-3.5">
            <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Scope &amp; Materials</div>
            <div class="flex flex-wrap items-center gap-1">
              ${itemsHtml}
            </div>
          </div>

          <!-- GSTIN / PAN Strip -->
          <div class="bg-slate-50/80 rounded-xl p-2.5 mb-3 border border-slate-100 text-xs space-y-1">
            <div class="flex justify-between items-center">
              <span class="text-slate-400 font-medium text-[11px]">GSTIN:</span>
              <span class="font-mono font-semibold text-slate-700 text-[11px]">${escapeHtml(vendor.gstin || 'Unregistered')}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-400 font-medium text-[11px]">Credit Terms:</span>
              <span class="font-semibold text-slate-700 text-[11px]">${vendor.credit_period_days ? vendor.credit_period_days + ' Days' : 'Immediate / Cash'}</span>
            </div>
            ${
              vendor.area_gidc || vendor.city
                ? `
              <div class="flex justify-between items-center pt-0.5 border-t border-slate-200/50">
                <span class="text-slate-400 font-medium text-[11px]">Location:</span>
                <span class="font-medium text-slate-600 text-[11px] truncate max-w-[160px]">${escapeHtml([vendor.area_gidc, vendor.city].filter(Boolean).join(', '))}</span>
              </div>
            `
                : ''
            }
          </div>

          <!-- Contact Person & Communication -->
          <div class="space-y-1.5 text-xs text-slate-600 mb-4">
            ${
              vendor.contact_person
                ? `
              <div class="flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
                <span class="font-semibold text-slate-700 truncate">${escapeHtml(vendor.contact_person)}</span>
              </div>
            `
                : ''
            }
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 truncate">
                <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
                <span class="font-mono text-slate-700">${escapeHtml(vendor.mobile_primary || 'N/A')}</span>
              </div>

              <!-- Quick Communication Action Buttons -->
              <div class="flex items-center gap-1">
                ${
                  primaryPhoneClean
                    ? `
                  <a href="tel:${escapeHtml(primaryPhoneClean)}" title="Call Direct" class="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                  </a>
                  <a href="https://wa.me/${whatsappNumber}" target="_blank" rel="noopener noreferrer" title="Chat on WhatsApp" class="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.149.929 3.182 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.768-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.057-2.18-.553-1.895-.779-3.111-2.731-3.206-2.857-.094-.126-.763-1.013-.763-1.934 0-.92.483-1.371.654-1.562.172-.191.375-.239.5-.239.125 0 .25.002.359.007.115.006.27-.044.421.323.157.381.536 1.309.584 1.405.048.096.08.209.016.335-.063.127-.095.207-.19.317-.095.111-.2.248-.286.333-.095.096-.194.2-.083.391.111.191.494.814 1.06 1.318.73.65 1.346.852 1.537.947.191.096.302.08.414-.048.112-.127.477-.557.604-.748.127-.191.254-.159.429-.095.175.063 1.112.524 1.303.62.191.095.318.143.366.223.048.079.048.461-.096.866z"/>
                    </svg>
                  </a>
                `
                    : ''
                }
              </div>
            </div>
            ${
              vendor.email
                ? `
              <div class="flex items-center gap-2 truncate">
                <svg class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                <a href="mailto:${escapeHtml(vendor.email)}" class="hover:underline text-slate-600 truncate">${escapeHtml(vendor.email)}</a>
              </div>
            `
                : ''
            }
          </div>
        </div>

        <!-- Footer Actions Bar -->
        <div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
          <button type="button" data-action="view" data-id="${vendor.id}" class="text-xs font-semibold text-brand-navy hover:text-brand-navyLight flex items-center gap-1 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            <span>Details</span>
          </button>

          <div class="flex items-center gap-1">
            <button type="button" data-action="edit" data-id="${vendor.id}" title="Edit Vendor" class="p-1.5 rounded-lg text-slate-500 hover:text-brand-navy hover:bg-slate-100 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
            <button type="button" data-action="delete" data-id="${vendor.id}" title="Delete Vendor" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    DOM.vendorCardsContainer.appendChild(fragment);
  }

  // =========================================================================
  // 10. DETAIL INSPECTOR MODAL
  // =========================================================================
  function showVendorDetails(vendorId) {
    const vendor = state.vendors.find((v) => v.id === vendorId);
    if (!vendor) return;

    let itemsList = 'None specified';
    if (Array.isArray(vendor.speciality_items) && vendor.speciality_items.length > 0) {
      itemsList = vendor.speciality_items.map((it) => `<span class="px-2 py-0.5 bg-slate-100 rounded text-xs">${escapeHtml(it)}</span>`).join(' ');
    } else if (typeof vendor.speciality_items === 'string') {
      itemsList = escapeHtml(vendor.speciality_items);
    }

    DOM.modalContent.innerHTML = `
      <div class="space-y-4">
        <!-- Title and Code -->
        <div class="border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-navy text-white">${escapeHtml(vendor.vendor_code || 'VEND')}</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-brand-navy">${escapeHtml(vendor.category)}</span>
            <span class="text-xs font-semibold px-2 py-0.5 rounded ${vendor.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">${escapeHtml(vendor.status)}</span>
            ${vendor.allows_cash_rokdu ? '<span class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">Rokdu Enabled</span>' : ''}
          </div>
          <h2 class="text-xl font-bold text-brand-navy mt-1.5">${escapeHtml(vendor.name)}</h2>
          ${vendor.trade_name ? `<p class="text-xs text-slate-500 font-medium">Trade Name: ${escapeHtml(vendor.trade_name)}</p>` : ''}
        </div>

        <!-- 2-Column Info Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          <!-- Column 1: Statutory & Scope -->
          <div class="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <h4 class="font-bold text-brand-navy uppercase tracking-wider text-[11px]">Statutory &amp; Scope</h4>
            <div class="space-y-1.5">
              <div><span class="text-slate-400">GSTIN:</span> <span class="font-mono font-bold text-slate-800">${escapeHtml(vendor.gstin || 'Unregistered')}</span></div>
              <div><span class="text-slate-400">PAN:</span> <span class="font-mono font-bold text-slate-800">${escapeHtml(vendor.pan || 'N/A')}</span></div>
              <div><span class="text-slate-400">MSME Reg:</span> <span class="font-mono text-slate-800">${escapeHtml(vendor.msme_reg_no || 'N/A')}</span></div>
              <div><span class="text-slate-400">Credit Days:</span> <span class="font-bold text-slate-800">${vendor.credit_period_days || 0} Days</span></div>
              <div class="pt-1"><span class="text-slate-400 block mb-1">Supplied Scope:</span> <div class="flex flex-wrap gap-1">${itemsList}</div></div>
            </div>
          </div>

          <!-- Column 2: Banking Coordinates -->
          <div class="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
            <h4 class="font-bold text-brand-navy uppercase tracking-wider text-[11px]">Banking Remittance</h4>
            <div class="space-y-1.5">
              <div><span class="text-slate-400">Bank Name:</span> <span class="font-semibold text-slate-800">${escapeHtml(vendor.bank_name || 'N/A')}</span></div>
              <div><span class="text-slate-400">A/C Holder:</span> <span class="font-semibold text-slate-800">${escapeHtml(vendor.account_holder_name || 'N/A')}</span></div>
              <div><span class="text-slate-400">Account No:</span> <span class="font-mono font-bold text-slate-800">${escapeHtml(vendor.account_number || 'N/A')}</span></div>
              <div><span class="text-slate-400">IFSC Code:</span> <span class="font-mono font-bold text-slate-800">${escapeHtml(vendor.ifsc_code || 'N/A')}</span></div>
            </div>
          </div>

        </div>

        <!-- Address & Contact Strip -->
        <div class="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 text-xs space-y-2">
          <h4 class="font-bold text-brand-navy uppercase tracking-wider text-[11px]">Contact &amp; Premises</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><span class="text-slate-400">Executive:</span> <span class="font-semibold text-slate-700">${escapeHtml(vendor.contact_person || 'N/A')}</span></div>
            <div><span class="text-slate-400">Primary Mobile:</span> <span class="font-mono font-semibold text-slate-700">${escapeHtml(vendor.mobile_primary || 'N/A')}</span></div>
            <div><span class="text-slate-400">Secondary Mobile:</span> <span class="font-mono text-slate-700">${escapeHtml(vendor.mobile_secondary || 'N/A')}</span></div>
            <div><span class="text-slate-400">Landline:</span> <span class="font-mono text-slate-700">${escapeHtml(vendor.office_phone || 'N/A')}</span></div>
            <div class="md:col-span-2"><span class="text-slate-400">Email:</span> <span class="text-slate-700">${escapeHtml(vendor.email || 'N/A')}</span></div>
            <div class="md:col-span-2"><span class="text-slate-400">Full Address:</span> <span class="text-slate-700">${escapeHtml([vendor.address_line, vendor.area_gidc, vendor.city, vendor.state, vendor.pincode].filter(Boolean).join(', ') || 'N/A')}</span></div>
          </div>
        </div>

        ${
          vendor.remarks
            ? `
          <div class="p-3 bg-amber-50/60 border border-amber-200/70 rounded-xl text-xs">
            <span class="font-bold text-amber-900 block mb-0.5">Internal Remarks:</span>
            <p class="text-amber-800">${escapeHtml(vendor.remarks)}</p>
          </div>
        `
            : ''
        }

        <!-- Modal Footer Actions -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" id="modalEditBtn" class="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-navy text-white hover:bg-brand-navyDark transition-colors">
            Edit Profile
          </button>
        </div>
      </div>
    `;

    const modalEditBtn = document.getElementById('modalEditBtn');
    if (modalEditBtn) {
      modalEditBtn.addEventListener('click', () => {
        closeDetailModal();
        openEditVendorView(vendor);
      });
    }

    DOM.vendorDetailModal.classList.remove('hidden');
  }

  function closeDetailModal() {
    DOM.vendorDetailModal.classList.add('hidden');
    DOM.modalContent.innerHTML = '';
  }

  // =========================================================================
  // 11. FORM SUBMIT & CRUD MUTATIONS
  // =========================================================================
  async function handleFormSubmit(e) {
    e.preventDefault();

    if (!supabase) {
      if (!initSupabase()) return;
    }

    const isEdit = Boolean(state.editingVendorId);

    // Basic Validations
    const code = DOM.vendor_code.value.trim().toUpperCase();
    const firmName = DOM.name.value.trim();
    const primaryPhone = DOM.mobile_primary.value.trim();

    if (!code) {
      showToast('Vendor Code is required', 'warning');
      DOM.vendor_code.focus();
      return;
    }
    if (!firmName) {
      showToast('Firm / Business Name is required', 'warning');
      DOM.name.focus();
      return;
    }
    if (!primaryPhone) {
      showToast('Primary Contact Number is required', 'warning');
      DOM.mobile_primary.focus();
      return;
    }

    // Process specialty items (comma-separated into clean array)
    const itemsRaw = DOM.speciality_items_input.value.trim();
    const specialityArray = itemsRaw
      ? itemsRaw.split(',').map((it) => it.trim()).filter(Boolean)
      : [];

    const payload = {
      vendor_code: code,
      name: firmName,
      trade_name: DOM.trade_name.value.trim() || null,
      category: DOM.category.value,
      status: DOM.status.value,
      allows_cash_rokdu: DOM.allows_cash_rokdu.checked,
      gstin: DOM.gstin.value.trim().toUpperCase() || null,
      pan: DOM.pan.value.trim().toUpperCase() || null,
      msme_reg_no: DOM.msme_reg_no.value.trim().toUpperCase() || null,
      contact_person: DOM.contact_person.value.trim() || null,
      mobile_primary: primaryPhone,
      mobile_secondary: DOM.mobile_secondary.value.trim() || null,
      office_phone: DOM.office_phone.value.trim() || null,
      email: DOM.email.value.trim() || null,
      address_line: DOM.address_line.value.trim() || null,
      area_gidc: DOM.area_gidc.value.trim() || null,
      city: DOM.city.value.trim() || 'Surat',
      state: DOM.state.value.trim() || 'Gujarat',
      pincode: DOM.pincode.value.trim() || null,
      speciality_items: specialityArray,
      credit_period_days: parseInt(DOM.credit_period_days.value, 10) || 0,
      bank_name: DOM.bank_name.value.trim() || null,
      account_holder_name: DOM.account_holder_name.value.trim() || null,
      account_number: DOM.account_number.value.trim() || null,
      ifsc_code: DOM.ifsc_code.value.trim().toUpperCase() || null,
      remarks: DOM.remarks.value.trim() || null,
    };

    DOM.saveVendorSubmitBtn.disabled = true;
    DOM.saveBtnText.textContent = isEdit ? 'Updating...' : 'Saving...';

    try {
      if (isEdit) {
        const { error } = await supabase
          .from('vendors')
          .update(payload)
          .eq('id', state.editingVendorId);

        if (error) throw error;
        showToast(`Vendor ${firmName} updated successfully`, 'success');
      } else {
        const { error } = await supabase
          .from('vendors')
          .insert([payload]);

        if (error) throw error;
        showToast(`New Vendor ${firmName} created successfully`, 'success');
      }

      DOM.vendorForm.reset();
      state.editingVendorId = null;
      DOM.editingVendorId.value = '';
      switchView('directory');
      await fetchVendors();
    } catch (err) {
      console.error('Prayosha ERP Vendor Save Error:', err);
      showToast(`Save failed: ${err.message || 'Check database permissions'}`, 'error');
    } finally {
      DOM.saveVendorSubmitBtn.disabled = false;
      DOM.saveBtnText.textContent = isEdit ? 'Update Vendor Profile' : 'Save Vendor Profile';
    }
  }

  async function deleteVendor(vendorId) {
    const vendor = state.vendors.find((v) => v.id === vendorId);
    const vendorName = vendor ? vendor.name : 'this vendor';

    if (!confirm(`Are you sure you want to permanently remove "${vendorName}" from Prayosha ERP?`)) {
      return;
    }

    if (!supabase) {
      if (!initSupabase()) return;
    }

    try {
      const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', vendorId);

      if (error) throw error;

      showToast(`Vendor "${vendorName}" deleted successfully`, 'success');
      state.vendors = state.vendors.filter((v) => v.id !== vendorId);
      applyFilters();
      updateMetricBadges();
    } catch (err) {
      console.error('Prayosha ERP Delete Vendor Error:', err);
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // 12. CSV EXPORT UTILITY
  // =========================================================================
  function exportToCsv() {
    if (!state.filteredVendors || state.filteredVendors.length === 0) {
      showToast('No records available to export', 'warning');
      return;
    }

    const headers = [
      'Vendor Code',
      'Firm Name',
      'Trade Name',
      'Category',
      'Status',
      'GSTIN',
      'PAN',
      'Contact Person',
      'Primary Mobile',
      'Office Phone',
      'Email',
      'Area / GIDC',
      'City',
      'Credit Days',
      'Bank Name',
      'Account Number',
      'IFSC Code',
      'Rokdu Allowed',
      'Supplied Scope',
    ];

    const rows = state.filteredVendors.map((v) => [
      `"${(v.vendor_code || '').replace(/"/g, '""')}"`,
      `"${(v.name || '').replace(/"/g, '""')}"`,
      `"${(v.trade_name || '').replace(/"/g, '""')}"`,
      `"${(v.category || '').replace(/"/g, '""')}"`,
      `"${(v.status || '').replace(/"/g, '""')}"`,
      `"${(v.gstin || '').replace(/"/g, '""')}"`,
      `"${(v.pan || '').replace(/"/g, '""')}"`,
      `"${(v.contact_person || '').replace(/"/g, '""')}"`,
      `"${(v.mobile_primary || '').replace(/"/g, '""')}"`,
      `"${(v.office_phone || '').replace(/"/g, '""')}"`,
      `"${(v.email || '').replace(/"/g, '""')}"`,
      `"${(v.area_gidc || '').replace(/"/g, '""')}"`,
      `"${(v.city || '').replace(/"/g, '""')}"`,
      v.credit_period_days || 0,
      `"${(v.bank_name || '').replace(/"/g, '""')}"`,
      `"${(v.account_number || '').replace(/"/g, '""')}"`,
      `"${(v.ifsc_code || '').replace(/"/g, '""')}"`,
      v.allows_cash_rokdu ? 'YES' : 'NO',
      `"${(Array.isArray(v.speciality_items) ? v.speciality_items.join('; ') : v.speciality_items || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `Prayosha_Vendors_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Vendors exported to CSV successfully', 'success');
  }

  // =========================================================================
  // 13. EVENT LISTENERS INITIALIZATION
  // =========================================================================
  function bindEvents() {
    // Top Tabs
    DOM.tabDirectoryBtn.addEventListener('click', () => switchView('directory'));
    DOM.tabAddVendorBtn.addEventListener('click', openAddVendorView);

    // Form Cancel Buttons
    DOM.cancelFormBtn.addEventListener('click', () => switchView('directory'));
    DOM.cancelFormBottomBtn.addEventListener('click', () => switchView('directory'));

    // Form Submit
    DOM.vendorForm.addEventListener('submit', handleFormSubmit);

    // GSTIN Input Listener for PAN extraction and state badge
    DOM.gstin.addEventListener('input', (e) => handleGstinInputLogic(e.target.value));

    // IFSC Code auto-capitalize
    DOM.ifsc_code.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // PAN Code auto-capitalize
    DOM.pan.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Vendor Code auto-capitalize
    DOM.vendor_code.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Search and Filters
    let searchDebounceTimer = null;
    DOM.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.filters.search = e.target.value;
        applyFilters();
      }, 250);
    });

    DOM.categoryFilter.addEventListener('change', (e) => {
      state.filters.category = e.target.value;
      applyFilters();
    });

    DOM.statusFilter.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      applyFilters();
    });

    DOM.refreshBtn.addEventListener('click', fetchVendors);
    DOM.exportCsvBtn.addEventListener('click', exportToCsv);

    DOM.resetFilterBtn.addEventListener('click', () => {
      DOM.searchInput.value = '';
      DOM.categoryFilter.value = 'ALL';
      DOM.statusFilter.value = 'ALL';
      state.filters.search = '';
      state.filters.category = 'ALL';
      state.filters.status = 'ALL';
      applyFilters();
    });

    // Delegated actions on vendor cards container (View, Edit, Delete)
    DOM.vendorCardsContainer.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;

      const action = actionBtn.getAttribute('data-action');
      const vendorId = actionBtn.getAttribute('data-id');

      if (action === 'view') {
        showVendorDetails(vendorId);
      } else if (action === 'edit') {
        const vendor = state.vendors.find((v) => v.id === vendorId);
        if (vendor) openEditVendorView(vendor);
      } else if (action === 'delete') {
        deleteVendor(vendorId);
      }
    });

    // Modal Close
    DOM.closeDetailModalBtn.addEventListener('click', closeDetailModal);
    DOM.vendorDetailModal.addEventListener('click', (e) => {
      if (e.target === DOM.vendorDetailModal) {
        closeDetailModal();
      }
    });

    // Keyboard Escape to dismiss modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !DOM.vendorDetailModal.classList.contains('hidden')) {
        closeDetailModal();
      }
    });
  }

  // =========================================================================
  // 14. BOOTSTRAP ENTRY POINT
  // =========================================================================
  function init() {
    initSupabase();
    bindEvents();
    fetchVendors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();