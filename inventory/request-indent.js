/**
 * Prayosha ERP - Material Indent & Requisition Controller
 * File: /inventory/request-indent.js
 * 
 * Features:
 * 1. URL Query Parameter Auto-Fill: Pre-selects material SKUs linked from Stock Overview.
 * 2. Requisition Submission: Records project phase, quantity, urgency, and requester metadata.
 * 3. Dynamic Stock Level Indicators: Shows live on-site balances for the selected item.
 * 4. Approval Register & Status Lifecycle: Real-time filtering across Pending, Approved,
 *    On Hold, and Fulfilled states with one-click status updates.
 * 5. Project Workspace Scoping: Scopes requisitions strictly to the active project context.
 */

import { supabase } from '../config.js';

// Central Supabase Client
const client = supabase || window.supabaseClient;

// DOM Elements - Workspace & Badges
const activeProjectBadge = document.getElementById('activeProjectBadge');

// DOM Elements - Requisition Form
const formIndent = document.getElementById('formIndent');
const indentItemSelect = document.getElementById('indentItemSelect');
const indentStockBadge = document.getElementById('indentStockBadge');
const indentQty = document.getElementById('indentQty');
const indentPhase = document.getElementById('indentPhase');
const indentUrgency = document.getElementById('indentUrgency');
const indentRequestedBy = document.getElementById('indentRequestedBy');
const indentRemarks = document.getElementById('indentRemarks');
const btnSubmitIndent = document.getElementById('btnSubmitIndent');

// DOM Elements - Indents Register & Filters
const indentTableBody = document.getElementById('indentTableBody');
const indentStatusFilter = document.getElementById('indentStatusFilter');
const indentSearchInput = document.getElementById('indentSearchInput');
const indentRefreshBtn = document.getElementById('indentRefreshBtn');

// State Cache
let projectItems = [];
let allIndents = [];
let currentProjectId = null;
let currentUserName = 'Jay';

/**
 * 1. Resolve Active Project Context & User Identity
 */
async function resolveWorkspaceAndSession() {
    let projectId = localStorage.getItem('activeProjectId');
    const projectName = localStorage.getItem('activeProjectName') || '';
    const projectCode = localStorage.getItem('activeProjectCode') || '';

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!projectId || !uuidRegex.test(projectId)) {
        if (client) {
            try {
                let query = client.from('projects').select('id, project_name, project_code');
                if (projectName) {
                    query = query.ilike('project_name', `%${projectName}%`);
                }
                const { data: projects, error } = await query.limit(1);

                if (!error && projects && projects.length > 0) {
                    projectId = projects[0].id;
                    localStorage.setItem('activeProjectId', projectId);
                    localStorage.setItem('activeProjectName', projects[0].project_name || projectName);
                    if (projects[0].project_code) {
                        localStorage.setItem('activeProjectCode', projects[0].project_code);
                    }
                }
            } catch (err) {
                console.warn('[RequestIndent] Project resolution warning:', err);
            }
        }
    }

    currentProjectId = projectId;

    if (activeProjectBadge) {
        const displayName = localStorage.getItem('activeProjectName') || 'Active Project';
        const displayCode = localStorage.getItem('activeProjectCode') || '';
        activeProjectBadge.textContent = displayCode ? `[${displayCode}] ${displayName}` : displayName;
    }

    // Resolve Logged-In User Name
    try {
        const userStr = localStorage.getItem('prayosha_user');
        const userObj = userStr ? JSON.parse(userStr) : null;
        currentUserName = userObj?.full_name 
            || userObj?.displayName 
            || userObj?.user_metadata?.full_name 
            || userObj?.email?.split('@')[0] 
            || localStorage.getItem('userName') 
            || 'Jay';
    } catch {
        currentUserName = 'Jay';
    }

    if (indentRequestedBy) {
        indentRequestedBy.value = currentUserName;
    }

    return currentProjectId;
}

/**
 * 2. Load Project Materials / SKUs into Dropdown
 */
async function loadProjectMaterials() {
    await resolveWorkspaceAndSession();

    if (!client || !currentProjectId || !indentItemSelect) return;

    try {
        const { data: items, error } = await client
            .from('inventory_items')
            .select('id, item_code, item_name, current_stock, unit')
            .eq('project_id', currentProjectId)
            .order('item_name', { ascending: true });

        if (error) throw error;

        projectItems = items || [];

        indentItemSelect.innerHTML = '<option value="">Select Material...</option>';
        projectItems.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.item_name} (${item.item_code}) [${item.unit}]`;
            indentItemSelect.appendChild(opt);
        });

        // Check for pre-fill URL parameters (from Stock Overview 1-click indent action)
        const urlParams = new URLSearchParams(window.location.search);
        const prefillItemId = urlParams.get('item_id');

        if (prefillItemId) {
            const matched = projectItems.find(i => i.id === prefillItemId);
            if (matched) {
                indentItemSelect.value = prefillItemId;
                updateStockIndicator(matched);
            }
        }

    } catch (err) {
        console.error('[RequestIndent] Error loading materials:', err);
    }
}

/**
 * 3. Update Dynamic Live Stock Indicator
 */
function updateStockIndicator(item) {
    if (!indentStockBadge) return;
    if (item) {
        indentStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">${item.current_stock} ${item.unit}</span>`;
    } else {
        indentStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">0</span>`;
    }
}

if (indentItemSelect) {
    indentItemSelect.addEventListener('change', () => {
        const selectedId = indentItemSelect.value;
        const found = projectItems.find(i => i.id === selectedId);
        updateStockIndicator(found);
    });
}

/**
 * 4. Fetch Active Indents Log from Supabase
 */
async function loadIndentsLog() {
    await resolveWorkspaceAndSession();

    if (!client || !currentProjectId || !indentTableBody) return;

    indentTableBody.innerHTML = `
        <tr>
            <td colspan="9" class="py-12 text-center text-slate-400">
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-brand-navy mb-2"></div>
                <p class="text-xs font-semibold">Fetching active material requisitions...</p>
            </td>
        </tr>
    `;

    try {
        const { data: indents, error } = await client
            .from('inventory_indents')
            .select(`
                id,
                indent_code,
                qty_requested,
                phase,
                urgency,
                status,
                requested_by,
                remarks,
                timestamp,
                inventory_items (
                    id,
                    item_code,
                    item_name,
                    unit
                )
            `)
            .eq('project_id', currentProjectId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        allIndents = indents || [];
        renderFilteredIndents();

    } catch (err) {
        console.error('[RequestIndent] Error loading indents:', err);
        indentTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-8 text-center text-red-600 font-semibold text-xs">
                    Failed to load indents: ${err.message || 'Network error'}.
                </td>
            </tr>
        `;
    }
}

/**
 * 5. Format Date Helper (DD/MM/YYYY)
 */
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    } catch {
        return dateStr;
    }
}

/**
 * 6. Render Filtered Indents in Table
 */
function renderFilteredIndents() {
    if (!indentTableBody) return;

    const selectedStatus = indentStatusFilter?.value || '';
    const searchTerm = indentSearchInput?.value.trim().toLowerCase() || '';

    const filtered = allIndents.filter(indent => {
        const matchesStatus = !selectedStatus || indent.status === selectedStatus;
        const itemName = indent.inventory_items?.item_name?.toLowerCase() || '';
        const itemCode = indent.inventory_items?.item_code?.toLowerCase() || '';
        const indentCode = indent.indent_code?.toLowerCase() || '';
        const requester = indent.requested_by?.toLowerCase() || '';

        const matchesSearch = !searchTerm || (
            itemName.includes(searchTerm) ||
            itemCode.includes(searchTerm) ||
            indentCode.includes(searchTerm) ||
            requester.includes(searchTerm)
        );

        return matchesStatus && matchesSearch;
    });

    indentTableBody.innerHTML = '';

    if (filtered.length === 0) {
        indentTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-12 text-center text-slate-400">
                    <div class="text-2xl mb-1">📋</div>
                    <div class="text-xs font-bold text-slate-600">No Material Indents Found</div>
                    <div class="text-[11px] text-slate-400">No requisitions match your current filter selection.</div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(indent => {
        const itemName = indent.inventory_items?.item_name || 'Material Item';
        const unit = indent.inventory_items?.unit || 'units';
        const qty = indent.qty_requested || 0;
        const dateFormatted = formatDate(indent.timestamp);
        const status = indent.status || 'Pending';
        const urgency = indent.urgency || 'Standard';

        // Status Badge Styling
        let statusBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        if (status === 'Approved') {
            statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        } else if (status === 'On Hold') {
            statusBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
        } else if (status === 'Fulfilled') {
            statusBadgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
        }

        // Urgency Badge Styling
        let urgencyBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
        if (urgency === 'Urgent') {
            urgencyBadgeClass = 'bg-orange-50 text-orange-700 border-orange-200';
        } else if (urgency === 'Critical') {
            urgencyBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
        }

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        row.innerHTML = `
            <td class="py-3 px-4 font-bold text-brand-navy">
                ${indent.indent_code || 'IND-RECORD'}
            </td>
            <td class="py-3 px-4 text-[11px] text-slate-500 font-medium">
                ${dateFormatted}
            </td>
            <td class="py-3 px-4 font-bold text-slate-800">
                ${itemName}
            </td>
            <td class="py-3 px-4 text-right font-bold text-brand-navy">
                ${qty} <span class="text-[11px] text-slate-400 font-normal">${unit}</span>
            </td>
            <td class="py-3 px-4 text-slate-600 font-medium">
                ${indent.phase || 'Phase 1'}
            </td>
            <td class="py-3 px-4 text-center">
                <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${urgencyBadgeClass}">
                    ${urgency}
                </span>
            </td>
            <td class="py-3 px-4 text-center">
                <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusBadgeClass}">
                    ${status}
                </span>
            </td>
            <td class="py-3 px-4 text-slate-700 font-medium">
                ${indent.requested_by || 'Site Engineer'}
            </td>
            <td class="py-3 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    <button type="button" 
                            onclick="window.cycleIndentStatus('${indent.id}', '${status}')" 
                            title="Update Approval Status" 
                            class="px-2 py-1 rounded-lg border border-slate-200 hover:border-brand-navy hover:bg-brand-navy hover:text-white text-slate-600 transition text-[10px] font-semibold cursor-pointer">
                        Status
                    </button>
                    <button type="button" 
                            onclick="window.deleteIndent('${indent.id}', '${indent.indent_code}')" 
                            title="Delete Indent" 
                            class="p-1 rounded-lg border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-400 hover:text-red-600 transition cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        `;

        indentTableBody.appendChild(row);
    });
}

/**
 * 7. Quick Status Update Workflow
 */
window.cycleIndentStatus = async function(indentId, currentStatus) {
    if (!indentId) return;

    const statusOptions = ['Pending', 'Approved', 'On Hold', 'Fulfilled'];
    const nextStatus = prompt(`Update status for this requisition.\nEnter one of: ${statusOptions.join(', ')}`, currentStatus);

    if (!nextStatus || !statusOptions.includes(nextStatus)) {
        if (nextStatus) alert(`Invalid status. Please enter: ${statusOptions.join(', ')}`);
        return;
    }

    try {
        const { error } = await client
            .from('inventory_indents')
            .update({ status: nextStatus })
            .eq('id', indentId);

        if (error) throw error;

        await loadIndentsLog();
    } catch (err) {
        alert(`Failed to update status: ${err.message || 'Error occurred.'}`);
    }
};

/**
 * 8. Delete Indent Workflow
 */
window.deleteIndent = async function(indentId, indentCode) {
    if (!indentId) return;
    const confirmed = confirm(`Are you sure you want to delete requisition [${indentCode}]?`);
    if (!confirmed) return;

    try {
        const { error } = await client
            .from('inventory_indents')
            .delete()
            .eq('id', indentId);

        if (error) throw error;

        await loadIndentsLog();
    } catch (err) {
        alert(`Failed to delete indent: ${err.message || 'Error occurred.'}`);
    }
};

/**
 * 9. Handle Indent Form Submission
 */
async function handleIndentSubmit(e) {
    e.preventDefault();

    await resolveWorkspaceAndSession();
    if (!currentProjectId) {
        alert('Please select an active project in the top navigation bar.');
        return;
    }

    const itemId = indentItemSelect.value;
    const qty = parseFloat(indentQty.value) || 0;
    const phase = indentPhase.value;
    const urgency = indentUrgency.value;
    const remarks = indentRemarks.value.trim();

    if (!itemId || qty <= 0 || !phase) {
        alert('Please select a material and enter a valid quantity.');
        return;
    }

    btnSubmitIndent.disabled = true;
    btnSubmitIndent.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-white inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <span>Submitting Requisition...</span>
    `;

    try {
        const indentCode = `IND-${Math.floor(10000 + Math.random() * 90000)}`;

        const payload = {
            project_id: currentProjectId,
            indent_code: indentCode,
            item_id: itemId,
            qty_requested: qty,
            phase: phase,
            urgency: urgency,
            status: 'Pending',
            requested_by: currentUserName,
            remarks: remarks,
            timestamp: new Date().toISOString()
        };

        const { error } = await client
            .from('inventory_indents')
            .insert([payload]);

        if (error) throw error;

        alert(`Material Indent [${indentCode}] successfully raised with status 'Pending'!`);

        // Reset Form & Reload Table
        formIndent.reset();
        indentRequestedBy.value = currentUserName;
        if (indentStockBadge) indentStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">0</span>`;

        await loadIndentsLog();

    } catch (err) {
        console.error('[Indent Error]:', err);
        alert(`Failed to submit indent: ${err.message || 'Error occurred.'}`);
    } finally {
        btnSubmitIndent.disabled = false;
        btnSubmitIndent.innerHTML = `
            <svg class="w-4 h-4 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            <span>Submit Material Indent Requisition</span>
        `;
    }
}

/**
 * 10. Event Listeners & Bootstrapping
 */
if (formIndent) formIndent.addEventListener('submit', handleIndentSubmit);

if (indentStatusFilter) indentStatusFilter.addEventListener('change', renderFilteredIndents);
if (indentSearchInput) indentSearchInput.addEventListener('input', renderFilteredIndents);
if (indentRefreshBtn) indentRefreshBtn.addEventListener('click', loadIndentsLog);

// Re-load on workspace switch
window.addEventListener('projectChanged', async () => {
    await resolveWorkspaceAndSession();
    await loadProjectMaterials();
    await loadIndentsLog();
});

// Initial Bootstrap on Page Load
document.addEventListener('DOMContentLoaded', async () => {
    await resolveWorkspaceAndSession();
    await loadProjectMaterials();
    await loadIndentsLog();
});