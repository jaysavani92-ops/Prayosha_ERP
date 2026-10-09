const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const timelineContainer = document.getElementById('timeline-container');
const zoneSummary = document.getElementById('zone-summary');

async function fetchZoneTimeline() {
    const searchZoneId = document.getElementById('search_zone_id').value.trim();
    
    if (!searchZoneId) {
        alert("Please enter a valid Zone ID.");
        return;
    }

    timelineContainer.innerHTML = `<div class="pl-8 py-10 text-gray-400 text-sm animate-pulse">Building timeline...</div>`;
    zoneSummary.classList.add('hidden');

    try {
        // Fetch all tasks for this exact Zone, ordered chronologically by created_at
        const { data: tasks, error } = await supabaseClient
            .from('civil_tasks')
            .select('*')
            .eq('zone_id', searchZoneId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (tasks.length === 0) {
            timelineContainer.innerHTML = `<div class="pl-8 py-10 text-red-500 font-medium">No tasks found for Zone ID: ${searchZoneId}</div>`;
            return;
        }

        // Calculate "Days Active" (From first task assignment to latest task completion/today)
        const earliestDate = new Date(Math.min(...tasks.map(t => new Date(t.created_at))));
        let latestDate = new Date(); // Default to today if tasks are still ongoing
        
        const allCompleted = tasks.every(t => t.status === 'Completed');
        if (allCompleted) {
            latestDate = new Date(Math.max(...tasks.map(t => new Date(t.completed_date))));
        }
        
        const diffTime = Math.abs(latestDate - earliestDate);
        const daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Populate Summary Header
        document.getElementById('summary-title').innerText = searchZoneId;
        document.getElementById('summary-location').innerText = `${tasks[0].project_name} • ${tasks[0].tower_block} • ${tasks[0].floor_level}`;
        document.getElementById('summary-days').innerText = daysActive === 0 ? 1 : daysActive;
        zoneSummary.classList.remove('hidden');

        // Build Timeline
        timelineContainer.innerHTML = '';

        tasks.forEach((task, index) => {
            
            // Determine Status Color logic for the timeline dot and badge
            let statusColor = "bg-blue-100 text-blue-700";
            let dotColor = "bg-blue-500";
            
            if (task.status === 'Completed') {
                statusColor = "bg-green-100 text-green-700";
                dotColor = "bg-green-500";
            } else if (task.status === 'Not Started') {
                statusColor = "bg-gray-100 text-gray-700";
                dotColor = "bg-gray-400";
            } else if (task.status === 'Ready for QC') {
                statusColor = "bg-purple-100 text-purple-700";
                dotColor = "bg-purple-500";
            }

            const startDateFmt = task.assigned_date ? new Date(task.assigned_date).toLocaleDateString('en-GB') : 'Pending';
            const endDateFmt = task.completed_date ? new Date(task.completed_date).toLocaleDateString('en-GB') : '-';

            const timelineNode = document.createElement('div');
            timelineNode.className = "relative pl-8";
            
            // The HTML for the vertical line and dot
            timelineNode.innerHTML = `
                <!-- Timeline Dot -->
                <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full ${dotColor} border-2 border-white shadow"></div>
                
                <!-- Task Card -->
                <div class="bg-white border border-gray-100 rounded-lg shadow-sm p-5 hover:shadow-md transition">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h4 class="text-lg font-bold text-brand-navy">${task.category}</h4>
                            <div class="text-xs text-gray-400 mt-1 uppercase tracking-wider">Task ID: ${task.id.split('-')[0]}</div>
                        </div>
                        <span class="text-xs font-bold px-3 py-1 rounded-full ${statusColor}">${task.status}</span>
                    </div>
                    
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50 p-3 rounded border border-gray-100">
                        <div>
                            <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Agency</span>
                            <div class="text-sm font-semibold text-brand-amber">${task.assigned_agency || 'Unassigned'}</div>
                        </div>
                        <div>
                            <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Assigned Date</span>
                            <div class="text-sm text-gray-700 flex items-center gap-1">
                                <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                ${startDateFmt}
                            </div>
                        </div>
                        <div>
                            <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Completed Date</span>
                            <div class="text-sm text-gray-700 flex items-center gap-1">
                                <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                ${endDateFmt}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            timelineContainer.appendChild(timelineNode);
        });

    } catch (err) {
        console.error("Error loading timeline:", err);
        timelineContainer.innerHTML = `<div class="pl-8 py-10 text-red-500 font-medium">Failed to load timeline: ${err.message}</div>`;
    }
}