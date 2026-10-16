/**
 * Prayosha ERP - Petty Cash Ledger Controller
 * File: /petty-cash/petty-cash.js
 * Description: Manages site float passbook, live balance calculations, HO gatekeeper alerts,
 *              dynamic category pills, table filtering, receipt modal preview, query clarifications,
 *              dynamic site employee selection from `user_roles`, and executive CASH_IN float disbursals.
 */

import { supabase, uploadToR2 } from '../config.js';

// Central Supabase Client reference from config.js
const supabaseClient = supabase || window.supabaseClient;

// Application State
const state = {
    currentUser: null,
    projects: [],
    selectedProjectId: null,
    selectedMonth: '',
    wallet: null,
    categories: [],
    transactions: [],
    filteredTransactions: [],
    selectedCategory: 'ALL',
    searchQuery: '',
    filterType: 'ALL',
    filterAudit: 'ALL',
    activeTxForRemark: null,
    siteEmployees: []
};

// UUID validation helper to prevent PostgreSQL 22P02 syntax errors
const isValidUUID = (id) => {
    if (!id || typeof id !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(id);
};

// Currency and Date Formatters
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

// DOM Elements Cache
const elements = {
    selectProject: document.getElementById('select-project'),
    selectMonth: document.getElementById('select-month'),
    badgeCurrentRole: document.getElementById('badge-current-role'),
    bannerGatekeeper: document.getElementById('banner-gatekeeper'),
    gatekeeperIcon: document.getElementById('gatekeeper-icon'),
    gatekeeperTitle: document.getElementById('gatekeeper-title'),
    gatekeeperMessage: document.getElementById('gatekeeper-message'),
    gatekeeperActionContainer: document.getElementById('gatekeeper-action-container'),
    metricBalance: document.getElementById('metric-balance'),
    metricSanctioned: document.getElementById('metric-sanctioned'),
    metricSpent: document.getElementById('metric-spent'),
    metricReceived: document.getElementById('metric-received'),
    metricBurnRate: document.getElementById('metric-burn-rate'),
    cashStatusBadge: document.getElementById('cash-status-badge'),
    inputSearch: document.getElementById('input-search'),
    filterType: document.getElementById('filter-type'),
    filterAudit: document.getElementById('filter-audit'),
    categoryPillsContainer: document.getElementById('category-pills-container'),
    ledgerTableBody: document.getElementById('ledger-table-body'),
    tableEmptyState: document.getElementById('table-empty-state'),
    txCount: document.getElementById('tx-count'),
    btnExportCsv: document.getElementById('btn-export-csv'),

    // Disburse Float Modal Elements
    btnOpenDisburseModal: document.getElementById('btn-open-disburse-modal'),
    modalDisburseFloat: document.getElementById('modal-disburse-float'),
    btnCloseDisburseModal: document.getElementById('btn-close-disburse-modal'),
    btnCancelDisburse: document.getElementById('btn-cancel-disburse'),
    formDisburseFloat: document.getElementById('form-disburse-float'),
    disburseSelectReceiver: document.getElementById('disburse-select-receiver'),
    disburseInputAmount: document.getElementById('disburse-input-amount'),
    disburseSelectSource: document.getElementById('disburse-select-source'),
    disburseSelectMode: document.getElementById('disburse-select-mode'),
    disburseInputDate: document.getElementById('disburse-input-date'),
    disburseTextareaDesc: document.getElementById('disburse-textarea-desc'),
    disburseInputFile: document.getElementById('disburse-input-file'),
    btnSubmitDisburse: document.getElementById('btn-submit-disburse'),

    // Receipt Modal Elements
    modalReceiptViewer: document.getElementById('modal-receipt-viewer'),
    receiptModalTitle: document.getElementById('receipt-modal-title'),
    receiptModalImage: document.getElementById('receipt-modal-image'),
    receiptModalFallback: document.getElementById('receipt-modal-fallback'),
    btnOpenOriginalReceipt: document.getElementById('btn-open-original-receipt'),
    btnCloseReceiptModal: document.getElementById('btn-close-receipt-modal'),

    // Remark Modal Elements
    modalHoRemark: document.getElementById('modal-ho-remark'),
    btnCloseRemarkModal: document.getElementById('btn-close-remark-modal'),
    hoRemarkDate: document.getElementById('ho-remark-date'),
    hoRemarkText: document.getElementById('ho-remark-text'),
    textareaJustification: document.getElementById('textarea-justification'),
    btnSaveJustification: document.getElementById('btn-save-justification')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    resolveCurrentUser();
    setDefaultMonth();
    initDisburseFormDefaults();
    attachEventListeners();
    await fetchCategories();
    await fetchSiteStaff();
    await fetchProjects();
    setupRealtimeSubscription();
});

// Resolve Logged-in User Context
function resolveCurrentUser() {
    try {
        const storedUser = localStorage.getItem('prayosha_user') || localStorage.getItem('user');
        if (storedUser) {
            state.currentUser = JSON.parse(storedUser);
            if (elements.badgeCurrentRole && state.currentUser.role) {
                elements.badgeCurrentRole.textContent = state.currentUser.role.replace(/_/g, ' ');
            }
        } else {
            state.currentUser = {
                id: '00000000-0000-0000-0000-000000000001',
                full_name: 'Site Custodian',
                role: 'Site Engineer'
            };
        }
    } catch (e) {
        state.currentUser = {
            id: '00000000-0000-0000-0000-000000000001',
            full_name: 'Site Custodian',
            role: 'Site Engineer'
        };
    }
}

// Set Default Month (Current YYYY-MM)
function setDefaultMonth() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    state.selectedMonth = `${year}-${month}`;
    if (elements.selectMonth) {
        elements.selectMonth.value = state.selectedMonth;
    }
}

// Set Today's Date in Disburse Modal
function initDisburseFormDefaults() {
    if (elements.disburseInputDate) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        elements.disburseInputDate.value = `${yyyy}-${mm}-${dd}`;
    }
}

// Fetch Site Employees directly from user_roles
async function fetchSiteStaff() {
    try {
        const { data, error } = await supabaseClient
            .from('user_roles')
            .select('*')
            .order('display_name', { ascending: true });

        if (error) throw error;
        state.siteEmployees = data || [];
        renderSiteStaffDropdown();
    } catch (err) {
        console.error('Error querying staff from user_roles:', err);
        state.siteEmployees = [];
        renderSiteStaffDropdown();
    }
}

// Filter and Render Dynamic Site Personnel for the Selected Project
function renderSiteStaffDropdown() {
    if (!elements.disburseSelectReceiver) return;

    if (!state.siteEmployees || state.siteEmployees.length === 0) {
        elements.disburseSelectReceiver.innerHTML = '<option value="">No Site Employees Found</option>';
        return;
    }

    // Determine current project context
    const currentProj = state.projects.find(p => p.id === state.selectedProjectId);
    const currentProjName = (currentProj?.project_name || '').trim().toLowerCase();
    const currentProjCode = (currentProj?.project_code || '').trim().toLowerCase();

    // Roles strictly prohibited from receiving site petty cash floats
    const disallowedRoles = ['owner', 'store keeper', 'storekeeper', 'admin', 'external agency'];

    // Filter employees: Role check + Project deployment check
    const eligibleEmployees = state.siteEmployees.filter(emp => {
        const role = (emp.role || '').trim().toLowerCase();

        // 1. Exclude Owners, Store Keepers, Admins, External Agencies
        if (disallowedRoles.some(dr => role === dr || role.includes(dr))) {
            return false;
        }

        // 2. Must be site operational personnel
        const isSiteRole = role.includes('project manager') ||
                           role.includes('site engineer') ||
                           role.includes('site supervisor') ||
                           role.includes('construction head') ||
                           role.includes('chief engineer') ||
                           role.includes('supervisor') ||
                           role.includes('engineer');

        if (!isSiteRole) return false;

        // 3. Project Deployment Check
        const empProject = (emp.project || emp.assigned_project || emp.project_name || emp.project_id || '').trim().toLowerCase();

        // Multi-project executives (e.g. Construction Head overseeing All Projects)
        if (empProject === 'all projects' || empProject === 'all' || role.includes('construction head')) {
            return true;
        }

        // Exclude unassigned, neutral or onboarding staff not deployed to this site
        if (!empProject || empProject.includes('onboarding') || empProject.includes('neutral') || empProject.includes('unassigned')) {
            return false;
        }

        // Match with currently selected project name or code
        if (currentProjName && (empProject === currentProjName || currentProjName.includes(empProject) || empProject.includes(currentProjName))) {
            return true;
        }
        if (currentProjCode && empProject.includes(currentProjCode)) {
            return true;
        }
        if (state.selectedProjectId && emp.project_id === state.selectedProjectId) {
            return true;
        }

        return false;
    });

    if (eligibleEmployees.length === 0) {
        const projDisplay = currentProj ? (currentProj.project_name || 'this project') : 'this project';
        elements.disburseSelectReceiver.innerHTML = `<option value="">No site staff assigned to ${projDisplay}</option>`;
        return;
    }

    let optionsHtml = '<option value="">-- Select Employee (Site Manager / Engineer) --</option>';

    optionsHtml += eligibleEmployees.map(emp => {
        const name = emp.display_name || emp.username || 'Employee';
        const roleLabel = emp.role ? ` (${emp.role})` : '';
        return `<option value="${emp.id}" data-name="${name}" data-role="${emp.role || 'Site Staff'}">${name}${roleLabel}</option>`;
    }).join('');

    elements.disburseSelectReceiver.innerHTML = optionsHtml;
}

// Fetch Categories & Render Filter Pills
async function fetchCategories() {
    try {
        const { data, error } = await supabaseClient
            .from('petty_cash_categories')
            .select('*')
            .eq('is_active', true)
            .order('name_en', { ascending: true });

        if (error) throw error;
        state.categories = data || [];
        renderCategoryPills();
    } catch (err) {
        console.error('Error fetching categories:', err);
    }
}

function renderCategoryPills() {
    if (!elements.categoryPillsContainer) return;

    elements.categoryPillsContainer.innerHTML = `
        <button type="button" data-cat="ALL" class="cat-pill active px-3 py-1.5 rounded-lg font-semibold bg-navy text-amber shadow-sm shrink-0 transition-all">
            All Categories
        </button>
    `;

    state.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.cat = cat.id;
        btn.className = 'cat-pill px-3 py-1.5 rounded-lg font-semibold bg-white/80 hover:bg-slate-100 text-slate-700 border border-slate-200/80 shrink-0 transition-all';
        btn.innerHTML = `<span>${cat.name_en}</span> <span class="text-[10px] text-slate-400 font-normal">(${cat.name_gu})</span>`;
        elements.categoryPillsContainer.appendChild(btn);
    });

    const pills = elements.categoryPillsContainer.querySelectorAll('.cat-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => {
                p.classList.remove('active', 'bg-navy', 'text-amber');
                p.classList.add('bg-white/80', 'text-slate-700');
            });
            pill.classList.add('active', 'bg-navy', 'text-amber');
            pill.classList.remove('bg-white/80', 'text-slate-700');
            state.selectedCategory = pill.dataset.cat;
            applyFilters();
        });
    });
}

// Fetch Projects
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
            const foundProject = state.projects.find(p => p.id === cachedProjectId);

            elements.selectProject.innerHTML = state.projects
                .map(p => {
                    const code = p.project_code ? `[${p.project_code}] ` : '';
                    const isSelected = foundProject ? (p.id === foundProject.id) : false;
                    return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${code}${p.project_name}</option>`;
                })
                .join('');

            state.selectedProjectId = foundProject ? foundProject.id : state.projects[0].id;
            renderSiteStaffDropdown();
            await loadWalletAndLedger();
        } else {
            elements.selectProject.innerHTML = '<option value="">No Active Projects Found</option>';
            showEmptyState();
        }
    } catch (err) {
        console.error('Error loading projects list:', err);
        elements.selectProject.innerHTML = '<option value="">Error Loading Projects</option>';
        showEmptyState();
    }
}

// Load Wallet & Check Gatekeeper
async function loadWalletAndLedger() {
    if (!state.selectedProjectId || !isValidUUID(state.selectedProjectId)) {
        showEmptyState();
        return;
    }

    try {
        let { data: walletData, error: walletError } = await supabaseClient
            .from('petty_cash_wallets')
            .select('*')
            .eq('project_id', state.selectedProjectId)
            .maybeSingle();

        if (walletError && walletError.code !== 'PGRST116') {
            throw walletError;
        }

        // Auto-provision wallet with 0.00 default float limit
        if (!walletData) {
            const custodianId = isValidUUID(state.currentUser?.id) 
                ? state.currentUser.id 
                : '00000000-0000-0000-0000-000000000001';

            const { data: newWallet, error: createError } = await supabaseClient
                .from('petty_cash_wallets')
                .insert([{
                    project_id: state.selectedProjectId,
                    custodian_id: custodianId,
                    sanctioned_limit: 0.00,
                    current_balance: 0.00,
                    is_active: true
                }])
                .select()
                .single();

            if (!createError) {
                walletData = newWallet;
            }
        } else if (Number(walletData.sanctioned_limit) === 100000.00 && Number(walletData.current_balance) === 0.00) {
            // Clean up legacy 1,00,000 placeholder from database
            await supabaseClient
                .from('petty_cash_wallets')
                .update({ sanctioned_limit: 0.00, updated_at: new Date().toISOString() })
                .eq('id', walletData.id);
            walletData.sanctioned_limit = 0.00;
        }

        state.wallet = walletData;

        // Check Monthly Batch Gatekeeper (Previous Month)
        await evaluateGatekeeperStatus();

        // Load Ledger entries
        await fetchTransactions();

    } catch (err) {
        console.error('Error initializing site wallet:', err);
    }
}

// Gatekeeper Status Check (Previous Month Approval Gate)
async function evaluateGatekeeperStatus() {
    if (!state.wallet || !isValidUUID(state.wallet.id)) return;

    try {
        const [year, month] = state.selectedMonth.split('-').map(Number);
        const prevDate = new Date(year, month - 2, 1);
        const prevMonthYear = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

        const { data: prevBatch } = await supabaseClient
            .from('petty_cash_monthly_batches')
            .select('*')
            .eq('wallet_id', state.wallet.id)
            .eq('month_year', prevMonthYear)
            .maybeSingle();

        const banner = elements.bannerGatekeeper;
        const iconContainer = elements.gatekeeperIcon;
        const title = elements.gatekeeperTitle;
        const message = elements.gatekeeperMessage;
        const actionContainer = elements.gatekeeperActionContainer;

        if (!banner) return;

        if (!prevBatch) {
            banner.className = 'glass-card rounded-2xl p-4 border-l-4 border-amber-500 transition-all';
            iconContainer.className = 'w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-sm shrink-0';
            title.textContent = `Previous Month (${prevMonthYear}) Reconciliation Pending`;
            title.className = 'text-sm font-bold text-amber-900 tracking-tight';
            message.textContent = `No monthly settlement batch has been submitted for ${prevMonthYear}. Head Office approval is required to sanction new monthly floats.`;
            actionContainer.innerHTML = `
                <a href="monthly-report.html?month=${prevMonthYear}&project=${state.selectedProjectId}" class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-navy-950 inline-flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-file-pen"></i>
                    <span>Review & Submit ${prevMonthYear}</span>
                </a>
            `;
            banner.classList.remove('hidden');
        } else if (prevBatch.status === 'QUERIES_RAISED') {
            banner.className = 'glass-card rounded-2xl p-4 border-l-4 border-rose-500 transition-all';
            iconContainer.className = 'w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center text-sm shrink-0';
            title.textContent = `Queries Raised by Head Office (${prevMonthYear})`;
            title.className = 'text-sm font-bold text-rose-900 tracking-tight';
            message.textContent = `Head Office accounts flagged items in your previous month's statement. Please clarify remarks to unlock next month float.`;
            actionContainer.innerHTML = `
                <a href="monthly-report.html?month=${prevMonthYear}&project=${state.selectedProjectId}" class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white inline-flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>Resolve Queries</span>
                </a>
            `;
            banner.classList.remove('hidden');
        } else if (prevBatch.status === 'SUBMITTED_TO_HO') {
            banner.className = 'glass-card rounded-2xl p-4 border-l-4 border-blue-500 transition-all';
            iconContainer.className = 'w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-sm shrink-0';
            title.textContent = `Under Head Office Review (${prevMonthYear})`;
            title.className = 'text-sm font-bold text-blue-900 tracking-tight';
            message.textContent = `Your settlement report has been submitted to HQ Accounts. Awaiting formal sign-off.`;
            actionContainer.innerHTML = `
                <span class="text-xs px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 font-semibold inline-flex items-center gap-1">
                    <i class="fa-solid fa-clock"></i> In Review
                </span>
            `;
            banner.classList.remove('hidden');
        } else if (prevBatch.status === 'APPROVED_BY_HO') {
            banner.className = 'glass-card rounded-2xl p-4 border-l-4 border-emerald-500 transition-all';
            iconContainer.className = 'w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm shrink-0';
            title.textContent = `Previous Month Verified (${prevMonthYear})`;
            title.className = 'text-sm font-bold text-emerald-900 tracking-tight';
            message.textContent = `Head Office approved your ${prevMonthYear} expenses. You are eligible to receive/withdraw the new monthly float.`;
            actionContainer.innerHTML = `
                <span class="text-xs px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 font-semibold inline-flex items-center gap-1">
                    <i class="fa-solid fa-circle-check"></i> Float Eligible
                </span>
            `;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    } catch (err) {
        console.error('Error verifying gatekeeper status:', err);
    }
}

// Fetch Transactions for Selected Month
async function fetchTransactions() {
    if (!state.wallet || !isValidUUID(state.wallet.id)) return;

    elements.ledgerTableBody.innerHTML = `
        <tr class="animate-pulse">
            <td colspan="9" class="py-8 text-center text-slate-400">
                <i class="fa-solid fa-spinner fa-spin text-lg text-navy mb-2"></i>
                <p class="text-xs font-medium">Fetching transaction records...</p>
            </td>
        </tr>
    `;

    try {
        const { data, error } = await supabaseClient
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
            .order('txn_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        state.transactions = data || [];
        calculateMetrics();
        applyFilters();

    } catch (err) {
        console.error('Error fetching transactions:', err);
        elements.ledgerTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-6 text-center text-rose-500 font-medium text-xs">
                    Failed to load ledger records. Please refresh or verify network access.
                </td>
            </tr>
        `;
    }
}

// Calculate Metrics Summary
function calculateMetrics() {
    let totalSpent = 0;
    let totalReceived = 0;

    state.transactions.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        if (tx.txn_type === 'CASH_OUT') {
            totalSpent += amt;
        } else if (tx.txn_type === 'CASH_IN') {
            totalReceived += amt;
        }
    });

    // Monthly Float Limit is dynamically defined by the total float disbursed from HQ for this month
    const monthlyFloatLimit = totalReceived;
    const balance = Number(state.wallet?.current_balance) || 0;

    if (elements.metricBalance) elements.metricBalance.textContent = formatCurrency(balance);
    if (elements.metricSanctioned) elements.metricSanctioned.textContent = formatCurrency(monthlyFloatLimit);
    if (elements.metricSpent) elements.metricSpent.textContent = formatCurrency(totalSpent);
    if (elements.metricReceived) elements.metricReceived.textContent = formatCurrency(totalReceived);

    if (elements.metricBurnRate) {
        const percent = monthlyFloatLimit > 0 ? Math.round((totalSpent / monthlyFloatLimit) * 100) : 0;
        elements.metricBurnRate.textContent = `${percent}% Used`;
    }

    if (elements.cashStatusBadge) {
        if (monthlyFloatLimit === 0) {
            elements.cashStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600';
            elements.cashStatusBadge.textContent = 'No Float';
        } else if ((balance / monthlyFloatLimit) < 0.15) {
            elements.cashStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-100 text-rose-800';
            elements.cashStatusBadge.textContent = 'Low Float';
        } else if ((balance / monthlyFloatLimit) < 0.35) {
            elements.cashStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800';
            elements.cashStatusBadge.textContent = 'Moderate';
        } else {
            elements.cashStatusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800';
            elements.cashStatusBadge.textContent = 'Healthy';
        }
    }
}

// Filtering Engine
function applyFilters() {
    let result = [...state.transactions];

    if (state.selectedCategory !== 'ALL') {
        result = result.filter(tx => tx.category_id === state.selectedCategory);
    }

    if (state.filterType !== 'ALL') {
        result = result.filter(tx => tx.txn_type === state.filterType);
    }

    if (state.filterAudit !== 'ALL') {
        result = result.filter(tx => tx.ho_audit_status === state.filterAudit);
    }

    if (state.searchQuery.trim() !== '') {
        const q = state.searchQuery.toLowerCase();
        result = result.filter(tx => {
            const voucher = (tx.voucher_no || '').toLowerCase();
            const party = (tx.paid_to || tx.received_from || '').toLowerCase();
            const desc = (tx.description || '').toLowerCase();
            return voucher.includes(q) || party.includes(q) || desc.includes(q);
        });
    }

    state.filteredTransactions = result;
    renderLedgerTable();
}

// Render Table Rows
function renderLedgerTable() {
    const list = state.filteredTransactions;

    if (elements.txCount) {
        elements.txCount.textContent = `${list.length} records`;
    }

    if (list.length === 0) {
        elements.ledgerTableBody.innerHTML = '';
        elements.tableEmptyState.classList.remove('hidden');
        return;
    }

    elements.tableEmptyState.classList.add('hidden');

    const html = list.map(tx => {
        const isExpense = tx.txn_type === 'CASH_OUT';
        const catName = tx.petty_cash_categories?.name_en || (isExpense ? 'General Expense' : 'Float Top-Up (રોકડ જમા)');
        const catNameGu = tx.petty_cash_categories?.name_gu || '';
        const catIcon = tx.petty_cash_categories?.icon || (isExpense ? 'arrow-trend-down' : 'hand-holding-dollar');

        let auditBadge = '';
        if (tx.ho_audit_status === 'ACCEPTED') {
            auditBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check"></i> Accepted</span>`;
        } else if (tx.ho_audit_status === 'QUERY_RAISED') {
            auditBadge = `<button type="button" onclick="window.viewHoRemark('${tx.id}')" class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 transition-all"><i class="fa-solid fa-triangle-exclamation"></i> Remark / Query</button>`;
        } else if (tx.ho_audit_status === 'REJECTED') {
            auditBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800"><i class="fa-solid fa-xmark"></i> Rejected</span>`;
        } else {
            auditBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"><i class="fa-regular fa-clock"></i> Pending</span>`;
        }

        let modeLabel = tx.payment_mode || 'PHYSICAL_CASH';
        let modeClass = 'bg-slate-100 text-slate-700';
        if (tx.payment_mode === 'ENGINEER_UPI') {
            modeLabel = 'Engineer UPI (Personal)';
            modeClass = 'bg-purple-100 text-purple-900 border border-purple-200';
        } else if (!isExpense) {
            modeClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
        }

        const hasReceipt = Boolean(tx.bill_attachment_url);
        const receiptBtn = hasReceipt 
            ? `<button type="button" onclick="window.openReceiptModal('${tx.bill_attachment_url}', '${tx.voucher_no}')" class="w-7 h-7 rounded-lg bg-navy/5 hover:bg-navy/10 text-navy flex items-center justify-center transition-all" title="View Bill/Chitthi">
                 <i class="fa-solid fa-paperclip text-xs"></i>
               </button>`
            : `<button type="button" onclick="window.openReceiptModal('', '${tx.voucher_no}')" class="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center" title="Self Voucher (No Bill)">
                 <i class="fa-solid fa-signature text-xs"></i>
               </button>`;

        const partyTitle = isExpense 
            ? (tx.paid_to || '-') 
            : `Handed to: ${tx.paid_to || 'Site Staff'} (by ${tx.received_from || 'Owner'})`;

        return `
            <tr class="hover:bg-slate-50/70 transition-colors ${!isExpense ? 'bg-emerald-50/30' : ''}">
                <td class="py-3 px-4 whitespace-nowrap">
                    <div class="font-bold text-slate-800">${tx.voucher_no}</div>
                    <div class="text-[11px] text-slate-400">${formatDate(tx.txn_date)}</div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <div class="flex items-center space-x-2">
                        <span class="w-6 h-6 rounded-md ${!isExpense ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'} flex items-center justify-center text-xs">
                            <i class="fa-solid fa-${catIcon}"></i>
                        </span>
                        <div>
                            <div class="font-semibold text-slate-800 leading-tight">${catName}</div>
                            ${catNameGu ? `<div class="text-[10px] text-slate-400">${catNameGu}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4">
                    <div class="font-medium text-slate-800 truncate max-w-[220px]" title="${partyTitle}">${partyTitle}</div>
                    <div class="text-[11px] text-slate-500 truncate max-w-[240px]" title="${tx.description}">${tx.description}</div>
                </td>
                <td class="py-3 px-4 whitespace-nowrap">
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${modeClass}">
                        ${modeLabel}
                    </span>
                </td>
                <td class="py-3 px-4 text-right whitespace-nowrap font-bold ${!isExpense ? 'text-emerald-600' : 'text-slate-300'}">
                    ${!isExpense ? `+ ₹${formatCurrency(tx.amount)}` : '-'}
                </td>
                <td class="py-3 px-4 text-right whitespace-nowrap font-bold ${isExpense ? 'text-rose-600' : 'text-slate-300'}">
                    ${isExpense ? `₹${formatCurrency(tx.amount)}` : '-'}
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center">
                        ${receiptBtn}
                    </div>
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    ${auditBadge}
                </td>
                <td class="py-3 px-4 text-center whitespace-nowrap">
                    <div class="flex items-center justify-center space-x-1">
                        ${tx.ho_remarks ? `
                            <button type="button" onclick="window.viewHoRemark('${tx.id}')" class="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 flex items-center justify-center transition-all" title="View Notes">
                                <i class="fa-solid fa-message text-xs"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    elements.ledgerTableBody.innerHTML = html;
}

function showEmptyState() {
    if (elements.metricBalance) elements.metricBalance.textContent = '0.00';
    if (elements.metricSanctioned) elements.metricSanctioned.textContent = '0.00';
    if (elements.metricSpent) elements.metricSpent.textContent = '0.00';
    if (elements.metricReceived) elements.metricReceived.textContent = '0.00';
    if (elements.ledgerTableBody) elements.ledgerTableBody.innerHTML = '';
    if (elements.tableEmptyState) elements.tableEmptyState.classList.remove('hidden');
    if (elements.txCount) elements.txCount.textContent = '0 records';
}

// Event Listeners Setup
function attachEventListeners() {
    // Project Dropdown Change
    if (elements.selectProject) {
        elements.selectProject.addEventListener('change', async (e) => {
            state.selectedProjectId = e.target.value;
            localStorage.setItem('activeProjectId', state.selectedProjectId);
            renderSiteStaffDropdown();
            await loadWalletAndLedger();
        });
    }

    // Sync with Global Shell Project Switcher
    window.addEventListener('projectChanged', async (e) => {
        if (e.detail && e.detail.projectId) {
            state.selectedProjectId = e.detail.projectId;
            if (elements.selectProject) {
                elements.selectProject.value = e.detail.projectId;
            }
            renderSiteStaffDropdown();
            await loadWalletAndLedger();
        }
    });

    // Month Filter Change
    if (elements.selectMonth) {
        elements.selectMonth.addEventListener('change', async (e) => {
            state.selectedMonth = e.target.value;
            await evaluateGatekeeperStatus();
            await fetchTransactions();
        });
    }

    // Search Input
    if (elements.inputSearch) {
        elements.inputSearch.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            applyFilters();
        });
    }

    // Filters
    if (elements.filterType) {
        elements.filterType.addEventListener('change', (e) => {
            state.filterType = e.target.value;
            applyFilters();
        });
    }

    if (elements.filterAudit) {
        elements.filterAudit.addEventListener('change', (e) => {
            state.filterAudit = e.target.value;
            applyFilters();
        });
    }

    // CSV Export
    if (elements.btnExportCsv) {
        elements.btnExportCsv.addEventListener('click', exportLedgerToCsv);
    }

    // Disburse Float Modal Handlers
    if (elements.btnOpenDisburseModal) {
        elements.btnOpenDisburseModal.addEventListener('click', openDisburseModal);
    }
    if (elements.btnCloseDisburseModal) {
        elements.btnCloseDisburseModal.addEventListener('click', closeDisburseModal);
    }
    if (elements.btnCancelDisburse) {
        elements.btnCancelDisburse.addEventListener('click', closeDisburseModal);
    }
    if (elements.modalDisburseFloat) {
        elements.modalDisburseFloat.addEventListener('click', (e) => {
            if (e.target === elements.modalDisburseFloat) closeDisburseModal();
        });
    }
    if (elements.formDisburseFloat) {
        elements.formDisburseFloat.addEventListener('submit', handleDisburseFloatSubmit);
    }

    // Modal Receipt Handlers
    if (elements.btnCloseReceiptModal) {
        elements.btnCloseReceiptModal.addEventListener('click', closeReceiptModal);
    }
    if (elements.modalReceiptViewer) {
        elements.modalReceiptViewer.addEventListener('click', (e) => {
            if (e.target === elements.modalReceiptViewer) closeReceiptModal();
        });
    }

    // Modal Remark Handlers
    if (elements.btnCloseRemarkModal) {
        elements.btnCloseRemarkModal.addEventListener('click', closeRemarkModal);
    }
    if (elements.modalHoRemark) {
        elements.modalHoRemark.addEventListener('click', (e) => {
            if (e.target === elements.modalHoRemark) closeRemarkModal();
        });
    }

    if (elements.btnSaveJustification) {
        elements.btnSaveJustification.addEventListener('click', saveCustodianJustification);
    }
}

// Disburse Float Modal Open / Close
function openDisburseModal() {
    if (!elements.modalDisburseFloat) return;
    initDisburseFormDefaults();
    renderSiteStaffDropdown();
    elements.modalDisburseFloat.classList.remove('hidden');
}

function closeDisburseModal() {
    if (!elements.modalDisburseFloat) return;
    elements.modalDisburseFloat.classList.add('hidden');
    if (elements.formDisburseFloat) elements.formDisburseFloat.reset();
}

// Handle Float Disbursal (CASH_IN) Submission
async function handleDisburseFloatSubmit(e) {
    e.preventDefault();

    if (!state.selectedProjectId || !isValidUUID(state.selectedProjectId)) {
        alert('Please choose a valid active project first.');
        return;
    }

    if (!state.wallet || !isValidUUID(state.wallet.id)) {
        alert('Site wallet record not initialized. Please ensure the project has an active wallet.');
        return;
    }

    const selectedReceiverOption = elements.disburseSelectReceiver.options[elements.disburseSelectReceiver.selectedIndex];
    const receiverId = elements.disburseSelectReceiver.value;

    if (!receiverId) {
        alert('Please select the employee (Site Manager / Engineer / Construction Head) receiving the cash.');
        return;
    }

    const receiverName = selectedReceiverOption?.dataset?.name || selectedReceiverOption?.text || 'Site Custodian';
    const receiverRole = selectedReceiverOption?.dataset?.role ? ` (${selectedReceiverOption.dataset.role})` : '';

    const amount = parseFloat(elements.disburseInputAmount.value);
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid disbursement amount.');
        return;
    }

    const handoverDate = elements.disburseInputDate.value;
    const monthYear = handoverDate.substring(0, 7);
    const source = elements.disburseSelectSource.value;
    const mode = elements.disburseSelectMode.value;
    const notes = elements.disburseTextareaDesc.value.trim();

    try {
        elements.btnSubmitDisburse.disabled = true;
        elements.btnSubmitDisburse.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Disbursing Float...';

        let attachmentUrl = null;
        const file = elements.disburseInputFile && elements.disburseInputFile.files[0];
        if (file) {
            attachmentUrl = await uploadToR2(file, `petty-cash/${state.selectedProjectId}/${monthYear}`);
        }

        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const yyyymm = monthYear.replace('-', '');
        const voucherNo = `PC-${yyyymm}-IN${randomSuffix}`;

        const custodianId = isValidUUID(receiverId)
            ? receiverId
            : (isValidUUID(state.wallet.custodian_id) ? state.wallet.custodian_id : '00000000-0000-0000-0000-000000000001');

        // Insert CASH_IN record into Supabase
        const { error: insertError } = await supabaseClient
            .from('petty_cash_transactions')
            .insert([{
                voucher_no: voucherNo,
                wallet_id: state.wallet.id,
                project_id: state.selectedProjectId,
                custodian_id: custodianId,
                category_id: null,
                txn_type: 'CASH_IN',
                amount: amount,
                txn_date: handoverDate,
                month_year: monthYear,
                paid_to: `${receiverName}${receiverRole}`,
                received_from: `${source} (${state.currentUser?.full_name || 'Owner'})`,
                payment_mode: mode,
                voucher_type: 'PRINTED_BILL',
                description: notes || `Petty Cash Float Disbursal: ₹${formatCurrency(amount)} handed over to ${receiverName}${receiverRole}`,
                bill_attachment_url: attachmentUrl,
                ho_audit_status: 'ACCEPTED'
            }]);

        if (insertError) {
            if (insertError.message && insertError.message.includes('Head Office approval is required first')) {
                throw new Error(insertError.message);
            }
            throw insertError;
        }

        // Update the active custodian and sanctioned float limit on the wallet
        if (isValidUUID(receiverId)) {
            await supabaseClient
                .from('petty_cash_wallets')
                .update({ 
                    custodian_id: receiverId,
                    sanctioned_limit: (Number(state.wallet.sanctioned_limit) || 0) + amount,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', state.wallet.id);
        }

        alert(`Successfully disbursed ₹${formatCurrency(amount)} to ${receiverName}! The site float balance has been updated.`);
        closeDisburseModal();

        // Refresh live passbook data
        await loadWalletAndLedger();

    } catch (err) {
        console.error('Failed to disburse petty cash float:', err);
        alert('Disbursal Blocked: ' + (err.message || 'Unknown database error'));
    } finally {
        elements.btnSubmitDisburse.disabled = false;
        elements.btnSubmitDisburse.innerHTML = '<i class="fa-solid fa-check"></i> <span>Confirm Handover</span>';
    }
}

// Receipt Preview Modal Handlers
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

function closeReceiptModal() {
    if (elements.modalReceiptViewer) {
        elements.modalReceiptViewer.classList.add('hidden');
    }
}

// HO Audit Remark & Site Justification Handlers
window.viewHoRemark = (txId) => {
    const tx = state.transactions.find(t => t.id === txId);
    if (!tx || !elements.modalHoRemark) return;

    state.activeTxForRemark = tx;

    elements.hoRemarkDate.textContent = tx.ho_remark_at ? formatDate(tx.ho_remark_at) : 'Head Office Note';
    elements.hoRemarkText.textContent = tx.ho_remarks || 'Please provide detailed bill breakdown or invoice copy for this entry.';
    elements.textareaJustification.value = tx.custodian_justification || '';

    elements.modalHoRemark.classList.remove('hidden');
};

function closeRemarkModal() {
    if (elements.modalHoRemark) {
        elements.modalHoRemark.classList.add('hidden');
        state.activeTxForRemark = null;
    }
}

async function saveCustodianJustification() {
    if (!state.activeTxForRemark) return;

    const justificationText = elements.textareaJustification.value.trim();
    if (!justificationText) {
        alert('Please write a clarification or reason for Head Office.');
        return;
    }

    try {
        elements.btnSaveJustification.disabled = true;
        elements.btnSaveJustification.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

        const { error } = await supabaseClient
            .from('petty_cash_transactions')
            .update({
                custodian_justification: justificationText,
                updated_at: new Date().toISOString()
            })
            .eq('id', state.activeTxForRemark.id);

        if (error) throw error;

        state.activeTxForRemark.custodian_justification = justificationText;
        alert('Justification recorded and forwarded to Head Office.');
        closeRemarkModal();
        applyFilters();

    } catch (err) {
        console.error('Error saving justification:', err);
        alert('Failed to save justification: ' + err.message);
    } finally {
        elements.btnSaveJustification.disabled = false;
        elements.btnSaveJustification.innerHTML = 'Submit Clarification';
    }
}

// CSV Export Function
function exportLedgerToCsv() {
    if (!state.filteredTransactions || state.filteredTransactions.length === 0) {
        alert('No data to export for current view.');
        return;
    }

    const headers = [
        'Voucher No',
        'Date',
        'Type',
        'Category (EN)',
        'Category (GU)',
        'Particulars',
        'Description',
        'Payment Mode',
        'Inflow (Cr)',
        'Outflow (Dr)',
        'HO Audit Status',
        'HO Remarks',
        'Site Justification'
    ];

    const rows = state.filteredTransactions.map(tx => [
        `"${tx.voucher_no || ''}"`,
        `"${tx.txn_date || ''}"`,
        `"${tx.txn_type}"`,
        `"${tx.petty_cash_categories?.name_en || (tx.txn_type === 'CASH_IN' ? 'Float Top-Up' : '')}"`,
        `"${tx.petty_cash_categories?.name_gu || ''}"`,
        `"${(tx.paid_to || tx.received_from || '').replace(/"/g, '""')}"`,
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        `"${tx.payment_mode || ''}"`,
        tx.txn_type === 'CASH_IN' ? tx.amount : 0,
        tx.txn_type === 'CASH_OUT' ? tx.amount : 0,
        `"${tx.ho_audit_status || 'PENDING'}"`,
        `"${(tx.ho_remarks || '').replace(/"/g, '""')}"`,
        `"${(tx.custodian_justification || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PettyCash_${state.selectedProjectId}_${state.selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Realtime Synchronization
function setupRealtimeSubscription() {
    try {
        supabaseClient
            .channel('petty_cash_realtime_channel')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'petty_cash_transactions' },
                () => {
                    fetchTransactions();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'petty_cash_wallets' },
                () => {
                    loadWalletAndLedger();
                }
            )
            .subscribe();
    } catch (e) {
        console.warn('Realtime subscription unavailable or disabled:', e);
    }
}