import { supabase } from '../config.js';

// ==========================================
// STATE MANAGEMENT
// ==========================================
let allProjects = [];
let taskStatsByProject = {};
let currentModalProject = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Role-based UI visibility
    const userRole = localStorage.getItem('userRole');
    const createBtn = document.getElementById('createProjectBtn');
    if (createBtn && userRole && userRole !== 'Owner' && userRole !== 'General Manager') {
        createBtn.classList.add('hidden');
    }

    // 2. Fetch project directory & task statistics
    await loadProjectsWithAnalytics();

    // 3. Search and Filter Event Listeners
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const refreshBtn = document.getElementById('refreshBtn');

    searchInput.addEventListener('input', () => filterAndRenderProjects());
    statusFilter.addEventListener('change', () => filterAndRenderProjects());
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('animate-spin');
        await loadProjectsWithAnalytics();
        refreshBtn.classList.remove('animate-spin');
        showToast('Project directory refreshed successfully', 'success');
    });

    // 4. Modal Event Listeners
    setupModalHandlers();
});

// ==========================================
// DATA FETCHING & SYNCHRONIZATION
// ==========================================
async function loadProjectsWithAnalytics() {
    const grid = document.getElementById('projectsGrid');
    const emptyState = document.getElementById('emptyState');

    try {
        const { data: projectsData, error: projectsError } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (projectsError) throw projectsError;

        allProjects = projectsData || [];

        // Fetch task progress counts from civil_tasks if available
        try {
            const { data: taskData, error: taskError } = await supabase
                .from('civil_tasks')
                .select('project_id, status');

            if (!taskError && taskData) {
                taskStatsByProject = {};
                taskData.forEach(task => {
                    if (!task.project_id) return;
                    if (!taskStatsByProject[task.project_id]) {
                        taskStatsByProject[task.project_id] = { total: 0, completed: 0 };
                    }
                    taskStatsByProject[task.project_id].total += 1;
                    if (task.status === 'Completed' || task.status === 'Done') {
                        taskStatsByProject[task.project_id].completed += 1;
                    }
                });
            }
        } catch (taskErr) {
            console.warn('Task stats unavailable, using project fallback progress:', taskErr);
        }

        filterAndRenderProjects();

    } catch (error) {
        console.error('Error loading projects:', error);
        grid.innerHTML = `
            <div class="col-span-full glass-card p-8 rounded-2xl text-center text-red-600">
                <p class="font-bold">Failed to load projects from database.</p>
                <p class="text-xs text-gray-500 mt-1">${error.message}</p>
            </div>
        `;
        emptyState.classList.add('hidden');
    }
}

// ==========================================
// FILTERING & RENDERING
// ==========================================
function filterAndRenderProjects() {
    const grid = document.getElementById('projectsGrid');
    const emptyState = document.getElementById('emptyState');
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const selectedStatus = document.getElementById('statusFilter').value;

    const filtered = allProjects.filter(project => {
        const matchesSearch = 
            (project.project_name && project.project_name.toLowerCase().includes(searchTerm)) ||
            (project.project_code && project.project_code.toLowerCase().includes(searchTerm)) ||
            (project.project_address && project.project_address.toLowerCase().includes(searchTerm));

        const matchesStatus = (selectedStatus === 'ALL') || (project.status === selectedStatus);

        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    const activeWorkspaceId = localStorage.getItem('activeProjectId');

    grid.innerHTML = filtered.map(project => {
        let progress = 0;
        if (taskStatsByProject[project.id] && taskStatsByProject[project.id].total > 0) {
            const stats = taskStatsByProject[project.id];
            progress = Math.round((stats.completed / stats.total) * 100);
        } else if (project.progress_percentage !== undefined && project.progress_percentage !== null) {
            progress = project.progress_percentage;
        }

        const isCurrentWorkspace = (activeWorkspaceId === project.id);
        const statusBadge = getStatusBadge(project.status);
        const budgetFormatted = Number(project.estimated_budget || 0).toLocaleString('en-IN');
        const sqftFormatted = Number(project.total_sqft || 0).toLocaleString('en-IN');

        const mapButton = project.map_link ? `
            <a href="${project.map_link}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 truncate">
                <svg class="w-3.5 h-3.5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <span class="truncate">${project.project_address || 'View on Google Maps'}</span>
            </a>
        ` : `
            <p class="text-xs text-gray-500 flex items-center gap-1 mt-1 truncate">
                <svg class="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
                <span class="truncate">${project.project_address || 'Location Not Specified'}</span>
            </p>
        `;

        const photoBanner = project.project_photo_url ? `
            <div class="h-36 w-full rounded-xl overflow-hidden relative mb-4 bg-slate-100">
                <img src="${project.project_photo_url}" alt="${project.project_name}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent"></div>
                <div class="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-black/60 text-white tracking-wider">${project.project_code}</span>
                    ${statusBadge}
                </div>
            </div>
        ` : `
            <div class="h-28 w-full rounded-xl bg-gradient-to-r from-slate-800 to-[#1E3A5F] flex flex-col justify-between p-3 mb-4 shadow-inner text-white">
                <div class="flex justify-between items-start">
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-white/20 text-white tracking-wider">${project.project_code}</span>
                    ${statusBadge}
                </div>
                <div class="flex items-center gap-2">
                    <svg class="w-6 h-6 text-amber-400 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    <span class="text-xs font-semibold text-slate-200 uppercase tracking-wider">${project.project_type || 'Civil Construction'}</span>
                </div>
            </div>
        `;

        return `
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between border ${isCurrentWorkspace ? 'ring-2 ring-amber-400 border-amber-300' : 'border-white/60'} hover:shadow-xl transition-all duration-300">
                <div>
                    ${photoBanner}

                    <div class="mb-2">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-bold prayosha-navy truncate" title="${project.project_name}">${project.project_name}</h3>
                            ${isCurrentWorkspace ? '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">Active</span>' : ''}
                        </div>
                        ${mapButton}
                    </div>

                    <div class="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Total Area</span>
                            <span class="font-bold text-slate-700">${sqftFormatted} Sq.Ft</span>
                        </div>
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Est. Budget</span>
                            <span class="font-bold text-emerald-700">₹${budgetFormatted}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Type</span>
                            <span class="font-medium text-slate-600 truncate block">${project.project_type || 'N/A'}</span>
                        </div>
                        <div>
                            <span class="block text-[10px] text-gray-400 uppercase font-semibold">Contract</span>
                            <span class="font-medium text-slate-600 truncate block">${project.contract_type || 'N/A'}</span>
                        </div>
                    </div>

                    <div class="mb-4">
                        <div class="flex justify-between items-center text-xs mb-1">
                            <span class="font-medium text-gray-500">Overall Progress</span>
                            <span class="font-bold text-slate-800">${progress}%</span>
                        </div>
                        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div class="bg-amber-400 h-2 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                        </div>
                    </div>
                </div>

                <div>
                    <div class="pt-3 border-t border-slate-100 flex items-center gap-2">
                        <button type="button" class="btn-inspect flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center justify-center gap-1.5" data-id="${project.id}">
                            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                            Inspect
                        </button>

                        <button type="button" class="btn-activate flex-1 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ${
                            isCurrentWorkspace 
                                ? 'bg-emerald-600 text-white cursor-default' 
                                : 'bg-prayosha-navy text-white hover:bg-opacity-90'
                        }" data-id="${project.id}">
                            ${isCurrentWorkspace 
                                ? '<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Active' 
                                : '<svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Work On Project'
                            }
                        </button>
                    </div>

                    ${isCurrentWorkspace ? `
                        <div class="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
                            <a href="../tasks/active-tasks.html" class="py-1.5 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold text-center flex items-center justify-center gap-1 transition">
                                <span>🏗️ Civil Tasks</span>
                            </a>
                            <a href="../inventory/stock-overview.html" class="py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold text-center flex items-center justify-center gap-1 transition">
                                <span>📦 Stock & Materials</span>
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('.btn-activate').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            activateWorkspaceProject(projectId);
        });
    });

    grid.querySelectorAll('.btn-inspect').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.currentTarget.getAttribute('data-id');
            openArchitectureModal(projectId);
        });
    });
}

// ==========================================
// WORKSPACE ACTIVATION
// ==========================================
function activateWorkspaceProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    localStorage.setItem('activeProjectId', project.id);
    localStorage.setItem('activeProjectCode', project.project_code);
    localStorage.setItem('activeProjectName', project.project_name);

    filterAndRenderProjects();
    showToast(`Active workspace switched to "${project.project_name}"`, 'success');

    // Notify universal shell top navbar dropdown and dashboard launchpad
    window.dispatchEvent(new CustomEvent('prayosha:project-switched', { detail: project }));
    window.dispatchEvent(new CustomEvent('projectChanged', { 
        detail: { projectId: project.id, projectName: project.project_name } 
    }));
}

// ==========================================
// ARCHITECTURE INSPECTION MODAL
// ==========================================
async function openArchitectureModal(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    currentModalProject = project;

    const modal = document.getElementById('architectureModal');
    const codeEl = document.getElementById('modalProjectCode');
    const nameEl = document.getElementById('modalProjectName');
    const metaEl = document.getElementById('modalProjectMeta');
    const contentEl = document.getElementById('modalZonesContent');

    codeEl.textContent = project.project_code;
    nameEl.textContent = project.project_name;
    metaEl.textContent = `${project.project_type || 'Project'} • ${project.project_address || 'Gujarat'} • Est. Budget: ₹${Number(project.estimated_budget || 0).toLocaleString('en-IN')}`;

    contentEl.innerHTML = `
        <div class="py-12 text-center text-gray-500 flex flex-col items-center justify-center gap-2 animate-pulse">
            <svg class="w-8 h-8 text-amber-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <p class="text-sm font-medium">Loading architectural zones and unit configurations...</p>
        </div>
    `;

    modal.classList.remove('hidden');

    try {
        const { data: zones, error } = await supabase
            .from('project_zones')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!zones || zones.length === 0) {
            contentEl.innerHTML = `
                <div class="p-8 text-center text-gray-500 bg-slate-50 rounded-2xl border border-dashed border-gray-300">
                    <p class="font-semibold text-gray-700">No architecture or zones recorded yet.</p>
                    <p class="text-xs text-gray-400 mt-1">This project does not have tower or facility records saved.</p>
                </div>
            `;
            return;
        }

        const structuresMap = {};
        zones.forEach(zone => {
            const structure = zone.tower_name || 'Common Area';
            if (!structuresMap[structure]) structuresMap[structure] = [];
            structuresMap[structure].push(zone);
        });

        let html = '';
        Object.keys(structuresMap).forEach(structureName => {
            const structureZones = structuresMap[structureName];
            const isCommon = structureZones.some(z => z.zone_type === 'Common Zone' || z.zone_type === 'Common');

            if (isCommon) {
                html += `
                    <div class="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-200/80">
                        <div class="flex items-center gap-2 mb-3">
                            <span class="w-3 hand-3 rounded-full bg-emerald-500"></span>
                            <h4 class="font-bold text-base text-emerald-950">${structureName}</h4>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            ${structureZones.map(z => `
                                <div class="bg-white p-3 rounded-xl border border-emerald-100 shadow-sm flex justify-between items-center text-xs">
                                    <div>
                                        <p class="font-bold text-slate-800">${z.floor_name || z.zone_name || 'Ground'}</p>
                                        <p class="text-gray-500 text-[11px]">${z.amenity || 'N.A.'}</p>
                                    </div>
                                    <div class="text-right">
                                        <span class="font-bold text-emerald-700 text-sm">${z.unit_configuration?.total_area || 0}</span>
                                        <span class="text-[10px] text-gray-400 block uppercase">Sq.Ft</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                        <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                            <h4 class="font-bold text-base prayosha-navy">${structureName}</h4>
                            <span class="text-xs text-gray-500 font-semibold">${structureZones.length} Level(s) Configured</span>
                        </div>
                        <div class="space-y-3">
                            ${structureZones.map(z => {
                                const config = z.unit_configuration || {};
                                const hasFlats = (z.total_flats > 0);
                                const hasShops = (z.total_shops > 0);
                                const hasAmenities = z.amenity && z.amenity !== 'N.A.';
                                const hasRooms = config.rooms && Object.keys(config.rooms).length > 0;

                                return `
                                    <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
                                        <div class="flex flex-wrap justify-between items-center gap-2 mb-2">
                                            <span class="font-bold text-slate-800 text-sm">${z.floor_name}</span>
                                            <div class="flex items-center gap-2 text-[11px]">
                                                ${hasFlats ? `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">${z.total_flats} Flats</span>` : ''}
                                                ${hasShops ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">${z.total_shops} Shops</span>` : ''}
                                                ${hasAmenities ? `<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">${z.amenity}</span>` : ''}
                                            </div>
                                        </div>

                                        ${(config.flats?.length > 0 || config.shops?.length > 0 || hasRooms || config.amenities_sizes) ? `
                                            <div class="mt-2 pt-2 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-gray-600">
                                                ${config.flats?.length > 0 ? `
                                                    <div>
                                                        <span class="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Flat Sizes (Sq.Ft):</span>
                                                        <p class="font-mono text-slate-700 truncate">${config.flats.join(', ')}</p>
                                                    </div>
                                                ` : ''}
                                                ${config.shops?.length > 0 ? `
                                                    <div>
                                                        <span class="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Shop Sizes (Sq.Ft):</span>
                                                        <p class="font-mono text-slate-700 truncate">${config.shops.join(', ')}</p>
                                                    </div>
                                                ` : ''}
                                                ${hasRooms ? `
                                                    <div class="col-span-full">
                                                        <span class="text-[10px] font-bold text-indigo-600 uppercase block mb-0.5">Custom Room Sizes (Sq.Ft):</span>
                                                        <p class="text-slate-700">${Object.entries(config.rooms).map(([k, v]) => `${k}: <b>${v}</b>`).join(' | ')}</p>
                                                    </div>
                                                ` : ''}
                                                ${config.amenities_sizes && Object.keys(config.amenities_sizes).length > 0 ? `
                                                    <div class="col-span-full">
                                                        <span class="text-[10px] font-bold text-emerald-600 uppercase block mb-0.5">Amenity Sizes (Sq.Ft):</span>
                                                        <p class="text-slate-700">${Object.entries(config.amenities_sizes).map(([k, v]) => `${k}: <b>${v}</b>`).join(' | ')}</p>
                                                    </div>
                                                ` : ''}
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        });

        contentEl.innerHTML = html;

    } catch (err) {
        console.error('Error fetching project zones:', err);
        contentEl.innerHTML = `
            <div class="p-6 text-center text-red-600 bg-red-50 rounded-2xl border border-red-200 text-xs">
                Could not load zones for this project: ${err.message}
            </div>
        `;
    }
}

function setupModalHandlers() {
    const modal = document.getElementById('architectureModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const closeActionBtn = document.getElementById('modalCloseActionBtn');
    const activateModalBtn = document.getElementById('modalActivateProjectBtn');

    const closeModal = () => modal.classList.add('hidden');

    closeBtn.addEventListener('click', closeModal);
    closeActionBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });

    activateModalBtn.addEventListener('click', () => {
        if (currentModalProject) {
            activateWorkspaceProject(currentModalProject.id);
            closeModal();
        }
    });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function getStatusBadge(status) {
    switch (status) {
        case 'On Going':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500 text-white shadow-sm">On Going</span>';
        case 'Completed':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500 text-white shadow-sm">Completed</span>';
        case 'On Hold':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500 text-white shadow-sm">On Hold</span>';
        case 'Planning Completed, But Construction Not Started':
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400 text-slate-900 shadow-sm">Planned, Not Started</span>';
        case 'Planning':
        default:
            return '<span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-700">Planning</span>';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');

    const bgClass = type === 'success' 
        ? 'bg-slate-900/90 border-emerald-500 text-white' 
        : 'bg-slate-900/90 border-amber-500 text-white';

    toast.className = `glass-card pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0 ${bgClass}`;
    toast.innerHTML = `
        <span class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-emerald-400' : 'bg-amber-400'}"></span>
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