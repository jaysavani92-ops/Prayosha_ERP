/**
 * Prayosha ERP - Employee Directory & Roles Controller
 * File: /users/employee-directory.js
 * 
 * Features:
 * 1. Username & 4-Digit PIN Provisioning: Synthesizes corporate credentials matching login.js.
 * 2. Role-Based Access Guard: Restricts account creation, editing, and revocation to Owner & Construction Head.
 * 3. Dynamic Authorization Roles: Loads and saves custom roles to dropdown_values in Supabase.
 * 4. Neutral / Onboarding Site Allocation: Enables adding employees without assigning an active project.
 * 5. Staff Profile Editor Modal: Updates clearance roles, assigned projects, and resets access PINs.
 */

import { supabase } from '../config.js';

// DOM Elements - Primary View
const tableBody = document.getElementById('staff-table-body');
const staffUsernameInput = document.getElementById('staff_username');
const staffPinInput = document.getElementById('staff_pin');
const staffNameInput = document.getElementById('staff_name');
const staffRoleSelect = document.getElementById('staff_role');
const staffProjectSelect = document.getElementById('staff_project');
const addStaffForm = document.getElementById('addStaffForm');
const formContainer = document.getElementById('formContainer');
const adminRestrictionNotice = document.getElementById('adminRestrictionNotice');
const userClearanceBadge = document.getElementById('userClearanceBadge');
const currentUserRoleLabel = document.getElementById('currentUserRoleLabel');

// DOM Elements - Edit Modal
const editStaffModal = document.getElementById('editStaffModal');
const closeEditModalBtn = document.getElementById('closeEditModalBtn');
const cancelEditModalBtn = document.getElementById('cancelEditModalBtn');
const editStaffForm = document.getElementById('editStaffForm');
const editUserIdInput = document.getElementById('edit_user_id');
const editUsernameInput = document.getElementById('edit_username');
const editNameInput = document.getElementById('edit_name');
const editRoleSelect = document.getElementById('edit_role');
const editProjectSelect = document.getElementById('edit_project');
const editPinInput = document.getElementById('edit_pin');
const saveEditSubmitBtn = document.getElementById('saveEditSubmitBtn');

// State Cache
let activeUsersCache = [];
let customRolesCache = [];
let availableProjectsCache = [];
let isCurrentUserAdmin = false;

// Standard Built-In Roles
const DEFAULT_ROLES = [
    'Project Manager',
    'Construction Head',
    'Site Engineer',
    'Site Supervisor',
    'QA/QC Engineer',
    'Safety Officer',
    'Store Keeper',
    'Accountant',
    'Procurement Manager',
    'External Agency'
];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verify and Enforce Owner & Construction Head Access
    verifyAdminPermissions();

    // 2. Load Core Data
    await Promise.all([
        loadCustomRoles(),
        loadProjectOptions(),
        loadDirectory()
    ]);

    // 3. Register Event Listeners
    setupRoleDropdownListener();
    setupEventDelegation();
    setupEditModalEvents();
});

// ==========================================
// 1. ROLE-BASED ACCESS CONTROL GUARD
// ==========================================
function verifyAdminPermissions() {
    const rawRole = (localStorage.getItem('userRole') || '').trim();
    const normalizedRole = rawRole.toLowerCase();

    // Allowed: Owner and Construction Head (including Construction Head / GM)
    isCurrentUserAdmin = normalizedRole.includes('owner') || normalizedRole.includes('construction head');

    if (userClearanceBadge && currentUserRoleLabel) {
        userClearanceBadge.classList.remove('hidden');
        currentUserRoleLabel.textContent = rawRole || 'Site Member';
    }

    if (!isCurrentUserAdmin) {
        // Hide Admin Form and Display Restrictive Notice
        if (formContainer) formContainer.classList.add('hidden');
        if (adminRestrictionNotice) adminRestrictionNotice.classList.remove('hidden');
    } else {
        if (formContainer) formContainer.classList.remove('hidden');
        if (adminRestrictionNotice) adminRestrictionNotice.classList.add('hidden');
    }
}

// ==========================================
// 2. DYNAMIC ROLES & PROJECT OPTIONS
// ==========================================
async function loadCustomRoles() {
    customRolesCache = [...DEFAULT_ROLES];

    try {
        const { data: dbRoles, error } = await supabase
            .from('dropdown_values')
            .select('value')
            .eq('category', 'authorization_role');

        if (!error && dbRoles) {
            dbRoles.forEach(r => {
                if (r.value && !customRolesCache.includes(r.value)) {
                    customRolesCache.push(r.value);
                }
            });
        }
    } catch (err) {
        console.warn('Could not load custom roles from dropdown_values:', err);
    }

    renderRoleOptions();
}

function renderRoleOptions() {
    if (staffRoleSelect) {
        const currentVal = staffRoleSelect.value;
        staffRoleSelect.innerHTML = '<option value="">-- Select Role --</option>';

        customRolesCache.forEach(roleName => {
            const opt = document.createElement('option');
            opt.value = roleName;
            opt.textContent = roleName;
            staffRoleSelect.appendChild(opt);
        });

        // Append "+ Add New Role" Action Option
        const addOpt = document.createElement('option');
        addOpt.value = '_ADD_NEW_';
        addOpt.className = 'font-bold text-brand-navy bg-amber-50';
        addOpt.textContent = '+ Add New Custom Role...';
        staffRoleSelect.appendChild(addOpt);

        if (currentVal && currentVal !== '_ADD_NEW_') {
            staffRoleSelect.value = currentVal;
        }
    }

    if (editRoleSelect) {
        const currentEditVal = editRoleSelect.value;
        editRoleSelect.innerHTML = '<option value="">-- Select Role --</option>';

        customRolesCache.forEach(roleName => {
            const opt = document.createElement('option');
            opt.value = roleName;
            opt.textContent = roleName;
            editRoleSelect.appendChild(opt);
        });

        if (currentEditVal) editRoleSelect.value = currentEditVal;
    }
}

function setupRoleDropdownListener() {
    if (!staffRoleSelect) return;

    staffRoleSelect.addEventListener('change', async (e) => {
        if (e.target.value === '_ADD_NEW_') {
            const newRoleName = prompt('Enter the title for the new authorization role:');

            if (newRoleName && newRoleName.trim() !== '') {
                const cleanedRole = newRoleName.trim();

                if (!customRolesCache.includes(cleanedRole)) {
                    customRolesCache.push(cleanedRole);
                    renderRoleOptions();
                    staffRoleSelect.value = cleanedRole;

                    try {
                        await supabase
                            .from('dropdown_values')
                            .insert([{ category: 'authorization_role', value: cleanedRole }]);
                        showToast(`Saved new role "${cleanedRole}" to options`, 'success');
                    } catch (err) {
                        console.warn('Could not persist new role to dropdown_values:', err);
                    }
                } else {
                    staffRoleSelect.value = cleanedRole;
                }
            } else {
                staffRoleSelect.selectedIndex = 0;
            }
        }
    });
}

async function loadProjectOptions() {
    try {
        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true });

        if (error) throw error;

        availableProjectsCache = projects || [];

        // Populate Main Add Form Select
        if (staffProjectSelect) {
            staffProjectSelect.innerHTML = `
                <option value="Unassigned" selected>-- Unassigned / Onboarding (Neutral) --</option>
                <option value="All Projects">All Projects (Global)</option>
            `;

            availableProjectsCache.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.project_name;
                opt.textContent = p.project_code ? `[${p.project_code}] ${p.project_name}` : p.project_name;
                staffProjectSelect.appendChild(opt);
            });
        }

        // Populate Edit Modal Select
        if (editProjectSelect) {
            editProjectSelect.innerHTML = `
                <option value="Unassigned">-- Unassigned / Onboarding (Neutral) --</option>
                <option value="All Projects">All Projects (Global)</option>
            `;

            availableProjectsCache.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.project_name;
                opt.textContent = p.project_code ? `[${p.project_code}] ${p.project_name}` : p.project_name;
                editProjectSelect.appendChild(opt);
            });
        }

    } catch (err) {
        console.warn('Could not fetch project list for staff dropdown:', err);
    }
}

// ==========================================
// 3. DIRECTORY DATA FETCHING & RENDERING
// ==========================================
async function loadDirectory() {
    if (!tableBody) return;

    try {
        const { data: users, error } = await supabase
            .from('user_roles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        activeUsersCache = users || [];

        if (activeUsersCache.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="p-8 text-center text-gray-400 font-medium">
                        No employee credentials or roles found in the directory.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = activeUsersCache.map(user => {
            const role = user.role || 'Staff';
            let roleStyle = "bg-blue-100 text-blue-800";

            if (role === 'Owner') {
                roleStyle = "bg-amber-100 text-amber-900 font-bold border border-amber-300";
            } else if (role.includes('Engineer') || role.includes('Manager') || role.includes('Head')) {
                roleStyle = "bg-emerald-100 text-emerald-800 font-semibold";
            } else if (role.includes('Safety') || role.includes('QA/QC')) {
                roleStyle = "bg-purple-100 text-purple-800 font-semibold";
            } else if (role.includes('Supervisor') || role.includes('Store')) {
                roleStyle = "bg-cyan-100 text-cyan-800 font-semibold";
            }

            const initial = (user.display_name || user.username || 'U').charAt(0).toUpperCase();
            const isProtected = (role === 'Owner');
            const projectDisplay = (user.assigned_project && user.assigned_project !== 'Unassigned') 
                ? user.assigned_project 
                : '<span class="text-amber-600 font-medium italic">Onboarding / Neutral</span>';

            let actionButtons = '';
            if (isProtected) {
                actionButtons = '<span class="text-gray-300 text-xs font-semibold uppercase tracking-wider">Protected</span>';
            } else if (isCurrentUserAdmin) {
                actionButtons = `
                    <div class="flex items-center justify-center gap-2">
                        <button type="button" class="btn-edit text-brand-navy hover:text-brand-navyDark text-xs font-bold transition px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200" data-id="${user.id}">
                            Edit
                        </button>
                        <button type="button" class="btn-revoke text-red-500 hover:text-red-700 text-xs font-bold transition px-2 py-1 rounded-lg hover:bg-red-50" data-id="${user.id}" data-name="${escapeHtml(user.display_name || user.username)}">
                            Revoke
                        </button>
                    </div>
                `;
            } else {
                actionButtons = '<span class="text-gray-400 text-xs font-medium">Read Only</span>';
            }

            return `
                <tr class="hover:bg-gray-50/80 transition" data-id="${user.id}">
                    <td class="p-4 font-semibold text-gray-800 flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-brand-navy/10 text-brand-navy flex items-center justify-center font-bold text-xs shadow-inner">
                            ${initial}
                        </div>
                        <div>
                            <span class="block">${escapeHtml(user.display_name || 'N/A')}</span>
                        </div>
                    </td>
                    <td class="p-4 text-gray-600 font-medium">@${escapeHtml(user.username || '')}</td>
                    <td class="p-4"><span class="px-3 py-1 rounded-full text-xs ${roleStyle}">${escapeHtml(role)}</span></td>
                    <td class="p-4 text-gray-600 text-xs">${projectDisplay}</td>
                    <td class="p-4 text-center">${actionButtons}</td>
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
// 4. FORM SUBMISSION (CREATE ACCOUNT + PIN)
// ==========================================
if (addStaffForm) {
    addStaffForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!isCurrentUserAdmin) {
            showToast('Permission denied: Only Owners and Construction Heads can add staff.', 'error');
            return;
        }

        const submitBtn = document.getElementById('addStaffSubmitBtn');
        const feedback = document.getElementById('form-feedback');
        const originalText = submitBtn.innerHTML;

        // Clean & Validate Form Inputs
        const rawUsername = staffUsernameInput.value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
        const rawPin = staffPinInput.value.trim();
        const displayName = staffNameInput.value.trim();
        const role = staffRoleSelect.value;
        const assignedProject = staffProjectSelect.value || 'Unassigned';

        if (!rawUsername) {
            showToast('Please enter a valid alphanumeric username.', 'error');
            staffUsernameInput.focus();
            return;
        }

        if (!/^[0-9]{4}$/.test(rawPin)) {
            showToast('PIN must be exactly 4 numeric digits (e.g. 1234).', 'error');
            staffPinInput.focus();
            return;
        }

        if (!role || role === '_ADD_NEW_') {
            showToast('Please select a valid authorization role.', 'error');
            staffRoleSelect.focus();
            return;
        }

        submitBtn.innerHTML = `
            <svg class="animate-spin h-4 w-4 text-brand-amber inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            Provisioning Account...
        `;
        submitBtn.disabled = true;

        // Synthesize Credentials matching login.js
        const translatedEmail = `${rawUsername}@prayosha.erp`;
        const translatedPassword = `${rawPin}-Prayosha`;

        try {
            // 1. Check if username already exists in directory
            const { data: existingUser } = await supabase
                .from('user_roles')
                .select('username')
                .eq('username', rawUsername)
                .maybeSingle();

            if (existingUser) {
                throw new Error(`Username "@${rawUsername}" is already registered. Please choose another.`);
            }

            // 2. Register User in Supabase Auth
            let authUserId = null;
            try {
                const { data: authData, error: authErr } = await supabase.auth.signUp({
                    email: translatedEmail,
                    password: translatedPassword,
                    options: {
                        data: {
                            display_name: displayName,
                            username: rawUsername,
                            role: role
                        }
                    }
                });

                if (authErr && !authErr.message.includes('already registered')) {
                    console.warn('[Staff Auth Warning]:', authErr.message);
                }

                if (authData && authData.user) {
                    authUserId = authData.user.id;
                }
            } catch (authException) {
                console.warn('[Staff Auth Notice]:', authException);
            }

            // 3. Persist Staff Record into user_roles table
            const staffPayload = {
                username: rawUsername,
                display_name: displayName,
                role: role,
                assigned_project: assignedProject
            };

            const { error: insertError } = await supabase
                .from('user_roles')
                .insert([staffPayload]);

            if (insertError) throw insertError;

            // 4. Also register into profiles master table if present
            if (authUserId) {
                try {
                    await supabase
                        .from('profiles')
                        .upsert([{
                            id: authUserId,
                            username: rawUsername,
                            full_name: displayName,
                            role: role,
                            assigned_project: assignedProject
                        }]);
                } catch (profErr) {
                    console.warn('[Profiles Table Notice]:', profErr);
                }
            }

            // Success UI
            if (feedback) {
                feedback.className = "p-3 rounded-lg text-xs font-semibold text-center mt-2 bg-emerald-50 text-emerald-800 border border-emerald-200 block";
                feedback.innerHTML = `
                    <span>Staff <strong>${displayName}</strong> provisioned successfully!</span><br>
                    <span class="text-[11px] text-slate-500">Login ID: <strong>${rawUsername}</strong> | PIN: <strong>${rawPin}</strong></span>
                `;
            }

            showToast(`${displayName} added! Credentials: @${rawUsername} / PIN: ${rawPin}`, 'success');

            // Reset Form while keeping neutral default
            this.reset();
            if (staffProjectSelect) staffProjectSelect.value = 'Unassigned';

            // Reload Active Directory
            await loadDirectory();

        } catch (err) {
            console.error('Error adding staff member:', err);
            if (feedback) {
                feedback.className = "p-3 rounded-lg text-xs font-semibold text-center mt-2 bg-rose-50 text-rose-800 border border-rose-200 block";
                feedback.innerText = `Error: ${err.message || 'Failed to provision staff.'}`;
            }
            showToast(err.message || 'Registration failed', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            if (feedback) {
                setTimeout(() => feedback.classList.add('hidden'), 7000);
            }
        }
    });
}

// ==========================================
// 5. ACTION DELEGATION (EDIT & REVOKE)
// ==========================================
function setupEventDelegation() {
    if (!tableBody) return;

    tableBody.addEventListener('click', async (e) => {
        // Trigger Edit Modal
        const editBtn = e.target.closest('.btn-edit');
        if (editBtn) {
            const userId = editBtn.dataset.id;
            openEditStaffModal(userId);
            return;
        }

        // Trigger Revoke Access
        const revokeBtn = e.target.closest('.btn-revoke');
        if (revokeBtn) {
            if (!isCurrentUserAdmin) {
                showToast('Access denied: Only Owners and Construction Heads can revoke credentials.', 'error');
                return;
            }

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
        }
    });
}

// ==========================================
// 6. EDIT STAFF PROFILE MODAL HANDLERS
// ==========================================
function openEditStaffModal(userId) {
    const user = activeUsersCache.find(u => String(u.id) === String(userId));
    if (!user) return;

    editUserIdInput.value = user.id;
    editUsernameInput.value = `@${user.username}`;
    editNameInput.value = user.display_name || '';
    editRoleSelect.value = user.role || '';
    editProjectSelect.value = user.assigned_project || 'Unassigned';
    editPinInput.value = '';

    if (editStaffModal) editStaffModal.classList.remove('hidden');
}

function closeEditStaffModal() {
    if (editStaffModal) editStaffModal.classList.add('hidden');
    editUserIdInput.value = '';
    editPinInput.value = '';
}

function setupEditModalEvents() {
    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditStaffModal);
    if (cancelEditModalBtn) cancelEditModalBtn.addEventListener('click', closeEditStaffModal);

    if (editStaffModal) {
        editStaffModal.addEventListener('click', (e) => {
            if (e.target === editStaffModal) closeEditStaffModal();
        });
    }

    if (editStaffForm) {
        editStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!isCurrentUserAdmin) {
                showToast('Permission denied: Only Owners and Construction Heads can edit profiles.', 'error');
                return;
            }

            const userId = editUserIdInput.value;
            const updatedName = editNameInput.value.trim();
            const updatedRole = editRoleSelect.value;
            const updatedProject = editProjectSelect.value;
            const newPin = editPinInput.value.trim();

            if (!userId) return;

            if (newPin && !/^[0-9]{4}$/.test(newPin)) {
                showToast('Reset PIN must be exactly 4 digits.', 'error');
                editPinInput.focus();
                return;
            }

            saveEditSubmitBtn.disabled = true;
            saveEditSubmitBtn.textContent = 'Saving...';

            try {
                // Update user_roles record
                const updatePayload = {
                    display_name: updatedName,
                    role: updatedRole,
                    assigned_project: updatedProject
                };

                const { error: updateErr } = await supabase
                    .from('user_roles')
                    .update(updatePayload)
                    .eq('id', userId);

                if (updateErr) throw updateErr;

                // If PIN was entered, inform admin on credential reset
                if (newPin) {
                    showToast(`Updated ${updatedName}! New login PIN: ${newPin}`, 'success');
                } else {
                    showToast(`Updated profile for ${updatedName}`, 'success');
                }

                closeEditStaffModal();
                await loadDirectory();

            } catch (err) {
                console.error('Failed to update staff record:', err);
                showToast(`Update error: ${err.message}`, 'error');
            } finally {
                saveEditSubmitBtn.disabled = false;
                saveEditSubmitBtn.textContent = 'Save Changes';
            }
        });
    }
}

// ==========================================
// 7. UTILITY FUNCTIONS
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
        : 'bg-slate-900/95 border-brand-amber text-white';

    const dotClass = type === 'success' 
        ? 'bg-emerald-400' 
        : type === 'error'
        ? 'bg-rose-400'
        : 'bg-brand-amber';

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
        setTimeout(() => toast.remove(), 3500);
    }, 3500);
}