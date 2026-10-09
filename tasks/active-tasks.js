const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const taskContainer = document.getElementById('active-tasks-container');

async function loadActiveTasks() {
    try {
        // Fetch tasks from Supabase that are NOT completed
        const { data: tasks, error } = await supabaseClient
            .from('civil_tasks')
            .select('*')
            .neq('status', 'Completed')
            .order('floor_level', { ascending: true });

        if (error) throw error;

        // Clear loading message
        taskContainer.innerHTML = '';

        if (tasks.length === 0) {
            taskContainer.innerHTML = `<div class="text-center py-10 text-gray-500">No active tasks found.</div>`;
            return;
        }

        // Render each task as a clean, styled row
        tasks.forEach(task => {
            const statusColor = task.status === 'Ready for QC' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
            
            const taskElement = document.createElement('div');
            taskElement.className = "bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between";
            
            taskElement.innerHTML = `
                <div class="flex-1 grid grid-cols-4 gap-4 items-center">
                    <div>
                        <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Zone / ID</span>
                        <div class="font-semibold text-brand-navy text-sm">${task.zone_id}</div>
                        <div class="text-xs text-gray-500 bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">${task.tower_block} • ${task.floor_level}</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Category</span>
                        <div class="text-sm font-medium text-gray-700">${task.category}</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Agency</span>
                        <div class="text-sm font-bold text-brand-amber">${task.assigned_agency || 'Unassigned'}</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Live Status</span>
                        <span class="text-xs font-semibold px-3 py-1 rounded-full ${statusColor}">
                            ${task.status}
                        </span>
                    </div>
                </div>
                <div class="ml-4 pl-4 border-l">
                    <button class="flex items-center gap-2 text-sm text-brand-navy hover:text-blue-600 font-medium transition border border-gray-200 hover:border-blue-300 rounded-md px-4 py-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Upload Photo
                    </button>
                </div>
            `;
            
            taskContainer.appendChild(taskElement);
        });

    } catch (err) {
        console.error("Error loading tasks:", err);
        taskContainer.innerHTML = `<div class="text-red-500 font-medium p-4 bg-red-50 rounded-lg">Failed to load tasks: ${err.message}</div>`;
    }
}

// Load data immediately on page load
document.addEventListener('DOMContentLoaded', loadActiveTasks);