// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('logTaskForm').addEventListener('submit', async function(e) {
    e.preventDefault(); // Prevent page refresh

    const submitBtn = this.querySelector('button[type="submit"]');
    const feedbackBox = document.getElementById('form-feedback');
    
    // UI Loading State
    submitBtn.innerHTML = `Saving...`;
    submitBtn.disabled = true;

    // 1. Gather all data from the form
    const taskData = {
        project_name: document.getElementById('project_name').value,
        tower_block: document.getElementById('tower_block').value,
        floor_level: document.getElementById('floor_level').value,
        zone_id: document.getElementById('zone_id').value,
        category: document.getElementById('category').value,
        assigned_agency: document.getElementById('assigned_agency').value,
        expected_completion_date: document.getElementById('expected_completion_date').value,
        assigned_date: new Date().toISOString().split('T')[0], // Automatically sets today's date
        status: 'Not Started'
    };

    try {
        // 2. Insert data into Supabase
        const { error } = await supabaseClient
            .from('civil_tasks')
            .insert([taskData]);

        if (error) throw error;

        // 3. Success UI Feedback
        feedbackBox.className = "p-4 rounded-lg text-sm font-medium mt-4 bg-green-100 text-green-800 border border-green-200 block";
        feedbackBox.innerText = `Task successfully assigned to ${taskData.zone_id}!`;
        
        // Reset the form for the next task
        this.reset();

    } catch (err) {
        // 4. Error UI Feedback
        feedbackBox.className = "p-4 rounded-lg text-sm font-medium mt-4 bg-red-100 text-red-800 border border-red-200 block";
        feedbackBox.innerText = `Error: ${err.message}`;
        console.error("Insert Error:", err);
    } finally {
        // Restore button state
        submitBtn.innerHTML = `Assign Task to Zone`;
        submitBtn.disabled = false;
        
        // Hide feedback message after 5 seconds
        setTimeout(() => { feedbackBox.classList.add('hidden'); }, 5000);
    }
});