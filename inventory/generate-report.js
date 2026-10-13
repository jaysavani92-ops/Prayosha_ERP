/**
 * Prayosha ERP - Civil Inventory Analytics & Report Generator Controller
 * File: /inventory/generate-report.js
 * 
 * Features:
 * 1. Multi-Ledger Data Aggregator:
 *    - Current Stock Inventory (Valuation, Balances, Thresholds)
 *    - Inward Receipts (Purchases, Challans, Invoices)
 *    - Outward Issues (Subcontractor & Zone allocations)
 *    - Material Indents (Procurement demands & Approval states)
 *    - Discrepancy & Returns (Damage, Shortage, Return records)
 * 2. Timeframe Filtering: All Time, Today, Last 7 Days, This Month, and Custom Ranges.
 * 3. Multi-Variable Filters: Phase, Stock Category, Vendor/Agency, and Challan/Remarks.
 * 4. Live Dataset Preview: In-browser table visualization before export.
 * 5. Direct CSV Export: Generates UTF-8 encoded, Excel-compatible CSV files.
 * 6. Browser-Native PDF Generator: Renders print-ready documents with Prayosha branding.
 */

import { supabase } from '../config.js';

// Central Supabase Client
const client = supabase || window.supabaseClient;

// DOM Elements - Workspace & Badges
const activeProjectBadge = document.getElementById('activeProjectBadge');

// DOM Elements - Filter Form
const formGenerateReport = document.getElementById('formGenerateReport');
const reportTypeSelect = document.getElementById('reportTypeSelect');
const btnFormatCsv = document.getElementById('btnFormatCsv');
const btnFormatPdf = document.getElementById('btnFormatPdf');

const timeframeSelect = document.getElementById('timeframeSelect');
const customDateRangeContainer = document.getElementById('customDateRangeContainer');
const dateStart = document.getElementById('dateStart');
const dateEnd = document.getElementById('dateEnd');

const filterPhase = document.getElementById('filterPhase');
const filterCategory = document.getElementById('filterCategory');
const filterAgency = document.getElementById('filterAgency');
const filterRemarks = document.getElementById('filterRemarks');

const btnPreviewData = document.getElementById('btnPreviewData');
const btnGenerateReport = document.getElementById('btnGenerateReport');
const btnGenerateReportText = document.getElementById('btnGenerateReportText');

// DOM Elements - Preview Section
const previewCard = document.getElementById('previewCard');
const previewTitle = document.getElementById('previewTitle');
const previewCountBadge = document.getElementById('previewCountBadge');
const previewTheadTr = document.getElementById('previewTheadTr');
const previewTbody = document.getElementById('previewTbody');

// State Cache
let currentProjectId = null;
let activeProjectName = 'Active Project';
let activeProjectCode = 'SITE';
let selectedFormat = 'csv'; // 'csv' | 'pdf'
let currentDataset = null;

/**
 * 1. Resolve Active Workspace & Project Context
 */
async function resolveWorkspaceContext() {
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
                console.warn('[GenerateReport] Project resolution warning:', err);
            }
        }
    }

    currentProjectId = projectId;
    activeProjectName = localStorage.getItem('activeProjectName') || 'Active Project';
    activeProjectCode = localStorage.getItem('activeProjectCode') || 'SITE';

    if (activeProjectBadge) {
        activeProjectBadge.textContent = activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName;
    }

    return currentProjectId;
}

/**
 * 2. Export Format Toggle Logic
 */
function setExportFormat(fmt) {
    selectedFormat = fmt;
    if (fmt === 'csv') {
        btnFormatCsv.className = 'py-2.5 px-4 rounded-xl border-2 border-brand-emerald bg-emerald-50 text-brand-emerald font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-xs cursor-pointer';
        btnFormatPdf.className = 'py-2.5 px-4 rounded-xl border-2 border-transparent bg-slate-100 text-slate-600 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:bg-slate-200 cursor-pointer';
        if (btnGenerateReportText) btnGenerateReportText.textContent = 'Generate & Download CSV';
    } else {
        btnFormatPdf.className = 'py-2.5 px-4 rounded-xl border-2 border-brand-navy bg-slate-100 text-brand-navy font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-xs cursor-pointer';
        btnFormatCsv.className = 'py-2.5 px-4 rounded-xl border-2 border-transparent bg-slate-100 text-slate-600 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:bg-slate-200 cursor-pointer';
        if (btnGenerateReportText) btnGenerateReportText.textContent = 'Generate & Print PDF';
    }
}

/**
 * 3. Timeframe Date Range Calculator
 */
function getDateBounds(timeframe) {
    const now = new Date();
    let startDate = null;
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (timeframe === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (timeframe === '7days') {
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        startDate.setHours(0, 0, 0, 0);
    } else if (timeframe === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (timeframe === 'custom') {
        if (dateStart && dateStart.value) {
            startDate = new Date(dateStart.value);
            startDate.setHours(0, 0, 0, 0);
        }
        if (dateEnd && dateEnd.value) {
            endDate = new Date(dateEnd.value);
            endDate.setHours(23, 59, 59, 999);
        }
    }

    return { startDate, endDate };
}

/**
 * 4. Format Timestamps Helper (DD/MM/YYYY)
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
 * 5. Fetch and Compile Report Dataset
 */
async function compileDataset() {
    await resolveWorkspaceContext();

    if (!client || !currentProjectId) {
        alert('Please select an active project in the top navigation bar.');
        return null;
    }

    const reportType = reportTypeSelect.value;
    const timeframe = timeframeSelect.value;
    const { startDate, endDate } = getDateBounds(timeframe);

    const selPhase = filterPhase?.value.trim().toLowerCase() || '';
    const selCategory = filterCategory?.value || '';
    const selAgency = filterAgency?.value.trim().toLowerCase() || '';
    const selRemarks = filterRemarks?.value.trim().toLowerCase() || '';

    let dataset = {
        title: '',
        headers: [],
        rows: []
    };

    try {
        // CASE 1: Current Stock Inventory
        if (reportType === 'current_stock') {
            dataset.title = `Current Stock Inventory - ${activeProjectName}`;
            dataset.headers = [
                'Item Code', 'Item Name', 'Category', 'Rate (₹)',
                'Current Stock', 'Unit', 'Reorder Level', 'Consumed Till Date',
                'Total Valuation (₹)', 'Last Updated'
            ];

            let query = client
                .from('inventory_items')
                .select('*')
                .eq('project_id', currentProjectId)
                .order('item_code', { ascending: true });

            if (selCategory) query = query.eq('category', selCategory);

            const { data, error } = await query;
            if (error) throw error;

            let filtered = data || [];
            if (selRemarks) {
                filtered = filtered.filter(i => 
                    (i.item_code && i.item_code.toLowerCase().includes(selRemarks)) ||
                    (i.item_name && i.item_name.toLowerCase().includes(selRemarks))
                );
            }

            dataset.rows = filtered.map(i => {
                const stock = Number(i.current_stock) || 0;
                const rate = Number(i.rate) || 0;
                const val = stock * rate;
                return [
                    i.item_code || '',
                    i.item_name || '',
                    i.category || '',
                    rate.toFixed(2),
                    stock,
                    i.unit || '',
                    i.reorder_level || 0,
                    i.consumed_till_date || 0,
                    val.toFixed(2),
                    formatDate(i.last_updated)
                ];
            });
        }

        // CASE 2: Inward Receipts (Purchases)
        else if (reportType === 'inward_receipts') {
            dataset.title = `Material Inward Receipts - ${activeProjectName}`;
            dataset.headers = [
                'Receipt Code', 'Date', 'Item Name', 'Category',
                'Qty Received', 'Unit', 'Supplier / Agency', 'Challan No',
                'Invoice No', 'Received By', 'Remarks'
            ];

            let query = client
                .from('inventory_receipts')
                .select(`
                    id, receipt_code, qty_received, supplier_name,
                    challan_no, invoice_no, received_by, remarks, timestamp,
                    inventory_items (item_code, item_name, category, unit)
                `)
                .eq('project_id', currentProjectId)
                .order('timestamp', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            let filtered = data || [];

            // Apply Date Range
            if (startDate) filtered = filtered.filter(r => new Date(r.timestamp) >= startDate);
            if (endDate) filtered = filtered.filter(r => new Date(r.timestamp) <= endDate);

            // Apply Category
            if (selCategory) {
                filtered = filtered.filter(r => r.inventory_items?.category === selCategory);
            }

            // Apply Agency / Supplier
            if (selAgency) {
                filtered = filtered.filter(r => r.supplier_name && r.supplier_name.toLowerCase().includes(selAgency));
            }

            // Apply Remarks / Challan
            if (selRemarks) {
                filtered = filtered.filter(r => 
                    (r.challan_no && r.challan_no.toLowerCase().includes(selRemarks)) ||
                    (r.invoice_no && r.invoice_no.toLowerCase().includes(selRemarks)) ||
                    (r.remarks && r.remarks.toLowerCase().includes(selRemarks))
                );
            }

            dataset.rows = filtered.map(r => [
                r.receipt_code || '',
                formatDate(r.timestamp),
                r.inventory_items?.item_name || 'Material Item',
                r.inventory_items?.category || '',
                r.qty_received || 0,
                r.inventory_items?.unit || '',
                r.supplier_name || '',
                r.challan_no || '',
                r.invoice_no || '',
                r.received_by || '',
                r.remarks || ''
            ]);
        }

        // CASE 3: Outward Issues (Consumption)
        else if (reportType === 'outward_issues') {
            dataset.title = `Material Outward Issues - ${activeProjectName}`;
            dataset.headers = [
                'Issue Code', 'Date', 'Item Name', 'Qty Issued',
                'Unit', 'Sub-Contractor', 'Issuer', 'Tower',
                'Floor', 'Zone IDs', 'Task Category', 'Remarks'
            ];

            let query = client
                .from('inventory_issues')
                .select(`
                    id, issue_code, qty_issued, issued_to_agency,
                    issued_by, tower_name, floor_name, zone_ids,
                    task_category, remarks, timestamp,
                    inventory_items (item_code, item_name, category, unit)
                `)
                .eq('project_id', currentProjectId)
                .order('timestamp', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            let filtered = data || [];

            if (startDate) filtered = filtered.filter(i => new Date(i.timestamp) >= startDate);
            if (endDate) filtered = filtered.filter(i => new Date(i.timestamp) <= endDate);

            if (selCategory) {
                filtered = filtered.filter(i => i.inventory_items?.category === selCategory);
            }

            if (selAgency) {
                filtered = filtered.filter(i => i.issued_to_agency && i.issued_to_agency.toLowerCase().includes(selAgency));
            }

            if (selRemarks) {
                filtered = filtered.filter(i => 
                    (i.remarks && i.remarks.toLowerCase().includes(selRemarks)) ||
                    (Array.isArray(i.zone_ids) && i.zone_ids.some(z => z.toLowerCase().includes(selRemarks)))
                );
            }

            dataset.rows = filtered.map(i => {
                const zones = Array.isArray(i.zone_ids) ? i.zone_ids.join(', ') : (i.zone_ids || '');
                return [
                    i.issue_code || '',
                    formatDate(i.timestamp),
                    i.inventory_items?.item_name || 'Material Item',
                    i.qty_issued || 0,
                    i.inventory_items?.unit || '',
                    i.issued_to_agency || '',
                    i.issued_by || '',
                    i.tower_name || '',
                    i.floor_name || '',
                    zones,
                    i.task_category || '',
                    i.remarks || ''
                ];
            });
        }

        // CASE 4: Indents (Requisitions)
        else if (reportType === 'indents') {
            dataset.title = `Material Indents Register - ${activeProjectName}`;
            dataset.headers = [
                'Indent Code', 'Date', 'Item Name', 'Qty Requested',
                'Unit', 'Phase', 'Urgency', 'Status', 'Requested By', 'Remarks'
            ];

            let query = client
                .from('inventory_indents')
                .select(`
                    id, indent_code, qty_requested, phase, urgency,
                    status, requested_by, remarks, timestamp,
                    inventory_items (item_code, item_name, category, unit)
                `)
                .eq('project_id', currentProjectId)
                .order('timestamp', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            let filtered = data || [];

            if (startDate) filtered = filtered.filter(ind => new Date(ind.timestamp) >= startDate);
            if (endDate) filtered = filtered.filter(ind => new Date(ind.timestamp) <= endDate);

            if (selPhase) {
                filtered = filtered.filter(ind => ind.phase && ind.phase.toLowerCase() === selPhase);
            }

            if (selCategory) {
                filtered = filtered.filter(ind => ind.inventory_items?.category === selCategory);
            }

            if (selRemarks) {
                filtered = filtered.filter(ind => 
                    (ind.remarks && ind.remarks.toLowerCase().includes(selRemarks)) ||
                    (ind.indent_code && ind.indent_code.toLowerCase().includes(selRemarks))
                );
            }

            dataset.rows = filtered.map(ind => [
                ind.indent_code || '',
                formatDate(ind.timestamp),
                ind.inventory_items?.item_name || 'Material Item',
                ind.qty_requested || 0,
                ind.inventory_items?.unit || '',
                ind.phase || 'Phase 1',
                ind.urgency || 'Standard',
                ind.status || 'Pending',
                ind.requested_by || '',
                ind.remarks || ''
            ]);
        }

        // CASE 5: Damage / Shortage / Return Reports
        else if (reportType === 'damage_reports') {
            dataset.title = `Discrepancy & Returns Log - ${activeProjectName}`;
            dataset.headers = [
                'Report Code', 'Report Type', 'Date', 'Item Name',
                'Qty', 'Unit', 'Challan No', 'Invoice No',
                'Reason / Explanation', 'Reported By'
            ];

            let query = client
                .from('inventory_reports')
                .select(`
                    id, report_code, report_type, qty, challan_no,
                    invoice_no, reason, reported_by, timestamp,
                    inventory_items (item_code, item_name, category, unit)
                `)
                .eq('project_id', currentProjectId)
                .order('timestamp', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;

            let filtered = data || [];

            if (startDate) filtered = filtered.filter(rep => new Date(rep.timestamp) >= startDate);
            if (endDate) filtered = filtered.filter(rep => new Date(rep.timestamp) <= endDate);

            if (selCategory) {
                filtered = filtered.filter(rep => rep.inventory_items?.category === selCategory);
            }

            if (selRemarks) {
                filtered = filtered.filter(rep => 
                    (rep.reason && rep.reason.toLowerCase().includes(selRemarks)) ||
                    (rep.challan_no && rep.challan_no.toLowerCase().includes(selRemarks)) ||
                    (rep.invoice_no && rep.invoice_no.toLowerCase().includes(selRemarks))
                );
            }

            dataset.rows = filtered.map(rep => [
                rep.report_code || '',
                (rep.report_type || '').toUpperCase(),
                formatDate(rep.timestamp),
                rep.inventory_items?.item_name || 'Material Item',
                rep.qty || 0,
                rep.inventory_items?.unit || '',
                rep.challan_no || '',
                rep.invoice_no || '',
                rep.reason || '',
                rep.reported_by || ''
            ]);
        }

        currentDataset = dataset;
        return dataset;

    } catch (err) {
        console.error('[GenerateReport Compile Error]:', err);
        alert(`Failed to compile report dataset: ${err.message || 'Database error'}`);
        return null;
    }
}

/**
 * 6. Render In-Page Dataset Preview
 */
async function renderPreview() {
    if (!previewCard || !previewTheadTr || !previewTbody) return;

    btnPreviewData.disabled = true;
    btnPreviewData.innerHTML = `
        <svg class="animate-spin h-3.5 w-3.5 text-slate-500 inline-block mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <span>Compiling Preview...</span>
    `;

    const dataset = await compileDataset();

    btnPreviewData.disabled = false;
    btnPreviewData.innerHTML = `
        <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
        <span>Preview Dataset</span>
    `;

    if (!dataset) return;

    previewCard.classList.remove('hidden');
    if (previewTitle) previewTitle.textContent = dataset.title;
    if (previewCountBadge) previewCountBadge.textContent = `${dataset.rows.length} records matched`;

    // Render Table Header
    previewTheadTr.innerHTML = dataset.headers.map(h => `<th class="py-2.5 px-3 text-slate-600">${h}</th>`).join('');

    // Render Table Body
    if (dataset.rows.length === 0) {
        previewTbody.innerHTML = `
            <tr>
                <td colspan="${dataset.headers.length}" class="py-8 text-center text-slate-400">
                    No matching records found for the selected timeframe and filter criteria.
                </td>
            </tr>
        `;
        return;
    }

    previewTbody.innerHTML = dataset.rows.map(row => `
        <tr class="hover:bg-slate-50/80 transition">
            ${row.map(cell => `<td class="py-2.5 px-3 text-slate-700 max-w-xs truncate">${cell}</td>`).join('')}
        </tr>
    `).join('');

    // Smooth scroll down to preview card
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 7. RFC-4180 CSV Download Handler
 */
function downloadCsv(dataset) {
    if (!dataset || dataset.rows.length === 0) {
        alert('No data records available to export for this report selection.');
        return;
    }

    const escapeCsvField = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    let csvContent = '\uFEFF'; // UTF-8 Byte Order Mark for Excel
    csvContent += dataset.headers.map(escapeCsvField).join(',') + '\r\n';

    dataset.rows.forEach(row => {
        csvContent += row.map(escapeCsvField).join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const cleanProject = (activeProjectCode || 'SITE').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanType = reportTypeSelect.value.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStamp = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `Prayosha_${cleanProject}_${cleanType}_${dateStamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * 8. Print-Ready PDF Generation Handler
 */
function printPdf(dataset) {
    if (!dataset || dataset.rows.length === 0) {
        alert('No data records available to print for this report selection.');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Pop-up was blocked. Please allow pop-ups for this site to generate the PDF print preview.');
        return;
    }

    const dateGenerated = new Date().toLocaleString('en-IN');

    const tableHeadersHtml = dataset.headers.map(h => `<th style="padding: 8px 10px; border-bottom: 2px solid #1E3A5F; text-align: left; font-size: 10px; text-transform: uppercase; color: #1E3A5F;">${h}</th>`).join('');

    const tableRowsHtml = dataset.rows.map(row => `
        <tr style="border-bottom: 1px solid #E2E8F0;">
            ${row.map(cell => `<td style="padding: 7px 10px; font-size: 10px; color: #334155;">${cell}</td>`).join('')}
        </tr>
    `).join('');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${dataset.title}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    margin: 20px;
                    color: #1e293b;
                }
                .header-box {
                    border-bottom: 3px solid #1E3A5F;
                    padding-bottom: 12px;
                    margin-bottom: 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                }
                .brand-title {
                    font-size: 22px;
                    font-weight: 800;
                    color: #1E3A5F;
                    margin: 0;
                }
                .brand-sub {
                    font-size: 11px;
                    color: #64748b;
                    margin: 2px 0 0 0;
                }
                .meta-box {
                    text-align: right;
                    font-size: 10px;
                    color: #64748b;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                }
                @media print {
                    @page { margin: 12mm; size: landscape; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="header-box">
                <div>
                    <h1 class="brand-title">PRAYOSHA ERP</h1>
                    <p class="brand-sub">${dataset.title}</p>
                </div>
                <div class="meta-box">
                    <div><strong>Project:</strong> [${activeProjectCode}] ${activeProjectName}</div>
                    <div><strong>Generated:</strong> ${dateGenerated}</div>
                    <div><strong>Records:</strong> ${dataset.rows.length}</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>${tableHeadersHtml}</tr>
                </thead>
                <tbody>
                    ${tableRowsHtml}
                </tbody>
            </table>
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);

    printWindow.document.close();
}

/**
 * 9. Handle Main Generate & Download Form Submit
 */
async function handleGenerateSubmit(e) {
    e.preventDefault();

    btnGenerateReport.disabled = true;
    const originalText = btnGenerateReportText.textContent;
    btnGenerateReportText.textContent = 'Exporting...';

    const dataset = await compileDataset();

    btnGenerateReport.disabled = false;
    btnGenerateReportText.textContent = originalText;

    if (!dataset) return;

    if (selectedFormat === 'csv') {
        downloadCsv(dataset);
    } else {
        printPdf(dataset);
    }
}

/**
 * 10. Event Listeners & Bootstrapping
 */
if (btnFormatCsv) btnFormatCsv.addEventListener('click', () => setExportFormat('csv'));
if (btnFormatPdf) btnFormatPdf.addEventListener('click', () => setExportFormat('pdf'));

if (timeframeSelect) {
    timeframeSelect.addEventListener('change', () => {
        if (timeframeSelect.value === 'custom') {
            customDateRangeContainer?.classList.remove('hidden');
        } else {
            customDateRangeContainer?.classList.add('hidden');
        }
    });
}

if (btnPreviewData) btnPreviewData.addEventListener('click', renderPreview);
if (formGenerateReport) formGenerateReport.addEventListener('submit', handleGenerateSubmit);

// Re-synchronize on project workspace change
window.addEventListener('projectChanged', async () => {
    await resolveWorkspaceContext();
    if (previewCard && !previewCard.classList.contains('hidden')) {
        renderPreview();
    }
});

// Initial Bootstrap on Page Load
document.addEventListener('DOMContentLoaded', async () => {
    await resolveWorkspaceContext();
    setExportFormat('csv');
});