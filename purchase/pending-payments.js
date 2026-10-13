/**
 * Prayosha ERP - Pending Payments & Liabilities Sub-Module Logic
 * File: /purchase/pending-payments.js
 * 
 * Features:
 * 1. Tracks unsettled procurement payables and outstanding vendor dues.
 * 2. Live KPI calculations: Total Liability, Unsettled Count, Partial Bills, and Impacted Vendors.
 * 3. Sorting by balance, date, and vendor name with instant search filtering.
 * 4. Bank settlement execution modal: Clears dues with UTR references and updates Supabase.
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
        console.error('[Pending Payments] Supabase client failed to initialize.');
        return;
    }

    // =========================================================================
    // 2. DOM ELEMENT SELECTORS
    // =========================================================================
    const activeProjectDisplay = document.getElementById('activeProjectDisplay');

    // KPI Summary
    const kpiTotalPendingBalance = document.getElementById('kpiTotalPendingBalance');
    const kpiUnsettledCount = document.getElementById('kpiUnsettledCount');
    const kpiPartialBillsCount = document.getElementById('kpiPartialBillsCount');
    const kpiVendorsCount = document.getElementById('kpiVendorsCount');

    // Controls & Search
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshSpinner = document.getElementById('refreshSpinner');

    // Table Containers
    const liabilitiesTableBody = document.getElementById('liabilitiesTableBody');
    const loadingRow = document.getElementById('loadingRow');
    const emptyState = document.getElementById('emptyState');

    // Settlement Modal Elements
    const settlementModal = document.getElementById('settlementModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalVendorDisplay = document.getElementById('modalVendorDisplay');
    const modalBillRefDisplay = document.getElementById('modalBillRefDisplay');
    const modalTotalDueDisplay = document.getElementById('modalTotalDueDisplay');
    const modalPaidSoFarDisplay = document.getElementById('modalPaidSoFarDisplay');
    const modalRemainingBalanceDisplay = document.getElementById('modalRemainingBalanceDisplay');
    const settlementForm = document.getElementById('settlementForm');
    const payAmountInput = document.getElementById('payAmountInput');
    const payUtrInput = document.getElementById('payUtrInput');
    const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
    const paymentSpinner = document.getElementById('paymentSpinner');
    const confirmPaymentBtnText = document.getElementById('confirmPaymentBtnText');

    // =========================================================================
    // 3. STATE & WORKSPACE CONTEXT
    // =========================================================================
    let allPendingRecords = [];
    let selectedRecordForSettlement = null;

    let activeProjectId = localStorage.getItem('activeProjectId') || '';
    let activeProjectName = localStorage.getItem('activeProjectName') || 'Current Site';
    
    if (activeProjectDisplay) {
        activeProjectDisplay.textContent = activeProjectName;
    }

    // Project Switch Listener (Triggered from universal navigation shell)
    window.addEventListener('projectChanged', (e) => {
        if (e.detail) {
            activeProjectId = e.detail.projectId;
            activeProjectName = e.detail.projectName || 'Current Site';
            if (activeProjectDisplay) {
                activeProjectDisplay.textContent = activeProjectName;
            }
            fetchPendingLiabilities();
        }
    });

    const formatINR = (val) => {
        const num = parseFloat(val) || 0;
        return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };

    // =========================================================================
    // 4. DATA FETCHING (UNSETTLED PURCHASES)
    // =========================================================================
    async function fetchPendingLiabilities() {
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

            // Normalize and strictly isolate records with remaining payable balance
            const normalized = (data || []).map(normalizeRecord);
            allPendingRecords = normalized.filter(r => r.balanceDue > 0.01 && r.paymentStatus !== 'PAID');

            updateKPICounters(allPendingRecords);
            renderTable(filterAndSortRecords());

        } catch (err) {
            console.error('[Pending Payments] Data fetch notice:', err);
            if (liabilitiesTableBody) {
                liabilitiesTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="py-8 text-center text-slate-400 font-medium text-xs">
                            No unsettled records found in current database scope.
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
            date: raw.Inv_Date || raw.inv_date || raw.date || raw.created_at?.split('T')[0] || 'N/A',
            invNo: raw.Inv_No || raw.inv_no || 'N/A',
            challanNo: raw.Challan_No || raw.challan_no || 'N/A',
            vendor: raw.Vendor_Name || raw.vendor_name || raw.vendor || 'Unknown Vendor',
            item: raw.Item_Description || raw.item_description || raw.material || 'Materials',
            totalAmount: total,
            bankPaid: bankPaid,
            balanceDue: balance,
            bankUtr: raw.Bank_UTR_Transfer_No || raw.bank_utr || '',
            paymentStatus: status,
            department: raw.Department || raw.department || 'Civil Work'
        };
    }

    // =========================================================================
    // 5. KPI SUMMARY COMPUTATION
    // =========================================================================
    function updateKPICounters(records) {
        let sumBalance = 0;
        let partialCount = 0;
        const uniqueVendors = new Set();

        records.forEach(r => {
            sumBalance += r.balanceDue;
            if (r.bankPaid > 0) partialCount++;
            if (r.vendor) uniqueVendors.add(r.vendor.trim().toLowerCase());
        });

        if (kpiTotalPendingBalance) kpiTotalPendingBalance.textContent = formatINR(sumBalance);
        if (kpiUnsettledCount) kpiUnsettledCount.textContent = records.length;
        if (kpiPartialBillsCount) kpiPartialBillsCount.textContent = partialCount;
        if (kpiVendorsCount) kpiVendorsCount.textContent = uniqueVendors.size;
    }

    // =========================================================================
    // 6. FILTERING & SORTING LOGIC
    // =========================================================================
    function filterAndSortRecords() {
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const sortBy = sortSelect ? sortSelect.value : 'BALANCE_DESC';

        let result = allPendingRecords.filter(r => {
            return !searchTerm ||
                r.vendor.toLowerCase().includes(searchTerm) ||
                r.item.toLowerCase().includes(searchTerm) ||
                r.purchaseId.toLowerCase().includes(searchTerm) ||
                r.invNo.toLowerCase().includes(searchTerm) ||
                r.challanNo.toLowerCase().includes(searchTerm);
        });

        result.sort((a, b) => {
            if (sortBy === 'BALANCE_DESC') {
                return b.balanceDue - a.balanceDue;
            } else if (sortBy === 'DATE_ASC') {
                return new Date(a.date) - new Date(b.date);
            } else if (sortBy === 'DATE_DESC') {
                return new Date(b.date) - new Date(a.date);
            } else if (sortBy === 'VENDOR_ASC') {
                return a.vendor.localeCompare(b.vendor);
            }
            return 0;
        });

        return result;
    }

    // =========================================================================
    // 7. RENDER PENDING TABLE
    // =========================================================================
    function renderTable(records) {
        if (!liabilitiesTableBody) return;
        liabilitiesTableBody.innerHTML = '';

        if (records.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/80 transition-colors border-b border-slate-100';

            const statusBadge = r.paymentStatus === 'PARTIAL'
                ? '<span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">PARTIAL</span>'
                : '<span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">PENDING</span>';

            tr.innerHTML = `
                <td class="py-3.5 px-4 font-bold text-slate-800">${escapeHtml(r.vendor)}</td>
                <td class="py-3.5 px-4">
                    <span class="font-semibold text-[#1E3A5F] block">${escapeHtml(r.item)}</span>
                    <span class="text-[10px] text-slate-400">Bill #${escapeHtml(r.invNo)} | ${escapeHtml(r.purchaseId)}</span>
                </td>
                <td class="py-3.5 px-4 text-slate-500">${escapeHtml(r.date)}</td>
                <td class="py-3.5 px-4 text-right font-medium text-slate-700">${formatINR(r.totalAmount)}</td>
                <td class="py-3.5 px-4 text-right font-medium text-emerald-600">${formatINR(r.bankPaid)}</td>
                <td class="py-3.5 px-4 text-right font-bold text-rose-600 text-sm">${formatINR(r.balanceDue)}</td>
                <td class="py-3.5 px-4 text-center">${statusBadge}</td>
                <td class="py-3.5 px-4 text-center">
                    <button type="button" data-id="${escapeHtml(r.purchaseId)}" class="pay-btn px-3 py-1.5 rounded-xl bg-[#1E3A5F] hover:bg-[#FFBF00] hover:text-[#1E3A5F] text-white font-bold text-[11px] transition shadow-sm flex items-center gap-1 mx-auto cursor-pointer">
                        <span>💳</span> Settle Bill
                    </button>
                </td>
            `;

            liabilitiesTableBody.appendChild(tr);
        });

        // Attach modal trigger listeners
        document.querySelectorAll('.pay-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pid = e.currentTarget.getAttribute('data-id');
                const matched = allPendingRecords.find(item => item.purchaseId === pid);
                if (matched) openSettlementModal(matched);
            });
        });
    }

    // =========================================================================
    // 8. SETTLEMENT MODAL EXECUTION
    // =========================================================================
    function openSettlementModal(record) {
        selectedRecordForSettlement = record;

        if (modalVendorDisplay) modalVendorDisplay.textContent = record.vendor;
        if (modalBillRefDisplay) modalBillRefDisplay.textContent = `Bill #${record.invNo} (${record.purchaseId})`;
        if (modalTotalDueDisplay) modalTotalDueDisplay.textContent = formatINR(record.totalAmount);
        if (modalPaidSoFarDisplay) modalPaidSoFarDisplay.textContent = formatINR(record.bankPaid);
        if (modalRemainingBalanceDisplay) modalRemainingBalanceDisplay.textContent = formatINR(record.balanceDue);

        // Pre-fill full remaining balance as default
        if (payAmountInput) {
            payAmountInput.value = record.balanceDue.toFixed(2);
            payAmountInput.max = record.balanceDue.toFixed(2);
        }
        if (payUtrInput) payUtrInput.value = '';

        if (settlementModal) {
            settlementModal.classList.remove('hidden');
            void settlementModal.offsetWidth;
            settlementModal.classList.remove('opacity-0');
            settlementModal.classList.add('opacity-100');
        }
    }

    function closeSettlementModal() {
        if (!settlementModal) return;
        settlementModal.classList.remove('opacity-100');
        settlementModal.classList.add('opacity-0');
        setTimeout(() => {
            settlementModal.classList.add('hidden');
            selectedRecordForSettlement = null;
        }, 300);
    }

    if (modalBackdrop) modalBackdrop.addEventListener('click', closeSettlementModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeSettlementModal);

    if (settlementForm) {
        settlementForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!selectedRecordForSettlement) return;

            const amountToPay = parseFloat(payAmountInput.value) || 0;
            const utrNumber = payUtrInput.value.trim();

            if (amountToPay <= 0 || !utrNumber) {
                alert('Please specify a valid payment amount and Bank UTR / reference number.');
                return;
            }

            if (amountToPay > selectedRecordForSettlement.balanceDue + 0.01) {
                alert(`Payment amount cannot exceed the remaining balance of ${formatINR(selectedRecordForSettlement.balanceDue)}.`);
                return;
            }

            setSettlementLoading(true);

            try {
                const updatedBankPaid = selectedRecordForSettlement.bankPaid + amountToPay;
                const remaining = selectedRecordForSettlement.totalAmount - updatedBankPaid;
                
                let newStatus = 'PARTIAL';
                if (remaining <= 0.01) {
                    newStatus = 'PAID';
                }

                let updatedUtr = selectedRecordForSettlement.bankUtr 
                    ? `${selectedRecordForSettlement.bankUtr}, ${utrNumber}` 
                    : utrNumber;

                const updatePayload = {
                    Bank_Paid: updatedBankPaid,
                    Bank_UTR_Transfer_No: updatedUtr,
                    Payment_Status: newStatus
                };

                let { error: updateError } = await supabaseClient
                    .from('purchase_logs')
                    .update(updatePayload)
                    .match({ Purchase_ID: selectedRecordForSettlement.purchaseId });

                if (updateError && updateError.code === '42P01') {
                    const fallback = await supabaseClient
                        .from('purchases')
                        .update({
                            bank_paid: updatedBankPaid,
                            payment_status: newStatus,
                            bank_utr: updatedUtr
                        })
                        .match({ id: selectedRecordForSettlement.id });
                    updateError = fallback.error;
                }

                if (updateError) throw updateError;

                closeSettlementModal();
                await fetchPendingLiabilities();

            } catch (err) {
                console.error('[Settlement Error]:', err);
                alert(`Failed to record settlement: ${err.message || 'System error'}`);
            } finally {
                setSettlementLoading(false);
            }
        });
    }

    // =========================================================================
    // 9. UI HELPERS & LISTENERS
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

    function setSettlementLoading(isLoading) {
        if (!confirmPaymentBtn) return;
        confirmPaymentBtn.disabled = isLoading;
        if (isLoading) {
            if (paymentSpinner) paymentSpinner.classList.remove('hidden');
            if (confirmPaymentBtnText) confirmPaymentBtnText.textContent = 'Recording Bank Transfer...';
            confirmPaymentBtn.classList.add('opacity-75', 'cursor-not-allowed');
        } else {
            if (paymentSpinner) paymentSpinner.classList.add('hidden');
            if (confirmPaymentBtnText) confirmPaymentBtnText.textContent = 'Record Settlement';
            confirmPaymentBtn.classList.remove('opacity-75', 'cursor-not-allowed');
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
    if (refreshBtn) refreshBtn.addEventListener('click', fetchPendingLiabilities);

    // Initial Execution
    fetchPendingLiabilities();
});