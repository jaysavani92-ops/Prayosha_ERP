const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const tableBody = document.getElementById('staff-table-body');

async function loadDirectory() {
    try {
        const { data: users, error } = await supabaseClient
            .from('user_roles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        tableBody.innerHTML = '';

        users.forEach(user => {
            // Styling badges based on roles
            let roleStyle = "bg-blue-100 text-blue-800";
            if (user.role === 'Owner') roleStyle = "bg-brand-amber text-brand-navy font-bold";
            if (user.role.includes('Engineer') || user.role.includes('Manager')) roleStyle = "bg-green-100 text-green-800";
            if (user.role === 'Safety Officer' || user.role === 'QA/QC Engineer') roleStyle = "bg-purple-100 text-purple-800";

            const row = document.createElement('tr');
            row.className = "hover:bg-gray-50 transition";
            row.innerHTML = `
                <td class="p-4 font-semibold text-gray-800 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-xs">
                        ${user.display_name.charAt(0).toUpperCase()}
                    </div>
                    ${user.display_name}
                </td>
                <td class="p-4 text-gray-600 font-medium">@${user.username}</td>
                <td class="p-4"><span class="px-3 py-1 rounded-full text-xs ${roleStyle}">${user.role}</span></td>
                <td class="p-4 text-gray-500 text-xs font-semibold">${user.assigned_project}</td>
                <td class="p-4 text-center">
                    ${user.role !== 'Owner' ? `<button onclick="removeStaff('${user.id}')" class="text-red-500 hover:text-red-700 text-xs font-bold transition">Revoke</button>` : '<span class="text-gray-300 text-xs">Protected</span>'}
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error loading directory:", err);
        tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500 font-medium">Error loading data.</td></tr>`;
    }
}

document.getElementById('addStaffForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('button');
    const feedback = document.getElementById('form-feedback');
    
    btn.innerText = 'Adding...';
    btn.disabled = true;

    const newStaff = {
        username: document.getElementById('staff_username').value.trim().toLowerCase(),
        display_name: document.getElementById('staff_name').value.trim(),
        role: document.getElementById('staff_role').value,
        assigned_project: document.getElementById('staff_project').value
    };

    try {
        const { error } = await supabaseClient.from('user_roles').insert([newStaff]);
        if (error) throw error;

        feedback.className = "p-3 rounded text-sm text-center font-medium mt-2 bg-green-100 text-green-700 block";
        feedback.innerText = `${newStaff.display_name} added successfully!`;
        this.reset();
        loadDirectory(); // Refresh table

    } catch (err) {
        feedback.className = "p-3 rounded text-sm text-center font-medium mt-2 bg-red-100 text-red-700 block";
        feedback.innerText = `Error: ${err.message}`;
    } finally {
        btn.innerText = 'Add to Directory';
        btn.disabled = false;
        setTimeout(() => feedback.classList.add('hidden'), 4000);
    }
});

window.removeStaff = async function(id) {
    if(!confirm("Revoke access for this employee?")) return;
    try {
        await supabaseClient.from('user_roles').delete().eq('id', id);
        loadDirectory();
    } catch (err) {
        alert("Failed to remove: " + err.message);
    }
};

document.addEventListener('DOMContentLoaded', loadDirectory);