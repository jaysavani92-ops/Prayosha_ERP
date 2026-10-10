/**
 * Prayosha ERP - Issue & Blocker Reporting Controller
 * File: /tasks/raise-issue.js
 * 
 * Features:
 * 1. Automatic Project Synchronization: Pulls project master records and selects the active workspace project.
 * 2. Identity Binding: Resolves active user display name and binds it to the reporter field.
 * 3. Blocker Logging: Inserts critical site impediments into the `issues_blockers` Supabase table.
 * 4. Rapid Multi-Entry: Preserves location context (Project, Tower, Floor) for rapid consecutive blocker logs.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const raiseIssueForm = document.getElementById('raiseIssueForm');
const projectSelect = document.getElementById('project_name');
const reportedByInput = document.getElementById('reported_by');
const feedbackBox = document.getElementById('issue-feedback');

/**
 * 1. Initialize Form Context (User Identity & Active Project)
 */
async function initFormContext() {
    // 1.1 Resolve Reporter Name from Session Memory
    const prayoshaUserStr = localStorage.getItem('prayosha_user');
    if (prayoshaUserStr && reportedByInput) {
        try {
            const userObj = JSON.parse(prayoshaUserStr);
            if (userObj.displayName) {
                reportedByInput.value = userObj.displayName;
            } else if (userObj.username) {
                reportedByInput.value = userObj.username;
            }
        } catch (e) {
            console.warn('[Issue Reporter] Could not parse prayosha_user session:', e);
        }
    }

    // 1.2 Resolve Active Project Context
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';

    if (!client) {
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
            let matched = false;

            projects.forEach(project => {
                const opt = document.createElement('option');
                opt.value = project.project_name;
                opt.dataset.id = project.id;
                opt.textContent = project.project_code 
                    ? `[${project.project_code}] ${project.project_name}` 
                    : project.project_name;

                if (
                    project.id === activeProjectId ||
                    project.project_code === activeProjectId ||
                    project.project_name.toLowerCase() === activeProjectName.toLowerCase()
                ) {
                    opt.selected = true;
                    matched = true;
                }

                projectSelect.appendChild(opt);
            });

            // Default to first project if session was unassigned
            if (!matched && projects.length > 0) {
                projectSelect.value = projects[0].project_name;
                localStorage.setItem('activeProjectId', projects[0].id);
                localStorage.setItem('activeProjectName', projects[0].project_name);
            }
        } else {
            populateFallbackProject(activeProjectName);
        }
    } catch (err) {
        console.error('[Issue Reporter] Error loading projects:', err);
        populateFallbackProject(activeProjectName);
    }
}

/**
 * Fallback project population
 */
function populateFallbackProject(name) {
    const fallbackName = name || 'Prayosha Imperia';
    if (projectSelect) {
        projectSelect.innerHTML = `
            <option value="">-- Select Project --</option>
            <option value="${fallbackName}" selected>${fallbackName}</option>
        `;
    }
}

/**
 * 2. Form Submission Handler
 */
raiseIssueForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;

    // Loading State
    submitBtn.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-white inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Logging Issue...
    `;
    submitBtn.disabled = true;

    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const selectedProjectId = selectedOption ? selectedOption.dataset.id : null;

    const issuePayload = {
        project_name: projectSelect.value,
        tower_block: document.getElementById('tower_block').value,
        floor_level: document.getElementById('floor_level').value,
        zone_id: document.getElementById('zone_id').value.trim().toUpperCase(),
        description: document.getElementById('description').value.trim(),
        reported_by: reportedByInput.value.trim(),
        status: 'Open',
        priority: 'Critical'
    };

    if (selectedProjectId) {
        issuePayload.project_id = selectedProjectId;
    }

    try {
        if (!client) throw new Error('Supabase client connection not active.');

        const { error } = await client
            .from('issues_blockers')
            .insert([issuePayload]);

        if (error) throw error;

        // Success UI Feedback
        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-emerald-50 text-emerald-800 border border-emerald-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Critical blocker successfully logged for Zone <strong>${issuePayload.zone_id}</strong>!</span>
        `;

        // Clear specific fields for quick multi-entry while keeping project/tower/floor selected
        document.getElementById('zone_id').value = '';
        document.getElementById('description').value = '';
        document.getElementById('zone_id').focus();

    } catch (err) {
        console.error('[Issue Log Failure]:', err);
        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-red-50 text-red-800 border border-red-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Error logging blocker: ${err.message || 'Database write failed'}</span>
        `;
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;

        setTimeout(() => {
            feedbackBox.classList.add('hidden');
        }, 5000);
    }
});

// Run initialization on DOM load
document.addEventListener('DOMContentLoaded', initFormContext);