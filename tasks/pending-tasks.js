/**
 * Prayosha ERP - Pending Tasks & Hierarchical Zone Tree Controller
 * File: /tasks/pending-tasks.js
 * 
 * Features:
 * 1. Project Context Filter: Scopes floor tree and pending tasks to activeProjectId / activeProjectName.
 * 2. Multi-Level Floor Hierarchy: Groups all project Zone IDs into collapsible Floor and Category accordions.
 * 3. Dynamic Zone Synthesis: Queries project_map_zones or synthesizes discrete zones from project_zones architecture.
 * 4. Staged Work Binding: Maps civil_tasks (Not Started / In Progress) directly to their respective zones.
 * 5. Execution State Transitions: Transitions staged tasks to 'In Progress' with automatic started_date stamping.
 * 6. Interactive Toolbar: Supports Tower filtering, Zone ID live search, and Expand/Collapse All triggers.
 */

import { supabase } from '../config.js';

// Supabase Client Fallback
const client = supabase || (window.supabaseClient ? window.supabaseClient : (window.supabase 
    ? window.supabase.createClient(
        window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co',
        window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0'
    ) 
    : null));

// DOM Elements
const taskContainer = document.getElementById('pending-tasks-container');
const projectBadge = document.getElementById('activeProjectBadge');
const towerFilter = document.getElementById('towerFilter');
const zoneSearchInput = document.getElementById('zoneSearchInput');
const btnExpandAll = document.getElementById('btnExpandAll');
const btnCollapseAll = document.getElementById('btnCollapseAll');
const refreshPendingBtn = document.getElementById('refreshPendingBtn');

// In-Memory State
let projectZonesList = [];
let projectTasksMap = new Map(); // zone_id -> array of tasks
let availableTowers = [];

/**
 * 1. Initialize and Load Project Tree
 */
async function loadPendingTasksTree() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    // Update Toolbar Project Badge
    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    if (!taskContainer) return;

    taskContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <svg class="animate-spin h-7 w-7 text-brand-amber mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span class="text-xs font-semibold">Building hierarchical zone tree for ${activeProjectName || 'current project'}...</span>
        </div>
    `;

    if (!client) {
        taskContainer.innerHTML = `
            <div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                Supabase client connection not detected. Please verify config.js.
            </div>
        `;
        return;
    }

    try {
        // Step A: Load Zones for Active Project
        let zones = await fetchProjectZones(activeProjectId, activeProjectName);

        // Step B: Load all Civil Tasks for this Project
        let tasksQuery = client
            .from('civil_tasks')
            .select('*');

        if (activeProjectId && activeProjectName) {
            tasksQuery = tasksQuery.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            tasksQuery = tasksQuery.eq('project_name', activeProjectName);
        }

        const { data: civilTasks, error: tasksError } = await tasksQuery;
        if (tasksError) throw tasksError;

        // Index tasks by Zone ID (normalized uppercase)
        projectTasksMap.clear();
        (civilTasks || []).forEach(task => {
            const zId = (task.zone_id || task.Zone_ID || '').trim().toUpperCase();
            if (zId) {
                if (!projectTasksMap.has(zId)) {
                    projectTasksMap.set(zId, []);
                }
                projectTasksMap.get(zId).push(task);
            }
        });

        projectZonesList = zones;

        // Step C: Populate Tower Filter
        populateTowerFilter();

        // Step D: Render Accordion View
        renderHierarchicalTree();

    } catch (err) {
        console.error('[Pending Tasks Hierarchy Error]:', err);
        taskContainer.innerHTML = `
            <div class="p-5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to load zone hierarchy</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
                <button id="btnRetryPending" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                    Retry Connection
                </button>
            </div>
        `;
        const retryBtn = document.getElementById('btnRetryPending');
        if (retryBtn) retryBtn.addEventListener('click', loadPendingTasksTree);
    }
}

/**
 * 2. Fetch or Synthesize Project Zones
 */
async function fetchProjectZones(projectId, projectName) {
    if (!projectId && !projectName) return [];

    // Attempt 1: Fetch from project_map_zones
    try {
        let mapQuery = client
            .from('project_map_zones')
            .select('*')
            .order('zone_id', { ascending: true });

        if (projectId) {
            mapQuery = mapQuery.eq('project_id', projectId);
        }

        const { data: mapZones, error: mapErr } = await mapQuery;

        if (!mapErr && mapZones && mapZones.length > 0) {
            return mapZones;
        }
    } catch (e) {
        console.warn('[Zone Tree] project_map_zones lookup bypassed:', e);
    }

    // Attempt 2: Fetch architectural specifications from project_zones and synthesize
    try {
        let archQuery = client
            .from('project_zones')
            .select('*')
            .order('created_at', { ascending: true });

        if (projectId) {
            archQuery = archQuery.eq('project_id', projectId);
        }

        const { data: archZones, error: archErr } = await archQuery;
        if (archErr) throw archErr;

        if (archZones && archZones.length > 0) {
            let synthesizedAll = [];
            archZones.forEach(record => {
                const unpacked = synthesizeZonesForRecord(projectId, record);
                synthesizedAll = synthesizedAll.concat(unpacked);
            });

            // Attempt to persist synthesized zones in background for subsequent calls
            if (synthesizedAll.length > 0) {
                client.from('project_map_zones').insert(synthesizedAll).then().catch(() => {});
            }

            return synthesizedAll;
        }
    } catch (err) {
        console.warn('[Zone Tree] project_zones synthesis error:', err);
    }

    return [];
}

/**
 * Architectural Synthesizer Helper
 */
function synthesizeZonesForRecord(projectId, record) {
    const tower = record.tower_name || 'Tower A';
    const floor = record.floor_name || record.zone_name || 'Ground Floor';
    const towerPrefix = tower.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
    const floorPrefix = getFloorAbbreviation(floor);

    const config = record.unit_configuration || {};
    const totalFlats = parseInt(record.total_flats) || 0;
    const totalShops = parseInt(record.total_shops) || 0;
    const zones = [];

    // Flats
    for (let f = 1; f <= totalFlats; f++) {
        const zoneId = `${towerPrefix}-${floorPrefix}-FLAT-${String(f).padStart(2, '0')}`;
        const flatSize = (config.flats && config.flats[f - 1]) ? `${config.flats[f - 1]} sq.ft` : 'N/A';
        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: zoneId,
            room_identifier: `Flat ${f}`,
            category: 'Flat',
            area_type: 'Residential',
            department: 'Civil',
            room_size: flatSize
        });
    }

    // Shops
    for (let s = 1; s <= totalShops; s++) {
        const zoneId = `${towerPrefix}-${floorPrefix}-SHOP-${String(s).padStart(2, '0')}`;
        const shopSize = (config.shops && config.shops[s - 1]) ? `${config.shops[s - 1]} sq.ft` : 'N/A';
        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: zoneId,
            room_identifier: `Shop ${s}`,
            category: 'Shop',
            area_type: 'Commercial',
            department: 'Civil',
            room_size: shopSize
        });
    }

    // Amenities
    if (config.amenities_sizes && typeof config.amenities_sizes === 'object') {
        Object.entries(config.amenities_sizes).forEach(([amenityName, size], idx) => {
            const slug = amenityName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
            const zoneId = `${towerPrefix}-${floorPrefix}-${slug}-${String(idx + 1).padStart(2, '0')}`;
            zones.push({
                project_id: projectId,
                tower_name: tower,
                floor_level: floor,
                zone_id: zoneId,
                room_identifier: amenityName,
                category: 'Amenity',
                area_type: 'Common',
                department: 'Civil',
                room_size: size ? `${size} sq.ft` : 'N/A'
            });
        });
    }

    // Custom Rooms / Facilities
    if (config.rooms && typeof config.rooms === 'object') {
        Object.entries(config.rooms).forEach(([roomName, size], idx) => {
            const slug = roomName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
            const zoneId = `${towerPrefix}-${floorPrefix}-${slug}-${String(idx + 1).padStart(2, '0')}`;
            zones.push({
                project_id: projectId,
                tower_name: tower,
                floor_level: floor,
                zone_id: zoneId,
                room_identifier: roomName,
                category: 'Facility Room',
                area_type: 'Common',
                department: 'Civil',
                room_size: size ? `${size} sq.ft` : 'N/A'
            });
        });
    }

    // Common Landscape
    if (record.zone_type === 'Common Zone') {
        const zoneId = `GND-${towerPrefix}-001`;
        const groundArea = config.total_area ? `${config.total_area} sq.ft` : 'N/A';
        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: zoneId,
            room_identifier: tower,
            category: 'Common Zone',
            area_type: 'Landscape',
            department: 'Civil',
            room_size: groundArea
        });
    }

    // Generic Floor Zone
    if (zones.length === 0) {
        const zoneId = `${towerPrefix}-${floorPrefix}-Z01`;
        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: zoneId,
            room_identifier: record.amenity && record.amenity !== 'N.A.' ? record.amenity : floor,
            category: record.zone_type || 'Civil Zone',
            area_type: 'General',
            department: 'Civil',
            room_size: 'N/A'
        });
    }

    return zones;
}

function getFloorAbbreviation(floorName) {
    const f = (floorName || '').toLowerCase();
    if (f.includes('basement 2')) return 'BM2';
    if (f.includes('basement 1')) return 'BM1';
    if (f.includes('basement')) return 'BM';
    if (f.includes('ground')) return 'GF';
    if (f.includes('podium')) return 'POD';
    if (f.includes('terrace')) return 'TER';
    if (f.includes('1st')) return '1F';
    if (f.includes('2nd')) return '2F';
    if (f.includes('3rd')) return '3F';
    const numMatch = f.match(/\d+/);
    if (numMatch) return `${numMatch[0]}F`;
    return f.slice(0, 3).toUpperCase();
}

/**
 * 3. Populate Tower Filter Dropdown
 */
function populateTowerFilter() {
    if (!towerFilter) return;

    const rawTowers = projectZonesList.map(z => (z.tower_name || '').trim()).filter(Boolean);
    availableTowers = Array.from(new Set(rawTowers)).sort();

    const currentVal = towerFilter.value;
    towerFilter.innerHTML = '<option value="">All Towers / Blocks</option>';
    availableTowers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (t === currentVal) opt.selected = true;
        towerFilter.appendChild(opt);
    });
}

/**
 * 4. Helper: Civil Floor Sorting Weight
 */
function getFloorSortWeight(floorName) {
    const f = (floorName || '').toLowerCase();
    if (f.includes('basement 4')) return -40;
    if (f.includes('basement 3')) return -30;
    if (f.includes('basement 2')) return -20;
    if (f.includes('basement 1') || f === 'basement') return -10;
    if (f.includes('lower ground')) return -5;
    if (f.includes('ground')) return 0;
    if (f.includes('podium')) return 5;
    if (f.includes('terrace')) return 990;
    if (f.includes('common') || f.includes('landscape')) return 1000;

    const match = f.match(/\d+/);
    if (match) return parseInt(match[0], 10);
    return 100;
}

/**
 * 5. Render Floor-Wise Accordion Tree
 */
function renderHierarchicalTree() {
    if (!taskContainer) return;

    const selectedTower = (towerFilter ? towerFilter.value.trim().toLowerCase() : '');
    const searchQuery = (zoneSearchInput ? zoneSearchInput.value.trim().toLowerCase() : '');

    // Filter zones based on toolbar controls
    const filteredZones = projectZonesList.filter(z => {
        const matchesTower = !selectedTower || (z.tower_name || '').toLowerCase() === selectedTower;
        const zId = (z.zone_id || '').toLowerCase();
        const rId = (z.room_identifier || '').toLowerCase();
        const cat = (z.category || '').toLowerCase();
        const fl = (z.floor_level || '').toLowerCase();

        const matchesSearch = !searchQuery || (
            zId.includes(searchQuery) ||
            rId.includes(searchQuery) ||
            cat.includes(searchQuery) ||
            fl.includes(searchQuery)
        );

        return matchesTower && matchesSearch;
    });

    taskContainer.innerHTML = '';

    if (filteredZones.length === 0) {
        taskContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 text-center bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <div class="w-12 h-12 rounded-2xl bg-brand-navy/10 text-brand-navy flex items-center justify-center text-xl mb-3">
                    🏢
                </div>
                <h3 class="text-sm font-bold text-slate-700 mb-1">No Zones Match Your Query</h3>
                <p class="text-xs text-slate-400 max-w-md">No floor zones found for this project structure. Try clearing filters or create zones under Project Settings.</p>
                <a href="../projects/project-dashboard.html" class="mt-4 px-4 py-2 bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold rounded-xl shadow-md transition">
                    View Project Architecture
                </a>
            </div>
        `;
        return;
    }

    // Group filtered zones by Floor Level
    const floorGroups = {};
    filteredZones.forEach(zone => {
        const floorKey = (zone.floor_level || 'General Level').trim();
        if (!floorGroups[floorKey]) floorGroups[floorKey] = [];
        floorGroups[floorKey].push(zone);
    });

    // Sort floors logically
    const sortedFloors = Object.keys(floorGroups).sort((a, b) => getFloorSortWeight(a) - getFloorSortWeight(b));

    // Render floor accordions
    sortedFloors.forEach((floorName, index) => {
        const zonesOnFloor = floorGroups[floorName];
        const floorZoneCount = zonesOnFloor.length;

        // Count pending tasks on this floor
        let pendingTaskCount = 0;
        zonesOnFloor.forEach(z => {
            const zTasks = projectTasksMap.get((z.zone_id || '').toUpperCase()) || [];
            pendingTaskCount += zTasks.filter(t => (t.status || '').trim().toLowerCase() === 'not started').length;
        });

        const floorCard = document.createElement('div');
        floorCard.className = 'floor-accordion-card bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm transition-all mb-4';

        // Auto-expand first floor or when actively searching
        const isDefaultOpen = (index === 0) || searchQuery.length > 0;

        floorCard.innerHTML = `
            <!-- Floor Accordion Header -->
            <button type="button" class="floor-toggle-btn w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50/70 transition bg-white select-none">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-xl bg-brand-navy/10 text-brand-navy flex items-center justify-center font-bold text-sm">
                        <svg class="w-4 h-4 text-brand-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    </div>
                    <div>
                        <span class="font-bold text-brand-navy text-sm uppercase tracking-wide block">${floorName}</span>
                        <span class="text-[11px] text-slate-400 font-medium">Floor Level Package</span>
                    </div>
                </div>

                <div class="flex items-center gap-2.5">
                    ${pendingTaskCount > 0 ? `
                        <span class="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                            ${pendingTaskCount} Staged Task${pendingTaskCount > 1 ? 's' : ''}
                        </span>
                    ` : ''}
                    <span class="bg-slate-100 text-slate-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                        ${floorZoneCount} Zone${floorZoneCount > 1 ? 's' : ''}
                    </span>
                    <svg class="floor-arrow w-4 h-4 text-slate-400 transform transition-transform duration-200 ${isDefaultOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                </div>
            </button>

            <!-- Floor Body: Category Folders & Zones -->
            <div class="floor-content border-t border-slate-100 ${isDefaultOpen ? '' : 'hidden'} bg-slate-50/40 p-4 space-y-4">
                ${generateCategoriesHTML(zonesOnFloor)}
            </div>
        `;

        taskContainer.appendChild(floorCard);
    });

    // Wire Floor Accordion Toggle Buttons
    taskContainer.querySelectorAll('.floor-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.floor-accordion-card');
            const content = card.querySelector('.floor-content');
            const arrow = card.querySelector('.floor-arrow');

            const isClosed = content.classList.contains('hidden');
            if (isClosed) {
                content.classList.remove('hidden');
                arrow.classList.add('rotate-180');
            } else {
                content.classList.add('hidden');
                arrow.classList.remove('rotate-180');
            }
        });
    });

    // Wire Sub-Folder Category Toggles
    taskContainer.querySelectorAll('.category-folder-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const folder = btn.closest('.category-folder-card');
            const folderContent = folder.querySelector('.category-folder-content');
            const folderArrow = folder.querySelector('.folder-arrow');

            const isClosed = folderContent.classList.contains('hidden');
            if (isClosed) {
                folderContent.classList.remove('hidden');
                folderArrow.classList.add('rotate-180');
            } else {
                folderContent.classList.add('hidden');
                folderArrow.classList.remove('rotate-180');
            }
        });
    });

    // Wire Start Task Trigger Buttons
    taskContainer.querySelectorAll('.btn-start-civil-task').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const taskId = btn.getAttribute('data-task-id');
            await startCivilTask(taskId, btn);
        });
    });
}

/**
 * 6. Generate Category Sub-Folders HTML
 */
function generateCategoriesHTML(zonesOnFloor) {
    // Group zones by category
    const catGroups = {};
    zonesOnFloor.forEach(zone => {
        const catKey = (zone.category || 'General Space').trim();
        if (!catGroups[catKey]) catGroups[catKey] = [];
        catGroups[catKey].push(zone);
    });

    const sortedCategories = Object.keys(catGroups).sort();

    let html = '';
    sortedCategories.forEach(catName => {
        const zonesInCat = catGroups[catName];
        const catCount = zonesInCat.length;

        html += `
            <div class="category-folder-card bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
                <!-- Folder Header -->
                <button type="button" class="category-folder-toggle w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition bg-white select-none">
                    <div class="flex items-center gap-2">
                        <span class="text-amber-500 text-sm">📁</span>
                        <span class="text-xs font-bold text-slate-800 uppercase tracking-wide">${catName}</span>
                        <span class="bg-brand-navy/10 text-brand-navy text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
                            ${catCount}
                        </span>
                    </div>

                    <div class="flex items-center gap-2">
                        <svg class="folder-arrow w-3.5 h-3.5 text-slate-400 transform transition-transform duration-200 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </div>
                </button>

                <!-- Zone ID Grid -->
                <div class="category-folder-content border-t border-slate-100 p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    ${zonesInCat.map(zone => renderZoneCardHTML(zone)).join('')}
                </div>
            </div>
        `;
    });

    return html;
}

/**
 * 7. Render Individual Zone Card HTML
 */
function renderZoneCardHTML(zone) {
    const zoneId = zone.zone_id || 'ZONE';
    const roomIdentifier = zone.room_identifier || '';
    const roomSize = zone.room_size && zone.room_size !== 'N/A' ? zone.room_size : '';
    const tower = zone.tower_name || '';
    const floor = zone.floor_level || '';

    // Check tasks mapped to this zone
    const tasks = projectTasksMap.get(zoneId.toUpperCase()) || [];
    const notStartedTasks = tasks.filter(t => (t.status || '').trim().toLowerCase() === 'not started');
    const inProgressTasks = tasks.filter(t => (t.status || '').trim().toLowerCase() === 'in progress');

    let statusContent = '';

    if (notStartedTasks.length > 0) {
        // Has Staged / Pending Tasks awaiting start
        const latestPending = notStartedTasks[0];
        statusContent = `
            <div class="mt-2.5 pt-2.5 border-t border-amber-100 bg-amber-50/60 -mx-3.5 -mb-3.5 p-3 rounded-b-xl flex flex-col gap-2">
                <div class="flex items-center justify-between text-[11px]">
                    <span class="font-bold text-amber-900 truncate">⏳ ${latestPending.category || 'Civil Package'}</span>
                    <span class="text-[10px] font-semibold text-slate-500">${latestPending.assigned_agency || 'Pending Agency'}</span>
                </div>
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] text-slate-500 font-medium">Target: ${latestPending.expected_completion_date || 'N/A'}</span>
                    <button type="button" data-task-id="${latestPending.id}" class="btn-start-civil-task bg-brand-navy hover:bg-brand-navyDark text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-xs transition flex items-center gap-1">
                        <span>▶</span>
                        <span>Start Task</span>
                    </button>
                </div>
            </div>
        `;
    } else if (inProgressTasks.length > 0) {
        // Ongoing task
        const activeT = inProgressTasks[0];
        statusContent = `
            <div class="mt-2.5 pt-2.5 border-t border-emerald-100 bg-emerald-50/60 -mx-3.5 -mb-3.5 p-3 rounded-b-xl flex items-center justify-between">
                <span class="text-[11px] font-bold text-emerald-800 truncate">⚙ ${activeT.category || 'In Progress'}</span>
                <a href="active-tasks.html?zone_id=${encodeURIComponent(zoneId)}" class="text-[10px] font-bold text-brand-navy hover:text-brand-amber transition">
                    View Live ↗
                </a>
            </div>
        `;
    } else {
        // No task assigned: Ready for mobilization
        const logTaskParams = new URLSearchParams({
            zone_id: zoneId,
            tower: tower,
            floor: floor
        });

        statusContent = `
            <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                <span class="text-[10px] font-semibold text-slate-400">Available / Clean</span>
                <a href="log-task.html?${logTaskParams.toString()}" class="text-[10px] font-bold text-brand-navy hover:text-brand-amber bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md transition">
                    + Log Task
                </a>
            </div>
        `;
    }

    return `
        <div class="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs hover:shadow-sm transition flex flex-col justify-between">
            <div>
                <div class="flex items-center justify-between gap-1 mb-1">
                    <span class="font-bold text-brand-navy text-xs tracking-tight">${zoneId}</span>
                    ${roomSize ? `<span class="text-[10px] text-slate-400 font-medium">${roomSize}</span>` : ''}
                </div>
                <div class="text-xs font-semibold text-slate-700 truncate">
                    ${roomIdentifier || zone.category || 'Target Area'}
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">
                    ${tower}${tower && floor ? ' • ' : ''}${floor}
                </div>
            </div>

            ${statusContent}
        </div>
    `;
}

/**
 * 8. Transition Civil Task to In Progress
 */
async function startCivilTask(taskId, btnElement) {
    if (!taskId) return;

    const originalHtml = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = `
        <svg class="animate-spin h-3 w-3 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
    `;

    try {
        const todayDate = new Date().toISOString().split('T')[0];

        const { error } = await client
            .from('civil_tasks')
            .update({
                status: 'In Progress',
                started_date: todayDate,
                updated_at: new Date().toISOString()
            })
            .eq('id', taskId);

        if (error) throw error;

        // Reload tree to reflect transition
        await loadPendingTasksTree();

    } catch (err) {
        console.error('[Task Transition Failed]:', err);
        alert('Failed to start task: ' + (err.message || 'Database error'));
        btnElement.disabled = false;
        btnElement.innerHTML = originalHtml;
    }
}

/**
 * 9. Toolbar Event Handlers
 */
if (zoneSearchInput) {
    zoneSearchInput.addEventListener('input', () => {
        renderHierarchicalTree();
    });
}

if (towerFilter) {
    towerFilter.addEventListener('change', () => {
        renderHierarchicalTree();
    });
}

if (btnExpandAll) {
    btnExpandAll.addEventListener('click', () => {
        document.querySelectorAll('.floor-content').forEach(c => c.classList.remove('hidden'));
        document.querySelectorAll('.floor-arrow').forEach(a => a.classList.add('rotate-180'));
        document.querySelectorAll('.category-folder-content').forEach(c => c.classList.remove('hidden'));
        document.querySelectorAll('.folder-arrow').forEach(a => a.classList.add('rotate-180'));
    });
}

if (btnCollapseAll) {
    btnCollapseAll.addEventListener('click', () => {
        document.querySelectorAll('.floor-content').forEach(c => c.classList.add('hidden'));
        document.querySelectorAll('.floor-arrow').forEach(a => a.classList.remove('rotate-180'));
        document.querySelectorAll('.category-folder-content').forEach(c => c.classList.add('hidden'));
        document.querySelectorAll('.folder-arrow').forEach(a => a.classList.remove('rotate-180'));
    });
}

if (refreshPendingBtn) {
    refreshPendingBtn.addEventListener('click', () => {
        loadPendingTasksTree();
    });
}

// Cross-module project switch listener
window.addEventListener('prayosha:project-switched', async () => {
    await loadPendingTasksTree();
});

// Expose globally for onclick fallback
window.loadPendingTasks = loadPendingTasksTree;

// Initial Load
document.addEventListener('DOMContentLoaded', loadPendingTasksTree);