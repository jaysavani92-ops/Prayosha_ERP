const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const logsContainer = document.getElementById('issue-logs-container');

async function loadIssueLogs() {
    try {
        // Fetch only Open issues, newest first
        const { data: issues, error } = await supabaseClient
            .from('issues_blockers')
            .select('*')
            .eq('status', 'Open')
            .order('created_at', { ascending: false });

        if (error) throw error;

        logsContainer.innerHTML = '';

        if (issues.length === 0) {
            logsContainer.innerHTML = `
                <div class="text-center py-10 bg-green-50 rounded-lg border border-green-200">
                    <span class="text-green-700 font-medium">All clear! There are no active blockers on site.</span>
                </div>`;
            return;
        }

        // Group the issues by Floor Level
        const groupedIssues = issues.reduce((acc, issue) => {
            const floor = issue.floor_level || 'Unknown Floor';
            if (!acc[floor]) acc[floor] = [];
            acc[floor].push(issue);
            return acc;
        }, {});

        // Generate HTML for each Floor Group
        for (const [floor, floorIssues] of Object.entries(groupedIssues)) {
            
            const floorGroup = document.createElement('div');
            floorGroup.className = "border border-red-200 rounded-lg overflow-hidden shadow-sm";
            
            let issuesHtml = `
                <div class="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center justify-between">
                    <h3 class="font-bold text-red-800 flex items-center gap-2 uppercase tracking-wide text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        ${floor}
                    </h3>
                    <span class="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded shadow-sm">${floorIssues.length} Active Issue(s)</span>
                </div>
                <div class="divide-y divide-red-100">
            `;

            floorIssues.forEach(issue => {
                const dateFmt = new Date(issue.created_at).toLocaleDateString('en-GB');
                
                issuesHtml += `
                    <div class="p-4 bg-white flex flex-col md:flex-row items-center justify-between gap-4 hover:bg-red-50/50 transition">
                        <div class="w-full">
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 items-start mb-3">
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Zone / ID</span>
                                    <div class="font-bold text-brand-navy text-sm">${issue.zone_id}</div>
                                </div>
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Reported By</span>
                                    <div class="text-sm font-medium text-gray-700">${issue.reported_by}</div>
                                </div>
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Date Logged</span>
                                    <div class="text-sm text-gray-600">${dateFmt}</div>
                                </div>
                                <div>
                                    <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Priority</span>
                                    <span class="text-xs font-bold px-2 py-1 bg-red-100 text-red-700 rounded">${issue.priority}</span>
                                </div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded border border-gray-200 text-sm text-gray-700">
                                <span class="font-bold text-gray-500 mr-2">Description:</span> ${issue.description}
                            </div>
                        </div>
                        <div class="w-full md:w-auto text-right md:ml-4 border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-4">
                            <button onclick="resolveIssue('${issue.id}')" class="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-6 py-3 rounded shadow transition whitespace-nowrap">
                                Mark Resolved
                            </button>
                        </div>
                    </div>
                `;
            });

            issuesHtml += `</div>`;
            floorGroup.innerHTML = issuesHtml;
            logsContainer.appendChild(floorGroup);
        }

    } catch (err) {
        console.error("Error loading issues:", err);
        logsContainer.innerHTML = `<div class="text-red-500 font-medium p-4 bg-red-50 rounded-lg">Failed to load issues: ${err.message}</div>`;
    }
}

// Function to transition issue from 'Open' to 'Resolved'
window.resolveIssue = async function(issueId) {
    if (!confirm("Are you sure this blocker has been physically resolved on site?")) return;

    try {
        const { error } = await supabaseClient
            .from('issues_blockers')
            .update({ status: 'Resolved' })
            .eq('id', issueId);

        if (error) throw error;
        
        // Reload the list to remove the resolved issue
        loadIssueLogs();

    } catch (err) {
        alert("Error resolving issue: " + err.message);
    }
}

document.addEventListener('DOMContentLoaded', loadIssueLogs);