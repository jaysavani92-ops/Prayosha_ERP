/**
 * Prayosha ERP - Active Tasks Controller
 * File: /tasks/active-tasks.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes civil tasks to the active project name from localStorage.
 * 2. Real-Time Status Manager: Automatically stamps `started_date` on "In Progress" and `completed_date` on "Completed".
 * 3. Daily Photo Progress Timeline: Multi-photo chronological audit trail powered by Cloudflare R2 and Supabase.
 * 4. Deep-Link / QR Code Zone Filter: Auto-detects and isolates tasks for ?zone_id=... from Site Map.
 * 5. Real-Time Client Search & Filtering: Instant search across Zone ID, Agency, Priority, and Categories.
 */

import { supabase, uploadToR2 } from '../config.js';

// DOM Elements
const taskContainer = document.getElementById('active-tasks-container');
const projectBadge = document.getElementById('activeProjectBadge');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const refreshBtn = document.getElementById('refreshBtn');

// Modal Elements
const photoModal = document.getElementById('photoModal');
const closePhotoModalBtn = document.getElementById('closePhotoModalBtn');
const cancelPhotoModalBtn = document.getElementById('cancelPhotoModalBtn');
const modalTaskInfo = document.getElementById('modalTaskInfo');
const photoTimelineCount = document.getElementById('photoTimelineCount');
const photoTimelineList = document.getElementById('photoTimelineList');
const photoUploadForm = document.getElementById('photoUploadForm');
const modalTaskId = document.getElementById('modalTaskId');
const taskPhotoNote = document.getElementById('taskPhotoNote');
const taskPhotoInput = document.getElementById('taskPhotoInput');
const savePhotoSubmitBtn = document.getElementById('savePhotoSubmitBtn');

// In-Memory State & URL Filter State
let allTasks = [];
let activeZoneFilter = '';

/**
 * 0. Initialize & Parse URL Query Parameters
 */
function initUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const zoneParam = urlParams.get('zone_id') || urlParams.get('zone');
    if (zoneParam && zoneParam.trim() !== '') {
        activeZoneFilter = zoneParam.trim();
    }
}

/**
 * Helper: Parse Photos into Structured Timeline Array
 */
function parseTaskPhotos(task) {
    if (!task) return [];

    if (Array.isArray(task.photos)) return task.photos;
    if (typeof task.photos === 'string' && task.photos.trim() !== '') {
        try {
            const parsed = JSON.parse(task.photos);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            console.warn('[Photo Parser] Failed to parse photos field:', e);
        }
    }

    const raw = task.photo_url || task.Photo_URL || '';
    if (!raw || raw === 'null' || raw === 'undefined') return [];

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) {
                console.warn('[Photo Parser] Failed to parse photo_url array JSON:', e);
            }
        }

        // Backwards compatibility for single legacy URL string
        return [{
            url: trimmed,
            timestamp: task.assigned_date || task.created_at || new Date().toISOString(),
            note: 'Initial site evidence'
        }];
    }

    if (Array.isArray(raw)) return raw;

    return [];
}

/**
 * Helper: Escape HTML to prevent injection in user notes
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 1. Load Active Tasks scoped to Active Project
 */
async function loadActiveTasks() {
    initUrlParameters();

    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    // Update Project Badge in Toolbar
    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    if (!taskContainer) return;

    taskContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="animate-spin h-6 w-6 text-brand-amber mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span class="text-xs font-semibold">Fetching tasks for ${activeProjectName || 'current project'}...</span>
        </div>
    `;

    if (!supabase) {
        taskContainer.innerHTML = `
            <div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                Supabase client connection not detected. Please verify config.js.
            </div>
        `;
        return;
    }

    try {
        let query = supabase
            .from('civil_tasks')
            .select('*')
            .order('created_at', { ascending: false });

        // Filter by project_name
        if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        const { data: tasks, error } = await query;

        if (error) throw error;

        // Tolerant status filtering: Show active work, filter out Completed
        allTasks = (tasks || []).filter(t => {
            const statusVal = (t.status || t.Status || '').trim().toLowerCase();
            return statusVal !== 'completed' && statusVal !== 'done';
        });

        // Populate dynamic category filters
        populateCategoryFilter(allTasks);

        // Render Zone Filter Banner (if arriving via QR Code or Site Map)
        renderZoneFilterBanner();

        // Render Rows
        renderFilteredTasks();

    } catch (err) {
        console.error('[Active Tasks Load Failure]:', err);
        taskContainer.innerHTML = `
            <div class="p-5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to load active tasks</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
                <button id="btnRetryLoad" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                    Retry Connection
                </button>
            </div>
        `;
        const retryBtn = document.getElementById('btnRetryLoad');
        if (retryBtn) retryBtn.addEventListener('click', loadActiveTasks);
    }
}

/**
 * 2. Render Zone Filter Banner (for QR Scan / Site Map Redirection)
 */
function renderZoneFilterBanner() {
    let banner = document.getElementById('zone-filter-active-banner');

    if (!activeZoneFilter) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'zone-filter-active-banner';
        taskContainer.parentNode.insertBefore(banner, taskContainer);
    }

    const matchedCount = allTasks.filter(t => {
        const z = (t.zone_id || t.Zone_ID || '').trim().toLowerCase();
        return z === activeZoneFilter.toLowerCase();
    }).length;

    banner.className = 'mb-4 p-3.5 bg-amber-50 border border-brand-amber/60 rounded-xl shadow-sm flex items-center justify-between gap-3 text-xs animate-fade-in';
    banner.innerHTML = `
        <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-brand-navy text-brand-amber flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
            <div>
                <span class="text-slate-500 font-medium block text-[11px]">Filtered by Site Map Zone:</span>
                <span class="font-bold text-brand-navy text-sm tracking-wide uppercase">${activeZoneFilter}</span>
                <span class="text-slate-500 font-normal ml-1">(${matchedCount} active task${matchedCount === 1 ? '' : 's'})</span>
            </div>
        </div>

        <button id="btnClearZoneFilter" type="button" class="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 shadow-xs transition flex items-center gap-1.5 active:scale-95">
            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            <span>Show All Zones</span>
        </button>
    `;

    document.getElementById('btnClearZoneFilter').addEventListener('click', () => {
        activeZoneFilter = '';
        banner.remove();

        const url = new URL(window.location);
        url.searchParams.delete('zone_id');
        url.searchParams.delete('zone');
        window.history.replaceState({}, document.title, url.pathname);

        renderFilteredTasks();
    });
}

/**
 * 3. Populate Category Filter Dropdown
 */
function populateCategoryFilter(tasks) {
    if (!categoryFilter) return;

    const currentSelected = categoryFilter.value;
    const categories = Array.from(new Set(
        tasks.map(t => t.category || t.Category || t.area_type).filter(Boolean)
    )).sort();

    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentSelected) opt.selected = true;
        categoryFilter.appendChild(opt);
    });
}

/**
 * 4. Render Filtered Tasks List
 */
function renderFilteredTasks() {
    if (!taskContainer) return;

    const searchTerm = (searchInput ? searchInput.value.trim().toLowerCase() : '');
    const selectedCategory = (categoryFilter ? categoryFilter.value : '');

    const filtered = allTasks.filter(task => {
        const zoneIdVal = (task.zone_id || task.Zone_ID || '').trim();
        const catVal = (task.category || task.Category || task.area_type || '').trim();
        const towerVal = (task.tower_block || task.tower_name || task.Phase || '').trim();
        const agencyVal = (task.assigned_agency || task.Assigned_Agency || '').trim();
        const descVal = (task.task_description || task.Task_Description || '').trim();
        const priorityVal = (task.priority || task.Priority || '').trim();

        const matchesZone = !activeZoneFilter || (zoneIdVal.toLowerCase() === activeZoneFilter.toLowerCase());
        const matchesCategory = !selectedCategory || (catVal.toLowerCase() === selectedCategory.toLowerCase());
        const matchesSearch = !searchTerm || (
            zoneIdVal.toLowerCase().includes(searchTerm) ||
            catVal.toLowerCase().includes(searchTerm) ||
            towerVal.toLowerCase().includes(searchTerm) ||
            agencyVal.toLowerCase().includes(searchTerm) ||
            descVal.toLowerCase().includes(searchTerm) ||
            priorityVal.toLowerCase().includes(searchTerm)
        );

        return matchesZone && matchesCategory && matchesSearch;
    });

    taskContainer.innerHTML = '';

    if (filtered.length === 0) {
        taskContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 text-xl">
                    📋
                </div>
                <h3 class="text-sm font-bold text-slate-700 mb-1">No Active Tasks Found</h3>
                <p class="text-xs text-slate-400 max-w-sm">
                    ${activeZoneFilter 
                        ? `There are no active tasks currently logged for Zone "${activeZoneFilter}".` 
                        : 'No active tasks match your filters.'}
                </p>
                <a href="log-task.html${activeZoneFilter ? `?zone_id=${encodeURIComponent(activeZoneFilter)}` : ''}" class="mt-4 px-4 py-2 bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold rounded-xl shadow-md transition">
                    + Log Task for this Zone
                </a>
            </div>
        `;
        return;
    }

    filtered.forEach(task => {
        const taskId = task.id || task.Task_ID || task.task_id;
        const zoneId = task.zone_id || task.Zone_ID || 'N/A';
        const tower = task.tower_block || task.tower_name || task.Phase || '';
        const floor = task.floor_level || task.Floor_Level || '';
        const category = task.category || task.Category || task.area_type || 'General Civil';
        const taskDesc = task.task_description || task.Task_Description || 'Civil Task';
        const agency = task.assigned_agency || task.Assigned_Agency || 'Unassigned';
        const targetDate = task.expected_completion_date || task.target_date || 'No Date';
        const assignedDate = task.assigned_date || (task.created_at ? new Date(task.created_at).toLocaleDateString('en-IN') : 'Active');
        const status = task.status || task.Status || 'Not Started';
        const priority = task.priority || task.Priority || 'Medium';

        const photos = parseTaskPhotos(task);
        const photoCount = photos.length;

        const taskRow = document.createElement('div');
        taskRow.className = 'bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4';

        taskRow.innerHTML = `
            <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
                <!-- Zone & Location -->
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Zone ID</span>
                    <div class="font-bold text-brand-navy text-sm tracking-tight">${zoneId}</div>
                    <div class="text-[11px] text-slate-500 font-medium mt-0.5">
                        ${tower}${tower && floor ? ' • ' : ''}${floor}
                    </div>
                </div>

                <!-- Description, Category & Priority -->
                <div>
                    <div class="flex items-center gap-1.5 mb-0.5">
                        <span class="text-[10px] uppercase font-bold text-slate-400">Work Scope</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded ${getPriorityBadgeClass(priority)}">
                            ${priority}
                        </span>
                    </div>
                    <div class="text-xs font-semibold text-slate-800 line-clamp-1" title="${escapeHtml(taskDesc)}">${escapeHtml(taskDesc)}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">${category} • Target: ${targetDate}</div>
                </div>

                <!-- Assigned Agency -->
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Assigned Agency</span>
                    <div class="text-xs font-bold text-brand-navy truncate">${agency}</div>
                    <div class="text-[10px] text-emerald-600 font-medium mt-0.5">Assigned: ${assignedDate}</div>
                </div>

                <!-- Execution Status Interactive Switcher -->
                <div>
                    <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Execution Status</span>
                    <select class="status-select text-xs font-bold py-1.5 px-2.5 rounded-xl border outline-none transition cursor-pointer ${getStatusDropdownClass(status)}" data-task-id="${taskId}">
                        <option value="Not Started" ${status === 'Not Started' ? 'selected' : ''}>Not Started</option>
                        <option value="In Progress" ${status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Ready for QC" ${status === 'Ready for QC' ? 'selected' : ''}>Ready for QC</option>
                        <option value="Delayed" ${status === 'Delayed' ? 'selected' : ''}>Delayed</option>
                        <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
            </div>

            <!-- Action Controls: Multi-Photo Timeline Button -->
            <div class="flex items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 md:border-l md:pl-5 border-slate-100 justify-end">
                <button type="button" class="btn-open-photo flex items-center gap-1.5 text-xs font-semibold rounded-xl px-3.5 py-2 transition shadow-sm border ${
                    photoCount > 0 
                        ? 'bg-amber-50 text-brand-navy border-amber-300 hover:bg-amber-100' 
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }" data-task-id="${taskId}">
                    <svg class="w-3.5 h-3.5 ${photoCount > 0 ? 'text-amber-500' : 'text-slate-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span>${photoCount > 0 ? `Photo (${photoCount})` : 'Add Photo'}</span>
                </button>
            </div>
        `;

        taskContainer.appendChild(taskRow);
    });

    // Wire Status Select Handlers
    taskContainer.querySelectorAll('.status-select').forEach(selectEl => {
        selectEl.addEventListener('change', async (e) => {
            const tId = e.target.getAttribute('data-task-id');
            const newStatus = e.target.value;
            await updateTaskStatus(tId, newStatus, e.target);
        });
    });

    // Wire Photo Modal Triggers
    taskContainer.querySelectorAll('.btn-open-photo').forEach(btn => {
        btn.addEventListener('click', () => {
            const tId = btn.getAttribute('data-task-id');
            openPhotoModal(tId);
        });
    });
}

function getPriorityBadgeClass(priority) {
    switch (priority) {
        case 'Urgent':
            return 'bg-rose-100 text-rose-700 border border-rose-200';
        case 'High':
            return 'bg-amber-100 text-amber-800 border border-amber-300';
        case 'Low':
            return 'bg-slate-100 text-slate-600 border border-slate-200';
        case 'Medium':
        default:
            return 'bg-blue-100 text-blue-700 border border-blue-200';
    }
}

function getStatusDropdownClass(status) {
    switch (status) {
        case 'Ready for QC':
            return 'bg-purple-50 text-purple-700 border-purple-200';
        case 'In Progress':
            return 'bg-amber-50 text-amber-700 border-amber-300';
        case 'Delayed':
            return 'bg-rose-50 text-rose-700 border-rose-200';
        case 'Completed':
            return 'bg-emerald-50 text-emerald-700 border-emerald-300';
        case 'Not Started':
        default:
            return 'bg-blue-50 text-blue-700 border-blue-200';
    }
}

/**
 * 5. Update Task Status in Supabase (with automatic started_date and completed_date stamping)
 */
async function updateTaskStatus(taskId, newStatus, selectElement) {
    if (!taskId) return;

    selectElement.disabled = true;

    try {
        const todayDate = new Date().toISOString().split('T')[0];
        const updatePayload = {
            status: newStatus,
            updated_at: new Date().toISOString()
        };

        // Populate started_date when status transitions to In Progress
        if (newStatus === 'In Progress') {
            updatePayload.started_date = todayDate;
        } else if (newStatus === 'Completed') {
            updatePayload.completed_date = todayDate;
        }

        const { error } = await supabase
            .from('civil_tasks')
            .update(updatePayload)
            .eq('id', taskId);

        if (error) throw error;

        showToast(`Task status updated to "${newStatus}"`, 'success');

        // If marked Completed, remove from Active Tasks view
        if (newStatus === 'Completed') {
            allTasks = allTasks.filter(t => (t.id || t.Task_ID || t.task_id) !== taskId);
            renderFilteredTasks();
        } else {
            // Update cached status and restyle select
            const cached = allTasks.find(t => (t.id || t.Task_ID || t.task_id) === taskId);
            if (cached) {
                cached.status = newStatus;
                if (updatePayload.started_date) cached.started_date = updatePayload.started_date;
                if (updatePayload.completed_date) cached.completed_date = updatePayload.completed_date;
            }
            selectElement.className = `status-select text-xs font-bold py-1.5 px-2.5 rounded-xl border outline-none transition cursor-pointer ${getStatusDropdownClass(newStatus)}`;
            selectElement.disabled = false;
        }

    } catch (err) {
        console.error('Failed to update task status:', err);
        showToast(`Status update failed: ${err.message}`, 'error');
        selectElement.disabled = false;
    }
}

/**
 * 6. Daily Photo Progress Timeline Modal Logic
 */
function openPhotoModal(taskId) {
    const task = allTasks.find(t => (t.id || t.Task_ID || t.task_id) === taskId);
    if (!task) return;

    modalTaskId.value = taskId;
    taskPhotoInput.value = '';
    if (taskPhotoNote) taskPhotoNote.value = '';

    const zoneId = task.zone_id || task.Zone_ID || 'General Zone';
    const category = task.category || task.Category || 'Civil Package';
    const tower = task.tower_block || task.tower_name || '';
    const floor = task.floor_level || task.floor_name || '';

    if (modalTaskInfo) {
        modalTaskInfo.textContent = `[${zoneId}] ${category} • ${tower}${tower && floor ? ', ' : ''}${floor}`;
    }

    renderPhotoTimelineFeed(task);
    photoModal.classList.remove('hidden');
}

function renderPhotoTimelineFeed(task) {
    if (!photoTimelineList) return;

    const photos = parseTaskPhotos(task);

    if (photoTimelineCount) {
        photoTimelineCount.textContent = photos.length;
    }

    if (photos.length === 0) {
        photoTimelineList.innerHTML = `
            <div class="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <span class="text-2xl block mb-1">📷</span>
                <p class="text-xs font-semibold text-slate-600">No progress photos recorded yet</p>
                <p class="text-[11px] text-slate-400 mt-0.5">Upload today's site photo below to start the daily execution timeline.</p>
            </div>
        `;
        return;
    }

    // Sort newest first
    const sortedPhotos = [...photos].sort((a, b) => {
        const dateA = new Date(a.timestamp || 0).getTime();
        const dateB = new Date(b.timestamp || 0).getTime();
        return dateB - dateA;
    });

    photoTimelineList.innerHTML = '';

    sortedPhotos.forEach(photo => {
        let displayDate = 'Recorded Date';
        let displayTime = '';

        if (photo.timestamp) {
            try {
                const d = new Date(photo.timestamp);
                if (!isNaN(d.getTime())) {
                    displayDate = d.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    });
                    displayTime = d.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                } else {
                    displayDate = photo.timestamp;
                }
            } catch (e) {
                displayDate = photo.timestamp;
            }
        }

        const timelineItem = document.createElement('div');
        timelineItem.className = 'relative pl-6 pb-4 last:pb-1 border-l-2 border-brand-amber/40 last:border-l-transparent';

        timelineItem.innerHTML = `
            <span class="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-brand-amber border-2 border-white shadow-xs"></span>
            <div class="bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs hover:shadow-sm transition">
                <div class="flex items-start justify-between gap-2 mb-2">
                    <div>
                        <span class="text-xs font-bold text-brand-navy block">${displayDate}</span>
                        ${displayTime ? `<span class="text-[10px] text-slate-400 font-medium">${displayTime}</span>` : ''}
                    </div>
                    <a href="${photo.url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-navy hover:text-brand-amber transition bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">
                        <span>Full View</span>
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                    </a>
                </div>
                <div class="h-36 w-full rounded-lg overflow-hidden border border-slate-100 bg-slate-50 mb-2 relative group">
                    <img src="${photo.url}" alt="Site Evidence" class="w-full h-full object-cover">
                </div>
                ${photo.note ? `<p class="text-xs text-slate-600 bg-slate-50/80 p-2 rounded-lg border border-slate-100 italic font-medium">"${escapeHtml(photo.note)}"</p>` : ''}
            </div>
        `;

        photoTimelineList.appendChild(timelineItem);
    });
}

function closePhotoModal() {
    photoModal.classList.add('hidden');
    modalTaskId.value = '';
    taskPhotoInput.value = '';
    if (taskPhotoNote) taskPhotoNote.value = '';
}

photoUploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const taskId = modalTaskId.value;
    const file = taskPhotoInput.files[0];
    const note = taskPhotoNote ? taskPhotoNote.value.trim() : '';

    if (!taskId || !file) {
        showToast('Please select a photo file to upload.', 'error');
        return;
    }

    const originalBtnHtml = savePhotoSubmitBtn.innerHTML;
    savePhotoSubmitBtn.disabled = true;
    savePhotoSubmitBtn.innerHTML = `
        <svg class="animate-spin h-3.5 w-3.5 text-white inline mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Uploading to R2 Vault...
    `;

    try {
        // Upload to Cloudflare R2 bucket with authentic SigV4 binary hashing
        const uploadedUrl = await uploadToR2(file, 'task-evidence');

        if (!uploadedUrl) {
            throw new Error('Upload to R2 returned an empty URL.');
        }

        // Retrieve existing photos for this task
        const cachedTask = allTasks.find(t => (t.id || t.Task_ID || t.task_id) === taskId);
        const currentPhotos = parseTaskPhotos(cachedTask);

        // Append new photo milestone
        const newPhotoRecord = {
            url: uploadedUrl,
            timestamp: new Date().toISOString(),
            note: note || ''
        };

        const updatedPhotos = [newPhotoRecord, ...currentPhotos];
        const serializedPhotos = JSON.stringify(updatedPhotos);

        // Persist chronological array into Supabase civil_tasks record
        const { error } = await supabase
            .from('civil_tasks')
            .update({
                photo_url: serializedPhotos,
                updated_at: new Date().toISOString()
            })
            .eq('id', taskId);

        if (error) throw error;

        // Update local task cache
        if (cachedTask) {
            cachedTask.photo_url = serializedPhotos;
        }

        showToast('Daily progress photo uploaded successfully!', 'success');

        // Immediately update modal timeline
        taskPhotoInput.value = '';
        if (taskPhotoNote) taskPhotoNote.value = '';
        renderPhotoTimelineFeed(cachedTask);

        // Update outer task row counters
        renderFilteredTasks();

    } catch (err) {
        console.error('Error uploading task photo:', err);
        showToast(`Upload failed: ${err.message}`, 'error');
    } finally {
        savePhotoSubmitBtn.disabled = false;
        savePhotoSubmitBtn.innerHTML = originalBtnHtml;
    }
});

closePhotoModalBtn.addEventListener('click', closePhotoModal);
cancelPhotoModalBtn.addEventListener('click', closePhotoModal);

photoModal.addEventListener('click', (e) => {
    if (e.target === photoModal) closePhotoModal();
});

/**
 * 7. Toast Notification Helper
 */
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

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0 ${bgClass}`;
    toast.innerHTML = `
        <span class="w-2 h-2 rounded-full shrink-0 ${dotClass}"></span>
        <span>${message}</span>
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

/**
 * 8. Toolbar Event Listeners
 */
if (searchInput) {
    searchInput.addEventListener('input', renderFilteredTasks);
}

if (categoryFilter) {
    categoryFilter.addEventListener('change', renderFilteredTasks);
}

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        loadActiveTasks();
    });
}

// Cross-module project switch listener
window.addEventListener('prayosha:project-switched', async () => {
    await loadActiveTasks();
});

// Initial Load
document.addEventListener('DOMContentLoaded', loadActiveTasks);