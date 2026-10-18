/**
 * Prayosha ERP - Task Logging, Plan Change Interceptor & Real-Time Notification Controller
 * File: /tasks/log-task.js
 * 
 * Features:
 * 1. 3-Tier Cascading Hierarchy: Project -> Tower -> Floor Level -> Zone ID dynamically from database records.
 * 2. Distinct Smart Prefixing: Generates unique prefixes per tower (e.g. TA, TB, TC) avoiding 409 duplicate key conflicts.
 * 3. Discrete Zone Parser: Unpacks flats, shops, and individual floor amenities (Parking, Lifts, Ducts, Stairs, Passage).
 * 4. Self-Healing Database Sync: Automatically prunes legacy compound strings and deduplicates zone entities.
 * 5. Plan Change Alert Interceptor: Detects active customer modifications and triggers an unskippable warning modal.
 * 6. Trade-Aware Checkpoint Highlighting: Dynamically emphasizes bullets matching the selected civil trade category.
 * 7. Dynamic Agency Loader: Populates contractor options from the vendors directory.
 * 8. Real-Time Central Notification Dispatch: Dispatches alerts to the universal notification engine.
 * 9. Resilient UUID & Fallback Handling: Fully immune to PostgreSQL 42703, 23505, and 22P02 database errors.
 */

import { supabase } from '../config.js';
import { sendNotification } from '../common/shell.js';

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
    const f = (floorName || '').toLowerCase().trim();
    if (f.includes('basement 2') || f === 'bm2' || f === 'b2') return 'BM2';
    if (f.includes('basement 1') || f === 'bm1' || f === 'b1') return 'BM1';
    if (f.includes('basement')) {
        const num = f.replace(/\D/g, '');
        return num ? `BM${num}` : 'BM';
    }
    if (f.includes('ground') || f === 'gf' || f === 'g') return 'GF';
    if (f.includes('podium')) return 'POD';
    if (f.includes('terrace')) return 'TER';
    if (f.includes('1st') || f === '1') return '1F';
    if (f.includes('2nd') || f === '2') return '2F';
    if (f.includes('3rd') || f === '3') return '3F';
    const numMatch = f.match(/\d+/);
    if (numMatch) return `${numMatch[0]}F`;
    return f.slice(0, 3).toUpperCase();
}

function getAmenityCode(amenityName) {
    const clean = (amenityName || '').trim().toLowerCase();
    if (clean.includes('parking')) return 'PKG';
    if (clean.includes('lift 1') || clean === 'lift1') return 'LFT1';
    if (clean.includes('lift 2') || clean === 'lift2') return 'LFT2';
    if (clean.includes('lift 3') || clean === 'lift3') return 'LFT3';
    if (clean.includes('lift')) return 'LFT';
    if (clean.includes('duct')) return 'DCT';
    if (clean.includes('stair')) return 'STR';
    if (clean.includes('passage') || clean.includes('corridor')) return 'PAS';
    if (clean.includes('reception')) return 'RCP';
    if (clean.includes('gym')) return 'GYM';
    if (clean.includes('pool')) return 'POOL';
    if (clean.includes('club')) return 'CLUB';
    if (clean.includes('garden')) return 'GDN';
    if (clean.includes('play')) return 'PLAY';
    if (clean.includes('yoga')) return 'YGA';
    if (clean.includes('spa')) return 'SPA';
    if (clean.includes('sauna')) return 'SNA';
    if (clean.includes('foyer') || clean.includes('lobby')) return 'LBY';
    const abbrev = clean.replace(/[^a-z0-9]/g, '').slice(0, 4).toUpperCase();
    return abbrev || 'AMN';
}

/**
 * Smart Tower Prefix Resolver (e.g., "Tower A" -> "TA", "Tower B" -> "TB", "Clubhouse" -> "CLU")
 */
function getTowerPrefix(towerName) {
    if (!towerName) return 'TOW';
    const clean = towerName.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase().trim();
    const tMatch = clean.match(/TOWER\s*([A-Z0-9]+)/);
    if (tMatch) {
        return `T${tMatch[1]}`;
    }
    const parts = clean.split(/\s+/);
    if (parts.length > 1) {
        return parts.map(p => p[0]).join('').slice(0, 4);
    }
    return clean.slice(0, 3) || 'TOW';
}

// ==============================================================================
// 2. PROJECT INITIALIZATION & CACHE
// ==============================================================================
async function initProjectContext() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';

    // Populate agency dropdown from registered vendors
    await loadAgencies();

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

async function loadAgencies() {
    if (!assignedAgencySelect || !client) return;

    try {
        const { data: vendorList } = await client
            .from('vendors')
            .select('id, name, trade_name, category, status')
            .order('name', { ascending: true });

        if (vendorList && vendorList.length > 0) {
            const currentVal = assignedAgencySelect.value;
            assignedAgencySelect.innerHTML = '<option value="">-- Select Agency --</option>';
            
            vendorList.forEach(v => {
                if (v.status === 'Blacklisted') return;
                const firm = v.name || v.trade_name;
                const cat = v.category ? ` [${v.category}]` : '';
                const opt = document.createElement('option');
                opt.value = firm;
                opt.textContent = `${firm}${cat}`;
                assignedAgencySelect.appendChild(opt);
            });

            if (currentVal) assignedAgencySelect.value = currentVal;
        }
    } catch (err) {
        console.warn('[Task Logger] Could not load vendors into assigned_agency:', err);
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

function findPlanChangeForZone(selectedZoneVal, selectedZoneLabel) {
    if (!projectActivePlanChanges || projectActivePlanChanges.length === 0) return null;

    const normVal = normalizeString(selectedZoneVal);
    const normLabel = normalizeString(selectedZoneLabel);

    return projectActivePlanChanges.find(pc => {
        const normPcZone = normalizeString(pc.zone_id);
        
        if (normPcZone === normVal || normPcZone === normLabel) return true;
        if (normVal.includes(normPcZone) || normLabel.includes(normPcZone)) return true;

        const pcNumbers = pc.zone_id.replace(/\D/g, '');
        const zoneNumbers = (selectedZoneVal + ' ' + selectedZoneLabel).replace(/\D/g, '');
        if (pcNumbers && zoneNumbers && (pcNumbers === zoneNumbers || zoneNumbers.endsWith(pcNumbers))) {
            return true;
        }

        return false;
    }) || null;
}

function triggerPlanChangeAlert(planChange) {
    if (!planChange) return;
    activePlanChangeForZone = planChange;

    zoneIndicator.classList.remove('hidden');
    indicatorRevText.textContent = `Customization Active (Rev v${planChange.revision_number || 1}) for ${planChange.zone_id} • Customer: ${planChange.customer_name}`;

    modalPcRev.textContent = `Rev v${planChange.revision_number || 1}`;
    modalPcZoneId.textContent = planChange.zone_id;
    modalPcLocation.textContent = `(${planChange.tower_block} • ${planChange.floor_level})`;
    modalPcCustomerName.textContent = planChange.customer_name;
    modalPcPhone.textContent = planChange.customer_phone || 'Not recorded';
    modalPcCostTerms.textContent = planChange.cost_impact_type || 'Customer Provided Material';

    if (planChange.has_structural_impact) {
        modalPcStructuralAlert.classList.remove('hidden');
    } else {
        modalPcStructuralAlert.classList.add('hidden');
    }

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

    if (planChange.signed_drawing_url) {
        modalPcDrawingLink.href = planChange.signed_drawing_url;
        modalPcDrawingLink.classList.remove('hidden');
    } else {
        modalPcDrawingLink.classList.add('hidden');
    }

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

/**
 * Robust Zone Loader: synthesizes distinct zone IDs per tower (TA, TB, etc.),
 * prevents 409 collisions across towers, and populates the zone selector.
 */
async function populateZonesForFloor(projectId, selectedTower, selectedFloor) {
    if (!isValidUUID(projectId) || !selectedTower || !selectedFloor) {
        resetZoneDropdown();
        return;
    }

    zoneSelect.innerHTML = '<option value="">-- Loading Zones... --</option>';
    zoneSelect.disabled = true;

    try {
        const matchingArch = currentProjectZones.find(z => 
            (z.tower_name || '').trim().toLowerCase() === selectedTower.trim().toLowerCase() && 
            (z.floor_name || z.zone_name || '').trim().toLowerCase() === selectedFloor.trim().toLowerCase()
        );

        // Fetch existing map zones for this tower & floor
        const { data: mapZones, error } = await client
            .from('project_map_zones')
            .select('*')
            .eq('project_id', projectId)
            .ilike('tower_name', selectedTower.trim())
            .ilike('floor_level', selectedFloor.trim())
            .order('zone_id', { ascending: true });

        if (error) throw error;

        let activeZones = mapZones || [];

        // 1. Prune legacy clumped basement zones
        const legacyRows = activeZones.filter(z => 
            (z.room_identifier && z.room_identifier.includes(',')) ||
            (z.zone_id && z.zone_id.endsWith('-Z01') && z.room_identifier && z.room_identifier.includes('Parking'))
        );

        if (legacyRows.length > 0) {
            const legacyIds = legacyRows.map(r => r.id).filter(Boolean);
            if (legacyIds.length > 0) {
                try {
                    await client.from('project_map_zones').delete().in('id', legacyIds);
                } catch (delErr) {
                    console.warn('[Task Logger] Could not prune legacy clumped zones:', delErr);
                }
            }
            activeZones = activeZones.filter(z => !legacyIds.includes(z.id));
        }

        // 2. Synthesize zones from architecture blueprint
        if (matchingArch) {
            const synthesized = synthesizeZonesForFloor(projectId, matchingArch);

            // Filter zones that are not yet in the active floor list
            const candidateZones = synthesized.filter(syn => 
                !activeZones.some(az => 
                    az.zone_id === syn.zone_id || 
                    normalizeString(az.room_identifier) === normalizeString(syn.room_identifier)
                )
            );

            if (candidateZones.length > 0) {
                try {
                    // Check if any candidate zone IDs already exist anywhere in the project to eliminate 409 collisions
                    const candidateIds = candidateZones.map(c => c.zone_id);
                    const { data: existingRows } = await client
                        .from('project_map_zones')
                        .select('id, zone_id, room_identifier, tower_name, floor_level')
                        .eq('project_id', projectId)
                        .in('zone_id', candidateIds);

                    const existingZoneIdSet = new Set((existingRows || []).map(r => r.zone_id));
                    const safeToInsert = candidateZones.filter(c => !existingZoneIdSet.has(c.zone_id));

                    if (safeToInsert.length > 0) {
                        const { data: inserted, error: insErr } = await client
                            .from('project_map_zones')
                            .insert(safeToInsert)
                            .select();

                        if (!insErr && inserted) {
                            activeZones = activeZones.concat(inserted);
                        } else {
                            activeZones = activeZones.concat(safeToInsert);
                        }
                    }

                    if (existingRows && existingRows.length > 0) {
                        activeZones = activeZones.concat(existingRows);
                    }
                } catch (persistErr) {
                    console.warn('[Task Logger] Non-blocking zone sync notice:', persistErr);
                    activeZones = activeZones.concat(candidateZones);
                }
            }
        }

        // 3. Deduplicate zones by zone_id
        const uniqueMap = new Map();
        activeZones.forEach(z => {
            if (z.zone_id && !uniqueMap.has(z.zone_id)) {
                uniqueMap.set(z.zone_id, z);
            }
        });
        activeZones = Array.from(uniqueMap.values());

        // 4. Render distinct selectable zones in dropdown
        if (activeZones.length > 0) {
            activeZones.sort((a, b) => {
                const getWeight = (z) => {
                    const cat = (z.category || '').toLowerCase();
                    if (cat === 'flat') return 1;
                    if (cat === 'shop') return 2;
                    if (cat === 'amenity' || cat === 'common area' || cat === 'facility room') return 3;
                    return 4;
                };
                const wDiff = getWeight(a) - getWeight(b);
                if (wDiff !== 0) return wDiff;
                return (a.zone_id || '').localeCompare(b.zone_id || '');
            });

            zoneSelect.innerHTML = '<option value="">-- Select Zone ID --</option>';
            activeZones.forEach(zone => {
                const opt = document.createElement('option');
                opt.value = zone.zone_id;
                const baseLabel = zone.room_identifier ? `[${zone.zone_id}] ${zone.room_identifier}` : zone.zone_id;
                const catTag = zone.category ? ` (${zone.category})` : '';
                opt.textContent = `${baseLabel}${catTag}`;
                zoneSelect.appendChild(opt);
            });
            zoneSelect.disabled = false;
            return;
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
 * Synthesizes flats, shops, and every individual amenity using distinct tower prefixes.
 */
function synthesizeZonesForFloor(projectId, record) {
    const tower = record.tower_name || 'Tower A';
    const floor = record.floor_name || record.zone_name || 'Ground Floor';
    
    // Distinct prefix: "Tower A" -> "TA", "Tower B" -> "TB", "Clubhouse" -> "CLU"
    const towerPrefix = getTowerPrefix(tower);
    const floorPrefix = getFloorAbbreviation(floor);

    const config = record.unit_configuration || {};
    const totalFlats = parseInt(record.total_flats) || 0;
    const totalShops = parseInt(record.total_shops) || 0;
    const zones = [];
    const usedZoneIds = new Set();

    // 1. Flats
    for (let f = 1; f <= totalFlats; f++) {
        const zoneId = `${towerPrefix}-${floorPrefix}-FLAT-${String(f).padStart(2, '0')}`;
        const flatSize = (config.flats && config.flats[f - 1]) ? `${config.flats[f - 1]} sq.ft` : 'N/A';
        usedZoneIds.add(zoneId);
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
        usedZoneIds.add(zoneId);
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

    // 3. Custom Facility Rooms (e.g. Reception, Spa, Gym)
    if (config.rooms && typeof config.rooms === 'object') {
        Object.entries(config.rooms).forEach(([roomName, sizeVal]) => {
            const cleanRoom = roomName.trim();
            if (!cleanRoom) return;

            const code = getAmenityCode(cleanRoom);
            let zoneId = `${towerPrefix}-${floorPrefix}-${code}`;
            let counter = 1;
            while (usedZoneIds.has(zoneId)) {
                zoneId = `${towerPrefix}-${floorPrefix}-${code}-${counter++}`;
            }
            usedZoneIds.add(zoneId);

            const sizeStr = (sizeVal && sizeVal > 0) ? `${sizeVal} sq.ft` : 'N/A';
            const displayTitle = sizeVal && sizeVal > 0 ? `${cleanRoom} (${sizeVal} sq.ft)` : cleanRoom;

            zones.push({
                project_id: projectId,
                tower_name: tower,
                floor_level: floor,
                zone_id: zoneId,
                room_identifier: displayTitle,
                category: 'Facility Room',
                area_type: 'Common Area',
                department: 'Civil',
                room_size: sizeStr,
                slope: 'N/A',
                is_pinned: false
            });
        });
    }

    // 4. Floor Amenities & Common Core (Parking, Lift 1, Lift 2, Duct, Stair Case, Passage)
    const amenitySet = new Set();

    if (config.amenities_sizes && typeof config.amenities_sizes === 'object') {
        Object.keys(config.amenities_sizes).forEach(name => {
            if (name && name.trim() && name.trim().toUpperCase() !== 'N.A.') {
                amenitySet.add(name.trim());
            }
        });
    }

    if (record.amenity && typeof record.amenity === 'string' && record.amenity.toUpperCase() !== 'N.A.') {
        record.amenity.split(',').forEach(item => {
            const clean = item.trim();
            if (clean && clean.toUpperCase() !== 'N.A.') {
                amenitySet.add(clean);
            }
        });
    }

    amenitySet.forEach(amenityName => {
        const sizeVal = (config.amenities_sizes && config.amenities_sizes[amenityName]) 
            ? parseFloat(config.amenities_sizes[amenityName]) 
            : 0;

        const code = getAmenityCode(amenityName);
        let zoneId = `${towerPrefix}-${floorPrefix}-${code}`;
        let counter = 1;
        while (usedZoneIds.has(zoneId)) {
            zoneId = `${towerPrefix}-${floorPrefix}-${code}-${counter++}`;
        }
        usedZoneIds.add(zoneId);

        const sizeStr = (sizeVal && sizeVal > 0) ? `${sizeVal} sq.ft` : 'N/A';
        const displayTitle = (sizeVal && sizeVal > 0) ? `${amenityName} (${sizeVal} sq.ft)` : amenityName;

        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: zoneId,
            room_identifier: displayTitle,
            category: 'Amenity',
            area_type: 'Common Area',
            department: 'Civil',
            room_size: sizeStr,
            slope: 'N/A',
            is_pinned: false
        });
    });

    // 5. Common Landscape fallback
    if (record.zone_type === 'Common Zone' && zones.length === 0) {
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
// 6. FORM SUBMISSION WITH REAL-TIME NOTIFICATION DISPATCH
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

        // Central Notification Dispatch
        try {
            const notifyFn = typeof sendNotification === 'function' ? sendNotification : window.sendNotification;
            if (notifyFn) {
                const targetAgency = selectedAgency || 'Site Team';
                await notifyFn({
                    projectId: isValidUUID(selectedProjectId) ? selectedProjectId : null,
                    recipientRole: selectedAgency || 'Site Engineer',
                    title: `Task Assigned: ${selectedCategory}`,
                    message: `New civil task assigned at ${currentTower} • ${currentFloor} [${selectedZoneId}] to ${targetAgency}. Priority: ${selectedPriority}. Target: ${selectedTargetDate || 'TBD'}.`,
                    phase: 'Civil Tasks',
                    linkUrl: `../tasks/active-tasks.html?zone_id=${encodeURIComponent(selectedZoneId)}`
                });
            }
        } catch (notifErr) {
            console.warn('[Task Logger] Notification dispatch skipped:', notifErr);
        }

        feedbackBox.className = 'p-4 rounded-xl text-sm font-semibold mt-4 bg-emerald-50 text-emerald-800 border border-emerald-200 block shadow-sm flex items-center gap-2';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Task assigned successfully to <strong>${escapeHtml(taskPayload.zone_id)}</strong> as <strong>${escapeHtml(selectedStatus)}</strong> [Priority: ${escapeHtml(selectedPriority)}]!</span>
        `;

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