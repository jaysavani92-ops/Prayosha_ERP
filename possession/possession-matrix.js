/**
 * Prayosha ERP - Possession & Unit Matrix Controller
 * File: /possession/possession-matrix.js
 * 
 * Features:
 * 1. Tower & Floor matrix visualization (Sold vs Unsold vs Handed Over).
 * 2. KPI metrics calculation (Total Units, Sold %, Available %, Snags, Delivered).
 * 3. Chabi (Key) Security Gate with Head Office clearance authorization lock.
 * 4. Automated Tri-Lingual WhatsApp Priority Dispatcher for site engineers.
 * 5. Snag punch-list items tracker with inline addition and status toggle.
 * 6. Unit registration modal with auto-sync to Supabase database.
 * 7. Defensive staff loader preventing 404 errors on uninitialized user tables.
 */

import { supabase } from '../config.js';

// ==============================================================================
// 1. STATE & CONSTANTS
// ==============================================================================
let currentProjectId = null;
let allUnits = [];
let allPossessions = [];
let allSnags = [];
let activeUnitDetail = null;

let selectedTowerFilter = 'ALL';
let selectedStatusFilter = 'ALL';
let searchQuery = '';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==============================================================================
// 2. LIFECYCLE & INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await resolveActiveProject();
    await loadMatrixData();
});

// React to global project switch from universal shell
window.addEventListener('projectChanged', async (e) => {
    if (e.detail && e.detail.projectId) {
        currentProjectId = e.detail.projectId;
        await loadMatrixData();
    }
});

/**
 * Resolves current active project UUID safely from localStorage or database
 */
async function resolveActiveProject() {
    let storedId = localStorage.getItem('activeProjectId');

    if (storedId && UUID_REGEX.test(storedId)) {
        currentProjectId = storedId;
        return;
    }

    try {
        const { data, error } = await supabase
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true })
            .limit(1);

        if (!error && data && data.length > 0) {
            currentProjectId = data[0].id;
            localStorage.setItem('activeProjectId', currentProjectId);
            localStorage.setItem('activeProjectName', data[0].project_name || 'Site Project');
            localStorage.setItem('activeProjectCode', data[0].project_code || 'SITE');
        }
    } catch (err) {
        console.error('[Possession Matrix] Project resolution exception:', err);
    }
}

// ==============================================================================
// 3. DATA FETCHING & SYNCHRONIZATION
// ==============================================================================
async function loadMatrixData() {
    const container = document.getElementById('unit-matrix-container');

    if (!currentProjectId || !UUID_REGEX.test(currentProjectId)) {
        if (container) {
            container.innerHTML = `
                <div class="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 p-10 text-center">
                    <p class="text-sm font-semibold text-slate-600">Please select a valid Project from the top navigation bar to load the unit matrix.</p>
                </div>
            `;
        }
        return;
    }

    renderLoadingState(true);

    try {
        // Parallel queries to fetch units, possession records, and active snags
        const [unitsRes, possessionsRes, snagsRes] = await Promise.all([
            supabase
                .from('project_units')
                .select('*')
                .eq('project_id', currentProjectId)
                .order('floor_number', { ascending: false })
                .order('unit_number', { ascending: true }),

            supabase
                .from('possession_records')
                .select('*')
                .eq('project_id', currentProjectId),

            supabase
                .from('possession_snag_items')
                .select('*')
        ]);

        if (unitsRes.error) throw unitsRes.error;
        if (possessionsRes.error) throw possessionsRes.error;

        allUnits = unitsRes.data || [];
        allPossessions = possessionsRes.data || [];
        allSnags = snagsRes.data || [];

        populateTowerDropdown();
        computeKPIs();
        renderMatrixView();
        loadSiteEngineers();

    } catch (err) {
        console.error('[Possession Matrix] Error fetching records:', err);
        if (container) {
            container.innerHTML = `
                <div class="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center text-rose-800">
                    <p class="text-xs font-bold uppercase tracking-wider mb-1">Database Sync Error</p>
                    <p class="text-xs">${err.message || 'Unable to load units and possession records.'}</p>
                </div>
            `;
        }
    } finally {
        renderLoadingState(false);
    }
}

/**
 * Loads site staff safely with offline defaults to avoid 404 table errors
 */
function loadSiteEngineers() {
    const select = document.getElementById('drawer-engineer-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Engineer / In-Charge --</option>';

    const defaults = [
        { name: 'Nilesh Patel', role: 'Site Engineer', phone: '+91 98250 11223' },
        { name: 'Bhavesh Savani', role: 'Finishing Supervisor', phone: '+91 98790 44556' },
        { name: 'Ramesh Kalsariya', role: 'Project Manager', phone: '+91 99090 77889' }
    ];

    defaults.forEach(d => {
        const opt = document.createElement('option');
        opt.value = JSON.stringify({ name: d.name, phone: d.phone });
        opt.textContent = `${d.name} (${d.role})`;
        select.appendChild(opt);
    });
}

// ==============================================================================
// 4. KPI CALCULATIONS
// ==============================================================================
function computeKPIs() {
    const total = allUnits.length;
    let sold = 0;
    let available = 0;
    let finishing = 0;
    let delivered = 0;

    allUnits.forEach(u => {
        const possession = allPossessions.find(p => p.unit_id === u.id);
        const st = (u.status || 'available').toLowerCase();

        if (st === 'sold') {
            sold++;
            if (possession && possession.workflow_status === 'keys_delivered') {
                delivered++;
            } else {
                finishing++;
            }
        } else if (st === 'handed_over') {
            sold++;
            delivered++;
        } else {
            available++;
        }
    });

    const soldPct = total > 0 ? Math.round((sold / total) * 100) : 0;
    const availPct = total > 0 ? Math.round((available / total) * 100) : 0;

    const elTotal = document.getElementById('kpi-total-units');
    const elSold = document.getElementById('kpi-sold-units');
    const elSoldPct = document.getElementById('kpi-sold-percent');
    const elAvail = document.getElementById('kpi-available-units');
    const elAvailPct = document.getElementById('kpi-available-percent');
    const elFinishing = document.getElementById('kpi-finishing-units');
    const elDelivered = document.getElementById('kpi-delivered-units');

    if (elTotal) elTotal.textContent = total;
    if (elSold) elSold.textContent = sold;
    if (elSoldPct) elSoldPct.textContent = `${soldPct}%`;
    if (elAvail) elAvail.textContent = available;
    if (elAvailPct) elAvailPct.textContent = `${availPct}%`;
    if (elFinishing) elFinishing.textContent = finishing;
    if (elDelivered) elDelivered.textContent = delivered;
}

// ==============================================================================
// 5. MATRIX GRID RENDERING
// ==============================================================================
function populateTowerDropdown() {
    const select = document.getElementById('filter-tower');
    if (!select) return;

    const currentVal = select.value;
    const towers = [...new Set(allUnits.map(u => u.tower_block).filter(Boolean))].sort();

    select.innerHTML = '<option value="ALL">All Towers / Wings</option>';
    towers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        select.appendChild(opt);
    });

    if (towers.includes(currentVal)) {
        select.value = currentVal;
    }
}

function renderMatrixView() {
    const container = document.getElementById('unit-matrix-container');
    if (!container) return;

    // Apply Filters
    let filtered = allUnits.filter(unit => {
        // 1. Tower filter
        if (selectedTowerFilter !== 'ALL' && unit.tower_block !== selectedTowerFilter) {
            return false;
        }

        const possession = allPossessions.find(p => p.unit_id === unit.id);
        const unitStatus = (unit.status || 'available').toLowerCase();

        // 2. Status filter
        if (selectedStatusFilter === 'sold' && unitStatus !== 'sold' && unitStatus !== 'handed_over') {
            return false;
        }
        if (selectedStatusFilter === 'available' && unitStatus !== 'available') {
            return false;
        }
        if (selectedStatusFilter === 'handed_over' && unitStatus !== 'handed_over' && (!possession || possession.workflow_status !== 'keys_delivered')) {
            return false;
        }

        // 3. Search query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const unitMatch = (unit.unit_number || '').toLowerCase().includes(q);
            const customerMatch = possession && (possession.customer_name || '').toLowerCase().includes(q);
            const phoneMatch = possession && (possession.customer_phone || '').includes(q);
            if (!unitMatch && !customerMatch && !phoneMatch) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 p-12 text-center">
                <span class="text-3xl text-slate-300 block mb-2">🏢</span>
                <p class="text-xs font-bold text-slate-700">No units match the selected filters</p>
                <p class="text-[11px] text-slate-400 mt-1">Try switching towers, clearing the search query, or register a new unit.</p>
            </div>
        `;
        return;
    }

    // Group units by Tower, then by Floor (descending)
    const grouped = {};
    filtered.forEach(unit => {
        const tower = unit.tower_block || 'Default Tower';
        const floor = unit.floor_number ?? 0;

        if (!grouped[tower]) grouped[tower] = {};
        if (!grouped[tower][floor]) grouped[tower][floor] = [];
        grouped[tower][floor].push(unit);
    });

    let html = '';

    for (const towerName of Object.keys(grouped).sort()) {
        html += `
            <div class="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                
                <!-- Tower Header Banner -->
                <div class="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-brand-navy"></span>
                        <h2 class="text-sm font-bold text-brand-navy">${escapeHtml(towerName)}</h2>
                    </div>
                    <span class="text-[11px] font-semibold text-slate-500">
                        ${Object.values(grouped[towerName]).reduce((acc, curr) => acc + curr.length, 0)} Units Listed
                    </span>
                </div>

                <!-- Tower Floors Stack (Top to Bottom) -->
                <div class="divide-y divide-slate-100 p-4 space-y-4">
        `;

        // Sort floors descending (Floor 10 down to Floor 0 / Ground)
        const sortedFloors = Object.keys(grouped[towerName]).map(Number).sort((a, b) => b - a);

        sortedFloors.forEach(floorNum => {
            const floorUnits = grouped[towerName][floorNum];
            const floorLabel = floorNum === 0 ? 'Ground Floor' : `Floor ${floorNum}`;

            html += `
                <div class="pt-3 first:pt-0">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">${floorLabel}</span>
                        <span class="text-[10px] text-slate-400 font-medium">${floorUnits.length} Flat(s)</span>
                    </div>

                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            `;

            floorUnits.forEach(u => {
                const possession = allPossessions.find(p => p.unit_id === u.id);
                const snags = allSnags.filter(s => s.unit_id === u.id && s.status !== 'verified');
                const cardMeta = getUnitCardStyling(u, possession, snags.length);

                html += `
                    <div data-unit-id="${u.id}" class="unit-matrix-card ${cardMeta.borderClass} ${cardMeta.bgClass} p-3 rounded-xl border transition-all duration-200 hover:shadow-md cursor-pointer relative group">
                        
                        <!-- Unit Number & Type -->
                        <div class="flex items-start justify-between gap-1 mb-1">
                            <span class="text-xs font-bold ${cardMeta.textClass}">${escapeHtml(u.unit_number)}</span>
                            <span class="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-white/80 border border-slate-200 text-slate-600">${escapeHtml(u.unit_type || 'Unit')}</span>
                        </div>

                        <!-- Status Label -->
                        <div class="flex items-center gap-1.5 text-[10px] font-medium text-slate-600 truncate">
                            <span class="w-1.5 h-1.5 rounded-full ${cardMeta.dotClass}"></span>
                            <span class="truncate">${cardMeta.statusLabel}</span>
                        </div>

                        <!-- Customer or Buyer Name -->
                        <div class="mt-2 text-[11px] font-semibold text-slate-800 truncate">
                            ${possession ? escapeHtml(possession.customer_name) : '<span class="text-slate-400 font-normal">Available</span>'}
                        </div>

                        <!-- Card Footer Flags (Snags, Key Lock, Target Date) -->
                        <div class="mt-2 pt-1.5 border-t border-slate-200/50 flex items-center justify-between text-[9px] font-bold">
                            ${cardMeta.footerBadge}
                            ${cardMeta.keyLockIcon}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Attach click handlers to unit cards
    container.querySelectorAll('.unit-matrix-card').forEach(card => {
        card.addEventListener('click', () => {
            const unitId = card.getAttribute('data-unit-id');
            openUnitDetailDrawer(unitId);
        });
    });
}

/**
 * Determines card background, borders, and status badges based on possession state
 */
function getUnitCardStyling(unit, possession, openSnagsCount) {
    const rawStatus = (unit.status || 'available').toLowerCase();

    // 1. Available (Unsold)
    if (rawStatus === 'available') {
        return {
            bgClass: 'bg-blue-50/40 hover:bg-blue-50/80',
            borderClass: 'border-blue-200',
            textClass: 'text-blue-900',
            dotClass: 'bg-blue-500',
            statusLabel: 'Available (Unsold)',
            footerBadge: '<span class="text-blue-600">Open</span>',
            keyLockIcon: ''
        };
    }

    // 2. Keys Handed Over
    if (rawStatus === 'handed_over' || (possession && possession.workflow_status === 'keys_delivered')) {
        return {
            bgClass: 'bg-indigo-50/50 hover:bg-indigo-50/90',
            borderClass: 'border-indigo-200',
            textClass: 'text-indigo-900',
            dotClass: 'bg-indigo-600',
            statusLabel: 'Keys Delivered',
            footerBadge: '<span class="text-indigo-700">Delivered</span>',
            keyLockIcon: '<span title="Delivered">🔑</span>'
        };
    }

    // 3. Sold Flat - Check Overdue Status
    let isOverdue = false;
    let daysDiffText = '';
    if (possession && possession.committed_possession_date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const committed = new Date(possession.committed_possession_date);
        committed.setHours(0, 0, 0, 0);
        const diffTime = committed.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            isOverdue = true;
            daysDiffText = `${Math.abs(diffDays)}d Overdue`;
        } else {
            daysDiffText = `${diffDays}d Left`;
        }
    }

    // Key release security lock flag
    const isKeyReleaseAllowed = possession ? Boolean(possession.is_key_handover_allowed) : false;
    const keyLockIcon = isKeyReleaseAllowed 
        ? '<span class="text-emerald-600" title="HO Cleared">🔓</span>' 
        : '<span class="text-rose-600" title="Key Release Locked by Head Office">🔒</span>';

    if (isOverdue) {
        return {
            bgClass: 'bg-rose-50/60 hover:bg-rose-50/90',
            borderClass: 'border-rose-300 ring-1 ring-rose-200',
            textClass: 'text-rose-900',
            dotClass: 'bg-rose-500',
            statusLabel: 'Possession Overdue',
            footerBadge: `<span class="text-rose-600">${daysDiffText}</span>`,
            keyLockIcon
        };
    }

    // Ready for QC or Snags Cleared
    if (possession && possession.workflow_status === 'snag_cleared') {
        return {
            bgClass: 'bg-emerald-50/50 hover:bg-emerald-50/90',
            borderClass: 'border-emerald-200',
            textClass: 'text-emerald-900',
            dotClass: 'bg-emerald-500',
            statusLabel: 'Snags Cleared',
            footerBadge: '<span class="text-emerald-700">Ready</span>',
            keyLockIcon
        };
    }

    // Default: Sold with Finishing in Progress
    return {
        bgClass: 'bg-amber-50/50 hover:bg-amber-50/90',
        borderClass: 'border-amber-200',
        textClass: 'text-amber-900',
        dotClass: 'bg-amber-500',
        statusLabel: openSnagsCount > 0 ? `${openSnagsCount} Snags Open` : 'Finishing Work',
        footerBadge: `<span class="text-amber-800">${daysDiffText || 'In Progress'}</span>`,
        keyLockIcon
    };
}

// ==============================================================================
// 6. UNIT DETAIL SLIDE-OVER DRAWER & HARD KEY LOCK
// ==============================================================================
function openUnitDetailDrawer(unitId) {
    const unit = allUnits.find(u => u.id === unitId);
    if (!unit) return;

    activeUnitDetail = unit;
    const possession = allPossessions.find(p => p.unit_id === unitId);
    const unitSnags = allSnags.filter(s => s.unit_id === unitId);

    const drawer = document.getElementById('unit-detail-drawer');
    const drawerPanel = document.getElementById('drawer-panel');

    // Unit Title and Badge
    document.getElementById('drawer-unit-badge').textContent = `${unit.tower_block} - ${unit.unit_number}`;
    document.getElementById('drawer-unit-title').textContent = `${unit.unit_number} (${unit.unit_type || 'Residential'})`;

    const statusPill = document.getElementById('drawer-status-pill');
    statusPill.textContent = (unit.status || 'available').toUpperCase();

    // Customer Information
    const custNameEl = document.getElementById('drawer-customer-name');
    const custPhoneEl = document.getElementById('drawer-customer-phone');
    const commitDateEl = document.getElementById('drawer-committed-date');
    const daysStatusEl = document.getElementById('drawer-days-status');

    if (possession && possession.customer_name) {
        custNameEl.textContent = possession.customer_name;
        custPhoneEl.textContent = possession.customer_phone || 'Not recorded';
        commitDateEl.textContent = possession.committed_possession_date 
            ? new Date(possession.committed_possession_date).toLocaleDateString('en-GB') 
            : 'Pending';

        if (possession.committed_possession_date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const committed = new Date(possession.committed_possession_date);
            committed.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((committed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                daysStatusEl.innerHTML = `<span class="text-rose-600 font-bold">${Math.abs(diffDays)} Days Overdue ⚠️</span>`;
            } else {
                daysStatusEl.innerHTML = `<span class="text-emerald-700 font-bold">${diffDays} Days Remaining</span>`;
            }
        } else {
            daysStatusEl.textContent = '-';
        }
    } else {
        custNameEl.textContent = 'Available for Sale';
        custPhoneEl.textContent = '-';
        commitDateEl.textContent = 'Not Booked';
        daysStatusEl.textContent = '-';
    }

    // Security Gate Card & Clearance Toggle
    const chabiGateCard = document.getElementById('drawer-chabi-gate-card');
    const keyLockTag = document.getElementById('drawer-key-lock-tag');
    const btnToggleClearance = document.getElementById('btn-toggle-key-clearance');
    const btnDeliverKeys = document.getElementById('btn-final-key-handover');

    const isKeyReleaseAllowed = possession ? Boolean(possession.is_key_handover_allowed) : false;

    if (isKeyReleaseAllowed) {
        chabiGateCard.className = 'p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 shadow-sm space-y-3';
        keyLockTag.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white';
        keyLockTag.textContent = 'KEYS UNLOCKED (HO CLEARED)';
        btnToggleClearance.textContent = 'Lock Keys (Revoke HO Clearance)';
        btnToggleClearance.className = 'px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition shadow-sm cursor-pointer';

        btnDeliverKeys.disabled = false;
        btnDeliverKeys.className = 'flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md cursor-pointer';
    } else {
        chabiGateCard.className = 'p-4 rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/70 shadow-sm space-y-3';
        keyLockTag.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white';
        keyLockTag.textContent = 'KEYS STRICTLY LOCKED';
        btnToggleClearance.textContent = 'Unlock Key Handover (HO Clearance)';
        btnToggleClearance.className = 'px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer';

        btnDeliverKeys.disabled = true;
        btnDeliverKeys.className = 'flex-1 py-2.5 rounded-xl bg-slate-200 text-slate-400 text-xs font-bold transition cursor-not-allowed';
    }

    // Render Snag Checklist
    renderDrawerSnagList(unitSnags);

    // Open Drawer Animation
    drawer.classList.remove('hidden');
    void drawer.offsetWidth;
    drawer.classList.remove('opacity-0');
    drawer.classList.add('opacity-100');
    drawerPanel.classList.remove('translate-x-full');
    drawerPanel.classList.add('translate-x-0');
}

function closeUnitDetailDrawer() {
    const drawer = document.getElementById('unit-detail-drawer');
    const drawerPanel = document.getElementById('drawer-panel');
    if (!drawer || !drawerPanel) return;

    drawer.classList.remove('opacity-100');
    drawer.classList.add('opacity-0');
    drawerPanel.classList.remove('translate-x-0');
    drawerPanel.classList.add('translate-x-full');

    setTimeout(() => {
        drawer.classList.add('hidden');
        activeUnitDetail = null;
    }, 300);
}

// ==============================================================================
// 7. SNAG ITEMS & CHECKLIST MANAGEMENT
// ==============================================================================
function renderDrawerSnagList(snags) {
    const listContainer = document.getElementById('drawer-snags-list');
    const pill = document.getElementById('drawer-snag-count-pill');
    if (!listContainer) return;

    if (pill) pill.textContent = `${snags.length} Items`;

    if (!snags || snags.length === 0) {
        listContainer.innerHTML = '<p class="text-xs text-slate-400 italic">No open punch-list snags recorded for this flat.</p>';
        return;
    }

    let html = '';
    snags.forEach(snag => {
        const isRectified = snag.status === 'rectified' || snag.status === 'verified';
        html += `
            <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <input type="checkbox" data-snag-id="${snag.id}" ${isRectified ? 'checked' : ''} class="snag-status-checkbox rounded text-brand-navy focus:ring-brand-navy cursor-pointer">
                    <span class="${isRectified ? 'line-through text-slate-400 font-normal' : 'font-semibold text-slate-700'} truncate">${escapeHtml(snag.item_description)}</span>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded ${isRectified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'} flex-shrink-0">
                    ${isRectified ? 'Rectified' : 'Pending'}
                </span>
            </div>
        `;
    });

    listContainer.innerHTML = html;

    // Attach status toggle listener to checkmark
    listContainer.querySelectorAll('.snag-status-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const snagId = e.target.getAttribute('data-snag-id');
            const newStatus = e.target.checked ? 'rectified' : 'pending';
            await toggleSnagStatus(snagId, newStatus);
        });
    });
}

async function handleAddSnag() {
    const input = document.getElementById('input-new-snag');
    const text = input ? input.value.trim() : '';

    if (!text || !activeUnitDetail) return;

    let possession = allPossessions.find(p => p.unit_id === activeUnitDetail.id);

    // If unit doesn't have a possession record yet, create one
    if (!possession) {
        const { data: newPoss, error: possErr } = await supabase
            .from('possession_records')
            .insert([{
                project_id: currentProjectId,
                unit_id: activeUnitDetail.id,
                customer_name: 'Unassigned Buyer',
                committed_possession_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                workflow_status: 'finishing_pending'
            }])
            .select()
            .single();

        if (possErr) {
            alert('Failed to initialize possession entry: ' + possErr.message);
            return;
        }
        allPossessions.push(newPoss);
        possession = newPoss;
    }

    try {
        const { data, error } = await supabase
            .from('possession_snag_items')
            .insert([{
                possession_id: possession.id,
                unit_id: activeUnitDetail.id,
                category: 'General Finishing',
                item_description: text,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;

        allSnags.push(data);
        input.value = '';

        const updatedSnags = allSnags.filter(s => s.unit_id === activeUnitDetail.id);
        renderDrawerSnagList(updatedSnags);
        renderMatrixView();

    } catch (err) {
        console.error('[Possession Matrix] Snag Insert Error:', err);
        alert('Could not save snag item: ' + err.message);
    }
}

async function toggleSnagStatus(snagId, newStatus) {
    try {
        const { error } = await supabase
            .from('possession_snag_items')
            .update({ 
                status: newStatus,
                rectified_at: newStatus === 'rectified' ? new Date().toISOString() : null
            })
            .eq('id', snagId);

        if (error) throw error;

        const idx = allSnags.findIndex(s => s.id === snagId);
        if (idx !== -1) {
            allSnags[idx].status = newStatus;
        }

        renderMatrixView();
    } catch (err) {
        console.error('[Possession Matrix] Error updating snag:', err);
    }
}

// ==============================================================================
// 8. CHABI SECURITY GATE & WHATSAPP DISPATCH
// ==============================================================================
async function handleToggleKeyClearance() {
    if (!activeUnitDetail) return;
    const possession = allPossessions.find(p => p.unit_id === activeUnitDetail.id);
    if (!possession) {
        alert('Please assign customer booking details to this unit before toggling Head Office key clearance.');
        return;
    }

    const currentLockStatus = Boolean(possession.is_key_handover_allowed);
    const newLockStatus = !currentLockStatus;

    const actionWord = newLockStatus ? 'AUTHORIZE Head Office Key Handover' : 'LOCK & REVOKE Key Handover';
    const confirmPrompt = `Are you sure you want to ${actionWord} for unit ${activeUnitDetail.unit_number}?`;

    if (!confirm(confirmPrompt)) return;

    try {
        const currentUserStr = localStorage.getItem('prayosha_user');
        let userName = 'Head Office';
        if (currentUserStr) {
            try { userName = JSON.parse(currentUserStr).full_name || 'Head Office'; } catch (_) {}
        }

        const { error } = await supabase
            .from('possession_records')
            .update({
                is_key_handover_allowed: newLockStatus,
                ho_clearance_by: newLockStatus ? userName : null,
                ho_clearance_at: newLockStatus ? new Date().toISOString() : null,
                workflow_status: newLockStatus ? 'ho_approved' : 'finishing_pending'
            })
            .eq('id', possession.id);

        if (error) throw error;

        possession.is_key_handover_allowed = newLockStatus;
        possession.workflow_status = newLockStatus ? 'ho_approved' : 'finishing_pending';

        openUnitDetailDrawer(activeUnitDetail.id);
        renderMatrixView();

    } catch (err) {
        console.error('[Possession Matrix] Toggle Clearance Failure:', err);
        alert('Failed to update clearance status: ' + err.message);
    }
}

function handleDispatchWhatsApp() {
    if (!activeUnitDetail) return;

    const possession = allPossessions.find(p => p.unit_id === activeUnitDetail.id);
    const select = document.getElementById('drawer-engineer-select');
    const selectedVal = select ? select.value : '';

    if (!selectedVal) {
        alert('Please choose an Assigned Site Supervisor / Engineer from the dropdown first.');
        return;
    }

    const engineer = JSON.parse(selectedVal);
    const snags = allSnags.filter(s => s.unit_id === activeUnitDetail.id && s.status !== 'verified');
    const snagCount = snags.length;

    const targetDateStr = possession && possession.committed_possession_date 
        ? new Date(possession.committed_possession_date).toLocaleDateString('en-GB') 
        : 'Immediate';

    // Strict Management Order WhatsApp Template
    const message = 
`🚨 *PRAYOSHA SITE ORDER: PRIORITY UNIT COMPLETION*
-----------------------------------------
🏢 *Tower / Unit:* ${activeUnitDetail.tower_block} - ${activeUnitDetail.unit_number} (${activeUnitDetail.unit_type || 'Flat'})
👤 *Customer:* ${possession ? possession.customer_name : 'Valued Buyer'}
📅 *Committed Possession Date:* ${targetDateStr}
👷 *Assigned In-Charge:* ${engineer.name}
📋 *Pending Punch List Snags:* ${snagCount} item(s)

⚠️ *STRICT SITE DIRECTIVE:*
Execute final touch-ups, deep cleaning, and plumbing/electrical fixtures on war footing. 
*UNDER NO CIRCUMSTANCES SHALL KEYS BE HANDED OVER OR BUYER INTERIOR ACCESS GRANTED WITHOUT HEAD OFFICE NOC.*

_Dispatched via Prayosha ERP Operating System_`;

    const encodedMsg = encodeURIComponent(message);
    const cleanPhone = (engineer.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodedMsg}` : `https://api.whatsapp.com/send?text=${encodedMsg}`;

    // Log telemetry alert
    supabase
        .from('possession_worker_alerts')
        .insert([{
            project_id: currentProjectId,
            unit_id: activeUnitDetail.id,
            recipient_name: engineer.name,
            recipient_role: 'Site In-Charge',
            recipient_phone: engineer.phone || 'N/A',
            message_text: message,
            dispatch_channel: 'whatsapp'
        }])
        .then(() => {});

    window.open(waUrl, '_blank');
}

async function handleFinalKeyHandover() {
    if (!activeUnitDetail) return;
    const possession = allPossessions.find(p => p.unit_id === activeUnitDetail.id);

    if (!possession || !possession.is_key_handover_allowed) {
        alert('Action Blocked: Key release is locked. Obtain Head Office clearance first.');
        return;
    }

    if (!confirm(`Confirm that keys for Unit ${activeUnitDetail.unit_number} are officially delivered to the customer today?`)) {
        return;
    }

    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Update Possession Record
        const { error: possErr } = await supabase
            .from('possession_records')
            .update({
                workflow_status: 'keys_delivered',
                actual_possession_date: todayStr
            })
            .eq('id', possession.id);

        if (possErr) throw possErr;

        // 2. Update Project Unit Status
        const { error: unitErr } = await supabase
            .from('project_units')
            .update({ status: 'handed_over' })
            .eq('id', activeUnitDetail.id);

        if (unitErr) throw unitErr;

        activeUnitDetail.status = 'handed_over';
        possession.workflow_status = 'keys_delivered';
        possession.actual_possession_date = todayStr;

        computeKPIs();
        openUnitDetailDrawer(activeUnitDetail.id);
        renderMatrixView();

        alert(`Keys for ${activeUnitDetail.unit_number} delivered successfully. Recorded in possession ledger.`);

    } catch (err) {
        console.error('[Possession Matrix] Key Handover Error:', err);
        alert('Failed to record handover: ' + err.message);
    }
}

// ==============================================================================
// 9. CREATE UNIT MODAL & REGISTRATION
// ==============================================================================
function openCreateUnitModal() {
    const modal = document.getElementById('create-unit-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
}

function closeCreateUnitModal() {
    const modal = document.getElementById('create-unit-modal');
    if (!modal) return;
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        const form = document.getElementById('form-create-unit');
        if (form) form.reset();
    }, 300);
}

async function handleCreateUnitSubmit(e) {
    e.preventDefault();

    if (!currentProjectId || !UUID_REGEX.test(currentProjectId)) {
        alert('Please choose an active project first.');
        return;
    }

    const tower = document.getElementById('modal-tower').value.trim();
    const floor = parseInt(document.getElementById('modal-floor').value, 10);
    const unitNo = document.getElementById('modal-unit').value.trim();
    const unitType = document.getElementById('modal-type').value;

    const customerName = document.getElementById('modal-customer-name').value.trim();
    const customerPhone = document.getElementById('modal-customer-phone').value.trim();
    const possessionDate = document.getElementById('modal-possession-date').value;

    const isSold = Boolean(customerName);

    try {
        // 1. Insert Unit
        const { data: newUnit, error: unitErr } = await supabase
            .from('project_units')
            .insert([{
                project_id: currentProjectId,
                tower_block: tower,
                floor_number: floor,
                unit_number: unitNo,
                unit_type: unitType,
                status: isSold ? 'sold' : 'available'
            }])
            .select()
            .single();

        if (unitErr) throw unitErr;

        // 2. If Sold, Insert Possession Entry
        if (isSold) {
            const { data: newPoss, error: possErr } = await supabase
                .from('possession_records')
                .insert([{
                    project_id: currentProjectId,
                    unit_id: newUnit.id,
                    customer_name: customerName,
                    customer_phone: customerPhone || null,
                    committed_possession_date: possessionDate || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    workflow_status: 'finishing_pending',
                    is_key_handover_allowed: false
                }])
                .select()
                .single();

            if (possErr) throw possErr;
            allPossessions.push(newPoss);
        }

        allUnits.push(newUnit);
        closeCreateUnitModal();

        populateTowerDropdown();
        computeKPIs();
        renderMatrixView();

    } catch (err) {
        console.error('[Possession Matrix] Unit creation failed:', err);
        alert('Could not create unit: ' + err.message);
    }
}

// ==============================================================================
// 10. EVENT LISTENERS
// ==============================================================================
function setupEventListeners() {
    // Refresh Button
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', loadMatrixData);

    // Tower Filter Select
    const filterTower = document.getElementById('filter-tower');
    if (filterTower) {
        filterTower.addEventListener('change', (e) => {
            selectedTowerFilter = e.target.value;
            renderMatrixView();
        });
    }

    // Status Filter Tabs
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.status-tab').forEach(t => {
                t.classList.remove('bg-white', 'text-brand-navy', 'shadow-sm');
                t.classList.add('hover:text-brand-navy');
            });
            const clicked = e.currentTarget;
            clicked.classList.add('bg-white', 'text-brand-navy', 'shadow-sm');
            selectedStatusFilter = clicked.getAttribute('data-status-filter') || 'ALL';
            renderMatrixView();
        });
    });

    // Search Input with Debounce
    const searchInput = document.getElementById('search-unit-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = e.target.value.trim();
                renderMatrixView();
            }, 250);
        });
    }

    // Drawer Controls
    const btnCloseDrawer = document.getElementById('btn-close-drawer');
    const drawerBackdrop = document.getElementById('drawer-backdrop');
    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeUnitDetailDrawer);
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeUnitDetailDrawer);

    // Snag Add Button & Input Enter Key
    const btnAddSnag = document.getElementById('btn-add-snag');
    const inputSnag = document.getElementById('input-new-snag');
    if (btnAddSnag) btnAddSnag.addEventListener('click', handleAddSnag);
    if (inputSnag) {
        inputSnag.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSnag();
            }
        });
    }

    // Hard Key Lock Clearance Toggle
    const btnToggleClearance = document.getElementById('btn-toggle-key-clearance');
    if (btnToggleClearance) btnToggleClearance.addEventListener('click', handleToggleKeyClearance);

    // WhatsApp Dispatch Button
    const btnDispatchWA = document.getElementById('btn-dispatch-whatsapp');
    if (btnDispatchWA) btnDispatchWA.addEventListener('click', handleDispatchWhatsApp);

    // Final Handover Button
    const btnFinalHandover = document.getElementById('btn-final-key-handover');
    if (btnFinalHandover) btnFinalHandover.addEventListener('click', handleFinalKeyHandover);

    // Unit Modal Open & Close
    const btnOpenModal = document.getElementById('btn-open-create-unit-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const formCreateUnit = document.getElementById('form-create-unit');

    if (btnOpenModal) btnOpenModal.addEventListener('click', openCreateUnitModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeCreateUnitModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeCreateUnitModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeCreateUnitModal);
    if (formCreateUnit) formCreateUnit.addEventListener('submit', handleCreateUnitSubmit);
}

// ==============================================================================
// 11. UTILITY FUNCTIONS
// ==============================================================================
function renderLoadingState(isLoading) {
    const container = document.getElementById('unit-matrix-container');
    if (!container) return;

    if (isLoading && allUnits.length === 0) {
        container.innerHTML = `
            <div class="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 p-12 text-center">
                <svg class="animate-spin h-8 w-8 text-brand-amber mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                <p class="text-xs font-semibold text-slate-600">Loading possession records & tower matrix...</p>
            </div>
        `;
    }
}

function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}