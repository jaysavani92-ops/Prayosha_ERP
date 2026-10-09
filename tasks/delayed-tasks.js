const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const taskContainer = document.getElementById('delayed-tasks-container');

async function loadDelayedTasks() {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    try {
        // Fetch tasks that are NOT completed AND expected date is less than today
        const { data: tasks, error } = await supabaseClient
            .from('civil_tasks')
            .select('*')
            .neq('status', 'Completed')
            .lt('expected_completion_date', today)
            .order('expected_completion_date', { ascending: true });

        if (error) throw error;

        taskContainer.innerHTML = '';

        if (tasks.length === 0) {
            taskContainer.innerHTML = `
                <div class="text-center py-10 bg-green-50 rounded-lg border border-green-100">
                    <span class="text-green-600 font-medium">Excellent! There are zero delayed tasks on site.</span>
                </div>`;
            return;
        }

        tasks.forEach(task => {
            // Calculate days overdue
            const expectedDate = new Date(task.expected_completion_date);
            const currentDate = new Date(today);
            const diffTime = Math.abs(currentDate - expectedDate);
            const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const taskElement = document.createElement('div');
            taskElement.className = "bg-red-50 border border-red-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4";
            
            taskElement.innerHTML = `
                <div class="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center w-full">
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-400 block mb-1">Zone / ID</span>
                        <div class="font-semibold text-brand-navy text-sm">${task.zone_id}</div>
                        <div class="text-xs text-gray-600 bg-white inline-block px-2 py-0.5 rounded border mt-1">${task.tower_block} • ${task.floor_level}</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-400 block mb-1">Agency</span>
                        <div class="text-sm font-bold text-brand-amber">${task.assigned_agency || 'Unassigned'}</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-400 block mb-1">Deadline</span>
                        <div class="text-sm font-medium text-gray-800">${task.expected_completion_date}</div>
                        <div class="text-xs font-bold text-red-600 mt-1">${daysOverdue} Days Overdue</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-red-400 block mb-1">Reason for Delay</span>
                        <input type="text" class="text-sm p-1.5 border border-red-200 rounded w-full bg-white focus:ring-1 focus:ring-red-400 outline-none delay-reason-input" 
                               placeholder="Enter reason..." 
                               value="${task.delayed_reason || ''}" 
                               data-id="${task.id}">
                    </div>
                </div>
                <div class="md:ml-4 md:pl-4 md:border-l border-red-200 w-full md:w-auto text-right">
                    <button onclick="updateDelayReason('${task.id}', this)" class="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded shadow transition">
                        Update Reason
                    </button>
                </div>
            `;
            
            taskContainer.appendChild(taskElement);
        });

    } catch (err) {
        console.error("Error loading delayed tasks:", err);
        taskContainer.innerHTML = `<div class="text-red-500 font-medium p-4 bg-red-100 rounded-lg">Failed to load tasks: ${err.message}</div>`;
    }
}

// Function to save the reason directly back to Supabase
window.updateDelayReason = async function(taskId, btnElement) {
    const row = btnElement.closest('.flex-col');
    const inputField = row.querySelector('.delay-reason-input');
    const newReason = inputField.value;

    btnElement.innerText = "Saving...";
    btnElement.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('civil_tasks')
            .update({ delayed_reason: newReason })
            .eq('id', taskId);

        if (error) throw error;
        
        btnElement.innerText = "Saved";
        btnElement.classList.replace('bg-red-600', 'bg-green-600');
        setTimeout(() => {
            btnElement.innerText = "Update Reason";
            btnElement.classList.replace('bg-green-600', 'bg-red-600');
            btnElement.disabled = false;
        }, 2000);

    } catch (err) {
        alert("Error saving reason: " + err.message);
        btnElement.innerText = "Update Reason";
        btnElement.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', loadDelayedTasks);