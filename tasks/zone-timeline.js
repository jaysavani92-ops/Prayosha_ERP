/**
 * Prayosha ERP - Zone Timeline Controller
 * File: /tasks/zone-timeline.js
 * 
 * Features:
 * 1. 4-Tier Cascading Selector: Project Context -> Tower -> Floor Level -> Zone ID.
 * 2. Deep-Link URL Resolution: Auto-loads timeline from QR code or Site Map (?zone_id=...).
 * 3. Civil Sequential Milestone Stepper: Visual progress bar mapping standard trade execution.
 * 4. Bilingual WhatsApp & Email Dispatcher: 1-click field updates in English & Gujarati.
 * 5. On-Site QR Placard Modal: Dynamic QR code generator and PNG download.
 * 6. Consolidated Daily Photo Stream: Visual timeline pulling evidence from Cloudflare R2.
 * 7. Active Snag & Defect Inspection: Automatic detection of delayed tasks and blockers.
 */

import { supabase } from '../config.js';

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const client = supabase || (window.supabaseClient ? window.supabaseClient : (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null));

// DOM Elements - Dropdowns & Context
const projectSelect = document.getElementById('project_name');
const towerSelect = document.getElementById('tower_block');
const floorSelect = document.getElementById('floor_level');
const zoneSelect = document.getElementById('zone_id');
const projectBadge = document.getElementById('activeProjectBadge');

// DOM Elements - Summary & Progress
const zoneSummary = document.getElementById('zone-summary');
const summaryTitle = document.getElementById('summary-title');
const summaryAreaBadge = document.getElementById('summary-area-badge');
const summaryLocation = document.getElementById('summary-location');
const summaryTotalTasks = document.getElementById('summary-total-tasks');
const summaryCompletedTasks = document.getElementById('summary-completed-tasks');
const summaryAgencies = document.getElementById('summary-agencies');
const summaryDays = document.getElementById('summary-days');
const zoneProgressPercentage = document.getElementById('zoneProgressPercentage');
const zoneProgressBar = document.getElementById('zoneProgressBar');
const sequentialMilestonesList = document.getElementById('sequentialMilestonesList');
const zoneIssueBanner = document.getElementById('zone-issue-banner');
const zoneIssueText = document.getElementById('zone-issue-text');
const timelineContainer = document.getElementById('timeline-container');

// DOM Elements - Modals & Actions
const btnOpenQrModal = document.getElementById('btnOpenQrModal');
const qrModal = document.getElementById('qrModal');
const closeQrModalBtn = document.getElementById('closeQrModalBtn');
const qrCodeTarget = document.getElementById('qrCodeTarget');
const qrModalZoneId = document.getElementById('qrModalZoneId');
const btnDownloadQrSticker = document.getElementById('btnDownloadQrSticker');

const btnShareWhatsApp = document.getElementById('btnShareWhatsApp');
const whatsappModal = document.getElementById('whatsappModal');
const closeWhatsAppModalBtn = document.getElementById('closeWhatsAppModalBtn');
const cancelWhatsAppModalBtn = document.getElementById('cancelWhatsAppModalBtn');
const btnLangEn = document.getElementById('btnLangEn');
const btnLangGu = document.getElementById('btnLangGu');
const whatsappMessagePreview = document.getElementById('whatsappMessagePreview');
const btnSendWhatsAppDirect = document.getElementById('btnSendWhatsAppDirect');

const btnShareEmail = document.getElementById('btnShareEmail');

// In-Memory State
let currentProjectZones = [];
let currentZoneTasks = [];
let currentZoneMeta = null;
let currentSelectedZoneId = '';
let currentWhatsAppLang = 'en';

// Standard Civil Sequence
const STANDARD_CIVIL_TRADES = [
    { key: 'structure', label: 'Structure', match: ['rcc', 'structure', 'foundation', 'excavation', 'piling'] },
    { key: 'brickwork', label: 'Brick Work', match: ['masonry', 'brick', 'block work'] },
    { key: 'plaster', label: 'Plaster', match: ['plaster', 'internal plaster', 'external plaster'] },
    { key: 'waterproofing', label: 'Waterproofing', match: ['waterproofing', 'water proofing'] },
    { key: 'flooring', label: 'Flooring', match: ['flooring', 'tiling', 'tile'] },
    { key: 'finishing', label: 'Finishing', match: ['painting', 'finishing', 'electrical', 'plumbing'] }
];

/**
 * 1. Initialize Cascading Hierarchy & Project Context
 */
async function initCascadingHierarchy() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';
    const activeProjectCode = localStorage.getItem('activeProjectCode') || '';

    if (projectBadge) {
        projectBadge.textContent = activeProjectName 
            ? (activeProjectCode ? `[${activeProjectCode}] ${activeProjectName}` : activeProjectName)
            : 'All Projects';
    }

    if (!client) {
        console.warn('[Zone Timeline] Supabase client unavailable.');
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
                await loadTowersForProject(matchedOption.dataset.id);
            }
        } else {
            populateFallbackProject(activeProjectName);
        }

    } catch (err) {
        console.error('[Zone Timeline] Error loading projects:', err);
        populateFallbackProject(activeProjectName);
    }

    // Check URL parameters for direct zone deep-linking
    checkUrlDeepLink();
}

function populateFallbackProject(name) {
    const displayName = name || 'Prayosha Imperia';
    projectSelect.innerHTML = `
        <option value="">-- Select Project --</option>
        <option value="${displayName}" selected>${displayName}</option>
    `;
    resetStructureDropdowns();
}

/**
 * 2. Fetch Towers and Floors from project_zones
 */
async function loadTowersForProject(projectId) {
    if (!projectId) {
        resetStructureDropdowns();
        return;
    }

    towerSelect.innerHTML = '<option value="">-- Loading Towers --</option>';
    towerSelect.disabled = true;
    floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';
    floorSelect.disabled = true;
    resetZoneDropdown();

    try {
        const { data: zones, error } = await client
            .from('project_zones')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        currentProjectZones = zones || [];

        if (currentProjectZones.length === 0) {
            towerSelect.innerHTML = '<option value="">-- No Towers Found --</option>';
            towerSelect.disabled = false;
            return;
        }

        const rawTowers = currentProjectZones.map(z => z.tower_name?.trim()).filter(Boolean);
        const uniqueTowers = Array.from(new Set(rawTowers));

        towerSelect.innerHTML = '<option value="">-- Select Tower --</option>';
        uniqueTowers.forEach(tName => {
            const opt = document.createElement('option');
            opt.value = tName;
            opt.textContent = tName;
            towerSelect.appendChild(opt);
        });

        towerSelect.disabled = false;

        // Auto-select if only 1 tower exists
        if (uniqueTowers.length === 1) {
            towerSelect.value = uniqueTowers[0];
            populateFloorsForTower(uniqueTowers[0], projectId);
        }

    } catch (err) {
        console.error('[Zone Timeline] Error fetching project architecture:', err);
        resetStructureDropdowns();
    }
}

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
 * 3. Fetch and Populate Zone IDs from project_map_zones or Synthesis
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

        let zonesToDisplay = mapZones || [];

        // Synthesis fallback if project_map_zones is empty
        if (zonesToDisplay.length === 0) {
            const matchingArch = currentProjectZones.find(z => 
                (z.tower_name || '').trim().toLowerCase() === selectedTower.trim().toLowerCase() && 
                (z.floor_name || z.zone_name || '').trim().toLowerCase() === selectedFloor.trim().toLowerCase()
            );

            if (matchingArch) {
                zonesToDisplay = synthesizeZonesForFloor(projectId, matchingArch);
                if (zonesToDisplay.length > 0) {
                    client.from('project_map_zones').insert(zonesToDisplay).then().catch(() => {});
                }
            }
        }

        if (zonesToDisplay.length > 0) {
            zoneSelect.innerHTML = '<option value="">-- Select Zone ID --</option>';
            zonesToDisplay.forEach(zone => {
                const opt = document.createElement('option');
                opt.value = zone.zone_id;
                opt.dataset.room = zone.room_identifier || '';
                opt.dataset.category = zone.category || '';
                opt.dataset.size = zone.room_size || '';
                
                const label = zone.room_identifier ? `[${zone.zone_id}] ${zone.room_identifier}` : zone.zone_id;
                const catSuffix = zone.category ? ` (${zone.category})` : '';
                opt.textContent = `${label}${catSuffix}`;
                zoneSelect.appendChild(opt);
            });
            zoneSelect.disabled = false;
            return;
        }

        zoneSelect.innerHTML = '<option value="">-- No Zones Found for Floor --</option>';
        zoneSelect.disabled = false;

    } catch (err) {
        console.error('[Zone Timeline] Error fetching zones:', err);
        zoneSelect.innerHTML = '<option value="">-- Failed to Load Zones --</option>';
        zoneSelect.disabled = false;
    }
}

/**
 * Architectural Synthesizer Helper
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
                room_size: size ? `${size} sq.ft` : 'N/A'
            });
        });
    }

    // Facility Rooms
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
                room_size: size ? `${size} sq.ft` : 'N/A'
            });
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
 * 4. Fetch and Render Live Zone Timeline
 */
async function fetchZoneTimeline(targetZoneId) {
    const zoneId = (targetZoneId || zoneSelect.value || '').trim();

    if (!zoneId) {
        if (zoneSummary) zoneSummary.classList.add('hidden');
        if (zoneIssueBanner) zoneIssueBanner.classList.add('hidden');
        timelineContainer.innerHTML = `
            <div class="py-16 text-center text-slate-400 text-xs font-semibold">
                <span class="text-3xl block mb-2">🏢</span>
                Select a Project, Tower, Floor, and Zone ID above to construct its chronological work history.
            </div>
        `;
        return;
    }

    currentSelectedZoneId = zoneId;

    // Display Loading State
    timelineContainer.innerHTML = `
        <div class="py-16 text-center text-slate-400 text-xs font-semibold flex flex-col items-center justify-center">
            <svg class="animate-spin h-6 w-6 text-brand-amber mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span>Constructing chronological lifecycle for Zone [${zoneId}]...</span>
        </div>
    `;

    try {
        const activeProjectName = localStorage.getItem('activeProjectName') || '';
        const activeProjectId = localStorage.getItem('activeProjectId') || '';

        // Query civil tasks for this exact Zone ID
        let query = client
            .from('civil_tasks')
            .select('*')
            .ilike('zone_id', zoneId)
            .order('created_at', { ascending: true });

        if (activeProjectName && activeProjectId) {
            query = query.or(`project_name.eq."${activeProjectName}",project_id.eq."${activeProjectId}"`);
        } else if (activeProjectName) {
            query = query.eq('project_name', activeProjectName);
        }

        const { data: tasks, error } = await query;
        if (error) throw error;

        currentZoneTasks = tasks || [];

        // Query Zone metadata from project_map_zones
        try {
            const { data: metaRows } = await client
                .from('project_map_zones')
                .select('*')
                .ilike('zone_id', zoneId)
                .limit(1);

            currentZoneMeta = (metaRows && metaRows.length > 0) ? metaRows[0] : null;
        } catch (mErr) {
            currentZoneMeta = null;
        }

        // Check for active issues or delayed tasks in this zone
        inspectZoneIssues(zoneId, currentZoneTasks);

        // Update Executive Metrics & Stepper Bar
        renderZoneSummaryHeader(zoneId, currentZoneTasks, currentZoneMeta);

        // Build Chronological Feed
        renderTimelineFeed(currentZoneTasks);

    } catch (err) {
        console.error('[Zone Timeline] Error loading timeline:', err);
        timelineContainer.innerHTML = `
            <div class="p-5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                <div class="font-bold mb-1">Failed to build timeline</div>
                <div>${err.message || 'Unknown network error occurred.'}</div>
            </div>
        `;
    }
}

/**
 * 5. Render Executive Summary & Sequential Milestone Stepper
 */
function renderZoneSummaryHeader(zoneId, tasks, zoneMeta) {
    if (!zoneSummary) return;

    if (tasks.length === 0 && !zoneMeta) {
        zoneSummary.classList.add('hidden');
        return;
    }

    zoneSummary.classList.remove('hidden');

    const roomTitle = zoneMeta?.room_identifier || (tasks[0]?.category ? `${tasks[0].category} Area` : 'Target Area');
    const areaSqft = zoneMeta?.room_size && zoneMeta.room_size !== 'N/A' ? zoneMeta.room_size : null;
    const tower = zoneMeta?.tower_name || tasks[0]?.tower_block || towerSelect.value || 'Tower Block';
    const floor = zoneMeta?.floor_level || tasks[0]?.floor_level || floorSelect.value || 'Floor Level';
    const project = tasks[0]?.project_name || projectSelect.value || 'Project Context';

    if (summaryTitle) summaryTitle.textContent = `${zoneId} • ${roomTitle}`;
    if (summaryLocation) summaryLocation.textContent = `${project} • ${tower} • ${floor}`;
    
    if (summaryAreaBadge) {
        if (areaSqft) {
            summaryAreaBadge.textContent = areaSqft;
            summaryAreaBadge.classList.remove('hidden');
        } else {
            summaryAreaBadge.classList.add('hidden');
        }
    }

    // Metric Calculations
    const totalCount = tasks.length;
    const completedCount = tasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
    const agencies = Array.from(new Set(tasks.map(t => t.assigned_agency).filter(Boolean)));

    // Days in Execution Calculation
    let daysActive = 0;
    if (tasks.length > 0) {
        const timestamps = tasks.map(t => new Date(t.created_at || t.assigned_date || Date.now()).getTime());
        const earliestDate = new Date(Math.min(...timestamps));
        let latestDate = new Date();

        const allCompleted = tasks.every(t => (t.status || '').toLowerCase() === 'completed');
        if (allCompleted) {
            const completedTimes = tasks
                .filter(t => t.completed_date)
                .map(t => new Date(t.completed_date).getTime());
            if (completedTimes.length > 0) {
                latestDate = new Date(Math.max(...completedTimes));
            }
        }
        const diffTime = Math.abs(latestDate - earliestDate);
        daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    }

    if (summaryTotalTasks) summaryTotalTasks.textContent = totalCount;
    if (summaryCompletedTasks) summaryCompletedTasks.textContent = completedCount;
    if (summaryAgencies) summaryAgencies.textContent = agencies.length > 0 ? agencies.join(', ') : 'Unassigned';
    if (summaryDays) summaryDays.textContent = daysActive;

    // Progress Bar % Calculation
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    if (zoneProgressPercentage) zoneProgressPercentage.textContent = `${progressPct}% Completed`;
    if (zoneProgressBar) zoneProgressBar.style.width = `${progressPct}%`;

    // Render Sequential Civil Stepper Grid
    renderCivilStepperGrid(tasks);
}

/**
 * 6. Render Civil Stepper Milestones Grid
 */
function renderCivilStepperGrid(tasks) {
    if (!sequentialMilestonesList) return;

    sequentialMilestonesList.innerHTML = '';

    STANDARD_CIVIL_TRADES.forEach(trade => {
        // Find matching task in this zone for this trade package
        const matchedTask = tasks.find(t => {
            const cat = (t.category || '').toLowerCase();
            return trade.match.some(m => cat.includes(m));
        });

        let statusClass = 'bg-slate-100 text-slate-400 border-slate-200';
        let statusIcon = '○';
        let statusLabel = 'Pending';

        if (matchedTask) {
            const st = (matchedTask.status || '').toLowerCase();
            if (st === 'completed') {
                statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
                statusIcon = '✓';
                statusLabel = 'Done';
            } else if (st === 'in progress') {
                statusClass = 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
                statusIcon = '⚙';
                statusLabel = 'Active';
            } else if (st === 'ready for qc') {
                statusClass = 'bg-purple-50 text-purple-700 border-purple-300 font-bold';
                statusIcon = '🔍';
                statusLabel = 'QC';
            } else if (st === 'delayed') {
                statusClass = 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
                statusIcon = '⚠️';
                statusLabel = 'Delayed';
            } else {
                statusClass = 'bg-blue-50 text-blue-700 border-blue-200';
                statusIcon = '⏳';
                statusLabel = 'Staged';
            }
        }

        const pill = document.createElement('div');
        pill.className = `p-2 rounded-xl border text-center transition ${statusClass}`;
        pill.innerHTML = `
            <div class="text-[11px] uppercase font-bold tracking-tight">${trade.label}</div>
            <div class="text-[10px] mt-0.5 flex items-center justify-center gap-1">
                <span>${statusIcon}</span>
                <span>${statusLabel}</span>
            </div>
        `;

        sequentialMilestonesList.appendChild(pill);
    });
}

/**
 * 7. Active Snag & Defect Inspection
 */
async function inspectZoneIssues(zoneId, tasks) {
    if (!zoneIssueBanner || !zoneIssueText) return;

    // Check for delayed civil tasks
    const delayedTasks = tasks.filter(t => (t.status || '').toLowerCase() === 'delayed');
    
    // Also check for delay notes
    const delayNotes = tasks
        .filter(t => t.delayed_reason && t.delayed_reason.trim() !== '')
        .map(t => `[${t.category}]: ${t.delayed_reason}`);

    if (delayedTasks.length > 0 || delayNotes.length > 0) {
        zoneIssueBanner.classList.remove('hidden');
        zoneIssueText.textContent = delayNotes.length > 0 
            ? delayNotes.join(' • ') 
            : `${delayedTasks.length} work package(s) currently marked as Delayed in site logs.`;
        return;
    }

    // Optional query to issues_blockers table with graceful error handling
    try {
        const { data: openIssues } = await client
            .from('issues_blockers')
            .select('*')
            .ilike('zone_id', zoneId)
            .neq('status', 'Resolved')
            .limit(3);

        if (openIssues && openIssues.length > 0) {
            zoneIssueBanner.classList.remove('hidden');
            const descriptions = openIssues.map(i => i.issue_title || i.description || 'Active Blockage');
            zoneIssueText.textContent = descriptions.join(' • ');
            return;
        }
    } catch (e) {
        // Table does not exist or schema differs; bypass silently
    }

    zoneIssueBanner.classList.add('hidden');
}

/**
 * 8. Render Chronological Lifecycle Feed with Daily Photos
 */
function renderTimelineFeed(tasks) {
    if (!timelineContainer) return;

    if (tasks.length === 0) {
        timelineContainer.innerHTML = `
            <div class="py-12 text-center bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <div class="w-12 h-12 rounded-2xl bg-brand-navy/10 text-brand-navy flex items-center justify-center text-xl mx-auto mb-3">
                    📋
                </div>
                <h3 class="text-sm font-bold text-slate-700 mb-1">No Task Records Found</h3>
                <p class="text-xs text-slate-400 max-w-sm mx-auto">No civil tasks have been assigned to Zone ID <strong>${currentSelectedZoneId}</strong> under this project.</p>
                <a href="log-task.html?zone_id=${encodeURIComponent(currentSelectedZoneId)}" class="mt-4 inline-block px-4 py-2 bg-brand-navy hover:bg-brand-navyDark text-white text-xs font-semibold rounded-xl shadow-md transition">
                    + Assign Work Package to this Zone
                </a>
            </div>
        `;
        return;
    }

    timelineContainer.innerHTML = '';

    // Render nodes chronologically
    tasks.forEach(task => {
        let statusBadge = "bg-blue-50 text-blue-700 border-blue-200";
        let dotColor = "bg-blue-500 ring-blue-200";
        
        const st = (task.status || '').toLowerCase();
        if (st === 'completed') {
            statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-300";
            dotColor = "bg-emerald-500 ring-emerald-200";
        } else if (st === 'not started') {
            statusBadge = "bg-slate-100 text-slate-700 border-slate-200";
            dotColor = "bg-slate-400 ring-slate-200";
        } else if (st === 'ready for qc') {
            statusBadge = "bg-purple-50 text-purple-700 border-purple-200";
            dotColor = "bg-purple-500 ring-purple-200";
        } else if (st === 'delayed') {
            statusBadge = "bg-rose-50 text-rose-700 border-rose-200";
            dotColor = "bg-rose-500 ring-rose-200";
        } else if (st === 'in progress') {
            statusBadge = "bg-amber-50 text-amber-800 border-amber-300";
            dotColor = "bg-amber-500 ring-amber-200";
        }

        const startDateFmt = task.assigned_date 
            ? new Date(task.assigned_date).toLocaleDateString('en-GB') 
            : (task.started_date || 'Pending');
            
        const endDateFmt = task.completed_date 
            ? new Date(task.completed_date).toLocaleDateString('en-GB') 
            : (task.expected_completion_date || '-');

        const shortId = (task.id && typeof task.id === 'string') 
            ? task.id.split('-')[0].toUpperCase() 
            : 'TSK';

        const priority = task.priority || 'Medium';
        const taskDesc = task.task_description || '';

        // Parse Multi-Photo Evidence Stream
        const photos = parseTaskPhotos(task);

        const timelineNode = document.createElement('div');
        timelineNode.className = "relative pl-8 pb-6 last:pb-2 border-l-2 border-slate-200 last:border-l-transparent";
        
        timelineNode.innerHTML = `
            <!-- Milestone Dot -->
            <div class="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full ${dotColor} ring-4 border-2 border-white shadow-sm transition-transform duration-200 hover:scale-125"></div>
            
            <!-- Milestone Card -->
            <div class="bg-white border border-slate-200/90 rounded-2xl shadow-sm p-4 sm:p-5 hover:shadow-md transition">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="text-base font-bold text-brand-navy tracking-tight">${task.category || 'Civil Package'}</h4>
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${getPriorityBadgeClass(priority)}">
                                ${priority}
                            </span>
                        </div>
                        <div class="text-[10px] text-slate-400 font-semibold mt-0.5 tracking-wider uppercase">Reference: #${shortId}</div>
                    </div>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold border self-start sm:self-auto ${statusBadge}">
                        ${task.status || 'Active'}
                    </span>
                </div>

                ${taskDesc ? `
                    <div class="text-xs text-slate-700 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 mb-3 font-medium">
                        ${escapeHtml(taskDesc)}
                    </div>
                ` : ''}
                
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-xs mb-3">
                    <div>
                        <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Agency</span>
                        <div class="font-bold text-brand-navy truncate">${task.assigned_agency || 'Unassigned'}</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Assigned Date</span>
                        <div class="text-slate-700 font-medium">${startDateFmt}</div>
                    </div>
                    <div>
                        <span class="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Target / Finished</span>
                        <div class="text-slate-700 font-medium">${endDateFmt}</div>
                    </div>
                </div>

                ${task.delayed_reason ? `
                    <div class="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 mb-3">
                        <span class="font-bold">Delay Note:</span> ${escapeHtml(task.delayed_reason)}
                    </div>
                ` : ''}

                <!-- Daily Photo Evidence Gallery -->
                ${renderTaskPhotoGalleryHTML(photos)}
            </div>
        `;
        
        timelineContainer.appendChild(timelineNode);
    });
}

function renderTaskPhotoGalleryHTML(photos) {
    if (!photos || photos.length === 0) return '';

    return `
        <div class="mt-3 pt-3 border-t border-slate-100">
            <span class="text-[10px] uppercase font-bold text-slate-400 block mb-2">
                Daily Progress Evidence (${photos.length} Photo${photos.length > 1 ? 's' : ''})
            </span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                ${photos.map(p => {
                    const dateStr = p.timestamp ? new Date(p.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Site Log';
                    return `
                        <div class="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 h-24">
                            <img src="${p.url}" alt="Site Evidence" class="w-full h-full object-cover">
                            <div class="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between text-white">
                                <span class="text-[9px] font-bold">${dateStr}</span>${p.note ? `<p class="text-[9px] line-clamp-2 italic">${escapeHtml(p.note)}</p>` : ''}
                                <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="text-[9px] font-bold text-brand-amber underline">View Full ↗</a>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * 9. Helper: Parse Photos JSON or Legacy String
 */
function parseTaskPhotos(task) {
    if (!task) return [];
    if (Array.isArray(task.photos)) return task.photos;

    const raw = task.photo_url || '';
    if (!raw || raw === 'null' || raw === 'undefined') return [];

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed;
            } catch (e) {}
        }
        return [{
            url: trimmed,
            timestamp: task.assigned_date || task.created_at || new Date().toISOString(),
            note: 'Site Milestone'
        }];
    }

    if (Array.isArray(raw)) return raw;
    return [];
}

function getPriorityBadgeClass(priority) {
    switch (priority) {
        case 'Urgent': return 'bg-rose-100 text-rose-700 border border-rose-200';
        case 'High': return 'bg-amber-100 text-amber-800 border border-amber-300';
        case 'Low': return 'bg-slate-100 text-slate-600 border border-slate-200';
        case 'Medium':
        default: return 'bg-blue-100 text-blue-700 border border-blue-200';
    }
}

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
 * 10. QR Placard Modal Operations
 */
if (btnOpenQrModal) {
    btnOpenQrModal.addEventListener('click', () => {
        if (!currentSelectedZoneId) return;

        if (qrModalZoneId) qrModalZoneId.textContent = currentSelectedZoneId;
        if (qrCodeTarget) {
            qrCodeTarget.innerHTML = '';
            const targetUrl = `${window.location.origin}${window.location.pathname}?zone_id=${encodeURIComponent(currentSelectedZoneId)}`;
            
            if (window.QRCode) {
                new window.QRCode(qrCodeTarget, {
                    text: targetUrl,
                    width: 180,
                    height: 180,
                    colorDark: "#1E3A5F",
                    colorLight: "#ffffff",
                    correctLevel: window.QRCode.CorrectLevel.H
                });
            }
        }

        if (qrModal) qrModal.classList.remove('hidden');
    });
}

if (closeQrModalBtn) {
    closeQrModalBtn.addEventListener('click', () => {
        if (qrModal) qrModal.classList.add('hidden');
    });
}

if (btnDownloadQrSticker) {
    btnDownloadQrSticker.addEventListener('click', () => {
        if (!qrCodeTarget) return;

        const img = qrCodeTarget.querySelector('img');
        if (img && img.src) {
            const a = document.createElement('a');
            a.download = `QR_${currentSelectedZoneId}.png`;
            a.href = img.src;
            a.click();
            return;
        }

        const canvas = qrCodeTarget.querySelector('canvas');
        if (canvas) {
            const a = document.createElement('a');
            a.download = `QR_${currentSelectedZoneId}.png`;
            a.href = canvas.toDataURL("image/png");
            a.click();
        }
    });
}

/**
 * 11. WhatsApp Dispatch Logic (Tri-Lingual)
 */
function generateWhatsAppMessage(lang = 'en') {
    const projectName = projectSelect.value || localStorage.getItem('activeProjectName') || 'Prayosha Project';
    const zoneId = currentSelectedZoneId;
    const roomName = currentZoneMeta?.room_identifier || (currentZoneTasks[0]?.category ? `${currentZoneTasks[0].category} Room` : 'Target Area');
    const tower = towerSelect.value || currentZoneMeta?.tower_name || '';
    const floor = floorSelect.value || currentZoneMeta?.floor_level || '';
    
    const totalCount = currentZoneTasks.length;
    const completedCount = currentZoneTasks.filter(t => (t.status || '').toLowerCase() === 'completed').length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const ongoingTask = currentZoneTasks.find(t => (t.status || '').toLowerCase() === 'in progress') || currentZoneTasks[0];
    const currentTrade = ongoingTask?.category || 'General Civil';
    const currentAgency = ongoingTask?.assigned_agency || 'Unassigned';
    const activeStatus = ongoingTask?.status || 'Active';

    // Find latest photo URL
    let latestPhotoUrl = null;
    currentZoneTasks.forEach(t => {
        const pList = parseTaskPhotos(t);
        if (pList.length > 0 && !latestPhotoUrl) {
            latestPhotoUrl = pList[0].url;
        }
    });

    const liveUrl = `${window.location.origin}${window.location.pathname}?zone_id=${encodeURIComponent(zoneId)}`;

    if (lang === 'gu') {
        return `🏗️ *પ્રયોશા ગ્રૂપ - સાઈટ પ્રોગ્રેસ રિપોર્ટ*\n` +
               `*પ્રોજેક્ટ:* ${projectName}\n` +
               `*ઝોન આઈડી:* ${zoneId} (${roomName})\n` +
               `*સ્થળ:* ${tower} • ${floor}\n` +
               `*કુલ કામ પ્રગતિ:* ${progressPct}% પૂર્ણ (${completedCount}/${totalCount} પેકેજ)\n` +
               `*હાલનું કામ:* ${currentTrade} [${currentAgency}]\n` +
               `*સ્થિતિ:* ${activeStatus}\n` +
               (latestPhotoUrl ? `*સાઈટ ફોટો લિંક:* ${latestPhotoUrl}\n` : '') +
               `*લાઈવ ટાઈમલાઈન:* ${liveUrl}`;
    }

    return `🏗️ *PRAYOSHA ERP - SITE PROGRESS UPDATE*\n` +
           `*Project:* ${projectName}\n` +
           `*Zone ID:* ${zoneId} (${roomName})\n` +
           `*Location:* ${tower} • ${floor}\n` +
           `*Overall Progress:* ${progressPct}% Completed (${completedCount}/${totalCount} Packages)\n` +
           `*Current Active Trade:* ${currentTrade} [${currentAgency}]\n` +
           `*Status:* ${activeStatus}\n` +
           (latestPhotoUrl ? `*Latest Evidence:* ${latestPhotoUrl}\n` : '') +
           `*Live Timeline:* ${liveUrl}`;
}

if (btnShareWhatsApp) {
    btnShareWhatsApp.addEventListener('click', () => {
        if (!currentSelectedZoneId) return;
        currentWhatsAppLang = 'en';
        updateWhatsAppModalView();
        if (whatsappModal) whatsappModal.classList.remove('hidden');
    });
}

function updateWhatsAppModalView() {
    const msg = generateWhatsAppMessage(currentWhatsAppLang);
    if (whatsappMessagePreview) whatsappMessagePreview.value = msg;
    if (btnSendWhatsAppDirect) {
        btnSendWhatsAppDirect.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    }

    if (btnLangEn && btnLangGu) {
        if (currentWhatsAppLang === 'en') {
            btnLangEn.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-brand-navy text-white transition';
            btnLangGu.className = 'px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition';
        } else {
            btnLangGu.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-brand-navy text-white transition';
            btnLangEn.className = 'px-3 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition';
        }
    }
}

if (btnLangEn) {
    btnLangEn.addEventListener('click', () => {
        currentWhatsAppLang = 'en';
        updateWhatsAppModalView();
    });
}

if (btnLangGu) {
    btnLangGu.addEventListener('click', () => {
        currentWhatsAppLang = 'gu';
        updateWhatsAppModalView();
    });
}

if (closeWhatsAppModalBtn) {
    closeWhatsAppModalBtn.addEventListener('click', () => {
        if (whatsappModal) whatsappModal.classList.add('hidden');
    });
}

if (cancelWhatsAppModalBtn) {
    cancelWhatsAppModalBtn.addEventListener('click', () => {
        if (whatsappModal) whatsappModal.classList.add('hidden');
    });
}

/**
 * 12. Email Dispatch Logic
 */
if (btnShareEmail) {
    btnShareEmail.addEventListener('click', () => {
        if (!currentSelectedZoneId) return;
        const msg = generateWhatsAppMessage('en');
        const subject = `Prayosha ERP - Site Execution Report [${currentSelectedZoneId}]`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
    });
}

/**
 * 13. Deep-Link URL Parameter Resolver
 */
function checkUrlDeepLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const deepZone = urlParams.get('zone_id') || urlParams.get('zone');

    if (deepZone && deepZone.trim() !== '') {
        const cleanZone = deepZone.trim().toUpperCase();
        currentSelectedZoneId = cleanZone;

        // Auto-fetch timeline for deep-linked zone directly
        fetchZoneTimeline(cleanZone);
    }
}

/**
 * 14. Event Listeners for Cascading Selection
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
        await loadTowersForProject(projectId);
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

zoneSelect.addEventListener('change', function() {
    fetchZoneTimeline(this.value);
});

// Run initialization on DOM load
document.addEventListener('DOMContentLoaded', initCascadingHierarchy);