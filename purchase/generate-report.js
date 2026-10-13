/**
 * Prayosha ERP - Analytics & Report Generation Sub-Module Logic
 * File: /purchase/generate-report.js
 * 
 * Features:
 * 1. Multi-Dimensional Auditing Reports: Master Ledger, Vendor Summary, CBS Breakdown, 
 *    Pending Liabilities, and Bank Disbursements.
 * 2. Dynamic Timeframe Filters (All Time, Current Month, Last Month, Quarter, Financial Year, Custom Range).
 * 3. Real-Time Interactive Table Preview reflecting selected scope.
 * 4. Automated File Generators: Clean CSV/Excel export download & Executive Print-Ready PDF.
 */

import { supabase, CONFIG } from '../config.js';

document.addEventListener('DOMContentLoaded', async () => {

    // =========================================================================
    // 1. SUPABASE CLIENT RESOLUTION (ESM IMPORT WITH FALLBACK)
    // =========================================================================
    const supabaseClient = supabase || window.supabaseClient || (
        typeof window.supabase !== 'undefined' && CONFIG?.SUPABASE_URL 
            ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) 
            : null
    );

    if (!supabaseClient) {
        console.error('[Generate Report] Primary database client failed to initialize.');
        return;
    }

    // =========================================================================
    // 2. DOM ELEMENT SELECTORS
    // =========================================================================
    const activeProjectDisplay = document.getElementById('activeProjectDisplay');

    // Report Form & Filters
    const reportForm = document.getElementById('reportForm');
    const reportTypeSelect = document.getElementById('reportTypeSelect');
    const timeframeSelect = document.getElementById('timeframeSelect');
    const customDateRangeBox = document.getElementById('customDateRangeBox');
    const customStartDate = document.getElementById('customStartDate');
    const customEndDate = document.getElementById('customEndDate');

    // Format Radio Selectors
    const formatCsvLabel = document.getElementById('formatCsvLabel');
    const formatPdfLabel = document.getElementById('formatPdfLabel');
    const formatRadios = document.querySelectorAll('input[name="exportFormat"]');

    // Advanced Filters
    const filterDepartment = document.getElementById('filterDepartment');
    const filterStatus = document.getElementById('filterStatus');
    const filterVendor = document.getElementById('filterVendor');

    // Action Trigger Elements
    const generateDownloadBtn = document.getElementById('generateDownloadBtn');
    const generateSpinner = document.getElementById('generateSpinner');
    const generateBtnIcon = document.getElementById('generateBtnIcon');
    const generateBtnText = document.getElementById('generateBtnText');

    // Audit Preview Elements
    const previewCountBadge = document.getElementById('previewCountBadge');
    const previewTableHeadRow = document.getElementById('previewTableHeadRow');
    const previewTableBody = document.getElementById('previewTableBody');

    // =========================================================================
    // 3. STATE & WORKSPACE CONTEXT
    // =========================================================================
    let allRawRecords = [];
    let activeProjectId = localStorage.getItem('activeProjectId') || '';
    let activeProjectName = localStorage.getItem('activeProjectName') || 'Current Site';

    if (activeProjectDisplay) {
        activeProjectDisplay.textContent = activeProjectName;
    }

    // React to Project Change from Universal Shell
    window.addEventListener('projectChanged', (e) => {
        if (e.detail) {
            activeProjectId = e.detail.projectId;
            activeProjectName = e.detail.projectName || 'Current Site';
            if (activeProjectDisplay) {
                activeProjectDisplay.textContent = activeProjectName;
            }
            fetchDataset();
        }
    });

    const formatINR = (val) => {
        const num = parseFloat(val) || 0;
        return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };

    // =========================================================================
    // 4. FORMAT TOGGLE BUTTON INTERACTION
    // =========================================================================
    function updateFormatToggleUI(selectedFormat) {
        if (!formatCsvLabel || !formatPdfLabel) return;
        if (selectedFormat === 'CSV') {
            formatCsvLabel.className = 'flex items-center justify-center gap-2 p-3 rounded-xl border border-emerald-500 bg-emerald-50/70 text-emerald-800 font-bold text-xs cursor-pointer transition';
            formatPdfLabel.className = 'flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 bg-white/50 text-slate-600 font-semibold text-xs cursor-pointer hover:bg-slate-50 transition';
        } else {
            formatPdfLabel.className = 'flex items-center justify-center gap-2 p-3 rounded-xl border border-indigo-500 bg-indigo-50/70 text-indigo-800 font-bold text-xs cursor-pointer transition';
            formatCsvLabel.className = 'flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 bg-white/50 text-slate-600 font-semibold text-xs cursor-pointer hover:bg-slate-50 transition';
        }
    }

    formatRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            updateFormatToggleUI(e.target.value);
        });
    });

    // Timeframe Change Handler
    if (timeframeSelect) {
        timeframeSelect.addEventListener('change', () => {
            if (timeframeSelect.value === 'CUSTOM') {
                if (customDateRangeBox) customDateRangeBox.classList.remove('hidden');
            } else {
                if (customDateRangeBox) customDateRangeBox.classList.add('hidden');
            }
            updatePreview();
        });
    }

    // =========================================================================
    // 5. DATASET RETRIEVAL
    // =========================================================================
    async function fetchDataset() {
        try {
            let query = supabaseClient
                .from('purchase_logs')
                .select('*')
                .order('Inv_Date', { ascending: false });

            if (activeProjectId) {
                query = query.or(`project_id.eq.${activeProjectId},project_id.is.null`);
            }

            let { data, error } = await query;

            // Handle PostgREST table-not-found code (PGRST205) or PostgreSQL code (42P01)
            if (error && (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('not find'))) {
                const fallback = await supabaseClient
                    .from('purchases')
                    .select('*')
                    .order('created_at', { ascending: false });
                data = fallback.data;
                error = fallback.error;
            }

            if (error) throw error;

            allRawRecords = (data || []).map(normalizeRecord);
            updatePreview();

        } catch (err) {
            console.error('[Generate Report] Error compiling database:', err);
            if (previewTableBody) {
                previewTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="py-8 text-center text-slate-400 font-medium text-xs">
                            No records qualified or database table empty.
                        </td>
                    </tr>
                `;
            }
        }
    }

    function normalizeRecord(raw) {
        const total = parseFloat(raw.Total_Amount || raw.total_amount || raw.amount || 0);
        const bankPaid = parseFloat(raw.Bank_Paid || raw.bank_paid || 0);
        let balance = total - bankPaid;
        if (balance < 0) balance = 0;

        let status = (raw.Payment_Status || raw.payment_status || '').toUpperCase().trim();
        if (!status) {
            if (bankPaid >= total && total > 0) status = 'PAID';
            else if (bankPaid > 0) status = 'PARTIAL';
            else status = 'PENDING';
        }

        return {
            id: raw.id || raw.Purchase_ID || raw.purchase_id,
            purchaseId: raw.Purchase_ID || raw.purchase_id || ('PUR-' + (raw.id ? String(raw.id).slice(0, 5) : '000')),
            date: raw.Inv_Date || raw.inv_date || raw.date || raw.created_at?.split('T')[0] || '',
            invNo: raw.Inv_No || raw.inv_no || 'N/A',
            challanNo: raw.Challan_No || raw.challan_no || 'N/A',
            vendor: raw.Vendor_Name || raw.vendor_name || raw.vendor || 'Unknown Vendor',
            item: raw.Item_Description || raw.item_description || raw.material || 'Materials',
            qty: parseFloat(raw.Qty || raw.qty || raw.quantity || 0),
            rate: parseFloat(raw.Rate || raw.rate || 0),
            totalAmount: total,
            bankPaid: bankPaid,
            balanceDue: balance,
            bankUtr: raw.Bank_UTR_Transfer_No || raw.bank_utr || '',
            paymentStatus: status,
            department: raw.Department || raw.department || 'Civil & Structural Works',
            category: raw.Category || raw.category || 'General',
            subCategory: raw.Sub_Category || raw.sub_category || 'General'
        };
    }

    // =========================================================================
    // 6. SCOPE FILTERING PIPELINE
    // =========================================================================
    function getFilteredRecords() {
        const timeframe = timeframeSelect ? timeframeSelect.value : 'ALL_TIME';
        const dept = filterDepartment ? filterDepartment.value : 'ALL';
        const status = filterStatus ? filterStatus.value : 'ALL';
        const vendorQuery = filterVendor ? filterVendor.value.trim().toLowerCase() : '';

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        return allRawRecords.filter(r => {
            // 1. Date Filter
            if (r.date) {
                const recDate = new Date(r.date);

                if (timeframe === 'THIS_MONTH') {
                    if (recDate.getFullYear() !== currentYear || recDate.getMonth() !== currentMonth) return false;
                } else if (timeframe === 'LAST_MONTH') {
                    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                    if (recDate.getFullYear() !== prevYear || recDate.getMonth() !== prevMonth) return false;
                } else if (timeframe === 'THIS_QUARTER') {
                    const quarter = Math.floor(currentMonth / 3);
                    const recQuarter = Math.floor(recDate.getMonth() / 3);
                    if (recDate.getFullYear() !== currentYear || recQuarter !== quarter) return false;
                } else if (timeframe === 'FY_CURRENT') {
                    const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
                    const fyStart = new Date(startYear, 3, 1);
                    const fyEnd = new Date(startYear + 1, 2, 31, 23, 59, 59);
                    if (recDate < fyStart || recDate > fyEnd) return false;
                } else if (timeframe === 'CUSTOM') {
                    const startVal = customStartDate?.value;
                    const endVal = customEndDate?.value;
                    if (startVal && recDate < new Date(startVal)) return false;
                    if (endVal && recDate > new Date(endVal + 'T23:59:59')) return false;
                }
            }

            // 2. Department Filter
            if (dept !== 'ALL' && r.department !== dept) return false;

            // 3. Status Filter
            if (status !== 'ALL' && r.paymentStatus !== status) return false;

            // 4. Vendor Filter
            if (vendorQuery && !r.vendor.toLowerCase().includes(vendorQuery)) return false;

            return true;
        });
    }

    // =========================================================================
    // 7. REAL-TIME AUDIT PREVIEW RENDERER
    // =========================================================================
    function updatePreview() {
        const reportType = reportTypeSelect ? reportTypeSelect.value : 'MASTER_LEDGER';
        const filtered = getFilteredRecords();

        if (previewCountBadge) {
            previewCountBadge.textContent = `${filtered.length} Records Qualified`;
        }

        if (reportType === 'VENDOR_SUMMARY') {
            renderVendorSummaryPreview(filtered);
        } else if (reportType === 'CBS_BREAKDOWN') {
            renderCbsBreakdownPreview(filtered);
        } else if (reportType === 'PENDING_LIABILITIES') {
            renderPendingLiabilitiesPreview(filtered.filter(r => r.balanceDue > 0));
        } else if (reportType === 'BANK_DISBURSEMENTS') {
            renderBankDisbursementsPreview(filtered.filter(r => r.bankPaid > 0));
        } else {
            renderMasterLedgerPreview(filtered);
        }
    }

    function renderMasterLedgerPreview(records) {
        if (!previewTableHeadRow || !previewTableBody) return;
        previewTableHeadRow.innerHTML = `
            <th class="py-3 px-3">Date</th>
            <th class="py-3 px-3">Purchase ID</th>
            <th class="py-3 px-3">Vendor</th>
            <th class="py-3 px-3">Item / Description</th>
            <th class="py-3 px-3 text-right">Total (₹)</th>
            <th class="py-3 px-3 text-right">Bank Paid (₹)</th>
            <th class="py-3 px-3 text-right">Balance Due (₹)</th>
            <th class="py-3 px-3 text-center">Status</th>
        `;

        if (records.length === 0) {
            renderEmptyPreview();
            return;
        }

        previewTableBody.innerHTML = records.slice(0, 15).map(r => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="py-2.5 px-3 font-semibold text-slate-600">${escapeHtml(r.date)}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-[#1E3A5F]">${escapeHtml(r.purchaseId)}</td>
                <td class="py-2.5 px-3 font-semibold text-slate-800">${escapeHtml(r.vendor)}</td>
                <td class="py-2.5 px-3 text-slate-700 max-w-xs truncate">${escapeHtml(r.item)}</td>
                <td class="py-2.5 px-3 text-right font-bold text-[#1E3A5F]">${formatINR(r.totalAmount)}</td>
                <td class="py-2.5 px-3 text-right font-medium text-emerald-600">${formatINR(r.bankPaid)}</td>
                <td class="py-2.5 px-3 text-right font-bold text-rose-600">${formatINR(r.balanceDue)}</td>
                <td class="py-2.5 px-3 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' : (r.paymentStatus === 'PARTIAL' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800')}">
                        ${r.paymentStatus}
                    </span>
                </td>
            </tr>
        `).join('') + (records.length > 15 ? `<tr><td colspan="8" class="py-2.5 text-center text-slate-400 italic font-medium">Preview truncated to first 15 records. Download contains all ${records.length} records.</td></tr>` : '');
    }

    function renderVendorSummaryPreview(records) {
        if (!previewTableHeadRow || !previewTableBody) return;
        previewTableHeadRow.innerHTML = `
            <th class="py-3 px-3">Vendor / Party Name</th>
            <th class="py-3 px-3 text-center">Invoices Count</th>
            <th class="py-3 px-3 text-right">Total Billed (₹)</th>
            <th class="py-3 px-3 text-right">Bank Settled (₹)</th>
            <th class="py-3 px-3 text-right">Pending Balance (₹)</th>
            <th class="py-3 px-3 text-center">Status</th>
        `;

        const grouped = aggregateByVendor(records);
        if (grouped.length === 0) {
            renderEmptyPreview();
            return;
        }

        previewTableBody.innerHTML = grouped.slice(0, 15).map(v => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="py-2.5 px-3 font-bold text-slate-800">${escapeHtml(v.vendor)}</td>
                <td class="py-2.5 px-3 text-center font-semibold text-slate-600">${v.count}</td>
                <td class="py-2.5 px-3 text-right font-bold text-[#1E3A5F]">${formatINR(v.totalBilled)}</td>
                <td class="py-2.5 px-3 text-right font-semibold text-emerald-600">${formatINR(v.totalPaid)}</td>
                <td class="py-2.5 px-3 text-right font-bold text-rose-600">${formatINR(v.balance)}</td>
                <td class="py-2.5 px-3 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${v.balance <= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                        ${v.balance <= 0 ? 'CLEARED' : 'OUTSTANDING'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    function renderCbsBreakdownPreview(records) {
        if (!previewTableHeadRow || !previewTableBody) return;
        previewTableHeadRow.innerHTML = `
            <th class="py-3 px-3">Department</th>
            <th class="py-3 px-3">Category</th>
            <th class="py-3 px-3 text-center">Items Count</th>
            <th class="py-3 px-3 text-right">Total Committed (₹)</th>
            <th class="py-3 px-3 text-right">Disbursed (₹)</th>
            <th class="py-3 px-3 text-right">Payable (₹)</th>
        `;

        const grouped = aggregateByCbs(records);
        if (grouped.length === 0) {
            renderEmptyPreview();
            return;
        }

        previewTableBody.innerHTML = grouped.slice(0, 15).map(c => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="py-2.5 px-3 font-bold text-[#1E3A5F]">${escapeHtml(c.dept)}</td>
                <td class="py-2.5 px-3 font-medium text-slate-700">${escapeHtml(c.cat)}</td>
                <td class="py-2.5 px-3 text-center font-semibold text-slate-600">${c.count}</td>
                <td class="py-2.5 px-3 text-right font-bold text-[#1E3A5F]">${formatINR(c.totalBilled)}</td>
                <td class="py-2.5 px-3 text-right font-semibold text-emerald-600">${formatINR(c.totalPaid)}</td>
                <td class="py-2.5 px-3 text-right font-bold text-rose-600">${formatINR(c.balance)}</td>
            </tr>
        `).join('');
    }

    function renderPendingLiabilitiesPreview(records) {
        if (!previewTableHeadRow || !previewTableBody) return;
        previewTableHeadRow.innerHTML = `
            <th class="py-3 px-3">Date</th>
            <th class="py-3 px-3">Vendor</th>
            <th class="py-3 px-3">Bill Number</th>
            <th class="py-3 px-3 text-right">Total Due (₹)</th>
            <th class="py-3 px-3 text-right">Paid So Far (₹)</th>
            <th class="py-3 px-3 text-right">Outstanding (₹)</th>
            <th class="py-3 px-3 text-center">Status</th>
        `;

        if (records.length === 0) {
            renderEmptyPreview();
            return;
        }

        previewTableBody.innerHTML = records.slice(0, 15).map(r => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="py-2.5 px-3 font-semibold text-slate-600">${escapeHtml(r.date)}</td>
                <td class="py-2.5 px-3 font-bold text-slate-800">${escapeHtml(r.vendor)}</td>
                <td class="py-2.5 px-3 font-mono text-slate-700">${escapeHtml(r.invNo)}</td>
                <td class="py-2.5 px-3 text-right font-medium text-slate-700">${formatINR(r.totalAmount)}</td>
                <td class="py-2.5 px-3 text-right font-medium text-emerald-600">${formatINR(r.bankPaid)}</td>
                <td class="py-2.5 px-3 text-right font-bold text-rose-600">${formatINR(r.balanceDue)}</td>
                <td class="py-2.5 px-3 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                        ${r.paymentStatus}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    function renderBankDisbursementsPreview(records) {
        if (!previewTableHeadRow || !previewTableBody) return;
        previewTableHeadRow.innerHTML = `
            <th class="py-3 px-3">Date</th>
            <th class="py-3 px-3">Vendor</th>
            <th class="py-3 px-3">Bank UTR / Ref No</th>
            <th class="py-3 px-3">Invoice No</th>
            <th class="py-3 px-3 text-right">Amount Cleared (₹)</th>
            <th class="py-3 px-3">Material / Item</th>
        `;

        if (records.length === 0) {
            renderEmptyPreview();
            return;
        }

        previewTableBody.innerHTML = records.slice(0, 15).map(r => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="py-2.5 px-3 font-semibold text-slate-600">${escapeHtml(r.date)}</td>
                <td class="py-2.5 px-3 font-bold text-slate-800">${escapeHtml(r.vendor)}</td>
                <td class="py-2.5 px-3 font-mono font-bold text-[#1E3A5F]">${escapeHtml(r.bankUtr || 'Cleared')}</td>
                <td class="py-2.5 px-3 font-mono text-slate-700">${escapeHtml(r.invNo)}</td>
                <td class="py-2.5 px-3 text-right font-bold text-emerald-600">${formatINR(r.bankPaid)}</td>
                <td class="py-2.5 px-3 text-slate-700 max-w-xs truncate">${escapeHtml(r.item)}</td>
            </tr>
        `).join('');
    }

    function renderEmptyPreview() {
        if (!previewTableBody) return;
        previewTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="py-8 text-center text-slate-400 font-medium text-xs">
                    No procurement records qualified under the current filter scope.
                </td>
            </tr>
        `;
    }

    // =========================================================================
    // 8. DATA AGGREGATION UTILITIES
    // =========================================================================
    function aggregateByVendor(records) {
        const map = {};
        records.forEach(r => {
            const v = r.vendor || 'Unknown Vendor';
            if (!map[v]) {
                map[v] = { vendor: v, count: 0, totalBilled: 0, totalPaid: 0, balance: 0 };
            }
            map[v].count += 1;
            map[v].totalBilled += r.totalAmount;
            map[v].totalPaid += r.bankPaid;
            map[v].balance += r.balanceDue;
        });
        return Object.values(map).sort((a, b) => b.totalBilled - a.totalBilled);
    }

    function aggregateByCbs(records) {
        const map = {};
        records.forEach(r => {
            const key = `${r.department}__${r.category}`;
            if (!map[key]) {
                map[key] = { dept: r.department, cat: r.category, count: 0, totalBilled: 0, totalPaid: 0, balance: 0 };
            }
            map[key].count += 1;
            map[key].totalBilled += r.totalAmount;
            map[key].totalPaid += r.bankPaid;
            map[key].balance += r.balanceDue;
        });
        return Object.values(map).sort((a, b) => b.totalBilled - a.totalBilled);
    }

    // =========================================================================
    // 9. REPORT GENERATION ENGINE (CSV & PDF)
    // =========================================================================
    if (reportForm) {
        reportForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const reportType = reportTypeSelect ? reportTypeSelect.value : 'MASTER_LEDGER';
            const selectedFormatRadio = document.querySelector('input[name="exportFormat"]:checked');
            const format = selectedFormatRadio ? selectedFormatRadio.value : 'CSV';
            const records = getFilteredRecords();

            if (records.length === 0) {
                alert('No records available for export under current filter selection.');
                return;
            }

            setGeneratingState(true);

            try {
                if (format === 'CSV') {
                    exportToCsv(reportType, records);
                } else {
                    exportToPdf(reportType, records);
                }
            } catch (err) {
                console.error('[Export Execution Error]:', err);
                alert(`Report compilation error: ${err.message}`);
            } finally {
                setGeneratingState(false);
            }
        });
    }

    // -------------------------------------------------------------------------
    // CSV EXPORT LOGIC
    // -------------------------------------------------------------------------
    function exportToCsv(type, records) {
        let headers = [];
        let rows = [];

        if (type === 'VENDOR_SUMMARY') {
            const grouped = aggregateByVendor(records);
            headers = ['Vendor Name', 'Invoices Count', 'Total Billed (INR)', 'Bank Settled (INR)', 'Outstanding Balance (INR)', 'Status'];
            rows = grouped.map(v => [
                v.vendor,
                v.count,
                v.totalBilled.toFixed(2),
                v.totalPaid.toFixed(2),
                v.balance.toFixed(2),
                v.balance <= 0 ? 'CLEARED' : 'OUTSTANDING'
            ]);
        } else if (type === 'CBS_BREAKDOWN') {
            const grouped = aggregateByCbs(records);
            headers = ['Department', 'Category', 'Items Count', 'Total Committed (INR)', 'Disbursed (INR)', 'Payable Balance (INR)'];
            rows = grouped.map(c => [
                c.dept,
                c.cat,
                c.count,
                c.totalBilled.toFixed(2),
                c.totalPaid.toFixed(2),
                c.balance.toFixed(2)
            ]);
        } else if (type === 'PENDING_LIABILITIES') {
            const pending = records.filter(r => r.balanceDue > 0);
            headers = ['Date', 'Purchase ID', 'Vendor', 'Invoice No', 'Challan No', 'Total Due (INR)', 'Bank Paid (INR)', 'Balance Due (INR)', 'Department'];
            rows = pending.map(r => [
                r.date,
                r.purchaseId,
                r.vendor,
                r.invNo,
                r.challanNo,
                r.totalAmount.toFixed(2),
                r.bankPaid.toFixed(2),
                r.balanceDue.toFixed(2),
                r.department
            ]);
        } else if (type === 'BANK_DISBURSEMENTS') {
            const bankRecs = records.filter(r => r.bankPaid > 0);
            headers = ['Date', 'Purchase ID', 'Vendor', 'Bank UTR / Ref No', 'Invoice No', 'Bank Paid (INR)', 'Item Description', 'Department'];
            rows = bankRecs.map(r => [
                r.date,
                r.purchaseId,
                r.vendor,
                r.bankUtr,
                r.invNo,
                r.bankPaid.toFixed(2),
                r.item,
                r.department
            ]);
        } else {
            // Master Ledger
            headers = ['Date', 'Purchase ID', 'Invoice No', 'Challan No', 'Vendor', 'Item Description', 'Qty', 'Rate', 'Total Amount (INR)', 'Bank Paid (INR)', 'Balance Due (INR)', 'Status', 'Department', 'Category', 'Sub Category', 'Bank UTR'];
            rows = records.map(r => [
                r.date,
                r.purchaseId,
                r.invNo,
                r.challanNo,
                r.vendor,
                r.item,
                r.qty,
                r.rate,
                r.totalAmount.toFixed(2),
                r.bankPaid.toFixed(2),
                r.balanceDue.toFixed(2),
                r.paymentStatus,
                r.department,
                r.category,
                r.subCategory,
                r.bankUtr
            ]);
        }

        const csvContent = '\uFEFF' + [
            headers.map(escapeCsvCell).join(','),
            ...rows.map(row => row.map(escapeCsvCell).join(','))
        ].join('\r\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const filename = `Prayosha_Report_${type}_${new Date().toISOString().split('T')[0]}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function escapeCsvCell(cell) {
        if (cell === null || cell === undefined) return '""';
        const str = String(cell).replace(/"/g, '""');
        return `"${str}"`;
    }

    // -------------------------------------------------------------------------
    // PDF PRINT EXPORT LOGIC
    // -------------------------------------------------------------------------
    function exportToPdf(type, records) {
        const printWindow = window.open('', '_blank');
        const title = reportTypeSelect ? reportTypeSelect.options[reportTypeSelect.selectedIndex].text : 'Financial Report';
        const nowStr = new Date().toLocaleString('en-IN');

        let tableHeaderHtml = '';
        let tableRowsHtml = '';

        if (type === 'VENDOR_SUMMARY') {
            const grouped = aggregateByVendor(records);
            tableHeaderHtml = `
                <tr>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Vendor</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">Bills</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Total Billed</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Bank Cleared</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Balance Due</th>
                </tr>
            `;
            tableRowsHtml = grouped.map(v => `
                <tr>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: bold;">${escapeHtml(v.vendor)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: center;">${v.count}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right;">${formatINR(v.totalBilled)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #059669;">${formatINR(v.totalPaid)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #e11d48; font-weight: bold;">${formatINR(v.balance)}</td>
                </tr>
            `).join('');
        } else {
            tableHeaderHtml = `
                <tr>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Date</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Purchase ID</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Vendor</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Item Description</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Total</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Bank Paid</th>
                    <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Balance</th>
                </tr>
            `;
            tableRowsHtml = records.map(r => `
                <tr>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${escapeHtml(r.date)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-family: monospace;">${escapeHtml(r.purchaseId)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 600;">${escapeHtml(r.vendor)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${escapeHtml(r.item)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${formatINR(r.totalAmount)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #059669;">${formatINR(r.bankPaid)}</td>
                    <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #e11d48; font-weight: bold;">${formatINR(r.balanceDue)}</td>
                </tr>
            `).join('');
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title} - Prayosha ERP</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1e293b; padding: 20px; }
                    .header { border-bottom: 2px solid #1E3A5F; padding-bottom: 12px; margin-bottom: 15px; }
                    .header-title { font-size: 18px; font-weight: bold; color: #1E3A5F; margin: 0; }
                    .meta-row { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #64748b; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10.5px; }
                    th { background-color: #f8fafc; color: #1E3A5F; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1 class="header-title">PRAYOSHA GROUP - ${title.toUpperCase()}</h1>
                    <div class="meta-row">
                        <span><strong>Project Context:</strong> ${escapeHtml(activeProjectName)}</span>
                        <span><strong>Generated On:</strong> ${nowStr}</span>
                    </div>
                </div>
                <table>
                    <thead>${tableHeaderHtml}</thead>
                    <tbody>${tableRowsHtml}</tbody>
                </table>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }

    // =========================================================================
    // 10. UI HELPERS & LISTENERS
    // =========================================================================
    function setGeneratingState(isBusy) {
        if (!generateDownloadBtn) return;
        generateDownloadBtn.disabled = isBusy;
        if (isBusy) {
            if (generateSpinner) generateSpinner.classList.remove('hidden');
            if (generateBtnIcon) generateBtnIcon.classList.add('hidden');
            if (generateBtnText) generateBtnText.textContent = 'Compiling Report...';
            generateDownloadBtn.classList.add('opacity-75', 'cursor-not-allowed');
        } else {
            if (generateSpinner) generateSpinner.classList.add('hidden');
            if (generateBtnIcon) generateBtnIcon.classList.remove('hidden');
            if (generateBtnText) generateBtnText.textContent = 'Generate & Download';
            generateDownloadBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
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

    if (reportTypeSelect) reportTypeSelect.addEventListener('change', updatePreview);
    if (filterDepartment) filterDepartment.addEventListener('change', updatePreview);
    if (filterStatus) filterStatus.addEventListener('change', updatePreview);
    if (filterVendor) filterVendor.addEventListener('input', updatePreview);
    if (customStartDate) customStartDate.addEventListener('change', updatePreview);
    if (customEndDate) customEndDate.addEventListener('change', updatePreview);

    // Initial Execution
    fetchDataset();
});