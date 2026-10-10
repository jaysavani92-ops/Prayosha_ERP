/**
 * Prayosha ERP - Site Issues & Blockers Controller
 * File: /tasks/issue-logs.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes active blockers to activeProjectId / activeProjectName.
 * 2. Floor Hierarchy Grouping: Groups impediments by floor level for targeted contractor escalation.
 * 3. Fast Resolution Workflow: Updates issue status to 'Resolved' directly in Supabase.
 * 4. Executive Status Toolbar: Synchronizes project badge and offers one-click refresh triggers.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const logsContainer = document.getElementById('issue-logs-container');
const projectBadge = document.getElementById('activeProjectBadge');

/**
 * 1. Load Active Blockers scoped to Active Project
 */
async function loadIssueLogs() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    // Update Toolbar Project Badge
    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    if (!logsContainer) return;

    logsContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="animate-spin h-6 w-6 text-red-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span class="text-xs font-semibold">Loading active blockers for ${activeProjectName || 'current project'}...</span>
        </div>
    `;

    if (!client) {
        logsContainer.innerHTML = `
            <div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                Supabase client connection not detected. Please verify config.js.
            </div>
        `;
        return;
    }

    try {
        // Query only Open issues, newest first
        let query = client
            .from('issues_blockers')
            .select('*')
            .eq('status', 'Open')
            .order('created_at', { ascending: false });

        // Filter by project context if available
        if (activeProjectName && activeProjectId) {
            query = query.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        let { data: issues, error } = await query;

        // Graceful fallback if project_name column hasn't been added to issues_blockers yet
        if (error && error.message && error.message.includes('column')) {
            console.warn('[Issue Logs] Project filter column not found in schema. Fetching open issues globally.');
            const fallbackRes = await client
                .from('issues_blockers')
                .select('*')
                .eq('status', 'Open')
                .order('created_at', { ascending: false });
            issues = fallbackRes.data;
            error = fallbackRes.error;
        }

        if (error) throw error;

        logsContainer.innerHTML = '';

        // All Clear Empty State
        if (!issues || issues.length === 0) {
            logsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 text-center bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-6">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl mb-3 shadow-sm">
                        ✓
                    </div>
                    <h3 class="text-sm font-bold text-emerald-900 mb-1">All Clear! Zero Active Blockers</h3>
                    <p class="text-xs text-emerald-700 max-w-md">There are no outstanding site impediments or unresolved blockers logged for this project.</p>
                    <a href="raise-issue.html" class="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl shadow-md transition">
                        + Raise New Issue
                    </a>
                </div>
            `;
            return;
        }

        // Group issues by Floor Level
        const groupedIssues = issues.reduce((acc, issue) => {
            const floor = issue.floor_level || 'General / Unassigned Floor';
            if (!acc[floor]) acc[floor] = [];
            acc[floor].push(issue);
            return acc;
        }, {});

        // Render Floor Group Cards
        for (const [floor, floorIssues] of Object.entries(groupedIssues)) {
            const floorGroup = document.createElement('div');
            floorGroup.className = 'border border-red-200/80 rounded-2xl overflow-hidden shadow-sm bg-white mb-5';

            let issuesRowsHtml = '';

            floorIssues.forEach(issue => {
                const dateFmt = issue.created_at 
                    ? new Date(issue.created_at).toLocaleDateString('en-GB') 
                    : 'Recently Logged';

                // Priority Badge Color
                let priorityClass = 'bg-red-100 text-red-800 border-red-200';
                const p = (issue.priority || '').toLowerCase();
                if (p === 'medium') {
                    priorityClass = 'bg-amber-100 text-amber-800 border-amber-200';
                } else if (p === 'low') {
                    priorityClass = 'bg-slate-100 text-slate-700 border-slate-200';
                }

                issuesRowsHtml += `
                    <div class="p-4 sm:p-5 bg-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-red-50/30 transition border-b border-red-100 last:border-b-0">
                        <div class="w-full">
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start mb-3">
                                <!-- Zone ID -->
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Zone ID</span>
                                    <div class="font-bold text-brand-navy text-sm">${issue.zone_id || 'Site-Wide'}</div>
                                    <div class="text-[11px] text-slate-500 font-medium mt-0.5">${issue.tower_block || ''}</div>
                                </div>

                                <!-- Reported By -->
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Reported By</span>
                                    <div class="text-xs font-semibold text-slate-800">${issue.reported_by || 'Site Engineer'}</div>
                                    <div class="text-[10px] text-slate-400 mt-0.5">${issue.trade_agency || 'General'}</div>
                                </div>

                                <!-- Date Logged -->
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Date Logged</span>
                                    <div class="text-xs font-semibold text-slate-700">${dateFmt}</div>
                                </div>

                                <!-- Priority -->
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Severity</span>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border ${priorityClass}">
                                        ${issue.priority || 'High'}
                                    </span>
                                </div>
                            </div>

                            <!-- Description Box -->
                            <div class="bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 text-xs text-slate-700 leading-relaxed">
                                <span class="font-bold text-slate-900 mr-1.5">Blocker Details:</span>
                                <span>${issue.description || 'No description provided.'}</span>
                            </div>
                        </div>

                        <!-- Mark Resolved Action -->
                        <div class="w-full md:w-auto flex justify-end md:pl-4 md:border-l border-slate-200 pt-3 md:pt-0">
                            <button type="button" 
                                    onclick="resolveIssue('${issue.id}', this)" 
                                    class="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-600/20 transition whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer">
                                <span>✓</span>
                                <span>Mark Resolved</span>
                            </button>
                        </div>
                    </div>
                `;
            });

            floorGroup.innerHTML = `
                <div class="bg-red-50/80 px-4 py-3 border-b border-red-200/80 flex items-center justify-between">
                    <h3 class="font-bold text-red-900 flex items-center gap-2 tracking-wide text-xs uppercase">
                        <span>🚨</span>
                        <span>${floor}</span>
                    </h3>
                    <span class="bg-red-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                        ${floorIssues.length} Active Blocker${floorIssues.length === 1 ? '' : 's'}
                    </span>
                </div>
                <div>${issuesRowsHtml}</div>
            `;

            logsContainer.appendChild(floorGroup);
        }

    } catch (err) {
        console.error('[Issue Logs Load Failure]:', err);
        logsContainer.innerHTML = `
            <div class="p-5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to load site blockers</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
                <button onclick="loadIssueLogs()" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                    Retry Connection
                </button>
            </div>
        `;
    }
}

/**
 * 2. Mark Blocker as Resolved
 */
window.resolveIssue = async function(issueId, btnElement) {
    const confirmResolve = confirm("Confirm that this blocker has been physically inspected and resolved on site?");
    if (!confirmResolve) return;

    if (btnElement) {
        btnElement.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-white inline mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            Resolving...
        `;
        btnElement.disabled = true;
    }

    try {
        if (!client) throw new Error('Supabase client connection not active.');

        const today = new Date().toISOString().split('T')[0];

        const { error } = await client
            .from('issues_blockers')
            .update({ 
                status: 'Resolved',
                resolved_date: today 
            })
            .eq('id', issueId);

        if (error) throw error;

        // Reload the blocker board
        await loadIssueLogs();

    } catch (err) {
        console.error('[Issue Resolution Failure]:', err);
        alert('Failed to resolve issue: ' + (err.message || 'Database error'));
        if (btnElement) {
            btnElement.innerHTML = '✓ Mark Resolved';
            btnElement.disabled = false;
        }
    }
};

// Expose globally for HTML onclick hooks
window.loadIssueLogs = loadIssueLogs;

// Initial Load
document.addEventListener('DOMContentLoaded', loadIssueLogs);