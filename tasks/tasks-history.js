/**
 * Prayosha ERP - Completed Tasks Archive Controller
 * File: /tasks/tasks-history.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes completed tasks to activeProjectId / activeProjectName.
 * 2. Floor Hierarchy Grouping: Groups archive records by floor level for structured verification.
 * 3. Execution Duration Analysis: Calculates elapsed days from assignment to completion.
 * 4. Executive Status Toolbar: Synchronizes active project badge and archive refresh triggers.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const historyContainer = document.getElementById('tasks-history-container');
const projectBadge = document.getElementById('activeProjectBadge');

/**
 * 1. Load Completed Tasks scoped to Active Project
 */
async function loadTasksHistory() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    // Update Toolbar Project Badge
    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    if (!historyContainer) return;

    historyContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="animate-spin h-6 w-6 text-emerald-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span class="text-xs font-semibold">Retrieving completed records for ${activeProjectName || 'current project'}...</span>
        </div>
    `;

    if (!client) {
        historyContainer.innerHTML = `
            <div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                Supabase client connection not detected. Please verify config.js.
            </div>
        `;
        return;
    }

    try {
        // Query tasks strictly marked as 'Completed'
        let query = client
            .from('civil_tasks')
            .select('*')
            .eq('status', 'Completed')
            .order('completed_date', { ascending: false });

        // Filter by active project context
        if (activeProjectName && activeProjectId) {
            query = query.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        const { data: tasks, error } = await query;

        if (error) throw error;

        historyContainer.innerHTML = '';

        if (!tasks || tasks.length === 0) {
            historyContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 text-center bg-slate-50 border border-slate-200 rounded-2xl p-6">
                    <div class="w-12 h-12 rounded-2xl bg-slate-200 text-slate-500 flex items-center justify-center text-xl mb-3">
                        📁
                    </div>
                    <h3 class="text-sm font-bold text-slate-700 mb-1">No Completed Tasks Found</h3>
                    <p class="text-xs text-slate-500 max-w-md">No civil milestone packages have been signed off as completed under this project archive.</p>
                    <a href="active-tasks.html" class="mt-4 px-4 py-2 bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold rounded-xl shadow-md transition">
                        Inspect Active Tasks
                    </a>
                </div>
            `;
            return;
        }

        // Group tasks by Floor Level
        const groupedTasks = tasks.reduce((acc, task) => {
            const floor = task.floor_level || 'General / Unassigned Floor';
            if (!acc[floor]) acc[floor] = [];
            acc[floor].push(task);
            return acc;
        }, {});

        // Render Floor Group Cards
        for (const [floor, floorTasks] of Object.entries(groupedTasks)) {
            const floorGroup = document.createElement('div');
            floorGroup.className = 'border border-emerald-200/80 rounded-2xl overflow-hidden shadow-sm bg-white mb-5';

            let tasksRowsHtml = '';

            floorTasks.forEach(task => {
                // Calculate Days to Complete
                let daysDuration = "-";
                if (task.assigned_date && task.completed_date) {
                    const start = new Date(task.assigned_date);
                    const end = new Date(task.completed_date);
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    daysDuration = diffDays === 0 ? "Same Day" : `${diffDays} Day${diffDays === 1 ? '' : 's'}`;
                }

                const assignedFmt = task.assigned_date 
                    ? new Date(task.assigned_date).toLocaleDateString('en-GB') 
                    : '-';
                const completedFmt = task.completed_date 
                    ? new Date(task.completed_date).toLocaleDateString('en-GB') 
                    : (task.updated_at ? new Date(task.updated_at).toLocaleDateString('en-GB') : '-');

                tasksRowsHtml += `
                    <div class="p-4 sm:p-5 bg-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-emerald-50/20 transition border-b border-emerald-100 last:border-b-0">
                        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full items-center">
                            <!-- Zone Identification -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Zone ID</span>
                                <div class="font-bold text-brand-navy text-sm">${task.zone_id || 'N/A'}</div>
                                <div class="text-[11px] text-slate-500 font-medium mt-0.5">${task.tower_block || ''}</div>
                            </div>

                            <!-- Category & Scope -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Category</span>
                                <div class="text-xs font-semibold text-slate-800">${task.category || 'Civil Package'}</div>
                                <div class="text-[11px] font-bold text-brand-amber mt-0.5 truncate">${task.assigned_agency || 'Unassigned'}</div>
                            </div>

                            <!-- Assigned Date -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Assigned Date</span>
                                <div class="text-xs text-slate-700 font-medium">${assignedFmt}</div>
                            </div>

                            <!-- Completed Date -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Completed Date</span>
                                <div class="text-xs text-emerald-700 font-semibold">${completedFmt}</div>
                            </div>

                            <!-- Duration Badge -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Total Duration</span>
                                <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    ✓ ${daysDuration}
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            });

            floorGroup.innerHTML = `
                <div class="bg-emerald-50/70 px-4 py-3 border-b border-emerald-200/80 flex items-center justify-between">
                    <h3 class="font-bold text-emerald-950 flex items-center gap-2 tracking-wide text-xs uppercase">
                        <span class="text-emerald-600">✓</span>
                        <span>${floor}</span>
                    </h3>
                    <span class="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                        ${floorTasks.length} Completed Task${floorTasks.length === 1 ? '' : 's'}
                    </span>
                </div>
                <div>${tasksRowsHtml}</div>
            `;

            historyContainer.appendChild(floorGroup);
        }

    } catch (err) {
        console.error('[Tasks History Load Failure]:', err);
        historyContainer.innerHTML = `
            <div class="p-5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to retrieve task archive</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
                <button onclick="loadTasksHistory()" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                    Retry Archive
                </button>
            </div>
        `;
    }
}

// Expose globally for HTML onclick handler
window.loadTasksHistory = loadTasksHistory;

// Initial Load
document.addEventListener('DOMContentLoaded', loadTasksHistory);