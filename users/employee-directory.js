import { supabase } from '../config.js';

const tableBody = document.getElementById('staff-table-body');
const staffProjectSelect = document.getElementById('staff_project');
const addStaffForm = document.getElementById('addStaffForm');

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadProjectOptions(),
        loadDirectory()
    ]);

    setupEventDelegation();
});

// ==========================================
// 1. DYNAMIC PROJECT OPTIONS POPULATION
// ==========================================
async function loadProjectOptions() {
    if (!staffProjectSelect) return;

    try {
        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, project_name')
            .order('project_name', { ascending: true });

        if (error) throw error;

        // Reset and populate options
        staffProjectSelect.innerHTML = `
            <option value="All Projects">All Projects (Global)</option>
        `;

        (projects || []).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.project_name;
            opt.textContent = p.project_name;
            staffProjectSelect.appendChild(opt);
        });
    } catch (err) {
        console.warn('Could not fetch project list for staff dropdown:', err);
    }
}

// ==========================================
// 2. DIRECTORY DATA FETCHING & RENDERING
// ==========================================
async function loadDirectory() {
    if (!tableBody) return;

    try {
        const { data: users, error } = await supabase
            .from('user_roles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!users || users.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-gray-400 font-medium">
                        No employee credentials or roles found in the directory.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = users.map(user => {
            const role = user.role || 'Staff';
            let roleStyle = "bg-blue-100 text-blue-800";

            if (role === 'Owner') {
                roleStyle = "bg-amber-100 text-amber-900 font-bold border border-amber-200";
            } else if (role.includes('Engineer') || role.includes('Manager') || role.includes('Head')) {
                roleStyle = "bg-emerald-100 text-emerald-800";
            } else if (role.includes('Safety') || role.includes('QA/QC')) {
                roleStyle = "bg-purple-100 text-purple-800";
            } else if (role.includes('Supervisor') || role.includes('Store')) {
                roleStyle = "bg-cyan-100 text-cyan-800";
            }

            const initial = (user.display_name || user.username || 'U').charAt(0).toUpperCase();
            const isProtected = (role === 'Owner');

            return `
                <tr class="hover:bg-gray-50/80 transition" data-id="${user.id}">
                    <td class="p-4 font-semibold text-gray-800 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-inner">
                            ${initial}
                        </div>
                        <span>${escapeHtml(user.display_name || 'N/A')}</span>
                    </td>
                    <td class="p-4 text-gray-600 font-medium">@${escapeHtml(user.username || '')}</td>
                    <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-semibold ${roleStyle}">${escapeHtml(role)}</span></td>
                    <td class="p-4 text-gray-500 text-xs font-semibold">${escapeHtml(user.assigned_project || 'Global')}</td>
                    <td class="p-4 text-center">
                        ${!isProtected 
                            ? `<button type="button" class="btn-revoke text-red-500 hover:text-red-700 text-xs font-bold transition px-2 py-1 rounded hover:bg-red-50" data-id="${user.id}" data-name="${escapeHtml(user.display_name || user.username)}">Revoke</button>` 
                            : '<span class="text-gray-300 text-xs font-semibold uppercase tracking-wider">Protected</span>'
                        }
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Error loading employee directory:", err);
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-6 text-center text-red-500 font-medium text-xs">
                    Failed to load directory data: ${escapeHtml(err.message)}
                </td>
            </tr>
        `;
    }
}

// ==========================================
// 3. FORM SUBMISSION
// ==========================================
if (addStaffForm) {
    addStaffForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = this.querySelector('button[type="submit"]');
        const feedback = document.getElementById('form-feedback');
        const originalText = btn.innerHTML;

        btn.innerText = 'Adding...';
        btn.disabled = true;

        const newStaff = {
            username: document.getElementById('staff_username').value.trim().toLowerCase(),
            display_name: document.getElementById('staff_name').value.trim(),
            role: document.getElementById('staff_role').value,
            assigned_project: staffProjectSelect ? staffProjectSelect.value : 'All Projects'
        };

        try {
            const { error } = await supabase.from('user_roles').insert([newStaff]);
            if (error) throw error;

            if (feedback) {
                feedback.className = "p-3 rounded-lg text-sm text-center font-medium mt-2 bg-emerald-50 text-emerald-700 border border-emerald-200 block";
                feedback.innerText = `${newStaff.display_name} added to directory successfully!`;
            }

            showToast(`${newStaff.display_name} assigned as ${newStaff.role}`, 'success');
            this.reset();
            await loadDirectory();

        } catch (err) {
            console.error('Error adding staff member:', err);
            if (feedback) {
                feedback.className = "p-3 rounded-lg text-sm text-center font-medium mt-2 bg-red-50 text-red-700 border border-red-200 block";
                feedback.innerText = `Error: ${err.message}`;
            }
            showToast(err.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
            if (feedback) {
                setTimeout(() => feedback.classList.add('hidden'), 4000);
            }
        }
    });
}

// ==========================================
// 4. ACTION DELEGATION (REVOKE)
// ==========================================
function setupEventDelegation() {
    if (!tableBody) return;

    tableBody.addEventListener('click', async (e) => {
        const revokeBtn = e.target.closest('.btn-revoke');
        if (!revokeBtn) return;

        const id = revokeBtn.dataset.id;
        const name = revokeBtn.dataset.name || 'this employee';

        if (!confirm(`Are you sure you want to revoke access credentials for ${name}?`)) {
            return;
        }

        try {
            revokeBtn.disabled = true;
            revokeBtn.textContent = 'Revoking...';

            const { error } = await supabase.from('user_roles').delete().eq('id', id);
            if (error) throw error;

            showToast(`Revoked access for ${name}`, 'success');
            await loadDirectory();
        } catch (err) {
            console.error('Error revoking staff role:', err);
            showToast('Failed to revoke: ' + err.message, 'error');
            revokeBtn.disabled = false;
            revokeBtn.textContent = 'Revoke';
        }
    });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'success' 
        ? 'bg-slate-900/95 border-emerald-500 text-white' 
        : type === 'error'
        ? 'bg-slate-900/95 border-rose-500 text-white'
        : 'bg-slate-900/95 border-amber-500 text-white';

    const dotClass = type === 'success' 
        ? 'bg-emerald-400' 
        : type === 'error'
        ? 'bg-rose-400'
        : 'bg-amber-400';

    toast.className = `glass-card pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0 ${bgClass}`;
    toast.innerHTML = `
        <span class="w-2 h-2 rounded-full shrink-0 ${dotClass}"></span>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}