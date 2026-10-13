/**
 * Prayosha ERP - Cash Ledger & Offshore Vault Sub-Module Logic
 * File: /purchase/cash-ledger.js
 * 
 * Features:
 * 1. Stealth Baseline: Renders authentic "No transactions found" state for standard employees.
 * 2. Role Verification: Unlocks executive controls exclusively for Owner / Trustee / Admin roles.
 * 3. Offshore Routing Mode Switch: Synchronizes PRAYOSHA_ROUTING_MODE (OFFSHORE vs DIRECT).
 * 4. Vault Inspection Mode: Decrypts and queries the isolated database on demand.
 * 5. Quick Conceal Action: Instantly snaps the screen back to the clean empty state.
 */

import { supabase, rokduSupabase, CONFIG } from '../config.js';

document.addEventListener('DOMContentLoaded', async () => {

    // =========================================================================
    // 1. DUAL DATABASE CLIENT RESOLUTION (ESM IMPORT WITH FALLBACK)
    // =========================================================================

    // Production Primary Supabase Client
    const primaryClient = supabase || window.supabaseClient || (
        typeof window.supabase !== 'undefined' && CONFIG?.SUPABASE_URL
            ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
            : null
    );

    // Isolated Offshore Database Client (System Telemetry & Audit Vault)
    const _offshoreVaultClient = rokduSupabase || window.rokduClient || (
        typeof window.supabase !== 'undefined' && CONFIG?.ROKDU_SUPABASE_URL
            ? window.supabase.createClient(CONFIG.ROKDU_SUPABASE_URL, CONFIG.ROKDU_SUPABASE_ANON_KEY)
            : null
    );

    // =========================================================================
    // 2. DOM SELECTORS
    // =========================================================================
    const activeProjectDisplay = document.getElementById('activeProjectDisplay');

    // Owner / Trustee Control Panel Elements
    const ownerControlsPanel = document.getElementById('ownerControlsPanel');
    const quickConcealBtn = document.getElementById('quickConcealBtn');
    const routingToggleCheckbox = document.getElementById('routingToggleCheckbox');
    const routingModeDescription = document.getElementById('routingModeDescription');
    const inspectVaultBtn = document.getElementById('inspectVaultBtn');
    const inspectBtnIcon = document.getElementById('inspectBtnIcon');
    const inspectBtnText = document.getElementById('inspectBtnText');

    // KPI Summary Section
    const kpiOverviewSection = document.getElementById('kpiOverviewSection');
    const kpiTotalCashDisbursed = document.getElementById('kpiTotalCashDisbursed');
    const kpiCashEntriesCount = document.getElementById('kpiCashEntriesCount');
    const kpiRoutingStatusBadge = document.getElementById('kpiRoutingStatusBadge');
    const kpiUserRoleDisplay = document.getElementById('kpiUserRoleDisplay');

    // Search & Control Elements
    const tableControlsSection = document.getElementById('tableControlsSection');
    const searchInput = document.getElementById('searchInput');
    const refreshVaultBtn = document.getElementById('refreshVaultBtn');
    const refreshSpinner = document.getElementById('refreshSpinner');

    // Table Containers
    const tableScrollContainer = document.getElementById('tableScrollContainer');
    const cashTableBody = document.getElementById('cashTableBody');
    const loadingRow = document.getElementById('loadingRow');
    const stealthEmptyState = document.getElementById('stealthEmptyState');

    // =========================================================================
    // 3. ROLE VERIFICATION & PERMISSIONS GATEWAY
    // =========================================================================
    let userRole = (localStorage.getItem('userRole') || '').trim();
    let currentUser = null;

    try {
        const userObjStr = localStorage.getItem('prayosha_user');
        if (userObjStr) currentUser = JSON.parse(userObjStr);
    } catch (e) {
        currentUser = null;
    }

    if (!userRole && currentUser) {
        userRole = currentUser.role || currentUser.user_metadata?.role || '';
    }

    // Standardize role comparison (Case-insensitive check for Owner / Trustee / Admin)
    const normalizedRole = userRole.toLowerCase().replace(/[\s_-]/g, '');
    const isAuthorizedExecutive = [
        'trustee', 
        'owner', 
        'director', 
        'superadmin', 
        'admin'
    ].some(role => normalizedRole.includes(role));

    // Active Project Display
    let activeProjectName = localStorage.getItem('activeProjectName') || 'Current Site';
    if (activeProjectDisplay) {
        activeProjectDisplay.textContent = activeProjectName;
    }

    window.addEventListener('projectChanged', (e) => {
        if (e.detail) {
            activeProjectName = e.detail.projectName || 'Current Site';
            if (activeProjectDisplay) {
                activeProjectDisplay.textContent = activeProjectName;
            }
        }
    });

    // State Variables
    let isVaultRevealed = false;
    let vaultRecords = [];

    // Indian Rupee Formatter
    const formatINR = (val) => {
        const num = parseFloat(val) || 0;
        return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };

    // =========================================================================
    // 4. EXECUTIVE PANEL ACTIVATION
    // =========================================================================
    if (isAuthorizedExecutive) {
        // Unhide the executive controls exclusively for authorized roles
        if (ownerControlsPanel) ownerControlsPanel.classList.remove('hidden');

        // Initialize Routing Mode from LocalStorage (Defaults to OFFSHORE)
        const savedRoutingMode = localStorage.getItem('PRAYOSHA_ROUTING_MODE') || 'OFFSHORE';
        if (savedRoutingMode === 'OFFSHORE') {
            if (routingToggleCheckbox) routingToggleCheckbox.checked = true;
            if (routingModeDescription) routingModeDescription.textContent = 'Currently routing cash to Isolated Offshore Vault.';
            if (kpiRoutingStatusBadge) {
                kpiRoutingStatusBadge.textContent = 'OFFSHORE VAULT';
                kpiRoutingStatusBadge.className = 'text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg';
            }
        } else {
            if (routingToggleCheckbox) routingToggleCheckbox.checked = false;
            if (routingModeDescription) routingModeDescription.textContent = 'Direct Mode: Routing cash directly to Primary Database.';
            if (kpiRoutingStatusBadge) {
                kpiRoutingStatusBadge.textContent = 'DIRECT PRIMARY DB';
                kpiRoutingStatusBadge.className = 'text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg';
            }
        }

        // Display user role badge
        const displayRoleName = (userRole || 'Trustee').toUpperCase();
        if (kpiUserRoleDisplay) {
            kpiUserRoleDisplay.textContent = `${displayRoleName} VERIFIED`;
        }

        // Routing Mode Toggle Listener
        if (routingToggleCheckbox) {
            routingToggleCheckbox.addEventListener('change', () => {
                if (routingToggleCheckbox.checked) {
                    localStorage.setItem('PRAYOSHA_ROUTING_MODE', 'OFFSHORE');
                    if (routingModeDescription) routingModeDescription.textContent = 'Currently routing cash to Isolated Offshore Vault.';
                    if (kpiRoutingStatusBadge) {
                        kpiRoutingStatusBadge.textContent = 'OFFSHORE VAULT';
                        kpiRoutingStatusBadge.className = 'text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg';
                    }
                } else {
                    localStorage.setItem('PRAYOSHA_ROUTING_MODE', 'DIRECT');
                    if (routingModeDescription) routingModeDescription.textContent = 'Direct Mode: Routing cash directly to Primary Database.';
                    if (kpiRoutingStatusBadge) {
                        kpiRoutingStatusBadge.textContent = 'DIRECT PRIMARY DB';
                        kpiRoutingStatusBadge.className = 'text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg';
                    }
                }
            });
        }

    } else {
        // Non-trustee users: Ensure panels remain completely hidden
        if (ownerControlsPanel) ownerControlsPanel.classList.add('hidden');
        if (kpiOverviewSection) kpiOverviewSection.classList.add('hidden');
        if (tableControlsSection) tableControlsSection.classList.add('hidden');
        if (tableScrollContainer) tableScrollContainer.classList.add('hidden');
        if (stealthEmptyState) stealthEmptyState.classList.remove('hidden');
    }

    // =========================================================================
    // 5. VAULT INSPECTION & DECRYPTION RUNTIME
    // =========================================================================
    if (inspectVaultBtn) {
        inspectVaultBtn.addEventListener('click', async () => {
            if (!isVaultRevealed) {
                await loadVaultLedger();
            } else {
                concealVaultLedger();
            }
        });
    }

    if (quickConcealBtn) {
        quickConcealBtn.addEventListener('click', concealVaultLedger);
    }

    async function loadVaultLedger() {
        if (!_offshoreVaultClient) {
            alert('Offshore Vault client configuration missing or uninitialized.');
            return;
        }

        setLoadingState(true);

        isVaultRevealed = true;
        if (inspectBtnIcon) inspectBtnIcon.textContent = '🔒';
        if (inspectBtnText) inspectBtnText.textContent = 'Conceal Ledger';
        if (inspectVaultBtn) {
            inspectVaultBtn.classList.remove('bg-[#1E3A5F]');
            inspectVaultBtn.classList.add('bg-rose-600', 'hover:bg-rose-700');
        }

        // Reveal sections
        if (kpiOverviewSection) kpiOverviewSection.classList.remove('hidden');
        if (tableControlsSection) tableControlsSection.classList.remove('hidden');
        if (tableScrollContainer) tableScrollContainer.classList.remove('hidden');
        if (stealthEmptyState) stealthEmptyState.classList.add('hidden');

        try {
            // Query isolated offshore table 'rokdu_purchases'
            const { data, error } = await _offshoreVaultClient
                .from('rokdu_purchases')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            vaultRecords = (data || []).map(normalizeVaultRecord);
            updateVaultKPIs(vaultRecords);
            renderVaultTable(filterVaultRecords());

        } catch (err) {
            console.error('[Offshore Ledger Retrieval]:', err);
            if (cashTableBody) {
                cashTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="py-8 text-center text-rose-500 font-semibold text-xs">
                            Failed to connect to isolated database. Verify offshore table permissions.
                        </td>
                    </tr>
                `;
            }
        } finally {
            setLoadingState(false);
        }
    }

    function concealVaultLedger() {
        isVaultRevealed = false;
        vaultRecords = [];

        if (inspectBtnIcon) inspectBtnIcon.textContent = '🔓';
        if (inspectBtnText) inspectBtnText.textContent = 'Reveal Ledger';
        if (inspectVaultBtn) {
            inspectVaultBtn.classList.remove('bg-rose-600', 'hover:bg-rose-700');
            inspectVaultBtn.classList.add('bg-[#1E3A5F]');
        }

        if (kpiOverviewSection) kpiOverviewSection.classList.add('hidden');
        if (tableControlsSection) tableControlsSection.classList.add('hidden');
        if (tableScrollContainer) tableScrollContainer.classList.add('hidden');
        if (stealthEmptyState) stealthEmptyState.classList.remove('hidden');

        if (cashTableBody) cashTableBody.innerHTML = '';
        if (searchInput) searchInput.value = '';
    }

    function normalizeVaultRecord(raw) {
        return {
            id: raw.id || 'N/A',
            date: raw.date || raw.created_at?.split('T')[0] || 'N/A',
            material: raw.material || 'Material Item',
            vendor: raw.vendor || 'Unknown Vendor',
            amount: parseFloat(raw.amount || 0),
            notes: raw.notes || '-',
            loggedBy: raw.logged_by || 'Admin'
        };
    }

    // =========================================================================
    // 6. KPI CALCULATION FOR VAULT RECORDS
    // =========================================================================
    function updateVaultKPIs(records) {
        let totalAmount = 0;
        records.forEach(r => {
            totalAmount += r.amount;
        });

        if (kpiTotalCashDisbursed) kpiTotalCashDisbursed.textContent = formatINR(totalAmount);
        if (kpiCashEntriesCount) kpiCashEntriesCount.textContent = records.length;
    }

    // =========================================================================
    // 7. SEARCH & TABLE RENDERING
    // =========================================================================
    function filterVaultRecords() {
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

        return vaultRecords.filter(r => {
            return !searchTerm ||
                r.vendor.toLowerCase().includes(searchTerm) ||
                r.material.toLowerCase().includes(searchTerm) ||
                r.notes.toLowerCase().includes(searchTerm) ||
                r.loggedBy.toLowerCase().includes(searchTerm);
        });
    }

    function renderVaultTable(records) {
        if (!cashTableBody) return;
        cashTableBody.innerHTML = '';

        if (records.length === 0) {
            cashTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-10 text-center text-slate-400 font-medium text-xs">
                        No off-grid cash vouchers found matching query.
                    </td>
                </tr>
            `;
            return;
        }

        records.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50/80 transition-colors border-b border-slate-100';

            let locationOrOfficer = '-';
            let cleanNotes = r.notes;

            if (r.notes && r.notes.includes('|')) {
                const parts = r.notes.split('|');
                const locPart = parts.find(p => p.includes('Loc:'));
                const givenPart = parts.find(p => p.includes('Given By:'));

                const locVal = locPart ? locPart.replace('Loc:', '').trim() : '';
                const givenVal = givenPart ? givenPart.replace('Given By:', '').trim() : '';

                if (locVal || givenVal) {
                    locationOrOfficer = `${givenVal || '-'} (${locVal || 'Site'})`;
                }
            }

            tr.innerHTML = `
                <td class="py-3.5 px-4 font-semibold text-slate-700">${escapeHtml(r.date)}</td>
                <td class="py-3.5 px-4 font-bold text-[#1E3A5F]">${escapeHtml(r.material)}</td>
                <td class="py-3.5 px-4 font-semibold text-slate-800">${escapeHtml(r.vendor)}</td>
                <td class="py-3.5 px-4 text-right font-bold text-emerald-700 text-sm">${formatINR(r.amount)}</td>
                <td class="py-3.5 px-4 text-slate-600">${escapeHtml(locationOrOfficer)}</td>
                <td class="py-3.5 px-4 text-slate-500 max-w-xs truncate" title="${escapeHtml(r.notes)}">${escapeHtml(cleanNotes)}</td>
                <td class="py-3.5 px-4 text-center">
                    <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        ${escapeHtml(r.loggedBy)}
                    </span>
                </td>
            `;

            cashTableBody.appendChild(tr);
        });
    }

    // =========================================================================
    // 8. UI HELPERS & EVENT LISTENERS
    // =========================================================================
    function setLoadingState(isLoading) {
        if (!refreshVaultBtn) return;
        if (isLoading) {
            if (refreshSpinner) refreshSpinner.classList.remove('hidden');
            if (loadingRow) loadingRow.classList.remove('hidden');
            refreshVaultBtn.disabled = true;
        } else {
            if (refreshSpinner) refreshSpinner.classList.add('hidden');
            if (loadingRow) loadingRow.classList.add('hidden');
            refreshVaultBtn.disabled = false;
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

    if (searchInput) searchInput.addEventListener('input', () => renderVaultTable(filterVaultRecords()));
    if (refreshVaultBtn) refreshVaultBtn.addEventListener('click', loadVaultLedger);
});