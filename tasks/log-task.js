/**
 * Prayosha ERP - Task Logging Controller
 * File: /tasks/log-task.js
 * 
 * Features:
 * 1. 3-Tier Cascading Hierarchy: Cascades Tower -> Floor Level -> Zone ID dynamically from database records.
 * 2. Execution Status Assignment: Automatically populates `started_date` on "In Progress" and `completed_date` on "Completed".
 * 3. Priority & Work Scope Binding: Captures priority level and granular task descriptions for site supervision.
 * 4. Automatic Zone Synchronization: Queries `project_map_zones` and provides synthesis fallback from `project_zones`.
 * 5. Context Retention: Preserves Project, Tower, and Floor selections across submissions for fast task entry.
 * 6. Resilient Supabase Integration: Graceful fallback for database columns (project_name & project_id).
 * 7. Executive Feedback UI: Styled status alerts with automatic timeout clearing.
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
const towerSelect = document.getElementById('tower_block');
const floorSelect = document.getElementById('floor_level');
const zoneSelect = document.getElementById('zone_id');
const prioritySelect = document.getElementById('priority');
const statusSelect = document.getElementById('task_status');
const taskDescInput = document.getElementById('task_description');
const feedbackBox = document.getElementById('form-feedback');

// State Cache
let currentProjectZones = [];

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
            
            let matchedOption = null;

            projects.forEach(project => {
                const opt = document.createElement('option');
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
                    matchedOption = opt;
                }

                projectSelect.appendChild(opt);
            });

            // If no match was found, default to first available project
            if (!matchedOption && projects.length > 0) {
                projectSelect.selectedIndex = 1;
                matchedOption = projectSelect.options[1];
            }

            if (matchedOption) {
                localStorage.setItem('activeProjectId', matchedOption.dataset.id);
                localStorage.setItem('activeProjectName', matchedOption.value);
                if (matchedOption.dataset.code) {
                    localStorage.setItem('activeProjectCode', matchedOption.dataset.code);
                }
                // Load towers and floors for the selected project
                await loadProjectStructure(matchedOption.dataset.id);
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
    resetStructureDropdowns();
}

/**
 * 2. Fetch and Populate Towers & Floors from project_zones
 */
async function loadProjectStructure(projectId) {
    if (!projectId) {
        resetStructureDropdowns();
        return;
    }

    towerSelect.innerHTML = '<option value="">-- Loading Towers --</option>';
    towerSelect.disabled = true;
    floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';
    floorSelect.disabled = true;
    resetZoneDropdown();

    if (!client) {
        resetStructureDropdowns();
        return;
    }

    try {
        const { data: zones, error } = await client
            .from('project_zones')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        currentProjectZones = zones || [];

        if (currentProjectZones.length === 0) {
            towerSelect.innerHTML = '<option value="">-- No Towers Configured --</option>';
            floorSelect.innerHTML = '<option value="">-- No Floors Configured --</option>';
            towerSelect.disabled = false;
            floorSelect.disabled = false;
            resetZoneDropdown();
            return;
        }

        // Extract distinct tower names
        const rawTowers = currentProjectZones.map(z => z.tower_name?.trim()).filter(Boolean);
        const uniqueTowers = Array.from(new Set(rawTowers));

        towerSelect.innerHTML = '<option value="">-- Select Tower --</option>';
        uniqueTowers.forEach(towerName => {
            const opt = document.createElement('option');
            opt.value = towerName;
            opt.textContent = towerName;
            towerSelect.appendChild(opt);
        });

        towerSelect.disabled = false;

        // Auto-select if only 1 tower exists
        if (uniqueTowers.length === 1) {
            towerSelect.value = uniqueTowers[0];
            populateFloorsForTower(uniqueTowers[0], projectId);
        } else {
            floorSelect.innerHTML = '<option value="">-- Select Tower First --</option>';
            floorSelect.disabled = true;
            resetZoneDropdown();
        }

    } catch (err) {
        console.error('[Task Logger] Error fetching project zones:', err);
        resetStructureDropdowns();
    }
}

/**
 * Populate Floor Dropdown based on the selected tower
 */
function populateFloorsForTower(selectedTower, projectId) {
    if (!selectedTower) {
        floorSelect.innerHTML = '<option value="">-- Select Tower First --</option>';
        floorSelect.disabled = true;
        resetZoneDropdown();
        return;
    }

    const matchingZones = currentProjectZones.filter(z => (z.tower_name || '').trim() === selectedTower.trim());
    const rawFloors = matchingZones.map(z => (z.floor_name || z.zone_name || '').trim()).filter(Boolean);
    const uniqueFloors = Array.from(new Set(rawFloors));

    floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';

    if (uniqueFloors.length === 0) {
        floorSelect.innerHTML = '<option value="">-- No Floors Configured --</option>';
        floorSelect.disabled = false;
        resetZoneDropdown();
    } else {
        uniqueFloors.forEach(floorName => {
            const opt = document.createElement('option');
            opt.value = floorName;
            opt.textContent = floorName;
            floorSelect.appendChild(opt);
        });

        floorSelect.disabled = false;
        resetZoneDropdown();
    }
}

/**
 * 3. Fetch and Populate Zone IDs from project_map_zones
 */
async function populateZonesForFloor(projectId, selectedTower, selectedFloor) {
    if (!projectId || !selectedTower || !selectedFloor) {
        resetZoneDropdown();
        return;
    }

    zoneSelect.innerHTML = '<option value="">-- Loading Zones... --</option>';
    zoneSelect.disabled = true;

    try {
        // Query granular zones saved in project_map_zones
        const { data: mapZones, error } = await client
            .from('project_map_zones')
            .select('*')
            .eq('project_id', projectId)
            .ilike('tower_name', selectedTower.trim())
            .ilike('floor_level', selectedFloor.trim())
            .order('zone_id', { ascending: true });

        if (error) throw error;

        if (mapZones && mapZones.length > 0) {
            zoneSelect.innerHTML = '<option value="">-- Select Zone ID --</option>';
            mapZones.forEach(zone => {
                const opt = document.createElement('option');
                opt.value = zone.zone_id;
                const label = zone.room_identifier ? `[${zone.zone_id}] ${zone.room_identifier}` : zone.zone_id;
                const categorySuffix = zone.category ? ` (${zone.category})` : '';
                opt.textContent = `${label}${categorySuffix}`;
                zoneSelect.appendChild(opt);
            });
            zoneSelect.disabled = false;
            return;
        }

        // Automatic fallback: synthesize from architecture specifications if not yet registered in project_map_zones
        const matchingArch = currentProjectZones.find(z => 
            (z.tower_name || '').trim().toLowerCase() === selectedTower.trim().toLowerCase() && 
            (z.floor_name || z.zone_name || '').trim().toLowerCase() === selectedFloor.trim().toLowerCase()
        );

        if (matchingArch) {
            const synthesized = synthesizeZonesForFloor(projectId, matchingArch);
            if (synthesized.length > 0) {
                try {
                    await client.from('project_map_zones').insert(synthesized);
                } catch (persistErr) {
                    console.warn('[Task Logger] Auto-persist synthesized zones notice:', persistErr);
                }

                zoneSelect.innerHTML = '<option value="">-- Select Zone ID --</option>';
                synthesized.forEach(zone => {
                    const opt = document.createElement('option');
                    opt.value = zone.zone_id;
                    const label = zone.room_identifier ? `[${zone.zone_id}] ${zone.room_identifier}` : zone.zone_id;
                    const categorySuffix = zone.category ? ` (${zone.category})` : '';
                    opt.textContent = `${label}${categorySuffix}`;
                    zoneSelect.appendChild(opt);
                });
                zoneSelect.disabled = false;
                return;
            }
        }

        zoneSelect.innerHTML = '<option value="">-- No Zones Found for This Floor --</option>';
        zoneSelect.disabled = false;

    } catch (err) {
        console.error('[Task Logger] Error fetching zones:', err);
        zoneSelect.innerHTML = '<option value="">-- Failed to Load Zones --</option>';
        zoneSelect.disabled = false;
    }
}

/**
 * Architectural Synthesizer Helper (Unpacks project_zones unit configurations)
 */
function synthesizeZonesForFloor(projectId, record) {
    const tower = record.tower_name || 'Tower A';
    const floor = record.floor_name || record.zone_name || 'Ground Floor';
    const towerPrefix = tower.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
    const floorPrefix = getFloorAbbreviation(floor);

    const config = record.unit_configuration || {};
    const totalFlats = parseInt(record.total_flats) || 0;
    const totalShops = parseInt(record.total_shops) || 0;
    const zones = [];

    // 1. Flats
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
            room_size: flatSize,
            slope: 'N/A',
            is_pinned: false
        });
    }

    // 2. Shops
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
            room_size: shopSize,
            slope: 'N/A',
            is_pinned: false
        });
    }

    // 3. Amenities
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
                room_size: size ? `${size} sq.ft` : 'N/A',
                slope: 'N/A',
                is_pinned: false
            });
        });
    }

    // 4. Custom Rooms (Clubhouse, Gym, Facility)
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
                room_size: size ? `${size} sq.ft` : 'N/A',
                slope: 'N/A',
                is_pinned: false
            });
        });
    }

    // 5. Common Landscape
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
            room_size: groundArea,
            slope: 'N/A',
            is_pinned: false
        });
    }

    // 6. Generic Level Fallback (e.g. Basement Parking or Raw Floor)
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
            room_size: 'N/A',
            slope: 'N/A',
            is_pinned: false
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
 * Reset Helper Functions
 */
function resetZoneDropdown() {
    zoneSelect.innerHTML = '<option value="">-- Select Floor First --</option>';
    zoneSelect.disabled = true;
}

function resetStructureDropdowns() {
    currentProjectZones = [];
    towerSelect.innerHTML = '<option value="">-- Select Tower --</option>';
    towerSelect.disabled = false;
    floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';
    floorSelect.disabled = false;
    resetZoneDropdown();
}

/**
 * 4. Event Listeners for Cascading Selection
 */
projectSelect.addEventListener('change', async function() {
    const selectedOption = this.options[this.selectedIndex];
    const projectId = selectedOption ? selectedOption.dataset.id : null;
    
    if (projectId) {
        localStorage.setItem('activeProjectId', projectId);
        localStorage.setItem('activeProjectName', selectedOption.value);
        if (selectedOption.dataset.code) {
            localStorage.setItem('activeProjectCode', selectedOption.dataset.code);
        }
        await loadProjectStructure(projectId);
    } else {
        resetStructureDropdowns();
    }
});

towerSelect.addEventListener('change', function() {
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const projectId = selectedOption ? selectedOption.dataset.id : localStorage.getItem('activeProjectId');
    populateFloorsForTower(this.value, projectId);
});

floorSelect.addEventListener('change', async function() {
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const projectId = selectedOption ? selectedOption.dataset.id : localStorage.getItem('activeProjectId');
    const selectedTower = towerSelect.value;
    const selectedFloor = this.value;

    if (projectId && selectedTower && selectedFloor) {
        await populateZonesForFloor(projectId, selectedTower, selectedFloor);
    } else {
        resetZoneDropdown();
    }
});

// Cross-module sync listener (e.g., when switched from navbar or project dashboard)
window.addEventListener('prayosha:project-switched', async (e) => {
    if (e.detail && e.detail.id) {
        projectSelect.value = e.detail.project_name;
        await loadProjectStructure(e.detail.id);
    }
});

/**
 * 5. Form Submission Handler
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

    // Extract form values
    const selectedProjectName = projectSelect.value;
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const selectedProjectId = selectedOption ? selectedOption.dataset.id : null;
    const currentTower = towerSelect.value;
    const currentFloor = floorSelect.value;
    const selectedZoneId = zoneSelect.value;
    const selectedStatus = statusSelect ? statusSelect.value : 'Not Started';
    const selectedPriority = prioritySelect ? prioritySelect.value : 'Medium';
    const taskDescription = taskDescInput ? taskDescInput.value.trim() : null;

    const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Build base payload matching civil_tasks schema
    const taskPayload = {
        project_name: selectedProjectName,
        tower_block: currentTower,
        floor_level: currentFloor,
        zone_id: selectedZoneId,
        category: document.getElementById('category').value,
        assigned_agency: document.getElementById('assigned_agency').value,
        expected_completion_date: document.getElementById('expected_completion_date').value,
        assigned_date: todayDate,
        status: selectedStatus,
        priority: selectedPriority,
        task_description: taskDescription || null
    };

    // Stamping started_date and completed_date accurately based on initial status
    if (selectedStatus === 'In Progress') {
        taskPayload.started_date = todayDate;
    } else if (selectedStatus === 'Completed') {
        taskPayload.started_date = todayDate;
        taskPayload.completed_date = todayDate;
    }

    if (selectedProjectId) {
        taskPayload.project_id = selectedProjectId;
    }

    try {
        if (!client) {
            throw new Error('Supabase client connection not found.');
        }

        // Insert task record with resilient column fallback
        let { error } = await client
            .from('civil_tasks')
            .insert([taskPayload]);

        // If project_id schema cache mismatch occurs, retry without project_id
        if (error && error.message && error.message.includes('project_id')) {
            const fallbackPayload = { ...taskPayload };
            delete fallbackPayload.project_id;
            const retryRes = await client.from('civil_tasks').insert([fallbackPayload]);
            error = retryRes.error;
        }

        if (error) throw error;

        // Success UI Feedback
        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-emerald-50 text-emerald-800 border border-emerald-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Task successfully logged as <strong>${selectedStatus}</strong> [Priority: ${selectedPriority}] and assigned to <strong>${taskPayload.zone_id}</strong>!</span>
        `;

        // Reset work package specific inputs while retaining Project, Tower, and Floor context
        document.getElementById('category').selectedIndex = 0;
        document.getElementById('assigned_agency').selectedIndex = 0;
        document.getElementById('expected_completion_date').value = '';
        if (statusSelect) statusSelect.value = 'Not Started';
        if (prioritySelect) prioritySelect.value = 'Medium';
        if (taskDescInput) taskDescInput.value = '';
        zoneSelect.selectedIndex = 0;

        // Set focus to Zone dropdown for smooth sequential task assignment
        zoneSelect.focus();

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

        // Clear feedback message after 6 seconds
        setTimeout(() => {
            feedbackBox.classList.add('hidden');
        }, 6000);
    }
});

// Run initialization on DOM load
document.addEventListener('DOMContentLoaded', initProjectContext);