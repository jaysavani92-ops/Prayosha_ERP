/**
 * Prayosha ERP - Material Issue Logs Controller
 * File: /inventory/issue-logs.js
 * 
 * Features:
 * 1. Gated Structural Display: Hides records by default until the user explicitly selects
 *    a Tower, Floor, Work Zone, or triggers the "ALL" categorized view.
 * 2. Multi-Tier Categorization Engine ("ALL" Mode):
 *    - Hierarchically groups site material issues by Tower -> Floor -> Category & Task Category.
 * 3. Granular Filter Mode:
 *    - Filters and displays consumption matching selected Tower, Floor, and Work Zone IDs.
 * 4. Zone Pill Rendering:
 *    - Formats granular structural zone codes (e.g. BM-FOY-001, BM-LIFT-001) with responsive tag styling.
 * 5. Project Workspace Scoping:
 *    - Dynamically queries issues scoped to the active project context in localStorage.
 */

import { supabase } from '../config.js';

// Central Supabase Client
const client = supabase || window.supabaseClient;

// DOM Elements - Navigation & Action Controls
const activeProjectBadge = document.getElementById('activeProjectBadge');
const btnViewAll = document.getElementById('btnViewAll');
const refreshBtn = document.getElementById('refreshBtn');

// DOM Elements - Filter Form
const filterTower = document.getElementById('filterTower');
const filterFloor = document.getElementById('filterFloor');
const filterZone = document.getElementById('filterZone');
const btnApplyFilter = document.getElementById('btnApplyFilter');
const btnResetFilter = document.getElementById('btnResetFilter');

// DOM Elements - Gated View & Output Display Containers
const gatedNoticeBanner = document.getElementById('gatedNoticeBanner');
const resultsContainer = document.getElementById('resultsContainer');
const activeFilterPill = document.getElementById('activeFilterPill');
const resultCountPill = document.getElementById('resultCountPill');
const categorizedOutputContainer = document.getElementById('categorizedOutputContainer');

// State Cache
let rawIssueLogs = [];
let currentProjectId = null;
let currentMode = 'gated'; // 'gated' | 'all' | 'filtered'

/**
 * 1. Resolve Active Project Context
 */
async function resolveActiveProjectId() {
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
                console.warn('[IssueLogs] Project resolution warning:', err);
            }
        }
    }

    currentProjectId = projectId;

    if (activeProjectBadge) {
        const displayName = localStorage.getItem('activeProjectName') || 'Active Project';
        const displayCode = localStorage.getItem('activeProjectCode') || '';
        activeProjectBadge.textContent = displayCode ? `[${displayCode}] ${displayName}` : displayName;
    }

    return currentProjectId;
}

/**
 * 2. Fetch Issue Records from Supabase
 */
async function fetchIssueLogs() {
    await resolveActiveProjectId();

    if (!client || !currentProjectId) return [];

    try {
        const { data: issues, error } = await client
            .from('inventory_issues')
            .select(`
                id,
                issue_code,
                qty_issued,
                issued_to_agency,
                issued_by,
                tower_name,
                floor_name,
                zone_ids,
                task_category,
                remarks,
                timestamp,
                inventory_items (
                    item_code,
                    item_name,
                    category,
                    unit
                )
            `)
            .eq('project_id', currentProjectId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        rawIssueLogs = issues || [];
        return rawIssueLogs;

    } catch (err) {
        console.error('[IssueLogs] Fetch error:', err);
        return [];
    }
}

/**
 * 3. Date Formatter Helper (DD/MM/YYYY)
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
 * 4. Helper to Normalize Zones Array / String
 */
function extractZoneList(zoneData) {
    if (!zoneData) return [];
    if (Array.isArray(zoneData)) return zoneData;
    if (typeof zoneData === 'string') {
        return zoneData.split(',').map(z => z.trim()).filter(Boolean);
    }
    return [];
}

/**
 * 5. Render Gated State Banner
 */
function showGatedState() {
    currentMode = 'gated';
    if (gatedNoticeBanner) gatedNoticeBanner.classList.remove('hidden');
    if (resultsContainer) resultsContainer.classList.add('hidden');
}

/**
 * 6. Render Hierarchical Categorized View ("ALL" Mode)
 * Groups by: Tower -> Floor -> Task Category -> Individual Issues
 */
function renderCategorizedAllView(logs) {
    currentMode = 'all';

    if (gatedNoticeBanner) gatedNoticeBanner.classList.add('hidden');
    if (resultsContainer) resultsContainer.classList.remove('hidden');

    if (activeFilterPill) {
        activeFilterPill.textContent = 'Mode: ALL Categorized Tasks (Tower > Floor > Category)';
        activeFilterPill.className = 'text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1 rounded-lg border border-amber-200';
    }

    if (resultCountPill) {
        resultCountPill.textContent = `${logs.length} total issue records`;
    }

    if (!categorizedOutputContainer) return;
    categorizedOutputContainer.innerHTML = '';

    if (logs.length === 0) {
        categorizedOutputContainer.innerHTML = `
            <div class="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-200">
                <div class="text-3xl mb-2">📋</div>
                <h4 class="text-xs font-bold text-slate-600">No Material Issues Logged</h4>
                <p class="text-[11px] text-slate-400 mt-0.5">Use the "Log Transaction > OUTWARD" tab to record site consumption.</p>
            </div>
        `;
        return;
    }

    // Build Nested Tree: Tower -> Floor -> TaskCategory -> Array of Logs
    const tree = {};

    logs.forEach(log => {
        const tower = log.tower_name || 'Unassigned Tower';
        const floor = log.floor_name || 'General Levels';
        const categoryGroup = (log.task_category || 'General Civil') + ' (' + (log.inventory_items?.category || 'Building Construction') + ')';

        if (!tree[tower]) tree[tower] = {};
        if (!tree[tower][floor]) tree[tower][floor] = {};
        if (!tree[tower][floor][categoryGroup]) tree[tower][floor][categoryGroup] = [];

        tree[tower][floor][categoryGroup].push(log);
    });

    // Render Tree Nodes
    Object.keys(tree).sort().forEach(towerName => {
        const towerBlock = document.createElement('div');
        towerBlock.className = 'bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden mb-6';

        let towerHtml = `
            <div class="bg-gradient-to-r from-[#1E3A5F] to-[#2A4D7D] px-5 py-3.5 flex items-center justify-between text-white">
                <div class="flex items-center gap-2">
                    <span class="text-brand-amber font-bold text-base">🏢</span>
                    <h3 class="text-sm font-bold tracking-tight">${towerName}</h3>
                </div>
                <span class="text-[11px] font-semibold bg-white/15 px-2.5 py-0.5 rounded-full border border-white/20">
                    Structure Block
                </span>
            </div>
            <div class="p-4 sm:p-6 space-y-5">
        `;

        const floors = tree[towerName];
        Object.keys(floors).sort().forEach(floorName => {
            towerHtml += `
                <div class="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                    <div class="bg-slate-100/90 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-brand-emerald"></span>
                            <span class="text-xs font-bold text-slate-700">${floorName}</span>
                        </div>
                        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Floor Level</span>
                    </div>
                    <div class="p-3 sm:p-4 space-y-4">
            `;

            const categories = floors[floorName];
            Object.keys(categories).sort().forEach(catTitle => {
                const entries = categories[catTitle];

                towerHtml += `
                    <div class="bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs">
                        <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                            <div class="flex items-center gap-1.5">
                                <span class="text-[11px] font-bold text-brand-navy">${catTitle}</span>
                            </div>
                            <span class="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                ${entries.length} ${entries.length === 1 ? 'Dispatch' : 'Dispatches'}
                            </span>
                        </div>

                        <div class="divide-y divide-slate-100">
                `;

                entries.forEach(item => {
                    const itemName = item.inventory_items?.item_name || 'Material Item';
                    const unit = item.inventory_items?.unit || 'units';
                    const qty = item.qty_issued || 0;
                    const dateFormatted = formatDate(item.timestamp);
                    const agency = item.issued_to_agency || 'Unassigned Agency';
                    const issuer = item.issued_by ? `ISSUED BY: ${item.issued_by}` : '';
                    const zones = extractZoneList(item.zone_ids);

                    const zonePillsHtml = zones.map(z => `
                        <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200/60 font-mono">
                            ${z}
                        </span>
                    `).join(' ');

                    towerHtml += `
                        <div class="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                                <!-- ID & Date -->
                                <div>
                                    <div class="text-xs font-bold text-brand-navy">${item.issue_code || 'ISS-RECORD'}</div>
                                    <div class="text-[11px] text-slate-400 font-medium">${dateFormatted}</div>
                                </div>

                                <!-- Item & Qty -->
                                <div>
                                    <div class="text-xs font-bold text-slate-800">${itemName}</div>
                                    <div class="text-[11px] font-semibold text-emerald-600">Qty: ${qty} ${unit}</div>
                                </div>

                                <!-- Agency & Issuer -->
                                <div>
                                    <div class="text-xs font-bold text-brand-navy">${agency}</div>
                                    <div class="text-[10px] text-slate-400 font-medium uppercase">${issuer}</div>
                                </div>
                            </div>

                            <!-- Assigned Zones -->
                            <div class="md:max-w-xs flex flex-wrap gap-1 items-center">
                                ${zonePillsHtml || '<span class="text-[11px] text-slate-400 italic">No granular zones</span>'}
                            </div>
                        </div>
                    `;
                });

                towerHtml += `
                        </div>
                    </div>
                `;
            });

            towerHtml += `
                    </div>
                </div>
            `;
        });

        towerHtml += `
            </div>
        `;

        towerBlock.innerHTML = towerHtml;
        categorizedOutputContainer.appendChild(towerBlock);
    });
}

/**
 * 7. Render Filtered Table View (Tower/Floor/Zone specific)
 */
function renderFilteredTableView(logs) {
    currentMode = 'filtered';

    if (gatedNoticeBanner) gatedNoticeBanner.classList.add('hidden');
    if (resultsContainer) resultsContainer.classList.remove('hidden');

    const selectedTower = filterTower?.value || 'All Towers';
    const selectedFloor = filterFloor?.value || 'All Floors';
    const zoneQuery = filterZone?.value.trim() || 'All Zones';

    if (activeFilterPill) {
        activeFilterPill.textContent = `Filtered: ${selectedTower} • ${selectedFloor} • ${zoneQuery}`;
        activeFilterPill.className = 'text-xs font-bold text-brand-navy bg-brand-navy/10 px-3 py-1 rounded-lg border border-brand-navy/20';
    }

    if (resultCountPill) {
        resultCountPill.textContent = `${logs.length} matched records`;
    }

    if (!categorizedOutputContainer) return;
    categorizedOutputContainer.innerHTML = '';

    if (logs.length === 0) {
        categorizedOutputContainer.innerHTML = `
            <div class="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-slate-200">
                <div class="text-3xl mb-2">🔍</div>
                <h4 class="text-xs font-bold text-slate-600">No Matching Issue Logs</h4>
                <p class="text-[11px] text-slate-400 mt-0.5">No consumption dispatches match your selected Tower, Floor, or Zone ID criteria.</p>
            </div>
        `;
        return;
    }

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm';

    let tableHtml = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th class="py-3 px-4">Issue ID / Date</th>
                        <th class="py-3 px-4">Item & Quantity</th>
                        <th class="py-3 px-4">Agency & Issuer</th>
                        <th class="py-3 px-4">Structure & Category</th>
                        <th class="py-3 px-4">Assigned Work Zones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 font-medium">
    `;

    logs.forEach(item => {
        const itemName = item.inventory_items?.item_name || 'Material Item';
        const unit = item.inventory_items?.unit || 'units';
        const qty = item.qty_issued || 0;
        const dateFormatted = formatDate(item.timestamp);
        const agency = item.issued_to_agency || 'Unassigned Agency';
        const issuer = item.issued_by ? `ISSUED BY: ${item.issued_by}` : '';
        const tower = item.tower_name || 'General';
        const floor = item.floor_name || 'Level';
        const cat = item.task_category || 'Civil RCC';
        const zones = extractZoneList(item.zone_ids);

        const zonePillsHtml = zones.map(z => `
            <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 font-mono">
                ${z}
            </span>
        `).join(' ');

        tableHtml += `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3.5 px-4">
                    <div class="font-bold text-brand-navy">${item.issue_code || 'ISS-RECORD'}</div>
                    <div class="text-[10px] text-slate-400">${dateFormatted}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="font-bold text-slate-800">${itemName}</div>
                    <div class="text-[11px] font-semibold text-emerald-600">Qty: ${qty} ${unit}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="font-semibold text-brand-navy">${agency}</div>
                    <div class="text-[10px] text-slate-400 uppercase font-medium">${issuer}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="font-semibold text-slate-700">${tower} • ${floor}</div>
                    <div class="text-[10px] text-slate-400">${cat}</div>
                </td>
                <td class="py-3.5 px-4">
                    <div class="flex flex-wrap gap-1 max-w-xs">
                        ${zonePillsHtml || '<span class="text-slate-400 italic">None</span>'}
                    </div>
                </td>
            </tr>
        `;
    });

    tableHtml += `
                </tbody>
            </table>
        </div>
    `;

    tableWrapper.innerHTML = tableHtml;
    categorizedOutputContainer.appendChild(tableWrapper);
}

/**
 * 8. Execute Filter Application
 */
async function applyStructuralFilter() {
    const selectedTower = filterTower?.value || '';
    const selectedFloor = filterFloor?.value || '';
    const zoneQuery = filterZone?.value.trim().toLowerCase() || '';

    // If nothing chosen, return to gated banner
    if (!selectedTower && !selectedFloor && !zoneQuery) {
        alert('Please choose at least one filter criterion (Tower, Floor, or Work Zone) or click "View All Categorized Tasks".');
        showGatedState();
        return;
    }

    if (rawIssueLogs.length === 0) {
        await fetchIssueLogs();
    }

    const filtered = rawIssueLogs.filter(log => {
        const matchesTower = !selectedTower || log.tower_name === selectedTower;
        const matchesFloor = !selectedFloor || log.floor_name === selectedFloor;

        const zones = extractZoneList(log.zone_ids).map(z => z.toLowerCase());
        const matchesZone = !zoneQuery || zones.some(z => z.includes(zoneQuery));

        return matchesTower && matchesFloor && matchesZone;
    });

    renderFilteredTableView(filtered);
}

/**
 * 9. Event Listeners & Lifecycle Setup
 */

// "View All Categorized Tasks" Trigger
if (btnViewAll) {
    btnViewAll.addEventListener('click', async () => {
        if (rawIssueLogs.length === 0) {
            await fetchIssueLogs();
        }
        renderCategorizedAllView(rawIssueLogs);
    });
}

// Apply Filter Button
if (btnApplyFilter) {
    btnApplyFilter.addEventListener('click', () => {
        applyStructuralFilter();
    });
}

// Reset Filter Button
if (btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
        if (filterTower) filterTower.value = '';
        if (filterFloor) filterFloor.value = '';
        if (filterZone) filterZone.value = '';
        showGatedState();
    });
}

// Refresh Button
if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
        await fetchIssueLogs();
        if (currentMode === 'all') {
            renderCategorizedAllView(rawIssueLogs);
        } else if (currentMode === 'filtered') {
            applyStructuralFilter();
        } else {
            showGatedState();
        }
    });
}

// Listen to Global Project Switcher from shell.js
window.addEventListener('projectChanged', async () => {
    rawIssueLogs = [];
    showGatedState();
    await resolveActiveProjectId();
});

// Initial Bootstrap on Page Load
document.addEventListener('DOMContentLoaded', async () => {
    await resolveActiveProjectId();
    showGatedState();
});