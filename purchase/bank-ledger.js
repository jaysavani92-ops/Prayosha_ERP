/**
 * Prayosha ERP - Bank Ledger Sub-Module Logic
 * File: /purchase/bank-ledger.js
 * 
 * Features:
 * 1. Tracks verified banking disbursements, RTGS, NEFT, and cheque clearances.
 * 2. Real-time KPI metrics: Total Bank Outflow, Transaction Count, Unique Vendors, and Average Value.
 * 3. Sorting by date, amount, and vendor name with instantaneous multi-field search.
 * 4. Full transaction audit modal with attached invoice receipts and CBS classifications.
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
        console.error('[Bank Ledger] Supabase client failed to initialize.');
        return;
    }

    // =========================================================================
    // 2. DOM ELEMENT SELECTORS
    // =========================================================================
    const activeProjectDisplay = document.getElementById('activeProjectDisplay');

    // KPI Summary Elements
    const kpiTotalBankOutflow = document.getElementById('kpiTotalBankOutflow');
    const kpiBankTxnCount = document.getElementById('kpiBankTxnCount');
    const kpiBankVendorsCount = document.getElementById('kpiBankVendorsCount');
    const kpiAvgBankTxn = document.getElementById('kpiAvgBankTxn');

    // Controls & Search
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshSpinner = document.getElementById('refreshSpinner');

    // Table Containers
    const bankTableBody = document.getElementById('bankTableBody');
    const loadingRow = document.getElementById('loadingRow');
    const emptyState = document.getElementById('emptyState');

    // Modal Elements
    const txnModal = document.getElementById('txnModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    // =========================================================================
    // 3. STATE & WORKSPACE CONTEXT
    // =========================================================================
    let allBankRecords = [];
    let activeProjectId = localStorage.getItem('activeProjectId') || '';
    let activeProjectName = localStorage.getItem('activeProjectName') || 'Current Site';

    if (activeProjectDisplay) {
        activeProjectDisplay.textContent = activeProjectName;
    }

    // React to Project Change Triggered from Universal Shell
    window.addEventListener('projectChanged', (e) => {
        if (e.detail) {
            activeProjectId = e.detail.projectId;
            activeProjectName = e.detail.projectName || 'Current Site';
            if (activeProjectDisplay) {
                activeProjectDisplay.textContent = activeProjectName;
            }
            fetchBankDisbursements();
        }
    });

    const formatINR = (val) => {
        const num = parseFloat(val) || 0;
        return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };

    // =========================================================================
    // 4. DATA FETCHING (BANK CLEARED PURCHASES)
    // =========================================================================
    async function fetchBankDisbursements() {
        setLoadingState(true);

        try {
            let query = supabaseClient
                .from('purchase_logs')
                .select('*')
                .order('created_at', { ascending: false });

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

            // Filter strictly for records where Bank_Paid is greater than 0
            const normalized = (data || []).map(normalizeRecord);
            allBankRecords = normalized.filter(r => r.bankPaid > 0);

            updateKPICounters(allBankRecords);
            renderTable(filterAndSortRecords());

        } catch (err) {
            console.error('[Bank Ledger] Data retrieval notice:', err);
            if (bankTableBody) {
                bankTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="py-8 text-center text-slate-400 font-medium text-xs">
                            No bank disbursements found in current database scope.
                        </td>
                    </tr>
                `;
            }
            if (emptyState) emptyState.classList.add('hidden');
        } finally {
            setLoadingState(false);
        }
    }

    function normalizeRecord(raw) {
        const total = parseFloat(raw.Total_Amount || raw.total_amount || raw.amount || 0);
        const bankPaid = parseFloat(raw.Bank_Paid || raw.bank_paid || 0);

        let status = (raw.Payment_Status || raw.payment_status || '').toUpperCase().trim();
        if (!status) {
            if (bankPaid >= total && total > 0) status = 'PAID';
            else if (bankPaid > 0) status = 'PARTIAL';
            else status = 'PENDING';
        }

        return {
            id: raw.id || raw.Purchase_ID || raw.purchase_id,
            purchaseId: raw.Purchase_ID || raw.purchase_id || ('PUR-' + (raw.id ? String(raw.id).slice(0, 5) : '000')),
            date: raw.Inv_Date || raw.inv_date || raw.date || raw.created_at?.split('T')[0] || 'N/A',
            invNo: raw.Inv_No || raw.inv_no || 'N/A',
            challanNo: raw.Challan_No || raw.challan_no || 'N/A',
            vendor: raw.Vendor_Name || raw.vendor_name || raw.vendor || 'Unknown Vendor',
            item: raw.Item_Description || raw.item_description || raw.material || 'Materials',
            qty: parseFloat(raw.Qty || raw.qty || raw.quantity || 0),
            rate: parseFloat(raw.Rate || raw.rate || 0),
            totalAmount: total,
            bankPaid: bankPaid,
            bankUtr: raw.Bank_UTR_Transfer_No || raw.bank_utr || 'Not Recorded',
            paymentStatus: status,
            department: raw.Department || raw.department || 'Civil Work',
            category: raw.Category || raw.category || 'Procurement',
            subCategory: raw.Sub_Category || raw.sub_category || 'General',
            billLink: raw.Bill_Link || raw.bill_link || raw.bill_url || raw.invoice_photo || '',
            notes: raw.notes || raw.Notes || ''
        };
    }

    // =========================================================================
    // 5. KPI METRICS EVALUATION
    // =========================================================================
    function updateKPICounters(records) {
        let totalOutflow = 0;
        const uniqueVendors = new Set();

        records.forEach(r => {
            totalOutflow += r.bankPaid;
            if (r.vendor) uniqueVendors.add(r.vendor.trim().toLowerCase());
        });

        const txnCount = records.length;
        const avgTxn = txnCount > 0 ? totalOutflow / txnCount : 0;

        if (kpiTotalBankOutflow) kpiTotalBankOutflow.textContent = formatINR(totalOutflow);
        if (kpiBankTxnCount) kpiBankTxnCount.textContent = txnCount;
        if (kpiBankVendorsCount) kpiBankVendorsCount.textContent = uniqueVendors.size;
        if (kpiAvgBankTxn) kpiAvgBankTxn.textContent = formatINR(avgTxn);
    }

    // =========================================================================
    // 6. FILTERING & SORTING LOGIC
    // =========================================================================
    function filterAndSortRecords() {
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const sortBy = sortSelect ? sortSelect.value : 'DATE_DESC';

        let result = allBankRecords.filter(r => {
            return !searchTerm ||
                r.vendor.toLowerCase().includes(searchTerm) ||
                r.item.toLowerCase().includes(searchTerm) ||
                r.purchaseId.toLowerCase().includes(searchTerm) ||
                r.invNo.toLowerCase().includes(searchTerm) ||
                r.bankUtr.toLowerCase().includes(searchTerm) ||
                r.department.toLowerCase().includes(searchTerm);
        });

        result.sort((a, b) => {
            if (sortBy === 'DATE_DESC') {
                return new Date(b.date) - new Date(a.date);
            } else if (sortBy === 'DATE_ASC') {
                return new Date(a.date) - new Date(b.date);
            } else if (sortBy === 'AMOUNT_DESC') {
                return b.bankPaid - a.bankPaid;
            } else if (sortBy === 'VENDOR_ASC') {
                return a.vendor.localeCompare(b.vendor);
            }
            return 0;
        });

        return result;
    }

    // =========================================================================
    // 7. RENDER BANK LEDGER TABLE
    // =========================================================================
    function renderTable(records) {
        if (!bankTableBody) return;
        bankTableBody.innerHTML = '';

        if (records.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/80 transition-colors border-b border-slate-100';

            const statusBadge = r.paymentStatus === 'PAID'
                ? '<span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">CLEARED</span>'
                : '<span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">PARTIAL</span>';

            const billAction = r.billLink
                ? `<a href="${escapeHtml(r.billLink)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#1E3A5F] hover:text-white text-slate-700 font-semibold text-[11px] transition inline-flex items-center gap-1"><span>📎</span> View</a>`
                : `<button type="button" data-id="${escapeHtml(r.purchaseId)}" class="details-btn px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-[11px] transition cursor-pointer">Audit</button>`;

            tr.innerHTML = `
                <td class="py-3.5 px-4 font-semibold text-slate-700">${escapeHtml(r.date)}</td>
                <td class="py-3.5 px-4 font-bold text-slate-800">${escapeHtml(r.vendor)}</td>
                <td class="py-3.5 px-4">
                    <span class="font-semibold text-[#1E3A5F] block">${escapeHtml(r.item)}</span>
                    <span class="text-[10px] text-slate-400">${escapeHtml(r.department)} &gt; ${escapeHtml(r.category)}</span>
                </td>
                <td class="py-3.5 px-4 text-slate-600">
                    <span class="font-medium block">${escapeHtml(r.invNo)}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(r.purchaseId)}</span>
                </td>
                <td class="py-3.5 px-4 font-mono font-semibold text-slate-700 max-w-xs truncate" title="${escapeHtml(r.bankUtr)}">
                    ${escapeHtml(r.bankUtr)}
                </td>
                <td class="py-3.5 px-4 text-right font-bold text-emerald-600 text-sm">
                    ${formatINR(r.bankPaid)}
                </td>
                <td class="py-3.5 px-4 text-center">
                    ${statusBadge}
                </td>
                <td class="py-3.5 px-4 text-center">
                    ${billAction}
                </td>
            `;

            bankTableBody.appendChild(tr);
        });

        // Attach modal trigger listeners
        document.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pid = e.currentTarget.getAttribute('data-id');
                const matched = allBankRecords.find(item => item.purchaseId === pid);
                if (matched) openDetailsModal(matched);
            });
        });
    }

    // =========================================================================
    // 8. TRANSACTION AUDIT MODAL
    // =========================================================================
    function openDetailsModal(record) {
        if (!txnModal || !modalTitle || !modalContent) return;

        modalTitle.textContent = `Bank Transfer Audit: ${record.purchaseId}`;

        modalContent.innerHTML = `
            <div class="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Vendor Name</span>
                    <span class="font-bold text-slate-800 text-sm">${escapeHtml(record.vendor)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Payment Date</span>
                    <span class="font-semibold text-slate-700">${escapeHtml(record.date)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Invoice Number</span>
                    <span class="font-semibold text-slate-700">${escapeHtml(record.invNo)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Challan Number</span>
                    <span class="font-semibold text-slate-700">${escapeHtml(record.challanNo)}</span>
                </div>
            </div>

            <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Bank Transfer Credentials</span>
                <div class="flex justify-between items-center">
                    <span class="text-slate-500 font-medium">Bank UTR / Reference:</span>
                    <span class="font-mono font-bold text-[#1E3A5F]">${escapeHtml(record.bankUtr)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-500 font-medium">Amount Cleared:</span>
                    <span class="font-bold text-emerald-600 text-sm">${formatINR(record.bankPaid)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-slate-500 font-medium">Gross Billed Value:</span>
                    <span class="font-semibold text-slate-700">${formatINR(record.totalAmount)}</span>
                </div>
            </div>

            <div class="space-y-1.5">
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Cost Classification (CBS)</span>
                <div class="flex flex-wrap gap-2 text-[11px]">
                    <span class="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg font-medium">Dept: ${escapeHtml(record.department)}</span>
                    <span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg font-medium">Cat: ${escapeHtml(record.category)}</span>
                    <span class="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-lg font-medium">Sub: ${escapeHtml(record.subCategory)}</span>
                </div>
            </div>

            ${record.notes ? `
                <div class="pt-1">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Disbursement Notes</span>
                    <p class="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">${escapeHtml(record.notes)}</p>
                </div>
            ` : ''}

            ${record.billLink ? `
                <div class="pt-2">
                    <a href="${escapeHtml(record.billLink)}" target="_blank" rel="noopener noreferrer" class="w-full py-2.5 rounded-xl bg-[#1E3A5F] text-white font-semibold text-xs hover:bg-[#FFBF00] hover:text-[#1E3A5F] transition flex items-center justify-center gap-2">
                        <span>📎</span> View Attached Invoice Photo / Challan
                    </a>
                </div>
            ` : ''}
        `;

        txnModal.classList.remove('hidden');
        void txnModal.offsetWidth;
        txnModal.classList.remove('opacity-0');
        txnModal.classList.add('opacity-100');
    }

    function closeDetailsModal() {
        if (!txnModal) return;
        txnModal.classList.remove('opacity-100');
        txnModal.classList.add('opacity-0');
        setTimeout(() => {
            txnModal.classList.add('hidden');
        }, 300);
    }

    if (modalBackdrop) modalBackdrop.addEventListener('click', closeDetailsModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeDetailsModal);

    // =========================================================================
    // 9. UI HELPERS & EVENT LISTENERS
    // =========================================================================
    function setLoadingState(isLoading) {
        if (!refreshBtn) return;
        if (isLoading) {
            if (refreshSpinner) refreshSpinner.classList.add('animate-spin');
            refreshBtn.disabled = true;
            if (loadingRow) loadingRow.classList.remove('hidden');
        } else {
            if (refreshSpinner) refreshSpinner.classList.remove('animate-spin');
            refreshBtn.disabled = false;
            if (loadingRow) loadingRow.classList.add('hidden');
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

    if (searchInput) searchInput.addEventListener('input', () => renderTable(filterAndSortRecords()));
    if (sortSelect) sortSelect.addEventListener('change', () => renderTable(filterAndSortRecords()));
    if (refreshBtn) refreshBtn.addEventListener('click', fetchBankDisbursements);

    // Initial Execution
    fetchBankDisbursements();
});