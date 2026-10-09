const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const historyContainer = document.getElementById('tasks-history-container');

async function loadTasksHistory() {
    try {
        // Fetch strictly completed tasks, ordered by most recently completed
        const { data: tasks, error } = await supabaseClient
            .from('civil_tasks')
            .select('*')
            .eq('status', 'Completed')
            .order('completed_date', { ascending: false });

        if (error) throw error;

        historyContainer.innerHTML = '';

        if (tasks.length === 0) {
            historyContainer.innerHTML = `
                <div class="text-center py-10 bg-gray-50 rounded-lg border border-gray-200">
                    <span class="text-gray-500 font-medium">No completed tasks found in the archive.</span>
                </div>`;
            return;
        }

        // Group tasks by Floor Level
        const groupedTasks = tasks.reduce((acc, task) => {
            const floor = task.floor_level || 'Unknown Floor';
            if (!acc[floor]) acc[floor] = [];
            acc[floor].push(task);
            return acc;
        }, {});

        // Generate HTML for each Floor Group
        for (const [floor, floorTasks] of Object.entries(groupedTasks)) {
            
            const floorGroup = document.createElement('div');
            floorGroup.className = "border border-green-100 rounded-lg overflow-hidden shadow-sm";
            
            let tasksHtml = `
                <div class="bg-green-50/50 px-4 py-3 border-b border-green-100 flex items-center justify-between">
                    <h3 class="font-bold text-brand-navy flex items-center gap-2 uppercase tracking-wide text-sm">
                        <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        ${floor}
                    </h3>
                    <span class="bg-white text-green-800 text-xs font-bold px-2 py-1 rounded shadow-sm">${floorTasks.length} Completed</span>
                </div>
                <div class="divide-y divide-gray-100">
            `;

            floorTasks.forEach(task => {
                // Calculate Days to Complete
                let daysDuration = "-";
                if (task.assigned_date && task.completed_date) {
                    const start = new Date(task.assigned_date);
                    const end = new Date(task.completed_date);
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    daysDuration = diffDays === 0 ? "Same Day" : `${diffDays} Days`;
                }

                // Format Dates cleanly
                const assignedFmt = task.assigned_date ? new Date(task.assigned_date).toLocaleDateString('en-GB') : '-';
                const completedFmt = task.completed_date ? new Date(task.completed_date).toLocaleDateString('en-GB') : '-';

                tasksHtml += `
                    <div class="p-4 bg-white flex items-center justify-between gap-4 hover:bg-gray-50 transition">
                        <div class="grid grid-cols-5 gap-4 w-full items-center">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Zone / ID</span>
                                <div class="font-semibold text-gray-800 text-sm">${task.zone_id}</div>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Agency</span>
                                <div class="text-sm font-bold text-brand-amber">${task.assigned_agency || '-'}</div>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Assigned</span>
                                <div class="text-sm text-gray-600">${assignedFmt}</div>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Completed</span>
                                <div class="text-sm text-gray-600">${completedFmt}</div>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block mb-1">Duration</span>
                                <div class="text-xs font-bold text-green-700 bg-green-100 inline-block px-2 py-1 rounded">
                                    ${daysDuration}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });

            tasksHtml += `</div>`;
            floorGroup.innerHTML = tasksHtml;
            historyContainer.appendChild(floorGroup);
        }

    } catch (err) {
        console.error("Error loading history:", err);
        historyContainer.innerHTML = `<div class="text-red-500 font-medium p-4 bg-red-50 rounded-lg">Failed to load history: ${err.message}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', loadTasksHistory);