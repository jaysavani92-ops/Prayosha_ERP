/**
 * Prayosha ERP - Purchase Ledger Sub-Module Logic
 * File: /purchase/purchase-ledger.js
 */

import { supabase, CONFIG } from '../config.js';

document.addEventListener('DOMContentLoaded', async () => {

    // 1. Resolve Primary Supabase Client (ESM Import with Window Fallback)
    const supabaseClient = supabase || window.supabaseClient || (
        typeof window.supabase !== 'undefined' && CONFIG?.SUPABASE_URL
            ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
            : null
    );

    if (!supabaseClient) {
        console.error('[Purchase Ledger] Primary Supabase client could not be initialized.');
        return;
    }

    // 2. DOM Elements
    const activeProjectDisplay = document.getElementById('activeProjectDisplay');
    const kpiTotalInvoices = document.getElementById('kpiTotalInvoices');
    const kpiBilledTotal = document.getElementById('kpiBilledTotal');
    const kpiBankPaid = document.getElementById('kpiBankPaid');
    const kpiBalanceDue = document.getElementById('kpiBalanceDue');
    const ledgerTableBody = document.getElementById('ledgerTableBody');
    const loadingRow = document.getElementById('loadingRow');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshSpinner = document.getElementById('refreshSpinner');

    // Modal DOM Elements
    const detailsModal = document.getElementById('detailsModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    // 3. State Management
    let allRecords = [];
    let activeProjectId = localStorage.getItem('activeProjectId') || '';
    let activeProjectName = localStorage.getItem('activeProjectName') || 'Current Site';

    if (activeProjectDisplay) {
        activeProjectDisplay.textContent = activeProjectName;
    }

    // Listen for project switch triggered from universal shell
    window.addEventListener('projectChanged', (e) => {
        if (e.detail) {
            activeProjectId = e.detail.projectId;
            activeProjectName = e.detail.projectName || 'Current Site';
            if (activeProjectDisplay) {
                activeProjectDisplay.textContent = activeProjectName;
            }
            fetchPurchaseRecords();
        }
    });

    // 4. Currency Formatter (Indian numbering format)
    const formatINR = (val) => {
        const num = parseFloat(val) || 0;
        return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };

    // 5. Data Fetching
    async function fetchPurchaseRecords() {
        setLoadingState(true);

        try {
            let query = supabaseClient
                .from('purchase_logs')
                .select('*')
                .order('created_at', { ascending: false });

            // If active project is scoped, filter by project_id
            if (activeProjectId) {
                query = query.or(`project_id.eq.${activeProjectId},project_id.is.null`);
            }

            let { data, error } = await query;

            // Handle PostgREST table-not-found code (PGRST205) or PostgreSQL table-not-found code (42P01)
            if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
                const fallback = await supabaseClient
                    .from('purchases')
                    .select('*')
                    .order('created_at', { ascending: false });
                data = fallback.data;
                error = fallback.error;
            }

            if (error) {
                throw error;
            }

            allRecords = (data || []).map(normalizeRecord);
            updateKPIs(allRecords);
            renderTable(filterRecords());

        } catch (err) {
            console.error('[Purchase Ledger] Error fetching records:', err);
            if (ledgerTableBody) {
                ledgerTableBody.innerHTML = `
                    <tr>
                        <td colspan="10" class="py-8 text-center text-rose-500 font-semibold text-xs">
                            Failed to load purchase records. Ensure the 'purchase_logs' table exists in Supabase.
                        </td>
                    </tr>
                `;
            }
            if (emptyState) {
                emptyState.classList.add('hidden');
            }
        } finally {
            setLoadingState(false);
        }
    }

    // Normalize field variations matching DB_Financials schema
    function normalizeRecord(raw) {
        const total = parseFloat(raw.Total_Amount || raw.total_amount || raw.amount || 0);
        const bankPaid = parseFloat(raw.Bank_Paid || raw.bank_paid || 0);
        let balance = total - bankPaid;
        if (balance < 0) balance = 0;

        let status = (raw.Payment_Status || raw.payment_status || '').toUpperCase().trim();
        if (!status) {
            if (bankPaid >= total && total > 0) status = 'PAID';
            else if (bankPaid > 0 && bankPaid < total) status = 'PARTIAL';
            else status = 'PENDING';
        }

        return {
            id: raw.id || raw.Purchase_ID || raw.purchase_id || 'N/A',
            purchaseId: raw.Purchase_ID || raw.purchase_id || ('PUR-' + (raw.id ? String(raw.id).slice(0, 5) : '000')),
            date: raw.Inv_Date || raw.inv_date || raw.date || raw.created_at?.split('T')[0] || 'N/A',
            invNo: raw.Inv_No || raw.inv_no || 'N/A',
            challanNo: raw.Challan_No || raw.challan_no || 'N/A',
            vendor: raw.Vendor_Name || raw.vendor_name || raw.vendor || 'Unknown Vendor',
            item: raw.Item_Description || raw.item_description || raw.material || 'Material Item',
            qty: parseFloat(raw.Qty || raw.qty || raw.quantity || 0),
            rate: parseFloat(raw.Rate || raw.rate || 0),
            totalAmount: total,
            bankPaid: bankPaid,
            balanceDue: balance,
            bankUtr: raw.Bank_UTR_Transfer_No || raw.bank_utr || 'N/A',
            department: raw.Department || raw.department || 'Civil Work',
            category: raw.Category || raw.category || 'Procurement',
            subCategory: raw.Sub_Category || raw.sub_category || 'General',
            billLink: raw.Bill_Link || raw.bill_link || raw.bill_url || raw.invoice_photo || '',
            paymentStatus: status,
            notes: raw.notes || raw.Notes || ''
        };
    }

    // 6. Calculate Financial KPIs
    function updateKPIs(records) {
        let totalCount = records.length;
        let sumBilled = 0;
        let sumBankPaid = 0;
        let sumBalance = 0;

        records.forEach(r => {
            sumBilled += r.totalAmount;
            sumBankPaid += r.bankPaid;
            sumBalance += r.balanceDue;
        });

        if (kpiTotalInvoices) kpiTotalInvoices.textContent = totalCount;
        if (kpiBilledTotal) kpiBilledTotal.textContent = formatINR(sumBilled);
        if (kpiBankPaid) kpiBankPaid.textContent = formatINR(sumBankPaid);
        if (kpiBalanceDue) kpiBalanceDue.textContent = formatINR(sumBalance);
    }

    // 7. Filtering & Search Engine
    function filterRecords() {
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const selectedStatus = statusFilter ? statusFilter.value : 'ALL';

        return allRecords.filter(r => {
            const matchesSearch = !searchTerm || 
                r.purchaseId.toLowerCase().includes(searchTerm) ||
                r.vendor.toLowerCase().includes(searchTerm) ||
                r.item.toLowerCase().includes(searchTerm) ||
                r.invNo.toLowerCase().includes(searchTerm) ||
                r.challanNo.toLowerCase().includes(searchTerm);

            const matchesStatus = selectedStatus === 'ALL' || r.paymentStatus === selectedStatus;

            return matchesSearch && matchesStatus;
        });
    }

    // 8. Render Table Rows
    function renderTable(records) {
        if (!ledgerTableBody) return;
        ledgerTableBody.innerHTML = '';

        if (records.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/80 transition-colors border-b border-slate-100';

            let badgeClass = 'bg-amber-100 text-amber-800 border border-amber-200';
            if (r.paymentStatus === 'PAID') {
                badgeClass = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
            } else if (r.paymentStatus === 'PARTIAL') {
                badgeClass = 'bg-blue-100 text-blue-800 border border-blue-200';
            } else if (r.paymentStatus === 'PENDING') {
                badgeClass = 'bg-rose-100 text-rose-800 border border-rose-200';
            }

            tr.innerHTML = `
                <td class="py-3 px-4 font-bold text-[#1E3A5F]">${escapeHtml(r.purchaseId)}</td>
                <td class="py-3 px-4 text-slate-500">${escapeHtml(r.date)}</td>
                <td class="py-3 px-4 font-semibold text-slate-800">${escapeHtml(r.vendor)}</td>
                <td class="py-3 px-4 text-slate-700 max-w-xs truncate" title="${escapeHtml(r.item)}">${escapeHtml(r.item)}</td>
                <td class="py-3 px-4 text-center font-medium text-slate-600">${r.qty > 0 ? r.qty : '-'}</td>
                <td class="py-3 px-4 text-right text-slate-600">${r.rate > 0 ? formatINR(r.rate) : '-'}</td>
                <td class="py-3 px-4 text-right font-bold text-[#1E3A5F]">${formatINR(r.totalAmount)}</td>
                <td class="py-3 px-4 text-right font-semibold text-emerald-600">${formatINR(r.bankPaid)}</td>
                <td class="py-3 px-4 text-center">
                    <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeClass}">
                        ${r.paymentStatus}
                    </span>
                </td>
                <td class="py-3 px-4 text-center">
                    <button type="button" data-id="${escapeHtml(r.purchaseId)}" class="view-btn px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#1E3A5F] hover:text-white text-slate-700 font-semibold text-[11px] transition cursor-pointer">
                        View
                    </button>
                </td>
            `;

            ledgerTableBody.appendChild(tr);
        });

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pid = e.currentTarget.getAttribute('data-id');
                const selected = allRecords.find(item => item.purchaseId === pid);
                if (selected) openModal(selected);
            });
        });
    }

    // 9. Details Modal Logic
    function openModal(record) {
        if (!detailsModal || !modalTitle || !modalContent) return;

        modalTitle.textContent = `${record.purchaseId} - ${record.vendor}`;

        modalContent.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Invoice Date</span>
                    <span class="font-semibold text-slate-700">${escapeHtml(record.date)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Invoice No</span>
                    <span class="font-semibold text-slate-700">${escapeHtml(record.invNo)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Challan No</span>
                    <span class="font-semibold text-slate-700">${escapeHtml(record.challanNo)}</span>
                </div>
            </div>

            <div class="space-y-2">
                <span class="text-[10px] uppercase font-bold text-slate-400 block">Cost Breakdown Structure (CBS)</span>
                <div class="flex flex-wrap gap-2 text-[11px]">
                    <span class="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg font-medium">Dept: ${escapeHtml(record.department)}</span>
                    <span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg font-medium">Category: ${escapeHtml(record.category)}</span>
                    <span class="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-lg font-medium">Sub: ${escapeHtml(record.subCategory)}</span>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Total Billed</span>
                    <span class="text-base font-bold text-[#1E3A5F]">${formatINR(record.totalAmount)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Bank Paid (Official)</span>
                    <span class="text-base font-bold text-emerald-600">${formatINR(record.bankPaid)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Bank UTR / Ref No</span>
                    <span class="font-mono text-slate-700">${escapeHtml(record.bankUtr)}</span>
                </div>
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block">Pending Balance</span>
                    <span class="text-base font-bold text-rose-600">${formatINR(record.balanceDue)}</span>
                </div>
            </div>

            ${record.billLink ? `
                <div class="pt-2">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Attached Bill / Challan Document</span>
                    <a href="${escapeHtml(record.billLink)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E3A5F] text-white font-semibold text-[11px] hover:bg-[#FFBF00] hover:text-[#1E3A5F] transition">
                        <span>📎</span> View Invoice Photo / Bill
                    </a>
                </div>
            ` : ''}

            ${record.notes ? `
                <div class="pt-1">
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Notes & Remarks</span>
                    <p class="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">${escapeHtml(record.notes)}</p>
                </div>
            ` : ''}
        `;

        detailsModal.classList.remove('hidden');
        void detailsModal.offsetWidth;
        detailsModal.classList.remove('opacity-0');
        detailsModal.classList.add('opacity-100');
    }

    function closeModal() {
        if (!detailsModal) return;
        detailsModal.classList.remove('opacity-100');
        detailsModal.classList.add('opacity-0');
        setTimeout(() => {
            detailsModal.classList.add('hidden');
        }, 300);
    }

    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

    // 10. UI Helpers
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

    // 11. Event Listeners
    if (searchInput) searchInput.addEventListener('input', () => renderTable(filterRecords()));
    if (statusFilter) statusFilter.addEventListener('change', () => renderTable(filterRecords()));
    if (refreshBtn) refreshBtn.addEventListener('click', fetchPurchaseRecords);

    // Initial Load
    fetchPurchaseRecords();
});