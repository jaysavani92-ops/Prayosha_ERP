const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('raiseIssueForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const feedbackBox = document.getElementById('issue-feedback');
    
    submitBtn.innerHTML = `Submitting...`;
    submitBtn.disabled = true;

    // Gather Issue Data
    const issueData = {
        project_name: document.getElementById('project_name').value,
        tower_block: document.getElementById('tower_block').value,
        floor_level: document.getElementById('floor_level').value,
        zone_id: document.getElementById('zone_id').value,
        description: document.getElementById('description').value,
        reported_by: document.getElementById('reported_by').value,
        status: 'Open',
        priority: 'Critical'
    };

    try {
        // Insert into issues_blockers table
        const { error } = await supabaseClient
            .from('issues_blockers')
            .insert([issueData]);

        if (error) throw error;

        // Success UI
        feedbackBox.className = "p-4 rounded-lg text-sm font-medium mt-4 bg-green-100 text-green-800 border border-green-200 block";
        feedbackBox.innerText = `Critical issue successfully logged for Zone: ${issueData.zone_id}`;
        
        // Reset specific fields (keep project/tower/floor for speed of entry)
        document.getElementById('zone_id').value = '';
        document.getElementById('description').value = '';

    } catch (err) {
        // Error UI
        feedbackBox.className = "p-4 rounded-lg text-sm font-medium mt-4 bg-red-100 text-red-800 border border-red-200 block";
        feedbackBox.innerText = `Error logging issue: ${err.message}`;
        console.error("Insert Error:", err);
    } finally {
        submitBtn.innerHTML = `Submit Critical Issue`;
        submitBtn.disabled = false;
        setTimeout(() => { feedbackBox.classList.add('hidden'); }, 5000);
    }
});