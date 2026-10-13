/**
 * Prayosha ERP - Log Transaction Controller
 * File: /inventory/log-transaction.js
 * 
 * Features:
 * 1. Dual Mode Toggle: Seamless switching between INWARD (Receive) and OUTWARD (Issue).
 * 2. Real-Time Project SKU Lookup: Dynamically loads materials with UUID-safe project queries.
 * 3. Dynamic Vendor & Agency Master Integration:
 *    - Inward: Populates Material Suppliers with live Vendor Code & GSTIN inspection.
 *    - Outward: Populates Sub-Contractors & Agencies with classification badges.
 * 4. Inward Receipt Execution:
 *    - Records Delivery Challan Number and Tax Invoice Number.
 *    - Uploads document proof directly to Cloudflare R2 bucket.
 *    - Automatically increments `current_stock` in `inventory_items`.
 * 5. Outward Issue Execution:
 *    - Links material issues to Sub-Contractors, Towers, Floors, and Granular Zone IDs.
 *    - Verifies available on-site balances to prevent accidental deficits.
 *    - Automatically deducts `current_stock` and increments `consumed_till_date`.
 * 6. Automatic User & Date Attribution: Auto-populates logged-in user credentials and current date.
 */

import { supabase, uploadToR2 } from '../config.js';

// Central Supabase Client
const client = supabase || window.supabaseClient;

// Standard RFC4122 UUID Regular Expression
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
const inwardSupplierSelect = document.getElementById('inwardSupplierSelect');
const inwardSupplier = document.getElementById('inwardSupplier');
const inwardSupplierMeta = document.getElementById('inwardSupplierMeta');
const inwardSupplierCode = document.getElementById('inwardSupplierCode');
const inwardSupplierGstin = document.getElementById('inwardSupplierGstin');
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
const outwardAgencySelect = document.getElementById('outwardAgencySelect');
const outwardAgency = document.getElementById('outwardAgency');
const outwardAgencyMeta = document.getElementById('outwardAgencyMeta');
const outwardAgencyCode = document.getElementById('outwardAgencyCode');
const outwardAgencyCategory = document.getElementById('outwardAgencyCategory');
const outwardDate = document.getElementById('outwardDate');
const outwardTowerSelect = document.getElementById('outwardTowerSelect');
const outwardFloorSelect = document.getElementById('outwardFloorSelect');
const outwardZonesInput = document.getElementById('outwardZonesInput');
const outwardTaskCategory = document.getElementById('outwardTaskCategory');
const outwardHandledBy = document.getElementById('outwardHandledBy');
const outwardRemarks = document.getElementById('outwardRemarks');
const btnSaveOutward = document.getElementById('btnSaveOutward');

// In-Memory State & SKU Cache
let projectItems = [];
let cachedVendors = [];
let currentProjectId = null;
let currentUserName = 'Engineer';

/**
 * 1. Resolve Active Workspace & User Session (With Strict UUID Validation)
 */
async function resolveWorkspaceAndSession() {
    let projectId = localStorage.getItem('activeProjectId');
    const projectName = localStorage.getItem('activeProjectName') || '';

    // If activeProjectId is null, empty, or an invalid UUID (e.g. "All Projects")
    if (!projectId || !UUID_REGEX.test(projectId)) {
        if (client) {
            try {
                let query = client.from('projects').select('id, project_name, project_code');

                // If user stored a real project name (and not a generic label)
                if (projectName && projectName !== 'All Projects' && projectName !== 'Select Site Project') {
                    query = query.ilike('project_name', `%${projectName}%`);
                }

                let { data: projects, error } = await query.limit(1);

                // Fallback: If no matching name, fetch first project in system
                if ((error || !projects || projects.length === 0) && client) {
                    const fallback = await client.from('projects').select('id, project_name, project_code').limit(1);
                    projects = fallback.data;
                    error = fallback.error;
                }

                if (!error && projects && projects.length > 0 && UUID_REGEX.test(projects[0].id)) {
                    projectId = projects[0].id;
                    localStorage.setItem('activeProjectId', projectId);
                    localStorage.setItem('activeProjectName', projects[0].project_name || projectName);
                    if (projects[0].project_code) {
                        localStorage.setItem('activeProjectCode', projects[0].project_code);
                    }
                } else {
                    projectId = null;
                }
            } catch (err) {
                console.warn('[LogTransaction] Project resolution fallback notice:', err);
                projectId = null;
            }
        } else {
            projectId = null;
        }
    }

    currentProjectId = (projectId && UUID_REGEX.test(projectId)) ? projectId : null;

    if (activeProjectBadge) {
        const displayName = localStorage.getItem('activeProjectName') || (currentProjectId ? 'Active Project' : 'All Sites');
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
 * 2. Load Project Materials / SKUs into Dropdowns (UUID-Guarded)
 */
async function loadProjectMaterials() {
    await resolveWorkspaceAndSession();

    if (!client) return;

    try {
        let query = client
            .from('inventory_items')
            .select('id, item_code, item_name, current_stock, unit, rate, project_id');

        // Strictly apply filter ONLY when currentProjectId is a valid 36-char UUID
        if (currentProjectId && UUID_REGEX.test(currentProjectId)) {
            query = query.eq('project_id', currentProjectId);
        }

        const { data: items, error } = await query.order('item_name', { ascending: true });

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
 * 3. Dynamic Vendor & Agency Master Integration
 */
async function loadVendorsAndAgencies() {
    if (!client) return;

    try {
        const { data: vendors, error } = await client
            .from('vendors')
            .select('id, vendor_code, name, trade_name, category, gstin, status')
            .order('name', { ascending: true });

        if (error) throw error;

        cachedVendors = vendors || [];

        // --- POPULATE INWARD SUPPLIERS ---
        if (inwardSupplierSelect) {
            inwardSupplierSelect.innerHTML = '<option value="">Select Material Supplier...</option>';

            const suppliers = cachedVendors.filter(v => v.category === 'Material Supplier');
            const otherVendors = cachedVendors.filter(v => v.category !== 'Material Supplier');

            if (suppliers.length > 0) {
                const groupSuppliers = document.createElement('optgroup');
                groupSuppliers.label = 'Material Suppliers';
                suppliers.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    const codeSuffix = v.vendor_code ? ` [${v.vendor_code}]` : '';
                    opt.textContent = `${v.name}${codeSuffix}`;
                    if (v.status === 'Blacklisted') opt.disabled = true;
                    groupSuppliers.appendChild(opt);
                });
                inwardSupplierSelect.appendChild(groupSuppliers);
            }

            if (otherVendors.length > 0) {
                const groupOthers = document.createElement('optgroup');
                groupOthers.label = 'Other Agencies & Vendors';
                otherVendors.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    const codeSuffix = v.vendor_code ? ` [${v.vendor_code}]` : '';
                    opt.textContent = `${v.name} (${v.category})${codeSuffix}`;
                    if (v.status === 'Blacklisted') opt.disabled = true;
                    groupOthers.appendChild(opt);
                });
                inwardSupplierSelect.appendChild(groupOthers);
            }
        }

        // --- POPULATE OUTWARD CONTRACTORS / AGENCIES ---
        if (outwardAgencySelect) {
            outwardAgencySelect.innerHTML = '<option value="">Select Sub-Contractor / Agency...</option>';

            const contractors = cachedVendors.filter(v => v.category === 'Labor Contractor' || v.category === 'Equipment Rental');
            const otherAgencies = cachedVendors.filter(v => v.category !== 'Labor Contractor' && v.category !== 'Equipment Rental');

            if (contractors.length > 0) {
                const groupContractors = document.createElement('optgroup');
                groupContractors.label = 'Labor Contractors & Rental Agencies';
                contractors.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    const codeSuffix = v.vendor_code ? ` [${v.vendor_code}]` : '';
                    opt.textContent = `${v.name} (${v.category})${codeSuffix}`;
                    if (v.status === 'Blacklisted') opt.disabled = true;
                    groupContractors.appendChild(opt);
                });
                outwardAgencySelect.appendChild(groupContractors);
            }

            if (otherAgencies.length > 0) {
                const groupAgencies = document.createElement('optgroup');
                groupAgencies.label = 'All Registered Vendors / Suppliers';
                otherAgencies.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    const codeSuffix = v.vendor_code ? ` [${v.vendor_code}]` : '';
                    opt.textContent = `${v.name} (${v.category})${codeSuffix}`;
                    if (v.status === 'Blacklisted') opt.disabled = true;
                    groupAgencies.appendChild(opt);
                });
                outwardAgencySelect.appendChild(groupAgencies);
            }
        }

    } catch (err) {
        console.error('[LogTransaction] Failed to load vendors & agencies:', err);
    }
}

// Inward Supplier Change Handler
if (inwardSupplierSelect) {
    inwardSupplierSelect.addEventListener('change', () => {
        const selectedId = inwardSupplierSelect.value;
        const vendor = cachedVendors.find(v => v.id === selectedId);

        if (vendor) {
            inwardSupplier.value = vendor.name;
            if (inwardSupplierCode) inwardSupplierCode.textContent = vendor.vendor_code || 'VEND';
            if (inwardSupplierGstin) inwardSupplierGstin.textContent = vendor.gstin ? `GST: ${vendor.gstin}` : 'GST: Unregistered';
            if (inwardSupplierMeta) inwardSupplierMeta.classList.remove('hidden');
        } else {
            inwardSupplier.value = '';
            if (inwardSupplierMeta) inwardSupplierMeta.classList.add('hidden');
        }
    });
}

// Outward Agency Change Handler
if (outwardAgencySelect) {
    outwardAgencySelect.addEventListener('change', () => {
        const selectedId = outwardAgencySelect.value;
        const agency = cachedVendors.find(v => v.id === selectedId);

        if (agency) {
            outwardAgency.value = agency.name;
            if (outwardAgencyCode) outwardAgencyCode.textContent = agency.vendor_code || 'AG';
            if (outwardAgencyCategory) outwardAgencyCategory.textContent = agency.category || 'Contractor';
            if (outwardAgencyMeta) outwardAgencyMeta.classList.remove('hidden');
        } else {
            outwardAgency.value = '';
            if (outwardAgencyMeta) outwardAgencyMeta.classList.add('hidden');
        }
    });
}

/**
 * 4. Mode Toggling Logic (Inward vs Outward)
 */
function setMode(mode) {
    if (mode === 'inward') {
        btnToggleInward.className = 'py-3 px-5 rounded-2xl border-2 border-brand-emerald bg-emerald-50 text-brand-emerald font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm cursor-pointer';
        btnToggleOutward.className = 'py-3 px-5 rounded-2xl border-2 border-transparent bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center gap-2 transition hover:bg-slate-200 cursor-pointer';

        formInward.classList.remove('hidden');
        formOutward.classList.add('hidden');

        activeModeLabel.textContent = 'Mode: Material Inward Receipt';
        activeModeLabel.className = 'text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200';
    } else {
        btnToggleOutward.className = 'py-3 px-5 rounded-2xl border-2 border-brand-navy bg-slate-100 text-brand-navy font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm cursor-pointer';
        btnToggleInward.className = 'py-3 px-5 rounded-2xl border-2 border-transparent bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center gap-2 transition hover:bg-slate-200 cursor-pointer';

        formOutward.classList.remove('hidden');
        formInward.classList.add('hidden');

        activeModeLabel.textContent = 'Mode: Site Material Outward Issue';
        activeModeLabel.className = 'text-xs font-semibold text-brand-navy bg-brand-navy/10 px-2.5 py-1 rounded-lg border border-brand-navy/20';
    }
}

/**
 * 5. Real-Time Stock Indicators on SKU Selection
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
 * 6. Handle Inward Form Submission (Receive Goods)
 */
async function handleInwardSubmit(e) {
    e.preventDefault();

    await resolveWorkspaceAndSession();

    const itemId = inwardItemSelect.value;
    const qtyReceived = parseFloat(inwardQty.value) || 0;
    const supplier = (inwardSupplier.value || inwardSupplierSelect.options[inwardSupplierSelect.selectedIndex]?.text || '').trim();
    const receiptDate = inwardDate.value;
    const challanNo = inwardChallanNo.value.trim();
    const invoiceNo = inwardInvoiceNo.value.trim();
    const remarks = inwardRemarks.value.trim();
    const file = inwardInvoiceFile.files[0];

    if (!itemId || qtyReceived <= 0 || !supplier || !challanNo || !invoiceNo) {
        alert('Please complete all required fields (*)');
        return;
    }

    const itemRecord = projectItems.find(i => i.id === itemId);
    const targetProjectId = (currentProjectId && UUID_REGEX.test(currentProjectId)) 
        ? currentProjectId 
        : (itemRecord?.project_id && UUID_REGEX.test(itemRecord.project_id) ? itemRecord.project_id : null);

    if (!targetProjectId) {
        alert('Please select a specific Site Project from the navigation top bar before recording a receipt.');
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
            project_id: targetProjectId,
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
        inwardSupplier.value = '';
        if (inwardSupplierMeta) inwardSupplierMeta.classList.add('hidden');
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
 * 7. Handle Outward Form Submission (Issue Goods to Site)
 */
async function handleOutwardSubmit(e) {
    e.preventDefault();

    await resolveWorkspaceAndSession();

    const itemId = outwardItemSelect.value;
    const qtyToIssue = parseFloat(outwardQty.value) || 0;
    const agency = (outwardAgency.value || outwardAgencySelect.options[outwardAgencySelect.selectedIndex]?.text || '').trim();
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

    const itemRecord = projectItems.find(i => i.id === itemId);
    const targetProjectId = (currentProjectId && UUID_REGEX.test(currentProjectId)) 
        ? currentProjectId 
        : (itemRecord?.project_id && UUID_REGEX.test(itemRecord.project_id) ? itemRecord.project_id : null);

    if (!targetProjectId) {
        alert('Please select a specific Site Project from the navigation top bar before issuing materials.');
        return;
    }

    // Split Zones into Array
    const zoneIds = rawZones.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    // Balance Verification
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
            project_id: targetProjectId,
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
        outwardAgency.value = '';
        if (outwardAgencyMeta) outwardAgencyMeta.classList.add('hidden');
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
 * 8. Event Listeners & Bootstrapping
 */
if (btnToggleInward) btnToggleInward.addEventListener('click', () => setMode('inward'));
if (btnToggleOutward) btnToggleOutward.addEventListener('click', () => setMode('outward'));

if (formInward) formInward.addEventListener('submit', handleInwardSubmit);
if (formOutward) formOutward.addEventListener('submit', handleOutwardSubmit);

// Re-load on workspace switch
window.addEventListener('projectChanged', () => {
    loadProjectMaterials();
    loadVendorsAndAgencies();
});

// Initial Bootstrap on Page Load
document.addEventListener('DOMContentLoaded', () => {
    setMode('inward');
    loadProjectMaterials();
    loadVendorsAndAgencies();
});