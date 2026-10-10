/**
 * Prayosha ERP - Zone Timeline Controller
 * File: /tasks/zone-timeline.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes zone timeline queries to activeProjectId / activeProjectName.
 * 2. Chronological Lifecycle: Renders multi-trade task progression nodes in order.
 * 3. Lifecycle Metrics: Computes total active days across all trade packages.
 * 4. Keyboard Shortcuts: Supports instant search on pressing the Enter key.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const timelineContainer = document.getElementById('timeline-container');
const zoneSummary = document.getElementById('zone-summary');
const projectBadge = document.getElementById('activeProjectBadge');
const searchInput = document.getElementById('search_zone_id');

/**
 * 1. Initialize Toolbar & Session Badge
 */
function initTimelineToolbar() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    // Check URL parameters for direct zone linkage
    const urlParams = new URLSearchParams(window.location.search);
    const paramZone = urlParams.get('zone');
    if (paramZone && searchInput) {
        searchInput.value = paramZone;
        fetchZoneTimeline();
    }
}

/**
 * 2. Fetch and Build Zone Timeline
 */
async function fetchZoneTimeline() {
    if (!searchInput) return;
    const searchZoneId = searchInput.value.trim().toUpperCase();
    
    if (!searchZoneId) {
        alert("Please enter a valid Zone ID (e.g. GF-CLS-001 or PRY-A-B-FL-101).");
        searchInput.focus();
        return;
    }

    if (!timelineContainer) return;

    timelineContainer.innerHTML = `
        <div class="pl-8 py-10 text-slate-400 text-xs font-semibold flex items-center gap-2">
            <svg class="animate-spin h-4 w-4 text-brand-amber" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span>Constructing chronological timeline for Zone [${searchZoneId}]...</span>
        </div>
    `;

    if (zoneSummary) zoneSummary.classList.add('hidden');

    if (!client) {
        timelineContainer.innerHTML = `
            <div class="pl-8 py-6 text-red-600 text-xs font-semibold">
                Supabase client connection not active. Please verify config.js.
            </div>
        `;
        return;
    }

    try {
        const activeProjectName = localStorage.getItem('activeProjectName') || '';
        const activeProjectId = localStorage.getItem('activeProjectId') || '';

        // Query civil tasks for this exact Zone ID
        let query = client
            .from('civil_tasks')
            .select('*')
            .ilike('zone_id', searchZoneId)
            .order('created_at', { ascending: true });

        // Optional project scope if set
        if (activeProjectName && activeProjectId) {
            query = query.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        const { data: tasks, error } = await query;

        if (error) throw error;

        if (!tasks || tasks.length === 0) {
            timelineContainer.innerHTML = `
                <div class="pl-8 py-8 text-center sm:text-left">
                    <div class="text-sm font-bold text-red-600 mb-1">No Task Records Found</div>
                    <p class="text-xs text-slate-500">No civil work packages have been assigned to Zone ID <strong>${searchZoneId}</strong> under this project.</p>
                    <a href="log-task.html" class="inline-block mt-3 px-3 py-1.5 bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold rounded-lg shadow-sm transition">
                        + Assign Task to ${searchZoneId}
                    </a>
                </div>
            `;
            return;
        }

        // Calculate "Days Active"
        const timestamps = tasks.map(t => new Date(t.created_at || t.assigned_date || Date.now()).getTime());
        const earliestDate = new Date(Math.min(...timestamps));
        let latestDate = new Date();
        
        const allCompleted = tasks.every(t => t.status === 'Completed');
        if (allCompleted) {
            const completedTimes = tasks
                .filter(t => t.completed_date)
                .map(t => new Date(t.completed_date).getTime());
            if (completedTimes.length > 0) {
                latestDate = new Date(Math.max(...completedTimes));
            }
        }
        
        const diffTime = Math.abs(latestDate - earliestDate);
        const daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

        // Populate Summary Header
        const summaryTitle = document.getElementById('summary-title');
        const summaryLocation = document.getElementById('summary-location');
        const summaryDays = document.getElementById('summary-days');

        if (summaryTitle) summaryTitle.textContent = searchZoneId;
        if (summaryLocation) {
            summaryLocation.textContent = `${tasks[0].project_name || 'Project'} • ${tasks[0].tower_block || 'Tower'} • ${tasks[0].floor_level || 'Floor'}`;
        }
        if (summaryDays) summaryDays.textContent = daysActive;
        if (zoneSummary) zoneSummary.classList.remove('hidden');

        // Build Chronological Timeline Nodes
        timelineContainer.innerHTML = '';

        tasks.forEach(task => {
            // Determine status badge and node dot colors
            let statusBadge = "bg-blue-50 text-blue-700 border-blue-200";
            let dotColor = "bg-blue-500 ring-blue-200";
            
            if (task.status === 'Completed') {
                statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-200";
                dotColor = "bg-emerald-500 ring-emerald-200";
            } else if (task.status === 'Not Started') {
                statusBadge = "bg-slate-100 text-slate-700 border-slate-200";
                dotColor = "bg-slate-400 ring-slate-200";
            } else if (task.status === 'Ready for QC') {
                statusBadge = "bg-purple-50 text-purple-700 border-purple-200";
                dotColor = "bg-purple-500 ring-purple-200";
            } else if (task.status === 'Delayed') {
                statusBadge = "bg-red-50 text-red-700 border-red-200";
                dotColor = "bg-red-500 ring-red-200";
            }

            const startDateFmt = task.assigned_date 
                ? new Date(task.assigned_date).toLocaleDateString('en-GB') 
                : 'Pending';
            const endDateFmt = task.completed_date 
                ? new Date(task.completed_date).toLocaleDateString('en-GB') 
                : (task.expected_completion_date || '-');

            const shortId = (task.id && typeof task.id === 'string') 
                ? task.id.split('-')[0].toUpperCase() 
                : 'TSK';

            const timelineNode = document.createElement('div');
            timelineNode.className = "relative pl-8";
            
            timelineNode.innerHTML = `
                <!-- Milestone Dot -->
                <div class="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full ${dotColor} ring-4 border-2 border-white shadow-sm transition-transform duration-200 hover:scale-125"></div>
                
                <!-- Milestone Card -->
                <div class="bg-white border border-slate-200/90 rounded-2xl shadow-sm p-4 sm:p-5 hover:shadow-md transition">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                        <div>
                            <h4 class="text-base font-bold text-brand-navy tracking-tight">${task.category || 'Civil Package'}</h4>
                            <div class="text-[10px] text-slate-400 font-semibold mt-0.5 tracking-wider uppercase">Reference: #${shortId}</div>
                        </div>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border self-start sm:self-auto ${statusBadge}">
                            ${task.status || 'Active'}
                        </span>
                    </div>
                    
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs">
                        <div>
                            <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Agency</span>
                            <div class="font-bold text-brand-amber truncate">${task.assigned_agency || 'Unassigned'}</div>
                        </div>
                        <div>
                            <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Assigned Date</span>
                            <div class="text-slate-700 font-medium">${startDateFmt}</div>
                        </div>
                        <div>
                            <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Target / Finished</span>
                            <div class="text-slate-700 font-medium">${endDateFmt}</div>
                        </div>
                    </div>

                    ${task.delayed_reason ? `
                        <div class="mt-3 p-2.5 bg-red-50/70 border border-red-200/60 rounded-xl text-xs text-red-800">
                            <span class="font-bold">Delay Note:</span> ${task.delayed_reason}
                        </div>
                    ` : ''}
                </div>
            `;
            
            timelineContainer.appendChild(timelineNode);
        });

    } catch (err) {
        console.error('[Zone Timeline Load Failure]:', err);
        timelineContainer.innerHTML = `
            <div class="pl-8 py-6 text-red-600 text-xs font-semibold">
                Failed to load zone timeline: ${err.message || 'Unknown network error.'}
            </div>
        `;
    }
}

// Attach Search on "Enter" key press
if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            fetchZoneTimeline();
        }
    });
}

// Expose globally for HTML onclick handler
window.fetchZoneTimeline = fetchZoneTimeline;

// Run initial toolbar setup
document.addEventListener('DOMContentLoaded', initTimelineToolbar);