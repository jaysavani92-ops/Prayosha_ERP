/**
 * Prayosha ERP - Pending Tasks Controller
 * File: /tasks/pending-tasks.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes pending work packages to activeProjectId / activeProjectName.
 * 2. Floor Hierarchy Grouping: Groups unstarted tasks by floor level for streamlined site mobilization.
 * 3. Task State Transition: Moves staged tasks into active execution ('In Progress') with start date stamping.
 * 4. Executive Status Toolbar: Reflects active project badge and offers list refresh triggers.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const taskContainer = document.getElementById('pending-tasks-container');
const projectBadge = document.getElementById('activeProjectBadge');

/**
 * 1. Load Pending Tasks scoped to Active Project
 */
async function loadPendingTasks() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    // Update Toolbar Project Badge
    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    if (!taskContainer) return;

    taskContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="animate-spin h-6 w-6 text-brand-amber mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span class="text-xs font-semibold">Loading staged tasks for ${activeProjectName || 'current project'}...</span>
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
        // Query tasks strictly with 'Not Started' status
        let query = client
            .from('civil_tasks')
            .select('*')
            .eq('status', 'Not Started')
            .order('created_at', { ascending: false });

        // Filter by active project context
        if (activeProjectName && activeProjectId) {
            query = query.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        const { data: tasks, error } = await query;

        if (error) throw error;

        taskContainer.innerHTML = '';

        if (!tasks || tasks.length === 0) {
            taskContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 text-center bg-slate-50 border border-slate-200 rounded-2xl p-6">
                    <div class="w-12 h-12 rounded-2xl bg-brand-navy/10 text-brand-navy flex items-center justify-center text-xl mb-3">
                        ✓
                    </div>
                    <h3 class="text-sm font-bold text-slate-700 mb-1">No Pending Tasks Awaiting Start</h3>
                    <p class="text-xs text-slate-500 max-w-md">All logged civil tasks for this site project have either started execution or completed.</p>
                    <a href="log-task.html" class="mt-4 px-4 py-2 bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold rounded-xl shadow-md transition">
                        + Log New Work Package
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

        // Render floor group containers
        for (const [floor, floorTasks] of Object.entries(groupedTasks)) {
            const floorGroup = document.createElement('div');
            floorGroup.className = 'border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm bg-white mb-4';

            let tasksRowsHtml = '';
            floorTasks.forEach(task => {
                const createdDate = task.created_at 
                    ? new Date(task.created_at).toLocaleDateString('en-GB') 
                    : (task.assigned_date || 'Staged');

                tasksRowsHtml += `
                    <div class="p-4 bg-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/70 transition border-b border-slate-100 last:border-b-0">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full items-center">
                            <!-- Zone & Tower -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Zone ID</span>
                                <div class="font-bold text-brand-navy text-sm">${task.zone_id || 'N/A'}</div>
                                <div class="text-[11px] text-slate-500 font-medium mt-0.5">${task.tower_block || ''}</div>
                            </div>

                            <!-- Category -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Category</span>
                                <div class="text-xs font-semibold text-slate-800">${task.category || 'General Civil'}</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">Target: ${task.expected_completion_date || 'No Date'}</div>
                            </div>

                            <!-- Agency -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Assigned Agency</span>
                                <div class="text-xs font-bold ${task.assigned_agency ? 'text-brand-amber' : 'text-red-500'} truncate">
                                    ${task.assigned_agency || 'Unassigned'}
                                </div>
                                <div class="text-[10px] text-slate-400 mt-0.5">Staged: ${createdDate}</div>
                            </div>

                            <!-- Status Staging -->
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Current State</span>
                                <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    Not Started
                                </span>
                            </div>
                        </div>

                        <!-- Start Action Button -->
                        <div class="w-full md:w-auto flex justify-end md:pl-4 md:border-l border-slate-100">
                            <button type="button" 
                                    onclick="markAsOngoing('${task.id}', this)" 
                                    class="w-full md:w-auto bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer">
                                <span>▶</span>
                                <span>Start Task</span>
                            </button>
                        </div>
                    </div>
                `;
            });

            floorGroup.innerHTML = `
                <div class="bg-brand-navy/[0.04] px-4 py-3 border-b border-slate-200/80 flex items-center justify-between">
                    <h3 class="font-bold text-brand-navy flex items-center gap-2 tracking-wide text-xs uppercase">
                        <span class="text-brand-amber">⬢</span>
                        <span>${floor}</span>
                    </h3>
                    <span class="bg-white text-brand-navy text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200 shadow-sm">
                        ${floorTasks.length} Pending
                    </span>
                </div>
                <div>${tasksRowsHtml}</div>
            `;

            taskContainer.appendChild(floorGroup);
        }

    } catch (err) {
        console.error('[Pending Tasks Load Failure]:', err);
        taskContainer.innerHTML = `
            <div class="p-5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to load staged tasks</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
                <button onclick="loadPendingTasks()" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                    Retry Connection
                </button>
            </div>
        `;
    }
}

/**
 * 2. Transition Task from 'Not Started' to 'In Progress'
 */
window.markAsOngoing = async function(taskId, btnElement) {
    const confirmStart = confirm('Start work on this task now? It will transition to the Active Tasks execution board.');
    if (!confirmStart) return;

    if (btnElement) {
        btnElement.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-white inline mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            Starting...
        `;
        btnElement.disabled = true;
    }

    try {
        if (!client) throw new Error('Supabase client connection not active.');

        const today = new Date().toISOString().split('T')[0];

        const { error } = await client
            .from('civil_tasks')
            .update({ 
                status: 'In Progress',
                started_date: today 
            })
            .eq('id', taskId);

        if (error) throw error;

        // Reload list to update floor staging
        await loadPendingTasks();

    } catch (err) {
        console.error('[Task Transition Failure]:', err);
        alert('Failed to start task: ' + (err.message || 'Database error'));
        if (btnElement) {
            btnElement.innerHTML = '▶ Start Task';
            btnElement.disabled = false;
        }
    }
};

// Expose globally for HTML onclick hooks
window.loadPendingTasks = loadPendingTasks;

// Initial Load
document.addEventListener('DOMContentLoaded', loadPendingTasks);