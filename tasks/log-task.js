/**
 * Prayosha ERP - Task Logging Controller
 * File: /tasks/log-task.js
 * 
 * Features:
 * 1. Automatic Project Synchronization: Fetches active projects from Supabase and auto-selects the active project from localStorage.
 * 2. Session Context Retention: Keeps the project selected after form reset so users can rapidly log consecutive tasks.
 * 3. Supabase Integration: Inserts validated task records directly into the `civil_tasks` table.
 * 4. Executive Feedback UI: Styled status alerts with automatic timeout clearing.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const logTaskForm = document.getElementById('logTaskForm');
const projectSelect = document.getElementById('project_name');
const feedbackBox = document.getElementById('form-feedback');

/**
 * 1. Initialize and Synchronize Project Dropdown
 */
async function initProjectContext() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';

    if (!client) {
        console.warn('[Task Logger] Supabase client unavailable. Using cached session project.');
        populateFallbackProject(activeProjectName);
        return;
    }

    try {
        const { data: projects, error } = await client
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true });

        if (error) throw error;

        if (projects && projects.length > 0) {
            projectSelect.innerHTML = '<option value="">-- Select Project --</option>';
            
            let matchedValue = '';

            projects.forEach(project => {
                const opt = document.createElement('option');
                // Store project_name as value for direct backwards compatibility with civil_tasks
                opt.value = project.project_name;
                opt.dataset.id = project.id;
                opt.dataset.code = project.project_code || '';
                opt.textContent = project.project_code 
                    ? `[${project.project_code}] ${project.project_name}` 
                    : project.project_name;

                // Match against active session memory
                if (
                    project.id === activeProjectId ||
                    project.project_code === activeProjectId ||
                    project.project_name.toLowerCase() === activeProjectName.toLowerCase()
                ) {
                    opt.selected = true;
                    matchedValue = project.project_name;
                }

                projectSelect.appendChild(opt);
            });

            // If an active project was not matched, select the first available project
            if (!matchedValue && projects.length > 0) {
                projectSelect.value = projects[0].project_name;
                localStorage.setItem('activeProjectId', projects[0].id);
                localStorage.setItem('activeProjectName', projects[0].project_name);
                if (projects[0].project_code) {
                    localStorage.setItem('activeProjectCode', projects[0].project_code);
                }
            }
        } else {
            populateFallbackProject(activeProjectName);
        }
    } catch (err) {
        console.error('[Task Logger] Error loading projects:', err);
        populateFallbackProject(activeProjectName);
    }
}

/**
 * Fallback project population from localStorage
 */
function populateFallbackProject(name) {
    const displayName = name || 'Prayosha Imperia';
    projectSelect.innerHTML = `
        <option value="">-- Select Project --</option>
        <option value="${displayName}" selected>${displayName}</option>
    `;
}

/**
 * 2. Form Submission Handler
 */
logTaskForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;

    // Loading State
    submitBtn.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-brand-amber inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Assigning Task...
    `;
    submitBtn.disabled = true;

    // Extract form fields
    const selectedProjectName = projectSelect.value;
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const selectedProjectId = selectedOption ? selectedOption.dataset.id : null;

    const taskPayload = {
        project_name: selectedProjectName,
        tower_block: document.getElementById('tower_block').value,
        floor_level: document.getElementById('floor_level').value,
        zone_id: document.getElementById('zone_id').value.trim().toUpperCase(),
        category: document.getElementById('category').value,
        assigned_agency: document.getElementById('assigned_agency').value,
        expected_completion_date: document.getElementById('expected_completion_date').value,
        assigned_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        status: 'Not Started'
    };

    // If project_id column exists in table, include it
    if (selectedProjectId) {
        taskPayload.project_id = selectedProjectId;
    }

    try {
        if (!client) {
            throw new Error('Supabase client connection not found.');
        }

        // Insert task record into civil_tasks table
        const { error } = await client
            .from('civil_tasks')
            .insert([taskPayload]);

        if (error) throw error;

        // Success UI Feedback
        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-emerald-50 text-emerald-800 border border-emerald-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Task successfully logged and assigned to <strong>${taskPayload.zone_id}</strong>!</span>
        `;

        // Remember active project before reset
        const currentProjectVal = projectSelect.value;

        // Reset form inputs for next log
        logTaskForm.reset();

        // Restore project context
        projectSelect.value = currentProjectVal;

        // Set default focus back to Zone ID for fast entry flow
        document.getElementById('zone_id').focus();

    } catch (err) {
        // Error UI Feedback
        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-red-50 text-red-800 border border-red-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Error assigning task: ${err.message || 'Database write failed'}</span>
        `;
        console.error('[Task Logging Failure]:', err);
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;

        // Clear feedback after 6 seconds
        setTimeout(() => {
            feedbackBox.classList.add('hidden');
        }, 6000);
    }
});

// Run initialization on DOM load
document.addEventListener('DOMContentLoaded', initProjectContext);