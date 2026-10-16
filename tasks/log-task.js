/**
 * Prayosha ERP - Task Logging & Plan Change Interceptor Controller
 * File: /tasks/log-task.js
 * 
 * Features:
 * 1. 3-Tier Cascading Hierarchy: Project -> Tower -> Floor Level -> Zone ID dynamically from database records.
 * 2. Plan Change Alert Interceptor: Detects active customer modifications and triggers an unskippable warning modal.
 * 3. Trade-Aware Checkpoint Highlighting: Dynamically emphasizes bullets matching the selected civil trade category.
 * 4. Automatic Scope Auto-Append: Populates task scope notes with customer specifications upon modal acknowledgment.
 * 5. Execution Status Assignment: Automatically populates started_date and completed_date based on status.
 * 6. Dynamic Zone Synthesis: Unpacks unit configurations and persists project_map_zones on demand.
 * 7. Resilient UUID & Fallback Handling: Fully immune to PostgreSQL 42703 and 22P02 database errors.
 */

import { supabase } from '../config.js';

// Central Supabase Client initialization
const client = supabase || window.supabaseClient;

// DOM Elements - Core Form
const logTaskForm = document.getElementById('logTaskForm');
const projectSelect = document.getElementById('project_name');
const towerSelect = document.getElementById('tower_block');
const floorSelect = document.getElementById('floor_level');
const categorySelect = document.getElementById('category');
const zoneSelect = document.getElementById('zone_id');
const assignedAgencySelect = document.getElementById('assigned_agency');
const prioritySelect = document.getElementById('priority');
const statusSelect = document.getElementById('task_status');
const expectedDateInput = document.getElementById('expected_completion_date');
const taskDescInput = document.getElementById('task_description');
const feedbackBox = document.getElementById('form-feedback');

// DOM Elements - Plan Change Inline Indicator
const zoneIndicator = document.getElementById('zone-plan-change-indicator');
const indicatorRevText = document.getElementById('indicator-rev-text');
const reopenPlanChangeModalBtn = document.getElementById('reopen-plan-change-modal-btn');

// DOM Elements - Plan Change Alert Modal
const pcModal = document.getElementById('plan-change-alert-modal');
const pcModalBackdrop = document.getElementById('pc-modal-backdrop');
const closePcModalCross = document.getElementById('close-pc-modal-cross');
const modalPcRev = document.getElementById('modal-pc-rev');
const modalPcZoneId = document.getElementById('modal-pc-zone-id');
const modalPcLocation = document.getElementById('modal-pc-location');
const modalPcCustomerName = document.getElementById('modal-pc-customer-name');
const modalPcPhone = document.getElementById('modal-pc-phone');
const modalPcCostTerms = document.getElementById('modal-pc-cost-terms');
const modalPcStructuralAlert = document.getElementById('modal-pc-structural-alert');
const modalPcBulletCount = document.getElementById('modal-pc-bullet-count');
const modalPcBulletsContainer = document.getElementById('modal-pc-bullets-container');
const modalPcDrawingLink = document.getElementById('modal-pc-drawing-link');
const modalPcDismissBtn = document.getElementById('modal-pc-dismiss-btn');

// State Cache
let currentProjectZones = [];
let activePlanChangeForZone = null;
let projectActivePlanChanges = [];

// ==============================================================================
// 1. UTILITY & VALIDATION HELPERS
// ==============================================================================
function isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid.trim());
}

function normalizeString(str) {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function escapeHtml(unsafe) {
    if (!unsafe && unsafe !== 0) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

// ==============================================================================
// 2. PROJECT INITIALIZATION & CACHE
// ==============================================================================
async function initProjectContext() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';

    if (!client) {
        console.warn('[Task Logger] Supabase client offline. Using local session fallback.');
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

            if (matchedOption && isValidUUID(matchedOption.dataset.id)) {
                localStorage.setItem('activeProjectId', matchedOption.dataset.id);
                localStorage.setItem('activeProjectName', matchedOption.value);
                if (matchedOption.dataset.code) {
                    localStorage.setItem('activeProjectCode', matchedOption.dataset.code);
                }
                
                await Promise.all([
                    loadProjectStructure(matchedOption.dataset.id),
                    preloadProjectPlanChanges(matchedOption.dataset.id)
                ]);
            }
        } else {
            populateFallbackProject(activeProjectName);
        }
    } catch (err) {
        console.error('[Task Logger] Error loading projects context:', err);
        populateFallbackProject(activeProjectName);
    }
}

function populateFallbackProject(name) {
    const displayName = name || 'Prayosha Project Site';
    projectSelect.innerHTML = `
        <option value="">-- Select Project --</option>
        <option value="${displayName}" selected>${displayName}</option>
    `;
    resetStructureDropdowns();
}

// ==============================================================================
// 3. PLAN CHANGE CACHE & INTERCEPTOR ENGINE
// ==============================================================================
async function preloadProjectPlanChanges(projectId) {
    projectActivePlanChanges = [];
    if (!isValidUUID(projectId) || !client) return;

    try {
        const { data, error } = await client
            .from('unit_plan_changes')
            .select('*')
            .eq('project_id', projectId)
            .eq('status', 'Active');

        if (error) throw error;
        projectActivePlanChanges = data || [];
    } catch (err) {
        console.warn('[Task Logger] Could not preload plan changes:', err.message);
    }
}

/**
 * Checks if the selected Zone ID has an active plan change mandate
 */
function findPlanChangeForZone(selectedZoneVal, selectedZoneLabel) {
    if (!projectActivePlanChanges || projectActivePlanChanges.length === 0) return null;

    const normVal = normalizeString(selectedZoneVal);
    const normLabel = normalizeString(selectedZoneLabel);

    return projectActivePlanChanges.find(pc => {
        const normPcZone = normalizeString(pc.zone_id);
        
        // Exact normalized match
        if (normPcZone === normVal || normPcZone === normLabel) return true;
        
        // Partial substring matches (e.g. "801" inside "TOW-8F-FLAT-801" or "Flat 801")
        if (normVal.includes(normPcZone) || normLabel.includes(normPcZone)) return true;

        // Number extraction match
        const pcNumbers = pc.zone_id.replace(/\D/g, '');
        const zoneNumbers = (selectedZoneVal + ' ' + selectedZoneLabel).replace(/\D/g, '');
        if (pcNumbers && zoneNumbers && (pcNumbers === zoneNumbers || zoneNumbers.endsWith(pcNumbers))) {
            return true;
        }

        return false;
    }) || null;
}

/**
 * Triggers the Plan Change Alert Modal
 */
function triggerPlanChangeAlert(planChange) {
    if (!planChange) return;
    activePlanChangeForZone = planChange;

    // 1. Update Inline Form Indicator
    zoneIndicator.classList.remove('hidden');
    indicatorRevText.textContent = `Customization Active (Rev v${planChange.revision_number || 1}) for ${planChange.zone_id} • Customer: ${planChange.customer_name}`;

    // 2. Populate Modal Content
    modalPcRev.textContent = `Rev v${planChange.revision_number || 1}`;
    modalPcZoneId.textContent = planChange.zone_id;
    modalPcLocation.textContent = `(${planChange.tower_block} • ${planChange.floor_level})`;
    modalPcCustomerName.textContent = planChange.customer_name;
    modalPcPhone.textContent = planChange.customer_phone || 'Not recorded';
    modalPcCostTerms.textContent = planChange.cost_impact_type || 'Customer Provided Material';

    // 3. Structural Impact Warning
    if (planChange.has_structural_impact) {
        modalPcStructuralAlert.classList.remove('hidden');
    } else {
        modalPcStructuralAlert.classList.add('hidden');
    }

    // 4. Render Bullets with Trade Package Highlighting
    const currentCategory = categorySelect.value || '';
    const bullets = Array.isArray(planChange.change_bullets) ? planChange.change_bullets : [];
    
    modalPcBulletCount.textContent = `${bullets.length} Checkpoints`;
    modalPcBulletsContainer.innerHTML = '';

    if (bullets.length === 0) {
        modalPcBulletsContainer.innerHTML = '<p class="text-xs text-slate-400 italic">No specific bullet instructions logged.</p>';
    } else {
        bullets.forEach((b, idx) => {
            const isRelevantToTrade = currentCategory && (
                b.category.toLowerCase().includes(currentCategory.toLowerCase()) ||
                currentCategory.toLowerCase().includes(b.category.toLowerCase())
            );

            const bCard = document.createElement('div');
            bCard.className = `p-3 rounded-xl border transition-all ${
                isRelevantToTrade 
                    ? 'bg-amber-100/90 border-amber-400 shadow-sm ring-1 ring-amber-400' 
                    : 'bg-white border-slate-200'
            }`;

            bCard.innerHTML = `
                <div class="flex items-start gap-2.5">
                    <span class="text-xs font-bold ${isRelevantToTrade ? 'text-amber-800' : 'text-slate-400'} mt-0.5">#${idx + 1}</span>
                    <div class="space-y-1 min-w-0 flex-grow">
                        <div class="flex items-center justify-between gap-2">
                            <span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded ${
                                isRelevantToTrade ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-700'
                            }">
                                ${escapeHtml(b.category)}
                            </span>
                            ${isRelevantToTrade ? '<span class="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">Matches Selected Work</span>' : ''}
                        </div>
                        <p class="text-xs font-semibold text-slate-800 leading-snug">
                            ${escapeHtml(b.text)}
                        </p>
                    </div>
                </div>
            `;
            modalPcBulletsContainer.appendChild(bCard);
        });
    }

    // 5. Signed Drawing Vault Link
    if (planChange.signed_drawing_url) {
        modalPcDrawingLink.href = planChange.signed_drawing_url;
        modalPcDrawingLink.classList.remove('hidden');
    } else {
        modalPcDrawingLink.classList.add('hidden');
    }

    // 6. Launch Dialog
    pcModal.classList.remove('hidden');
    void pcModal.offsetWidth;
    pcModal.classList.remove('opacity-0');
    pcModal.querySelector('.relative').classList.remove('scale-95');
    pcModal.querySelector('.relative').classList.add('scale-100');
}

function closePlanChangeAlert() {
    pcModal.classList.add('opacity-0');
    pcModal.querySelector('.relative').classList.remove('scale-100');
    pcModal.querySelector('.relative').classList.add('scale-95');

    setTimeout(() => {
        pcModal.classList.add('hidden');
    }, 250);
}

function handlePlanChangeAcknowledgment() {
    closePlanChangeAlert();

    // Auto-append key requirements into Task Scope Notes if appropriate
    if (activePlanChangeForZone && taskDescInput) {
        const bullets = Array.isArray(activePlanChangeForZone.change_bullets) ? activePlanChangeForZone.change_bullets : [];
        const bulletSummary = bullets.map((b, i) => `${i + 1}. [${b.category}] ${b.text}`).join('\n');
        const planChangeTag = `*** CUSTOMER PLAN CHANGE MANDATE (Rev v${activePlanChangeForZone.revision_number || 1}) ***\n${bulletSummary}\n\n`;

        if (!taskDescInput.value.includes('CUSTOMER PLAN CHANGE MANDATE')) {
            taskDescInput.value = planChangeTag + (taskDescInput.value || '');
            taskDescInput.focus();
        }
    }
}

// Attach Alert Modal Listeners
if (modalPcDismissBtn) modalPcDismissBtn.addEventListener('click', handlePlanChangeAcknowledgment);
if (closePcModalCross) closePcModalCross.addEventListener('click', closePlanChangeAlert);
if (pcModalBackdrop) pcModalBackdrop.addEventListener('click', closePlanChangeAlert);

if (reopenPlanChangeModalBtn) {
    reopenPlanChangeModalBtn.addEventListener('click', () => {
        if (activePlanChangeForZone) {
            triggerPlanChangeAlert(activePlanChangeForZone);
        }
    });
}

// ==============================================================================
// 4. STRUCTURE & DROPDOWN CASCADING
// ==============================================================================
async function loadProjectStructure(projectId) {
    if (!isValidUUID(projectId)) {
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

async function populateZonesForFloor(projectId, selectedTower, selectedFloor) {
    if (!isValidUUID(projectId) || !selectedTower || !selectedFloor) {
        resetZoneDropdown();
        return;
    }

    zoneSelect.innerHTML = '<option value="">-- Loading Zones... --</option>';
    zoneSelect.disabled = true;

    try {
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

        // Automatic fallback: synthesize from architecture specifications
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
            area_type: 'Residential',
            department: 'Civil',
            room_size: flatSize,
            slope: 'N/A',
            is_pinned: false
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
            room_size: shopSize,
            slope: 'N/A',
            is_pinned: false
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
            room_size: groundArea,
            slope: 'N/A',
            is_pinned: false
        });
    }

    // Level Fallback
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

function resetZoneDropdown() {
    zoneSelect.innerHTML = '<option value="">-- Select Floor First --</option>';
    zoneSelect.disabled = true;
    zoneIndicator.classList.add('hidden');
    activePlanChangeForZone = null;
}

function resetStructureDropdowns() {
    currentProjectZones = [];
    towerSelect.innerHTML = '<option value="">-- Select Tower --</option>';
    towerSelect.disabled = false;
    floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';
    floorSelect.disabled = false;
    resetZoneDropdown();
}

// ==============================================================================
// 5. CASCADING EVENT LISTENERS & ZONE WATCHER
// ==============================================================================
projectSelect.addEventListener('change', async function() {
    const selectedOption = this.options[this.selectedIndex];
    const projectId = selectedOption ? selectedOption.dataset.id : null;
    
    if (isValidUUID(projectId)) {
        localStorage.setItem('activeProjectId', projectId);
        localStorage.setItem('activeProjectName', selectedOption.value);
        if (selectedOption.dataset.code) {
            localStorage.setItem('activeProjectCode', selectedOption.dataset.code);
        }
        await Promise.all([
            loadProjectStructure(projectId),
            preloadProjectPlanChanges(projectId)
        ]);
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

    if (isValidUUID(projectId) && selectedTower && selectedFloor) {
        await populateZonesForFloor(projectId, selectedTower, selectedFloor);
    } else {
        resetZoneDropdown();
    }
});

// ZONE SELECT CHANGE LISTENER (PLAN CHANGE ALERT INTERCEPTOR)
zoneSelect.addEventListener('change', function() {
    const selectedVal = this.value;
    const selectedLabel = this.options[this.selectedIndex]?.text || '';

    if (!selectedVal) {
        zoneIndicator.classList.add('hidden');
        activePlanChangeForZone = null;
        return;
    }

    const matchedPlanChange = findPlanChangeForZone(selectedVal, selectedLabel);

    if (matchedPlanChange) {
        triggerPlanChangeAlert(matchedPlanChange);
    } else {
        zoneIndicator.classList.add('hidden');
        activePlanChangeForZone = null;
    }
});

// If user modifies work category, re-highlight relevant plan change bullets if modal is active
categorySelect.addEventListener('change', function() {
    if (activePlanChangeForZone) {
        const bullets = Array.isArray(activePlanChangeForZone.change_bullets) ? activePlanChangeForZone.change_bullets : [];
        const currentCategory = this.value;

        Array.from(modalPcBulletsContainer.children).forEach((bCard, idx) => {
            const b = bullets[idx];
            if (!b) return;

            const isRelevant = currentCategory && (
                b.category.toLowerCase().includes(currentCategory.toLowerCase()) ||
                currentCategory.toLowerCase().includes(b.category.toLowerCase())
            );

            if (isRelevant) {
                bCard.className = 'p-3 rounded-xl border bg-amber-100/90 border-amber-400 shadow-sm ring-1 ring-amber-400 transition-all';
            } else {
                bCard.className = 'p-3 rounded-xl border bg-white border-slate-200 transition-all';
            }
        });
    }
});

// ==============================================================================
// 6. FORM SUBMISSION
// ==============================================================================
logTaskForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;

    submitBtn.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-brand-amber inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Assigning Task...
    `;
    submitBtn.disabled = true;

    const selectedProjectName = projectSelect.value;
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const selectedProjectId = selectedOption ? selectedOption.dataset.id : null;
    const currentTower = towerSelect.value;
    const currentFloor = floorSelect.value;
    const selectedZoneId = zoneSelect.value;
    const selectedCategory = categorySelect.value;
    const selectedAgency = assignedAgencySelect.value;
    const selectedTargetDate = expectedDateInput.value;
    const selectedStatus = statusSelect ? statusSelect.value : 'Not Started';
    const selectedPriority = prioritySelect ? prioritySelect.value : 'Medium';
    const taskDescription = taskDescInput ? taskDescInput.value.trim() : null;

    const todayDate = new Date().toISOString().split('T')[0];

    const taskPayload = {
        project_name: selectedProjectName,
        tower_block: currentTower,
        floor_level: currentFloor,
        zone_id: selectedZoneId,
        category: selectedCategory,
        assigned_agency: selectedAgency,
        expected_completion_date: selectedTargetDate,
        assigned_date: todayDate,
        status: selectedStatus,
        priority: selectedPriority,
        task_description: taskDescription || null
    };

    if (selectedStatus === 'In Progress') {
        taskPayload.started_date = todayDate;
    } else if (selectedStatus === 'Completed') {
        taskPayload.started_date = todayDate;
        taskPayload.completed_date = todayDate;
    }

    if (isValidUUID(selectedProjectId)) {
        taskPayload.project_id = selectedProjectId;
    }

    try {
        if (!client) {
            throw new Error('Supabase client connection offline.');
        }

        let { error } = await client
            .from('civil_tasks')
            .insert([taskPayload]);

        if (error && error.message && error.message.includes('project_id')) {
            const fallbackPayload = { ...taskPayload };
            delete fallbackPayload.project_id;
            const retryRes = await client.from('civil_tasks').insert([fallbackPayload]);
            error = retryRes.error;
        }

        if (error) throw error;

        // Feedback Banner
        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-emerald-50 text-emerald-800 border border-emerald-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Task assigned successfully to <strong>${escapeHtml(taskPayload.zone_id)}</strong> as <strong>${escapeHtml(selectedStatus)}</strong> [Priority: ${escapeHtml(selectedPriority)}]!</span>
        `;

        // Reset work fields while preserving structural location
        categorySelect.selectedIndex = 0;
        assignedAgencySelect.selectedIndex = 0;
        expectedDateInput.value = '';
        if (statusSelect) statusSelect.value = 'Not Started';
        if (prioritySelect) prioritySelect.value = 'Medium';
        if (taskDescInput) taskDescInput.value = '';
        zoneSelect.selectedIndex = 0;
        zoneIndicator.classList.add('hidden');
        activePlanChangeForZone = null;

        zoneSelect.focus();

    } catch (err) {
        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-red-50 text-red-800 border border-red-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Error assigning task: ${escapeHtml(err.message || 'Database write failed')}</span>
        `;
        console.error('[Task Logging Failure]:', err);
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;

        setTimeout(() => {
            feedbackBox.classList.add('hidden');
        }, 6500);
    }
});

// Run initialization on DOM ready
document.addEventListener('DOMContentLoaded', initProjectContext);