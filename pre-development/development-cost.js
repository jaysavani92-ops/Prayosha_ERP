/**
 * ==============================================================================
 * PRAYOSHA ERP - PRE-DEVELOPMENT MODULE CONTROLLER (PHASE 2: DEVELOPMENT COST)
 * File: /pre-development/development-cost.js
 * Tech Stack: Vanilla JS (ES Modules), Supabase, Tailwind CSS
 * ==============================================================================
 */

import { supabase } from '../config.js';

// Helper: Validate standard 36-character UUID
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
    currentPhase: 'development_cost',

    // Master line-item categories from Super Core Engine
    categories: {
        liasoning: [],
        development_cost: [],
        development: []
    },

    // Current project BOQ records
    boqRecords: new Map(), // category_id -> record

    // Benchmark comparison data for Phase 2
    selectedBenchmarkProjectId: '',
    benchmarkRates: new Map(), // category_id -> { old_rate, old_amount }

    // KPI Summary Metrics from other phases
    kpiMetrics: {
        approvedLiasoningCount: 0,
        totalLiasoningCount: 0,
        readyDevCount: 0,
        totalDevCount: 0
    },

    // Category group filter & search
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
            showToast(`Development Cost synchronized: ${state.activeProjectName}`, 'info');
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
                state.userId = isValidUUID(parsed.id) ? parsed.id : null;
            } catch (_) {}
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            state.currentUser = session.user;
            state.userId = isValidUUID(session.user.id) ? session.user.id : state.userId;

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
 * Fetch all projects for benchmark comparison
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
        loadBoqData(),
        fetchBackgroundKpis(),
        fetchUnreadNotifications()
    ]);

    updateKpiSummary();
}

function renderEmptyStateTable() {
    const bBody = document.getElementById('boqTableBody');
    const msg = `<tr><td colspan="10" class="text-center py-8 text-amber-300/80 font-medium text-xs">Please select a specific project from the top navigation dropdown to load records.</td></tr>`;
    if (bBody) bBody.innerHTML = msg;
}

// ==============================================================================
// SUPER CORE ENGINE: MASTER CATEGORIES MANAGEMENT
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

/**
 * Scan Benchmark Rates from another project
 */
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

        // Apply benchmark rates to non-manual line items
        state.categories.development_cost.forEach(cat => {
            const current = state.boqRecords.get(cat.id) || {
                quantity: 0,
                new_rate: 0,
                remarks: '',
                is_manual_old_rate: false
            };

            const benchmark = state.benchmarkRates.get(cat.id);
            if (benchmark && !current.is_manual_old_rate) {
                current.old_rate = benchmark.old_rate;
            }
            state.boqRecords.set(cat.id, current);
        });

        const benchmarkProject = state.projectsList.find(p => p.id === benchmarkId);
        showToast(`Scanned baseline rates from ${benchmarkProject ? benchmarkProject.name : 'benchmark project'}!`, 'info');

        renderBoqTable();
        updateKpiSummary();
    } catch (err) {
        console.error('Error scanning benchmark project:', err.message);
        showToast('Error scanning benchmark project', 'warning');
    }
}

/**
 * Capture current DOM inputs into state before filtering or saving
 */
function syncDomInputsToState() {
    const tbody = document.getElementById('boqTableBody');
    if (!tbody) return;

    tbody.querySelectorAll('tr[data-cat-id]').forEach(row => {
        const catId = row.dataset.catId;
        const uomInput = row.querySelector('.boq-uom-input');
        const qtyInput = row.querySelector('.boq-qty-input');
        const oldRateInput = row.querySelector('.boq-old-rate-input');
        const newRateInput = row.querySelector('.boq-new-rate-input');
        const remarkInput = row.querySelector('.boq-remark-input');

        const existing = state.boqRecords.get(catId) || {};
        if (uomInput) existing.uom = uomInput.value.trim() || 'Nos';
        if (qtyInput) existing.quantity = parseFloat(qtyInput.value) || 0;
        if (oldRateInput) existing.old_rate = parseFloat(oldRateInput.value) || 0;
        if (newRateInput) existing.new_rate = parseFloat(newRateInput.value) || 0;
        if (remarkInput) existing.remarks = remarkInput.value.trim() || null;

        state.boqRecords.set(catId, existing);
    });
}

function renderBoqTable() {
    const tbody = document.getElementById('boqTableBody');
    if (!tbody) return;

    const query = state.searchQuery.toLowerCase().trim();
    const groupFilter = state.boqCategoryGroupFilter;

    const categories = state.categories.development_cost.filter(cat => {
        const matchesGroup = groupFilter === 'ALL' || cat.category_group === groupFilter;
        const matchesSearch = !query || 
            cat.name.toLowerCase().includes(query) || 
            (cat.category_group && cat.category_group.toLowerCase().includes(query));
        return matchesGroup && matchesSearch;
    });

    if (categories.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-8 text-slate-500 font-sans font-medium">
                    No BOQ line items match the selected filter.
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
                    <div>${escapeHtml(cat.name)}</div>
                    <div class="text-[10px] text-slate-500">${escapeHtml(cat.category_group || 'General')}</div>
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
                    <input type="number" step="any" class="glass-input text-xs py-1 px-2 rounded text-right w-24 boq-old-rate-input" 
                           data-cat-id="${cat.id}" value="${oldRate}">
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
            existing.uom = e.target.value.trim() || 'Nos';
            state.boqRecords.set(catId, existing);
        });
    });

    document.querySelectorAll('.boq-remark-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.boqRecords.get(catId) || {};
            existing.remarks = e.target.value.trim() || null;
            state.boqRecords.set(catId, existing);
        });
    });
}

function recalculateBoqFooters() {
    let sumOld = 0;
    let sumNew = 0;
    let sumQty = 0;

    state.categories.development_cost.forEach(cat => {
        const rec = state.boqRecords.get(cat.id);
        if (rec) {
            const q = Number(rec.quantity) || 0;
            const o = Number(rec.old_rate) || 0;
            const n = Number(rec.new_rate) || 0;
            sumQty += q;
            sumOld += q * o;
            sumNew += q * n;
        }
    });

    const totalDiff = sumNew - sumOld;

    const elQty = document.getElementById('tfootTotalQty');
    const elOld = document.getElementById('tfootTotalOldAmount');
    const elNew = document.getElementById('tfootTotalNewAmount');
    const elDiff = document.getElementById('tfootTotalDifference');
    const elBadge = document.getElementById('tfootVarianceBadge');

    if (elQty) elQty.textContent = formatNumber(sumQty);
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

/**
 * Save All Phase 2 BOQ Records to Supabase
 */
async function saveAllBoqRecords() {
    if (!isValidUUID(state.activeProjectId)) {
        showToast('Please select a specific project first', 'warning');
        return;
    }

    syncDomInputsToState();

    const masterSaveBtn = document.getElementById('masterSaveBtn');
    const originalBtnHtml = masterSaveBtn ? masterSaveBtn.innerHTML : '';
    if (masterSaveBtn) {
        masterSaveBtn.disabled = true;
        masterSaveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Saving Phase 2 (BOQ)...</span>`;
    }

    const rowsToUpsert = [];
    state.categories.development_cost.forEach(cat => {
        const catId = cat.id;
        const currentRec = state.boqRecords.get(catId) || {};

        const qty = Number(currentRec.quantity) || 0;
        const oldRate = Number(currentRec.old_rate) || 0;
        const newRate = Number(currentRec.new_rate) || 0;

        const record = {
            project_id: state.activeProjectId,
            category_id: catId,
            uom: currentRec.uom || cat.default_uom || 'Nos',
            quantity: qty,
            old_rate: oldRate,
            new_rate: newRate,
            old_amount: qty * oldRate,
            new_amount: qty * newRate,
            difference_amount: (qty * newRate) - (qty * oldRate),
            benchmark_project_id: isValidUUID(state.selectedBenchmarkProjectId) ? state.selectedBenchmarkProjectId : null,
            is_manual_old_rate: currentRec.is_manual_old_rate || false,
            remarks: currentRec.remarks || null,
            updated_by: isValidUUID(state.userId) ? state.userId : null,
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

        const totalBudget = rowsToUpsert.reduce((acc, r) => acc + (r.new_amount || 0), 0);
        await createAuditLog(
            'development_cost',
            'BOQ_SYNC',
            `Updated comparative BOQ (Total Budget: ₹${formatNumber(totalBudget)}) across ${rowsToUpsert.length} items.`
        );

        showToast('Development Cost (BOQ) saved successfully!', 'success');
        renderBoqTable();
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving BOQ:', err.message);
        showToast('Failed to save BOQ estimates: ' + err.message, 'warning');
    } finally {
        if (masterSaveBtn) {
            masterSaveBtn.disabled = false;
            masterSaveBtn.innerHTML = originalBtnHtml;
        }
    }
}

// ==============================================================================
// SUPER CORE ENGINE: DYNAMIC BOQ LINE ITEMS CRUD
// ==============================================================================
function openSuperEngineModal() {
    renderSuperEngineCategoriesList();
    const modal = document.getElementById('superEngineModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSuperEngineModal() {
    const modal = document.getElementById('superEngineModal');
    if (modal) modal.classList.add('hidden');
}

function renderSuperEngineCategoriesList() {
    const listContainer = document.getElementById('superEngineCategoryList');
    const phaseSelect = document.getElementById('superEnginePhaseSelect');
    if (!listContainer || !phaseSelect) return;

    const activePhase = phaseSelect.value;
    const items = state.categories[activePhase] || [];

    if (items.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                No active line items found in this phase.
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
                        Group: <span class="text-slate-400 font-medium">${escapeHtml(cat.category_group || 'General')}</span> • 
                        UOM: <span class="text-slate-400 font-medium">${escapeHtml(cat.default_uom || 'Nos')}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <button type="button" class="px-2.5 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 save-cat-rename-btn cursor-pointer" 
                        data-cat-id="${cat.id}" title="Save Name Change">
                    <i class="fa-solid fa-floppy-disk"></i>
                </button>
                <button type="button" class="px-2.5 py-1 rounded text-[11px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 delete-cat-btn cursor-pointer" 
                        data-cat-id="${cat.id}" data-cat-name="${escapeHtml(cat.name)}" title="Deactivate Sub-Category">
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

    const name = nameInput ? nameInput.value.trim() : '';
    const group = (groupInput && groupInput.value.trim()) ? groupInput.value.trim() : 'Civil & Structural';
    const uom = (uomInput && uomInput.value.trim()) ? uomInput.value.trim() : 'Nos';
    const phase = phaseSelect ? phaseSelect.value : 'development_cost';

    if (!name) {
        showToast('Please enter a line item name', 'warning');
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

        if (nameInput) nameInput.value = '';
        showToast(`Added "${name}" to BOQ line items!`, 'success');

        await fetchMasterCategories();
        renderSuperEngineCategoriesList();
        renderBoqTable();
    } catch (err) {
        console.error('Error creating category:', err.message);
        showToast('Error creating line item: ' + err.message, 'warning');
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

        showToast('Line item updated!', 'success');
        await fetchMasterCategories();
        renderBoqTable();
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

        showToast('Line item disabled', 'info');
        await fetchMasterCategories();
        renderSuperEngineCategoriesList();
        renderBoqTable();
    } catch (err) {
        console.error('Error disabling category:', err.message);
        showToast('Could not disable item', 'warning');
    }
}

// ==============================================================================
// AUDIT LOGGING & DRAWER (RESILIENT UUID HANDLING)
// ==============================================================================
async function createAuditLog(phase, actionType, summary, changes = {}) {
    if (!isValidUUID(state.activeProjectId)) return;

    try {
        const actorName = state.currentUser?.full_name || 
                          state.currentUser?.displayName || 
                          localStorage.getItem('userRole') || 
                          'Site Administrator';

        const payload = {
            project_id: state.activeProjectId,
            phase: phase,
            action_type: actionType,
            summary: summary,
            changes: changes || {},
            actor_id: isValidUUID(state.userId) ? state.userId : null,
            actor_name: actorName
        };

        const { error } = await supabase
            .from('pre_dev_audit_logs')
            .insert([payload]);

        if (error) {
            console.warn('[Audit Log Write Notice]:', error.message);
        }
    } catch (err) {
        console.warn('[Audit Log Skipped]:', err.message);
    }
}

async function openAuditDrawer() {
    const drawer = document.getElementById('auditDrawer');
    const timeline = document.getElementById('auditLogTimeline');
    if (!drawer || !timeline) return;

    drawer.classList.remove('hidden');

    if (!isValidUUID(state.activeProjectId)) {
        timeline.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">Please select a project to view its audit log.</div>`;
        return;
    }

    timeline.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-xs">
            <i class="fa-solid fa-spinner fa-spin text-prayosha-amber text-sm mb-1"></i>
            <div>Loading audit history...</div>
        </div>
    `;

    try {
        let query = supabase
            .from('pre_dev_audit_logs')
            .select('*')
            .eq('project_id', state.activeProjectId)
            .order('created_at', { ascending: false })
            .limit(30);

        let { data, error } = await query;

        if (error) {
            const fallback = await supabase
                .from('pre_dev_audit_logs')
                .select('*')
                .eq('project_id', state.activeProjectId)
                .limit(30);
            data = fallback.data;
            error = fallback.error;
        }

        if (error) throw error;

        if (!data || data.length === 0) {
            timeline.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">No audit history recorded yet for this project.</div>`;
            return;
        }

        timeline.innerHTML = data.map(log => {
            const timeAgo = formatTimeAgo(log.created_at);
            const phaseLabel = log.phase === 'liasoning' ? 'Phase 1: Liasoning' : 
                              (log.phase === 'development_cost' ? 'Phase 2: BOQ' : 'Phase 3: Site');

            return `
                <div class="glass-card rounded-xl p-3 border-l-2 border-prayosha-amber space-y-1">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-bold text-prayosha-amber uppercase tracking-wider">${phaseLabel}</span>
                        <span class="text-slate-500">${timeAgo}</span>
                    </div>
                    <p class="text-xs text-slate-200 font-medium">${escapeHtml(log.summary)}</p>
                    <div class="text-[10px] text-slate-400 flex items-center gap-1.5 pt-1">
                        <i class="fa-solid fa-user-shield text-[9px]"></i>
                        <span>${escapeHtml(log.actor_name || 'System Admin')}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading audit logs:', err.message);
        timeline.innerHTML = `<div class="text-center py-8 text-rose-400 text-xs">Could not load audit log history.</div>`;
    }
}

function closeAuditDrawer() {
    const drawer = document.getElementById('auditDrawer');
    if (drawer) drawer.classList.add('hidden');
}

// ==============================================================================
// BACKGROUND KPIS (PHASE 1 & PHASE 3 METRICS FETCH)
// ==============================================================================
async function fetchBackgroundKpis() {
    if (!isValidUUID(state.activeProjectId)) return;

    try {
        // Query Liasoning approvals
        const { data: liasoningData } = await supabase
            .from('pre_dev_liasoning')
            .select('status')
            .eq('project_id', state.activeProjectId);

        state.kpiMetrics.totalLiasoningCount = state.categories.liasoning.length || 11;
        state.kpiMetrics.approvedLiasoningCount = (liasoningData || []).filter(r => r.status === 'Yes').length;

        // Query Site Mobilization
        const { data: devData } = await supabase
            .from('pre_dev_development')
            .select('status')
            .eq('project_id', state.activeProjectId);

        state.kpiMetrics.totalDevCount = state.categories.development.length || 10;
        state.kpiMetrics.readyDevCount = (devData || []).filter(r => r.status === 'Yes').length;

    } catch (e) {
        console.warn('Background KPI calculation note:', e.message);
    }
}

// ==============================================================================
// REALTIME NOTIFICATIONS & SUBSCRIPTIONS
// ==============================================================================
function setupRealtimeSubscriptions() {
    try {
        const channel = supabase
            .channel('pre-dev-boq-channel')
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
    if (!drawer || !list) return;

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
    const drawer = document.getElementById('notificationsDrawer');
    if (drawer) drawer.classList.add('hidden');
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
    const kpiLCount = document.getElementById('kpiLiasoningCount');
    const kpiLPct = document.getElementById('kpiLiasoningPercent');
    const kpiLBar = document.getElementById('kpiLiasoningBar');
    const kpiNewAmt = document.getElementById('kpiTotalNewAmount');
    const kpiVar = document.getElementById('kpiTotalVariance');
    const kpiDCount = document.getElementById('kpiDevCount');
    const kpiDPct = document.getElementById('kpiDevPercent');
    const kpiDBar = document.getElementById('kpiDevBar');

    if (kpiLCount) kpiLCount.textContent = '0 / 0';
    if (kpiLPct) kpiLPct.textContent = '0%';
    if (kpiLBar) kpiLBar.style.width = '0%';
    if (kpiNewAmt) kpiNewAmt.textContent = '0.00';
    if (kpiVar) kpiVar.textContent = '0.00';
    if (kpiDCount) kpiDCount.textContent = '0 / 0';
    if (kpiDPct) kpiDPct.textContent = '0%';
    if (kpiDBar) kpiDBar.style.width = '0%';
}

function updateKpiSummary() {
    if (!isValidUUID(state.activeProjectId)) {
        resetKpiSummary();
        return;
    }

    // 1. Phase 1 Liasoning Clearances Progress
    const totalLiasoning = state.kpiMetrics.totalLiasoningCount || 11;
    const approvedLiasoning = state.kpiMetrics.approvedLiasoningCount || 0;
    const liasoningPct = totalLiasoning > 0 ? Math.round((approvedLiasoning / totalLiasoning) * 100) : 0;

    const kpiLCount = document.getElementById('kpiLiasoningCount');
    const kpiLPct = document.getElementById('kpiLiasoningPercent');
    const kpiLBar = document.getElementById('kpiLiasoningBar');

    if (kpiLCount) kpiLCount.textContent = `${approvedLiasoning} / ${totalLiasoning}`;
    if (kpiLPct) kpiLPct.textContent = `${liasoningPct}%`;
    if (kpiLBar) kpiLBar.style.width = `${liasoningPct}%`;

    // 2. Phase 2 BOQ Budget & Variance
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
    const varIndicator = document.getElementById('kpiVarianceIndicator');
    const varIconBox = document.getElementById('kpiVarianceIconBox');

    if (kpiNewAmt) kpiNewAmt.textContent = formatNumber(totalNew);
    if (kpiVar) kpiVar.textContent = formatNumber(Math.abs(variance));

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

    // 3. Phase 3 Site Readiness
    const totalDev = state.kpiMetrics.totalDevCount || 10;
    const readyDev = state.kpiMetrics.readyDevCount || 0;
    const devPct = totalDev > 0 ? Math.round((readyDev / totalDev) * 100) : 0;

    const kpiDCount = document.getElementById('kpiDevCount');
    const kpiDPct = document.getElementById('kpiDevPercent');
    const kpiDBar = document.getElementById('kpiDevBar');

    if (kpiDCount) kpiDCount.textContent = `${readyDev} / ${totalDev}`;
    if (kpiDPct) kpiDPct.textContent = `${devPct}%`;
    if (kpiDBar) kpiDBar.style.width = `${devPct}%`;
}

// ==============================================================================
// EVENT LISTENERS & DOM HOOKS
// ==============================================================================
function setupEventListeners() {
    // Master Save Button for Phase 2
    const masterSave = document.getElementById('masterSaveBtn');
    if (masterSave) {
        masterSave.addEventListener('click', () => {
            saveAllBoqRecords();
        });
    }

    // Live Search
    const searchInput = document.getElementById('phaseSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderBoqTable();
        });
    }

    // Benchmark Project Scanner Selector
    const benchmarkSelector = document.getElementById('benchmarkProjectSelector');
    if (benchmarkSelector) {
        benchmarkSelector.addEventListener('change', (e) => {
            scanBenchmarkProject(e.target.value);
        });
    }

    // Clear Benchmark
    const clearBenchmark = document.getElementById('clearBenchmarkBtn');
    if (clearBenchmark) {
        clearBenchmark.addEventListener('click', () => {
            if (benchmarkSelector) benchmarkSelector.value = '';
            scanBenchmarkProject('');
        });
    }

    // BOQ Category Filtering Pills
    document.querySelectorAll('.boq-filter-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.boq-filter-pill').forEach(p => {
                p.className = 'boq-filter-pill px-3 py-1.5 rounded-full text-[11px] font-semibold glass-card text-slate-300 hover:text-white cursor-pointer';
            });
            e.currentTarget.className = 'boq-filter-pill px-3 py-1.5 rounded-full text-[11px] font-semibold bg-prayosha-amber text-slate-900 shadow cursor-pointer';
            state.boqCategoryGroupFilter = e.currentTarget.dataset.group;
            renderBoqTable();
        });
    });

    // Super Core Engine Modals
    document.getElementById('openSuperEngineBtn')?.addEventListener('click', openSuperEngineModal);
    document.getElementById('closeSuperEngineBtn')?.addEventListener('click', closeSuperEngineModal);
    document.getElementById('closeSuperEngineFooterBtn')?.addEventListener('click', closeSuperEngineModal);
    document.getElementById('superEnginePhaseSelect')?.addEventListener('change', renderSuperEngineCategoriesList);
    document.getElementById('addNewCategoryBtn')?.addEventListener('click', handleAddNewCategory);

    // Audit Drawer
    document.getElementById('openAuditDrawerBtn')?.addEventListener('click', openAuditDrawer);
    document.getElementById('closeAuditDrawerBtn')?.addEventListener('click', closeAuditDrawer);

    // Notifications Drawer
    document.getElementById('notificationBtn')?.addEventListener('click', openNotificationsDrawer);
    document.getElementById('closeNotificationsDrawerBtn')?.addEventListener('click', closeNotificationsDrawer);
    document.getElementById('markAllReadBtn')?.addEventListener('click', markAllNotificationsRead);

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
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