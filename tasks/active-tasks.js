/**
 * Prayosha ERP - Active Tasks Controller
 * File: /tasks/active-tasks.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes civil tasks to the active project stored in localStorage.
 * 2. Deep-Link / QR Code Zone Filter: Auto-detects and isolates tasks for ?zone_id=... from Site Map.
 * 3. Real-Time Client Search & Filtering: Instant search across Zone ID, Agency, and Categories.
 * 4. Dynamic Category Extraction: Populates category filter options from live data.
 * 5. Resilient Supabase Integration: Graceful fallbacks, schema-tolerant property matching, and status badges.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? (typeof window.supabase.createClient === 'function' 
        ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
        : window.supabase)
    : null);

// DOM Elements
const taskContainer = document.getElementById('active-tasks-container');
const projectBadge = document.getElementById('activeProjectBadge');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const refreshBtn = document.getElementById('refreshBtn');

// In-Memory State & URL Filter State
let allTasks = [];
let activeZoneFilter = '';

/**
 * 0. Initialize & Parse URL Query Parameters
 */
function initUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const zoneParam = urlParams.get('zone_id') || urlParams.get('zone');
    if (zoneParam && zoneParam.trim() !== '') {
        activeZoneFilter = zoneParam.trim();
    }
}

/**
 * 1. Load Active Tasks scoped to Active Project
 */
async function loadActiveTasks() {
    initUrlParameters();

    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    // Update Project Badge in Toolbar
    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    if (!taskContainer) return;

    taskContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="animate-spin h-6 w-6 text-[#FFBF00] mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span class="text-xs font-semibold">Fetching tasks for ${activeProjectName || 'current project'}...</span>
        </div>
    `;

    if (!client) {
        taskContainer.innerHTML = `
            <div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                Supabase client connection not detected. Please verify config.js.
            </div>
        `;
        return;
    }

    try {
        // Query tasks from civil_tasks where status is NOT completed
        let query = client
            .from('civil_tasks')
            .select('*');

        // Filter by project if active project is configured
        if (activeProjectName && activeProjectId) {
            query = query.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        const { data: tasks, error } = await query;

        if (error) throw error;

        // Tolerant status filtering (excluding 'Completed' in either casing)
        allTasks = (tasks || []).filter(t => {
            const statusVal = (t.status || t.Status || '').trim().toLowerCase();
            return statusVal !== 'completed';
        });

        // Populate Category Dropdown dynamically from live results
        populateCategoryFilter(allTasks);

        // Render Zone Filter Banner (if arriving via QR Code or Site Map Pin)
        renderZoneFilterBanner();

        // Render Rows
        renderFilteredTasks();

    } catch (err) {
        console.error('[Active Tasks Load Failure]:', err);
        taskContainer.innerHTML = `
            <div class="p-5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to load active tasks</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
                <button onclick="loadActiveTasks()" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                    Retry Connection
                </button>
            </div>
        `;
    }
}

/**
 * 2. Render Zone Filter Banner (for QR Scan / Site Map Redirection)
 */
function renderZoneFilterBanner() {
    let banner = document.getElementById('zone-filter-active-banner');

    if (!activeZoneFilter) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'zone-filter-active-banner';
        taskContainer.parentNode.insertBefore(banner, taskContainer);
    }

    const matchedCount = allTasks.filter(t => {
        const z = (t.zone_id || t.Zone_ID || '').trim().toLowerCase();
        return z === activeZoneFilter.toLowerCase();
    }).length;

    banner.className = 'mb-4 p-3.5 bg-amber-50 border border-[#FFBF00]/60 rounded-xl shadow-sm flex items-center justify-between gap-3 text-xs animate-fade-in';
    banner.innerHTML = `
        <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-[#1E3A5F] text-[#FFBF00] flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
            <div>
                <span class="text-slate-500 font-medium block text-[11px]">Filtered by Site Map Zone:</span>
                <span class="font-bold text-[#1E3A5F] text-sm tracking-wide uppercase">${activeZoneFilter}</span>
                <span class="text-slate-500 font-normal ml-1">(${matchedCount} active task${matchedCount === 1 ? '' : 's'})</span>
            </div>
        </div>

        <button id="btnClearZoneFilter" type="button" class="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 shadow-xs transition flex items-center gap-1.5 active:scale-95">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            <span>Show All Zones</span>
        </button>
    `;

    document.getElementById('btnClearZoneFilter').addEventListener('click', () => {
        activeZoneFilter = '';
        banner.remove();

        // Remove zone_id from browser address bar without reloading
        const url = new URL(window.location);
        url.searchParams.delete('zone_id');
        url.searchParams.delete('zone');
        window.history.replaceState({}, document.title, url.pathname);

        renderFilteredTasks();
    });
}

/**
 * 3. Populate Category Filter Dropdown
 */
function populateCategoryFilter(tasks) {
    if (!categoryFilter) return;

    const currentSelected = categoryFilter.value;
    const categories = Array.from(new Set(
        tasks.map(t => t.category || t.Category || t.area_type).filter(Boolean)
    )).sort();

    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentSelected) opt.selected = true;
        categoryFilter.appendChild(opt);
    });
}

/**
 * 4. Render Filtered Tasks List
 */
function renderFilteredTasks() {
    if (!taskContainer) return;

    const searchTerm = (searchInput ? searchInput.value.trim().toLowerCase() : '');
    const selectedCategory = (categoryFilter ? categoryFilter.value : '');

    const filtered = allTasks.filter(task => {
        const zoneIdVal = (task.zone_id || task.Zone_ID || '').trim();
        const catVal = (task.category || task.Category || task.area_type || '').trim();
        const towerVal = (task.tower_block || task.tower_name || task.Phase || '').trim();
        const agencyVal = (task.assigned_agency || task.Assigned_Agency || '').trim();
        const descVal = (task.task_description || task.Task_Description || '').trim();

        // Zone filter check (from QR scan / Site Map deep-link)
        const matchesZone = !activeZoneFilter || (zoneIdVal.toLowerCase() === activeZoneFilter.toLowerCase());

        // Category filter check
        const matchesCategory = !selectedCategory || (catVal.toLowerCase() === selectedCategory.toLowerCase());

        // Text search check
        const matchesSearch = !searchTerm || (
            zoneIdVal.toLowerCase().includes(searchTerm) ||
            catVal.toLowerCase().includes(searchTerm) ||
            towerVal.toLowerCase().includes(searchTerm) ||
            agencyVal.toLowerCase().includes(searchTerm) ||
            descVal.toLowerCase().includes(searchTerm)
        );

        return matchesZone && matchesCategory && matchesSearch;
    });

    taskContainer.innerHTML = '';

    if (filtered.length === 0) {
        taskContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 text-xl">
                    📋
                </div>
                <h3 class="text-sm font-bold text-slate-700 mb-1">No Active Tasks Found</h3>
                <p class="text-xs text-slate-400 max-w-sm">
                    ${activeZoneFilter 
                        ? `There are no uncompleted tasks currently logged for Zone "${activeZoneFilter}".` 
                        : 'No tasks match your current filters or project selection.'}
                </p>
                <a href="log-task.html${activeZoneFilter ? `?zone_id=${encodeURIComponent(activeZoneFilter)}` : ''}" class="mt-4 px-4 py-2 bg-[#1E3A5F] hover:bg-[#152A45] text-white text-xs font-semibold rounded-xl shadow-md transition">
                    + Log Task for this Zone
                </a>
            </div>
        `;
        return;
    }

    // Render task cards
    filtered.forEach(task => {
        const taskId = task.id || task.Task_ID || task.task_id || 'TSK';
        const zoneId = task.zone_id || task.Zone_ID || 'N/A';
        const tower = task.tower_block || task.tower_name || task.Phase || '';
        const floor = task.floor_level || task.Floor_Level || '';
        const category = task.category || task.Category || task.area_type || 'General Civil';
        const taskDesc = task.task_description || task.Task_Description || 'Civil Task';
        const agency = task.assigned_agency || task.Assigned_Agency || 'Unassigned';
        const targetDate = task.expected_completion_date || task.target_date || 'No Date';
        const assignedDate = task.assigned_date || task.created_at ? new Date(task.created_at).toLocaleDateString('en-IN') : 'Active';
        const status = task.status || task.Status || 'Not Started';

        let statusBadgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
        if (status === 'Ready for QC') {
            statusBadgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
        } else if (status === 'In Progress' || status === 'On-Going') {
            statusBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
        } else if (status === 'Delayed') {
            statusBadgeClass = 'bg-red-50 text-red-700 border-red-200';
        }

        const taskRow = document.createElement('div');
        taskRow.className = 'bg-white border border-slate-200/90 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4';

        taskRow.innerHTML = `
            <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
                <!-- Zone & Location -->
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Zone ID</span>
                    <div class="font-bold text-[#1E3A5F] text-sm tracking-tight">${zoneId}</div>
                    <div class="text-[11px] text-slate-500 font-medium mt-0.5">
                        ${tower}${tower && floor ? ' • ' : ''}${floor}
                    </div>
                </div>

                <!-- Description & Category -->
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Task & Category</span>
                    <div class="text-xs font-semibold text-slate-800 line-clamp-1" title="${taskDesc}">${taskDesc}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${category} • Target: ${targetDate}</div>
                </div>

                <!-- Agency -->
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Assigned Agency</span>
                    <div class="text-xs font-bold text-[#1E3A5F] truncate">${agency}</div>
                    <div class="text-[10px] text-emerald-600 font-medium mt-0.5">Assigned: ${assignedDate}</div>
                </div>

                <!-- Status Badge -->
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Execution Status</span>
                    <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${statusBadgeClass}">
                        ${status}
                    </span>
                </div>
            </div>

            <!-- Action Controls -->
            <div class="flex items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 md:border-l md:pl-4 border-slate-100 justify-end">
                <button type="button" onclick="handlePhotoPrompt('${taskId}')" class="flex items-center gap-1.5 text-xs text-[#1E3A5F] hover:bg-slate-50 font-semibold border border-slate-200 rounded-xl px-3.5 py-2 transition shadow-sm">
                    <svg class="w-3.5 h-3.5 text-[#FFBF00]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span>Photo</span>
                </button>
            </div>
        `;

        taskContainer.appendChild(taskRow);
    });
}

/**
 * 5. Helper for Photo Upload Trigger
 */
window.handlePhotoPrompt = function(taskId) {
    alert(`Photo verification workflow for Task [${taskId}] is linked to Cloudflare R2 storage.`);
};

/**
 * 6. Event Listeners
 */
if (searchInput) {
    searchInput.addEventListener('input', renderFilteredTasks);
}

if (categoryFilter) {
    categoryFilter.addEventListener('change', renderFilteredTasks);
}

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        loadActiveTasks();
    });
}

// Initial Load
document.addEventListener('DOMContentLoaded', loadActiveTasks);