import { supabase, uploadToR2 } from '../config.js';

// ============================================================================
// GLOBAL APPLICATION STATE
// ============================================================================
const state = {
  activeProjectId: null,
  activeProjectName: '',
  activeTower: 'Tower A',
  activeFloor: '',
  floorPlans: [],        // Records from project_floor_plans
  projectZonesRaw: [],   // Records from project_zones (architecture specs)
  mapZones: [],          // Granular zones from project_map_zones
  tasks: [],             // Live tasks from civil_tasks
  issues: [],            // Live issues from issues_blockers
  workforceLogs: [],     // Live workforce logs from workforce_logs
  
  // Interactive Viewport State
  scale: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  startX: 0,
  startY: 0,
  
  // 2D CAD Viewport State
  cadScale: 1,
  cadPanX: 0,
  cadPanY: 0,
  cadIsPanning: false,
  cadStartX: 0,
  cadStartY: 0,

  // Pin Placement Mode State
  isPinMode: false,
  selectedUnpinnedZone: null,
  draggedPinZoneId: null,

  // Filters & Heatmaps
  heatmapMode: 'progress', // 'progress' | 'issues' | 'workforce'
  categoryFilter: 'ALL',
  drawerTab: 'unpinned'    // 'unpinned' | 'pinned'
};

// ============================================================================
// INITIALIZATION ON DOM CONTENT LOADED
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigationSubtabs();
  setupCanvasPanZoom();
  setupCadPanZoom();
  setupEventListeners();
  setupQRCodeModal();

  // Load active project from localStorage or query first available
  state.activeProjectId = localStorage.getItem('activeProjectId') || null;
  state.activeProjectName = localStorage.getItem('activeProjectName') || '';

  await loadProjectsDropdown();

  if (state.activeProjectId) {
    await loadProjectData(state.activeProjectId);
  } else {
    updateBadge('No Project Selected');
  }
});

// ============================================================================
// PROJECT & CORE DATA LOADERS
// ============================================================================
async function loadProjectsDropdown() {
  const mapProjectSelect = document.getElementById('select-map-project');
  const uploadProjectSelect = document.getElementById('upload-plan-project');

  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, project_name, project_code')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!projects || projects.length === 0) {
      mapProjectSelect.innerHTML = '<option value="">No Projects Found</option>';
      uploadProjectSelect.innerHTML = '<option value="">No Projects Found</option>';
      return;
    }

    let optionsHtml = '';
    projects.forEach(p => {
      const isSelected = p.id === state.activeProjectId ? 'selected' : '';
      optionsHtml += `<option value="${p.id}" ${isSelected}>${p.project_name} (${p.project_code})</option>`;
    });

    mapProjectSelect.innerHTML = optionsHtml;
    uploadProjectSelect.innerHTML = optionsHtml;

    if (!state.activeProjectId && projects.length > 0) {
      state.activeProjectId = projects[0].id;
      state.activeProjectName = projects[0].project_name;
      localStorage.setItem('activeProjectId', projects[0].id);
      localStorage.setItem('activeProjectName', projects[0].project_name);
    }
  } catch (err) {
    console.error('Failed to load projects dropdown:', err);
    showToast('Could not load projects list.', 'error');
  }
}

async function loadProjectData(projectId) {
  showLoadingSpinner(true);
  state.activeProjectId = projectId;

  try {
    // 1. Fetch Project Details for Badge
    const { data: project } = await supabase
      .from('projects')
      .select('id, project_name, project_code')
      .eq('id', projectId)
      .single();

    if (project) {
      state.activeProjectName = project.project_name;
      updateBadge(`${project.project_name} (${project.project_code})`);
      localStorage.setItem('activeProjectId', project.id);
      localStorage.setItem('activeProjectName', project.project_name);
    }

    // 2. Fetch Floor Plans & Blueprints (Cloudflare R2 entries)
    const { data: floorPlans, error: plansErr } = await supabase
      .from('project_floor_plans')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });

    if (plansErr) console.warn('Could not fetch floor plans:', plansErr);
    state.floorPlans = floorPlans || [];

    // 3. Fetch Architecture Structure Specs (from project_zones)
    const { data: archZones, error: archErr } = await supabase
      .from('project_zones')
      .select('*')
      .eq('project_id', projectId);

    if (archErr) console.warn('Could not fetch project zones:', archErr);
    state.projectZonesRaw = archZones || [];

    // 4. Fetch Granular Map Zones & Coordinate Pins (from project_map_zones)
    const { data: mapZones, error: mapErr } = await supabase
      .from('project_map_zones')
      .select('*')
      .eq('project_id', projectId)
      .order('zone_id', { ascending: true });

    if (mapErr) console.warn('Could not fetch project_map_zones:', mapErr);
    state.mapZones = mapZones || [];

    // 5. Fetch Live Operational Tasks
    try {
      const { data: tasks } = await supabase
        .from('civil_tasks')
        .select('Task_ID, Zone_ID, Task_Description, Status, Assigned_Agency');
      state.tasks = tasks || [];
    } catch (e) {
      state.tasks = [];
    }

    // 6. Fetch Live Blocker Issues
    try {
      const { data: issues } = await supabase
        .from('issues_blockers')
        .select('Issue_ID, Zone_ID, Description, Status, Reported_By');
      state.issues = issues || [];
    } catch (e) {
      state.issues = [];
    }

    // 7. If project_map_zones is completely empty for this project, auto-synthesize from project_zones
    if (state.mapZones.length === 0 && state.projectZonesRaw.length > 0) {
      await autoSynthesizeZonesFromArchitecture(false);
    }

    // Populate Tower & Floor Selectors
    populateTowerAndFloorSelectors();
    renderConfiguredPlansTable();
    updateZoneGridDirectory();

    // Render Active Map View
    renderActiveFloorPlan();
  } catch (err) {
    console.error('Error loading project data:', err);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    showLoadingSpinner(false);
  }
}

// ============================================================================
// AUTOMATIC ZONE SYNTHESIZER (Unpacks project_zones to project_map_zones)
// ============================================================================
async function autoSynthesizeZonesFromArchitecture(showSuccessToast = true) {
  if (!state.projectZonesRaw || state.projectZonesRaw.length === 0) {
    if (showSuccessToast) showToast('No project architecture defined to sync.', 'info');
    return;
  }

  const zonesToInsert = [];
  const existingZoneIds = new Set(state.mapZones.map(z => z.zone_id));

  state.projectZonesRaw.forEach(record => {
    const tower = record.tower_name || 'Tower A';
    const floor = record.floor_name || 'Ground Floor';
    const towerPrefix = tower.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
    const floorPrefix = getFloorAbbreviation(floor);

    const config = record.unit_configuration || {};
    const totalFlats = parseInt(record.total_flats) || 0;
    const totalShops = parseInt(record.total_shops) || 0;

    // A. Unpack Flats
    for (let f = 1; f <= totalFlats; f++) {
      const zoneId = `${towerPrefix}-${floorPrefix}-FLAT-${String(f).padStart(2, '0')}`;
      if (!existingZoneIds.has(zoneId)) {
        const flatSize = (config.flats && config.flats[f - 1]) ? `${config.flats[f - 1]} sq.ft` : 'N/A';
        zonesToInsert.push({
          project_id: state.activeProjectId,
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
        existingZoneIds.add(zoneId);
      }
    }

    // B. Unpack Shops
    for (let s = 1; s <= totalShops; s++) {
      const zoneId = `${towerPrefix}-${floorPrefix}-SHOP-${String(s).padStart(2, '0')}`;
      if (!existingZoneIds.has(zoneId)) {
        const shopSize = (config.shops && config.shops[s - 1]) ? `${config.shops[s - 1]} sq.ft` : 'N/A';
        zonesToInsert.push({
          project_id: state.activeProjectId,
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
        existingZoneIds.add(zoneId);
      }
    }

    // C. Unpack Amenities
    if (config.amenities_sizes && typeof config.amenities_sizes === 'object') {
      Object.entries(config.amenities_sizes).forEach(([amenityName, size], idx) => {
        const slug = amenityName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
        const zoneId = `${towerPrefix}-${floorPrefix}-${slug}-${String(idx + 1).padStart(2, '0')}`;
        if (!existingZoneIds.has(zoneId)) {
          zonesToInsert.push({
            project_id: state.activeProjectId,
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
          existingZoneIds.add(zoneId);
        }
      });
    }

    // D. Unpack Facility Custom Rooms (Clubhouses, Gyms, Reception)
    if (config.rooms && typeof config.rooms === 'object') {
      Object.entries(config.rooms).forEach(([roomName, size], idx) => {
        const slug = roomName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
        const zoneId = `${towerPrefix}-${floorPrefix}-${slug}-${String(idx + 1).padStart(2, '0')}`;
        if (!existingZoneIds.has(zoneId)) {
          zonesToInsert.push({
            project_id: state.activeProjectId,
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
          existingZoneIds.add(zoneId);
        }
      });
    }

    // E. Unpack Flat Ground Zones (Main Garden, Walkways)
    if (record.zone_type === 'Common Zone') {
      const zoneId = `GND-${towerPrefix}-001`;
      if (!existingZoneIds.has(zoneId)) {
        const groundArea = (config.total_area) ? `${config.total_area} sq.ft` : 'N/A';
        zonesToInsert.push({
          project_id: state.activeProjectId,
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
        existingZoneIds.add(zoneId);
      }
    }
  });

  if (zonesToInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from('project_map_zones')
      .insert(zonesToInsert)
      .select();

    if (error) {
      console.error('Error inserting synthesized zones:', error);
      showToast('Could not automatically register zones.', 'error');
    } else {
      state.mapZones = [...state.mapZones, ...inserted];
      if (showSuccessToast) {
        showToast(`Synthesized ${inserted.length} new zones from Architecture Specs!`, 'success');
      }
    }
  } else if (showSuccessToast) {
    showToast('All zones are currently up to date.', 'info');
  }
}

function getFloorAbbreviation(floorName) {
  const f = floorName.toLowerCase();
  if (f.includes('basement 1')) return 'BM1';
  if (f.includes('basement 2')) return 'BM2';
  if (f.includes('basement')) return 'BM';
  if (f.includes('ground')) return 'GF';
  if (f.includes('1st')) return '1F';
  if (f.includes('2nd')) return '2F';
  if (f.includes('3rd')) return '3F';
  const numMatch = f.match(/\d+/);
  if (numMatch) return `${numMatch[0]}F`;
  return f.slice(0, 3).toUpperCase();
}

// ============================================================================
// DROPDOWNS & FILTER POPULATION
// ============================================================================
function populateTowerAndFloorSelectors() {
  const towerSelect = document.getElementById('select-map-tower');
  const floorSelect = document.getElementById('select-map-floor');
  const cadFloorSelect = document.getElementById('select-cad-floor');
  const gridFloorSelect = document.getElementById('select-grid-floor-filter');
  const qrFloorSelect = document.getElementById('select-qr-modal-floor');

  // Gather unique towers from plans, zones, and architecture specs
  const towers = new Set();
  state.floorPlans.forEach(p => towers.add(p.tower_name));
  state.projectZonesRaw.forEach(z => towers.add(z.tower_name));
  state.mapZones.forEach(m => towers.add(m.tower_name));
  if (towers.size === 0) towers.add('Tower A');

  let towerHtml = '';
  towers.forEach(t => {
    towerHtml += `<option value="${t}" ${t === state.activeTower ? 'selected' : ''}>${t}</option>`;
  });
  towerSelect.innerHTML = towerHtml;
  if (!towers.has(state.activeTower)) {
    state.activeTower = Array.from(towers)[0];
  }

  // Gather unique floors for the selected tower
  const floors = new Set();
  state.floorPlans.filter(p => p.tower_name === state.activeTower).forEach(p => floors.add(p.floor_level));
  state.projectZonesRaw.filter(z => z.tower_name === state.activeTower).forEach(z => floors.add(z.floor_name));
  state.mapZones.filter(m => m.tower_name === state.activeTower).forEach(m => floors.add(m.floor_level));

  let floorOptionsHtml = '';
  let gridOptionsHtml = '<option value="ALL">All Floor Levels</option>';
  let qrOptionsHtml = '<option value="ALL">All Floors</option>';

  const floorArray = Array.from(floors);
  if (floorArray.length === 0) {
    floorOptionsHtml = '<option value="">No Floors Configured</option>';
    state.activeFloor = '';
  } else {
    if (!floors.has(state.activeFloor)) {
      state.activeFloor = floorArray[0];
    }
    floorArray.forEach(fl => {
      const isSel = fl === state.activeFloor ? 'selected' : '';
      floorOptionsHtml += `<option value="${fl}" ${isSel}>${fl}</option>`;
      gridOptionsHtml += `<option value="${fl}">${fl}</option>`;
      qrOptionsHtml += `<option value="${fl}">${fl}</option>`;
    });
  }

  floorSelect.innerHTML = floorOptionsHtml;
  cadFloorSelect.innerHTML = floorOptionsHtml;
  gridFloorSelect.innerHTML = gridOptionsHtml;
  qrFloorSelect.innerHTML = qrOptionsHtml;

  // Populate Categories Filter
  populateCategoryDropdown();
}

function populateCategoryDropdown() {
  const catSelect = document.getElementById('select-category-filter');
  const categories = new Set();

  state.mapZones.forEach(z => {
    if (z.category && z.category.trim()) categories.add(z.category.trim());
  });

  let catHtml = '<option value="ALL">Filter: All Zones</option>';
  categories.forEach(c => {
    catHtml += `<option value="${c}">${c}</option>`;
  });
  catSelect.innerHTML = catHtml;
}

// ============================================================================
// CANVAS & INTERACTIVE MAP RENDERING ENGINE
// ============================================================================
function renderActiveFloorPlan() {
  const planImg = document.getElementById('img-floor-plan');
  const emptyState = document.getElementById('map-empty-state');
  const stage = document.getElementById('map-stage');
  const currentFloorTag = document.getElementById('current-floor-tag');

  currentFloorTag.textContent = state.activeFloor || 'No Floor';

  // Find matching floor plan record
  const matchingPlan = state.floorPlans.find(
    p => p.tower_name === state.activeTower && p.floor_level === state.activeFloor
  );

  const activeUrl = matchingPlan?.map_3d_url || matchingPlan?.original_2d_url || null;

  if (activeUrl) {
    emptyState.classList.add('hidden');
    planImg.src = activeUrl;
    planImg.onload = () => {
      planImg.classList.remove('opacity-0');
      resetCanvasTransform();
      renderPinsOnOverlay();
    };
  } else {
    planImg.src = '';
    planImg.classList.add('opacity-0');
    emptyState.classList.remove('hidden');
    clearPinsOverlay();
  }

  // Update Drawer Lists
  updateDrawerZoneCards();

  // Also sync 2D CAD Plan Viewport
  renderCadDrawing(matchingPlan?.original_2d_url);
}

function renderPinsOnOverlay() {
  const container = document.getElementById('pins-overlay-container');
  container.innerHTML = '';

  const floorZones = state.mapZones.filter(
    z => z.tower_name === state.activeTower && 
         z.floor_level === state.activeFloor && 
         z.is_pinned === true &&
         z.top_coordinate !== null &&
         z.left_coordinate !== null
  );

  floorZones.forEach(zone => {
    if (state.categoryFilter !== 'ALL' && zone.category !== state.categoryFilter) {
      return;
    }

    const pinEl = document.createElement('div');
    pinEl.className = 'site-pin absolute cursor-pointer flex flex-col items-center select-none group';
    pinEl.style.top = `${zone.top_coordinate}%`;
    pinEl.style.left = `${zone.left_coordinate}%`;
    pinEl.setAttribute('data-zone-id', zone.zone_id);

    // Compute pin color and badges based on Heatmap Mode
    const pinColorClasses = getPinStyleByHeatmap(zone);

    pinEl.innerHTML = `
      <div class="relative flex items-center justify-center">
        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full shadow-lg border-2 border-white flex items-center justify-center text-xs font-bold text-white transition-transform ${pinColorClasses.bgColor} ${pinColorClasses.pulseClass}">
          ${pinColorClasses.iconHtml}
        </div>
        <div class="absolute -top-6 whitespace-nowrap bg-slate-900/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          ${zone.room_identifier} (${zone.zone_id})
        </div>
      </div>
    `;

    // Click handler: Open detail modal or begin repositioning
    pinEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.isPinMode) {
        // In Pin Mode, clicking an existing pin allows dragging/repositioning
        startRepositioningPin(zone);
      } else {
        openZoneDetailModal(zone);
      }
    });

    container.appendChild(pinEl);
  });
}

function clearPinsOverlay() {
  const container = document.getElementById('pins-overlay-container');
  if (container) container.innerHTML = '';
}

function getPinStyleByHeatmap(zone) {
  // Check Blocker Issues for this Zone
  const activeIssues = state.issues.filter(i => i.Zone_ID === zone.zone_id && i.Status !== 'Resolved');
  
  // Check Tasks for this Zone
  const zoneTasks = state.tasks.filter(t => t.Zone_ID === zone.zone_id);
  const pendingTasks = zoneTasks.filter(t => t.Status !== 'Completed' && t.Status !== 'Ready for QC');

  if (state.heatmapMode === 'issues') {
    if (activeIssues.length > 0) {
      return {
        bgColor: 'bg-rose-600',
        pulseClass: 'pin-pulsing',
        iconHtml: `<i class="fa-solid fa-triangle-exclamation"></i>`
      };
    }
    return {
      bgColor: 'bg-emerald-600',
      pulseClass: '',
      iconHtml: `<i class="fa-solid fa-check"></i>`
    };
  }

  if (state.heatmapMode === 'workforce') {
    const laborCount = zone.allocated_labor || Math.floor(Math.random() * 5); // placeholder or live count
    return {
      bgColor: laborCount > 0 ? 'bg-indigo-600' : 'bg-slate-500',
      pulseClass: '',
      iconHtml: `<span class="text-[11px]">${laborCount}</span>`
    };
  }

  // Default: 'progress' mode
  if (activeIssues.length > 0) {
    return {
      bgColor: 'bg-rose-600',
      pulseClass: 'pin-pulsing',
      iconHtml: `<i class="fa-solid fa-circle-exclamation"></i>`
    };
  }
  if (pendingTasks.length > 0) {
    return {
      bgColor: 'bg-amber-500',
      pulseClass: '',
      iconHtml: `<i class="fa-solid fa-person-digging"></i>`
    };
  }
  return {
    bgColor: 'bg-emerald-600',
    pulseClass: '',
    iconHtml: `<i class="fa-solid fa-circle-check"></i>`
  };
}

// ============================================================================
// RIGHT DRAWER: UNPINNED & PINNED ZONES MANAGEMENT
// ============================================================================
function updateDrawerZoneCards() {
  const listContainer = document.getElementById('drawer-zones-list');
  const searchVal = document.getElementById('input-drawer-search').value.toLowerCase().trim();
  const unpinnedCountEl = document.getElementById('unpinned-badge-count');
  const pinnedCountEl = document.getElementById('pinned-badge-count');
  const zonesPinnedRatioEl = document.getElementById('zones-pinned-count');

  const currentFloorZones = state.mapZones.filter(
    z => z.tower_name === state.activeTower && z.floor_level === state.activeFloor
  );

  const unpinned = currentFloorZones.filter(z => !z.is_pinned);
  const pinned = currentFloorZones.filter(z => z.is_pinned);

  unpinnedCountEl.textContent = unpinned.length;
  pinnedCountEl.textContent = pinned.length;
  zonesPinnedRatioEl.textContent = `${pinned.length} / ${currentFloorZones.length} Pinned`;

  const activeSet = state.drawerTab === 'unpinned' ? unpinned : pinned;
  const filtered = activeSet.filter(z => 
    z.zone_id.toLowerCase().includes(searchVal) || 
    z.room_identifier.toLowerCase().includes(searchVal) ||
    (z.category && z.category.toLowerCase().includes(searchVal))
  );

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="p-6 text-center text-xs text-slate-400">
        No ${state.drawerTab} zones found.
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(zone => {
    const isSelected = state.selectedUnpinnedZone?.zone_id === zone.zone_id;
    const borderClass = isSelected ? 'border-brand-amber bg-amber-50/60 ring-2 ring-brand-amber/40' : 'border-slate-200 bg-white hover:border-brand-navy';

    html += `
      <div class="zone-card p-3 rounded-xl border transition-all cursor-pointer ${borderClass}" data-zone-id="${zone.zone_id}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-brand-navy">${zone.room_identifier}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">${zone.zone_id}</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5">${zone.category || 'General'} • ${zone.room_size || 'N/A'}</p>
          </div>
          <div class="text-right">
            ${zone.is_pinned 
              ? `<span class="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Pinned</span>`
              : `<span class="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Unpinned</span>`
            }
          </div>
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;

  // Add click listeners to cards
  listContainer.querySelectorAll('.zone-card').forEach(card => {
    card.addEventListener('click', () => {
      const zId = card.getAttribute('data-zone-id');
      const clickedZone = currentFloorZones.find(z => z.zone_id === zId);

      if (state.drawerTab === 'unpinned') {
        if (!state.isPinMode) {
          togglePinMode(true);
        }
        state.selectedUnpinnedZone = clickedZone;
        updateDrawerZoneCards();
        showToast(`Ready to pin: ${clickedZone.room_identifier}. Click on floor plan to place.`, 'info');
      } else {
        openZoneDetailModal(clickedZone);
      }
    });
  });
}

// ============================================================================
// PIN CREATION & COORDINATE ENGINE (CLICK-TO-PIN)
// ============================================================================
function handleMapStageClick(e) {
  if (!state.isPinMode || !state.selectedUnpinnedZone) return;

  const planImg = document.getElementById('img-floor-plan');
  if (!planImg || !planImg.src) return;

  const rect = planImg.getBoundingClientRect();
  const clickX = e.clientX;
  const clickY = e.clientY;

  // Check if click occurred inside image bounds
  if (clickX < rect.left || clickX > rect.right || clickY < rect.top || clickY > rect.bottom) {
    return;
  }

  // Calculate relative percentages
  const leftPercent = parseFloat((((clickX - rect.left) / rect.width) * 100).toFixed(2));
  const topPercent = parseFloat((((clickY - rect.top) / rect.height) * 100).toFixed(2));

  // Save coordinates to Supabase
  saveZonePinCoordinates(state.selectedUnpinnedZone.zone_id, topPercent, leftPercent);
}

async function saveZonePinCoordinates(zoneId, topCoord, leftCoord) {
  showToast(`Saving pin coordinates for ${zoneId}...`, 'info');

  try {
    const { error } = await supabase
      .from('project_map_zones')
      .update({
        top_coordinate: topCoord,
        left_coordinate: leftCoord,
        is_pinned: true,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', state.activeProjectId)
      .eq('zone_id', zoneId);

    if (error) throw error;

    // Update in memory state
    const target = state.mapZones.find(z => z.zone_id === zoneId);
    if (target) {
      target.top_coordinate = topCoord;
      target.left_coordinate = leftCoord;
      target.is_pinned = true;
    }

    state.selectedUnpinnedZone = null;
    showToast(`Pin saved successfully!`, 'success');

    // Re-render pins and drawer cards
    renderPinsOnOverlay();
    updateDrawerZoneCards();
  } catch (err) {
    console.error('Error saving pin coordinate:', err);
    showToast('Failed to save pin coordinates.', 'error');
  }
}

async function removePinFromZone(zoneId) {
  if (!confirm(`Are you sure you want to remove the pin for ${zoneId}?`)) return;

  try {
    const { error } = await supabase
      .from('project_map_zones')
      .update({
        top_coordinate: null,
        left_coordinate: null,
        is_pinned: false,
        updated_at: new Date().toISOString()
      })
      .eq('project_id', state.activeProjectId)
      .eq('zone_id', zoneId);

    if (error) throw error;

    const target = state.mapZones.find(z => z.zone_id === zoneId);
    if (target) {
      target.top_coordinate = null;
      target.left_coordinate = null;
      target.is_pinned = false;
    }

    closeZoneDetailModal();
    showToast(`Pin removed. Zone moved to unpinned list.`, 'success');
    renderPinsOnOverlay();
    updateDrawerZoneCards();
  } catch (err) {
    console.error('Error removing pin:', err);
    showToast('Could not remove pin.', 'error');
  }
}

function startRepositioningPin(zone) {
  state.selectedUnpinnedZone = zone;
  showToast(`Repositioning ${zone.room_identifier}. Click new map position.`, 'info');
}

// ============================================================================
// PAN & ZOOM CANVAS LOGIC (3D SPATIAL VIEWPORT)
// ============================================================================
function setupCanvasPanZoom() {
  const viewport = document.getElementById('map-viewport');
  const stage = document.getElementById('map-stage');

  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.site-pin')) return;
    if (state.isPinMode && state.selectedUnpinnedZone) return; // Allow click to pin

    state.isPanning = true;
    state.startX = e.clientX - state.panX;
    state.startY = e.clientY - state.panY;
    viewport.classList.add('is-panning');
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isPanning) return;
    state.panX = e.clientX - state.startX;
    state.panY = e.clientY - state.startY;
    applyCanvasTransform();
  });

  window.addEventListener('mouseup', () => {
    state.isPanning = false;
    viewport.classList.remove('is-panning');
  });

  // Touch Support for Mobile
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      state.isPanning = true;
      state.startX = e.touches[0].clientX - state.panX;
      state.startY = e.touches[0].clientY - state.panY;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (state.isPanning && e.touches.length === 1) {
      state.panX = e.touches[0].clientX - state.startX;
      state.panY = e.touches[0].clientY - state.startY;
      applyCanvasTransform();
    }
  }, { passive: true });

  viewport.addEventListener('touchend', () => {
    state.isPanning = false;
  });

  // Mouse Wheel Zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    zoomCanvas(zoomFactor);
  }, { passive: false });

  // Map Click Listener for Pin Mode
  stage.addEventListener('click', handleMapStageClick);

  // Floating Zoom Buttons
  document.getElementById('btn-zoom-in').addEventListener('click', () => zoomCanvas(1.2));
  document.getElementById('btn-zoom-out').addEventListener('click', () => zoomCanvas(0.8));
  document.getElementById('btn-zoom-reset').addEventListener('click', resetCanvasTransform);
  document.getElementById('btn-zoom-fit').addEventListener('click', fitCanvasToScreen);
}

function zoomCanvas(factor) {
  const newScale = Math.min(Math.max(state.scale * factor, 0.4), 3.8);
  state.scale = newScale;
  applyCanvasTransform();
}

function applyCanvasTransform() {
  const stage = document.getElementById('map-stage');
  stage.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
}

function resetCanvasTransform() {
  state.scale = 1;
  state.panX = 0;
  state.panY = 0;
  applyCanvasTransform();
}

function fitCanvasToScreen() {
  const viewport = document.getElementById('map-viewport');
  const img = document.getElementById('img-floor-plan');
  if (!img.naturalWidth) return;

  const vW = viewport.clientWidth;
  const vH = viewport.clientHeight;
  const iW = img.naturalWidth;
  const iH = img.naturalHeight;

  const scale = Math.min((vW * 0.95) / iW, (vH * 0.95) / iH);
  state.scale = scale;
  state.panX = 0;
  state.panY = 0;
  applyCanvasTransform();
}

// ============================================================================
// 2D CAD BLUEPRINT PAN-ZOOM ENGINE
// ============================================================================
function setupCadPanZoom() {
  const viewport = document.getElementById('cad-viewport');
  const stage = document.getElementById('cad-stage');

  viewport.addEventListener('mousedown', (e) => {
    state.cadIsPanning = true;
    state.cadStartX = e.clientX - state.cadPanX;
    state.cadStartY = e.clientY - state.cadPanY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.cadIsPanning) return;
    state.cadPanX = e.clientX - state.cadStartX;
    state.cadPanY = e.clientY - state.cadStartY;
    stage.style.transform = `translate(${state.cadPanX}px, ${state.cadPanY}px) scale(${state.cadScale})`;
  });

  window.addEventListener('mouseup', () => {
    state.cadIsPanning = false;
  });

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    state.cadScale = Math.min(Math.max(state.cadScale * factor, 0.3), 4.5);
    stage.style.transform = `translate(${state.cadPanX}px, ${state.cadPanY}px) scale(${state.cadScale})`;
  }, { passive: false });
}

function renderCadDrawing(cadUrl) {
  const imgCad = document.getElementById('img-cad-plan');
  const cadEmpty = document.getElementById('cad-empty-state');
  const downloadBtn = document.getElementById('btn-download-cad');

  if (cadUrl) {
    cadEmpty.classList.add('hidden');
    imgCad.src = cadUrl;
    imgCad.onload = () => imgCad.classList.remove('opacity-0');
    downloadBtn.href = cadUrl;
    downloadBtn.classList.remove('pointer-events-none', 'opacity-50');
  } else {
    imgCad.src = '';
    imgCad.classList.add('opacity-0');
    cadEmpty.classList.remove('hidden');
    downloadBtn.href = '#';
    downloadBtn.classList.add('pointer-events-none', 'opacity-50');
  }
}

// ============================================================================
// MODAL: ZONE DETAIL INSPECTION & ACTIONS
// ============================================================================
function openZoneDetailModal(zone) {
  const modal = document.getElementById('modal-zone-detail');
  document.getElementById('modal-room-title').textContent = zone.room_identifier;
  document.getElementById('modal-zone-id-badge').textContent = zone.zone_id;
  document.getElementById('modal-category-subtitle').textContent = `${(zone.category || 'General').toUpperCase()} • ${zone.floor_level}`;
  document.getElementById('modal-spec-size').textContent = zone.room_size || 'N/A';
  document.getElementById('modal-spec-labor').textContent = `${zone.allocated_labor || 0} Workers`;

  // Render QR Code Container
  renderSingleZoneQR(zone.zone_id);

  // Render Active Assigned Tasks
  renderZoneTasks(zone.zone_id);

  // Wire Modal Buttons
  document.getElementById('btn-modal-action-tasks').onclick = () => {
    window.location.href = `../tasks/active-tasks.html?zone_id=${encodeURIComponent(zone.zone_id)}`;
  };

  document.getElementById('btn-modal-action-issue').onclick = () => {
    window.location.href = `../tasks/raise-issue.html?zone_id=${encodeURIComponent(zone.zone_id)}`;
  };

  document.getElementById('btn-modal-remove-pin').onclick = () => {
    removePinFromZone(zone.zone_id);
  };

  modal.classList.remove('hidden');
}

function closeZoneDetailModal() {
  document.getElementById('modal-zone-detail').classList.add('hidden');
  document.getElementById('modal-qr-container').classList.add('hidden');
}

function renderSingleZoneQR(zoneId) {
  const qrTarget = document.getElementById('modal-qrcode-target');
  const zoneStr = document.getElementById('modal-qr-zone-string');
  qrTarget.innerHTML = '';
  zoneStr.textContent = zoneId;

  const payload = `${window.location.origin}/tasks/active-tasks.html?zone_id=${encodeURIComponent(zoneId)}`;
  
  new QRCode(qrTarget, {
    text: payload,
    width: 140,
    height: 140,
    colorDark: '#1E3A5F',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });

  document.getElementById('btn-download-single-qr').onclick = () => {
    const canvas = qrTarget.querySelector('canvas');
    if (canvas) {
      const a = document.createElement('a');
      a.download = `QR_${zoneId}.png`;
      a.href = canvas.toDataURL();
      a.click();
    }
  };
}

function renderZoneTasks(zoneId) {
  const listEl = document.getElementById('modal-tasks-list');
  const badgeEl = document.getElementById('modal-tasks-badge');

  const zoneTasks = state.tasks.filter(t => t.Zone_ID === zoneId);
  badgeEl.textContent = `${zoneTasks.length} Tasks`;

  if (zoneTasks.length === 0) {
    listEl.innerHTML = `
      <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-400 text-center">
        No tasks currently logged for this zone.
      </div>
    `;
    return;
  }

  let html = '';
  zoneTasks.forEach(task => {
    const statusColor = task.Status === 'Completed' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200';
    html += `
      <div class="p-2.5 rounded-xl border ${statusColor} text-xs flex items-center justify-between">
        <div>
          <span class="font-bold block">${task.Task_Description || 'Civil Task'}</span>
          <span class="text-[10px] text-slate-500">${task.Assigned_Agency || 'Contractor'} • ${task.Task_ID}</span>
        </div>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white shadow-xs border">${task.Status}</span>
      </div>
    `;
  });
  listEl.innerHTML = html;
}

// ============================================================================
// TAB 3: ZONE DIRECTORY & ACCORDION GRID
// ============================================================================
function updateZoneGridDirectory() {
  const container = document.getElementById('zone-grid-container');
  const search = document.getElementById('input-grid-search').value.toLowerCase().trim();
  const floorFilter = document.getElementById('select-grid-floor-filter').value;

  const filtered = state.mapZones.filter(z => {
    const matchesFloor = floorFilter === 'ALL' || z.floor_level === floorFilter;
    const matchesSearch = z.zone_id.toLowerCase().includes(search) || 
                          z.room_identifier.toLowerCase().includes(search) ||
                          (z.category && z.category.toLowerCase().includes(search));
    return matchesFloor && matchesSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-10 text-center glass-panel rounded-2xl shadow-glass text-slate-400 text-xs">
        No zone records matching search criteria.
      </div>
    `;
    return;
  }

  // Group zones by Floor Level
  const groupedByFloor = {};
  filtered.forEach(z => {
    if (!groupedByFloor[z.floor_level]) groupedByFloor[z.floor_level] = [];
    groupedByFloor[z.floor_level].push(z);
  });

  let html = '';
  Object.entries(groupedByFloor).forEach(([floor, zones]) => {
    html += `
      <div class="glass-panel rounded-2xl shadow-glass p-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
          <h3 class="text-sm font-bold text-brand-navy flex items-center gap-2">
            <i class="fa-solid fa-layer-group text-brand-amber"></i> ${floor}
          </h3>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            ${zones.length} Zones
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          ${zones.map(z => `
            <div class="p-3 rounded-xl bg-white/90 border border-slate-200 shadow-xs hover:border-brand-navy transition-all">
              <div class="flex items-start justify-between">
                <div>
                  <h4 class="text-xs font-bold text-brand-navy">${z.room_identifier}</h4>
                  <p class="text-[10px] font-mono text-slate-500">${z.zone_id}</p>
                </div>
                <button class="btn-grid-inspect text-xs text-brand-navy hover:text-brand-amber" data-zone-id="${z.zone_id}">
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
              <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                <span>${z.category || 'Unit'}</span>
                <span class="font-semibold text-slate-700">${z.room_size || 'N/A'}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.btn-grid-inspect').forEach(btn => {
    btn.addEventListener('click', () => {
      const zId = btn.getAttribute('data-zone-id');
      const target = state.mapZones.find(z => z.zone_id === zId);
      if (target) openZoneDetailModal(target);
    });
  });
}

// ============================================================================
// TAB 4: FLOOR PLAN MANAGER & CLOUDFLARE R2 UPLOADS
// ============================================================================
function renderConfiguredPlansTable() {
  const tbody = document.getElementById('configured-plans-tbody');
  
  if (state.floorPlans.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-4 text-center text-xs text-slate-400">
          No floor plans registered yet for this project.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  state.floorPlans.forEach(plan => {
    html += `
      <tr class="hover:bg-slate-50">
        <td class="p-3 font-medium">${plan.tower_name}</td>
        <td class="p-3 font-semibold text-brand-navy">${plan.floor_level}</td>
        <td class="p-3">
          ${plan.map_3d_url 
            ? `<a href="${plan.map_3d_url}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1"><i class="fa-solid fa-cube"></i> View 3D</a>` 
            : '<span class="text-slate-400">None</span>'}
        </td>
        <td class="p-3">
          ${plan.original_2d_url 
            ? `<a href="${plan.original_2d_url}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1"><i class="fa-regular fa-compass"></i> View 2D</a>` 
            : '<span class="text-slate-400">None</span>'}
        </td>
        <td class="p-3 text-right">
          <button class="btn-delete-plan text-rose-600 hover:text-rose-800 text-xs px-2 py-1" data-plan-id="${plan.id}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('.btn-delete-plan').forEach(btn => {
    btn.addEventListener('click', async () => {
      const planId = btn.getAttribute('data-plan-id');
      if (confirm('Delete this floor plan configuration?')) {
        await supabase.from('project_floor_plans').delete().eq('id', planId);
        showToast('Floor plan deleted.', 'info');
        await loadProjectData(state.activeProjectId);
      }
    });
  });
}

async function handleFloorPlanSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-floor-plan');
  const statusEl = document.getElementById('upload-progress-status');

  const projectId = document.getElementById('upload-plan-project').value;
  const tower = document.getElementById('upload-plan-tower').value.trim();
  const floor = document.getElementById('upload-plan-floor').value.trim();

  const file3d = document.getElementById('file-upload-3d').files[0];
  const url3dInput = document.getElementById('url-input-3d').value.trim();

  const file2d = document.getElementById('file-upload-2d').files[0];
  const url2dInput = document.getElementById('url-input-2d').value.trim();

  btn.disabled = true;
  statusEl.textContent = 'Uploading media to Cloudflare R2...';

  try {
    let final3dUrl = url3dInput || null;
    let final2dUrl = url2dInput || null;

    if (file3d) {
      statusEl.textContent = 'Uploading 3D Spatial Asset...';
      final3dUrl = await uploadToR2(file3d, 'floor-plans-3d');
    }

    if (file2d) {
      statusEl.textContent = 'Uploading 2D Architectural CAD Blueprint...';
      final2dUrl = await uploadToR2(file2d, 'floor-plans-cad');
    }

    statusEl.textContent = 'Saving floor plan record to Supabase...';

    const { error } = await supabase
      .from('project_floor_plans')
      .upsert({
        project_id: projectId,
        tower_name: tower,
        floor_level: floor,
        map_3d_url: final3dUrl,
        original_2d_url: final2dUrl,
        updated_at: new Date().toISOString()
      }, { onConflict: 'project_id, tower_name, floor_level' });

    if (error) throw error;

    showToast('Floor Plan successfully uploaded and saved!', 'success');
    e.target.reset();
    await loadProjectData(projectId);
  } catch (err) {
    console.error('Error uploading floor plan:', err);
    showToast(`Upload failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    statusEl.textContent = '';
  }
}

// ============================================================================
// TAB 5: ADD / EDIT ZONE METADATA & CSV IMPORT
// ============================================================================
async function handleZoneMetadataSubmit(e) {
  e.preventDefault();

  const payload = {
    project_id: state.activeProjectId,
    zone_id: document.getElementById('zone-input-id').value.trim().toUpperCase(),
    room_identifier: document.getElementById('zone-input-room').value.trim(),
    floor_level: document.getElementById('zone-input-floor').value.trim(),
    tower_name: document.getElementById('zone-input-tower').value.trim(),
    category: document.getElementById('zone-input-category').value.trim(),
    area_type: document.getElementById('zone-input-area-type').value.trim(),
    department: document.getElementById('zone-input-department').value.trim(),
    room_size: document.getElementById('zone-input-size').value.trim(),
    slope: document.getElementById('zone-input-slope').value.trim(),
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase
      .from('project_map_zones')
      .upsert(payload, { onConflict: 'project_id, zone_id' });

    if (error) throw error;

    showToast(`Zone "${payload.zone_id}" saved successfully!`, 'success');
    document.getElementById('form-zone-metadata').reset();
    await loadProjectData(state.activeProjectId);
  } catch (err) {
    console.error('Error saving zone:', err);
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function handleCsvImport(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
      showToast('Uploaded CSV appears to be empty.', 'error');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;

      const obj = {
        project_id: state.activeProjectId,
        zone_id: cols[0],
        floor_level: cols[2] || state.activeFloor,
        area_type: cols[3] || 'General',
        department: cols[4] || 'Common',
        category: cols[5] || 'Unit',
        room_identifier: cols[6] || cols[0],
        room_size: cols[7] || 'N/A',
        slope: cols[8] || 'N/A',
        top_coordinate: cols[9] ? parseFloat(cols[9]) : null,
        left_coordinate: cols[10] ? parseFloat(cols[10]) : null,
        is_pinned: Boolean(cols[9] && cols[10])
      };
      records.push(obj);
    }

    if (records.length > 0) {
      showToast(`Importing ${records.length} zones...`, 'info');
      const { error } = await supabase
        .from('project_map_zones')
        .upsert(records, { onConflict: 'project_id, zone_id' });

      if (error) {
        showToast(`Import error: ${error.message}`, 'error');
      } else {
        showToast(`Successfully imported ${records.length} zones!`, 'success');
        await loadProjectData(state.activeProjectId);
      }
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// MASTER QR CODE EXPORT & BULK PRINT SHEET
// ============================================================================
function setupQRCodeModal() {
  const modal = document.getElementById('modal-master-qr');
  const btnOpen = document.getElementById('btn-open-qr-export');
  const btnClose = document.getElementById('btn-close-qr-modal');
  const floorFilter = document.getElementById('select-qr-modal-floor');
  const chkSelectAll = document.getElementById('chk-select-all-qr');
  const btnPrint = document.getElementById('btn-print-qr-sheet');

  btnOpen.addEventListener('click', () => {
    modal.classList.remove('hidden');
    renderMasterQRGrid();
  });

  btnClose.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  floorFilter.addEventListener('change', renderMasterQRGrid);

  chkSelectAll.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.chk-qr-item');
    checkboxes.forEach(c => c.checked = e.target.checked);
  });

  btnPrint.addEventListener('click', () => {
    window.print();
  });
}

function renderMasterQRGrid() {
  const grid = document.getElementById('master-qr-grid');
  const floorVal = document.getElementById('select-qr-modal-floor').value;

  const zones = state.mapZones.filter(z => 
    floorVal === 'ALL' || z.floor_level === floorVal
  );

  if (zones.length === 0) {
    grid.innerHTML = '<div class="col-span-4 p-8 text-center text-xs text-slate-400">No zones found for QR generation.</div>';
    return;
  }

  grid.innerHTML = '';

  zones.forEach((zone, index) => {
    const card = document.createElement('div');
    card.className = 'qr-print-card p-3 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-between text-center space-y-2';

    const targetId = `qr-master-box-${index}`;
    card.innerHTML = `
      <div class="flex items-center justify-between w-full">
        <input type="checkbox" class="chk-qr-item rounded text-brand-navy focus:ring-0" checked data-zone-id="${zone.zone_id}" />
        <span class="text-[9px] font-mono font-bold text-slate-400">${zone.zone_id}</span>
      </div>
      <div id="${targetId}" class="p-1 bg-white"></div>
      <div>
        <h5 class="text-xs font-bold text-brand-navy">${zone.room_identifier}</h5>
        <p class="text-[10px] text-slate-500">${zone.floor_level} • ${zone.category || 'Unit'}</p>
      </div>
    `;

    grid.appendChild(card);

    // Generate QR in card
    const payload = `${window.location.origin}/tasks/active-tasks.html?zone_id=${encodeURIComponent(zone.zone_id)}`;
    new QRCode(document.getElementById(targetId), {
      text: payload,
      width: 100,
      height: 100,
      colorDark: '#1E3A5F',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  });
}

// ============================================================================
// UI EVENT LISTENERS & TAB CONTROLS
// ============================================================================
function setupNavigationSubtabs() {
  const tabButtons = document.querySelectorAll('.nav-subtab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabTarget = btn.getAttribute('data-tab');

      // Update button styling
      tabButtons.forEach(b => {
        b.className = 'nav-subtab-btn flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap text-slate-600 hover:text-brand-navy hover:bg-white/60 transition-all duration-200';
      });
      btn.className = 'nav-subtab-btn flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all duration-200 bg-brand-navy text-white shadow-sm';

      // Hide all tabs
      document.getElementById('tab-interactive-map').classList.add('hidden');
      document.getElementById('tab-original-drawings').classList.add('hidden');
      document.getElementById('tab-zone-grid').classList.add('hidden');
      document.getElementById('tab-floor-plan-manager').classList.add('hidden');
      document.getElementById('tab-add-edit-zone').classList.add('hidden');

      // Show target tab
      document.getElementById(`tab-${tabTarget}`).classList.remove('hidden');

      // Hook tab specifics
      if (tabTarget === 'zone-grid') updateZoneGridDirectory();
      if (tabTarget === 'floor-plan-manager') renderConfiguredPlansTable();
    });
  });
}

function setupEventListeners() {
  // Project Selector
  document.getElementById('select-map-project').addEventListener('change', (e) => {
    if (e.target.value) loadProjectData(e.target.value);
  });

  // Tower Selector
  document.getElementById('select-map-tower').addEventListener('change', (e) => {
    state.activeTower = e.target.value;
    populateTowerAndFloorSelectors();
    renderActiveFloorPlan();
  });

  // Floor Selector
  document.getElementById('select-map-floor').addEventListener('change', (e) => {
    state.activeFloor = e.target.value;
    document.getElementById('select-cad-floor').value = e.target.value;
    renderActiveFloorPlan();
  });

  // 2D CAD Floor Selector
  document.getElementById('select-cad-floor').addEventListener('change', (e) => {
    state.activeFloor = e.target.value;
    document.getElementById('select-map-floor').value = e.target.value;
    renderActiveFloorPlan();
  });

  // Heatmap Selector
  document.getElementById('select-heatmap-mode').addEventListener('change', (e) => {
    state.heatmapMode = e.target.value;
    renderPinsOnOverlay();
  });

  // Category Filter
  document.getElementById('select-category-filter').addEventListener('change', (e) => {
    state.categoryFilter = e.target.value;
    renderPinsOnOverlay();
  });

  // Pin Mode Toggle
  document.getElementById('btn-toggle-pin-mode').addEventListener('click', () => {
    togglePinMode(!state.isPinMode);
  });

  // Sync Database Button
  document.getElementById('btn-sync-database').addEventListener('click', async () => {
    const icon = document.getElementById('sync-icon');
    icon.classList.add('fa-spin');
    await autoSynthesizeZonesFromArchitecture(true);
    await loadProjectData(state.activeProjectId);
    icon.classList.remove('fa-spin');
  });

  // Drawer Tabs: Unpinned vs Pinned
  document.getElementById('btn-tab-unpinned').addEventListener('click', () => {
    state.drawerTab = 'unpinned';
    document.getElementById('btn-tab-unpinned').className = 'flex-1 py-1.5 rounded-lg text-center bg-white text-brand-navy font-semibold shadow-xs';
    document.getElementById('btn-tab-pinned').className = 'flex-1 py-1.5 rounded-lg text-center text-slate-600 hover:text-brand-navy';
    updateDrawerZoneCards();
  });

  document.getElementById('btn-tab-pinned').addEventListener('click', () => {
    state.drawerTab = 'pinned';
    document.getElementById('btn-tab-pinned').className = 'flex-1 py-1.5 rounded-lg text-center bg-white text-brand-navy font-semibold shadow-xs';
    document.getElementById('btn-tab-unpinned').className = 'flex-1 py-1.5 rounded-lg text-center text-slate-600 hover:text-brand-navy';
    updateDrawerZoneCards();
  });

  // Drawer Search Input
  document.getElementById('input-drawer-search').addEventListener('input', updateDrawerZoneCards);

  // Grid Search & Filter Inputs
  document.getElementById('input-grid-search').addEventListener('input', updateZoneGridDirectory);
  document.getElementById('select-grid-floor-filter').addEventListener('change', updateZoneGridDirectory);

  // Floor Plan Upload Form
  document.getElementById('form-floor-plan-upload').addEventListener('submit', handleFloorPlanSubmit);

  // Zone Metadata Form
  document.getElementById('form-zone-metadata').addEventListener('submit', handleZoneMetadataSubmit);
  document.getElementById('btn-reset-zone-form').addEventListener('click', () => {
    document.getElementById('form-zone-metadata').reset();
  });

  // CSV Import Button
  const csvInput = document.getElementById('file-import-csv');
  document.getElementById('btn-trigger-csv-import').addEventListener('click', () => csvInput.click());
  csvInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleCsvImport(e.target.files[0]);
  });

  // Detail Modal Controls
  document.getElementById('btn-close-zone-modal').addEventListener('click', closeZoneDetailModal);
  document.getElementById('btn-modal-toggle-qr').addEventListener('click', () => {
    const container = document.getElementById('modal-qr-container');
    const text = document.getElementById('btn-modal-qr-text');
    const isHidden = container.classList.contains('hidden');
    container.classList.toggle('hidden');
    text.textContent = isHidden ? 'Hide QR Code' : 'View QR Code';
  });

  // Empty state button redirect to upload tab
  document.querySelectorAll('.btn-goto-upload').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelector('[data-tab="floor-plan-manager"]').click();
    });
  });
}

function togglePinMode(enable) {
  state.isPinMode = enable;
  const btn = document.getElementById('btn-toggle-pin-mode');
  const indicator = document.getElementById('pin-mode-indicator');
  const text = document.getElementById('pin-mode-text');
  const banner = document.getElementById('pin-mode-banner');
  const viewport = document.getElementById('map-viewport');

  if (enable) {
    btn.className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all duration-200 bg-brand-navy text-brand-amber border-brand-navy shadow-sm';
    indicator.className = 'w-2.5 h-2.5 rounded-full bg-brand-amber animate-pulse';
    text.textContent = 'Exit Pin Mode';
    banner.classList.remove('hidden');
    viewport.classList.add('pin-mode-active');
  } else {
    btn.className = 'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all duration-200 bg-white/90 text-slate-700 border-slate-300 hover:border-brand-navy shadow-sm';
    indicator.className = 'w-2.5 h-2.5 rounded-full bg-slate-400';
    text.textContent = 'Enable Pin Mode';
    banner.classList.add('hidden');
    viewport.classList.remove('pin-mode-active');
    state.selectedUnpinnedZone = null;
    updateDrawerZoneCards();
  }
}

// ============================================================================
// HELPERS: TOAST NOTIFICATIONS, SPINNERS & BADGES
// ============================================================================
function updateBadge(text) {
  const badge = document.getElementById('badge-active-project');
  if (badge) badge.textContent = text;
}

function showLoadingSpinner(show) {
  const spinner = document.getElementById('map-loading-state');
  if (!spinner) return;
  if (show) spinner.classList.remove('hidden');
  else spinner.classList.add('hidden');
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const bgClass = type === 'success' 
    ? 'bg-slate-900/95 border-emerald-500 text-white' 
    : type === 'error'
    ? 'bg-slate-900/95 border-rose-500 text-white'
    : 'bg-slate-900/95 border-amber-500 text-white';

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