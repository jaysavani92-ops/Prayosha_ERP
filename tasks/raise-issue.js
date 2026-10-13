/**
 * Prayosha ERP - Issue & Blocker Reporting Controller
 * File: /tasks/raise-issue.js
 * 
 * Features:
 * 1. Automatic Project Synchronization: Pulls project master records and selects the active workspace project.
 * 2. Deep-Link / QR Code Zone Auto-Fill: Pre-fills and locks/highlights Zone ID from ?zone_id=... parameter.
 * 3. Spatial Metadata Auto-Resolution: Queries `project_map_zones` to auto-fill Tower and Floor Level.
 * 4. Identity Binding: Resolves active user display name and binds it to the reporter field.
 * 5. Blocker Logging: Inserts critical site impediments into the `issues_blockers` Supabase table.
 * 6. Rapid Multi-Entry: Preserves location context (Project, Tower, Floor) for rapid consecutive blocker logs.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = window.supabaseClient || (window.supabase 
    ? (typeof window.supabase.createClient === 'function' 
        ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
        : window.supabase)
    : null);

// DOM Elements
const raiseIssueForm = document.getElementById('raiseIssueForm');
const projectSelect = document.getElementById('project_name');
const reportedByInput = document.getElementById('reported_by');
const feedbackBox = document.getElementById('issue-feedback');
const zoneInput = document.getElementById('zone_id');
const towerInput = document.getElementById('tower_block');
const floorInput = document.getElementById('floor_level');
const descriptionInput = document.getElementById('description');

/**
 * 1. Initialize Form Context (User Identity, Active Project, and URL Deep-Links)
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
            } else if (userObj.full_name) {
                reportedByInput.value = userObj.full_name;
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
        handleIncomingZoneParam();
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

    // 1.3 Handle Incoming ?zone_id= Deep Link from Site Map / QR Scan
    await handleIncomingZoneParam();
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
 * 2. Deep Link Zone Parameter Handler
 */
async function handleIncomingZoneParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const zoneParam = urlParams.get('zone_id') || urlParams.get('zone');

    if (!zoneParam || !zoneInput) return;

    const cleanZone = zoneParam.trim().toUpperCase();
    zoneInput.value = cleanZone;

    // Highlight Zone field to indicate auto-detection from Site Map
    zoneInput.classList.add('ring-2', 'ring-[#FFBF00]', 'bg-amber-50/50');

    // Display a quick confirmation tag above the form
    let tag = document.getElementById('zone-detected-tag');
    if (!tag) {
        tag = document.createElement('div');
        tag.id = 'zone-detected-tag';
        tag.className = 'mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-semibold text-[#1E3A5F] flex items-center justify-between';
        raiseIssueForm.parentNode.insertBefore(tag, raiseIssueForm);
    }
    tag.innerHTML = `
        <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Pin Linked: Logging issue directly for Zone <strong>${cleanZone}</strong>
        </span>
        <button type="button" id="btnRemoveZoneLink" class="text-[10px] text-slate-500 hover:text-red-600 font-bold ml-2">✕ Clear</button>
    `;

    document.getElementById('btnRemoveZoneLink').addEventListener('click', () => {
        zoneInput.value = '';
        zoneInput.classList.remove('ring-2', 'ring-[#FFBF00]', 'bg-amber-50/50');
        tag.remove();
        const url = new URL(window.location);
        url.searchParams.delete('zone_id');
        url.searchParams.delete('zone');
        window.history.replaceState({}, document.title, url.pathname);
    });

    // Auto-resolve Tower and Floor from project_map_zones if configured
    if (client) {
        try {
            const activeProjectId = localStorage.getItem('activeProjectId');
            let query = client
                .from('project_map_zones')
                .select('tower_name, floor_level, room_identifier')
                .eq('zone_id', cleanZone);

            if (activeProjectId) {
                query = query.eq('project_id', activeProjectId);
            }

            const { data: matchedZone } = await query.maybeSingle();

            if (matchedZone) {
                if (towerInput && (!towerInput.value || towerInput.value.trim() === '')) {
                    towerInput.value = matchedZone.tower_name || '';
                }
                if (floorInput && (!floorInput.value || floorInput.value.trim() === '')) {
                    floorInput.value = matchedZone.floor_level || '';
                }
            }
        } catch (e) {
            console.warn('[Issue Reporter] Could not auto-resolve zone location:', e);
        }
    }

    if (descriptionInput) {
        descriptionInput.focus();
    }
}

/**
 * 3. Form Submission Handler
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
        tower_block: towerInput ? towerInput.value.trim() : '',
        floor_level: floorInput ? floorInput.value.trim() : '',
        zone_id: zoneInput.value.trim().toUpperCase(),
        description: descriptionInput.value.trim(),
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
        zoneInput.value = '';
        zoneInput.classList.remove('ring-2', 'ring-[#FFBF00]', 'bg-amber-50/50');
        descriptionInput.value = '';

        const tag = document.getElementById('zone-detected-tag');
        if (tag) tag.remove();

        zoneInput.focus();

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