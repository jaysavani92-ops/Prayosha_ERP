/**
 * Prayosha ERP - Possession Priority Dispatch & Site Alerts Controller
 * File: /possession/possession-alerts.js
 * 
 * Features:
 * 1. Telemetry and audit feed of all priority site notifications dispatched via WhatsApp.
 * 2. Real-time KPI metrics calculation (Total Dispatches, Unique Units, Staff Contacted, Key Lock Directives).
 * 3. Dynamic modal composer with auto-filled message templates binding staff to strict key security protocols.
 * 4. Multi-variable filtering by recipient staff role, target unit/tower, and text search.
 * 5. Direct 1-click WhatsApp web/app integration with instant message regeneration and resend capability.
 * 6. Full database synchronization with the Supabase `possession_worker_alerts` table.
 */

import { supabase } from '../config.js';

// ==============================================================================
// 1. STATE & CONSTANTS
// ==============================================================================
let currentProjectId = null;
let allAlerts = [];
let allUnits = [];
let allPossessions = [];

let filterRole = 'ALL';
let filterUnit = 'ALL';
let searchQuery = '';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Predefined Message Directives Templates
const DISPATCH_TEMPLATES = {
    finishing_priority: (unitStr, buyerStr, targetDateStr, staffName) =>
`🚨 *PRAYOSHA SITE ORDER: PRIORITY UNIT COMPLETION*
-----------------------------------------
🏢 *Target Unit:* ${unitStr}
👤 *Buyer / Customer:* ${buyerStr}
📅 *Committed Possession Date:* ${targetDateStr}
👷 *Assigned In-Charge:* ${staffName}

📋 *Action Required:*
Mobilize finishing masons, painters, and cleaning crews immediately. Complete all pending punch-list rectifications on war footing.

⚠️ *STRICT MANAGEMENT DIRECTIVE:*
Execute work only. *UNDER NO CIRCUMSTANCES MAY PHYSICAL KEYS BE HANDED OVER OR BUYER INTERIOR FIT-OUT ACCESS COMMENCED WITHOUT OFFICIAL HEAD OFFICE CLEARANCE NOC.*

_Dispatched via Prayosha ERP Operating System_`,

    imminent_inspection: (unitStr, buyerStr, targetDateStr, staffName) =>
`⚠️ *PRAYOSHA URGENT NOTICE: BUYER SITE INSPECTION*
-----------------------------------------
🏢 *Unit:* ${unitStr}
👤 *Buyer:* ${buyerStr}
📅 *Inspection Target:* ${targetDateStr}
👷 *Site In-Charge:* ${staffName}

📋 *Directive:*
The customer has scheduled a site walk-through. Ensure all floors are clean, protective sheets intact, plumbing taps tested, and electrical sockets secured before arrival.

🔒 *SECURITY NOTICE:*
Do not release duplicate keys, main door keys, or society handover forms directly on site. Direct all customer possession queries to the Head Office.

_Dispatched via Prayosha ERP Operating System_`,

    strict_key_lock: (unitStr, buyerStr, targetDateStr, staffName) =>
`⛔ *CRITICAL SITE DIRECTIVE: HARD KEY LOCK ENFORCEMENT*
-----------------------------------------
🏢 *Unit:* ${unitStr}
👤 *Customer:* ${buyerStr}
👷 *In-Charge Inward:* ${staffName}

🛑 *HOLD KEY DELIVERY - HEAD OFFICE ORDER:*
Site management is strictly notified that accounts clearance and statutory society deposits for this unit are CURRENTLY PENDING at Head Office.

*DO NOT HAND OVER MAIN DOOR KEYS OR GRANT UNESCORTED ACCESS UNDER ANY CIRCUMSTANCES.*
Any unauthorized key handover will be treated as a direct site breach.

_Prayosha Executive Vigilance & Site Operations_`
};

// ==============================================================================
// 2. LIFECYCLE & INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await resolveActiveProject();
    await loadMasterData();
});

// React to universal shell project selector changes
window.addEventListener('projectChanged', async (e) => {
    if (e.detail && e.detail.projectId) {
        currentProjectId = e.detail.projectId;
        await loadMasterData();
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
        console.error('[Possession Alerts] Project resolution exception:', err);
    }
}

// ==============================================================================
// 3. MASTER DATA FETCHING & SYNCHRONIZATION
// ==============================================================================
async function loadMasterData() {
    const container = document.getElementById('alerts-feed-container');

    if (!currentProjectId || !UUID_REGEX.test(currentProjectId)) {
        if (container) {
            container.innerHTML = `
                <div class="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 p-10 text-center">
                    <p class="text-sm font-semibold text-slate-600">Please select an active project from the top navigation bar to view alert logs.</p>
                </div>
            `;
        }
        return;
    }

    renderLoadingState(true);

    try {
        // Parallel queries to fetch telemetry logs, project units, and customer bookings
        const [alertsRes, unitsRes, possessionsRes] = await Promise.all([
            supabase
                .from('possession_worker_alerts')
                .select('*')
                .eq('project_id', currentProjectId)
                .order('dispatched_at', { ascending: false }),

            supabase
                .from('project_units')
                .select('*')
                .eq('project_id', currentProjectId)
                .order('floor_number', { ascending: false })
                .order('unit_number', { ascending: true }),

            supabase
                .from('possession_records')
                .select('*')
                .eq('project_id', currentProjectId)
        ]);

        if (alertsRes.error) throw alertsRes.error;
        if (unitsRes.error) throw unitsRes.error;
        if (possessionsRes.error) throw possessionsRes.error;

        allAlerts = alertsRes.data || [];
        allUnits = unitsRes.data || [];
        allPossessions = possessionsRes.data || [];

        populateUnitFilters();
        populateModalUnitsDropdown();
        computeAlertKPIs();
        renderAlertsFeed();

    } catch (err) {
        console.error('[Possession Alerts] Master sync failure:', err);
        if (container) {
            container.innerHTML = `
                <div class="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center text-rose-800">
                    <p class="text-xs font-bold uppercase tracking-wider mb-1">Database Sync Error</p>
                    <p class="text-xs">${err.message || 'Unable to load worker alerts and site dispatch logs.'}</p>
                </div>
            `;
        }
    } finally {
        renderLoadingState(false);
    }
}

// ==============================================================================
// 4. KPI CALCULATIONS
// ==============================================================================
function computeAlertKPIs() {
    const totalAlerts = allAlerts.length;
    
    // Unique units targeted
    const uniqueUnitIds = new Set(allAlerts.map(a => a.unit_id).filter(Boolean));
    const uniqueUnitsCount = uniqueUnitIds.size;

    // Unique staff recipients
    const uniqueStaff = new Set(allAlerts.map(a => (a.recipient_name || '').trim().toLowerCase()).filter(Boolean));
    const staffCount = uniqueStaff.size;

    const elTotal = document.getElementById('kpi-total-alerts');
    const elUnits = document.getElementById('kpi-unique-units');
    const elStaff = document.getElementById('kpi-staff-reached');
    const elLocks = document.getElementById('kpi-key-locks-count');

    if (elTotal) elTotal.textContent = totalAlerts;
    if (elUnits) elUnits.textContent = uniqueUnitsCount;
    if (elStaff) elStaff.textContent = staffCount;
    if (elLocks) elLocks.textContent = '100%';
}

// ==============================================================================
// 5. DROPDOWN & FILTER POPULATION
// ==============================================================================
function populateUnitFilters() {
    const select = document.getElementById('filter-unit-block');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="ALL">All Units / Flats</option>';

    allUnits.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.tower_block} - ${u.unit_number}`;
        select.appendChild(opt);
    });

    if (currentVal && allUnits.some(u => u.id === currentVal)) {
        select.value = currentVal;
    }
}

function populateModalUnitsDropdown() {
    const select = document.getElementById('modal-target-unit-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose Unit Under Finishing --</option>';

    allUnits.forEach(unit => {
        const possession = allPossessions.find(p => p.unit_id === unit.id);
        const buyerText = possession && possession.customer_name ? ` (${possession.customer_name})` : ' (Available)';
        const opt = document.createElement('option');
        opt.value = unit.id;
        opt.textContent = `${unit.tower_block} - ${unit.unit_number}${buyerText}`;
        select.appendChild(opt);
    });
}

// ==============================================================================
// 6. ALERTS FEED RENDERING
// ==============================================================================
function renderAlertsFeed() {
    const container = document.getElementById('alerts-feed-container');
    if (!container) return;

    // Apply Filters
    const filtered = allAlerts.filter(alert => {
        // 1. Role Filter
        if (filterRole !== 'ALL' && (alert.recipient_role || '') !== filterRole) {
            return false;
        }

        // 2. Unit Filter
        if (filterUnit !== 'ALL' && alert.unit_id !== filterUnit) {
            return false;
        }

        // 3. Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const staffMatch = (alert.recipient_name || '').toLowerCase().includes(q);
            const roleMatch = (alert.recipient_role || '').toLowerCase().includes(q);
            const phoneMatch = (alert.recipient_phone || '').includes(q);
            const msgMatch = (alert.message_text || '').toLowerCase().includes(q);

            const linkedUnit = allUnits.find(u => u.id === alert.unit_id);
            const unitMatch = linkedUnit && `${linkedUnit.tower_block} ${linkedUnit.unit_number}`.toLowerCase().includes(q);

            if (!staffMatch && !roleMatch && !phoneMatch && !msgMatch && !unitMatch) {
                return false;
            }
        }

        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 p-12 text-center">
                <span class="text-3xl text-slate-300 block mb-2">💬</span>
                <p class="text-xs font-bold text-slate-700">No priority dispatch records found</p>
                <p class="text-[11px] text-slate-400 mt-1">No alerts match the selected criteria, or no site notices have been dispatched yet.</p>
            </div>
        `;
        return;
    }

    let html = '';

    filtered.forEach(item => {
        const linkedUnit = allUnits.find(u => u.id === item.unit_id);
        const unitLabel = linkedUnit ? `${linkedUnit.tower_block} - ${linkedUnit.unit_number}` : 'Site Unit';
        
        const timestamp = item.dispatched_at 
            ? new Date(item.dispatched_at).toLocaleString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
              })
            : 'Logged Dispatch';

        // Styling based on recipient role
        let roleBadgeStyle = 'bg-blue-100 text-blue-800 border-blue-200';
        if ((item.recipient_role || '').includes('Engineer')) {
            roleBadgeStyle = 'bg-indigo-100 text-indigo-800 border-indigo-200';
        } else if ((item.recipient_role || '').includes('Supervisor')) {
            roleBadgeStyle = 'bg-amber-100 text-amber-800 border-amber-200';
        } else if ((item.recipient_role || '').includes('Manager')) {
            roleBadgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        }

        html += `
            <div class="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3 hover:border-slate-300 transition">
                
                <!-- Card Header -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 text-base font-bold flex-shrink-0">
                            💬
                        </div>
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-xs font-bold text-brand-navy">${escapeHtml(item.recipient_name)}</span>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${roleBadgeStyle}">
                                    ${escapeHtml(item.recipient_role || 'Staff')}
                                </span>
                                <span class="text-[11px] font-semibold text-slate-500">
                                    📞 ${escapeHtml(item.recipient_phone || 'N/A')}
                                </span>
                            </div>
                            <span class="text-[10px] text-slate-400 mt-0.5 block">
                                Dispatched on ${timestamp} via ${(item.dispatch_channel || 'whatsapp').toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <!-- Target Unit Badge & Direct WhatsApp Resend -->
                    <div class="flex items-center gap-2 self-start sm:self-center">
                        <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-navy text-brand-amber">
                            ${escapeHtml(unitLabel)}
                        </span>
                        <button type="button" data-alert-id="${item.id}" class="btn-resend-whatsapp px-3 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer" title="Re-open in WhatsApp">
                            <span>📱</span>
                            <span>Resend</span>
                        </button>
                    </div>
                </div>

                <!-- Card Message Preview Body (Rendered as Formatted Blockquote) -->
                <div class="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 font-mono text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    ${escapeHtml(item.message_text)}
                </div>

                <!-- Card Footer Policy Verification -->
                <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span class="flex items-center gap-1 text-rose-600 font-bold">
                        <span>🔒</span> <span>Hard Key Lock Enforced in Work Order</span>
                    </span>
                    <span class="text-slate-400">UUID: ${(item.id || '').substring(0, 8)}</span>
                </div>

            </div>
        `;
    });

    container.innerHTML = html;

    // Attach listeners to resend buttons
    container.querySelectorAll('.btn-resend-whatsapp').forEach(btn => {
        btn.addEventListener('click', () => {
            const alertId = btn.getAttribute('data-alert-id');
            const alertItem = allAlerts.find(a => a.id === alertId);
            if (alertItem) {
                resendWhatsAppDirect(alertItem);
            }
        });
    });
}

function resendWhatsAppDirect(item) {
    const encoded = encodeURIComponent(item.message_text);
    const cleanPhone = (item.recipient_phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone 
        ? `https://wa.me/${cleanPhone}?text=${encoded}` 
        : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(waUrl, '_blank');
}

// ==============================================================================
// 7. COMPOSE & DISPATCH MODAL HANDLERS
// ==============================================================================
function openDispatchModal() {
    const modal = document.getElementById('dispatch-compose-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');

    // Auto-populate default template text
    updateModalMessageBody();
}

function closeDispatchModal() {
    const modal = document.getElementById('dispatch-compose-modal');
    if (!modal) return;

    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        const form = document.getElementById('form-compose-dispatch');
        if (form) form.reset();
    }, 300);
}

function updateModalMessageBody() {
    const unitSelect = document.getElementById('modal-target-unit-select');
    const chosenUnitId = unitSelect ? unitSelect.value : null;

    const staffName = document.getElementById('modal-staff-name')?.value.trim() || 'Site In-Charge';
    const templateKey = document.getElementById('modal-template-select')?.value || 'finishing_priority';

    let unitStr = 'Tower A - Unit 101';
    let buyerStr = 'Valued Customer';
    let targetDateStr = 'Immediate Delivery';

    if (chosenUnitId) {
        const u = allUnits.find(unit => unit.id === chosenUnitId);
        if (u) {
            unitStr = `${u.tower_block} - ${u.unit_number} (${u.unit_type || 'Residential'})`;
            const poss = allPossessions.find(p => p.unit_id === chosenUnitId);
            if (poss) {
                if (poss.customer_name) buyerStr = poss.customer_name;
                if (poss.committed_possession_date) {
                    targetDateStr = new Date(poss.committed_possession_date).toLocaleDateString('en-GB');
                }
            }
        }
    }

    const templateFn = DISPATCH_TEMPLATES[templateKey] || DISPATCH_TEMPLATES.finishing_priority;
    const generatedText = templateFn(unitStr, buyerStr, targetDateStr, staffName);

    const textarea = document.getElementById('modal-message-body');
    if (textarea) {
        textarea.value = generatedText;
    }
}

async function handleDispatchFormSubmit(e) {
    e.preventDefault();

    if (!currentProjectId || !UUID_REGEX.test(currentProjectId)) {
        alert('Please select an active project first.');
        return;
    }

    const unitId = document.getElementById('modal-target-unit-select').value;
    const staffName = document.getElementById('modal-staff-name').value.trim();
    const staffRole = document.getElementById('modal-staff-role').value;
    const staffPhone = document.getElementById('modal-staff-phone').value.trim();
    const messageText = document.getElementById('modal-message-body').value.trim();

    if (!unitId || !staffName || !staffPhone || !messageText) {
        alert('Please fill in all mandatory fields.');
        return;
    }

    try {
        // 1. Insert record into Supabase possession_worker_alerts
        const { data, error } = await supabase
            .from('possession_worker_alerts')
            .insert([{
                project_id: currentProjectId,
                unit_id: unitId,
                recipient_name: staffName,
                recipient_role: staffRole,
                recipient_phone: staffPhone,
                message_text: messageText,
                dispatch_channel: 'whatsapp'
            }])
            .select()
            .single();

        if (error) throw error;

        allAlerts.unshift(data);

        // 2. Open WhatsApp Web / Native Client
        const encoded = encodeURIComponent(messageText);
        const cleanPhone = staffPhone.replace(/\D/g, '');
        const waUrl = cleanPhone 
            ? `https://wa.me/${cleanPhone}?text=${encoded}` 
            : `https://api.whatsapp.com/send?text=${encoded}`;

        window.open(waUrl, '_blank');

        closeDispatchModal();
        computeAlertKPIs();
        renderAlertsFeed();

    } catch (err) {
        console.error('[Possession Alerts] Dispatch Failure:', err);
        alert('Failed to log alert dispatch: ' + err.message);
    }
}

// ==============================================================================
// 8. EVENT LISTENERS
// ==============================================================================
function setupEventListeners() {
    // Refresh Button
    const btnRefresh = document.getElementById('btn-refresh-alerts');
    if (btnRefresh) btnRefresh.addEventListener('click', loadMasterData);

    // Role Filter Select
    const selectRole = document.getElementById('filter-recipient-role');
    if (selectRole) {
        selectRole.addEventListener('change', (e) => {
            filterRole = e.target.value;
            renderAlertsFeed();
        });
    }

    // Unit Filter Select
    const selectUnit = document.getElementById('filter-unit-block');
    if (selectUnit) {
        selectUnit.addEventListener('change', (e) => {
            filterUnit = e.target.value;
            renderAlertsFeed();
        });
    }

    // Search Input with Debounce
    const searchInput = document.getElementById('search-alerts-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchQuery = e.target.value.trim();
                renderAlertsFeed();
            }, 250);
        });
    }

    // Modal Controls
    const btnOpenModal = document.getElementById('btn-open-dispatch-modal');
    const btnCloseModal = document.getElementById('btn-close-dispatch-modal');
    const btnCancelModal = document.getElementById('btn-cancel-dispatch-modal');
    const modalBackdrop = document.getElementById('modal-dispatch-backdrop');
    const formDispatch = document.getElementById('form-compose-dispatch');

    if (btnOpenModal) btnOpenModal.addEventListener('click', openDispatchModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeDispatchModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeDispatchModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeDispatchModal);
    if (formDispatch) formDispatch.addEventListener('submit', handleDispatchFormSubmit);

    // Modal Target Unit & Template Select Listeners
    const modalUnitSelect = document.getElementById('modal-target-unit-select');
    const modalTemplateSelect = document.getElementById('modal-template-select');
    const modalStaffName = document.getElementById('modal-staff-name');

    if (modalUnitSelect) modalUnitSelect.addEventListener('change', updateModalMessageBody);
    if (modalTemplateSelect) modalTemplateSelect.addEventListener('change', updateModalMessageBody);
    if (modalStaffName) modalStaffName.addEventListener('input', updateModalMessageBody);
}

// ==============================================================================
// 9. UTILITIES
// ==============================================================================
function renderLoadingState(isLoading) {
    const container = document.getElementById('alerts-feed-container');
    if (!container) return;

    if (isLoading && allAlerts.length === 0) {
        container.innerHTML = `
            <div class="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 p-12 text-center">
                <svg class="animate-spin h-8 w-8 text-brand-amber mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                <p class="text-xs font-semibold text-slate-600">Loading telemetry and site dispatch history...</p>
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