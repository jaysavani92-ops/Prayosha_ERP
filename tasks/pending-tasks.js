const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const taskContainer = document.getElementById('pending-tasks-container');

async function loadPendingTasks() {
    try {
        // Fetch tasks strictly with 'Not Started' status
        const { data: tasks, error } = await supabaseClient
            .from('civil_tasks')
            .select('*')
            .eq('status', 'Not Started')
            .order('created_at', { ascending: false });

        if (error) throw error;

        taskContainer.innerHTML = '';

        if (tasks.length === 0) {
            taskContainer.innerHTML = `
                <div class="text-center py-10 bg-gray-50 rounded-lg border border-gray-200">
                    <span class="text-gray-600 font-medium">All logged tasks have been started.</span>
                </div>`;
            return;
        }

        // Group the tasks by Floor Level
        const groupedTasks = tasks.reduce((acc, task) => {
            const floor = task.floor_level || 'Unknown Floor';
            if (!acc[floor]) acc[floor] = [];
            acc[floor].push(task);
            return acc;
        }, {});

        // Generate HTML for each Floor Group
        for (const [floor, floorTasks] of Object.entries(groupedTasks)) {
            
            // Create the Floor Header
            const floorGroup = document.createElement('div');
            floorGroup.className = "border border-blue-100 rounded-lg overflow-hidden shadow-sm";
            
            let tasksHtml = `
                <div class="bg-blue-50/50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                    <h3 class="font-bold text-brand-navy flex items-center gap-2 uppercase tracking-wide text-sm">
                        <svg class="w-4 h-4 text-brand-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        ${floor}
                    </h3>
                    <span class="bg-white text-blue-800 text-xs font-bold px-2 py-1 rounded shadow-sm">${floorTasks.length} Pending</span>
                </div>
                <div class="divide-y divide-gray-100">
            `;

            // Loop through tasks on this specific floor
            floorTasks.forEach(task => {
                tasksHtml += `
                    <div class="p-4 bg-white flex flex-col md:flex-row items-center justify-between gap-4 hover:bg-gray-50 transition">
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 w-full items-center">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Zone / ID</span>
                                <div class="font-semibold text-gray-800 text-sm">${task.zone_id}</div>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Category</span>
                                <div class="text-sm font-medium text-gray-700">${task.category}</div>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Agency</span>
                                <div class="text-sm font-bold ${task.assigned_agency ? 'text-brand-amber' : 'text-red-500'}">
                                    ${task.assigned_agency || 'Unassigned'}
                                </div>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Created Date</span>
                                <div class="text-sm text-gray-600">${new Date(task.created_at).toLocaleDateString('en-GB')}</div>
                            </div>
                        </div>
                        <div class="w-full md:w-auto text-right">
                            <button onclick="markAsOngoing('${task.id}')" class="bg-brand-navy hover:bg-[#152a45] text-white text-xs font-semibold px-4 py-2 rounded shadow transition whitespace-nowrap">
                                Start Task
                            </button>
                        </div>
                    </div>
                `;
            });

            tasksHtml += `</div>`;
            floorGroup.innerHTML = tasksHtml;
            taskContainer.appendChild(floorGroup);
        }

    } catch (err) {
        console.error("Error loading pending tasks:", err);
        taskContainer.innerHTML = `<div class="text-red-500 font-medium p-4 bg-red-50 rounded-lg">Failed to load tasks: ${err.message}</div>`;
    }
}

// Function to transition task from 'Not Started' to 'On-going'
window.markAsOngoing = async function(taskId) {
    if (!confirm("Start this task now? It will move to the Active Tasks board.")) return;

    try {
        const { error } = await supabaseClient
            .from('civil_tasks')
            .update({ 
                status: 'On-going',
                started_date: new Date().toISOString().split('T')[0] 
            })
            .eq('id', taskId);

        if (error) throw error;
        
        // Reload the list to remove the started task
        loadPendingTasks();

    } catch (err) {
        alert("Error starting task: " + err.message);
    }
}

document.addEventListener('DOMContentLoaded', loadPendingTasks);