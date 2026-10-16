/**
 * Prayosha ERP - Plan Change Management System
 * File: /plan-change/plan-change-list.js
 * 
 * Capabilities:
 * 1. Safe Supabase relational querying with strict UUID verification (Prevents 22P02 error)
 * 2. Multi-tier client-side filtering (Search, Tower, Trade package, Status)
 * 3. Dynamic KPI dashboard recalculation (Total Units, Active, Revisions, RCC Flags)
 * 4. High-resolution modal inspector with embedded R2 document/drawing viewer
 * 5. On-the-fly printable site handover chithi generation and execution status updates
 */

import { supabase } from '../config.js';

// Central Supabase Client reference
const db = supabase || window.supabaseClient;

// ==============================================================================
// 1. STATE MANAGEMENT
// ==============================================================================
const state = {
    allRecords: [],
    filteredRecords: [],
    availableProjects: [],
    activeProjectId: null,
    activeProjectName: '',
    selectedRecordForModal: null,
    isLoading: false
};

// DOM References - Header & Stats
const activeProjectBadge = document.getElementById('active-project-badge');
const refreshDataBtn = document.getElementById('refresh-data-btn');
const kpiTotalUnits = document.getElementById('kpi-total-units');
const kpiActiveMandates = document.getElementById('kpi-active-mandates');
const kpiRevisedUnits = document.getElementById('kpi-revised-units');
const kpiStructuralFlags = document.getElementById('kpi-structural-flags');

// DOM References - Filters & Search
const searchInput = document.getElementById('search-input');
const towerFilter = document.getElementById('tower-filter');
const tradeFilter = document.getElementById('trade-filter');
const statusFilter = document.getElementById('status-filter');
const filteredCount = document.getElementById('filtered-count');

// DOM References - Table & Views
const tableBody = document.getElementById('plan-change-table-body');
const loadingRow = document.getElementById('loading-row');
const emptyState = document.getElementById('empty-state');

// DOM References - Modal Inspector
const detailModal = document.getElementById('detail-modal');
const detailModalBackdrop = document.getElementById('detail-modal-backdrop');
const closeDetailModalBtn = document.getElementById('close-detail-modal');
const modalCloseFooter = document.getElementById('modal-close-footer');
const modalZoneId = document.getElementById('modal-zone-id');
const modalRevBadge = document.getElementById('modal-rev-badge');
const modalStatusBadge = document.getElementById('modal-status-badge');
const modalLocationSubtitle = document.getElementById('modal-location-subtitle');
const modalStructuralAlert = document.getElementById('modal-structural-alert');
const modalCustomerName = document.getElementById('modal-customer-name');
const modalCustomerPhone = document.getElementById('modal-customer-phone');
const modalCostTerms = document.getElementById('modal-cost-terms');
const modalDateRecorded = document.getElementById('modal-date-recorded');
const modalBulletCount = document.getElementById('modal-bullet-count');
const modalBulletsList = document.getElementById('modal-bullets-list');
const modalOpenDrawingExternal = document.getElementById('modal-open-drawing-external');
const modalDrawingImg = document.getElementById('modal-drawing-img');
const modalDrawingIframe = document.getElementById('modal-drawing-iframe');
const modalDrawingPlaceholder = document.getElementById('modal-drawing-placeholder');
const modalPrintBtn = document.getElementById('modal-print-btn');

// DOM References - Printable Chithi
const printableChithi = document.getElementById('printable-chithi');
const printZoneTag = document.getElementById('print-zone-tag');
const printRevTag = document.getElementById('print-rev-tag');
const printProjectName = document.getElementById('print-project-name');
const printTower = document.getElementById('print-tower');
const printFloor = document.getElementById('print-floor');
const printCustomer = document.getElementById('print-customer');
const printPhone = document.getElementById('print-phone');
const printCostTerms = document.getElementById('print-cost-terms');
const printDate = document.getElementById('print-date');
const printBullets = document.getElementById('print-bullets');

// ==============================================================================
// 2. HELPER UTILITIES
// ==============================================================================
function isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid.trim());
}

function formatDate(isoString) {
    if (!isoString) return '--';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(unsafe) {
    if (!unsafe && unsafe !== 0) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTradeBadgeStyle(category) {
    switch (category) {
        case 'Flooring & Tiles':
            return 'bg-amber-100 text-amber-900 border-amber-300';
        case 'Plumbing & Sanitary':
            return 'bg-blue-100 text-blue-900 border-blue-300';
        case 'Electrical & Wiring':
            return 'bg-indigo-100 text-indigo-900 border-indigo-300';
        case 'Civil & Masonry':
            return 'bg-emerald-100 text-emerald-900 border-emerald-300';
        case 'Doors & Windows':
            return 'bg-orange-100 text-orange-900 border-orange-300';
        case 'Kitchen & Platform':
            return 'bg-rose-100 text-rose-900 border-rose-300';
        case 'False Ceiling & POP':
            return 'bg-purple-100 text-purple-900 border-purple-300';
        default:
            return 'bg-slate-100 text-slate-800 border-slate-300';
    }
}

function getStatusBadgeStyle(status) {
    switch (status) {
        case 'Active':
            return 'bg-emerald-100 text-emerald-800 border-emerald-300';
        case 'Revised':
            return 'bg-amber-100 text-amber-800 border-amber-300';
        case 'Executed':
            return 'bg-blue-100 text-blue-800 border-blue-300';
        case 'Cancelled':
            return 'bg-slate-100 text-slate-600 border-slate-300';
        default:
            return 'bg-slate-100 text-slate-700 border-slate-200';
    }
}

// Toast Notification Engine
function showSiteToast(message, type = 'info') {
    const existing = document.getElementById('prayosha-site-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'prayosha-site-toast';

    let bgStyle = 'bg-slate-900/90 border-slate-700 text-white';
    let icon = 'ℹ️';

    if (type === 'success') {
        bgStyle = 'bg-emerald-950/90 border-emerald-500 text-emerald-100';
        icon = '✅';
    } else if (type === 'error') {
        bgStyle = 'bg-rose-950/90 border-rose-500 text-rose-100';
        icon = '⚠️';
    } else if (type === 'warning') {
        bgStyle = 'bg-amber-950/90 border-amber-500 text-amber-100';
        icon = '🔔';
    }

    toast.className = `fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md text-xs font-semibold max-w-md transition-all duration-300 transform translate-y-2 opacity-0 ${bgStyle}`;
    toast.innerHTML = `
        <span class="text-base">${icon}</span>
        <span class="leading-relaxed flex-grow">${escapeHtml(message)}</span>
        <button type="button" class="text-white/60 hover:text-white ml-2 text-sm font-bold">&times;</button>
    `;

    document.body.appendChild(toast);

    toast.querySelector('button').addEventListener('click', () => {
        toast.remove();
    });

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4500);
}

// ==============================================================================
// 3. PROJECT CONTEXT & INITIALIZATION
// ==============================================================================
async function initProjectContext() {
    if (!db) {
        showSiteToast('Database client connection offline. Please reload.', 'error');
        return;
    }

    try {
        // Query projects safely avoiding non-existent column errors (PostgreSQL 42703)
        const { data, error } = await db
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true });

        if (error) throw error;

        state.availableProjects = data || [];

        // Check stored project from shell.js
        const storedProjectId = localStorage.getItem('activeProjectId');
        if (storedProjectId && isValidUUID(storedProjectId)) {
            const match = state.availableProjects.find(p => p.id === storedProjectId);
            if (match) {
                state.activeProjectId = match.id;
                state.activeProjectName = match.project_name;
                activeProjectBadge.textContent = `${match.project_code ? '[' + match.project_code + '] ' : ''}${match.project_name}`;
            }
        }

        // Fallback to first project if none active
        if (!state.activeProjectId && state.availableProjects.length > 0) {
            state.activeProjectId = state.availableProjects[0].id;
            state.activeProjectName = state.availableProjects[0].project_name;
            activeProjectBadge.textContent = `${state.availableProjects[0].project_code ? '[' + state.availableProjects[0].project_code + '] ' : ''}${state.availableProjects[0].project_name}`;
            localStorage.setItem('activeProjectId', state.activeProjectId);
            localStorage.setItem('activeProjectName', state.activeProjectName);
        }

        await fetchPlanChanges();

    } catch (err) {
        console.error('[initProjectContext Exception]:', err);
        showSiteToast('Could not load site projects: ' + err.message, 'error');
    }
}

// Listen to Global Shell Project Switcher Events
window.addEventListener('projectChanged', async (e) => {
    if (e.detail && isValidUUID(e.detail.projectId)) {
        state.activeProjectId = e.detail.projectId;
        state.activeProjectName = e.detail.projectName || 'Selected Site';
        activeProjectBadge.textContent = state.activeProjectName;
        await fetchPlanChanges();
    }
});

// ==============================================================================
// 4. SUPABASE DATA FETCHING
// ==============================================================================
async function fetchPlanChanges() {
    if (!state.activeProjectId || !isValidUUID(state.activeProjectId)) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-10 text-slate-400">
                    Please select a valid site project from the top navigation bar to load plan changes.
                </td>
            </tr>
        `;
        return;
    }

    state.isLoading = true;
    tableBody.innerHTML = '';
    tableBody.appendChild(loadingRow);
    loadingRow.classList.remove('hidden');
    emptyState.classList.add('hidden');

    try {
        const { data, error } = await db
            .from('unit_plan_changes')
            .select('*')
            .eq('project_id', state.activeProjectId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        state.allRecords = data || [];
        populateTowerFilter();
        applyFilters();

    } catch (err) {
        console.error('[fetchPlanChanges Error]:', err);
        showSiteToast('Failed to load unit plan changes: ' + err.message, 'error');
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-10 text-rose-500 font-semibold">
                    Error connecting to database. Please check your network or try again.
                </td>
            </tr>
        `;
    } finally {
        state.isLoading = false;
        loadingRow.classList.add('hidden');
    }
}

function populateTowerFilter() {
    const previousSelection = towerFilter.value;
    towerFilter.innerHTML = '<option value="ALL">All Towers / Wings</option>';

    const uniqueTowers = [...new Set(state.allRecords.map(r => r.tower_block).filter(Boolean))].sort();

    uniqueTowers.forEach(tower => {
        const opt = document.createElement('option');
        opt.value = tower;
        opt.textContent = tower;
        towerFilter.appendChild(opt);
    });

    if (uniqueTowers.includes(previousSelection)) {
        towerFilter.value = previousSelection;
    }
}

// ==============================================================================
// 5. FILTERING & KPI AGGREGATION
// ==============================================================================
function applyFilters() {
    const searchVal = searchInput.value.trim().toLowerCase();
    const towerVal = towerFilter.value;
    const tradeVal = tradeFilter.value;
    const statusVal = statusFilter.value;

    state.filteredRecords = state.allRecords.filter(item => {
        // 1. Text Search across Zone ID, Customer Name, Phone
        const matchesSearch = !searchVal || 
            (item.zone_id && item.zone_id.toLowerCase().includes(searchVal)) ||
            (item.customer_name && item.customer_name.toLowerCase().includes(searchVal)) ||
            (item.customer_phone && item.customer_phone.toLowerCase().includes(searchVal)) ||
            (item.floor_level && item.floor_level.toLowerCase().includes(searchVal));

        // 2. Tower / Block Filter
        const matchesTower = (towerVal === 'ALL') || (item.tower_block === towerVal);

        // 3. Status Filter
        const matchesStatus = (statusVal === 'ALL') || (item.status === statusVal);

        // 4. Trade / Category Filter (Searching inside JSONB bullets array)
        let matchesTrade = (tradeVal === 'ALL');
        if (!matchesTrade && Array.isArray(item.change_bullets)) {
            matchesTrade = item.change_bullets.some(b => b.category === tradeVal);
        }

        return matchesSearch && matchesTower && matchesStatus && matchesTrade;
    });

    updateKPIs();
    renderTable();
}

function updateKPIs() {
    const totalCustomUnits = new Set(state.allRecords.map(r => r.zone_id.trim().toLowerCase())).size;
    const activeMandates = state.allRecords.filter(r => r.status === 'Active').length;
    const revisedUnits = state.allRecords.filter(r => (r.revision_number || 1) > 1).length;
    const structuralFlags = state.allRecords.filter(r => r.has_structural_impact === true).length;

    kpiTotalUnits.textContent = totalCustomUnits;
    kpiActiveMandates.textContent = activeMandates;
    kpiRevisedUnits.textContent = revisedUnits;
    kpiStructuralFlags.textContent = structuralFlags;

    filteredCount.textContent = state.filteredRecords.length;
}

// ==============================================================================
// 6. TABLE RENDERING
// ==============================================================================
function renderTable() {
    tableBody.innerHTML = '';

    if (state.filteredRecords.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    state.filteredRecords.forEach((item) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50/80 transition group';

        const bullets = Array.isArray(item.change_bullets) ? item.change_bullets : [];
        const uniqueTrades = [...new Set(bullets.map(b => b.category))];

        // Format trades badges
        let tradeBadgesHtml = '';
        if (uniqueTrades.length > 0) {
            tradeBadgesHtml = uniqueTrades.slice(0, 2).map(t => `
                <span class="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${getTradeBadgeStyle(t)}">
                    ${escapeHtml(t)}
                </span>
            `).join(' ');

            if (uniqueTrades.length > 2) {
                tradeBadgesHtml += `<span class="text-[10px] font-semibold text-slate-400">+${uniqueTrades.length - 2} more</span>`;
            }
        } else {
            tradeBadgesHtml = '<span class="text-slate-400 italic">No trade tags</span>';
        }

        // Bullets sneak peek
        const firstBulletText = bullets.length > 0 ? bullets[0].text : 'No specific points logged';

        // Signed document preview thumbnail or icon
        const isPdf = item.signed_drawing_url && item.signed_drawing_url.toLowerCase().endsWith('.pdf');
        const proofHtml = item.signed_drawing_url ? `
            <button type="button" class="view-proof-btn p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition" title="View Customer Signed Drawing" data-id="${item.id}">
                <span class="flex items-center gap-1 font-bold text-[11px]">
                    ${isPdf ? '📄 PDF' : '🖼️ Drawing'}
                </span>
            </button>
        ` : `<span class="text-slate-400 text-[11px]">None</span>`;

        row.innerHTML = `
            <!-- Zone ID & Location -->
            <td class="py-3 px-4">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-brand-navy text-xs tracking-wide">${escapeHtml(item.zone_id)}</span>
                    ${item.has_structural_impact ? `
                        <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300" title="Alters RCC structural elements">
                            RCC Alert
                        </span>
                    ` : ''}
                </div>
                <div class="text-[11px] text-slate-500 font-medium">
                    ${escapeHtml(item.tower_block)} • ${escapeHtml(item.floor_level)}
                </div>
            </td>

            <!-- Customer Details -->
            <td class="py-3 px-4">
                <div class="font-semibold text-slate-800 text-xs">${escapeHtml(item.customer_name)}</div>
                <div class="text-[11px] text-slate-500">${escapeHtml(item.customer_phone || 'No phone')}</div>
            </td>

            <!-- Customized Trades & Bullets -->
            <td class="py-3 px-4 max-w-xs">
                <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                    ${tradeBadgesHtml}
                    <span class="text-[10px] text-slate-400 font-bold">(${bullets.length} items)</span>
                </div>
                <div class="text-[11px] text-slate-600 truncate font-medium" title="${escapeHtml(firstBulletText)}">
                    • ${escapeHtml(firstBulletText)}
                </div>
            </td>

            <!-- Cost Terms -->
            <td class="py-3 px-4">
                <span class="text-[11px] font-semibold text-slate-700 block">${escapeHtml(item.cost_impact_type || 'Standard')}</span>
                <span class="text-[10px] text-slate-400">${formatDate(item.created_at)}</span>
            </td>

            <!-- Rev -->
            <td class="py-3 px-4 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${item.revision_number > 1 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'}">
                    v${item.revision_number || 1}
                </span>
            </td>

            <!-- Status -->
            <td class="py-3 px-4 text-center">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeStyle(item.status)}">
                    ${escapeHtml(item.status || 'Active')}
                </span>
            </td>

            <!-- Signed Proof -->
            <td class="py-3 px-4 text-center">
                ${proofHtml}
            </td>

            <!-- Actions -->
            <td class="py-3 px-4 text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-1.5">
                    <button type="button" class="view-detail-btn px-2.5 py-1 bg-white hover:bg-slate-100 text-brand-navy rounded-lg border border-slate-300 text-xs font-semibold transition" title="Inspect Complete Mandate" data-id="${item.id}">
                        Inspect
                    </button>

                    <button type="button" class="print-chithi-btn p-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-300 transition" title="Print Handover Slip / Chithi" data-id="${item.id}">
                        <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                        </svg>
                    </button>

                    <button type="button" class="toggle-status-btn p-1.5 bg-white hover:bg-blue-50 text-blue-600 rounded-lg border border-slate-300 transition" title="Toggle Execution Status" data-id="${item.id}">
                        <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </button>
                </div>
            </td>
        `;

        tableBody.appendChild(row);
    });

    attachTableActionListeners();
}

function attachTableActionListeners() {
    // 1. Inspect / View Details Button
    document.querySelectorAll('.view-detail-btn, .view-proof-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const targetRecord = state.allRecords.find(r => r.id === id);
            if (targetRecord) {
                openDetailModal(targetRecord);
            }
        });
    });

    // 2. Print Chithi Direct Button
    document.querySelectorAll('.print-chithi-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const targetRecord = state.allRecords.find(r => r.id === id);
            if (targetRecord) {
                prepareAndPrintChithi(targetRecord);
            }
        });
    });

    // 3. Toggle Status (Active -> Executed / Reopen)
    document.querySelectorAll('.toggle-status-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const targetRecord = state.allRecords.find(r => r.id === id);
            if (!targetRecord) return;

            const newStatus = targetRecord.status === 'Active' ? 'Executed' : 'Active';
            const confirmMsg = `Are you sure you want to mark plan change for ${targetRecord.zone_id} as "${newStatus}"?`;

            if (window.confirm(confirmMsg)) {
                await updatePlanChangeStatus(id, newStatus);
            }
        });
    });
}

// ==============================================================================
// 7. STATUS WORKFLOW UPDATE
// ==============================================================================
async function updatePlanChangeStatus(id, newStatus) {
    if (!db) return;

    try {
        const { error } = await db
            .from('unit_plan_changes')
            .update({ 
                status: newStatus,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        showSiteToast(`Mandate status updated to "${newStatus}"`, 'success');

        // Update local memory and view
        const item = state.allRecords.find(r => r.id === id);
        if (item) item.status = newStatus;
        applyFilters();

    } catch (err) {
        console.error('[updatePlanChangeStatus Exception]:', err);
        showSiteToast('Could not update status: ' + err.message, 'error');
    }
}

// ==============================================================================
// 8. MODAL INSPECTOR LOGIC
// ==============================================================================
function openDetailModal(record) {
    state.selectedRecordForModal = record;

    modalZoneId.textContent = record.zone_id;
    modalRevBadge.textContent = `Rev v${record.revision_number || 1}`;
    modalStatusBadge.textContent = record.status || 'Active';
    modalStatusBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadgeStyle(record.status)}`;

    modalLocationSubtitle.textContent = `${record.tower_block} • ${record.floor_level} • ${state.activeProjectName || 'Site Project'}`;

    modalCustomerName.textContent = record.customer_name || '--';
    modalCustomerPhone.textContent = record.customer_phone || 'Not recorded';
    modalCostTerms.textContent = record.cost_impact_type || 'Standard Terms';
    modalDateRecorded.textContent = formatDate(record.created_at);

    // Structural Flag Visibility
    if (record.has_structural_impact) {
        modalStructuralAlert.classList.remove('hidden');
    } else {
        modalStructuralAlert.classList.add('hidden');
    }

    // Bullets Rendering
    const bullets = Array.isArray(record.change_bullets) ? record.change_bullets : [];
    modalBulletCount.textContent = `${bullets.length} Checkpoints`;
    modalBulletsList.innerHTML = '';

    if (bullets.length === 0) {
        modalBulletsList.innerHTML = '<p class="text-xs text-slate-400 italic">No specific bullet points recorded.</p>';
    } else {
        bullets.forEach((b, index) => {
            const badgeClass = getTradeBadgeStyle(b.category);
            const bItem = document.createElement('div');
            bItem.className = 'p-2.5 rounded-xl border border-slate-200/90 bg-slate-50 flex items-start gap-2.5';
            bItem.innerHTML = `
                <span class="text-[10px] font-bold text-slate-400 mt-0.5">#${index + 1}</span>
                <div class="space-y-1 min-w-0">
                    <span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${badgeClass}">
                        ${escapeHtml(b.category)}
                    </span>
                    <p class="text-xs font-semibold text-slate-800 leading-snug break-words">
                        ${escapeHtml(b.text)}
                    </p>
                </div>
            `;
            modalBulletsList.appendChild(bItem);
        });
    }

    // Document / Drawing Preview
    const drawingUrl = record.signed_drawing_url;
    modalDrawingImg.classList.add('hidden');
    modalDrawingIframe.classList.add('hidden');
    modalDrawingPlaceholder.classList.add('hidden');

    if (drawingUrl) {
        modalOpenDrawingExternal.href = drawingUrl;
        modalOpenDrawingExternal.classList.remove('hidden');

        const isPdf = drawingUrl.toLowerCase().endsWith('.pdf');
        if (isPdf) {
            modalDrawingIframe.src = drawingUrl;
            modalDrawingIframe.classList.remove('hidden');
        } else {
            modalDrawingImg.src = drawingUrl;
            modalDrawingImg.classList.remove('hidden');
        }
    } else {
        modalOpenDrawingExternal.classList.add('hidden');
        modalDrawingPlaceholder.classList.remove('hidden');
        modalDrawingPlaceholder.textContent = 'No customer signed document was attached.';
    }

    // Open Animation
    detailModal.classList.remove('hidden');
    void detailModal.offsetWidth;
    detailModal.classList.remove('opacity-0');
    detailModal.querySelector('.relative').classList.remove('scale-95');
    detailModal.querySelector('.relative').classList.add('scale-100');
}

function closeDetailModal() {
    detailModal.classList.add('opacity-0');
    detailModal.querySelector('.relative').classList.remove('scale-100');
    detailModal.querySelector('.relative').classList.add('scale-95');

    setTimeout(() => {
        detailModal.classList.add('hidden');
        modalDrawingImg.src = '';
        modalDrawingIframe.src = '';
        state.selectedRecordForModal = null;
    }, 250);
}

// Modal Event Listeners
detailModalBackdrop.addEventListener('click', closeDetailModal);
closeDetailModalBtn.addEventListener('click', closeDetailModal);
modalCloseFooter.addEventListener('click', closeDetailModal);

modalPrintBtn.addEventListener('click', () => {
    if (state.selectedRecordForModal) {
        prepareAndPrintChithi(state.selectedRecordForModal);
    }
});

// ==============================================================================
// 9. PRINTABLE HANDOVER CHITHI DISPATCH
// ==============================================================================
function prepareAndPrintChithi(record) {
    if (!record) return;

    printZoneTag.textContent = record.zone_id.toUpperCase();
    printRevTag.textContent = `Revision: v${record.revision_number || 1}`;
    printProjectName.textContent = state.activeProjectName || 'Prayosha Project Site';
    printTower.textContent = record.tower_block;
    printFloor.textContent = record.floor_level;
    printCustomer.textContent = record.customer_name;
    printPhone.textContent = record.customer_phone || 'N/A';
    printCostTerms.textContent = record.cost_impact_type || 'Standard Terms';
    printDate.textContent = formatDate(record.created_at);

    // Populate Print Bullets
    printBullets.innerHTML = '';
    const bullets = Array.isArray(record.change_bullets) ? record.change_bullets : [];

    if (bullets.length === 0) {
        printBullets.innerHTML = '<p class="italic text-gray-500">No specific change bullet points logged.</p>';
    } else {
        bullets.forEach((b, idx) => {
            const p = document.createElement('div');
            p.className = 'border-b border-gray-200 py-1.5 flex items-start gap-2';
            p.innerHTML = `
                <span class="font-bold text-gray-700">${idx + 1}. [${escapeHtml(b.category)}]</span>
                <span class="font-medium text-black">${escapeHtml(b.text)}</span>
            `;
            printBullets.appendChild(p);
        });
    }

    printableChithi.classList.remove('hidden');

    // Trigger Native Browser Print Dialog
    setTimeout(() => {
        window.print();
        printableChithi.classList.add('hidden');
    }, 150);
}

// ==============================================================================
// 10. LISTENERS & EVENT HOOKS
// ==============================================================================
searchInput.addEventListener('input', applyFilters);
towerFilter.addEventListener('change', applyFilters);
tradeFilter.addEventListener('change', applyFilters);
statusFilter.addEventListener('change', applyFilters);

refreshDataBtn.addEventListener('click', async () => {
    refreshDataBtn.classList.add('animate-pulse');
    await fetchPlanChanges();
    setTimeout(() => refreshDataBtn.classList.remove('animate-pulse'), 500);
});

// ==============================================================================
// 11. INITIALIZATION ON DOM READY
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initProjectContext();
});