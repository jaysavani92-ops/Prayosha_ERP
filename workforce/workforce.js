/**
 * ==============================================================================
 * PRAYOSHA ERP - WORKFORCE & EQUIPMENT MODULE CONTROLLER (REFINED)
 * File: /workforce/workforce.js
 * Tech Stack: Vanilla JS (ES Modules), Supabase, Tailwind CSS
 * Styling Palette: Prayosha Navy (#1E3A5F), Crisp Off-White, Amber & Emerald
 * ==============================================================================
 */

import * as Config from '../config.js';

// Initialize Supabase Client from config
const supabase = Config.supabase;

// ==============================================================================
// APPLICATION STATE
// ==============================================================================
const state = {
    // User & Session Context
    currentUser: null,
    currentUserName: 'Jay',
    userId: null,
    userRole: 'Site Supervisor',

    // Assigned Projects (Point 1)
    allProjects: [],
    assignedProjects: [],
    activeProjectId: null,
    activeProject: null,

    // Active Navigation Tabs
    activeTab: 'log-attendance', // 'log-attendance' | 'daily-logs' | 'generate-report'
    activeRecordType: 'labor',   // 'labor' | 'equipment' | 'inhouse'

    // Hybrid Wages Mode (Point 3: Off by default)
    wagesModeEnabled: false,

    // Master Configurations
    agencyConfigs: [],
    equipmentConfigs: [],
    inhouseRoles: ['Head Mistri', 'Male Helper', 'Female Helper', 'Mukadam', 'Store Watchman'],

    // Attendance Entry Form State
    selectedDate: new Date().toISOString().split('T')[0],
    selectedWeather: 'Sunny',
    agencyRows: [],   // Array of { id, agencyName, tradeType, dailyRate, breakdown: {}, totalCount, remarks }
    inhouseRows: [],  // Array of { id, workerName, roleType, status, units, otHours, dailyWage, remarks }

    // Daily Logs View State
    dailyLogsDate: new Date().toISOString().split('T')[0],
    dailyLogsFilter: 'ALL', // 'ALL' | 'LABOR' | 'EQUIPMENT' | 'INHOUSE'
    dailyLogsSearch: '',
    currentDayDiary: null,
    dailyLaborLogs: [],
    dailyEquipmentLogs: [],
    dailyInhouseLogs: [],

    // Report Generation Form State
    reportExportFormat: 'csv' // 'csv' | 'pdf'
};

// ==============================================================================
// INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initLocalState();
    setupEventListeners();
    await loadUserContext();
    await scanAndLoadAssignedProjects();
    await fetchMasterConfigs();
    resetAttendanceForms();
    await fetchDailyLogs();
    setupRealtimeSubscriptions();
});

/**
 * Initialize Dates and Local In-House Roles
 */
function initLocalState() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('attendanceDateInput');
    const logsDateInput = document.getElementById('dailyLogsDateFilter');

    if (dateInput) dateInput.value = today;
    if (logsDateInput) logsDateInput.value = today;
    state.selectedDate = today;
    state.dailyLogsDate = today;

    // Load custom inhouse roles from localStorage if saved
    try {
        const savedRoles = localStorage.getItem('prayosha_inhouse_roles');
        if (savedRoles) {
            const parsed = JSON.parse(savedRoles);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.inhouseRoles = parsed;
            }
        }
    } catch (e) {
        console.warn('Inhouse roles localStorage fallback:', e.message);
    }
}

/**
 * Fetch authenticated user profile & enforce Tamper-Proof "Recorded By"
 */
async function loadUserContext() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            state.currentUser = user;
            state.userId = user.id;

            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (profile) {
                state.userRole = profile.role || state.userRole;
                state.currentUserName = profile.full_name || user.email.split('@')[0];
            } else if (user.user_metadata?.full_name) {
                state.currentUserName = user.user_metadata.full_name;
            }
        }
    } catch (err) {
        console.warn('User auth session fallback:', err.message);
    }

    // Tamper-Proof: Lock input and display name
    const recInput = document.getElementById('recordedByInput');
    if (recInput) {
        recInput.value = state.currentUserName;
        recInput.readOnly = true;
        recInput.disabled = true;
    }
}

// ==============================================================================
// POINT 1: SCAN ASSIGNED PROJECTS & AUTOMATIC SELECTOR
// ==============================================================================
async function scanAndLoadAssignedProjects() {
    const projectSelect = document.getElementById('assignedProjectSelect');
    const statusBadge = document.getElementById('projectAssignmentStatusBadge');
    const headerBadge = document.getElementById('activeProjectBadge');
    const headerBadgeText = document.getElementById('activeProjectCodeName');
    const noProjectAlert = document.getElementById('noProjectAlert');

    try {
        const { data: projects, error } = await supabase
            .from('projects')
            .select('*')
            .order('name');

        if (error) throw error;
        state.allProjects = projects || [];

        // Scan which projects the user is assigned to
        const uId = state.userId;
        const uName = (state.currentUserName || '').toLowerCase();
        const uRole = state.userRole;

        // Executive roles have universal site access
        const isExecutive = ['Owner', 'General Manager', 'Chief Engineer'].includes(uRole);

        if (isExecutive) {
            state.assignedProjects = state.allProjects;
        } else {
            state.assignedProjects = state.allProjects.filter(p => {
                const assignedCe = (p.assigned_chief_engineer || '').toLowerCase();
                const assignedPm = (p.assigned_project_manager || '').toLowerCase();
                const assignedCt = (p.assigned_contractor || '').toLowerCase();
                const team = Array.isArray(p.project_team_array) ? p.project_team_array : [];

                return (
                    p.assigned_chief_engineer === uId ||
                    p.assigned_project_manager === uId ||
                    p.assigned_contractor === uId ||
                    assignedCe.includes(uName) ||
                    assignedPm.includes(uName) ||
                    assignedCt.includes(uName) ||
                    team.includes(uId) ||
                    team.some(member => String(member).toLowerCase().includes(uName))
                );
            });

            // Graceful fallback: If site assignments are not yet mapped, allow access to all projects
            if (state.assignedProjects.length === 0) {
                state.assignedProjects = state.allProjects;
            }
        }

        // Render Assigned Projects Dropdown
        if (state.assignedProjects.length === 0) {
            if (projectSelect) projectSelect.innerHTML = `<option value="" disabled selected>No active projects found</option>`;
            if (statusBadge) statusBadge.textContent = 'None Assigned';
            if (noProjectAlert) noProjectAlert.classList.remove('hidden');
            if (headerBadge) headerBadge.classList.add('hidden');
            return;
        }

        if (noProjectAlert) noProjectAlert.classList.add('hidden');

        // Check if there is an active project cached in localStorage
        const cachedProjectId = localStorage.getItem('activeProjectId');
        const isCachedValid = state.assignedProjects.some(p => p.id === cachedProjectId);

        let selectedId = null;
        if (isCachedValid) {
            selectedId = cachedProjectId;
        } else {
            // Auto-select the first assigned project
            selectedId = state.assignedProjects[0].id;
        }

        state.activeProjectId = selectedId;
        state.activeProject = state.assignedProjects.find(p => p.id === selectedId);

        localStorage.setItem('activeProjectId', state.activeProject.id);
        localStorage.setItem('activeProjectName', state.activeProject.name);

        // Populate Dropdown
        if (projectSelect) {
            projectSelect.innerHTML = state.assignedProjects.map(p => `
                <option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>
                    ${p.project_code ? '[' + p.project_code + '] ' : ''}${p.name}
                </option>
            `).join('');
        }

        // Update Status Badges
        if (state.assignedProjects.length === 1) {
            if (statusBadge) statusBadge.textContent = '1 Project Assigned (Auto-Selected)';
        } else {
            if (statusBadge) statusBadge.textContent = `${state.assignedProjects.length} Assigned Projects`;
        }

        if (headerBadge && headerBadgeText && state.activeProject) {
            headerBadge.classList.remove('hidden');
            headerBadgeText.textContent = `${state.activeProject.project_code ? '[' + state.activeProject.project_code + '] ' : ''}${state.activeProject.name}`;
        }

        // Populate Point 4 Report Project Filter Dropdown
        populateReportProjectFilter();

    } catch (err) {
        console.error('Error scanning assigned projects:', err.message);
        showToast('Error loading project assignments', 'warning');
    }
}

function populateReportProjectFilter() {
    const reportProjectSelect = document.getElementById('reportFilterProject');
    if (!reportProjectSelect) return;

    reportProjectSelect.innerHTML = `<option value="ALL">All Assigned Projects</option>`;
    state.assignedProjects.forEach(p => {
        reportProjectSelect.innerHTML += `
            <option value="${p.id}" ${p.id === state.activeProjectId ? 'selected' : ''}>
                ${p.project_code ? '[' + p.project_code + '] ' : ''}${p.name}
            </option>
        `;
    });
}

// ==============================================================================
// MASTER CONFIGURATIONS & DROPDOWNS
// ==============================================================================
async function fetchMasterConfigs() {
    try {
        const [agencyRes, eqpRes] = await Promise.all([
            supabase.from('workforce_agency_configs').select('*').eq('is_active', true).order('sort_order'),
            supabase.from('workforce_equipment_configs').select('*').eq('is_active', true).order('sort_order')
        ]);

        if (agencyRes.data) state.agencyConfigs = agencyRes.data;
        if (eqpRes.data) state.equipmentConfigs = eqpRes.data;

        populateEquipmentDropdown();
        populateReportScopeDropdowns();
    } catch (err) {
        console.error('Error fetching master configs:', err.message);
    }
}

function populateEquipmentDropdown(selectedVal = '') {
    const select = document.getElementById('eqpTypeSelect');
    if (!select) return;

    select.innerHTML = `<option value="" disabled ${!selectedVal ? 'selected' : ''}>-- Select Equipment --</option>`;
    state.equipmentConfigs.forEach(item => {
        const isSel = item.equipment_type === selectedVal;
        select.innerHTML += `
            <option value="${escapeHtml(item.equipment_type)}" data-rate="${item.default_hourly_rate}" ${isSel ? 'selected' : ''}>
                ${escapeHtml(item.equipment_type)} (${state.wagesModeEnabled ? '₹' + item.default_hourly_rate + '/hr' : 'Active'})
            </option>
        `;
    });
}

function populateReportScopeDropdowns() {
    const agencySelect = document.getElementById('reportFilterAgency');
    const eqpSelect = document.getElementById('reportFilterEquipment');

    if (agencySelect) {
        agencySelect.innerHTML = `<option value="ALL">All Agencies (No Filter)</option>`;
        state.agencyConfigs.forEach(a => {
            agencySelect.innerHTML += `<option value="${escapeHtml(a.agency_name)}">${escapeHtml(a.agency_name)} (${escapeHtml(a.trade_type)})</option>`;
        });
    }

    if (eqpSelect) {
        eqpSelect.innerHTML = `<option value="ALL">All Equipment (No Filter)</option>`;
        state.equipmentConfigs.forEach(e => {
            eqpSelect.innerHTML += `<option value="${escapeHtml(e.equipment_type)}">${escapeHtml(e.equipment_type)}</option>`;
        });
    }
}

// ==============================================================================
// POINT 3: HYBRID WAGES MODE TOGGLE
// ==============================================================================
function toggleWagesMode() {
    state.wagesModeEnabled = !state.wagesModeEnabled;

    const btn = document.getElementById('toggleWagesGlobalBtn');
    const icon = document.getElementById('wagesToggleIcon');
    const eqpRateContainer = document.getElementById('eqpRateContainer');
    const statusLabel = document.getElementById('kpiWagesStatusLabel');

    if (state.wagesModeEnabled) {
        btn.className = 'px-3 py-2 rounded-lg border-2 border-emerald-600 bg-emerald-50 text-emerald-800 font-bold text-xs transition shadow-sm flex items-center gap-2';
        icon.className = 'fa-solid fa-toggle-on text-emerald-600 text-sm';
        btn.querySelector('span').textContent = 'Wages: Active';
        if (eqpRateContainer) eqpRateContainer.classList.remove('hidden');
        if (statusLabel) statusLabel.textContent = 'Wages Mode: Active';
        showToast('Wages mode enabled: Financial rates & costs are now editable', 'info');
    } else {
        btn.className = 'px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition shadow-sm flex items-center gap-2';
        icon.className = 'fa-solid fa-toggle-off text-slate-400 text-sm';
        btn.querySelector('span').textContent = 'Add Wages';
        if (eqpRateContainer) eqpRateContainer.classList.add('hidden');
        if (statusLabel) statusLabel.textContent = 'Wages Mode: Off';
        showToast('Wages mode disabled: Financial rates hidden for simplified attendance', 'info');
    }

    // Refresh dynamic forms to toggle wage input visibility
    renderAgencyRows();
    renderInhouseRows();
    populateEquipmentDropdown(document.getElementById('eqpTypeSelect')?.value);
    updateExecutiveKpis();
}

// ==============================================================================
// 1. LOG ATTENDANCE: CONTRACTOR & AGENCY LABOUR LOG
// ==============================================================================
function resetAttendanceForms() {
    state.agencyRows = [];
    state.inhouseRows = [];

    // Pre-populate with standard agencies if available
    if (state.agencyConfigs.length > 0) {
        state.agencyConfigs.forEach(conf => {
            addAgencyRow(conf.agency_name, conf.trade_type, conf.default_wage_rate);
        });
    } else {
        addAgencyRow('Bholenath Construction', 'Contractor', 550.00);
    }

    // Pre-populate standard in-house worker rows
    addInhouseRow('Ramesh Mistri', 'Head Mistri', 'Full Day', 1.0, 0, 700.00);
    addInhouseRow('Suresh Kumar', 'Male Helper', 'Full Day', 1.0, 0, 450.00);
}

/**
 * Add an agency attendance row.
 * NOTE: Agency names are selected strictly from pre-approved master configs (Point 2: Higher management only).
 */
function addAgencyRow(defaultAgencyName = '', defaultTrade = '', defaultRate = 550.00) {
    const rowId = 'agency_row_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newRow = {
        id: rowId,
        agencyName: defaultAgencyName,
        tradeType: defaultTrade,
        dailyRate: defaultRate,
        breakdown: {},
        totalCount: 0,
        remarks: '',
        isYesterdayPrefilled: false
    };

    state.agencyRows.push(newRow);
    renderAgencyRows();

    if (defaultAgencyName) {
        scanYesterdayAttendanceForAgency(rowId, defaultAgencyName);
    }
}

function renderAgencyRows() {
    const container = document.getElementById('agencyRowsContainer');
    if (!container) return;

    if (state.agencyRows.length === 0) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs shadow-sm">
                No agency rows added. Click "+ Add Agency Row" to record contractor attendance.
            </div>`;
        return;
    }

    container.innerHTML = state.agencyRows.map((row, index) => {
        const matchingConfig = state.agencyConfigs.find(c => c.agency_name === row.agencyName) || {
            trade_type: row.tradeType || 'Contractor',
            default_wage_rate: row.dailyRate || 550.00,
            breakdown_fields: []
        };

        const trade = matchingConfig.trade_type || row.tradeType;
        const breakdownHtml = generateTradeBreakdownHtml(row.id, trade, row.breakdown, matchingConfig.breakdown_fields);

        return `
            <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 hover:border-slate-300 transition" data-row-id="${row.id}">
                <!-- Agency Header Row -->
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-lg bg-prayosha-navy text-white font-mono text-xs font-bold flex items-center justify-center">${index + 1}</span>
                        <div class="relative w-full sm:w-64">
                            <select class="glass-input text-xs w-full py-2 px-3 rounded-lg font-bold text-slate-800 agency-name-select" data-row-id="${row.id}">
                                <option value="" disabled ${!row.agencyName ? 'selected' : ''}>-- Select Agency --</option>
                                ${state.agencyConfigs.map(c => `
                                    <option value="${escapeHtml(c.agency_name)}" data-trade="${escapeHtml(c.trade_type)}" data-rate="${c.default_wage_rate}" ${c.agency_name === row.agencyName ? 'selected' : ''}>
                                        ${escapeHtml(c.agency_name)} (${escapeHtml(c.trade_type)})
                                    </option>
                                `).join('')}
                                ${!state.agencyConfigs.some(c => c.agency_name === row.agencyName) && row.agencyName ? `
                                    <option value="${escapeHtml(row.agencyName)}" selected>${escapeHtml(row.agencyName)} (${escapeHtml(row.tradeType)})</option>
                                ` : ''}
                            </select>
                        </div>
                        <span class="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-prayosha-navy font-bold border border-slate-200">
                            ${escapeHtml(trade || 'Agency')}
                        </span>
                    </div>

                    <!-- Auto-filled Indicator & Remove Action -->
                    <div class="flex items-center gap-3">
                        ${row.isYesterdayPrefilled ? `
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <i class="fa-solid fa-clock-rotate-left"></i> Yesterday Prefilled
                            </span>
                        ` : ''}
                        <button type="button" class="text-slate-400 hover:text-rose-600 text-xs transition remove-agency-row-btn p-1" data-row-id="${row.id}" title="Remove Agency Row">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <!-- Dynamic Trade Sub-Breakdown Input Fields -->
                ${breakdownHtml}

                <!-- Totals & Hybrid Rate Strip -->
                <div class="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-1.5 font-bold text-slate-800">
                            <span>Total Count:</span>
                            <span class="font-extrabold text-prayosha-navy text-base font-mono row-total-count-display">${row.totalCount || 0}</span>
                            <span class="text-[11px] text-slate-500 font-normal">Labours</span>
                        </div>

                        <!-- Hybrid Wages Display (Point 3) -->
                        ${state.wagesModeEnabled ? `
                            <div class="flex items-center gap-1.5 text-slate-600">
                                <span>Wage:</span>
                                <input type="number" step="any" class="glass-input text-xs py-1 px-2 rounded w-20 text-right font-mono agency-wage-input" data-row-id="${row.id}" value="${row.dailyRate || 550.00}">
                                <span class="text-[10px]">₹/day</span>
                            </div>
                            <div class="text-slate-600 font-mono text-[11px]">
                                Est. Cost: <span class="text-emerald-700 font-bold row-cost-preview">₹${formatNumber((row.totalCount || 0) * (row.dailyRate || 550.00))}</span>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Remarks Input -->
                    <div class="flex-1 max-w-sm">
                        <input type="text" placeholder="Remarks (Tower, slab, location)..." class="glass-input text-xs py-1.5 px-3 rounded-lg w-full agency-remark-input" data-row-id="${row.id}" value="${escapeHtml(row.remarks || '')}">
                    </div>
                </div>
            </div>
        `;
    }).join('');

    bindAgencyRowEvents();
}

/**
 * Generate Sub-Trade input boxes
 */
function generateTradeBreakdownHtml(rowId, tradeType, currentBreakdown = {}, customFields = []) {
    // 1. If Contractor: 5 Fields (Senting, Steel, Masionary, Plaster, Casting)
    if (tradeType.toLowerCase() === 'contractor') {
        const fields = [
            { key: 'senting', label: 'Senting (Shuttering)' },
            { key: 'steel', label: 'Steel (Fitters)' },
            { key: 'masionary', label: 'Masionary (Kadia)' },
            { key: 'plaster', label: 'Plaster' },
            { key: 'casting', label: 'Casting (Concrete)' }
        ];

        return `
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                ${fields.map(f => `
                    <div class="space-y-1">
                        <label class="text-[10px] font-bold text-slate-600 uppercase tracking-wider truncate block" title="${f.label}">${f.label}</label>
                        <input type="number" min="0" step="1" 
                               class="glass-input text-xs py-1.5 px-2 rounded-lg w-full font-mono font-bold text-center trade-count-input" 
                               data-row-id="${rowId}" data-trade-key="${f.key}" 
                               value="${currentBreakdown[f.key] || 0}">
                    </div>
                `).join('')}
            </div>
        `;
    }

    // 2. If Plumber: 2 Fields (Water Proofing, Plumbing)
    if (tradeType.toLowerCase() === 'plumber' || tradeType.toLowerCase() === 'plumbing') {
        const fields = [
            { key: 'water_proofing', label: 'Water Proofing' },
            { key: 'plumbing', label: 'Plumbing Works' }
        ];

        return `
            <div class="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 max-w-lg">
                ${fields.map(f => `
                    <div class="space-y-1">
                        <label class="text-[10px] font-bold text-slate-600 uppercase tracking-wider truncate block">${f.label}</label>
                        <input type="number" min="0" step="1" 
                               class="glass-input text-xs py-1.5 px-2 rounded-lg w-full font-mono font-bold text-center trade-count-input" 
                               data-row-id="${rowId}" data-trade-key="${f.key}" 
                               value="${currentBreakdown[f.key] || 0}">
                    </div>
                `).join('')}
            </div>
        `;
    }

    // 3. Custom Fields from Super Engine
    if (Array.isArray(customFields) && customFields.length > 0) {
        return `
            <div class="grid grid-cols-2 sm:grid-cols-${Math.min(customFields.length, 4)} gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                ${customFields.map(f => `
                    <div class="space-y-1">
                        <label class="text-[10px] font-bold text-slate-600 uppercase tracking-wider truncate block">${f.label}</label>
                        <input type="number" min="0" step="1" 
                               class="glass-input text-xs py-1.5 px-2 rounded-lg w-full font-mono font-bold text-center trade-count-input" 
                               data-row-id="${rowId}" data-trade-key="${f.key}" 
                               value="${currentBreakdown[f.key] || 0}">
                    </div>
                `).join('')}
            </div>
        `;
    }

    // 4. Default Single Trade Count Input
    return `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 max-w-xs space-y-1">
            <label class="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Number of Labours</label>
            <input type="number" min="0" step="1" 
                   class="glass-input text-xs py-1.5 px-3 rounded-lg w-full font-mono font-bold text-center trade-count-input" 
                   data-row-id="${rowId}" data-trade-key="general_count" 
                   value="${currentBreakdown.general_count || currentBreakdown.count || 0}">
        </div>
    `;
}

function bindAgencyRowEvents() {
    // Agency Select change
    document.querySelectorAll('.agency-name-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const rowId = e.target.dataset.rowId;
            const selectedOpt = e.target.selectedOptions[0];
            const agencyName = e.target.value;
            const tradeType = selectedOpt.dataset.trade || 'Contractor';
            const dailyRate = parseFloat(selectedOpt.dataset.rate) || 550.00;

            const row = state.agencyRows.find(r => r.id === rowId);
            if (row) {
                row.agencyName = agencyName;
                row.tradeType = tradeType;
                row.dailyRate = dailyRate;
                row.breakdown = {};
                row.totalCount = 0;
                row.isYesterdayPrefilled = false;
                renderAgencyRows();
                scanYesterdayAttendanceForAgency(rowId, agencyName);
            }
        });
    });

    // Sub-Trade Count input change
    document.querySelectorAll('.trade-count-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const rowId = e.target.dataset.rowId;
            const tradeKey = e.target.dataset.tradeKey;
            const val = parseInt(e.target.value) || 0;

            const row = state.agencyRows.find(r => r.id === rowId);
            if (!row) return;

            row.breakdown[tradeKey] = val;

            let sum = 0;
            Object.values(row.breakdown).forEach(v => sum += (parseInt(v) || 0));
            row.totalCount = sum;

            const rowEl = document.querySelector(`div[data-row-id="${rowId}"]`);
            if (rowEl) {
                const totalDisplay = rowEl.querySelector('.row-total-count-display');
                const costDisplay = rowEl.querySelector('.row-cost-preview');
                if (totalDisplay) totalDisplay.textContent = sum;
                if (costDisplay) costDisplay.textContent = `₹${formatNumber(sum * (row.dailyRate || 550.00))}`;
            }

            updateRealtimeKpis();
        });
    });

    // Wage input change
    document.querySelectorAll('.agency-wage-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const rowId = e.target.dataset.rowId;
            const row = state.agencyRows.find(r => r.id === rowId);
            if (row) {
                row.dailyRate = parseFloat(e.target.value) || 0;
                const rowEl = document.querySelector(`div[data-row-id="${rowId}"]`);
                if (rowEl) {
                    const costDisplay = rowEl.querySelector('.row-cost-preview');
                    if (costDisplay) costDisplay.textContent = `₹${formatNumber(row.totalCount * row.dailyRate)}`;
                }
                updateRealtimeKpis();
            }
        });
    });

    // Remark input change
    document.querySelectorAll('.agency-remark-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const rowId = e.target.dataset.rowId;
            const row = state.agencyRows.find(r => r.id === rowId);
            if (row) row.remarks = e.target.value.trim();
        });
    });

    // Remove row button
    document.querySelectorAll('.remove-agency-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const rowId = e.currentTarget.dataset.rowId;
            state.agencyRows = state.agencyRows.filter(r => r.id !== rowId);
            renderAgencyRows();
            updateRealtimeKpis();
        });
    });
}

/**
 * Scan Yesterday's Attendance for a Single Agency
 */
async function scanYesterdayAttendanceForAgency(rowId, agencyName) {
    if (!state.activeProjectId || !agencyName) return;

    try {
        const currentDate = new Date(state.selectedDate);
        currentDate.setDate(currentDate.getDate() - 1);
        const yesterdayStr = currentDate.toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('workforce_labor_logs')
            .select('*')
            .eq('project_id', state.activeProjectId)
            .eq('agency_name', agencyName)
            .eq('log_date', yesterdayStr)
            .maybeSingle();

        if (error || !data) return;

        const row = state.agencyRows.find(r => r.id === rowId);
        if (row && (!row.totalCount || row.totalCount === 0)) {
            row.breakdown = data.breakdown || {};
            row.totalCount = data.total_count || 0;
            row.dailyRate = data.daily_wage_rate || row.dailyRate;
            row.isYesterdayPrefilled = true;
            renderAgencyRows();

            document.getElementById('yesterdayScannedBadge')?.classList.remove('hidden');
            updateRealtimeKpis();
        }
    } catch (err) {
        console.warn('Yesterday scan notice:', err.message);
    }
}

/**
 * 1-Click Copy All Yesterday's Deployments
 */
async function copyAllYesterdayDeployments() {
    if (!state.activeProjectId) {
        showToast('Please select a project first', 'warning');
        return;
    }

    try {
        const currentDate = new Date(state.selectedDate);
        currentDate.setDate(currentDate.getDate() - 1);
        const yesterdayStr = currentDate.toISOString().split('T')[0];

        const { data: logs, error } = await supabase
            .from('workforce_labor_logs')
            .select('*')
            .eq('project_id', state.activeProjectId)
            .eq('log_date', yesterdayStr);

        if (error) throw error;

        if (!logs || logs.length === 0) {
            showToast(`No labor logs recorded yesterday (${yesterdayStr}) to replicate`, 'info');
            return;
        }

        state.agencyRows = logs.map(item => ({
            id: 'agency_row_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            agencyName: item.agency_name,
            tradeType: item.labor_type,
            dailyRate: item.daily_wage_rate,
            breakdown: item.breakdown || {},
            totalCount: item.total_count,
            remarks: item.remarks || '',
            isYesterdayPrefilled: true
        }));

        renderAgencyRows();
        updateRealtimeKpis();
        document.getElementById('yesterdayScannedBadge')?.classList.remove('hidden');
        showToast(`Replicated ${logs.length} agency rosters from yesterday!`, 'success');
    } catch (err) {
        console.error('Error copying yesterday deployments:', err.message);
        showToast('Failed to replicate yesterday muster', 'warning');
    }
}

/**
 * Save Labor Attendance Records to Supabase
 */
async function saveLaborLogs() {
    if (!state.activeProjectId) {
        showToast('Please select a project first', 'warning');
        return;
    }

    if (state.agencyRows.length === 0) {
        showToast('Please add at least one agency attendance record', 'warning');
        return;
    }

    await saveDailyDiary();

    const rowsToUpsert = state.agencyRows.map(row => ({
        project_id: state.activeProjectId,
        log_date: state.selectedDate,
        phase: state.activeProject?.name || 'Main Site',
        agency_name: row.agencyName,
        labor_type: row.tradeType || 'Contractor',
        breakdown: row.breakdown || {},
        total_count: row.totalCount || 0,
        daily_wage_rate: state.wagesModeEnabled ? (row.dailyRate || 550.00) : 0.00,
        remarks: row.remarks || null,
        recorded_by_id: state.userId || null,
        recorded_by_name: state.currentUserName
    }));

    try {
        const { error } = await supabase
            .from('workforce_labor_logs')
            .upsert(rowsToUpsert, { onConflict: 'project_id,agency_name,log_date' });

        if (error) throw error;

        showToast(`Saved attendance for ${rowsToUpsert.length} contractor agencies!`, 'success');
        await fetchDailyLogs();
    } catch (err) {
        console.error('Error saving labor logs:', err.message);
        showToast('Error saving labor attendance', 'warning');
    }
}

// ==============================================================================
// 2. LOG ATTENDANCE: HEAVY EQUIPMENT LOG & QUICK ADD (POINT 2)
// ==============================================================================
function openQuickAddEquipmentModal() {
    document.getElementById('quickEqpNameInput').value = '';
    document.getElementById('quickEqpRateInput').value = '1000.00';
    document.getElementById('quickAddEquipmentModal').classList.remove('hidden');
}

function closeQuickAddEquipmentModal() {
    document.getElementById('quickAddEquipmentModal').classList.add('hidden');
}

async function handleConfirmQuickAddEquipment() {
    const name = document.getElementById('quickEqpNameInput').value.trim();
    const rate = parseFloat(document.getElementById('quickEqpRateInput').value) || 1000.00;

    if (!name) {
        showToast('Please enter an equipment or machine name', 'warning');
        return;
    }

    try {
        const { error } = await supabase
            .from('workforce_equipment_configs')
            .insert({
                equipment_type: name,
                default_hourly_rate: rate,
                is_active: true
            });

        if (error) throw error;

        showToast(`Added ${name} to equipment list!`, 'success');
        closeQuickAddEquipmentModal();

        await fetchMasterConfigs();
        populateEquipmentDropdown(name);
        document.getElementById('eqpHourlyRateInput').value = rate;
        updateEquipmentCostPreview();
    } catch (err) {
        console.error('Error adding equipment:', err.message);
        showToast('Could not save equipment', 'warning');
    }
}

async function saveEquipmentLog() {
    if (!state.activeProjectId) {
        showToast('Please select a project first', 'warning');
        return;
    }

    const typeSelect = document.getElementById('eqpTypeSelect');
    const hoursInput = document.getElementById('eqpHoursInput');
    const rateInput = document.getElementById('eqpHourlyRateInput');
    const purposeInput = document.getElementById('eqpPurposeInput');
    const remarksInput = document.getElementById('eqpRemarksInput');

    const eqpType = typeSelect.value;
    const hours = parseFloat(hoursInput.value) || 0;
    const rate = state.wagesModeEnabled ? (parseFloat(rateInput.value) || 0) : 0;
    const purpose = purposeInput.value.trim();
    const remarks = remarksInput.value.trim();

    if (!eqpType) {
        showToast('Please select an equipment type', 'warning');
        return;
    }
    if (hours <= 0) {
        showToast('Please enter operating hours used', 'warning');
        return;
    }
    if (!purpose) {
        showToast('Please specify purpose of use / activity', 'warning');
        return;
    }

    await saveDailyDiary();

    const record = {
        project_id: state.activeProjectId,
        log_date: state.selectedDate,
        phase: state.activeProject?.name || 'Main Site',
        equipment_type: eqpType,
        hours_used: hours,
        hourly_rate: rate,
        purpose_of_use: purpose,
        remarks: remarks || null,
        recorded_by_id: state.userId || null,
        recorded_by_name: state.currentUserName
    };

    try {
        const { error } = await supabase
            .from('workforce_equipment_logs')
            .insert(record);

        if (error) throw error;

        showToast(`Saved equipment log for ${eqpType} (${hours} hrs)!`, 'success');

        hoursInput.value = '0.0';
        purposeInput.value = '';
        remarksInput.value = '';
        document.getElementById('eqpCostPreviewBadge').textContent = 'Total: ₹0.00';

        await fetchDailyLogs();
    } catch (err) {
        console.error('Error saving equipment log:', err.message);
        showToast('Failed to save equipment log', 'warning');
    }
}

// ==============================================================================
// 3. LOG ATTENDANCE: IN-HOUSE SITE LABOUR & QUICK ADD ROLE (POINT 2)
// ==============================================================================
function openQuickAddRoleModal() {
    document.getElementById('quickRoleNameInput').value = '';
    document.getElementById('quickRoleWageInput').value = '500.00';
    document.getElementById('quickAddRoleModal').classList.remove('hidden');
}

function closeQuickAddRoleModal() {
    document.getElementById('quickAddRoleModal').classList.add('hidden');
}

function handleConfirmQuickAddRole() {
    const roleName = document.getElementById('quickRoleNameInput').value.trim();
    if (!roleName) {
        showToast('Please enter a role title', 'warning');
        return;
    }

    if (!state.inhouseRoles.includes(roleName)) {
        state.inhouseRoles.push(roleName);
        try {
            localStorage.setItem('prayosha_inhouse_roles', JSON.stringify(state.inhouseRoles));
        } catch (e) {
            console.warn(e);
        }
    }

    showToast(`Added role: "${roleName}"`, 'success');
    closeQuickAddRoleModal();
    renderInhouseRows();
}

function addInhouseRow(name = '', role = 'Helper', status = 'Full Day', units = 1.0, otHours = 0, wage = 450.00) {
    const rowId = 'inh_row_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    state.inhouseRows.push({
        id: rowId,
        workerName: name,
        roleType: role,
        attendanceStatus: status,
        attendanceUnits: units,
        overtimeHours: otHours,
        dailyWage: wage,
        remarks: ''
    });
    renderInhouseRows();
}

function renderInhouseRows() {
    const container = document.getElementById('inhouseRowsContainer');
    if (!container) return;

    if (state.inhouseRows.length === 0) {
        container.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400 text-xs shadow-sm">No staff rows added. Click "+ Add Worker" to track in-house payroll.</div>`;
        return;
    }

    container.innerHTML = state.inhouseRows.map((row, idx) => `
        <div class="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs" data-inh-id="${row.id}">
            <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded bg-prayosha-navy text-white font-mono text-[11px] font-bold flex items-center justify-center">${idx + 1}</span>
                <input type="text" placeholder="Worker Name" class="glass-input text-xs py-1 px-2.5 rounded w-44 font-bold text-slate-800 inh-name-input" data-inh-id="${row.id}" value="${escapeHtml(row.workerName)}">
                
                <!-- Dynamic In-House Roles Dropdown -->
                <select class="glass-input text-xs py-1 px-2.5 rounded font-semibold inh-role-select" data-inh-id="${row.id}">
                    ${state.inhouseRoles.map(r => `
                        <option value="${escapeHtml(r)}" ${row.roleType === r ? 'selected' : ''}>${escapeHtml(r)}</option>
                    `).join('')}
                    ${!state.inhouseRoles.includes(row.roleType) && row.roleType ? `<option value="${escapeHtml(row.roleType)}" selected>${escapeHtml(row.roleType)}</option>` : ''}
                </select>
            </div>

            <div class="flex items-center gap-3">
                <select class="glass-input text-xs py-1 px-2.5 rounded font-bold inh-status-select" data-inh-id="${row.id}">
                    <option value="Full Day" ${row.attendanceStatus === 'Full Day' ? 'selected' : ''}>Full Day (1.0)</option>
                    <option value="Half Day" ${row.attendanceStatus === 'Half Day' ? 'selected' : ''}>Half Day (0.5)</option>
                    <option value="Absent" ${row.attendanceStatus === 'Absent' ? 'selected' : ''}>Absent (0.0)</option>
                    <option value="Overtime" ${row.attendanceStatus === 'Overtime' ? 'selected' : ''}>Overtime (+OT)</option>
                </select>

                <div class="flex items-center gap-1 text-slate-600">
                    <span class="font-medium">OT:</span>
                    <input type="number" step="0.5" class="glass-input text-xs py-1 px-1.5 rounded w-14 text-center font-mono inh-ot-input" data-inh-id="${row.id}" value="${row.overtimeHours}" placeholder="Hrs">
                </div>

                <!-- Hybrid Wages Input (Point 3) -->
                ${state.wagesModeEnabled ? `
                    <div class="flex items-center gap-1 text-slate-600">
                        <span class="font-medium">Wage:</span>
                        <input type="number" step="any" class="glass-input text-xs py-1 px-1.5 rounded w-20 text-right font-mono inh-wage-input" data-inh-id="${row.id}" value="${row.dailyWage}">
                    </div>
                ` : ''}

                <button type="button" class="text-slate-400 hover:text-rose-600 text-xs ml-2 remove-inh-row-btn p-1" data-inh-id="${row.id}" title="Remove Worker">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');

    bindInhouseRowEvents();
}

function bindInhouseRowEvents() {
    document.querySelectorAll('.inh-name-input').forEach(i => {
        i.addEventListener('change', (e) => {
            const r = state.inhouseRows.find(x => x.id === e.target.dataset.inhId);
            if (r) r.workerName = e.target.value.trim();
        });
    });

    document.querySelectorAll('.inh-role-select').forEach(s => {
        s.addEventListener('change', (e) => {
            const r = state.inhouseRows.find(x => x.id === e.target.dataset.inhId);
            if (r) r.roleType = e.target.value;
        });
    });

    document.querySelectorAll('.inh-status-select').forEach(s => {
        s.addEventListener('change', (e) => {
            const r = state.inhouseRows.find(x => x.id === e.target.dataset.inhId);
            if (r) {
                r.attendanceStatus = e.target.value;
                r.attendanceUnits = e.target.value === 'Full Day' ? 1.0 : (e.target.value === 'Half Day' ? 0.5 : 0.0);
                updateRealtimeKpis();
            }
        });
    });

    document.querySelectorAll('.inh-ot-input').forEach(i => {
        i.addEventListener('change', (e) => {
            const r = state.inhouseRows.find(x => x.id === e.target.dataset.inhId);
            if (r) r.overtimeHours = parseFloat(e.target.value) || 0;
        });
    });

    document.querySelectorAll('.inh-wage-input').forEach(i => {
        i.addEventListener('change', (e) => {
            const r = state.inhouseRows.find(x => x.id === e.target.dataset.inhId);
            if (r) {
                r.dailyWage = parseFloat(e.target.value) || 0;
                updateRealtimeKpis();
            }
        });
    });

    document.querySelectorAll('.remove-inh-row-btn').forEach(b => {
        b.addEventListener('click', (e) => {
            state.inhouseRows = state.inhouseRows.filter(x => x.id !== e.currentTarget.dataset.inhId);
            renderInhouseRows();
            updateRealtimeKpis();
        });
    });
}

async function saveInhouseLogs() {
    if (!state.activeProjectId) {
        showToast('Please select a project first', 'warning');
        return;
    }

    const validRows = state.inhouseRows.filter(r => r.workerName.trim().length > 0);
    if (validRows.length === 0) {
        showToast('Please enter worker names for in-house logs', 'warning');
        return;
    }

    await saveDailyDiary();

    const rowsToInsert = validRows.map(r => {
        const hourlyRate = (r.dailyWage || 450) / 8;
        const totalPayout = state.wagesModeEnabled 
            ? ((r.attendanceUnits * r.dailyWage) + (r.overtimeHours * hourlyRate * 1.5))
            : 0;

        return {
            project_id: state.activeProjectId,
            log_date: state.selectedDate,
            phase: state.activeProject?.name || 'Main Site',
            worker_name: r.workerName,
            role_type: r.roleType,
            attendance_status: r.attendanceStatus,
            attendance_units: r.attendanceUnits,
            overtime_hours: r.overtimeHours,
            daily_wage: state.wagesModeEnabled ? r.dailyWage : 0,
            payout_amount: totalPayout,
            recorded_by_id: state.userId || null,
            recorded_by_name: state.currentUserName
        };
    });

    try {
        const { error } = await supabase
            .from('workforce_inhouse_logs')
            .insert(rowsToInsert);

        if (error) throw error;

        showToast(`Saved in-house attendance for ${rowsToInsert.length} workers!`, 'success');
        await fetchDailyLogs();
    } catch (err) {
        console.error('Error saving inhouse logs:', err.message);
        showToast('Failed to save in-house attendance', 'warning');
    }
}

// ==============================================================================
// 4. SITE WEATHER & DAILY DIARY LOGIC
// ==============================================================================
async function saveDailyDiary() {
    if (!state.activeProjectId) return;
    try {
        await supabase
            .from('workforce_daily_diary')
            .upsert({
                project_id: state.activeProjectId,
                log_date: state.selectedDate,
                weather: state.selectedWeather,
                site_condition: 'Normal Site Operations',
                notes: `Weather: ${state.selectedWeather} | Logged by ${state.currentUserName}`,
                recorded_by_id: state.userId || null,
                recorded_by_name: state.currentUserName
            }, { onConflict: 'project_id,log_date' });
    } catch (err) {
        console.warn('Daily diary write notice:', err.message);
    }
}

// ==============================================================================
// 5. DAILY LOGS: MUSTER FEED & KPI CALCULATIONS
// ==============================================================================
async function fetchDailyLogs() {
    if (!state.activeProjectId) return;

    try {
        const targetDate = state.dailyLogsDate;

        const [diaryRes, laborRes, eqpRes, inhouseRes] = await Promise.all([
            supabase.from('workforce_daily_diary').select('*').eq('project_id', state.activeProjectId).eq('log_date', targetDate).maybeSingle(),
            supabase.from('workforce_labor_logs').select('*').eq('project_id', state.activeProjectId).eq('log_date', targetDate).order('created_at', { ascending: false }),
            supabase.from('workforce_equipment_logs').select('*').eq('project_id', state.activeProjectId).eq('log_date', targetDate).order('created_at', { ascending: false }),
            supabase.from('workforce_inhouse_logs').select('*').eq('project_id', state.activeProjectId).eq('log_date', targetDate).order('created_at', { ascending: false })
        ]);

        state.currentDayDiary = diaryRes.data || null;
        state.dailyLaborLogs = laborRes.data || [];
        state.dailyEquipmentLogs = eqpRes.data || [];
        state.dailyInhouseLogs = inhouseRes.data || [];

        renderDailyDiaryBanner();
        renderDailyLogsTable();
        updateExecutiveKpis();

        const badge = document.getElementById('dailyLogsCountBadge');
        if (badge) {
            badge.textContent = state.dailyLaborLogs.length + state.dailyEquipmentLogs.length + state.dailyInhouseLogs.length;
        }
    } catch (err) {
        console.error('Error fetching daily muster logs:', err.message);
    }
}

function renderDailyDiaryBanner() {
    const banner = document.getElementById('dailyDiaryDisplayBanner');
    const weatherBadge = document.getElementById('diaryWeatherBadge');
    const notesText = document.getElementById('diaryNotesText');
    const recText = document.getElementById('diaryRecordedByText');

    if (!state.currentDayDiary) {
        if (banner) banner.classList.add('hidden');
        return;
    }

    if (banner) banner.classList.remove('hidden');
    if (weatherBadge) weatherBadge.textContent = state.currentDayDiary.weather || '☀️ Sunny';
    if (notesText) notesText.textContent = state.currentDayDiary.notes || 'Normal Operations';
    if (recText) recText.textContent = `Recorded by ${state.currentDayDiary.recorded_by_name || 'Site Supervisor'}`;
}

function renderDailyLogsTable() {
    const tbody = document.getElementById('dailyLogsTableBody');
    if (!tbody) return;

    const filter = state.dailyLogsFilter;
    const search = state.dailyLogsSearch.toLowerCase().trim();
    const projName = state.activeProject?.name || 'Assigned Site';

    let feedItems = [];

    if (filter === 'ALL' || filter === 'LABOR') {
        state.dailyLaborLogs.forEach(l => {
            let breakdownText = '';
            if (l.breakdown && typeof l.breakdown === 'object') {
                breakdownText = Object.entries(l.breakdown)
                    .filter(([_, v]) => Number(v) > 0)
                    .map(([k, v]) => `${k}: ${v}`).join(', ');
            }
            feedItems.push({
                table: 'labor',
                id: l.id,
                logId: l.log_id,
                projectName: projName,
                entity: l.agency_name,
                typeBadge: `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Contractor</span>`,
                speciality: breakdownText || l.labor_type,
                valueText: `${l.total_count} labours`,
                cost: l.estimated_cost || (l.total_count * (l.daily_wage_rate || 550)),
                recordedBy: l.recorded_by_name
            });
        });
    }

    if (filter === 'ALL' || filter === 'EQUIPMENT') {
        state.dailyEquipmentLogs.forEach(e => {
            feedItems.push({
                table: 'equipment',
                id: e.id,
                logId: e.log_id,
                projectName: projName,
                entity: e.equipment_type,
                typeBadge: `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Machinery</span>`,
                speciality: e.purpose_of_use,
                valueText: `${e.hours_used} hrs`,
                cost: e.total_cost || (e.hours_used * (e.hourly_rate || 0)),
                recordedBy: e.recorded_by_name
            });
        });
    }

    if (filter === 'ALL' || filter === 'INHOUSE') {
        state.dailyInhouseLogs.forEach(i => {
            feedItems.push({
                table: 'inhouse',
                id: i.id,
                logId: i.log_id,
                projectName: projName,
                entity: i.worker_name,
                typeBadge: `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">In-House</span>`,
                speciality: `${i.role_type} (${i.attendance_status}${i.overtime_hours > 0 ? ' +' + i.overtime_hours + 'h OT' : ''})`,
                valueText: `${i.attendance_units} Day`,
                cost: i.payout_amount || i.daily_wage,
                recordedBy: i.recorded_by_name
            });
        });
    }

    if (search) {
        feedItems = feedItems.filter(item => 
            item.entity.toLowerCase().includes(search) || 
            item.logId.toLowerCase().includes(search) || 
            item.speciality.toLowerCase().includes(search)
        );
    }

    if (feedItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-10 text-slate-400 text-xs">
                    <i class="fa-solid fa-calendar-xmark text-2xl text-slate-300 mb-2"></i>
                    <div>No workforce or equipment logs found for this date.</div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = feedItems.map(item => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="py-3 px-4 font-mono font-bold text-prayosha-navy flex items-center gap-2">
                <span>${item.logId}</span>
                ${item.typeBadge}
            </td>
            <td class="py-3 px-3 text-slate-700 font-bold truncate max-w-[130px]" title="${escapeHtml(item.projectName)}">${escapeHtml(item.projectName)}</td>
            <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(item.entity)}</td>
            <td class="py-3 px-4 text-slate-600 text-[11px] truncate max-w-xs" title="${escapeHtml(item.speciality)}">${escapeHtml(item.speciality)}</td>
            <td class="py-3 px-3 text-right font-mono font-extrabold text-slate-800">${item.valueText}</td>
            <td class="py-3 px-3 text-right font-mono text-emerald-700 font-bold">
                ${state.wagesModeEnabled ? '₹' + formatNumber(item.cost) : '—'}
            </td>
            <td class="py-3 px-4 text-slate-700 font-medium flex items-center gap-1.5">
                <i class="fa-solid fa-user-shield text-[10px] text-prayosha-navy"></i>
                <span>${escapeHtml(item.recordedBy || 'Jay')}</span>
            </td>
            <td class="py-3 px-3 text-center">
                <button type="button" class="text-slate-400 hover:text-rose-600 text-xs transition delete-log-record-btn p-1" data-table="${item.table}" data-id="${item.id}" title="Delete Record">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.delete-log-record-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tableKey = e.currentTarget.dataset.table;
            const recordId = e.currentTarget.dataset.id;
            if (confirm('Are you sure you want to delete this workforce log entry?')) {
                await deleteLogRecord(tableKey, recordId);
            }
        });
    });
}

async function deleteLogRecord(tableKey, recordId) {
    const tableNameMap = {
        labor: 'workforce_labor_logs',
        equipment: 'workforce_equipment_logs',
        inhouse: 'workforce_inhouse_logs'
    };

    try {
        const { error } = await supabase
            .from(tableNameMap[tableKey])
            .delete()
            .eq('id', recordId);

        if (error) throw error;

        showToast('Log record deleted', 'info');
        await fetchDailyLogs();
    } catch (err) {
        console.error('Error deleting log:', err.message);
        showToast('Failed to delete log entry', 'warning');
    }
}

/**
 * Top KPI Summary Update
 */
function updateExecutiveKpis() {
    let totalContractor = 0;
    let totalInhouse = 0;
    let totalEqpHours = 0;
    let dailyCost = 0;

    state.dailyLaborLogs.forEach(l => {
        totalContractor += Number(l.total_count) || 0;
        dailyCost += Number(l.estimated_cost) || (l.total_count * (l.daily_wage_rate || 550));
    });

    state.dailyInhouseLogs.forEach(i => {
        totalInhouse += Number(i.attendance_units) || 0;
        dailyCost += Number(i.payout_amount) || Number(i.daily_wage) || 0;
    });

    state.dailyEquipmentLogs.forEach(e => {
        totalEqpHours += Number(e.hours_used) || 0;
        dailyCost += Number(e.total_cost) || (e.hours_used * (e.hourly_rate || 0));
    });

    const totalWorkforce = Math.round(totalContractor + totalInhouse);

    document.getElementById('kpiTotalLabourCount').textContent = totalWorkforce;
    document.getElementById('kpiContractorCount').textContent = Math.round(totalContractor);
    document.getElementById('kpiContractorAgenciesCount').textContent = `${state.dailyLaborLogs.length} Active Agencies`;
    document.getElementById('kpiInhouseCount').textContent = Math.round(totalInhouse);
    document.getElementById('kpiEquipmentHours').textContent = totalEqpHours.toFixed(1);
    document.getElementById('kpiEquipmentUnitsCount').textContent = `${state.dailyEquipmentLogs.length} Machines Active`;

    const costDisplay = document.getElementById('kpiDailyCostTotal');
    if (state.wagesModeEnabled) {
        costDisplay.textContent = formatNumber(dailyCost);
    } else {
        costDisplay.textContent = '—';
    }
}

function updateRealtimeKpis() {
    let sumContractor = 0;
    state.agencyRows.forEach(r => sumContractor += (r.totalCount || 0));

    let sumInhouse = 0;
    state.inhouseRows.forEach(r => sumInhouse += (r.attendanceUnits || 0));

    document.getElementById('kpiTotalLabourCount').textContent = Math.round(sumContractor + sumInhouse);
    document.getElementById('kpiContractorCount').textContent = Math.round(sumContractor);
    document.getElementById('kpiInhouseCount').textContent = Math.round(sumInhouse);
}

// ==============================================================================
// 6. GENERATE REPORT: PROJECT FILTER (POINT 4), 7 TIMEFRAMES, CSV & PDF
// ==============================================================================
async function handleGenerateReport() {
    if (!state.activeProjectId) {
        showToast('Please select a project first', 'warning');
        return;
    }

    const reportType = document.getElementById('reportTypeSelect').value;
    const timeframe = document.getElementById('reportTimeframeSelect').value;
    const projectFilter = document.getElementById('reportFilterProject').value;
    const agencyFilter = document.getElementById('reportFilterAgency').value;
    const eqpFilter = document.getElementById('reportFilterEquipment').value;

    const { startStr, endStr } = computeTimeframeRange(timeframe);

    showToast(`Compiling report (${startStr} to ${endStr})...`, 'info');

    try {
        let lbrQuery = supabase.from('workforce_labor_logs').select('*').gte('log_date', startStr).lte('log_date', endStr).order('log_date', { ascending: true });
        let eqpQuery = supabase.from('workforce_equipment_logs').select('*').gte('log_date', startStr).lte('log_date', endStr).order('log_date', { ascending: true });
        let inhQuery = supabase.from('workforce_inhouse_logs').select('*').gte('log_date', startStr).lte('log_date', endStr).order('log_date', { ascending: true });

        // Point 4: Apply Project Filter
        if (projectFilter !== 'ALL') {
            lbrQuery = lbrQuery.eq('project_id', projectFilter);
            eqpQuery = eqpQuery.eq('project_id', projectFilter);
            inhQuery = inhQuery.eq('project_id', projectFilter);
        } else {
            const allowedIds = state.assignedProjects.map(p => p.id);
            lbrQuery = lbrQuery.in('project_id', allowedIds);
            eqpQuery = eqpQuery.in('project_id', allowedIds);
            inhQuery = inhQuery.in('project_id', allowedIds);
        }

        if (agencyFilter !== 'ALL') {
            lbrQuery = lbrQuery.eq('agency_name', agencyFilter);
        }
        if (eqpFilter !== 'ALL') {
            eqpQuery = eqpQuery.eq('equipment_type', eqpFilter);
        }

        const [lbrRes, eqpRes, inhRes] = await Promise.all([lbrQuery, eqpQuery, inhQuery]);

        const lbrLogs = lbrRes.data || [];
        const eqpLogs = eqpRes.data || [];
        const inhLogs = inhRes.data || [];

        if (lbrLogs.length === 0 && eqpLogs.length === 0 && inhLogs.length === 0) {
            showToast('No records match your selected timeframe and project filter', 'warning');
            return;
        }

        const projectLabel = projectFilter === 'ALL' 
            ? 'All Assigned Projects' 
            : (state.assignedProjects.find(p => p.id === projectFilter)?.name || 'Project');

        if (state.reportExportFormat === 'csv') {
            exportWorkforceCsv(reportType, projectLabel, startStr, endStr, lbrLogs, eqpLogs, inhLogs);
        } else {
            exportWorkforcePdf(reportType, projectLabel, startStr, endStr, lbrLogs, eqpLogs, inhLogs);
        }
    } catch (err) {
        console.error('Error generating report:', err.message);
        showToast('Error compiling report data', 'warning');
    }
}

function computeTimeframeRange(timeframe) {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (timeframe) {
        case 'today':
            break;
        case 'weekly':
            start.setDate(today.getDate() - 7);
            break;
        case 'fortnightly':
            start.setDate(today.getDate() - 15);
            break;
        case 'monthly':
            start.setDate(1);
            break;
        case 'quarterly':
            start.setMonth(today.getMonth() - 3);
            break;
        case 'half_yearly':
            start.setMonth(today.getMonth() - 6);
            break;
        case 'yearly':
            start.setFullYear(today.getFullYear() - 1);
            break;
        case 'custom':
            const customStart = document.getElementById('customStartDate').value;
            const customEnd = document.getElementById('customEndDate').value;
            if (customStart && customEnd) {
                return { startStr: customStart, endStr: customEnd };
            }
            break;
    }

    return {
        startStr: start.toISOString().split('T')[0],
        endStr: end.toISOString().split('T')[0]
    };
}

/**
 * CSV Generation
 */
function exportWorkforceCsv(reportType, projectLabel, startStr, endStr, lbrLogs, eqpLogs, inhLogs) {
    let csvRows = [];
    csvRows.push(['Prayosha ERP - Workforce & Equipment Muster Register']);
    csvRows.push([`Project Scope: ${projectLabel}`, `Period: ${startStr} to ${endStr}`]);
    csvRows.push([]);

    csvRows.push(['Log Date', 'Project ID', 'Type', 'Entity / Agency', 'Sub-Trade / Purpose', 'Count / Hours', 'Wage Rate (INR)', 'Est. Cost (INR)', 'Recorded By']);

    lbrLogs.forEach(l => {
        let bText = '';
        if (l.breakdown && typeof l.breakdown === 'object') {
            bText = Object.entries(l.breakdown).map(([k, v]) => `${k}:${v}`).join('; ');
        }
        csvRows.push([
            l.log_date,
            l.project_id,
            'Contractor Labour',
            l.agency_name,
            bText || l.labor_type,
            l.total_count,
            l.daily_wage_rate,
            l.total_count * l.daily_wage_rate,
            l.recorded_by_name
        ]);
    });

    eqpLogs.forEach(e => {
        csvRows.push([
            e.log_date,
            e.project_id,
            'Heavy Equipment',
            e.equipment_type,
            e.purpose_of_use,
            e.hours_used,
            e.hourly_rate,
            e.hours_used * e.hourly_rate,
            e.recorded_by_name
        ]);
    });

    inhLogs.forEach(i => {
        csvRows.push([
            i.log_date,
            i.project_id,
            'In-House Staff',
            i.worker_name,
            `${i.role_type} (${i.attendance_status})`,
            i.attendance_units,
            i.daily_wage,
            i.payout_amount,
            i.recorded_by_name
        ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Prayosha_Workforce_${startStr}_to_${endStr}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();

    showToast('Workforce CSV downloaded successfully!', 'success');
}

/**
 * Printable PDF Muster Register
 */
function exportWorkforcePdf(reportType, projectLabel, startStr, endStr, lbrLogs, eqpLogs, inhLogs) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast('Pop-up blocked. Please allow pop-ups to print PDF.', 'warning');
        return;
    }

    let totalWorkers = 0;
    let totalCost = 0;
    lbrLogs.forEach(l => {
        totalWorkers += Number(l.total_count) || 0;
        totalCost += (l.total_count * (l.daily_wage_rate || 550));
    });
    inhLogs.forEach(i => {
        totalWorkers += Number(i.attendance_units) || 0;
        totalCost += Number(i.payout_amount) || Number(i.daily_wage) || 0;
    });
    eqpLogs.forEach(e => {
        totalCost += (e.hours_used * (e.hourly_rate || 0));
    });

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prayosha ERP - Workforce Register (${startStr} to ${endStr})</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #0F172A; padding: 24px; font-size: 12px; }
                .header { border-bottom: 2px solid #1E3A5F; padding-bottom: 12px; margin-bottom: 20px; }
                .title { font-size: 20px; font-weight: bold; color: #1E3A5F; margin: 0; }
                .subtitle { color: #475569; font-size: 13px; margin-top: 4px; }
                .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
                .summary-card { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 6px; }
                .summary-card b { display: block; font-size: 16px; color: #1E3A5F; margin-top: 4px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                th { background: #1E3A5F; color: #ffffff; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; }
                td { border-bottom: 1px solid #E2E8F0; padding: 8px 10px; }
                tr:nth-child(even) { background: #F8FAFC; }
                .badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
                .badge-lbr { background: #FEF3C7; color: #92400E; }
                .badge-eqp { background: #D1FAE5; color: #065F46; }
                .badge-inh { background: #EEF2FF; color: #3730A3; }
                .signatures { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 40px; padding-top: 20px; text-align: center; font-size: 11px; color: #475569; }
                .sig-line { border-top: 1px solid #94A3B8; width: 80%; margin: 0 auto 6px auto; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1 class="title">PRAYOSHA ERP - WORKFORCE & EQUIPMENT MUSTER ROLL</h1>
                <div class="subtitle">Scope: <b>${escapeHtml(projectLabel)}</b> | Period: <b>${startStr} to ${endStr}</b></div>
            </div>

            <div class="summary-grid">
                <div class="summary-card">Total Workforce Headcount: <b>${Math.round(totalWorkers)} Labours</b></div>
                <div class="summary-card">Total Machinery Logs: <b>${eqpLogs.length} Sessions</b></div>
                <div class="summary-card">Total Evaluated Cost: <b>₹${formatNumber(totalCost)}</b></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Agency / Machine / Staff</th>
                        <th>Trade Breakdown / Purpose</th>
                        <th style="text-align: right;">Count / Hrs</th>
                        <th style="text-align: right;">Cost (INR)</th>
                        <th>Recorded By</th>
                    </tr>
                </thead>
                <tbody>
                    ${lbrLogs.map(l => `
                        <tr>
                            <td>${l.log_date}</td>
                            <td><span class="badge badge-lbr">Contractor</span></td>
                            <td><b>${escapeHtml(l.agency_name)}</b></td>
                            <td>${escapeHtml(l.breakdown ? Object.entries(l.breakdown).map(([k,v]) => `${k}:${v}`).join(', ') : l.labor_type)}</td>
                            <td style="text-align: right; font-weight: bold;">${l.total_count}</td>
                            <td style="text-align: right;">₹${formatNumber(l.total_count * l.daily_wage_rate)}</td>
                            <td>${escapeHtml(l.recorded_by_name)}</td>
                        </tr>
                    `).join('')}

                    ${eqpLogs.map(e => `
                        <tr>
                            <td>${e.log_date}</td>
                            <td><span class="badge badge-eqp">Equipment</span></td>
                            <td><b>${escapeHtml(e.equipment_type)}</b></td>
                            <td>${escapeHtml(e.purpose_of_use)}</td>
                            <td style="text-align: right; font-weight: bold;">${e.hours_used} hrs</td>
                            <td style="text-align: right;">₹${formatNumber(e.hours_used * e.hourly_rate)}</td>
                            <td>${escapeHtml(e.recorded_by_name)}</td>
                        </tr>
                    `).join('')}

                    ${inhLogs.map(i => `
                        <tr>
                            <td>${i.log_date}</td>
                            <td><span class="badge badge-inh">In-House</span></td>
                            <td><b>${escapeHtml(i.worker_name)}</b></td>
                            <td>${escapeHtml(i.role_type)} (${i.attendance_status})</td>
                            <td style="text-align: right; font-weight: bold;">${i.attendance_units}</td>
                            <td style="text-align: right;">₹${formatNumber(i.payout_amount)}</td>
                            <td>${escapeHtml(i.recorded_by_name)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="signatures">
                <div><div class="sig-line"></div>Site Supervisor</div>
                <div><div class="sig-line"></div>Project Manager</div>
                <div><div class="sig-line"></div>Chief Engineer / Trustee</div>
            </div>
            <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
}

// ==============================================================================
// 7. WHATSAPP SITE SUMMARY DISPATCH
// ==============================================================================
function dispatchWhatsAppSummary() {
    const projName = state.activeProject?.name || 'Prayosha Site';
    const date = state.dailyLogsDate;

    let contractorCount = 0;
    let inhouseCount = 0;
    let eqpSummary = [];

    state.dailyLaborLogs.forEach(l => contractorCount += Number(l.total_count) || 0);
    state.dailyInhouseLogs.forEach(i => inhouseCount += Number(i.attendance_units) || 0);
    state.dailyEquipmentLogs.forEach(e => eqpSummary.push(`${e.equipment_type}: ${e.hours_used}h`));

    const totalLabour = Math.round(contractorCount + inhouseCount);

    const message = 
`*🏗️ Prayosha ERP | Daily Workforce & Muster Update*
📅 *Date:* ${date}
📍 *Project:* ${projName}

👷 *Total Workforce Deployment:* ${totalLabour}
• Contractor Labours: ${Math.round(contractorCount)}
• In-House Staff: ${Math.round(inhouseCount)}

🚜 *Machinery Deployed:*
${eqpSummary.length > 0 ? eqpSummary.map(m => '• ' + m).join('\n') : '• No heavy equipment deployed today'}

🌤️ *Site Weather:* ${state.currentDayDiary?.weather || 'Sunny'}
✍️ *Recorded by:* ${state.currentUserName} (Tamper-Proof Audit)`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

// ==============================================================================
// 8. SUPER CORE ENGINE: MANAGEMENT CONTROLS
// ==============================================================================
function openSuperEngineModal() {
    renderSuperEngineLists();
    document.getElementById('superEngineModal').classList.remove('hidden');
}

function closeSuperEngineModal() {
    document.getElementById('superEngineModal').classList.add('hidden');
}

function renderSuperEngineLists() {
    const agencyContainer = document.getElementById('superAgencyListContainer');
    if (agencyContainer) {
        agencyContainer.innerHTML = state.agencyConfigs.map((a, idx) => `
            <div class="bg-white rounded-xl p-3 flex items-center justify-between gap-3 border border-slate-200 shadow-sm">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-mono text-slate-400 font-bold">${idx + 1}</span>
                    <div>
                        <div class="font-bold text-xs text-slate-900">${escapeHtml(a.agency_name)}</div>
                        <div class="text-[10px] text-slate-500">Trade: <span class="text-prayosha-navy font-bold">${escapeHtml(a.trade_type)}</span> • Wage: ₹${a.default_wage_rate}/day</div>
                    </div>
                </div>
                <button type="button" class="text-rose-500 hover:text-rose-700 text-xs delete-agency-config-btn p-1" data-id="${a.id}" title="Deactivate">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `).join('');

        agencyContainer.querySelectorAll('.delete-agency-config-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('Deactivate this agency configuration?')) {
                    await supabase.from('workforce_agency_configs').update({ is_active: false }).eq('id', id);
                    await fetchMasterConfigs();
                    renderSuperEngineLists();
                    renderAgencyRows();
                    showToast('Agency deactivated', 'info');
                }
            });
        });
    }

    const eqpContainer = document.getElementById('superEquipmentListContainer');
    if (eqpContainer) {
        eqpContainer.innerHTML = state.equipmentConfigs.map((e, idx) => `
            <div class="bg-white rounded-xl p-3 flex items-center justify-between gap-3 border border-slate-200 shadow-sm">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-mono text-slate-400 font-bold">${idx + 1}</span>
                    <div>
                        <div class="font-bold text-xs text-slate-900">${escapeHtml(e.equipment_type)}</div>
                        <div class="text-[10px] text-emerald-700 font-mono font-bold">₹${e.default_hourly_rate}/hr</div>
                    </div>
                </div>
                <button type="button" class="text-rose-500 hover:text-rose-700 text-xs delete-eqp-config-btn p-1" data-id="${e.id}" title="Deactivate">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `).join('');

        eqpContainer.querySelectorAll('.delete-eqp-config-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('Deactivate this equipment?')) {
                    await supabase.from('workforce_equipment_configs').update({ is_active: false }).eq('id', id);
                    await fetchMasterConfigs();
                    renderSuperEngineLists();
                    populateEquipmentDropdown();
                    showToast('Equipment deactivated', 'info');
                }
            });
        });
    }
}

async function handleAddNewAgencyConfig() {
    const name = document.getElementById('newAgencyNameInput').value.trim();
    const trade = document.getElementById('newTradeTypeInput').value.trim() || 'Contractor';
    const rate = parseFloat(document.getElementById('newAgencyRateInput').value) || 550.00;

    if (!name) {
        showToast('Please enter an agency name', 'warning');
        return;
    }

    try {
        const { error } = await supabase
            .from('workforce_agency_configs')
            .insert({
                agency_name: name,
                trade_type: trade,
                default_wage_rate: rate,
                is_active: true
            });

        if (error) throw error;

        document.getElementById('newAgencyNameInput').value = '';
        document.getElementById('newTradeTypeInput').value = '';
        showToast(`Agency "${name}" registered!`, 'success');

        await fetchMasterConfigs();
        renderSuperEngineLists();
        renderAgencyRows();
    } catch (err) {
        console.error('Error adding agency config:', err.message);
        showToast('Error registering agency', 'warning');
    }
}

async function handleAddNewEquipmentConfig() {
    const name = document.getElementById('newEquipmentTypeInput').value.trim();
    const rate = parseFloat(document.getElementById('newEquipmentRateInput').value) || 1000.00;

    if (!name) {
        showToast('Please enter equipment name', 'warning');
        return;
    }

    try {
        const { error } = await supabase
            .from('workforce_equipment_configs')
            .insert({
                equipment_type: name,
                default_hourly_rate: rate,
                is_active: true
            });

        if (error) throw error;

        document.getElementById('newEquipmentTypeInput').value = '';
        showToast(`Equipment "${name}" registered!`, 'success');

        await fetchMasterConfigs();
        renderSuperEngineLists();
        populateEquipmentDropdown();
    } catch (err) {
        console.error('Error adding equipment config:', err.message);
        showToast('Error registering equipment', 'warning');
    }
}

// ==============================================================================
// REALTIME NOTIFICATIONS & CHANNEL LISTENER
// ==============================================================================
function setupRealtimeSubscriptions() {
    try {
        supabase
            .channel('workforce-realtime-sync')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'workforce_labor_logs' },
                () => fetchDailyLogs()
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'workforce_equipment_logs' },
                () => fetchDailyLogs()
            )
            .subscribe();
    } catch (err) {
        console.warn('Realtime subscription skipped:', err.message);
    }
}

// ==============================================================================
// EVENT LISTENERS & UI ROUTING
// ==============================================================================
function setupEventListeners() {
    // Point 1: Assigned Project Selector Change
    document.getElementById('assignedProjectSelect')?.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId) {
            state.activeProjectId = selectedId;
            state.activeProject = state.assignedProjects.find(p => p.id === selectedId);
            localStorage.setItem('activeProjectId', selectedId);
            localStorage.setItem('activeProjectName', state.activeProject?.name || '');

            const badgeText = document.getElementById('activeProjectCodeName');
            if (badgeText && state.activeProject) {
                badgeText.textContent = `${state.activeProject.project_code ? '[' + state.activeProject.project_code + '] ' : ''}${state.activeProject.name}`;
            }

            resetAttendanceForms();
            fetchDailyLogs();
            showToast(`Switched active site to: ${state.activeProject?.name}`, 'info');
        }
    });

    // Point 3: Hybrid Wages Toggle Button
    document.getElementById('toggleWagesGlobalBtn')?.addEventListener('click', toggleWagesMode);

    // Module Top Tabs
    const tabs = ['tabLogAttendanceBtn', 'tabDailyLogsBtn', 'tabGenerateReportBtn'];
    tabs.forEach(id => {
        document.getElementById(id)?.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.tab;
            switchModuleTab(target);
        });
    });

    // Record Type Switcher (Labor / Equipment / Inhouse)
    const recordPills = [
        document.getElementById('recordTypeLaborBtn'),
        document.getElementById('recordTypeEquipmentBtn'),
        document.getElementById('recordTypeInhouseBtn')
    ];
    recordPills.forEach(btn => {
        btn?.addEventListener('click', (e) => {
            const type = e.currentTarget.dataset.type;
            switchRecordType(type);
        });
    });

    // Weather Pills
    document.querySelectorAll('.weather-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.weather-pill').forEach(p => {
                p.className = 'weather-pill px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:text-slate-900 transition';
            });
            e.currentTarget.className = 'weather-pill px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 border border-amber-300 text-amber-800 transition';
            state.selectedWeather = e.currentTarget.dataset.weather;
        });
    });

    // Date Picker
    document.getElementById('attendanceDateInput')?.addEventListener('change', (e) => {
        state.selectedDate = e.target.value;
        state.agencyRows.forEach(r => scanYesterdayAttendanceForAgency(r.id, r.agencyName));
    });

    // Bulk & Save Buttons
    document.getElementById('copyAllYesterdayBtn')?.addEventListener('click', copyAllYesterdayDeployments);
    document.getElementById('addAgencyRowBtn')?.addEventListener('click', () => addAgencyRow());
    document.getElementById('saveLaborLogsBtn')?.addEventListener('click', saveLaborLogs);

    // Equipment Listeners & Point 2 Quick Add Equipment
    document.getElementById('quickAddEquipmentBtn')?.addEventListener('click', openQuickAddEquipmentModal);
    document.getElementById('closeQuickEquipmentBtn')?.addEventListener('click', closeQuickAddEquipmentModal);
    document.getElementById('cancelQuickEquipmentBtn')?.addEventListener('click', closeQuickAddEquipmentModal);
    document.getElementById('confirmQuickEquipmentBtn')?.addEventListener('click', handleConfirmQuickAddEquipment);

    document.getElementById('eqpTypeSelect')?.addEventListener('change', (e) => {
        const rate = e.target.selectedOptions[0]?.dataset.rate || 0;
        document.getElementById('eqpHourlyRateInput').value = rate;
        updateEquipmentCostPreview();
    });

    document.getElementById('eqpHoursInput')?.addEventListener('input', updateEquipmentCostPreview);
    document.getElementById('eqpHourlyRateInput')?.addEventListener('input', updateEquipmentCostPreview);
    document.getElementById('saveEquipmentLogBtn')?.addEventListener('click', saveEquipmentLog);

    // In-House Listeners & Point 2 Quick Add Role
    document.getElementById('quickAddInhouseRoleBtn')?.addEventListener('click', openQuickAddRoleModal);
    document.getElementById('closeQuickRoleBtn')?.addEventListener('click', closeQuickAddRoleModal);
    document.getElementById('cancelQuickRoleBtn')?.addEventListener('click', closeQuickAddRoleModal);
    document.getElementById('confirmQuickRoleBtn')?.addEventListener('click', handleConfirmQuickAddRole);

    document.getElementById('addInhouseRowBtn')?.addEventListener('click', () => addInhouseRow());
    document.getElementById('saveInhouseLogsBtn')?.addEventListener('click', saveInhouseLogs);

    // Daily Logs Controls
    document.getElementById('dailyLogsDateFilter')?.addEventListener('change', (e) => {
        state.dailyLogsDate = e.target.value;
        fetchDailyLogs();
    });

    document.getElementById('logsPrevDayBtn')?.addEventListener('click', () => stepDailyLogsDate(-1));
    document.getElementById('logsNextDayBtn')?.addEventListener('click', () => stepDailyLogsDate(1));
    document.getElementById('logsTodayBtn')?.addEventListener('click', () => {
        const today = new Date().toISOString().split('T')[0];
        state.dailyLogsDate = today;
        document.getElementById('dailyLogsDateFilter').value = today;
        fetchDailyLogs();
    });

    document.querySelectorAll('.daily-feed-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.daily-feed-pill').forEach(p => {
                p.className = 'daily-feed-pill px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-600 hover:text-prayosha-navy';
            });
            e.currentTarget.className = 'daily-feed-pill px-3 py-1.5 rounded-lg text-xs font-bold bg-prayosha-navy text-white shadow-sm';
            state.dailyLogsFilter = e.currentTarget.dataset.filter;
            renderDailyLogsTable();
        });
    });

    document.getElementById('dailyLogsSearchInput')?.addEventListener('input', (e) => {
        state.dailyLogsSearch = e.target.value;
        renderDailyLogsTable();
    });

    // WhatsApp Summary Button
    document.getElementById('whatsappSummaryBtn')?.addEventListener('click', dispatchWhatsAppSummary);

    // Report Generation Form Listeners
    document.getElementById('reportTimeframeSelect')?.addEventListener('change', (e) => {
        const customContainer = document.getElementById('customDateRangeContainer');
        if (e.target.value === 'custom') {
            customContainer.classList.remove('hidden');
        } else {
            customContainer.classList.add('hidden');
        }
    });

    const formatCsvBtn = document.getElementById('formatCsvBtn');
    const formatPdfBtn = document.getElementById('formatPdfBtn');

    formatCsvBtn?.addEventListener('click', () => {
        formatCsvBtn.className = 'export-format-btn px-4 py-3 rounded-xl border-2 border-emerald-600 bg-emerald-50 text-emerald-800 font-bold text-xs transition flex items-center justify-center gap-2';
        formatPdfBtn.className = 'export-format-btn px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-prayosha-navy font-semibold text-xs transition flex items-center justify-center gap-2';
        state.reportExportFormat = 'csv';
    });

    formatPdfBtn?.addEventListener('click', () => {
        formatPdfBtn.className = 'export-format-btn px-4 py-3 rounded-xl border-2 border-prayosha-navy bg-slate-100 text-prayosha-navy font-bold text-xs transition flex items-center justify-center gap-2';
        formatCsvBtn.className = 'export-format-btn px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-prayosha-navy font-semibold text-xs transition flex items-center justify-center gap-2';
        state.reportExportFormat = 'pdf';
    });

    document.getElementById('generateDownloadReportBtn')?.addEventListener('click', handleGenerateReport);

    // Super Core Engine Modal Listeners
    document.getElementById('openSuperEngineBtn')?.addEventListener('click', openSuperEngineModal);
    document.getElementById('closeSuperEngineBtn')?.addEventListener('click', closeSuperEngineModal);
    document.getElementById('closeSuperEngineFooterBtn')?.addEventListener('click', closeSuperEngineModal);

    document.getElementById('superTabAgenciesBtn')?.addEventListener('click', () => {
        document.getElementById('superTabAgenciesBtn').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-prayosha-navy text-white transition';
        document.getElementById('superTabEquipmentBtn').className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:text-prayosha-navy transition';
        document.getElementById('superAgencySection').classList.remove('hidden');
        document.getElementById('superEquipmentSection').classList.add('hidden');
    });

    document.getElementById('superTabEquipmentBtn')?.addEventListener('click', () => {
        document.getElementById('superTabEquipmentBtn').className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-prayosha-navy text-white transition';
        document.getElementById('superTabAgenciesBtn').className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:text-prayosha-navy transition';
        document.getElementById('superEquipmentSection').classList.remove('hidden');
        document.getElementById('superAgencySection').classList.add('hidden');
    });

    document.getElementById('addNewAgencyConfigBtn')?.addEventListener('click', handleAddNewAgencyConfig);
    document.getElementById('addNewEquipmentConfigBtn')?.addEventListener('click', handleAddNewEquipmentConfig);
}

function switchModuleTab(tabKey) {
    state.activeTab = tabKey;

    const tabsMap = {
        'log-attendance': { btn: 'tabLogAttendanceBtn', content: 'tabContentLogAttendance' },
        'daily-logs': { btn: 'tabDailyLogsBtn', content: 'tabContentDailyLogs' },
        'generate-report': { btn: 'tabGenerateReportBtn', content: 'tabContentGenerateReport' }
    };

    Object.keys(tabsMap).forEach(key => {
        const item = tabsMap[key];
        const btn = document.getElementById(item.btn);
        const content = document.getElementById(item.content);

        if (key === tabKey) {
            btn.className = 'module-tab-btn flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 bg-prayosha-navy text-white shadow-sm';
            content.classList.remove('hidden');
        } else {
            btn.className = 'module-tab-btn flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 text-slate-600 hover:text-prayosha-navy';
            content.classList.add('hidden');
        }
    });

    if (tabKey === 'daily-logs') {
        fetchDailyLogs();
    }
}

function switchRecordType(typeKey) {
    state.activeRecordType = typeKey;

    const formsMap = {
        labor: { btn: 'recordTypeLaborBtn', form: 'subFormLabor', activeClass: 'border-2 border-prayosha-navy bg-prayosha-navy/5 text-prayosha-navy font-bold' },
        equipment: { btn: 'recordTypeEquipmentBtn', form: 'subFormEquipment', activeClass: 'border-2 border-emerald-600 bg-emerald-50 text-emerald-800 font-bold' },
        inhouse: { btn: 'recordTypeInhouseBtn', form: 'subFormInhouse', activeClass: 'border-2 border-prayosha-indigo bg-indigo-50 text-prayosha-indigo font-bold' }
    };

    Object.keys(formsMap).forEach(k => {
        const item = formsMap[k];
        const btn = document.getElementById(item.btn);
        const form = document.getElementById(item.form);

        if (k === typeKey) {
            btn.className = `record-type-pill px-4 py-3 rounded-xl ${item.activeClass} text-xs transition flex items-center justify-center gap-2 shadow-sm`;
            form.classList.remove('hidden');
        } else {
            btn.className = 'record-type-pill px-4 py-3 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-prayosha-navy font-semibold text-xs transition flex items-center justify-center gap-2';
            form.classList.add('hidden');
        }
    });
}

function updateEquipmentCostPreview() {
    const hours = parseFloat(document.getElementById('eqpHoursInput')?.value) || 0;
    const rate = parseFloat(document.getElementById('eqpHourlyRateInput')?.value) || 0;
    const total = hours * rate;

    const badge = document.getElementById('eqpCostPreviewBadge');
    if (badge) badge.textContent = `Total: ₹${formatNumber(total)}`;
}

function stepDailyLogsDate(days) {
    const d = new Date(state.dailyLogsDate);
    d.setDate(d.getDate() + days);
    const newStr = d.toISOString().split('T')[0];
    state.dailyLogsDate = newStr;
    document.getElementById('dailyLogsDateFilter').value = newStr;
    fetchDailyLogs();
}

// ==============================================================================
// UTILITIES & HELPERS
// ==============================================================================
function formatNumber(num) {
    if (isNaN(num) || num === null) return '0.00';
    return Number(num).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
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

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const borderClass = type === 'success' 
        ? 'border-emerald-600 text-slate-900 bg-white' 
        : (type === 'warning' ? 'border-amber-500 text-slate-900 bg-white' : 'border-prayosha-navy text-slate-900 bg-white');

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border-2 shadow-xl text-xs font-bold ${borderClass} transition-all duration-300 transform translate-y-2 opacity-0`;
    toast.innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full ${type === 'success' ? 'bg-emerald-500' : (type === 'warning' ? 'bg-amber-500' : 'bg-prayosha-navy')}"></span>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3600);
}