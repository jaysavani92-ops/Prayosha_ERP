/**
 * ==============================================================================
 * PRAYOSHA ERP - PRE-DEVELOPMENT MODULE CONTROLLER
 * File: /pre-development/pre-development.js
 * Tech Stack: Vanilla JS (ES Modules), Supabase, Cloudflare R2, Tailwind CSS
 * ==============================================================================
 */

import { supabase, uploadToR2 } from '../config.js';

// Helper: Validate 36-character standard UUID
function isValidUUID(str) {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

// ==============================================================================
// APPLICATION STATE
// ==============================================================================
const state = {
    activeProjectId: null,
    activeProject: null,
    activeProjectName: '',
    activeProjectCode: '',
    projectsList: [],
    currentUser: null,
    userRole: 'Chief Engineer',
    userId: null,
    currentPhase: 'liasoning', // 'liasoning' | 'development_cost' | 'development'
    
    // Master categories from Super Core Engine
    categories: {
        liasoning: [],
        development_cost: [],
        development: []
    },

    // Current project records
    liasoningRecords: new Map(), // category_id -> record
    boqRecords: new Map(),       // category_id -> record
    developmentRecords: new Map(),// category_id -> record

    // Benchmark comparison data for Phase 2
    selectedBenchmarkProjectId: '',
    benchmarkRates: new Map(), // category_id -> { old_rate, old_amount }

    // Active upload context for modal
    uploadContext: {
        phase: null,
        categoryId: null,
        categoryName: null,
        selectedFile: null
    },

    // Filter & Search
    boqCategoryGroupFilter: 'ALL',
    searchQuery: '',

    // Realtime Notifications
    unreadNotificationsCount: 0
};

// ==============================================================================
// INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initSession();
    setupEventListeners();
    await loadUserContext();
    await fetchProjectsList();
    await loadActiveProject();
    setupRealtimeSubscriptions();
    setupCrossModuleSync();
});

/**
 * Restore active project from localStorage or URL parameter
 */
function initSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramProjectId = urlParams.get('project');

    if (paramProjectId && isValidUUID(paramProjectId)) {
        localStorage.setItem('activeProjectId', paramProjectId);
    }

    const storedId = localStorage.getItem('activeProjectId');
    state.activeProjectId = isValidUUID(storedId) ? storedId : null;
    state.activeProjectName = localStorage.getItem('activeProjectName') || '';
    state.activeProjectCode = localStorage.getItem('activeProjectCode') || '';
    state.userRole = localStorage.getItem('userRole') || 'Chief Engineer';
    state.userId = localStorage.getItem('userId') || null;
}

/**
 * Listen for workspace project switches triggered by universal shell top navbar
 */
function setupCrossModuleSync() {
    window.addEventListener('prayosha:project-switched', async (e) => {
        const project = e.detail;
        if (project && isValidUUID(project.id)) {
            state.activeProjectId = project.id;
            state.activeProjectName = project.project_name || '';
            state.activeProjectCode = project.project_code || '';
            await loadActiveProject();
            showToast(`Pre-Development synchronized: ${state.activeProjectName}`, 'info');
        } else {
            state.activeProjectId = null;
            state.activeProject = null;
            await loadActiveProject();
        }
    });
}

/**
 * Fetch authenticated user safely without triggering 401 Unauthorized
 */
async function loadUserContext() {
    try {
        const storedRole = localStorage.getItem('userRole');
        if (storedRole) state.userRole = storedRole;

        const storedUser = localStorage.getItem('prayosha_user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                state.currentUser = parsed;
                state.userId = parsed.id || null;
            } catch (_) {}
        }

        // Check for session first to prevent unauthenticated 401 error
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            state.currentUser = session.user;
            state.userId = session.user.id;

            const { data: profile } = await supabase
                .from('profiles')
                .select('role, full_name')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profile) {
                state.userRole = profile.role || state.userRole;
                state.currentUser.full_name = profile.full_name || session.user.email;
            }
        }
    } catch (err) {
        console.warn('User auth session fallback:', err.message);
    }
}

/**
 * Fetch all projects
 */
async function fetchProjectsList() {
    try {
        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name');

        if (error) throw error;

        state.projectsList = (projects || []).map(p => ({
            id: p.id,
            name: p.project_name || 'Untitled Project',
            project_code: p.project_code || ''
        }));

        renderBenchmarkDropdown();
    } catch (err) {
        console.error('Error fetching projects list:', err.message);
        showToast('Could not load projects list', 'warning');
    }
}

function renderBenchmarkDropdown() {
    const benchmarkDropdown = document.getElementById('benchmarkProjectSelector');
    if (!benchmarkDropdown) return;

    benchmarkDropdown.innerHTML = `<option value="">-- No Benchmark (Manual Old Rates) --</option>`;
    state.projectsList
        .filter(p => p.id !== state.activeProjectId)
        .forEach(p => {
            benchmarkDropdown.innerHTML += `
                <option value="${p.id}">
                    Benchmark: ${p.project_code ? '[' + p.project_code + '] ' : ''}${p.name}
                </option>
            `;
        });
}

/**
 * Load Active Project Data & Initialize UI
 */
async function loadActiveProject() {
    const alertBox = document.getElementById('noProjectAlert');
    const badge = document.getElementById('activeProjectBadge');
    const badgeText = document.getElementById('activeProjectCodeName');

    if (!isValidUUID(state.activeProjectId)) {
        if (alertBox) alertBox.classList.remove('hidden');
        if (badge) badge.classList.add('hidden');
        resetKpiSummary();
        renderEmptyStateTable();
        return;
    }

    if (alertBox) alertBox.classList.add('hidden');

    state.activeProject = state.projectsList.find(p => p.id === state.activeProjectId);
    if (state.activeProject) {
        if (badge && badgeText) {
            badge.classList.remove('hidden');
            badgeText.textContent = `${state.activeProject.project_code ? '[' + state.activeProject.project_code + '] ' : ''}${state.activeProject.name}`;
        }
        localStorage.setItem('activeProjectId', state.activeProject.id);
        localStorage.setItem('activeProjectName', state.activeProject.name);
        if (state.activeProject.project_code) {
            localStorage.setItem('activeProjectCode', state.activeProject.project_code);
        }
    }

    renderBenchmarkDropdown();

    await fetchMasterCategories();
    await Promise.all([
        loadLiasoningData(),
        loadBoqData(),
        loadDevelopmentData(),
        fetchUnreadNotifications()
    ]);

    updateKpiSummary();
}

function renderEmptyStateTable() {
    const lBody = document.getElementById('liasoningTableBody');
    const bBody = document.getElementById('boqTableBody');
    const dBody = document.getElementById('developmentTableBody');

    const msg = `<tr><td colspan="10" class="text-center py-8 text-amber-300/80 font-medium text-xs">Please select a specific project from the top navigation dropdown to load records.</td></tr>`;
    if (lBody) lBody.innerHTML = msg;
    if (bBody) bBody.innerHTML = msg;
    if (dBody) dBody.innerHTML = msg;
}

// ==============================================================================
// SUPER CORE ENGINE: CATEGORIES MANAGEMENT
// ==============================================================================
async function fetchMasterCategories() {
    try {
        const { data, error } = await supabase
            .from('pre_dev_categories')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        state.categories.liasoning = (data || []).filter(c => c.phase === 'liasoning');
        state.categories.development_cost = (data || []).filter(c => c.phase === 'development_cost');
        state.categories.development = (data || []).filter(c => c.phase === 'development');

        const badgeLiasoning = document.getElementById('tabBadgeLiasoning');
        const badgeBoq = document.getElementById('tabBadgeBoq');
        const badgeDev = document.getElementById('tabBadgeDev');

        if (badgeLiasoning) badgeLiasoning.textContent = state.categories.liasoning.length;
        if (badgeBoq) badgeBoq.textContent = state.categories.development_cost.length;
        if (badgeDev) badgeDev.textContent = state.categories.development.length;

    } catch (err) {
        console.error('Error fetching master categories:', err.message);
        showToast('Error loading pre-development categories', 'warning');
    }
}

// ==============================================================================
// PHASE 1: LIASONING
// ==============================================================================
async function loadLiasoningData() {
    if (!isValidUUID(state.activeProjectId)) return;
    try {
        const { data, error } = await supabase
            .from('pre_dev_liasoning')
            .select('*')
            .eq('project_id', state.activeProjectId);

        if (error) throw error;

        state.liasoningRecords.clear();
        (data || []).forEach(r => state.liasoningRecords.set(r.category_id, r));

        renderLiasoningTable();
    } catch (err) {
        console.error('Error loading Liasoning data:', err.message);
    }
}

function renderLiasoningTable() {
    const tbody = document.getElementById('liasoningTableBody');
    if (!tbody) return;

    const query = state.searchQuery.toLowerCase().trim();
    const categories = state.categories.liasoning.filter(c => 
        !query || c.name.toLowerCase().includes(query)
    );

    if (categories.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-slate-500 font-medium">
                    No liasoning clearances match your search.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = categories.map((cat, idx) => {
        const rec = state.liasoningRecords.get(cat.id) || {
            status: 'No',
            reference_no: '',
            clearance_date: '',
            document_url: '',
            document_name: '',
            remarks: ''
        };
        const isYes = rec.status === 'Yes';

        return `
            <tr data-cat-id="${cat.id}" class="hover:bg-slate-800/40 transition">
                <td class="py-3 px-4 text-center font-mono text-slate-500 text-xs">${idx + 1}</td>
                <td class="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${isYes ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
                    <span>${cat.name}</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only switch-checkbox liasoning-status-toggle" 
                               data-cat-id="${cat.id}" ${isYes ? 'checked' : ''}>
                        <div class="switch-label w-11 h-6 bg-slate-700 rounded-full transition-colors duration-200">
                            <div class="switch-handle w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-md transform translate-x-0.5 translate-y-0.5"></div>
                        </div>
                    </label>
                </td>
                <td class="py-3 px-4">
                    <input type="text" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full liasoning-ref-input" 
                           data-cat-id="${cat.id}" placeholder="Inward / Sanction No." 
                           value="${escapeHtml(rec.reference_no || '')}">
                </td>
                <td class="py-3 px-4">
                    <input type="date" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full liasoning-date-input" 
                           data-cat-id="${cat.id}" 
                           value="${rec.clearance_date || ''}">
                </td>
                <td class="py-3 px-4">
                    ${rec.document_url ? `
                        <div class="flex items-center gap-1.5">
                            <a href="${rec.document_url}" target="_blank" rel="noopener noreferrer" class="truncate max-w-[120px] text-prayosha-amber hover:underline text-[11px] font-medium flex items-center gap-1" title="${rec.document_name}">
                                <i class="fa-solid fa-file-pdf"></i> ${escapeHtml(rec.document_name || 'Document')}
                            </a>
                            <button type="button" class="text-slate-400 hover:text-white text-xs upload-doc-btn" 
                                    data-phase="liasoning" data-cat-id="${cat.id}" data-cat-name="${cat.name}" title="Replace file">
                                <i class="fa-solid fa-arrows-rotate"></i>
                            </button>
                        </div>
                    ` : `
                        <button type="button" class="px-2.5 py-1 rounded-lg glass-card hover:border-prayosha-amber/40 text-slate-300 text-[11px] font-medium transition flex items-center gap-1 upload-doc-btn" 
                                data-phase="liasoning" data-cat-id="${cat.id}" data-cat-name="${cat.name}">
                            <i class="fa-solid fa-cloud-arrow-up text-prayosha-amber"></i> Attach File
                        </button>
                    `}
                </td>
                <td class="py-3 px-4">
                    <input type="text" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full liasoning-remark-input" 
                           data-cat-id="${cat.id}" placeholder="Remarks..." 
                           value="${escapeHtml(rec.remarks || '')}">
                </td>
                <td class="py-3 px-4 text-center">
                    <button type="button" class="w-7 h-7 rounded-lg glass-card text-emerald-400 hover:bg-emerald-500/20 save-single-liasoning-btn" 
                            data-cat-id="${cat.id}" title="Quick Save Item">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    bindLiasoningRowEvents();
}

function bindLiasoningRowEvents() {
    document.querySelectorAll('.liasoning-status-toggle').forEach(el => {
        el.addEventListener('change', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.liasoningRecords.get(catId) || {};
            existing.status = e.target.checked ? 'Yes' : 'No';
            state.liasoningRecords.set(catId, existing);
            updateKpiSummary();
        });
    });

    document.querySelectorAll('.upload-doc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const current = e.currentTarget;
            openUploadModal(current.dataset.phase, current.dataset.catId, current.dataset.catName);
        });
    });

    document.querySelectorAll('.save-single-liasoning-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.catId;
            await saveSingleLiasoningRecord(catId);
        });
    });
}

async function saveAllLiasoningRecords() {
    if (!isValidUUID(state.activeProjectId)) {
        showToast('Please select a specific project first', 'warning');
        return;
    }

    const rowsToUpsert = [];
    state.categories.liasoning.forEach(cat => {
        const catId = cat.id;
        const rowEl = document.querySelector(`tr[data-cat-id="${catId}"]`);
        const statusToggle = rowEl ? rowEl.querySelector('.liasoning-status-toggle') : null;
        const refInput = rowEl ? rowEl.querySelector('.liasoning-ref-input') : null;
        const dateInput = rowEl ? rowEl.querySelector('.liasoning-date-input') : null;
        const remarkInput = rowEl ? rowEl.querySelector('.liasoning-remark-input') : null;

        const currentRec = state.liasoningRecords.get(catId) || {};

        const record = {
            project_id: state.activeProjectId,
            category_id: catId,
            status: statusToggle ? (statusToggle.checked ? 'Yes' : 'No') : (currentRec.status || 'No'),
            reference_no: refInput ? refInput.value.trim() : (currentRec.reference_no || null),
            clearance_date: dateInput && dateInput.value ? dateInput.value : (currentRec.clearance_date || null),
            document_url: currentRec.document_url || null,
            document_name: currentRec.document_name || null,
            remarks: remarkInput ? remarkInput.value.trim() : (currentRec.remarks || null),
            updated_by: state.userId || null,
            updated_at: new Date().toISOString()
        };

        state.liasoningRecords.set(catId, record);
        rowsToUpsert.push(record);
    });

    try {
        const { error } = await supabase
            .from('pre_dev_liasoning')
            .upsert(rowsToUpsert, { onConflict: 'project_id,category_id' });

        if (error) throw error;

        const approvedCount = rowsToUpsert.filter(r => r.status === 'Yes').length;
        await createAuditLog(
            'liasoning',
            'BATCH_UPDATE',
            `Saved ${rowsToUpsert.length} liasoning clearances (${approvedCount} approved).`
        );

        showToast('Liasoning clearances saved successfully!', 'success');
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving liasoning records:', err.message);
        showToast('Failed to save Liasoning records', 'warning');
    }
}

async function saveSingleLiasoningRecord(catId) {
    if (!isValidUUID(state.activeProjectId)) return;
    const rowEl = document.querySelector(`tr[data-cat-id="${catId}"]`);
    if (!rowEl) return;

    const status = rowEl.querySelector('.liasoning-status-toggle').checked ? 'Yes' : 'No';
    const refNo = rowEl.querySelector('.liasoning-ref-input').value.trim();
    const dateVal = rowEl.querySelector('.liasoning-date-input').value || null;
    const remarks = rowEl.querySelector('.liasoning-remark-input').value.trim();
    const currentRec = state.liasoningRecords.get(catId) || {};

    const record = {
        project_id: state.activeProjectId,
        category_id: catId,
        status: status,
        reference_no: refNo || null,
        clearance_date: dateVal,
        document_url: currentRec.document_url || null,
        document_name: currentRec.document_name || null,
        remarks: remarks || null,
        updated_by: state.userId || null,
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabase
            .from('pre_dev_liasoning')
            .upsert(record, { onConflict: 'project_id,category_id' });

        if (error) throw error;

        state.liasoningRecords.set(catId, record);

        const category = state.categories.liasoning.find(c => c.id === catId);
        await createAuditLog(
            'liasoning',
            'ITEM_UPDATE',
            `Updated ${category ? category.name : 'Clearance'}: Status is ${status}`
        );

        showToast(`Saved ${category ? category.name : 'clearance'}!`, 'success');
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving item:', err.message);
        showToast('Error saving item', 'warning');
    }
}

// ==============================================================================
// PHASE 2: COMPARATIVE BOQ ENGINE & BENCHMARK SCANNER
// ==============================================================================
async function loadBoqData() {
    if (!isValidUUID(state.activeProjectId)) return;
    try {
        const { data, error } = await supabase
            .from('pre_dev_boq')
            .select('*')
            .eq('project_id', state.activeProjectId);

        if (error) throw error;

        state.boqRecords.clear();
        (data || []).forEach(r => state.boqRecords.set(r.category_id, r));

        renderBoqTable();
    } catch (err) {
        console.error('Error loading BOQ data:', err.message);
    }
}

async function scanBenchmarkProject(benchmarkId) {
    if (!isValidUUID(benchmarkId)) {
        state.benchmarkRates.clear();
        state.selectedBenchmarkProjectId = '';
        renderBoqTable();
        updateKpiSummary();
        return;
    }

    try {
        const { data, error } = await supabase
            .from('pre_dev_boq')
            .select('category_id, new_rate, new_amount')
            .eq('project_id', benchmarkId);

        if (error) throw error;

        state.benchmarkRates.clear();
        state.selectedBenchmarkProjectId = benchmarkId;

        (data || []).forEach(item => {
            state.benchmarkRates.set(item.category_id, {
                old_rate: Number(item.new_rate) || 0,
                old_amount: Number(item.new_amount) || 0
            });
        });

        state.categories.development_cost.forEach(cat => {
            const current = state.boqRecords.get(cat.id) || {
                quantity: 0,
                new_rate: 0,
                remarks: ''
            };

            const benchmark = state.benchmarkRates.get(cat.id);
            if (benchmark && !current.is_manual_old_rate) {
                current.old_rate = benchmark.old_rate;
            }
            state.boqRecords.set(cat.id, current);
        });

        const benchmarkProject = state.projectsList.find(p => p.id === benchmarkId);
        showToast(`Scanned rates from ${benchmarkProject ? benchmarkProject.name : 'benchmark project'}!`, 'info');

        renderBoqTable();
        updateKpiSummary();
    } catch (err) {
        console.error('Error scanning benchmark project:', err.message);
        showToast('Error scanning benchmark project', 'warning');
    }
}

function renderBoqTable() {
    const tbody = document.getElementById('boqTableBody');
    if (!tbody) return;

    const query = state.searchQuery.toLowerCase().trim();
    const groupFilter = state.boqCategoryGroupFilter;

    const categories = state.categories.development_cost.filter(cat => {
        const matchesGroup = groupFilter === 'ALL' || cat.category_group === groupFilter;
        const matchesSearch = !query || cat.name.toLowerCase().includes(query) || (cat.category_group && cat.category_group.toLowerCase().includes(query));
        return matchesGroup && matchesSearch;
    });

    if (categories.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-8 text-slate-500 font-sans font-medium">
                    No BOQ line items match the selected category filter.
                </td>
            </tr>`;
        recalculateBoqFooters();
        return;
    }

    tbody.innerHTML = categories.map((cat, idx) => {
        const rec = state.boqRecords.get(cat.id) || {
            uom: cat.default_uom || 'Nos',
            quantity: 0,
            old_rate: 0,
            new_rate: 0,
            remarks: '',
            is_manual_old_rate: false
        };

        const qty = Number(rec.quantity) || 0;
        const oldRate = Number(rec.old_rate) || 0;
        const newRate = Number(rec.new_rate) || 0;
        const oldAmount = qty * oldRate;
        const newAmount = qty * newRate;
        const diff = newAmount - oldAmount;

        const isDiffPositive = diff > 0;
        const isDiffNegative = diff < 0;
        const diffClass = isDiffPositive ? 'text-amber-400' : (isDiffNegative ? 'text-emerald-400' : 'text-slate-400');

        return `
            <tr data-cat-id="${cat.id}" class="hover:bg-slate-800/40 transition">
                <td class="py-2.5 px-3 text-center text-slate-500 text-xs">${idx + 1}</td>
                <td class="py-2.5 px-4 font-sans font-medium text-slate-200">
                    <div>${cat.name}</div>
                    <div class="text-[10px] text-slate-500">${cat.category_group || 'General'}</div>
                </td>
                <td class="py-2.5 px-2 text-center">
                    <input type="text" class="glass-input text-xs py-1 px-1.5 rounded text-center w-20 boq-uom-input" 
                           data-cat-id="${cat.id}" value="${escapeHtml(rec.uom || cat.default_uom || 'Nos')}">
                </td>
                <td class="py-2.5 px-2 text-right">
                    <input type="number" step="any" class="glass-input text-xs py-1 px-2 rounded text-right w-24 boq-qty-input" 
                           data-cat-id="${cat.id}" value="${qty}">
                </td>
                <td class="py-2.5 px-2 text-right">
                    <div class="relative inline-block w-full">
                        <input type="number" step="any" class="glass-input text-xs py-1 px-2 rounded text-right w-24 boq-old-rate-input" 
                               data-cat-id="${cat.id}" value="${oldRate}">
                    </div>
                </td>
                <td class="py-2.5 px-2 text-right">
                    <input type="number" step="any" class="glass-input text-xs py-1 px-2 rounded text-right w-24 boq-new-rate-input" 
                               data-cat-id="${cat.id}" value="${newRate}">
                </td>
                <td class="py-2.5 px-3 text-right text-slate-300 font-mono boq-row-old-amt">
                    ₹${formatNumber(oldAmount)}
                </td>
                <td class="py-2.5 px-3 text-right text-emerald-400 font-bold font-mono boq-row-new-amt">
                    ₹${formatNumber(newAmount)}
                </td>
                <td class="py-2.5 px-3 text-right font-bold font-mono ${diffClass} boq-row-diff">
                    ${isDiffPositive ? '+' : ''}₹${formatNumber(diff)}
                </td>
                <td class="py-2.5 px-3">
                    <input type="text" class="glass-input text-xs py-1 px-2 rounded w-full boq-remark-input" 
                           data-cat-id="${cat.id}" placeholder="Note..." 
                           value="${escapeHtml(rec.remarks || '')}">
                </td>
            </tr>
        `;
    }).join('');

    bindBoqRowEvents();
    recalculateBoqFooters();
}

function bindBoqRowEvents() {
    const handleValueChange = (e) => {
        const catId = e.target.dataset.catId;
        const row = document.querySelector(`tr[data-cat-id="${catId}"]`);
        if (!row) return;

        const qty = parseFloat(row.querySelector('.boq-qty-input').value) || 0;
        const oldRate = parseFloat(row.querySelector('.boq-old-rate-input').value) || 0;
        const newRate = parseFloat(row.querySelector('.boq-new-rate-input').value) || 0;

        const oldAmount = qty * oldRate;
        const newAmount = qty * newRate;
        const diff = newAmount - oldAmount;

        const oldAmtCell = row.querySelector('.boq-row-old-amt');
        const newAmtCell = row.querySelector('.boq-row-new-amt');
        const diffCell = row.querySelector('.boq-row-diff');

        if (oldAmtCell) oldAmtCell.textContent = `₹${formatNumber(oldAmount)}`;
        if (newAmtCell) newAmtCell.textContent = `₹${formatNumber(newAmount)}`;
        if (diffCell) {
            diffCell.textContent = `${diff > 0 ? '+' : ''}₹${formatNumber(diff)}`;
            diffCell.className = `py-2.5 px-3 text-right font-bold font-mono boq-row-diff ${diff > 0 ? 'text-amber-400' : (diff < 0 ? 'text-emerald-400' : 'text-slate-400')}`;
        }

        const existing = state.boqRecords.get(catId) || {};
        existing.quantity = qty;
        existing.old_rate = oldRate;
        existing.new_rate = newRate;
        if (e.target.classList.contains('boq-old-rate-input')) {
            existing.is_manual_old_rate = true;
        }
        state.boqRecords.set(catId, existing);

        recalculateBoqFooters();
        updateKpiSummary();
    };

    document.querySelectorAll('.boq-qty-input, .boq-old-rate-input, .boq-new-rate-input').forEach(input => {
        input.addEventListener('input', handleValueChange);
    });

    document.querySelectorAll('.boq-uom-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.boqRecords.get(catId) || {};
            existing.uom = e.target.value.trim();
            state.boqRecords.set(catId, existing);
        });
    });

    document.querySelectorAll('.boq-remark-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.boqRecords.get(catId) || {};
            existing.remarks = e.target.value.trim();
            state.boqRecords.set(catId, existing);
        });
    });
}

function recalculateBoqFooters() {
    let sumOld = 0;
    let sumNew = 0;

    state.categories.development_cost.forEach(cat => {
        const rec = state.boqRecords.get(cat.id);
        if (rec) {
            const q = Number(rec.quantity) || 0;
            const o = Number(rec.old_rate) || 0;
            const n = Number(rec.new_rate) || 0;
            sumOld += q * o;
            sumNew += q * n;
        }
    });

    const totalDiff = sumNew - sumOld;

    const elOld = document.getElementById('tfootTotalOldAmount');
    const elNew = document.getElementById('tfootTotalNewAmount');
    const elDiff = document.getElementById('tfootTotalDifference');
    const elBadge = document.getElementById('tfootVarianceBadge');

    if (elOld) elOld.textContent = `₹${formatNumber(sumOld)}`;
    if (elNew) elNew.textContent = `₹${formatNumber(sumNew)}`;
    if (elDiff) {
        elDiff.textContent = `${totalDiff > 0 ? '+' : ''}₹${formatNumber(totalDiff)}`;
        elDiff.className = `py-3 px-3 text-right font-mono ${totalDiff > 0 ? 'text-amber-400' : (totalDiff < 0 ? 'text-emerald-400' : 'text-slate-300')}`;
    }

    if (elBadge) {
        if (sumOld > 0) {
            const pct = ((totalDiff / sumOld) * 100).toFixed(1);
            elBadge.textContent = `${pct > 0 ? '+' : ''}${pct}% Variance`;
            elBadge.className = `inline-block px-2 py-0.5 rounded text-[10px] font-bold ${pct > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`;
        } else {
            elBadge.textContent = `Baseline Established`;
            elBadge.className = `inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400`;
        }
    }
}

async function saveAllBoqRecords() {
    if (!isValidUUID(state.activeProjectId)) {
        showToast('Please select a specific project first', 'warning');
        return;
    }

    const rowsToUpsert = [];
    state.categories.development_cost.forEach(cat => {
        const catId = cat.id;
        const rowEl = document.querySelector(`tr[data-cat-id="${catId}"]`);

        let uom = cat.default_uom || 'Nos';
        let qty = 0;
        let oldRate = 0;
        let newRate = 0;
        let remarks = '';
        let isManual = false;

        const currentRec = state.boqRecords.get(catId);

        if (rowEl) {
            uom = rowEl.querySelector('.boq-uom-input').value.trim() || uom;
            qty = parseFloat(rowEl.querySelector('.boq-qty-input').value) || 0;
            oldRate = parseFloat(rowEl.querySelector('.boq-old-rate-input').value) || 0;
            newRate = parseFloat(rowEl.querySelector('.boq-new-rate-input').value) || 0;
            remarks = rowEl.querySelector('.boq-remark-input').value.trim();
            isManual = currentRec ? currentRec.is_manual_old_rate : false;
        } else if (currentRec) {
            uom = currentRec.uom || uom;
            qty = currentRec.quantity || 0;
            oldRate = currentRec.old_rate || 0;
            newRate = currentRec.new_rate || 0;
            remarks = currentRec.remarks || '';
            isManual = currentRec.is_manual_old_rate || false;
        }

        const record = {
            project_id: state.activeProjectId,
            category_id: catId,
            uom: uom,
            quantity: qty,
            old_rate: oldRate,
            new_rate: newRate,
            benchmark_project_id: isValidUUID(state.selectedBenchmarkProjectId) ? state.selectedBenchmarkProjectId : null,
            is_manual_old_rate: isManual,
            remarks: remarks || null,
            updated_by: state.userId || null,
            updated_at: new Date().toISOString()
        };

        state.boqRecords.set(catId, record);
        rowsToUpsert.push(record);
    });

    try {
        const { error } = await supabase
            .from('pre_dev_boq')
            .upsert(rowsToUpsert, { onConflict: 'project_id,category_id' });

        if (error) throw error;

        let totalNew = rowsToUpsert.reduce((acc, r) => acc + (r.quantity * r.new_rate), 0);
        await createAuditLog(
            'development_cost',
            'BOQ_SYNC',
            `Updated comparative BOQ (Total Budget: ₹${formatNumber(totalNew)}) across ${rowsToUpsert.length} items.`
        );

        showToast('Development Cost (BOQ) saved successfully!', 'success');
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving BOQ:', err.message);
        showToast('Failed to save BOQ estimates', 'warning');
    }
}

// ==============================================================================
// PHASE 3: DEVELOPMENT (SITE MOBILIZATION)
// ==============================================================================
async function loadDevelopmentData() {
    if (!isValidUUID(state.activeProjectId)) return;
    try {
        const { data, error } = await supabase
            .from('pre_dev_development')
            .select('*')
            .eq('project_id', state.activeProjectId);

        if (error) throw error;

        state.developmentRecords.clear();
        (data || []).forEach(r => state.developmentRecords.set(r.category_id, r));

        renderDevelopmentTable();
    } catch (err) {
        console.error('Error loading development mobilization data:', err.message);
    }
}

function renderDevelopmentTable() {
    const tbody = document.getElementById('developmentTableBody');
    if (!tbody) return;

    const query = state.searchQuery.toLowerCase().trim();
    const categories = state.categories.development.filter(c => 
        !query || c.name.toLowerCase().includes(query)
    );

    if (categories.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-slate-500 font-medium">
                    No site mobilization milestones match your search.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = categories.map((cat, idx) => {
        const rec = state.developmentRecords.get(cat.id) || {
            status: 'No',
            reference_no: '',
            completion_date: '',
            document_url: '',
            document_name: '',
            remarks: ''
        };
        const isYes = rec.status === 'Yes';

        return `
            <tr data-cat-id="${cat.id}" class="hover:bg-slate-800/40 transition">
                <td class="py-3 px-4 text-center font-mono text-slate-500 text-xs">${idx + 1}</td>
                <td class="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${isYes ? 'bg-prayosha-indigo' : 'bg-slate-600'}"></span>
                    <span>${cat.name}</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only switch-checkbox dev-status-toggle" 
                               data-cat-id="${cat.id}" ${isYes ? 'checked' : ''}>
                        <div class="switch-label w-11 h-6 bg-slate-700 rounded-full transition-colors duration-200">
                            <div class="switch-handle w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-md transform translate-x-0.5 translate-y-0.5"></div>
                        </div>
                    </label>
                </td>
                <td class="py-3 px-4">
                    <input type="text" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full dev-ref-input" 
                           data-cat-id="${cat.id}" placeholder="Contractor / Inward No." 
                           value="${escapeHtml(rec.reference_no || '')}">
                </td>
                <td class="py-3 px-4">
                    <input type="date" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full dev-date-input" 
                           data-cat-id="${cat.id}" 
                           value="${rec.completion_date || ''}">
                </td>
                <td class="py-3 px-4">
                    ${rec.document_url ? `
                        <div class="flex items-center gap-1.5">
                            <a href="${rec.document_url}" target="_blank" rel="noopener noreferrer" class="truncate max-w-[120px] text-prayosha-amber hover:underline text-[11px] font-medium flex items-center gap-1" title="${rec.document_name}">
                                <i class="fa-solid fa-file-image"></i> ${escapeHtml(rec.document_name || 'Attachment')}
                            </a>
                            <button type="button" class="text-slate-400 hover:text-white text-xs upload-doc-btn" 
                                    data-phase="development" data-cat-id="${cat.id}" data-cat-name="${cat.name}" title="Replace">
                                <i class="fa-solid fa-arrows-rotate"></i>
                            </button>
                        </div>
                    ` : `
                        <button type="button" class="px-2.5 py-1 rounded-lg glass-card hover:border-prayosha-amber/40 text-slate-300 text-[11px] font-medium transition flex items-center gap-1 upload-doc-btn" 
                                data-phase="development" data-cat-id="${cat.id}" data-cat-name="${cat.name}">
                            <i class="fa-solid fa-cloud-arrow-up text-prayosha-indigo"></i> Attach File
                        </button>
                    `}
                </td>
                <td class="py-3 px-4">
                    <input type="text" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full dev-remark-input" 
                           data-cat-id="${cat.id}" placeholder="Site remarks..." 
                           value="${escapeHtml(rec.remarks || '')}">
                </td>
                <td class="py-3 px-4 text-center">
                    <button type="button" class="w-7 h-7 rounded-lg glass-card text-emerald-400 hover:bg-emerald-500/20 save-single-dev-btn" 
                            data-cat-id="${cat.id}" title="Quick Save Item">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    bindDevelopmentRowEvents();
}

function bindDevelopmentRowEvents() {
    document.querySelectorAll('.dev-status-toggle').forEach(el => {
        el.addEventListener('change', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.developmentRecords.get(catId) || {};
            existing.status = e.target.checked ? 'Yes' : 'No';
            state.developmentRecords.set(catId, existing);
            updateKpiSummary();
        });
    });

    document.querySelectorAll('.upload-doc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const current = e.currentTarget;
            openUploadModal(current.dataset.phase, current.dataset.catId, current.dataset.catName);
        });
    });

    document.querySelectorAll('.save-single-dev-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.catId;
            await saveSingleDevRecord(catId);
        });
    });
}

async function saveAllDevelopmentRecords() {
    if (!isValidUUID(state.activeProjectId)) {
        showToast('Please select a specific project first', 'warning');
        return;
    }

    const rowsToUpsert = [];
    state.categories.development.forEach(cat => {
        const catId = cat.id;
        const rowEl = document.querySelector(`tr[data-cat-id="${catId}"]`);
        const statusToggle = rowEl ? rowEl.querySelector('.dev-status-toggle') : null;
        const refInput = rowEl ? rowEl.querySelector('.dev-ref-input') : null;
        const dateInput = rowEl ? rowEl.querySelector('.dev-date-input') : null;
        const remarkInput = rowEl ? rowEl.querySelector('.dev-remark-input') : null;

        const currentRec = state.developmentRecords.get(catId) || {};

        const record = {
            project_id: state.activeProjectId,
            category_id: catId,
            status: statusToggle ? (statusToggle.checked ? 'Yes' : 'No') : (currentRec.status || 'No'),
            reference_no: refInput ? refInput.value.trim() : (currentRec.reference_no || null),
            completion_date: dateInput && dateInput.value ? dateInput.value : (currentRec.completion_date || null),
            document_url: currentRec.document_url || null,
            document_name: currentRec.document_name || null,
            remarks: remarkInput ? remarkInput.value.trim() : (currentRec.remarks || null),
            updated_by: state.userId || null,
            updated_at: new Date().toISOString()
        };

        state.developmentRecords.set(catId, record);
        rowsToUpsert.push(record);
    });

    try {
        const { error } = await supabase
            .from('pre_dev_development')
            .upsert(rowsToUpsert, { onConflict: 'project_id,category_id' });

        if (error) throw error;

        const readyCount = rowsToUpsert.filter(r => r.status === 'Yes').length;
        await createAuditLog(
            'development',
            'BATCH_UPDATE',
            `Saved ${rowsToUpsert.length} site mobilization milestones (${readyCount} ready).`
        );

        showToast('Site mobilization milestones saved!', 'success');
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving development milestones:', err.message);
        showToast('Failed to save mobilization records', 'warning');
    }
}

async function saveSingleDevRecord(catId) {
    if (!isValidUUID(state.activeProjectId)) return;
    const rowEl = document.querySelector(`tr[data-cat-id="${catId}"]`);
    if (!rowEl) return;

    const status = rowEl.querySelector('.dev-status-toggle').checked ? 'Yes' : 'No';
    const refNo = rowEl.querySelector('.dev-ref-input').value.trim();
    const dateVal = rowEl.querySelector('.dev-date-input').value || null;
    const remarks = rowEl.querySelector('.dev-remark-input').value.trim();
    const currentRec = state.developmentRecords.get(catId) || {};

    const record = {
        project_id: state.activeProjectId,
        category_id: catId,
        status: status,
        reference_no: refNo || null,
        completion_date: dateVal,
        document_url: currentRec.document_url || null,
        document_name: currentRec.document_name || null,
        remarks: remarks || null,
        updated_by: state.userId || null,
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabase
            .from('pre_dev_development')
            .upsert(record, { onConflict: 'project_id,category_id' });

        if (error) throw error;

        state.developmentRecords.set(catId, record);

        const category = state.categories.development.find(c => c.id === catId);
        await createAuditLog(
            'development',
            'ITEM_UPDATE',
            `Updated ${category ? category.name : 'Mobilization item'}: Status is ${status}`
        );

        showToast(`Saved ${category ? category.name : 'mobilization milestone'}!`, 'success');
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving item:', err.message);
        showToast('Error saving item', 'warning');
    }
}

// ==============================================================================
// CLOUDFLARE R2 OBJECT STORAGE UPLOADER
// ==============================================================================
function openUploadModal(phase, catId, catName) {
    state.uploadContext = {
        phase: phase,
        categoryId: catId,
        categoryName: catName,
        selectedFile: null
    };

    document.getElementById('uploadTargetItemName').textContent = `${phase === 'liasoning' ? 'Phase 1: Liasoning' : 'Phase 3: Site Development'} • ${catName}`;
    document.getElementById('r2FileInput').value = '';
    document.getElementById('selectedFileChip').classList.add('hidden');
    document.getElementById('uploadProgressBarContainer').classList.add('hidden');
    document.getElementById('uploadProgressBar').style.width = '0%';
    document.getElementById('uploadProgressText').textContent = '0%';

    document.getElementById('uploadDocModal').classList.remove('hidden');
}

function closeUploadModal() {
    document.getElementById('uploadDocModal').classList.add('hidden');
}

async function handleDirectR2Upload() {
    const file = state.uploadContext.selectedFile;
    if (!file) {
        showToast('Please select a document to upload', 'warning');
        return;
    }

    const { phase, categoryId } = state.uploadContext;
    const progressContainer = document.getElementById('uploadProgressBarContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const confirmBtn = document.getElementById('confirmUploadBtn');

    progressContainer.classList.remove('hidden');
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-50');

    try {
        progressBar.style.width = '50%';
        progressText.textContent = '50%';

        const folder = `pre-dev/${state.activeProjectId || 'common'}/${phase}`;
        const publicFileUrl = await uploadToR2(file, folder);

        progressBar.style.width = '100%';
        progressText.textContent = '100%';

        if (phase === 'liasoning') {
            const rec = state.liasoningRecords.get(categoryId) || { status: 'Yes' };
            rec.document_url = publicFileUrl;
            rec.document_name = file.name;
            rec.status = 'Yes';
            state.liasoningRecords.set(categoryId, rec);
            renderLiasoningTable();
        } else if (phase === 'development') {
            const rec = state.developmentRecords.get(categoryId) || { status: 'Yes' };
            rec.document_url = publicFileUrl;
            rec.document_name = file.name;
            rec.status = 'Yes';
            state.developmentRecords.set(categoryId, rec);
            renderDevelopmentTable();
        }

        showToast(`Document attached to ${state.uploadContext.categoryName}!`, 'success');
        closeUploadModal();
    } catch (err) {
        console.error('Cloudflare R2 Upload Failed:', err);
        showToast('Upload failed: ' + err.message, 'warning');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('opacity-50');
    }
}

// ==============================================================================
// SUPER CORE ENGINE: DYNAMIC SUB-CATEGORIES CRUD
// ==============================================================================
function openSuperEngineModal() {
    renderSuperEngineCategoriesList();
    document.getElementById('superEngineModal').classList.remove('hidden');
}

function closeSuperEngineModal() {
    document.getElementById('superEngineModal').classList.add('hidden');
}

function renderSuperEngineCategoriesList() {
    const listContainer = document.getElementById('superEngineCategoryList');
    const phaseSelect = document.getElementById('superEnginePhaseSelect');
    const activePhase = phaseSelect.value;

    const items = state.categories[activePhase] || [];

    if (items.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                No active sub-categories found in this phase.
            </div>`;
        return;
    }

    listContainer.innerHTML = items.map((cat, idx) => `
        <div class="glass-card rounded-xl p-3 flex items-center justify-between gap-3 border border-white/5">
            <div class="flex items-center gap-3 min-w-0">
                <span class="text-xs font-mono text-slate-500 w-5">${idx + 1}</span>
                <div class="min-w-0">
                    <input type="text" class="glass-input text-xs font-semibold py-1 px-2 rounded w-full sm:w-64 category-rename-input" 
                           data-cat-id="${cat.id}" value="${escapeHtml(cat.name)}">
                    <div class="text-[10px] text-slate-500 mt-0.5">
                        Group: <span class="text-slate-400 font-medium">${cat.category_group || 'General'}</span> • 
                        UOM: <span class="text-slate-400 font-medium">${cat.default_uom || 'Nos'}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <button type="button" class="px-2.5 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 save-cat-rename-btn" 
                        data-cat-id="${cat.id}" title="Save Name Change">
                    <i class="fa-solid fa-floppy-disk"></i>
                </button>
                <button type="button" class="px-2.5 py-1 rounded text-[11px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 delete-cat-btn" 
                        data-cat-id="${cat.id}" data-cat-name="${cat.name}" title="Deactivate Sub-Category">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');

    listContainer.querySelectorAll('.save-cat-rename-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.catId;
            const input = listContainer.querySelector(`.category-rename-input[data-cat-id="${catId}"]`);
            if (input) {
                await updateCategoryName(catId, input.value.trim());
            }
        });
    });

    listContainer.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.catId;
            const catName = e.currentTarget.dataset.catName;
            if (confirm(`Are you sure you want to disable "${catName}"?`)) {
                await deleteCategory(catId);
            }
        });
    });
}

async function handleAddNewCategory() {
    const nameInput = document.getElementById('newCategoryNameInput');
    const groupInput = document.getElementById('newCategoryGroupInput');
    const uomInput = document.getElementById('newCategoryUomInput');
    const phaseSelect = document.getElementById('superEnginePhaseSelect');

    const name = nameInput.value.trim();
    const group = groupInput.value.trim() || 'General';
    const uom = uomInput.value.trim() || 'Nos';
    const phase = phaseSelect.value;

    if (!name) {
        showToast('Please enter a sub-category name', 'warning');
        return;
    }

    try {
        const nextOrder = (state.categories[phase]?.length || 0) + 1;
        const { error } = await supabase
            .from('pre_dev_categories')
            .insert({
                phase: phase,
                category_group: group,
                name: name,
                default_uom: uom,
                sort_order: nextOrder,
                is_active: true
            });

        if (error) throw error;

        nameInput.value = '';
        showToast(`Added "${name}" to ${phase}!`, 'success');

        await fetchMasterCategories();
        renderSuperEngineCategoriesList();

        if (state.currentPhase === 'liasoning') renderLiasoningTable();
        if (state.currentPhase === 'development_cost') renderBoqTable();
        if (state.currentPhase === 'development') renderDevelopmentTable();
    } catch (err) {
        console.error('Error creating category:', err.message);
        showToast('Error creating sub-category', 'warning');
    }
}

async function updateCategoryName(catId, newName) {
    if (!newName) return;
    try {
        const { error } = await supabase
            .from('pre_dev_categories')
            .update({ name: newName, updated_at: new Date().toISOString() })
            .eq('id', catId);

        if (error) throw error;

        showToast('Sub-category updated!', 'success');
        await fetchMasterCategories();
        if (state.currentPhase === 'liasoning') renderLiasoningTable();
        if (state.currentPhase === 'development_cost') renderBoqTable();
        if (state.currentPhase === 'development') renderDevelopmentTable();
    } catch (err) {
        console.error('Error updating category:', err.message);
        showToast('Error updating name', 'warning');
    }
}

async function deleteCategory(catId) {
    try {
        const { error } = await supabase
            .from('pre_dev_categories')
            .update({ is_active: false })
            .eq('id', catId);

        if (error) throw error;

        showToast('Sub-category disabled', 'info');
        await fetchMasterCategories();
        renderSuperEngineCategoriesList();

        if (state.currentPhase === 'liasoning') renderLiasoningTable();
        if (state.currentPhase === 'development_cost') renderBoqTable();
        if (state.currentPhase === 'development') renderDevelopmentTable();
    } catch (err) {
        console.error('Error disabling category:', err.message);
        showToast('Could not disable category', 'warning');
    }
}

// ==============================================================================
// AUDIT LOGGING & DRAWER CONTROLS
// ==============================================================================
async function createAuditLog(phase, actionType, summary, changes = {}) {
    if (!isValidUUID(state.activeProjectId)) return;
    try {
        await supabase
            .from('pre_dev_audit_logs')
            .insert({
                project_id: state.activeProjectId,
                phase: phase,
                action_type: actionType,
                summary: summary,
                changes: changes,
                actor_id: state.userId || null,
                actor_name: state.currentUser?.full_name || 'Project Admin'
            });
    } catch (err) {
        console.warn('Audit log write error:', err.message);
    }
}

async function openAuditDrawer() {
    const drawer = document.getElementById('auditDrawer');
    const timeline = document.getElementById('auditLogTimeline');
    drawer.classList.remove('hidden');

    if (!isValidUUID(state.activeProjectId)) {
        timeline.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">Please select a project to view its audit log.</div>`;
        return;
    }

    try {
        const { data, error } = await supabase
            .from('pre_dev_audit_logs')
            .select('*')
            .eq('project_id', state.activeProjectId)
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) throw error;

        if (!data || data.length === 0) {
            timeline.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">No audit history recorded yet.</div>`;
            return;
        }

        timeline.innerHTML = data.map(log => {
            const timeAgo = formatTimeAgo(log.created_at);
            const phaseLabel = log.phase === 'liasoning' ? 'Phase 1' : (log.phase === 'development_cost' ? 'Phase 2 BOQ' : 'Phase 3 Site');
            return `
                <div class="glass-card rounded-xl p-3 border-l-2 border-prayosha-amber space-y-1">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-bold text-prayosha-amber uppercase tracking-wider">${phaseLabel}</span>
                        <span class="text-slate-500">${timeAgo}</span>
                    </div>
                    <p class="text-xs text-slate-200 font-medium">${escapeHtml(log.summary)}</p>
                    <div class="text-[10px] text-slate-400 flex items-center gap-1.5 pt-1">
                        <i class="fa-solid fa-user-shield text-[9px]"></i>
                        <span>${escapeHtml(log.actor_name || 'System User')}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading audit logs:', err.message);
        timeline.innerHTML = `<div class="text-center py-8 text-rose-400 text-xs">Error loading audit logs.</div>`;
    }
}

function closeAuditDrawer() {
    document.getElementById('auditDrawer').classList.add('hidden');
}

// ==============================================================================
// REALTIME NOTIFICATIONS & SUBSCRIPTIONS
// ==============================================================================
function setupRealtimeSubscriptions() {
    try {
        const channel = supabase
            .channel('pre-development-realtime-sync')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    handleIncomingNotification(payload.new);
                }
            )
            .subscribe();

        return channel;
    } catch (err) {
        console.warn('Realtime subscription skipped:', err.message);
    }
}

function handleIncomingNotification(notification) {
    state.unreadNotificationsCount += 1;
    updateNotificationBadge();
    showToast(notification.title + ': ' + notification.message, 'info');

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
            body: notification.message,
            icon: '../icons/icon-192x192.png'
        });
    }
}

async function fetchUnreadNotifications() {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) return;

        state.unreadNotificationsCount = data?.length || 0;
        updateNotificationBadge();
    } catch (err) {
        console.warn('Could not fetch notifications:', err.message);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    if (state.unreadNotificationsCount > 0) {
        badge.textContent = state.unreadNotificationsCount > 9 ? '9+' : state.unreadNotificationsCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function openNotificationsDrawer() {
    const drawer = document.getElementById('notificationsDrawer');
    const list = document.getElementById('notificationsList');
    drawer.classList.remove('hidden');

    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">No notifications found.</div>`;
            return;
        }

        list.innerHTML = data.map(item => `
            <div class="glass-card rounded-xl p-3 border-l-2 ${item.is_read ? 'border-slate-700 opacity-60' : 'border-emerald-400'} space-y-1">
                <div class="flex items-center justify-between text-[11px]">
                    <span class="font-bold text-white">${escapeHtml(item.title)}</span>
                    <span class="text-slate-500">${formatTimeAgo(item.created_at)}</span>
                </div>
                <p class="text-xs text-slate-300">${escapeHtml(item.message)}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading notifications:', err.message);
    }
}

function closeNotificationsDrawer() {
    document.getElementById('notificationsDrawer').classList.add('hidden');
}

async function markAllNotificationsRead() {
    try {
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('is_read', false);

        state.unreadNotificationsCount = 0;
        updateNotificationBadge();
        openNotificationsDrawer();
        showToast('All notifications marked as read', 'info');
    } catch (err) {
        console.error('Error marking notifications read:', err.message);
    }
}

// ==============================================================================
// KPI SUMMARY BAR UPDATES
// ==============================================================================
function resetKpiSummary() {
    document.getElementById('kpiLiasoningCount').textContent = '0 / 0';
    document.getElementById('kpiLiasoningPercent').textContent = '0%';
    document.getElementById('kpiLiasoningBar').style.width = '0%';
    document.getElementById('kpiTotalNewAmount').textContent = '0.00';
    document.getElementById('kpiTotalVariance').textContent = '0.00';
    document.getElementById('kpiDevCount').textContent = '0 / 0';
    document.getElementById('kpiDevPercent').textContent = '0%';
    document.getElementById('kpiDevBar').style.width = '0%';
}

function updateKpiSummary() {
    if (!isValidUUID(state.activeProjectId)) {
        resetKpiSummary();
        return;
    }

    // 1. Liasoning Clearances
    const totalLiasoning = state.categories.liasoning.length || 11;
    let approvedLiasoning = 0;
    state.categories.liasoning.forEach(c => {
        const rec = state.liasoningRecords.get(c.id);
        if (rec && rec.status === 'Yes') approvedLiasoning++;
    });

    const liasoningPct = totalLiasoning > 0 ? Math.round((approvedLiasoning / totalLiasoning) * 100) : 0;
    const kpiLCount = document.getElementById('kpiLiasoningCount');
    const kpiLPct = document.getElementById('kpiLiasoningPercent');
    const kpiLBar = document.getElementById('kpiLiasoningBar');

    if (kpiLCount) kpiLCount.textContent = `${approvedLiasoning} / ${totalLiasoning}`;
    if (kpiLPct) kpiLPct.textContent = `${liasoningPct}%`;
    if (kpiLBar) kpiLBar.style.width = `${liasoningPct}%`;

    // 2. BOQ Total New Budget & Variance
    let totalOld = 0;
    let totalNew = 0;
    state.categories.development_cost.forEach(c => {
        const rec = state.boqRecords.get(c.id);
        if (rec) {
            const q = Number(rec.quantity) || 0;
            const o = Number(rec.old_rate) || 0;
            const n = Number(rec.new_rate) || 0;
            totalOld += q * o;
            totalNew += q * n;
        }
    });

    const variance = totalNew - totalOld;
    const kpiNewAmt = document.getElementById('kpiTotalNewAmount');
    const kpiVar = document.getElementById('kpiTotalVariance');

    if (kpiNewAmt) kpiNewAmt.textContent = formatNumber(totalNew);
    if (kpiVar) kpiVar.textContent = formatNumber(Math.abs(variance));

    const varIndicator = document.getElementById('kpiVarianceIndicator');
    const varIconBox = document.getElementById('kpiVarianceIconBox');

    if (varIndicator && varIconBox) {
        if (!state.selectedBenchmarkProjectId && totalOld === 0) {
            varIndicator.innerHTML = `<i class="fa-solid fa-minus"></i> Baseline Setup`;
            varIndicator.className = 'text-[11px] font-semibold text-slate-400 flex items-center gap-1';
            varIconBox.className = 'w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-xl flex-shrink-0';
        } else if (variance > 0) {
            varIndicator.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> +₹${formatNumber(variance)} (Escalation)`;
            varIndicator.className = 'text-[11px] font-semibold text-rose-400 flex items-center gap-1';
            varIconBox.className = 'w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center text-xl flex-shrink-0';
        } else if (variance < 0) {
            varIndicator.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> -₹${formatNumber(Math.abs(variance))} (Savings)`;
            varIndicator.className = 'text-[11px] font-semibold text-emerald-400 flex items-center gap-1';
            varIconBox.className = 'w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xl flex-shrink-0';
        } else {
            varIndicator.innerHTML = `<i class="fa-solid fa-equals"></i> Parity with benchmark`;
            varIndicator.className = 'text-[11px] font-semibold text-slate-300 flex items-center gap-1';
            varIconBox.className = 'w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-xl flex-shrink-0';
        }
    }

    // 3. Site Mobilization
    const totalDev = state.categories.development.length || 10;
    let readyDev = 0;
    state.categories.development.forEach(c => {
        const rec = state.developmentRecords.get(c.id);
        if (rec && rec.status === 'Yes') readyDev++;
    });

    const devPct = totalDev > 0 ? Math.round((readyDev / totalDev) * 100) : 0;
    const kpiDCount = document.getElementById('kpiDevCount');
    const kpiDPct = document.getElementById('kpiDevPercent');
    const kpiDBar = document.getElementById('kpiDevBar');

    if (kpiDCount) kpiDCount.textContent = `${readyDev} / ${totalDev}`;
    if (kpiDPct) kpiDPct.textContent = `${devPct}%`;
    if (kpiDBar) kpiDBar.style.width = `${devPct}%`;
}

// ==============================================================================
// EVENT LISTENERS & UI ROUTING
// ==============================================================================
function setupEventListeners() {
    const tabBtns = [
        document.getElementById('tabLiasoningBtn'),
        document.getElementById('tabBoqBtn'),
        document.getElementById('tabDevBtn')
    ];

    tabBtns.forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            const phase = e.currentTarget.dataset.phase;
            switchPhaseTab(phase);
        });
    });

    const masterSave = document.getElementById('masterSaveBtn');
    if (masterSave) {
        masterSave.addEventListener('click', () => {
            if (state.currentPhase === 'liasoning') {
                saveAllLiasoningRecords();
            } else if (state.currentPhase === 'development_cost') {
                saveAllBoqRecords();
            } else if (state.currentPhase === 'development') {
                saveAllDevelopmentRecords();
            }
        });
    }

    const searchInput = document.getElementById('phaseSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            if (state.currentPhase === 'liasoning') renderLiasoningTable();
            if (state.currentPhase === 'development_cost') renderBoqTable();
            if (state.currentPhase === 'development') renderDevelopmentTable();
        });
    }

    const benchmarkSelector = document.getElementById('benchmarkProjectSelector');
    if (benchmarkSelector) {
        benchmarkSelector.addEventListener('change', (e) => {
            scanBenchmarkProject(e.target.value);
        });
    }

    const clearBenchmark = document.getElementById('clearBenchmarkBtn');
    if (clearBenchmark) {
        clearBenchmark.addEventListener('click', () => {
            if (benchmarkSelector) benchmarkSelector.value = '';
            scanBenchmarkProject('');
        });
    }

    document.querySelectorAll('.boq-filter-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.boq-filter-pill').forEach(p => {
                p.className = 'boq-filter-pill px-3 py-1.5 rounded-full text-[11px] font-semibold glass-card text-slate-300 hover:text-white';
            });
            e.currentTarget.className = 'boq-filter-pill px-3 py-1.5 rounded-full text-[11px] font-semibold bg-prayosha-amber text-slate-900 shadow';
            state.boqCategoryGroupFilter = e.currentTarget.dataset.group;
            renderBoqTable();
        });
    });

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('r2FileInput');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-prayosha-amber');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-prayosha-amber');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-prayosha-amber');
            if (e.dataTransfer.files.length) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });
    }

    const removeFileBtn = document.getElementById('removeSelectedFileBtn');
    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.uploadContext.selectedFile = null;
            document.getElementById('selectedFileChip').classList.add('hidden');
            if (fileInput) fileInput.value = '';
        });
    }

    document.getElementById('closeUploadModalBtn')?.addEventListener('click', closeUploadModal);
    document.getElementById('cancelUploadBtn')?.addEventListener('click', closeUploadModal);
    document.getElementById('confirmUploadBtn')?.addEventListener('click', handleDirectR2Upload);

    document.getElementById('openSuperEngineBtn')?.addEventListener('click', openSuperEngineModal);
    document.getElementById('closeSuperEngineBtn')?.addEventListener('click', closeSuperEngineModal);
    document.getElementById('closeSuperEngineFooterBtn')?.addEventListener('click', closeSuperEngineModal);
    document.getElementById('superEnginePhaseSelect')?.addEventListener('change', renderSuperEngineCategoriesList);
    document.getElementById('addNewCategoryBtn')?.addEventListener('click', handleAddNewCategory);

    document.getElementById('openAuditDrawerBtn')?.addEventListener('click', openAuditDrawer);
    document.getElementById('closeAuditDrawerBtn')?.addEventListener('click', closeAuditDrawer);

    document.getElementById('notificationBtn')?.addEventListener('click', openNotificationsDrawer);
    document.getElementById('closeNotificationsDrawerBtn')?.addEventListener('click', closeNotificationsDrawer);
    document.getElementById('markAllReadBtn')?.addEventListener('click', markAllNotificationsRead);

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function handleFileSelection(file) {
    if (!file) return;
    state.uploadContext.selectedFile = file;
    document.getElementById('selectedFileName').textContent = file.name;
    document.getElementById('selectedFileChip').classList.remove('hidden');
}

function switchPhaseTab(phase) {
    state.currentPhase = phase;

    const tabs = {
        liasoning: {
            btn: document.getElementById('tabLiasoningBtn'),
            content: document.getElementById('tabContentLiasoning'),
            saveLabel: 'Save Phase 1'
        },
        development_cost: {
            btn: document.getElementById('tabBoqBtn'),
            content: document.getElementById('tabContentBoq'),
            saveLabel: 'Save Phase 2 (BOQ)'
        },
        development: {
            btn: document.getElementById('tabDevBtn'),
            content: document.getElementById('tabContentDev'),
            saveLabel: 'Save Phase 3'
        }
    };

    Object.keys(tabs).forEach(key => {
        const isCurrent = key === phase;
        const t = tabs[key];

        if (t.btn && t.content) {
            if (isCurrent) {
                t.btn.className = 'tab-btn flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 bg-prayosha-amber text-slate-900 shadow-md';
                t.content.classList.remove('hidden');
                const saveText = document.getElementById('masterSaveBtnText');
                if (saveText) saveText.textContent = t.saveLabel;
            } else {
                t.btn.className = 'tab-btn flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 text-slate-400 hover:text-white';
                t.content.classList.add('hidden');
            }
        }
    });

    if (phase === 'liasoning') renderLiasoningTable();
    if (phase === 'development_cost') renderBoqTable();
    if (phase === 'development') renderDevelopmentTable();
}

// ==============================================================================
// UTILITIES & HELPERS
// ==============================================================================
function formatNumber(num) {
    if (isNaN(num) || num === null) return '0.00';
    return Number(num).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'success' 
        ? 'bg-slate-900/90 border-emerald-500 text-white' 
        : (type === 'warning' ? 'bg-slate-900/90 border-rose-500 text-white' : 'bg-slate-900/90 border-prayosha-amber text-white');

    toast.className = `glass-card pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-xs font-semibold ${bgClass} transition-all duration-300 transform translate-y-2 opacity-0`;
    toast.innerHTML = `
        <span class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-emerald-400' : (type === 'warning' ? 'bg-rose-400' : 'bg-prayosha-amber')}"></span>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}