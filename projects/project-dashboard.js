import { supabase } from '../config.js';

// ==========================================
// APPLICATION STATE
// ==========================================
let allProjects = [];
let taskStatsByProject = {};
let currentModalProject = null;
let projectToDelete = null;
let activeView = 'grid'; // 'grid' | 'table'

// Role evaluation (Owner / General Manager privileges)
const userRole = localStorage.getItem('userRole') || '';
const isOwnerOrGM = ['Owner', 'General Manager', 'Super Admin'].includes(userRole);

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. RBAC UI Guard for Create Button
    const createBtn = document.getElementById('createProjectBtn');
    if (createBtn && !isOwnerOrGM) {
        createBtn.classList.add('hidden');
    }

    // 2. Fetch project directory & task analytics
    await loadProjectsWithAnalytics();

    // 3. Setup weather & site pour advisory
    initSiteWeatherWidget();

    // 4. Attach Toolbar & Filter Listeners
    setupToolbarListeners();

    // 5. Attach Modals & Dialog Handlers
    setupArchitectureModalHandlers();
    setupHardDeleteModalHandlers();
    setupShareModalHandlers();

    // 6. Global click listener to close open context menus
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-dropdown-btn') && !e.target.closest('.card-dropdown-menu')) {
            document.querySelectorAll('.card-dropdown-menu').forEach(menu => menu.classList.add('hidden'));
        }
    });
});

// ==========================================
// DATA FETCHING & SYNCHRONIZATION
// ==========================================
async function loadProjectsWithAnalytics() {
    const grid = document.getElementById('projectsGrid');
    const tableBody = document.getElementById('projectsTableBody');
    const emptyState = document.getElementById('emptyState');
    const spinner = document.getElementById('refreshSpinner');

    if (spinner) spinner.classList.add('animate-spin');

    try {
        const { data: projectsData, error: projectsError } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (projectsError) throw projectsError;
        allProjects = projectsData || [];

        // Fetch task progress and schedule stats using exact database column names
        try {
            const { data: taskData, error: taskError } = await supabase
                .from('civil_tasks')
                .select('project_id, status, expected_completion_date, completed_date');

            if (!taskError && taskData) {
                taskStatsByProject = {};
                const now = new Date();

                taskData.forEach(task => {
                    if (!task.project_id) return;
                    if (!taskStatsByProject[task.project_id]) {
                        taskStatsByProject[task.project_id] = { total: 0, completed: 0, overdue: 0 };
                    }
                    taskStatsByProject[task.project_id].total += 1;
                    
                    const isDone = (task.status === 'Completed' || task.status === 'Done' || Boolean(task.completed_date));
                    if (isDone) {
                        taskStatsByProject[task.project_id].completed += 1;
                    } else if (task.expected_completion_date) {
                        const dueDate = new Date(task.expected_completion_date);
                        if (dueDate < now) {
                            taskStatsByProject[task.project_id].overdue += 1;
                        }
                    }
                });
            }
        } catch (taskErr) {
            console.warn('Task analytics unavailable, proceeding with basic stats:', taskErr);
        }

        // Calculate Executive Portfolio KPIs
        calculatePortfolioKPIs();

        // Render project directory
        filterAndRenderProjects();

    } catch (error) {
        console.error('Error loading projects:', error);
        if (grid) {
            grid.innerHTML = `
                <div class="col-span-full glass-card p-8 rounded-2xl text-center text-red-600">
                    <p class="font-bold">Failed to load projects from Supabase database.</p>
                    <p class="text-xs text-gray-500 mt-1">${error.message}</p>
                </div>
            `;
        }
        if (tableBody) tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.add('hidden');
    } finally {
        if (spinner) spinner.classList.remove('animate-spin');
    }
}

// ==========================================
// EXECUTIVE PORTFOLIO KPI ENGINE
// ==========================================
function calculatePortfolioKPIs() {
    const activeProjects = allProjects.filter(p => !p.is_archived && p.status !== 'Archived');

    // 1. Total Portfolio Value (Sum of estimated budgets)
    const totalBudget = activeProjects.reduce((sum, p) => sum + (Number(p.estimated_budget) || 0), 0);
    const kpiValEl = document.getElementById('kpiPortfolioValue');
    if (kpiValEl) {
        if (totalBudget >= 10000000) {
            kpiValEl.textContent = `₹${(totalBudget / 10000000).toFixed(2)} Cr`;
        } else if (totalBudget >= 100000) {
            kpiValEl.textContent = `₹${(totalBudget / 100000).toFixed(2)} Lakh`;
        } else {
            kpiValEl.textContent = `₹${totalBudget.toLocaleString('en-IN')}`;
        }
    }

    // 2. Total Sq.Ft Footprint
    const totalSqft = activeProjects.reduce((sum, p) => sum + (Number(p.total_sqft) || 0), 0);
    const kpiSqftEl = document.getElementById('kpiTotalSqft');
    if (kpiSqftEl) {
        kpiSqftEl.textContent = `${totalSqft.toLocaleString('en-IN')} Sq.Ft`;
    }

    // 3. Active Sites Count & Breakdown
    const ongoingCount = activeProjects.filter(p => p.status === 'On Going').length;
    const planningCount = activeProjects.filter(p => p.status === 'Planning' || p.status === 'Planning Completed, But Construction Not Started').length;
    const kpiSitesEl = document.getElementById('kpiActiveSitesCount');
    const kpiSitesBreakdownEl = document.getElementById('kpiSitesBreakdown');
    if (kpiSitesEl) kpiSitesEl.textContent = `${activeProjects.length} Sites`;
    if (kpiSitesBreakdownEl) kpiSitesBreakdownEl.textContent = `${ongoingCount} Ongoing • ${planningCount} Planning`;

    // 4. Schedule Health / Attention Required
    let overdueTaskCount = 0;
    activeProjects.forEach(p => {
        if (taskStatsByProject[p.id]) {
            overdueTaskCount += taskStatsByProject[p.id].overdue;
        }
    });

    const kpiAlertsEl = document.getElementById('kpiScheduleAlerts');
    const kpiAlertsSubEl = document.getElementById('kpiAlertsSubtitle');
    if (kpiAlertsEl) {
        kpiAlertsEl.textContent = `${overdueTaskCount} Alerts`;
        kpiAlertsEl.className = overdueTaskCount > 0 
            ? 'text-xl sm:text-2xl font-bold text-rose-600 mt-2' 
            : 'text-xl sm:text-2xl font-bold text-emerald-600 mt-2';
    }
    if (kpiAlertsSubEl) {
        kpiAlertsSubEl.textContent = overdueTaskCount > 0 
            ? `${overdueTaskCount} critical task(s) past schedule` 
            : 'All site milestones running on schedule';
    }

    // Update Header Badge
    const countBadge = document.getElementById('activeProjectCountBadge');
    if (countBadge) countBadge.textContent = `${activeProjects.length} Active Sites`;
}

// ==========================================
// FILTERING, SORTING & RENDERING
// ==========================================
function filterAndRenderProjects() {
    const grid = document.getElementById('projectsGrid');
    const tableContainer = document.getElementById('projectsTableContainer');
    const tableBody = document.getElementById('projectsTableBody');
    const emptyState = document.getElementById('emptyState');

    const searchTerm = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
    const selectedStatus = document.getElementById('statusFilter')?.value || 'ACTIVE_ALL';
    const sortBy = document.getElementById('sortBy')?.value || 'newest';

    // 1. Filter
    let filtered = allProjects.filter(project => {
        const isArchived = Boolean(project.is_archived || project.status === 'Archived');

        if (selectedStatus === 'ACTIVE_ALL' && isArchived) return false;
        if (selectedStatus === 'Archived' && !isArchived) return false;
        if (selectedStatus !== 'ALL' && selectedStatus !== 'ACTIVE_ALL' && selectedStatus !== 'Archived') {
            if (project.status !== selectedStatus) return false;
        }

        const matchesSearch = 
            (project.project_name && project.project_name.toLowerCase().includes(searchTerm)) ||
            (project.project_code && project.project_code.toLowerCase().includes(searchTerm)) ||
            (project.project_address && project.project_address.toLowerCase().includes(searchTerm));

        return matchesSearch;
    });

    // 2. Sort
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'budget_desc':
                return (Number(b.estimated_budget) || 0) - (Number(a.estimated_budget) || 0);
            case 'budget_asc':
                return (Number(a.estimated_budget) || 0) - (Number(b.estimated_budget) || 0);
            case 'sqft_desc':
                return (Number(b.total_sqft) || 0) - (Number(a.total_sqft) || 0);
            case 'progress_desc': {
                const progA = getProjectProgress(a);
                const progB = getProjectProgress(b);
                return progB - progA;
            }
            case 'name_asc':
                return (a.project_name || '').localeCompare(b.project_name || '');
            case 'newest':
            default:
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        }
    });

    if (filtered.length === 0) {
        if (grid) grid.innerHTML = '';
        if (tableBody) tableBody.innerHTML = '';
        if (tableContainer) tableContainer.classList.add('hidden');
        if (grid) grid.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    if (activeView === 'grid') {
        if (tableContainer) tableContainer.classList.add('hidden');
        if (grid) {
            grid.classList.remove('hidden');
            renderGridView(filtered, grid);
        }
    } else {
        if (grid) grid.classList.add('hidden');
        if (tableContainer) {
            tableContainer.classList.remove('hidden');
            renderTableView(filtered, tableBody);
        }
    }

    attachCardActionHandlers();
}

// ------------------------------------------
// RENDER GRID VIEW
// ------------------------------------------
function renderGridView(projects, container) {
    const activeWorkspaceId = localStorage.getItem('activeProjectId');

    container.innerHTML = projects.map(project => {
        const progress = getProjectProgress(project);
        const scheduleHealth = getScheduleHealth(project);
        const isCurrentWorkspace = (activeWorkspaceId === project.id);
        const statusBadge = getStatusBadge(project.status, project.is_archived);
        const budgetFormatted = Number(project.estimated_budget || 0).toLocaleString('en-IN');
        const sqftFormatted = Number(project.total_sqft || 0).toLocaleString('en-IN');
        const isArchived = Boolean(project.is_archived || project.status === 'Archived');

        const mapAction = project.map_link ? `
            <a href="${project.map_link}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 truncate group" title="Open Google Maps Directions">
                <svg class="w-3.5 h-3.5 shrink-0 text-red-500 group-hover:scale-110 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <span class="truncate">${project.project_address || 'View on Google Maps'}</span>
            </a>
        ` : `
            <p class="text-xs text-gray-500 flex items-center gap-1 mt-1 truncate">
                <svg class="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                <span class="truncate">${project.project_address || 'Location Not Specified'}</span>
            </p>
        `;

        const photoBanner = project.project_photo_url ? `
            <div class="h-36 w-full rounded-xl overflow-hidden relative mb-4 bg-slate-100">
                <img src="${project.project_photo_url}" alt="${project.project_name}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent"></div>
                <div class="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-black/60 text-white tracking-wider font-mono">${project.project_code}</span>
                    <div class="flex items-center gap-1.5">
                        ${scheduleHealth.badge}
                        ${statusBadge}
                    </div>
                </div>
            </div>
        ` : `
            <div class="h-28 w-full rounded-xl bg-gradient-to-r from-slate-800 to-[#1E3A5F] flex flex-col justify-between p-3 mb-4 shadow-inner text-white">
                <div class="flex justify-between items-start">
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-white/20 text-white tracking-wider font-mono">${project.project_code}</span>
                    <div class="flex items-center gap-1.5">
                        ${scheduleHealth.badge}
                        ${statusBadge}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <svg class="w-6 h-6 text-amber-400 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    <span class="text-xs font-semibold text-slate-200 uppercase tracking-wider">${project.project_type || 'Civil Construction'}</span>
                </div>
            </div>
        `;

        return `
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between border ${isCurrentWorkspace ? 'ring-2 ring-amber-400 border-amber-300' : 'border-white/60'} hover:shadow-xl transition-all duration-300 relative group/card">
                
                <!-- Card Top Menu (⋮ Context Actions) -->
                <div class="absolute top-4 right-4 z-10">
                    <button type="button" class="card-dropdown-btn w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-600 flex items-center justify-center shadow-xs border border-slate-200 hover:border-slate-300 transition" data-id="${project.id}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg>
                    </button>

                    <!-- Dropdown Options Menu -->
                    <div id="dropdown-${project.id}" class="card-dropdown-menu hidden absolute right-0 mt-2 w-52 rounded-2xl bg-white shadow-xl border border-slate-200 py-2 z-20 text-xs">
                        <button type="button" class="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 action-share-whatsapp" data-id="${project.id}">
                            <span>📱</span> WhatsApp Status
                        </button>
                        <a href="../site-map/site-map.html" class="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 action-open-sitemap" data-id="${project.id}">
                            <span>🗺️</span> Interactive Site Map
                        </a>
                        <button type="button" class="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 action-inspect-modal" data-id="${project.id}">
                            <span>🔍</span> Inspect Architecture
                        </button>

                        ${isOwnerOrGM ? `
                            <div class="border-t border-slate-100 my-1"></div>
                            <!-- Full Project Re-configuration & Deep Edit Redirection -->
                            <a href="create-project.html?id=${project.id}" class="w-full text-left px-4 py-2 hover:bg-amber-50 flex items-center gap-2 text-amber-900 font-semibold transition">
                                <span>✏️</span> Edit Project (Full Form)
                            </a>
                            <button type="button" class="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700 action-toggle-archive" data-id="${project.id}">
                                <span>📦</span> ${isArchived ? 'Restore / Unarchive' : 'Archive Project'}
                            </button>
                            <div class="border-t border-slate-100 my-1"></div>
                            <button type="button" class="w-full text-left px-4 py-2 hover:bg-rose-50 flex items-center gap-2 text-rose-600 font-bold action-hard-delete" data-id="${project.id}">
                                <span>🗑️</span> Delete Permanently
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div>
                    ${photoBanner}

                    <div class="mb-2 pr-8">
                        <div class="flex items-center justify-between">
                            <h3 class="text-base sm:text-lg font-bold prayosha-navy truncate" title="${project.project_name}">
                                ${project.project_name}
                            </h3>
                            ${isCurrentWorkspace ? '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">Active</span>' : ''}
                        </div>
                        ${mapAction}
                    </div>

                    <!-- Metrics Grid -->
                    <div class="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Total Area</span>
                            <span class="font-bold text-slate-700">${sqftFormatted} Sq.Ft</span>
                        </div>
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Est. Budget</span>
                            <span class="font-bold text-emerald-700">₹${budgetFormatted}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Type</span>
                            <span class="font-medium text-slate-600 truncate block">${project.project_type || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Contract</span>
                            <span class="font-medium text-slate-600 truncate block">${project.contract_type || 'N/A'}</span>
                        </div>
                    </div>

                    <!-- Physical Execution Progress Gauge -->
                    <div class="mb-4">
                        <div class="flex justify-between items-center text-xs mb-1">
                            <span class="font-medium text-gray-500">Physical Execution</span>
                            <span class="font-bold text-slate-800">${progress}%</span>
                        </div>
                        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div class="bg-amber-400 h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                        </div>
                    </div>
                </div>

                <!-- Bottom Button Actions -->
                <div>
                    <div class="pt-3 border-t border-slate-100 flex items-center gap-2">
                        <button type="button" class="btn-inspect flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center justify-center gap-1.5" data-id="${project.id}">
                            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                            Inspect
                        </button>

                        <button type="button" class="btn-activate flex-1 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ${
                            isCurrentWorkspace 
                                ? 'bg-emerald-600 text-white cursor-default' 
                                : 'bg-prayosha-navy text-white hover:bg-opacity-90'
                        }" data-id="${project.id}">
                            ${isCurrentWorkspace 
                                ? '<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Active' 
                                : '<svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Work On Project'
                            }
                        </button>
                    </div>

                    ${isCurrentWorkspace ? `
                        <div class="mt-2 pt-2 border-t border-slate-100 grid grid-cols-3 gap-1.5">
                            <a href="../tasks/active-tasks.html" class="py-1.5 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold text-center flex items-center justify-center gap-1 transition">
                                <span>🏗️ Tasks</span>
                            </a>
                            <a href="../site-map/site-map.html" class="py-1.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#1E3A5F] text-[11px] font-bold text-center flex items-center justify-center gap-1 transition border border-amber-300 shadow-xs">
                                <span>🗺️ Site Map</span>
                            </a>
                            <a href="../inventory/stock-overview.html" class="py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold text-center flex items-center justify-center gap-1 transition">
                                <span>📦 Stock</span>
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ------------------------------------------
// RENDER EXECUTIVE TABLE VIEW
// ------------------------------------------
function renderTableView(projects, tbody) {
    const activeWorkspaceId = localStorage.getItem('activeProjectId');

    tbody.innerHTML = projects.map(project => {
        const progress = getProjectProgress(project);
        const scheduleHealth = getScheduleHealth(project);
        const isCurrentWorkspace = (activeWorkspaceId === project.id);
        const statusBadge = getStatusBadge(project.status, project.is_archived);
        const budgetFormatted = Number(project.estimated_budget || 0).toLocaleString('en-IN');
        const sqftFormatted = Number(project.total_sqft || 0).toLocaleString('en-IN');

        return `
            <tr class="hover:bg-slate-50/80 transition ${isCurrentWorkspace ? 'bg-amber-50/50' : ''}">
                <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">${project.project_code}</span>
                        <div>
                            <span class="font-bold text-slate-900 block truncate max-w-xs">${project.project_name}</span>
                            <span class="text-[11px] text-gray-500 truncate block max-w-xs">${project.project_address || 'Gujarat'}</span>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        ${statusBadge}
                        ${scheduleHealth.badge}
                    </div>
                </td>
                <td class="py-3 px-4 font-semibold text-slate-700">
                    ${sqftFormatted} Sq.Ft
                </td>
                <td class="py-3 px-4 font-bold text-emerald-700">
                    ₹${budgetFormatted}
                </td>
                <td class="py-3 px-4">
                    <div class="w-32">
                        <div class="flex justify-between text-[10px] font-semibold mb-1">
                            <span>${progress}%</span>
                        </div>
                        <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div class="bg-amber-400 h-1.5 rounded-full" style="width: ${progress}%"></div>
                        </div>
                    </div>
                </td>
                <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button type="button" class="btn-activate px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            isCurrentWorkspace ? 'bg-emerald-600 text-white' : 'bg-prayosha-navy text-white hover:bg-opacity-90'
                        }" data-id="${project.id}">
                            ${isCurrentWorkspace ? 'Active' : 'Work'}
                        </button>
                        <button type="button" class="btn-inspect p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700" title="Inspect Architecture" data-id="${project.id}">
                            🔍
                        </button>
                        <button type="button" class="action-share-whatsapp p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700" title="Share WhatsApp Update" data-id="${project.id}">
                            📱
                        </button>
                        ${isOwnerOrGM ? `
                            <a href="create-project.html?id=${project.id}" class="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 transition" title="Deep Edit Project in Full Form">
                                ✏️
                            </a>
                            <button type="button" class="action-hard-delete p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700" title="Delete Permanently" data-id="${project.id}">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// ACTION LISTENERS (DROPDOWN, WORKSPACE, MODALS)
// ==========================================
function attachCardActionHandlers() {
    // 1. Context Menu Toggle Button
    document.querySelectorAll('.card-dropdown-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = btn.getAttribute('data-id');
            const dropdown = document.getElementById(`dropdown-${projectId}`);

            // Close all other open menus
            document.querySelectorAll('.card-dropdown-menu').forEach(menu => {
                if (menu !== dropdown) menu.classList.add('hidden');
            });

            if (dropdown) dropdown.classList.toggle('hidden');
        });
    });

    // 2. Activate Workspace Project Button
    document.querySelectorAll('.btn-activate').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            activateWorkspaceProject(projectId);
        });
    });

    // 3. Inspect Zones Modal
    document.querySelectorAll('.btn-inspect, .action-inspect-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            openArchitectureModal(projectId);
        });
    });

    // 4. WhatsApp Share Action
    document.querySelectorAll('.action-share-whatsapp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            openShareModal(projectId);
        });
    });

    // 5. Open Site Map Action
    document.querySelectorAll('.action-open-sitemap').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            activateWorkspaceProject(projectId);
        });
    });

    // 6. RBAC Soft Archive Toggle Action
    document.querySelectorAll('.action-toggle-archive').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            await toggleProjectArchive(projectId);
        });
    });

    // 7. RBAC Hard Delete Action
    document.querySelectorAll('.action-hard-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            openHardDeleteModal(projectId);
        });
    });
}

// ==========================================
// WORKSPACE ACTIVATION ENGINE
// ==========================================
function activateWorkspaceProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    localStorage.setItem('activeProjectId', project.id);
    localStorage.setItem('activeProjectCode', project.project_code);
    localStorage.setItem('activeProjectName', project.project_name);

    filterAndRenderProjects();
    showToast(`Active workspace switched to "${project.project_name}"`, 'success');

    // Notify universal shell top navbar dropdown and dashboard launchpad
    window.dispatchEvent(new CustomEvent('prayosha:project-switched', { detail: project }));
    window.dispatchEvent(new CustomEvent('projectChanged', { 
        detail: { projectId: project.id, projectName: project.project_name } 
    }));
}

// ==========================================
// TWO-TIER DELETE & ARCHIVE PROTOCOL
// ==========================================
async function toggleProjectArchive(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    const willArchive = !Boolean(project.is_archived || project.status === 'Archived');
    const newStatus = willArchive ? 'Archived' : 'Planning';

    try {
        const { error } = await supabase
            .from('projects')
            .update({ 
                is_archived: willArchive,
                status: newStatus 
            })
            .eq('id', projectId);

        if (error) throw error;

        // If currently active workspace is being archived, clear workspace
        if (willArchive && localStorage.getItem('activeProjectId') === projectId) {
            localStorage.removeItem('activeProjectId');
            localStorage.removeItem('activeProjectCode');
            localStorage.setItem('activeProjectName', 'Select Site Project');
            window.dispatchEvent(new CustomEvent('projectChanged', { detail: {} }));
        }

        showToast(willArchive ? `Project "${project.project_name}" archived` : `Project restored to active directory`, 'success');
        await loadProjectsWithAnalytics();

    } catch (err) {
        console.error('Archive toggle failed:', err);
        showToast(`Failed to archive project: ${err.message}`, 'error');
    }
}

async function openHardDeleteModal(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    projectToDelete = project;
    const modal = document.getElementById('hardDeleteModal');
    const targetName = document.getElementById('deleteProjectTargetName');
    const promptText = document.getElementById('deleteRequiredPrompt');
    const input = document.getElementById('deleteConfirmInput');
    const confirmBtn = document.getElementById('confirmHardDeleteBtn');
    const dependencyEl = document.getElementById('deleteDependencySummary');

    targetName.textContent = `[${project.project_code}] ${project.project_name}`;
    promptText.textContent = `DELETE ${project.project_code}`;
    input.value = '';
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');

    dependencyEl.innerHTML = 'Verifying linked operational records (zones, civil tasks)...';
    modal.classList.remove('hidden');

    // Query dependent records count
    try {
        const [zonesRes, tasksRes] = await Promise.all([
            supabase.from('project_zones').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
            supabase.from('civil_tasks').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
        ]);

        const zoneCount = zonesRes.count || 0;
        const taskCount = tasksRes.count || 0;

        dependencyEl.innerHTML = `
            <strong>Database Audit:</strong> Found <b>${zoneCount}</b> architectural zones and <b>${taskCount}</b> civil tasks linked to this site. Permanent deletion will remove these linkages.
        `;
    } catch (e) {
        dependencyEl.innerHTML = 'Warning: Could not verify child linkages. Proceed with caution.';
    }
}

function setupHardDeleteModalHandlers() {
    const modal = document.getElementById('hardDeleteModal');
    const cancelBtn = document.getElementById('cancelHardDeleteBtn');
    const confirmBtn = document.getElementById('confirmHardDeleteBtn');
    const input = document.getElementById('deleteConfirmInput');

    const closeModal = () => {
        modal.classList.add('hidden');
        projectToDelete = null;
    };

    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (input) {
        input.addEventListener('input', () => {
            if (!projectToDelete) return;
            const required = `DELETE ${projectToDelete.project_code}`.trim().toUpperCase();
            const current = input.value.trim().toUpperCase();

            if (current === required) {
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                confirmBtn.disabled = true;
                confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!projectToDelete) return;

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Purging Database...';

            try {
                // Delete child relationships in Supabase
                await supabase.from('project_zones').delete().eq('project_id', projectToDelete.id);
                await supabase.from('civil_tasks').delete().eq('project_id', projectToDelete.id);

                // Delete primary project entry
                const { error } = await supabase
                    .from('projects')
                    .delete()
                    .eq('id', projectToDelete.id);

                if (error) throw error;

                // If currently active workspace is purged, clear active workspace state
                if (localStorage.getItem('activeProjectId') === projectToDelete.id) {
                    localStorage.removeItem('activeProjectId');
                    localStorage.removeItem('activeProjectCode');
                    localStorage.setItem('activeProjectName', 'Select Site Project');
                    window.dispatchEvent(new CustomEvent('projectChanged', { detail: {} }));
                }

                showToast(`Project [${projectToDelete.project_code}] permanently purged`, 'success');
                closeModal();
                await loadProjectsWithAnalytics();

            } catch (err) {
                console.error('Destructive delete failed:', err);
                showToast(`Permanent deletion failed: ${err.message}`, 'error');
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = 'Wipe Project Permanently';
            }
        });
    }
}

// ==========================================
// WHATSAPP SITE SNAPSHOT DISPATCH
// ==========================================
function openShareModal(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    const progress = getProjectProgress(project);
    const health = getScheduleHealth(project);
    const modal = document.getElementById('shareSummaryModal');
    const previewEl = document.getElementById('shareSummaryPreview');
    const dispatchBtn = document.getElementById('dispatchWhatsAppBtn');

    const formattedBudget = Number(project.estimated_budget || 0).toLocaleString('en-IN');
    const formattedSqft = Number(project.total_sqft || 0).toLocaleString('en-IN');
    const targetDateFormatted = project.target_date 
        ? new Date(project.target_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) 
        : 'Not Set';

    const message = 
`🏗️ *PRAYOSHA ERP - SITE PROGRESS UPDATE*
-----------------------------------------
*Site:* ${project.project_name} [${project.project_code}]
*Location:* ${project.project_address || 'Gujarat'}
*Status:* ${project.status} (${health.label})
*Execution Progress:* ${progress}%
*Total Area:* ${formattedSqft} Sq.Ft
*Estimated Budget:* ₹${formattedBudget}
*Target Handover:* ${targetDateFormatted}
-----------------------------------------
_Report generated by Prayosha ERP Portal on ${new Date().toLocaleDateString('en-IN')}._`;

    previewEl.value = message;
    dispatchBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    modal.classList.remove('hidden');
}

function setupShareModalHandlers() {
    const modal = document.getElementById('shareSummaryModal');
    const closeBtn = document.getElementById('closeShareModalBtn');
    const copyBtn = document.getElementById('copyShareSummaryBtn');
    const previewEl = document.getElementById('shareSummaryPreview');

    const closeModal = () => modal.classList.add('hidden');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(previewEl.value);
                showToast('Site status snapshot copied to clipboard', 'success');
            } catch (e) {
                previewEl.select();
                document.execCommand('copy');
                showToast('Snapshot copied to clipboard', 'success');
            }
        });
    }
}

// ==========================================
// ARCHITECTURE INSPECTOR MODAL
// ==========================================
async function openArchitectureModal(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    currentModalProject = project;

    const modal = document.getElementById('architectureModal');
    const codeEl = document.getElementById('modalProjectCode');
    const nameEl = document.getElementById('modalProjectName');
    const metaEl = document.getElementById('modalProjectMeta');
    const contentEl = document.getElementById('modalZonesContent');

    codeEl.textContent = project.project_code;
    nameEl.textContent = project.project_name;
    metaEl.textContent = `${project.project_type || 'Project'} • ${project.project_address || 'Gujarat'} • Est. Budget: ₹${Number(project.estimated_budget || 0).toLocaleString('en-IN')}`;

    contentEl.innerHTML = `
        <div class="py-12 text-center text-gray-500 flex flex-col items-center justify-center gap-2 animate-pulse">
            <svg class="w-8 h-8 text-amber-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <p class="text-sm font-medium">Loading architectural zones and unit configurations...</p>
        </div>
    `;

    modal.classList.remove('hidden');

    try {
        const { data: zones, error } = await supabase
            .from('project_zones')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        let headerActionsHtml = `
            <div class="mb-4 p-3 rounded-xl bg-gradient-to-r from-[#1E3A5F] to-slate-800 text-white flex items-center justify-between shadow-sm">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-lg bg-amber-400 text-slate-900 flex items-center justify-center font-bold text-sm shadow-xs">
                        🗺️
                    </div>
                    <div>
                        <h5 class="text-xs font-bold leading-tight">Interactive Site Map & Blueprints</h5>
                        <p class="text-[11px] text-slate-300 leading-tight">View 2D CAD drawings, 3D spatial renders, and zone pins</p>
                    </div>
                </div>
                <button type="button" id="btnModalGoToSiteMap" class="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold transition flex items-center gap-1.5 shadow-sm active:scale-95">
                    <span>Open Site Map</span>
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </button>
            </div>
        `;

        if (!zones || zones.length === 0) {
            contentEl.innerHTML = `
                ${headerActionsHtml}
                <div class="p-8 text-center text-gray-500 bg-slate-50 rounded-2xl border border-dashed border-gray-300">
                    <p class="font-semibold text-gray-700">No architecture or zones recorded yet.</p>
                    <p class="text-xs text-gray-400 mt-1">This project does not have tower or facility records saved.</p>
                </div>
            `;
            wireModalSiteMapButton(project);
            return;
        }

        const structuresMap = {};
        zones.forEach(zone => {
            const structure = zone.tower_name || 'Common Area';
            if (!structuresMap[structure]) structuresMap[structure] = [];
            structuresMap[structure].push(zone);
        });

        let html = headerActionsHtml;
        Object.keys(structuresMap).forEach(structureName => {
            const structureZones = structuresMap[structureName];
            const isCommon = structureZones.some(z => z.zone_type === 'Common Zone' || z.zone_type === 'Common');

            if (isCommon) {
                html += `
                    <div class="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 mb-4">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                            <h4 class="font-bold text-base text-emerald-950">${structureName}</h4>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            ${structureZones.map(z => `
                                <div class="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm flex justify-between items-center text-xs">
                                    <div>
                                        <p class="font-bold text-slate-800">${z.floor_name || z.zone_name || 'Ground'}</p>
                                        <p class="text-gray-500 text-[11px]">${z.amenity || 'N.A.'}</p>
                                    </div>
                                    <div class="text-right">
                                        <span class="font-bold text-emerald-700 text-sm">${z.unit_configuration?.total_area || 0}</span>
                                        <span class="text-[10px] text-gray-400 block uppercase">Sq.Ft</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-4">
                        <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                            <h4 class="font-bold text-base prayosha-navy">${structureName}</h4>
                            <span class="text-xs text-gray-500 font-semibold">${structureZones.length} Level(s) Configured</span>
                        </div>
                        <div class="space-y-3">
                            ${structureZones.map(z => {
                                const config = z.unit_configuration || {};
                                const hasFlats = (z.total_flats > 0);
                                const hasShops = (z.total_shops > 0);
                                const hasAmenities = z.amenity && z.amenity !== 'N.A.';
                                const hasRooms = config.rooms && Object.keys(config.rooms).length > 0;

                                return `
                                    <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
                                        <div class="flex flex-wrap justify-between items-center gap-2 mb-2">
                                            <span class="font-bold text-slate-800 text-sm">${z.floor_name}</span>
                                            <div class="flex items-center gap-2 text-[11px]">
                                                ${hasFlats ? `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">${z.total_flats} Flats</span>` : ''}
                                                ${hasShops ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">${z.total_shops} Shops</span>` : ''}
                                                ${hasAmenities ? `<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">${z.amenity}</span>` : ''}
                                            </div>
                                        </div>

                                        ${(config.flats?.length > 0 || config.shops?.length > 0 || hasRooms || config.amenities_sizes) ? `
                                            <div class="mt-2 pt-2 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-gray-600">
                                                ${config.flats?.length > 0 ? `
                                                    <div>
                                                        <span class="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Flat Sizes (Sq.Ft):</span>
                                                        <p class="font-mono text-slate-700 truncate">${config.flats.join(', ')}</p>
                                                    </div>
                                                ` : ''}
                                                ${config.shops?.length > 0 ? `
                                                    <div>
                                                        <span class="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Shop Sizes (Sq.Ft):</span>
                                                        <p class="font-mono text-slate-700 truncate">${config.shops.join(', ')}</p>
                                                    </div>
                                                ` : ''}
                                                ${hasRooms ? `
                                                    <div class="col-span-full">
                                                        <span class="text-[10px] font-bold text-indigo-600 uppercase block mb-0.5">Custom Room Sizes (Sq.Ft):</span>
                                                        <p class="text-slate-700">${Object.entries(config.rooms).map(([k, v]) => `${k}: <b>${v}</b>`).join(' | ')}</p>
                                                    </div>
                                                ` : ''}
                                                ${config.amenities_sizes && Object.keys(config.amenities_sizes).length > 0 ? `
                                                    <div class="col-span-full">
                                                        <span class="text-[10px] font-bold text-emerald-600 uppercase block mb-0.5">Amenity Sizes (Sq.Ft):</span>
                                                        <p class="text-slate-700">${Object.entries(config.amenities_sizes).map(([k, v]) => `${k}: <b>${v}</b>`).join(' | ')}</p>
                                                    </div>
                                                ` : ''}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        });

        contentEl.innerHTML = html;
        wireModalSiteMapButton(project);

    } catch (err) {
        console.error('Error fetching project zones:', err);
        contentEl.innerHTML = `
            <div class="p-6 text-center text-red-600 bg-red-50 rounded-2xl border border-red-200 text-xs">
                Could not load zones for this project: ${err.message}
            </div>
        `;
    }
}

function wireModalSiteMapButton(project) {
    const btn = document.getElementById('btnModalGoToSiteMap');
    if (!btn) return;
    btn.addEventListener('click', () => {
        activateWorkspaceProject(project.id);
        window.location.href = '../site-map/site-map.html';
    });
}

function setupArchitectureModalHandlers() {
    const modal = document.getElementById('architectureModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const closeActionBtn = document.getElementById('modalCloseActionBtn');
    const activateModalBtn = document.getElementById('modalActivateProjectBtn');

    const closeModal = () => modal.classList.add('hidden');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeActionBtn) closeActionBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });

    if (activateModalBtn) {
        activateModalBtn.addEventListener('click', () => {
            if (currentModalProject) {
                activateWorkspaceProject(currentModalProject.id);
                closeModal();
            }
        });
    }
}

// ==========================================
// TOOLBAR & VIEW CONTROLS
// ==========================================
function setupToolbarListeners() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const sortBy = document.getElementById('sortBy');
    const refreshBtn = document.getElementById('refreshBtn');
    const viewGridBtn = document.getElementById('viewGridBtn');
    const viewTableBtn = document.getElementById('viewTableBtn');

    if (searchInput) searchInput.addEventListener('input', () => filterAndRenderProjects());
    if (statusFilter) statusFilter.addEventListener('change', () => filterAndRenderProjects());
    if (sortBy) sortBy.addEventListener('change', () => filterAndRenderProjects());

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await loadProjectsWithAnalytics();
            showToast('Project directory refreshed successfully', 'success');
        });
    }

    if (viewGridBtn && viewTableBtn) {
        viewGridBtn.addEventListener('click', () => {
            activeView = 'grid';
            viewGridBtn.classList.add('bg-white', 'text-slate-800', 'shadow-xs');
            viewGridBtn.classList.remove('text-slate-500');
            viewTableBtn.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
            viewTableBtn.classList.add('text-slate-500');
            filterAndRenderProjects();
        });

        viewTableBtn.addEventListener('click', () => {
            activeView = 'table';
            viewTableBtn.classList.add('bg-white', 'text-slate-800', 'shadow-xs');
            viewTableBtn.classList.remove('text-slate-500');
            viewGridBtn.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
            viewGridBtn.classList.add('text-slate-500');
            filterAndRenderProjects();
        });
    }
}

// ==========================================
// AUTOMATION & INTELLIGENCE
// ==========================================
function initSiteWeatherWidget() {
    const conditionEl = document.getElementById('weatherCondition');
    const iconEl = document.getElementById('weatherIcon');

    const currentHour = new Date().getHours();
    if (currentHour >= 19 || currentHour <= 5) {
        if (conditionEl) conditionEl.textContent = '28°C • Clear Night • Optimal Curing';
        if (iconEl) iconEl.textContent = '🌙';
    } else {
        if (conditionEl) conditionEl.textContent = '31°C • Clear Sky • Good For Concrete Pour';
        if (iconEl) iconEl.textContent = '☀️';
    }
}

function getScheduleHealth(project) {
    if (project.status === 'Completed') {
        return { label: 'Delivered', badge: '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Delivered</span>' };
    }

    const stats = taskStatsByProject[project.id];
    if (stats && stats.overdue > 0) {
        return { 
            label: 'Delayed', 
            badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white shadow-xs">${stats.overdue} Delayed</span>` 
        };
    }

    if (project.target_date) {
        const target = new Date(project.target_date);
        const diffDays = Math.ceil((target - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            return { 
                label: 'Overdue Target', 
                badge: '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white shadow-xs">Overdue</span>' 
            };
        } else if (diffDays <= 30) {
            return { 
                label: 'Deadline Nearing', 
                badge: '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400 text-slate-900 shadow-xs">Due Soon</span>' 
            };
        }
    }

    return { 
        label: 'On Track', 
        badge: '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500 text-white shadow-xs">On Track</span>' 
    };
}

function getProjectProgress(project) {
    if (taskStatsByProject[project.id] && taskStatsByProject[project.id].total > 0) {
        const stats = taskStatsByProject[project.id];
        return Math.round((stats.completed / stats.total) * 100);
    }
    if (project.progress_percentage !== undefined && project.progress_percentage !== null) {
        return Number(project.progress_percentage) || 0;
    }
    if (project.status === 'Completed') return 100;
    return 0;
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function getStatusBadge(status, isArchived) {
    if (isArchived || status === 'Archived') {
        return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-500 text-white shadow-sm">Archived</span>';
    }

    switch (status) {
        case 'On Going':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500 text-white shadow-sm">On Going</span>';
        case 'Completed':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500 text-white shadow-sm">Completed</span>';
        case 'On Hold':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500 text-white shadow-sm">On Hold</span>';
        case 'Planning Completed, But Construction Not Started':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400 text-slate-900 shadow-sm">Planned, Not Started</span>';
        case 'Planning':
        default:
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">Planning</span>';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const isError = type === 'error';
    const isSuccess = type === 'success';

    let borderClass = 'border-amber-500';
    let indicatorClass = 'bg-amber-400';
    if (isSuccess) {
        borderClass = 'border-emerald-500';
        indicatorClass = 'bg-emerald-400';
    } else if (isError) {
        borderClass = 'border-rose-500';
        indicatorClass = 'bg-rose-500';
    }

    toast.className = `glass-card pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0 bg-slate-900/90 text-white ${borderClass}`;
    toast.innerHTML = `
        <span class="w-2 h-2 rounded-full ${indicatorClass} shrink-0"></span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}