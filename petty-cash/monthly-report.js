/**
 * Prayosha ERP - Petty Cash Monthly Reconciliation & Audit Controller
 * File: /petty-cash/monthly-report.js
 * Description: Manages the monthly reconciliation lifecycle, opening/closing balance snapshots,
 *              site submission to HQ, Head Office line-item voucher auditing, query raises,
 *              and final monthly approval to unlock next month's cash float.
 *              Uses the unified Supabase client from config.js and synchronizes with shell.js project selection.
 */

import { supabase } from '../config.js';

// Central Supabase Client reference from config.js
const supabaseClient = supabase || window.supabaseClient;

// Application State
const state = {
    currentUser: null,
    isHeadOfficeOrAdmin: false,
    projects: [],
    selectedProjectId: null,
    selectedMonth: '',
    wallet: null,
    batch: null,
    categories: [],
    transactions: [],
    calculatedMetrics: {
        openingBalance: 0,
        totalInflows: 0,
        totalOutflows: 0,
        closingBalance: 0
    },
    activeAuditTx: null
};

// UUID validation helper to prevent PostgreSQL 22P02 syntax errors
const isValidUUID = (id) => {
    if (!id || typeof id !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(id);
};

// Formatters
const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    return num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return `${formatDate(dateString)} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
};

// DOM Elements Cache
const elements = {
    selectProject: document.getElementById('select-project'),
    selectMonth: document.getElementById('select-month'),
    btnPrintReport: document.getElementById('btn-print-report'),
    badgeBatchStatus: document.getElementById('badge-batch-status'),
    reconciliationActionBanner: document.getElementById('reconciliation-action-banner'),
    bannerStatusIcon: document.getElementById('banner-status-icon'),
    bannerStatusTitle: document.getElementById('banner-status-title'),
    bannerStatusDesc: document.getElementById('banner-status-desc'),
    btnSubmitToHo: document.getElementById('btn-submit-to-ho'),
    btnHoApproveBatch: document.getElementById('btn-ho-approve-batch'),
    btnHoQueryBatch: document.getElementById('btn-ho-query-batch'),
    metricOpening: document.getElementById('metric-opening'),
    metricInflows: document.getElementById('metric-inflows'),
    metricOutflows: document.getElementById('metric-outflows'),
    metricClosing: document.getElementById('metric-closing'),
    categorySummaryGrid: document.getElementById('category-summary-grid'),
    tableSummaryStats: document.getElementById('table-summary-stats'),
    reconciliationTableBody: document.getElementById('reconciliation-table-body'),
    custodianSubmitTimestamp: document.getElementById('custodian-submit-timestamp'),
    custodianNotesContent: document.getElementById('custodian-notes-content'),
    hoReviewTimestamp: document.getElementById('ho-review-timestamp'),
    hoFinalRemarksContent: document.getElementById('ho-final-remarks-content'),

    // Modal 1: Item Audit
    modalHoItemAudit: document.getElementById('modal-ho-item-audit'),
    btnCloseItemAuditModal: document.getElementById('btn-close-item-audit-modal'),
    auditModalVoucher: document.getElementById('audit-modal-voucher'),
    selectItemAuditStatus: document.getElementById('select-item-audit-status'),
    textareaItemRemark: document.getElementById('textarea-item-remark'),
    containerExistingJustification: document.getElementById('container-existing-justification'),
    textExistingJustification: document.getElementById('text-existing-justification'),
    btnSaveItemAudit: document.getElementById('btn-save-item-audit'),

    // Modal 2: Submit to HO
    modalSubmitConfirmation: document.getElementById('modal-submit-confirmation'),
    btnCancelSubmit: document.getElementById('btn-cancel-submit'),
    btnConfirmSubmitHo: document.getElementById('btn-confirm-submit-ho'),
    textareaSubmitNotes: document.getElementById('textarea-submit-notes'),

    // Modal 3: HO Final Approval
    modalHoFinalApproval: document.getElementById('modal-ho-final-approval'),
    btnCancelFinalApproval: document.getElementById('btn-cancel-final-approval'),
    btnConfirmFinalApproval: document.getElementById('btn-confirm-final-approval'),
    textareaHoFinalNotes: document.getElementById('textarea-ho-final-notes'),

    // Modal 4: Receipt Viewer
    modalReceiptViewer: document.getElementById('modal-receipt-viewer'),
    btnCloseReceiptModal: document.getElementById('btn-close-receipt-modal'),
    receiptModalTitle: document.getElementById('receipt-modal-title'),
    receiptModalImage: document.getElementById('receipt-modal-image'),
    receiptModalFallback: document.getElementById('receipt-modal-fallback'),
    btnOpenOriginalReceipt: document.getElementById('btn-open-original-receipt')
};

// Lifecycle Initialization
document.addEventListener('DOMContentLoaded', async () => {
    resolveCurrentUser();
    parseQueryParamsOrSetDefaultMonth();
    attachEventListeners();
    await fetchCategories();
    await fetchProjects();
});

// Resolve Current User and Access Rights
function resolveCurrentUser() {
    try {
        const storedUser = localStorage.getItem('prayosha_user') || localStorage.getItem('user');
        if (storedUser) {
            state.currentUser = JSON.parse(storedUser);
        } else {
            state.currentUser = {
                id: '00000000-0000-0000-0000-000000000001',
                full_name: 'Admin / Accounts User',
                role: 'Accounts'
            };
        }
    } catch (e) {
        state.currentUser = {
            id: '00000000-0000-0000-0000-000000000001',
            full_name: 'Site Engineer',
            role: 'Site Engineer'
        };
    }

    const role = (state.currentUser.role || '').toLowerCase();
    state.isHeadOfficeOrAdmin = role.includes('admin') || 
                                role.includes('account') || 
                                role.includes('head') || 
                                role.includes('director') || 
                                role.includes('owner');
}

// Parse Query Parameters (?month=YYYY-MM&project=UUID) or default to current month
function parseQueryParamsOrSetDefaultMonth() {
    const params = new URLSearchParams(window.location.search);
    const queryMonth = params.get('month');
    const queryProject = params.get('project');

    if (queryMonth && /^\d{4}-\d{2}$/.test(queryMonth)) {
        state.selectedMonth = queryMonth;
    } else {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        state.selectedMonth = `${year}-${month}`;
    }

    if (elements.selectMonth) {
        elements.selectMonth.value = state.selectedMonth;
    }

    if (queryProject && isValidUUID(queryProject)) {
        state.selectedProjectId = queryProject;
    }
}

// Fetch Categories
async function fetchCategories() {
    try {
        const { data, error } = await supabaseClient
            .from('petty_cash_categories')
            .select('*')
            .order('name_en', { ascending: true });

        if (error) throw error;
        state.categories = data || [];
    } catch (err) {
        console.error('Error fetching categories:', err);
    }
}

// Fetch Projects (Uses project_name and project_code, and syncs with shell.js)
async function fetchProjects() {
    try {
        const { data, error } = await supabaseClient
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true });

        if (error) throw error;

        state.projects = data || [];
        if (state.projects.length > 0) {
            const cachedProjectId = localStorage.getItem('activeProjectId');
            const targetProjectId = state.selectedProjectId || cachedProjectId;
            const foundProject = state.projects.find(p => p.id === targetProjectId);

            elements.selectProject.innerHTML = state.projects
                .map(p => {
                    const code = p.project_code ? `[${p.project_code}] ` : '';
                    const isSelected = foundProject ? (p.id === foundProject.id) : (p.id === state.projects[0].id);
                    return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${code}${p.project_name}</option>`;
                })
                .join('');

            state.selectedProjectId = foundProject ? foundProject.id : state.projects[0].id;
            await loadMonthlyBatchAndTransactions();
        } else {
            elements.selectProject.innerHTML = '<option value="">No Active Projects</option>';
            showEmptyState();
        }
    } catch (err) {
        console.error('Error loading projects list:', err);
        elements.selectProject.innerHTML = '<option value="">Error Loading Projects</option>';
        showEmptyState();
    }
}

// Load Monthly Reconciliation Batch & Ledger Transactions
async function loadMonthlyBatchAndTransactions() {
    if (!state.selectedProjectId || !isValidUUID(state.selectedProjectId) || !state.selectedMonth) {
        showEmptyState();
        return;
    }

    try {
        // Step A: Load or Auto-provision Site Wallet
        let { data: walletData, error: walletError } = await supabaseClient
            .from('petty_cash_wallets')
            .select('*')
            .eq('project_id', state.selectedProjectId)
            .maybeSingle();

        if (walletError && walletError.code !== 'PGRST116') throw walletError;

        if (!walletData) {
            const custodianId = isValidUUID(state.currentUser?.id)
                ? state.currentUser.id
                : '00000000-0000-0000-0000-000000000001';

            const { data: newWallet, error: createWalletError } = await supabaseClient
                .from('petty_cash_wallets')
                .insert([{
                    project_id: state.selectedProjectId,
                    custodian_id: custodianId,
                    sanctioned_limit: 100000.00,
                    current_balance: 0.00,
                    is_active: true
                }])
                .select()
                .single();

            if (!createWalletError) {
                walletData = newWallet;
            }
        }

        state.wallet = walletData;
        if (!state.wallet || !isValidUUID(state.wallet.id)) {
            console.warn('Wallet not initialized for project.');
            showEmptyState();
            return;
        }

        // Step B: Load or Auto-Provision Monthly Batch Record
        let { data: batchData, error: batchError } = await supabaseClient
            .from('petty_cash_monthly_batches')
            .select('*')
            .eq('wallet_id', state.wallet.id)
            .eq('month_year', state.selectedMonth)
            .maybeSingle();

        if (batchError && batchError.code !== 'PGRST116') throw batchError;

        if (!batchData) {
            const calculatedOpening = await calculateOpeningBalanceFromPreviousMonth();
            const custodianId = isValidUUID(state.wallet.custodian_id)
                ? state.wallet.custodian_id
                : (isValidUUID(state.currentUser?.id) ? state.currentUser.id : '00000000-0000-0000-0000-000000000001');

            const { data: newBatch, error: createBatchError } = await supabaseClient
                .from('petty_cash_monthly_batches')
                .insert([{
                    wallet_id: state.wallet.id,
                    project_id: state.selectedProjectId,
                    custodian_id: custodianId,
                    month_year: state.selectedMonth,
                    opening_balance: calculatedOpening,
                    total_received: 0,
                    total_spent: 0,
                    closing_balance: calculatedOpening,
                    status: 'DRAFT',
                    next_float_eligible: false
                }])
                .select()
                .single();

            if (!createBatchError) {
                batchData = newBatch;
            }
        }

        state.batch = batchData;

        // Step C: Fetch Transactions for this Month
        const { data: txData, error: txError } = await supabaseClient
            .from('petty_cash_transactions')
            .select(`
                *,
                petty_cash_categories (
                    id,
                    code,
                    name_en,
                    name_gu,
                    icon
                )
            `)
            .eq('wallet_id', state.wallet.id)
            .eq('month_year', state.selectedMonth)
            .order('txn_date', { ascending: true })
            .order('created_at', { ascending: true });

        if (txError) throw txError;
        state.transactions = txData || [];

        // Step D: Calculate Ledger Metrics & Category Breakdown
        computeFinancialSummary();
        renderBatchHeaderAndControls();
        renderCategoryBreakdown();
        renderAuditLedgerTable();
        renderNotesAndSignoff();

    } catch (err) {
        console.error('Error loading reconciliation data:', err);
        elements.reconciliationTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-6 text-center text-rose-500 font-medium text-xs">
                    Failed to load monthly statement. Please check database permissions or reload.
                </td>
            </tr>
        `;
    }
}

// Compute Previous Month Closing Balance for Opening Balance
async function calculateOpeningBalanceFromPreviousMonth() {
    try {
        if (!state.wallet || !isValidUUID(state.wallet.id)) return 0.00;

        const [year, month] = state.selectedMonth.split('-').map(Number);
        const prevDate = new Date(year, month - 2, 1);
        const prevMonthYear = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        const { data: prevBatch } = await supabaseClient
            .from('petty_cash_monthly_batches')
            .select('closing_balance')
            .eq('wallet_id', state.wallet.id)
            .eq('month_year', prevMonthYear)
            .maybeSingle();

        if (prevBatch && prevBatch.closing_balance !== null) {
            return Number(prevBatch.closing_balance);
        }
        return 0.00;
    } catch (e) {
        console.warn('Could not compute opening balance, defaulting to 0:', e);
        return 0.00;
    }
}

// Compute Financial Summary
function computeFinancialSummary() {
    const opening = Number(state.batch?.opening_balance) || 0;
    let totalIn = 0;
    let totalOut = 0;

    state.transactions.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        if (tx.txn_type === 'CASH_IN') {
            totalIn += amt;
        } else if (tx.txn_type === 'CASH_OUT') {
            totalOut += amt;
        }
    });

    const closing = (opening + totalIn) - totalOut;

    state.calculatedMetrics = {
        openingBalance: opening,
        totalInflows: totalIn,
        totalOutflows: totalOut,
        closingBalance: closing
    };

    if (elements.metricOpening) elements.metricOpening.textContent = formatCurrency(opening);
    if (elements.metricInflows) elements.metricInflows.textContent = formatCurrency(totalIn);
    if (elements.metricOutflows) elements.metricOutflows.textContent = formatCurrency(totalOut);
    if (elements.metricClosing) elements.metricClosing.textContent = formatCurrency(closing);
}

// Render Status Banner and Role Buttons
function renderBatchHeaderAndControls() {
    const status = state.batch?.status || 'DRAFT';

    if (elements.badgeBatchStatus) {
        elements.badgeBatchStatus.textContent = status.replace(/_/g, ' ');
        if (status === 'APPROVED_BY_HO') {
            elements.badgeBatchStatus.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800';
        } else if (status === 'QUERIES_RAISED' || status === 'REJECTED') {
            elements.badgeBatchStatus.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800';
        } else if (status === 'SUBMITTED_TO_HO') {
            elements.badgeBatchStatus.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800';
        } else {
            elements.badgeBatchStatus.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-200 text-slate-700';
        }
    }

    if (status === 'DRAFT') {
        elements.reconciliationActionBanner.className = 'glass-card rounded-2xl p-4 sm:p-5 border-l-4 border-slate-400 shadow-sm transition-all';
        elements.bannerStatusIcon.className = 'w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-xs';
        elements.bannerStatusIcon.innerHTML = '<i class="fa-solid fa-file-pen"></i>';
        elements.bannerStatusTitle.textContent = `Draft Statement - ${state.selectedMonth}`;
        elements.bannerStatusDesc.textContent = 'Review all transactions for this month. Once confirmed, submit this bundle to Head Office accounts.';
    } else if (status === 'SUBMITTED_TO_HO') {
        elements.reconciliationActionBanner.className = 'glass-card rounded-2xl p-4 sm:p-5 border-l-4 border-blue-500 shadow-sm transition-all';
        elements.bannerStatusIcon.className = 'w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs';
        elements.bannerStatusIcon.innerHTML = '<i class="fa-solid fa-clock"></i>';
        elements.bannerStatusTitle.textContent = `Submitted to Head Office - ${state.selectedMonth}`;
        elements.bannerStatusDesc.textContent = 'This monthly bundle is locked and currently being audited by Head Office Accounts.';
    } else if (status === 'QUERIES_RAISED') {
        elements.reconciliationActionBanner.className = 'glass-card rounded-2xl p-4 sm:p-5 border-l-4 border-amber-500 shadow-sm transition-all';
        elements.bannerStatusIcon.className = 'w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-xs';
        elements.bannerStatusIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        elements.bannerStatusTitle.textContent = `Clarifications Required by HQ - ${state.selectedMonth}`;
        elements.bannerStatusDesc.textContent = 'Head office accounts has raised remarks on specific vouchers. Provide justifications before re-submitting.';
    } else if (status === 'APPROVED_BY_HO') {
        elements.reconciliationActionBanner.className = 'glass-card rounded-2xl p-4 sm:p-5 border-l-4 border-emerald-500 shadow-sm transition-all';
        elements.bannerStatusIcon.className = 'w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs';
        elements.bannerStatusIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        elements.bannerStatusTitle.textContent = `Approved by Head Office - ${state.selectedMonth}`;
        elements.bannerStatusDesc.textContent = 'This monthly reconciliation has been signed off. Site custodian is eligible for next month float withdrawal.';
    }

    if (state.isHeadOfficeOrAdmin) {
        elements.btnSubmitToHo.classList.add('hidden');
        if (status === 'SUBMITTED_TO_HO' || status === 'QUERIES_RAISED') {
            elements.btnHoApproveBatch.classList.remove('hidden');
            elements.btnHoQueryBatch.classList.remove('hidden');
        } else {
            elements.btnHoApproveBatch.classList.add('hidden');
            elements.btnHoQueryBatch.classList.add('hidden');
        }
    } else {
        elements.btnHoApproveBatch.classList.add('hidden');
        elements.btnHoQueryBatch.classList.add('hidden');

        if (status === 'DRAFT' || status === 'QUERIES_RAISED') {
            elements.btnSubmitToHo.classList.remove('hidden');
            elements.btnSubmitToHo.innerHTML = status === 'QUERIES_RAISED' 
                ? '<i class="fa-solid fa-paper-plane"></i> <span>Re-Submit Justifications to HQ</span>'
                : '<i class="fa-solid fa-paper-plane"></i> <span>Submit Statement to Head Office</span>';
        } else {
            elements.btnSubmitToHo.classList.add('hidden');
        }
    }
}

// Render Category Breakdown
function renderCategoryBreakdown() {
    if (!elements.categorySummaryGrid) return;

    const categoryTotals = {};
    state.transactions.forEach(tx => {
        if (tx.txn_type === 'CASH_OUT') {
            const catId = tx.category_id || 'OTHER';
            const catName = tx.petty_cash_categories?.name_en || 'Other';
            const catNameGu = tx.petty_cash_categories?.name_gu || '';
            const catIcon = tx.petty_cash_categories?.icon || 'receipt';

            if (!categoryTotals[catId]) {
                categoryTotals[catId] = {
                    name: catName,
                    nameGu: catNameGu,
                    icon: catIcon,
                    count: 0,
                    total: 0
                };
            }
            categoryTotals[catId].count += 1;
            categoryTotals[catId].total += Number(tx.amount) || 0;
        }
    });

    const entries = Object.values(categoryTotals);
    if (entries.length === 0) {
        elements.categorySummaryGrid.innerHTML = `
            <div class="col-span-full text-slate-400 text-xs py-3 font-medium">
                No expense entries recorded for category analysis.
            </div>
        `;
        return;
    }

    elements.categorySummaryGrid.innerHTML = entries.map(cat => `
        <div class="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80">
            <div class="flex items-center space-x-1.5 text-navy text-xs font-bold mb-1">
                <i class="fa-solid fa-${cat.icon} text-amber-600"></i>
                <span class="truncate">${cat.name}</span>
            </div>
            <div class="text-sm font-extrabold text-slate-800">₹ ${formatCurrency(cat.total)}</div>
            <div class="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                <span>${cat.nameGu}</span>
                <span>${cat.count} bills</span>
            </div>
        </div>
    `).join('');
}

// Render Detailed Reconciliation Table
function renderAuditLedgerTable() {
    const list = state.transactions;

    if (elements.tableSummaryStats) {
        elements.tableSummaryStats.textContent = `${list.length} itemized vouchers`;
    }

    if (list.length === 0) {
        elements.reconciliationTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-12 text-center text-slate-400 text-xs">
                    <i class="fa-solid fa-receipt text-3xl text-slate-300 mb-2 block"></i>
                    No entries found in this monthly settlement period.
                </td>
            </tr>
        `;
        return;
    }

    elements.reconciliationTableBody.innerHTML = list.map(tx => {
        const isExpense = tx.txn_type === 'CASH_OUT';
        const catName = tx.petty_cash_categories?.name_en || (isExpense ? 'General' : 'Top-Up Float');

        let auditBadge = '';
        if (tx.ho_audit_status === 'ACCEPTED') {
            auditBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check"></i> Accepted</span>`;
        } else if (tx.ho_audit_status === 'QUERY_RAISED') {
            auditBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900"><i class="fa-solid fa-triangle-exclamation"></i> Query Raised</span>`;
        } else if (tx.ho_audit_status === 'REJECTED') {
            auditBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800"><i class="fa-solid fa-xmark"></i> Rejected</span>`;
        } else {
            auditBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"><i class="fa-regular fa-clock"></i> Pending</span>`;
        }

        const hasReceipt = Boolean(tx.bill_attachment_url);
        const receiptBtn = hasReceipt 
            ? `<button type="button" onclick="window.openReceiptModal('${tx.bill_attachment_url}', '${tx.voucher_no}')" class="w-7 h-7 rounded-lg bg-navy/5 hover:bg-navy/10 text-navy flex items-center justify-center transition-all mx-auto" title="View Bill/Chitthi">
                 <i class="fa-solid fa-paperclip text-xs"></i>
               </button>`
            : `<button type="button" onclick="window.openReceiptModal('', '${tx.voucher_no}')" class="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mx-auto" title="Self Voucher">
                 <i class="fa-solid fa-signature text-xs"></i>
               </button>`;

        const auditBtn = state.isHeadOfficeOrAdmin
            ? `<button type="button" onclick="window.openItemAuditModal('${tx.id}')" class="text-xs px-2.5 py-1 rounded-lg bg-navy text-amber hover:bg-navy-700 transition-all font-semibold inline-flex items-center gap-1">
                 <i class="fa-solid fa-stamp"></i> Audit
               </button>`
            : `<span class="text-slate-300 text-xs">-</span>`;

        return `
            <tr class="hover:bg-slate-50/70 transition-colors">
                <td class="py-3 px-4 whitespace-nowrap">
                    <div class="font-bold text-slate-800">${tx.voucher_no}</div>
                    <div class="text-[11px] text-slate-400">${formatDate(tx.txn_date)}</div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap font-medium text-slate-700">
                    ${catName}
                </td>
                <td class="py-3 px-4">
                    <div class="font-semibold text-slate-800">${isExpense ? (tx.paid_to || '-') : (tx.received_from || 'HQ Accounts')}</div>
                    <div class="text-[11px] text-slate-500 max-w-[220px] truncate" title="${tx.description}">${tx.description}</div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${tx.payment_mode === 'ENGINEER_UPI' ? 'bg-purple-100 text-purple-900' : 'bg-slate-100 text-slate-700'}">
                        ${tx.payment_mode === 'ENGINEER_UPI' ? 'Personal UPI Claim' : tx.payment_mode}
                    </span>
                </td>
                <td class="py-3 px-4 text-right whitespace-nowrap font-bold ${isExpense ? 'text-rose-600' : 'text-emerald-600'}">
                    ${isExpense ? `- ₹ ${formatCurrency(tx.amount)}` : `+ ₹ ${formatCurrency(tx.amount)}`}
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${receiptBtn}
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${auditBadge}
                </td>
                <td class="py-3 px-4">
                    ${tx.ho_remarks ? `<div class="p-1.5 rounded bg-amber-50 text-amber-900 text-[11px] font-semibold mb-1 border border-amber-200"><strong>HQ:</strong> ${tx.ho_remarks}</div>` : ''}
                    ${tx.custodian_justification ? `<div class="p-1.5 rounded bg-blue-50 text-blue-900 text-[11px] font-medium border border-blue-200"><strong>Site:</strong> ${tx.custodian_justification}</div>` : ''}
                    ${!tx.ho_remarks && !tx.custodian_justification ? '<span class="text-slate-300 text-xs">-</span>' : ''}
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap no-print">
                    ${auditBtn}
                </td>
            </tr>
        `;
    }).join('');
}

// Render Notes and Sign-off History
function renderNotesAndSignoff() {
    if (state.batch) {
        if (elements.custodianSubmitTimestamp) {
            elements.custodianSubmitTimestamp.textContent = state.batch.custodian_submitted_at 
                ? formatDateTime(state.batch.custodian_submitted_at) 
                : 'Not Submitted Yet';
        }
        if (elements.custodianNotesContent) {
            elements.custodianNotesContent.textContent = state.batch.custodian_notes || 'No submission notes provided.';
        }

        if (elements.hoReviewTimestamp) {
            elements.hoReviewTimestamp.textContent = state.batch.ho_reviewed_at 
                ? formatDateTime(state.batch.ho_reviewed_at) 
                : 'Awaiting Sign-Off';
        }
        if (elements.hoFinalRemarksContent) {
            elements.hoFinalRemarksContent.textContent = state.batch.ho_final_remarks || 'Pending Head Office audit.';
        }
    }
}

function showEmptyState() {
    if (elements.metricOpening) elements.metricOpening.textContent = '0.00';
    if (elements.metricInflows) elements.metricInflows.textContent = '0.00';
    if (elements.metricOutflows) elements.metricOutflows.textContent = '0.00';
    if (elements.metricClosing) elements.metricClosing.textContent = '0.00';
    if (elements.reconciliationTableBody) {
        elements.reconciliationTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-12 text-center text-slate-400 text-xs">
                    No active project selected or project has no recorded data.
                </td>
            </tr>
        `;
    }
    if (elements.categorySummaryGrid) elements.categorySummaryGrid.innerHTML = '';
}

// Event Listeners Setup
function attachEventListeners() {
    if (elements.selectProject) {
        elements.selectProject.addEventListener('change', async (e) => {
            state.selectedProjectId = e.target.value;
            localStorage.setItem('activeProjectId', state.selectedProjectId);
            await loadMonthlyBatchAndTransactions();
        });
    }

    // Sync with Global Shell Project Switcher Dispatched Events
    window.addEventListener('projectChanged', async (e) => {
        if (e.detail && e.detail.projectId) {
            state.selectedProjectId = e.detail.projectId;
            if (elements.selectProject) {
                elements.selectProject.value = e.detail.projectId;
            }
            await loadMonthlyBatchAndTransactions();
        }
    });

    if (elements.selectMonth) {
        elements.selectMonth.addEventListener('change', async (e) => {
            state.selectedMonth = e.target.value;
            await loadMonthlyBatchAndTransactions();
        });
    }

    if (elements.btnPrintReport) {
        elements.btnPrintReport.addEventListener('click', () => {
            window.print();
        });
    }

    // Site Custodian Submit Flow
    if (elements.btnSubmitToHo) {
        elements.btnSubmitToHo.addEventListener('click', () => {
            if (elements.modalSubmitConfirmation) {
                elements.modalSubmitConfirmation.classList.remove('hidden');
            }
        });
    }

    if (elements.btnCancelSubmit) {
        elements.btnCancelSubmit.addEventListener('click', () => {
            elements.modalSubmitConfirmation.classList.add('hidden');
        });
    }

    if (elements.btnConfirmSubmitHo) {
        elements.btnConfirmSubmitHo.addEventListener('click', handleCustodianSubmit);
    }

    // Head Office Review & Approval Flows
    if (elements.btnHoApproveBatch) {
        elements.btnHoApproveBatch.addEventListener('click', () => {
            if (elements.modalHoFinalApproval) {
                elements.modalHoFinalApproval.classList.remove('hidden');
            }
        });
    }

    if (elements.btnCancelFinalApproval) {
        elements.btnCancelFinalApproval.addEventListener('click', () => {
            elements.modalHoFinalApproval.classList.add('hidden');
        });
    }

    if (elements.btnConfirmFinalApproval) {
        elements.btnConfirmFinalApproval.addEventListener('click', handleHoFinalApproval);
    }

    if (elements.btnHoQueryBatch) {
        elements.btnHoQueryBatch.addEventListener('click', handleHoQueryBatch);
    }

    // Line Item Audit Handlers
    if (elements.btnCloseItemAuditModal) {
        elements.btnCloseItemAuditModal.addEventListener('click', () => {
            elements.modalHoItemAudit.classList.add('hidden');
            state.activeAuditTx = null;
        });
    }

    if (elements.btnSaveItemAudit) {
        elements.btnSaveItemAudit.addEventListener('click', saveItemAuditDecision);
    }

    // Receipt Viewer Handlers
    if (elements.btnCloseReceiptModal) {
        elements.btnCloseReceiptModal.addEventListener('click', () => {
            elements.modalReceiptViewer.classList.add('hidden');
        });
    }
}

// Action: Site Engineer Submits Monthly Bundle
async function handleCustodianSubmit() {
    if (!state.batch || !isValidUUID(state.batch.id)) return;

    const notes = elements.textareaSubmitNotes.value.trim();

    try {
        elements.btnConfirmSubmitHo.disabled = true;
        elements.btnConfirmSubmitHo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

        const { error } = await supabaseClient
            .from('petty_cash_monthly_batches')
            .update({
                status: 'SUBMITTED_TO_HO',
                custodian_submitted_at: new Date().toISOString(),
                custodian_notes: notes || null,
                opening_balance: state.calculatedMetrics.openingBalance,
                total_received: state.calculatedMetrics.totalInflows,
                total_spent: state.calculatedMetrics.totalOutflows,
                closing_balance: state.calculatedMetrics.closingBalance,
                updated_at: new Date().toISOString()
            })
            .eq('id', state.batch.id);

        if (error) throw error;

        alert('Monthly statement successfully submitted to Head Office for audit!');
        elements.modalSubmitConfirmation.classList.add('hidden');
        await loadMonthlyBatchAndTransactions();

    } catch (err) {
        console.error('Error submitting batch to HO:', err);
        alert('Failed to submit statement: ' + err.message);
    } finally {
        elements.btnConfirmSubmitHo.disabled = false;
        elements.btnConfirmSubmitHo.innerHTML = 'Confirm & Submit';
    }
}

// Action: Head Office Final Approval & Gatekeeper Sign-off
async function handleHoFinalApproval() {
    if (!state.batch || !isValidUUID(state.batch.id)) return;

    const remarks = elements.textareaHoFinalNotes.value.trim();
    const reviewerId = isValidUUID(state.currentUser?.id) ? state.currentUser.id : null;

    try {
        elements.btnConfirmFinalApproval.disabled = true;
        elements.btnConfirmFinalApproval.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Approving...';

        const { error } = await supabaseClient
            .from('petty_cash_monthly_batches')
            .update({
                status: 'APPROVED_BY_HO',
                next_float_eligible: true,
                ho_reviewed_by: reviewerId,
                ho_reviewed_at: new Date().toISOString(),
                ho_final_remarks: remarks || 'Approved by HQ Accounts. Next float authorized.',
                updated_at: new Date().toISOString()
            })
            .eq('id', state.batch.id);

        if (error) throw error;

        // Auto accept all pending line items upon final approval
        if (state.wallet && isValidUUID(state.wallet.id)) {
            await supabaseClient
                .from('petty_cash_transactions')
                .update({ ho_audit_status: 'ACCEPTED' })
                .eq('wallet_id', state.wallet.id)
                .eq('month_year', state.selectedMonth)
                .eq('ho_audit_status', 'PENDING');
        }

        alert(`Monthly settlement for ${state.selectedMonth} APPROVED! Site Engineer is now eligible to receive the next monthly float.`);
        elements.modalHoFinalApproval.classList.add('hidden');
        await loadMonthlyBatchAndTransactions();

    } catch (err) {
        console.error('Error during HO final approval:', err);
        alert('Failed to approve batch: ' + err.message);
    } finally {
        elements.btnConfirmFinalApproval.disabled = false;
        elements.btnConfirmFinalApproval.innerHTML = 'Sign Off & Sanction Float';
    }
}

// Action: Head Office Returns Batch for Clarification
async function handleHoQueryBatch() {
    if (!state.batch || !isValidUUID(state.batch.id)) return;

    const reason = prompt('Please enter the overall reason or instructions for the site engineer to resolve queries:');
    if (!reason || reason.trim() === '') return;

    const reviewerId = isValidUUID(state.currentUser?.id) ? state.currentUser.id : null;

    try {
        const { error } = await supabaseClient
            .from('petty_cash_monthly_batches')
            .update({
                status: 'QUERIES_RAISED',
                ho_reviewed_by: reviewerId,
                ho_reviewed_at: new Date().toISOString(),
                ho_final_remarks: reason.trim(),
                next_float_eligible: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', state.batch.id);

        if (error) throw error;

        alert('Batch marked with queries and returned to site custodian.');
        await loadMonthlyBatchAndTransactions();

    } catch (err) {
        console.error('Error raising queries:', err);
        alert('Failed to update batch: ' + err.message);
    }
}

// Line Item Voucher Audit Modal Handlers
window.openItemAuditModal = (txId) => {
    const tx = state.transactions.find(t => t.id === txId);
    if (!tx || !elements.modalHoItemAudit) return;

    state.activeAuditTx = tx;

    elements.auditModalVoucher.textContent = `${tx.voucher_no} (₹ ${formatCurrency(tx.amount)})`;
    elements.selectItemAuditStatus.value = tx.ho_audit_status || 'ACCEPTED';
    elements.textareaItemRemark.value = tx.ho_remarks || '';

    if (tx.custodian_justification) {
        elements.containerExistingJustification.classList.remove('hidden');
        elements.textExistingJustification.textContent = tx.custodian_justification;
    } else {
        elements.containerExistingJustification.classList.add('hidden');
        elements.textExistingJustification.textContent = '';
    }

    elements.modalHoItemAudit.classList.remove('hidden');
};

async function saveItemAuditDecision() {
    if (!state.activeAuditTx || !isValidUUID(state.activeAuditTx.id)) return;

    const newStatus = elements.selectItemAuditStatus.value;
    const remark = elements.textareaItemRemark.value.trim();
    const reviewerId = isValidUUID(state.currentUser?.id) ? state.currentUser.id : null;

    try {
        elements.btnSaveItemAudit.disabled = true;
        elements.btnSaveItemAudit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const { error } = await supabaseClient
            .from('petty_cash_transactions')
            .update({
                ho_audit_status: newStatus,
                ho_remarks: remark || null,
                ho_remark_by: reviewerId,
                ho_remark_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', state.activeAuditTx.id);

        if (error) throw error;

        elements.modalHoItemAudit.classList.add('hidden');
        state.activeAuditTx = null;
        await loadMonthlyBatchAndTransactions();

    } catch (err) {
        console.error('Error saving line item audit:', err);
        alert('Failed to save audit decision: ' + err.message);
    } finally {
        elements.btnSaveItemAudit.disabled = false;
        elements.btnSaveItemAudit.innerHTML = 'Save Audit Decision';
    }
}

// Receipt Preview Modal Handler
window.openReceiptModal = (url, voucherNo) => {
    if (!elements.modalReceiptViewer) return;

    elements.receiptModalTitle.textContent = `Receipt / Voucher: ${voucherNo}`;

    if (url && url.trim() !== '') {
        elements.receiptModalImage.src = url;
        elements.receiptModalImage.classList.remove('hidden');
        elements.receiptModalFallback.classList.add('hidden');
        elements.btnOpenOriginalReceipt.href = url;
        elements.btnOpenOriginalReceipt.classList.remove('hidden');
    } else {
        elements.receiptModalImage.src = '';
        elements.receiptModalImage.classList.add('hidden');
        elements.receiptModalFallback.classList.remove('hidden');
        elements.btnOpenOriginalReceipt.classList.add('hidden');
    }

    elements.modalReceiptViewer.classList.remove('hidden');
};