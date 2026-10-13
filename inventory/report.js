/**
 * Prayosha ERP - Material Discrepancy & Returns Controller
 * File: /inventory/report.js
 * 
 * Features:
 * 1. 3-Button Sub-Type Mode Controller:
 *    - Report Damage: Permanent deduction from live stock register with hazard/damage notes.
 *    - Report Material Shortage: Discrepancy log between vendor invoice count and physical count.
 *    - Report Return: Deducts items returned to supplier/vendor or re-routed from central site stores.
 * 2. Smart Inward Purchase Linkage:
 *    - Automatically queries the last 3 purchase receipts from `inventory_receipts` for the chosen SKU.
 *    - Renders clickable chips showing Challan, Invoice, Vendor, and Receipt Date.
 *    - Auto-fills Challan and Invoice fields upon click, while maintaining manual input flexibility.
 * 3. Stock Register Synchronization: Automatically updates `current_stock` and records audit entries.
 * 4. Audit Log Register: Displays historical damage and return records with filtering and delete capabilities.
 */

import { supabase } from '../config.js';

// Central Supabase Client
const client = supabase || window.supabaseClient;

// DOM Elements - Mode Switcher Buttons
const btnTypeDamage = document.getElementById('btnTypeDamage');
const btnTypeShortage = document.getElementById('btnTypeShortage');
const btnTypeReturn = document.getElementById('btnTypeReturn');

const reportNoticeBanner = document.getElementById('reportNoticeBanner');
const reportNoticeText = document.getElementById('reportNoticeText');
const modePill = document.getElementById('modePill');
const activeProjectBadge = document.getElementById('activeProjectBadge');

// DOM Elements - Form Fields
const formReport = document.getElementById('formReport');
const reportTypeHidden = document.getElementById('reportTypeHidden');
const reportItemSelect = document.getElementById('reportItemSelect');
const reportStockBadge = document.getElementById('reportStockBadge');
const recentPurchasesSection = document.getElementById('recentPurchasesSection');
const recentPurchasesChips = document.getElementById('recentPurchasesChips');
const reportChallanNo = document.getElementById('reportChallanNo');
const reportInvoiceNo = document.getElementById('reportInvoiceNo');
const reportQty = document.getElementById('reportQty');
const reportHandledBy = document.getElementById('reportHandledBy');
const reportReason = document.getElementById('reportReason');
const btnSubmitReport = document.getElementById('btnSubmitReport');
const btnSubmitReportText = document.getElementById('btnSubmitReportText');

// DOM Elements - History Table & Filters
const reportFilterType = document.getElementById('reportFilterType');
const reportRefreshBtn = document.getElementById('reportRefreshBtn');
const reportTableBody = document.getElementById('reportTableBody');

// State Cache
let projectItems = [];
let allReports = [];
let currentProjectId = null;
let currentUserName = 'Jay';
let activeReportType = 'damage'; // 'damage' | 'shortage' | 'return'

/**
 * 1. Resolve Active Project Context & Session
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
                console.warn('[Report] Project resolution warning:', err);
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

    if (reportHandledBy) {
        reportHandledBy.value = currentUserName;
    }

    return currentProjectId;
}

/**
 * 2. Mode Configuration & Switching (Damage / Shortage / Return)
 */
function setReportMode(type) {
    activeReportType = type;
    if (reportTypeHidden) reportTypeHidden.value = type;

    // Reset base button styles
    const baseClass = 'py-3 px-4 rounded-2xl border-2 border-transparent bg-slate-100 text-slate-600 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:bg-slate-200 cursor-pointer';
    btnTypeDamage.className = baseClass;
    btnTypeShortage.className = baseClass;
    btnTypeReturn.className = baseClass;

    if (type === 'damage') {
        btnTypeDamage.className = 'py-3 px-4 rounded-2xl border-2 border-brand-rose bg-rose-50 text-brand-rose font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-sm cursor-pointer';
        
        reportNoticeBanner.className = 'max-w-3xl mx-auto rounded-xl p-3 mb-6 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2.5';
        reportNoticeText.innerHTML = '<strong>Notice:</strong> Submitting a Damage Report will permanently deduct the quantity from the Live Stock Register.';
        
        modePill.textContent = 'Mode: Report On-Site Damage';
        modePill.className = 'text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200';

        btnSubmitReport.className = 'w-full py-3 rounded-xl bg-brand-rose hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm transition shadow-md shadow-brand-rose/20 flex items-center justify-center gap-2 cursor-pointer';
        btnSubmitReportText.textContent = 'Submit Report & Deduct Stock';

    } else if (type === 'shortage') {
        btnTypeShortage.className = 'py-3 px-4 rounded-2xl border-2 border-amber-500 bg-amber-50 text-amber-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-sm cursor-pointer';
        
        reportNoticeBanner.className = 'max-w-3xl mx-auto rounded-xl p-3 mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2.5';
        reportNoticeText.innerHTML = '<strong>Notice:</strong> Material Shortage logs variances where the received physical goods were less than the billed challan/invoice count.';
        
        modePill.textContent = 'Mode: Report Material Shortage';
        modePill.className = 'text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200';

        btnSubmitReport.className = 'w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs sm:text-sm transition shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer';
        btnSubmitReportText.textContent = 'Submit Shortage Discrepancy Log';

    } else if (type === 'return') {
        btnTypeReturn.className = 'py-3 px-4 rounded-2xl border-2 border-indigo-500 bg-indigo-50 text-indigo-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-sm cursor-pointer';
        
        reportNoticeBanner.className = 'max-w-3xl mx-auto rounded-xl p-3 mb-6 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium flex items-center gap-2.5';
        reportNoticeText.innerHTML = '<strong>Notice:</strong> Material Return logs goods sent back to vendor or de-allocated from site, automatically deducting from the Central Store balance.';
        
        modePill.textContent = 'Mode: Report Material Return';
        modePill.className = 'text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200';

        btnSubmitReport.className = 'w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm transition shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer';
        btnSubmitReportText.textContent = 'Submit Return & Deduct Stock';
    }

    // Refresh last purchases chips for current selection if SKU is selected
    if (reportItemSelect && reportItemSelect.value) {
        fetchLastThreePurchases(reportItemSelect.value);
    }
}

/**
 * 3. Load Project Materials / SKUs into Dropdown
 */
async function loadProjectMaterials() {
    await resolveWorkspaceAndSession();

    if (!client || !currentProjectId || !reportItemSelect) return;

    try {
        const { data: items, error } = await client
            .from('inventory_items')
            .select('id, item_code, item_name, current_stock, unit')
            .eq('project_id', currentProjectId)
            .order('item_name', { ascending: true });

        if (error) throw error;

        projectItems = items || [];

        reportItemSelect.innerHTML = '<option value="">Select Material...</option>';
        projectItems.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = `${item.item_name} (${item.item_code}) [${item.unit}]`;
            reportItemSelect.appendChild(opt);
        });

    } catch (err) {
        console.error('[Report] Error loading materials:', err);
    }
}

/**
 * 4. Fetch Last 3 Purchases for Selected Item & Render Quick-Pick Chips
 */
async function fetchLastThreePurchases(itemId) {
    if (!recentPurchasesSection || !recentPurchasesChips) return;

    if (!itemId) {
        recentPurchasesSection.classList.add('hidden');
        recentPurchasesChips.innerHTML = '';
        return;
    }

    recentPurchasesSection.classList.remove('hidden');
    recentPurchasesChips.innerHTML = `
        <div class="text-[11px] text-slate-400 italic flex items-center gap-1.5 py-1">
            <span class="inline-block animate-spin h-3.5 w-3.5 border-b-2 border-brand-navy rounded-full"></span>
            <span>Fetching recent purchase receipts...</span>
        </div>
    `;

    try {
        const { data: receipts, error } = await client
            .from('inventory_receipts')
            .select('id, receipt_code, challan_no, invoice_no, supplier_name, qty_received, timestamp')
            .eq('project_id', currentProjectId)
            .eq('item_id', itemId)
            .order('timestamp', { ascending: false })
            .limit(3);

        if (error) throw error;

        recentPurchasesChips.innerHTML = '';

        if (!receipts || receipts.length === 0) {
            recentPurchasesChips.innerHTML = `
                <div class="text-[11px] text-slate-500 font-medium py-1">
                    No prior inward purchase receipts recorded for this item yet. Please enter the Challan and Invoice numbers manually below.
                </div>
            `;
            return;
        }

        receipts.forEach((rc, index) => {
            const dateStr = formatDate(rc.timestamp);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'text-left px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-brand-navy hover:bg-slate-50 text-slate-700 transition cursor-pointer shadow-xs group';

            chip.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-brand-emerald"></span>
                    <span class="text-xs font-bold text-brand-navy group-hover:text-brand-navyDark">
                        CH: ${rc.challan_no || 'N/A'} • INV: ${rc.invoice_no || 'N/A'}
                    </span>
                    <span class="text-[10px] text-slate-400 font-medium">(${dateStr})</span>
                </div>
                <div class="text-[10px] text-slate-500 font-medium mt-0.5 pl-3.5">
                    ${rc.supplier_name || 'Vendor'} • Qty: ${rc.qty_received}
                </div>
            `;

            chip.addEventListener('click', () => {
                if (reportChallanNo) reportChallanNo.value = rc.challan_no || '';
                if (reportInvoiceNo) reportInvoiceNo.value = rc.invoice_no || '';

                // Visual active indicator on selected chip
                Array.from(recentPurchasesChips.children).forEach(c => c.classList.remove('ring-2', 'ring-brand-navy', 'bg-slate-50'));
                chip.classList.add('ring-2', 'ring-brand-navy', 'bg-slate-50');
            });

            recentPurchasesChips.appendChild(chip);
        });

    } catch (err) {
        console.error('[Report] Error fetching last 3 purchases:', err);
        recentPurchasesChips.innerHTML = `
            <div class="text-[11px] text-red-500 font-medium">
                Unable to auto-fetch recent purchases. Please type Challan and Invoice manually.
            </div>
        `;
    }
}

/**
 * 5. Update Dynamic Live Stock Indicator
 */
function updateStockIndicator(item) {
    if (!reportStockBadge) return;
    if (item) {
        reportStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">${item.current_stock} ${item.unit}</span>`;
    } else {
        reportStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">0</span>`;
    }
}

if (reportItemSelect) {
    reportItemSelect.addEventListener('change', () => {
        const selectedId = reportItemSelect.value;
        const found = projectItems.find(i => i.id === selectedId);
        updateStockIndicator(found);
        fetchLastThreePurchases(selectedId);
    });
}

/**
 * 6. Date Formatter Helper (DD/MM/YYYY)
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
 * 7. Fetch Discrepancy & Return Audit Logs
 */
async function loadReportsLog() {
    await resolveWorkspaceAndSession();

    if (!client || !currentProjectId || !reportTableBody) return;

    reportTableBody.innerHTML = `
        <tr>
            <td colspan="9" class="py-12 text-center text-slate-400">
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-brand-navy mb-2"></div>
                <p class="text-xs font-semibold">Loading material reports & incident register...</p>
            </td>
        </tr>
    `;

    try {
        const { data: reports, error } = await client
            .from('inventory_reports')
            .select(`
                id,
                report_code,
                report_type,
                qty,
                challan_no,
                invoice_no,
                reason,
                reported_by,
                stock_deducted,
                timestamp,
                inventory_items (
                    item_code,
                    item_name,
                    unit
                )
            `)
            .eq('project_id', currentProjectId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        allReports = reports || [];
        renderFilteredReports();

    } catch (err) {
        console.error('[Report] Error loading report register:', err);
        reportTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-8 text-center text-red-600 font-semibold text-xs">
                    Failed to load reports: ${err.message || 'Network error'}.
                </td>
            </tr>
        `;
    }
}

/**
 * 8. Render Filtered Table Rows
 */
function renderFilteredReports() {
    if (!reportTableBody) return;

    const filterType = reportFilterType?.value || '';

    const filtered = allReports.filter(rep => {
        return !filterType || rep.report_type === filterType;
    });

    reportTableBody.innerHTML = '';

    if (filtered.length === 0) {
        reportTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-12 text-center text-slate-400">
                    <div class="text-2xl mb-1">📑</div>
                    <div class="text-xs font-bold text-slate-600">No Incident Records Found</div>
                    <div class="text-[11px] text-slate-400">No damages, shortages, or returns recorded for the selected filter.</div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(rep => {
        const itemName = rep.inventory_items?.item_name || 'Material Item';
        const unit = rep.inventory_items?.unit || 'units';
        const dateFormatted = formatDate(rep.timestamp);
        const type = rep.report_type || 'damage';

        // Badge Styling per Type
        let typeBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
        let typeLabel = 'DAMAGE';
        if (type === 'shortage') {
            typeBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
            typeLabel = 'SHORTAGE';
        } else if (type === 'return') {
            typeBadgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
            typeLabel = 'RETURN';
        }

        const challanInfo = rep.challan_no ? `CH: ${rep.challan_no}` : '';
        const invoiceInfo = rep.invoice_no ? `INV: ${rep.invoice_no}` : '';
        const docRef = [challanInfo, invoiceInfo].filter(Boolean).join(' • ') || 'Manual / None';

        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50 transition border-b border-slate-100';

        row.innerHTML = `
            <td class="py-3 px-4 font-bold text-brand-navy">
                ${rep.report_code || 'REP-RECORD'}
            </td>
            <td class="py-3 px-4">
                <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${typeBadgeClass}">
                    ${typeLabel}
                </span>
            </td>
            <td class="py-3 px-4 text-[11px] text-slate-500 font-medium">
                ${dateFormatted}
            </td>
            <td class="py-3 px-4 font-bold text-slate-800">
                ${itemName}
            </td>
            <td class="py-3 px-4 text-right font-bold ${type === 'damage' ? 'text-rose-600' : 'text-slate-800'}">
                ${rep.qty} <span class="text-[11px] text-slate-400 font-normal">${unit}</span>
            </td>
            <td class="py-3 px-4 text-xs font-semibold text-slate-600">
                ${docRef}
            </td>
            <td class="py-3 px-4 text-[11px] text-slate-600 max-w-xs truncate" title="${rep.reason || ''}">
                ${rep.reason || 'No description provided'}
            </td>
            <td class="py-3 px-4 text-slate-700 font-medium">
                ${rep.reported_by || 'Site Engineer'}
            </td>
            <td class="py-3 px-4 text-center">
                <button type="button" 
                        onclick="window.deleteReport('${rep.id}', '${rep.report_code}')" 
                        title="Delete Report" 
                        class="p-1 rounded-lg border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-400 hover:text-red-600 transition cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </td>
        `;

        reportTableBody.appendChild(row);
    });
}

/**
 * 9. Delete Report Audit Log
 */
window.deleteReport = async function(reportId, reportCode) {
    if (!reportId) return;
    const confirmed = confirm(`Are you sure you want to remove report entry [${reportCode}]? Note: This does not reverse prior inventory adjustments.`);
    if (!confirmed) return;

    try {
        const { error } = await client
            .from('inventory_reports')
            .delete()
            .eq('id', reportId);

        if (error) throw error;

        await loadReportsLog();
    } catch (err) {
        alert(`Failed to delete record: ${err.message || 'Error occurred.'}`);
    }
};

/**
 * 10. Handle Report Form Submission
 */
async function handleReportSubmit(e) {
    e.preventDefault();

    await resolveWorkspaceAndSession();
    if (!currentProjectId) {
        alert('Please select an active project in the header navigation.');
        return;
    }

    const itemId = reportItemSelect.value;
    const qty = parseFloat(reportQty.value) || 0;
    const challanNo = reportChallanNo.value.trim();
    const invoiceNo = reportInvoiceNo.value.trim();
    const reason = reportReason.value.trim();
    const reportType = activeReportType;

    if (!itemId || qty <= 0 || !challanNo || !invoiceNo || !reason) {
        alert('Please fill out all mandatory fields (*)');
        return;
    }

    const itemRecord = projectItems.find(i => i.id === itemId);
    const availableStock = Number(itemRecord?.current_stock) || 0;

    // Check stock for damage/return deductions
    const willDeductStock = (reportType === 'damage' || reportType === 'return');
    if (willDeductStock && qty > availableStock) {
        const proceed = confirm(`Warning: The quantity reported (${qty}) exceeds current stock (${availableStock}). Proceeding will drive the stock count negative. Continue?`);
        if (!proceed) return;
    }

    btnSubmitReport.disabled = true;
    btnSubmitReport.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-white inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <span>Processing Report...</span>
    `;

    try {
        const prefix = reportType === 'damage' ? 'DMG' : (reportType === 'shortage' ? 'SHT' : 'RET');
        const reportCode = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Insert Report Log
        const reportPayload = {
            project_id: currentProjectId,
            report_code: reportCode,
            report_type: reportType,
            item_id: itemId,
            qty: qty,
            challan_no: challanNo,
            invoice_no: invoiceNo,
            reason: reason,
            reported_by: currentUserName,
            stock_deducted: willDeductStock,
            timestamp: new Date().toISOString()
        };

        const { error: insertError } = await client
            .from('inventory_reports')
            .insert([reportPayload]);

        if (insertError) throw insertError;

        // 2. Adjust Stock in Master Register if applicable
        if (willDeductStock) {
            const newStock = availableStock - qty;
            const { error: updateError } = await client
                .from('inventory_items')
                .update({
                    current_stock: newStock,
                    last_updated: new Date().toISOString()
                })
                .eq('id', itemId);

            if (updateError) throw updateError;
        }

        alert(`Report [${reportCode}] logged successfully! ${willDeductStock ? `Stock deducted by ${qty}.` : 'Discrepancy logged for review.'}`);

        // Reset Form & Reload Data
        formReport.reset();
        reportHandledBy.value = currentUserName;
        if (reportStockBadge) reportStockBadge.innerHTML = `Current Stock: <span class="font-bold text-brand-navy">0</span>`;
        if (recentPurchasesSection) recentPurchasesSection.classList.add('hidden');
        if (recentPurchasesChips) recentPurchasesChips.innerHTML = '';

        await loadProjectMaterials();
        await loadReportsLog();

    } catch (err) {
        console.error('[Report Submission Error]:', err);
        alert(`Failed to save report: ${err.message || 'Error occurred.'}`);
    } finally {
        btnSubmitReport.disabled = false;
        btnSubmitReport.innerHTML = `
            <svg class="w-4 h-4 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <span id="btnSubmitReportText">${activeReportType === 'damage' ? 'Submit Report & Deduct Stock' : (activeReportType === 'shortage' ? 'Submit Shortage Discrepancy Log' : 'Submit Return & Deduct Stock')}</span>
        `;
    }
}

/**
 * 11. Event Listeners & Bootstrapping
 */
if (btnTypeDamage) btnTypeDamage.addEventListener('click', () => setReportMode('damage'));
if (btnTypeShortage) btnTypeShortage.addEventListener('click', () => setReportMode('shortage'));
if (btnTypeReturn) btnTypeReturn.addEventListener('click', () => setReportMode('return'));

if (formReport) formReport.addEventListener('submit', handleReportSubmit);

if (reportFilterType) reportFilterType.addEventListener('change', renderFilteredReports);
if (reportRefreshBtn) reportRefreshBtn.addEventListener('click', loadReportsLog);

// Re-load on workspace switch
window.addEventListener('projectChanged', async () => {
    await resolveWorkspaceAndSession();
    await loadProjectMaterials();
    await loadReportsLog();
});

// Initial Bootstrap on Page Load
document.addEventListener('DOMContentLoaded', async () => {
    setReportMode('damage');
    await resolveWorkspaceAndSession();
    await loadProjectMaterials();
    await loadReportsLog();
});