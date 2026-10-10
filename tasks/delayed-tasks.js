/**
 * Prayosha ERP - Delayed & Overdue Tasks Controller
 * File: /tasks/delayed-tasks.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes delayed tasks to activeProjectId / activeProjectName.
 * 2. Overdue Calculation: Computes elapsed days past expected_completion_date in real-time.
 * 3. Justification Note Updating: Saves root-cause delay notes back to the civil_tasks table.
 * 4. Executive Status Toolbar: Reflects active project badge and offers re-scan triggers.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const taskContainer = document.getElementById('delayed-tasks-container');
const projectBadge = document.getElementById('activeProjectBadge');
const refreshBtn = document.getElementById('refreshDelayedBtn');

/**
 * 1. Load Overdue Tasks scoped to Active Project
 */
async function loadDelayedTasks() {
    const today = new Date().toISOString().split('T')[0];
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
            <svg class="animate-spin h-6 w-6 text-red-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span class="text-xs font-semibold">Scanning database for delays in ${activeProjectName || 'current project'}...</span>
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
        // Query tasks: NOT completed AND completion date < today
        let query = client
            .from('civil_tasks')
            .select('*')
            .neq('status', 'Completed')
            .lt('expected_completion_date', today)
            .order('expected_completion_date', { ascending: true });

        // Filter by active project context
        if (activeProjectName && activeProjectId) {
            query = query.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        const { data: tasks, error } = await query;

        if (error) throw error;

        taskContainer.innerHTML = '';

        // Clean Zero-Delay State
        if (!tasks || tasks.length === 0) {
            taskContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 text-center bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-6">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl mb-3 shadow-sm">
                        ✓
                    </div>
                    <h3 class="text-sm font-bold text-emerald-900 mb-1">Zero Overdue Tasks on Site</h3>
                    <p class="text-xs text-emerald-700 max-w-md">All active milestone packages for this project are currently progressing within their scheduled completion targets.</p>
                    <a href="active-tasks.html" class="mt-4 px-4 py-2 bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold rounded-xl shadow-md transition">
                        View Active Tasks
                    </a>
                </div>
            `;
            return;
        }

        // Render Delayed Task Cards
        tasks.forEach(task => {
            const expectedDate = new Date(task.expected_completion_date);
            const currentDate = new Date(today);
            const diffTime = Math.abs(currentDate - expectedDate);
            const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const taskCard = document.createElement('div');
            taskCard.className = 'bg-red-50/60 border border-red-200/90 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4';

            taskCard.innerHTML = `
                <div class="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center w-full">
                    <!-- Zone Identification -->
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-500 block mb-0.5">Zone ID</span>
                        <div class="font-bold text-brand-navy text-sm">${task.zone_id || 'N/A'}</div>
                        <div class="text-[11px] text-slate-600 bg-white inline-block px-2 py-0.5 rounded-lg border border-red-200 mt-1 font-medium">
                            ${task.tower_block || ''} • ${task.floor_level || ''}
                        </div>
                    </div>

                    <!-- Work Category & Agency -->
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-500 block mb-0.5">Category & Agency</span>
                        <div class="text-xs font-semibold text-slate-800">${task.category || 'General Civil'}</div>
                        <div class="text-[11px] font-bold text-brand-amber mt-0.5 truncate">${task.assigned_agency || 'Unassigned'}</div>
                    </div>

                    <!-- Target Deadline & Overdue Counter -->
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-500 block mb-0.5">Milestone Breach</span>
                        <div class="text-xs font-semibold text-slate-700">Target: ${task.expected_completion_date || 'No Date'}</div>
                        <div class="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-md mt-1">
                            <span>⚠️</span> ${daysOverdue} Day${daysOverdue === 1 ? '' : 's'} Overdue
                        </div>
                    </div>

                    <!-- Delay Justification Input -->
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-500 block mb-1">Delay Root Cause</span>
                        <input type="text" 
                               class="text-xs font-medium p-2.5 border border-red-200 rounded-xl w-full bg-white focus:ring-2 focus:ring-red-400 focus:border-transparent outline-none delay-reason-input transition placeholder:text-slate-400" 
                               placeholder="e.g. Material stockout, rain..." 
                               value="${task.delayed_reason || ''}" 
                               data-id="${task.id}">
                    </div>
                </div>

                <!-- Update Action Button -->
                <div class="lg:ml-4 lg:pl-4 lg:border-l border-red-200 w-full lg:w-auto flex justify-end">
                    <button type="button" 
                            onclick="updateDelayReason('${task.id}', this)" 
                            class="w-full lg:w-auto bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-red-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer">
                        <span>Save Reason</span>
                    </button>
                </div>
            `;

            taskContainer.appendChild(taskCard);
        });

    } catch (err) {
        console.error('[Delayed Tasks Load Failure]:', err);
        taskContainer.innerHTML = `
            <div class="p-5 bg-red-100 border border-red-200 rounded-2xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to scan overdue tasks</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
                <button onclick="loadDelayedTasks()" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                    Retry Scan
                </button>
            </div>
        `;
    }
}

/**
 * 2. Update Delay Reason in Supabase
 */
window.updateDelayReason = async function(taskId, btnElement) {
    const card = btnElement.closest('.bg-red-50\\/60') || btnElement.closest('.border-red-200\\/90');
    const inputField = card ? card.querySelector('.delay-reason-input') : document.querySelector(`.delay-reason-input[data-id="${taskId}"]`);
    
    if (!inputField) return;
    const newReason = inputField.value.trim();

    const originalBtnText = btnElement.innerHTML;
    btnElement.innerHTML = `
        <svg class="animate-spin h-3.5 w-3.5 text-white inline mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Saving...
    `;
    btnElement.disabled = true;

    try {
        if (!client) throw new Error('Supabase client connection not active.');

        const { error } = await client
            .from('civil_tasks')
            .update({ 
                delayed_reason: newReason,
                status: 'Delayed' // Automatically flag status as Delayed
            })
            .eq('id', taskId);

        if (error) throw error;

        btnElement.innerHTML = `✓ Saved`;
        btnElement.classList.remove('bg-red-600', 'hover:bg-red-700');
        btnElement.classList.add('bg-emerald-600');

        setTimeout(() => {
            btnElement.innerHTML = originalBtnText;
            btnElement.classList.remove('bg-emerald-600');
            btnElement.classList.add('bg-red-600', 'hover:bg-red-700');
            btnElement.disabled = false;
        }, 2000);

    } catch (err) {
        console.error('[Delay Reason Save Failure]:', err);
        alert('Failed to save delay reason: ' + (err.message || 'Database write error'));
        btnElement.innerHTML = originalBtnText;
        btnElement.disabled = false;
    }
};

/**
 * 3. Event Listeners
 */
if (refreshBtn) {
    refreshBtn.addEventListener('click', loadDelayedTasks);
}

// Initial Load
document.addEventListener('DOMContentLoaded', loadDelayedTasks);