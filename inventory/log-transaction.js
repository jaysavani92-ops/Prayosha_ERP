/**
 * Prayosha ERP - Log Transaction Controller
 * File: /inventory/log-transaction.js
 * 
 * Features:
 * 1. Dual Mode Toggle: Seamless switching between INWARD (Receive) and OUTWARD (Issue).
 * 2. Real-Time Project SKU Lookup: Dynamically loads materials for the active workspace.
 * 3. Inward Receipt Execution:
 *    - Records Delivery Challan Number and Tax Invoice Number.
 *    - Uploads document proof directly to Cloudflare R2 bucket.
 *    - Automatically increments `current_stock` in `inventory_items`.
 * 4. Outward Issue Execution:
 *    - Links material issues to Sub-Contractors, Towers, Floors, and Granular Zone IDs.
 *    - Verifies available on-site balances to prevent accidental deficits.
 *    - Automatically deducts `current_stock` and increments `consumed_till_date`.
 * 5. Automatic User & Date Attribution: Auto-populates logged-in user credentials and current date.
 */

import { supabase, uploadToR2 } from '../config.js';

// Central Supabase Client
const client = supabase || window.supabaseClient;

// DOM Elements - Mode Switcher & Workspace Badges
const btnToggleInward = document.getElementById('btnToggleInward');
const btnToggleOutward = document.getElementById('btnToggleOutward');
const activeModeLabel = document.getElementById('activeModeLabel');
const activeProjectBadge = document.getElementById('activeProjectBadge');

const formInward = document.getElementById('formInward');
const formOutward = document.getElementById('formOutward');

// DOM Elements - Inward Form
const inwardItemSelect = document.getElementById('inwardItemSelect');
const inwardStockBadge = document.getElementById('inwardStockBadge');
const inwardQty = document.getElementById('inwardQty');
const inwardSupplier = document.getElementById('inwardSupplier');
const inwardDate = document.getElementById('inwardDate');
const inwardChallanNo = document.getElementById('inwardChallanNo');
const inwardInvoiceNo = document.getElementById('inwardInvoiceNo');
const inwardInvoiceFile = document.getElementById('inwardInvoiceFile');
const inwardFileStatus = document.getElementById('inwardFileStatus');
const inwardHandledBy = document.getElementById('inwardHandledBy');
const inwardRemarks = document.getElementById('inwardRemarks');
const btnSaveInward = document.getElementById('btnSaveInward');

// DOM Elements - Outward Form
const outwardItemSelect = document.getElementById('outwardItemSelect');
const outwardStockBadge = document.getElementById('outwardStockBadge');
const outwardQty = document.getElementById('outwardQty');
const outwardAgency = document.getElementById('outwardAgency');
const outwardDate = document.getElementById('outwardDate');
const outwardTowerSelect = document.getElementById('outwardTowerSelect');
const outwardFloorSelect = document.getElementById('outwardFloorSelect');
const outwardZonesInput = document.getElementById('outwardZonesInput');
const outwardTaskCategory = document.getElementById('outwardTaskCategory');
const outwardHandledBy = document.getElementById('outwardHandledBy');
const outwardRemarks = document.getElementById('outwardRemarks');
const btnSaveOutward = document.getElementById('btnSaveOutward');

// In-Memory SKU Cache & Active Session State
let projectItems = [];
let currentProjectId = null;
let currentUserName = 'Engineer';

/**
 * 1. Resolve Active Workspace & User Session
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
                console.warn('[LogTransaction] Project resolution warning:', err);
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

    // Pre-fill Handled By fields
    if (inwardHandledBy) inwardHandledBy.value = currentUserName;
    if (outwardHandledBy) outwardHandledBy.value = currentUserName;

    // Set Today's Date
    const today = new Date().toISOString().split('T')[0];
    if (inwardDate && !inwardDate.value) inwardDate.value = today;
    if (outwardDate && !outwardDate.value) outwardDate.value = today;

    return currentProjectId;
}

/**
 * 2. Load Project Materials / SKUs into Dropdowns
 */
async function loadProjectMaterials() {
    await resolveWorkspaceAndSession();

    if (!client || !currentProjectId) return;

    try {
        const { data: items, error } = await client
            .from('inventory_items')
            .select('id, item_code, item_name, current_stock, unit, rate')
            .eq('project_id', currentProjectId)
            .order('item_name', { ascending: true });

        if (error) throw error;

        projectItems = items || [];

        // Populate Inward Select
        if (inwardItemSelect) {
            inwardItemSelect.innerHTML = '<option value="">Select Material...</option>';
            projectItems.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = `${item.item_name} (${item.item_code}) [${item.unit}]`;
                inwardItemSelect.appendChild(opt);
            });
        }

        // Populate Outward Select
        if (outwardItemSelect) {
            outwardItemSelect.innerHTML = '<option value="">Select Material...</option>';
            projectItems.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = `${item.item_name} (${item.item_code}) - Stock: ${item.current_stock} ${item.unit}`;
                outwardItemSelect.appendChild(opt);
            });
        }

    } catch (err) {
        console.error('[LogTransaction] Failed to load project materials:', err);
    }
}

/**
 * 3. Mode Toggling Logic (Inward vs Outward)
 */
function setMode(mode) {
    if (mode === 'inward') {
        // Button Styles
        btnToggleInward.className = 'py-3 px-5 rounded-2xl border-2 border-brand-emerald bg-emerald-50 text-brand-emerald font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm cursor-pointer';
        btnToggleOutward.className = 'py-3 px-5 rounded-2xl border-2 border-transparent bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center gap-2 transition hover:bg-slate-200 cursor-pointer';

        // Visibility
        formInward.classList.remove('hidden');
        formOutward.classList.add('hidden');

        // Label
        activeModeLabel.textContent = 'Mode: Material Inward Receipt';
        activeModeLabel.className = 'text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200';
    } else {
        // Button Styles
        btnToggleOutward.className = 'py-3 px-5 rounded-2xl border-2 border-brand-navy bg-slate-100 text-brand-navy font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm cursor-pointer';
        btnToggleInward.className = 'py-3 px-5 rounded-2xl border-2 border-transparent bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center gap-2 transition hover:bg-slate-200 cursor-pointer';

        // Visibility
        formOutward.classList.remove('hidden');
        formInward.classList.add('hidden');

        // Label
        activeModeLabel.textContent = 'Mode: Site Material Outward Issue';
        activeModeLabel.className = 'text-xs font-semibold text-brand-navy bg-brand-navy/10 px-2.5 py-1 rounded-lg border border-brand-navy/20';
    }
}

/**
 * 4. Real-Time Stock Indicators on SKU Selection
 */
if (inwardItemSelect) {
    inwardItemSelect.addEventListener('change', () => {
        const selectedId = inwardItemSelect.value;
        const found = projectItems.find(i => i.id === selectedId);
        if (found && inwardStockBadge) {
            inwardStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">${found.current_stock} ${found.unit}</span>`;
        } else if (inwardStockBadge) {
            inwardStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">0</span>`;
        }
    });
}

if (outwardItemSelect) {
    outwardItemSelect.addEventListener('change', () => {
        const selectedId = outwardItemSelect.value;
        const found = projectItems.find(i => i.id === selectedId);
        if (found && outwardStockBadge) {
            outwardStockBadge.innerHTML = `Available Stock: <span class="font-bold text-brand-emerald">${found.current_stock} ${found.unit}</span>`;
        } else if (outwardStockBadge) {
            outwardStockBadge.innerHTML = `Available Stock: <span class="font-bold text-brand-emerald">0</span>`;
        }
    });
}

/**
 * 5. Handle Inward Form Submission (Receive Goods)
 */
async function handleInwardSubmit(e) {
    e.preventDefault();

    await resolveWorkspaceAndSession();
    if (!currentProjectId) {
        alert('Active project context not detected. Please choose a project in the navigation.');
        return;
    }

    const itemId = inwardItemSelect.value;
    const qtyReceived = parseFloat(inwardQty.value) || 0;
    const supplier = inwardSupplier.value.trim();
    const receiptDate = inwardDate.value;
    const challanNo = inwardChallanNo.value.trim();
    const invoiceNo = inwardInvoiceNo.value.trim();
    const remarks = inwardRemarks.value.trim();
    const file = inwardInvoiceFile.files[0];

    if (!itemId || qtyReceived <= 0 || !supplier || !challanNo || !invoiceNo) {
        alert('Please complete all required fields (*)');
        return;
    }

    // Lock Submit Button
    btnSaveInward.disabled = true;
    btnSaveInward.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-white inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <span>Uploading & Recording Receipt...</span>
    `;

    try {
        let invoicePhotoUrl = null;

        // Upload Document to Cloudflare R2 if present
        if (file) {
            if (inwardFileStatus) inwardFileStatus.textContent = 'Uploading to Cloudflare R2...';
            invoicePhotoUrl = await uploadToR2(file, 'inventory/inward_invoices');
            if (inwardFileStatus) inwardFileStatus.textContent = 'Uploaded successfully!';
        }

        // Generate Sequential Receipt Code
        const receiptCode = `REC-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Insert Inward Receipt Record
        const receiptPayload = {
            project_id: currentProjectId,
            receipt_code: receiptCode,
            item_id: itemId,
            qty_received: qtyReceived,
            supplier_name: supplier,
            challan_no: challanNo,
            invoice_no: invoiceNo,
            invoice_photo_url: invoicePhotoUrl,
            received_by: currentUserName,
            remarks: remarks,
            timestamp: new Date(receiptDate).toISOString()
        };

        const { error: insertError } = await client
            .from('inventory_receipts')
            .insert([receiptPayload]);

        if (insertError) throw insertError;

        // 2. Increment Stock Level in Master Register
        const itemRecord = projectItems.find(i => i.id === itemId);
        const currentStock = Number(itemRecord?.current_stock) || 0;
        const newStock = currentStock + qtyReceived;

        const { error: updateError } = await client
            .from('inventory_items')
            .update({
                current_stock: newStock,
                last_updated: new Date().toISOString()
            })
            .eq('id', itemId);

        if (updateError) throw updateError;

        alert(`Inward Transaction [${receiptCode}] recorded successfully! Stock increased to ${newStock}.`);

        // Reset Form & Reload Materials
        formInward.reset();
        inwardHandledBy.value = currentUserName;
        inwardDate.value = new Date().toISOString().split('T')[0];
        if (inwardFileStatus) inwardFileStatus.textContent = 'Optional camera proof or PDF receipt';
        await loadProjectMaterials();

    } catch (err) {
        console.error('[Inward Error]:', err);
        alert(`Failed to save inward receipt: ${err.message || 'Error occurred.'}`);
    } finally {
        btnSaveInward.disabled = false;
        btnSaveInward.innerHTML = `
            <svg class="w-4 h-4 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            <span>Save Inward Transaction & Increase Stock</span>
        `;
    }
}

/**
 * 6. Handle Outward Form Submission (Issue Goods to Site)
 */
async function handleOutwardSubmit(e) {
    e.preventDefault();

    await resolveWorkspaceAndSession();
    if (!currentProjectId) {
        alert('Active project context not detected. Please choose a project in the navigation.');
        return;
    }

    const itemId = outwardItemSelect.value;
    const qtyToIssue = parseFloat(outwardQty.value) || 0;
    const agency = outwardAgency.value.trim();
    const issueDate = outwardDate.value;
    const tower = outwardTowerSelect.value;
    const floor = outwardFloorSelect.value;
    const rawZones = outwardZonesInput.value.trim();
    const taskCategory = outwardTaskCategory.value;
    const remarks = outwardRemarks.value.trim();

    if (!itemId || qtyToIssue <= 0 || !agency || !rawZones) {
        alert('Please complete all required fields (*)');
        return;
    }

    // Split Zones into Array
    const zoneIds = rawZones.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    // Balance Verification
    const itemRecord = projectItems.find(i => i.id === itemId);
    const availableStock = Number(itemRecord?.current_stock) || 0;
    const currentConsumed = Number(itemRecord?.consumed_till_date) || 0;

    if (qtyToIssue > availableStock) {
        const proceed = confirm(`Warning: Quantity to issue (${qtyToIssue}) exceeds available stock (${availableStock}). Proceeding will drive the stock count negative. Do you want to proceed?`);
        if (!proceed) return;
    }

    // Lock Submit Button
    btnSaveOutward.disabled = true;
    btnSaveOutward.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-white inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <span>Processing Issue & Deducting Stock...</span>
    `;

    try {
        const issueCode = `ISS-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Insert Outward Issue Record
        const issuePayload = {
            project_id: currentProjectId,
            issue_code: issueCode,
            item_id: itemId,
            qty_issued: qtyToIssue,
            issued_to_agency: agency,
            issued_by: currentUserName,
            tower_name: tower,
            floor_name: floor,
            zone_ids: zoneIds,
            task_category: taskCategory,
            remarks: remarks,
            timestamp: new Date(issueDate).toISOString()
        };

        const { error: insertError } = await client
            .from('inventory_issues')
            .insert([issuePayload]);

        if (insertError) throw insertError;

        // 2. Deduct Stock & Increment Consumed Quantity
        const newStock = availableStock - qtyToIssue;
        const newConsumed = currentConsumed + qtyToIssue;

        const { error: updateError } = await client
            .from('inventory_items')
            .update({
                current_stock: newStock,
                consumed_till_date: newConsumed,
                last_updated: new Date().toISOString()
            })
            .eq('id', itemId);

        if (updateError) throw updateError;

        alert(`Outward Issue [${issueCode}] saved! Remaining stock: ${newStock}.`);

        // Reset Form & Reload Materials
        formOutward.reset();
        outwardHandledBy.value = currentUserName;
        outwardDate.value = new Date().toISOString().split('T')[0];
        await loadProjectMaterials();

    } catch (err) {
        console.error('[Outward Error]:', err);
        alert(`Failed to save outward issue: ${err.message || 'Error occurred.'}`);
    } finally {
        btnSaveOutward.disabled = false;
        btnSaveOutward.innerHTML = `
            <svg class="w-4 h-4 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            <span>Save Outward Transaction & Deduct Stock</span>
        `;
    }
}

/**
 * 7. Event Listeners & Bootstrapping
 */
if (btnToggleInward) btnToggleInward.addEventListener('click', () => setMode('inward'));
if (btnToggleOutward) btnToggleOutward.addEventListener('click', () => setMode('outward'));

if (formInward) formInward.addEventListener('submit', handleInwardSubmit);
if (formOutward) formOutward.addEventListener('submit', handleOutwardSubmit);

// Re-load on workspace switch
window.addEventListener('projectChanged', () => {
    loadProjectMaterials();
});

// Initial Bootstrap on Page Load
document.addEventListener('DOMContentLoaded', () => {
    setMode('inward');
    loadProjectMaterials();
});