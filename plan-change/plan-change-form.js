/**
 * Prayosha ERP - Plan Change Management System
 * File: /plan-change/plan-change-form.js
 * 
 * Capabilities:
 * 1. 4-Tier Cascading Hierarchy: Project -> Tower -> Floor Level -> Zone ID dynamically from database records.
 * 2. Spatial Synthesizer Fallback: Unpacks unit configurations from project_zones if project_map_zones is unpopulated.
 * 3. Dynamic Trade Category Manager: On-the-fly creation and injection of custom trade packages by site engineers/owners.
 * 4. Multi-format Drag & Drop Media Upload to Cloudflare R2 Vault (aws4fetch).
 * 5. Trade-Categorized Checkpoint Manager (JSONB payload generation).
 * 6. Automatic Revision Calculation & Prior Record Archiving for Custom Units.
 * 7. Resilient UUID Validation & Error Prevention (Immune to 42703 and 22P02 database errors).
 */

import { supabase, uploadToR2 } from '../config.js';

// Central Supabase Client reference with fallback
const db = supabase || window.supabaseClient;

// ==============================================================================
// 1. STATE MANAGEMENT & DOM SELECTION
// ==============================================================================
const state = {
    selectedFile: null,
    bullets: [],
    availableProjects: [],
    activeProjectId: null,
    currentProjectZones: [],
    isSubmitting: false
};

// Form and Spatial Hierarchy Elements
const form = document.getElementById('plan-change-form');
const projectSelect = document.getElementById('project-select');
const activeProjectBadge = document.getElementById('active-project-badge');
const towerSelect = document.getElementById('tower-block');
const floorSelect = document.getElementById('floor-level');
const zoneSelect = document.getElementById('zone-id');

// Customer & Financial Fields
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const costImpactSelect = document.getElementById('cost-impact');
const structuralImpactToggle = document.getElementById('structural-impact-toggle');

// File Upload Elements
const dropzoneArea = document.getElementById('dropzone-area');
const fileInput = document.getElementById('file-input');
const filePreviewCard = document.getElementById('file-preview-card');
const fileIcon = document.getElementById('file-icon');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const uploadStatusBadge = document.getElementById('upload-status-badge');
const removeFileBtn = document.getElementById('remove-file-btn');
const uploadedR2Url = document.getElementById('uploaded-r2-url');

// Dynamic Category Adder Elements
const toggleCustomCategoryBtn = document.getElementById('toggle-custom-category-btn');
const customCategoryBox = document.getElementById('custom-category-box');
const newCategoryInput = document.getElementById('new-category-input');
const saveNewCategoryBtn = document.getElementById('save-new-category-btn');
const cancelNewCategoryBtn = document.getElementById('cancel-new-category-btn');

// Bullet Items Elements
const bulletCategory = document.getElementById('bullet-category');
const bulletText = document.getElementById('bullet-text');
const addBulletBtn = document.getElementById('add-bullet-btn');
const bulletsList = document.getElementById('bullets-list');
const bulletsEmptyState = document.getElementById('bullets-empty-state');
const bulletCountBadge = document.getElementById('bullet-count-badge');

// Submission Controls
const saveBtn = document.getElementById('save-plan-change-btn');
const saveBtnText = document.getElementById('save-btn-text');
const saveSpinner = document.getElementById('save-spinner');
const resetFormBtn = document.getElementById('reset-form-btn');

// ==============================================================================
// 2. UTILITY & VALIDATION HELPERS
// ==============================================================================
function isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid.trim());
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

function getCategoryBadgeConfig(category) {
    switch (category) {
        case 'Flooring & Tiles':
            return { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300' };
        case 'Plumbing & Sanitary':
            return { bg: 'bg-blue-100', text: 'text-blue-900', border: 'border-blue-300' };
        case 'Electrical & Wiring':
            return { bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-300' };
        case 'Civil & Masonry':
            return { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300' };
        case 'Doors & Windows':
            return { bg: 'bg-orange-100', text: 'text-orange-900', border: 'border-orange-300' };
        case 'Kitchen & Platform':
            return { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300' };
        case 'False Ceiling & POP':
            return { bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-300' };
        default:
            return { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' };
    }
}

// Toast Notification Engine
function showSiteToast(message, type = 'info') {
    const existing = document.getElementById('prayosha-site-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'prayosha-site-toast';

    let bgStyle = 'bg-slate-900/90 border-slate-700 text-white';
    let icon = 'ℹ️';

    if (type === 'success') {
        bgStyle = 'bg-emerald-950/90 border-emerald-500 text-emerald-100';
        icon = '✅';
    } else if (type === 'error') {
        bgStyle = 'bg-rose-950/90 border-rose-500 text-rose-100';
        icon = '⚠️';
    } else if (type === 'warning') {
        bgStyle = 'bg-amber-950/90 border-amber-500 text-amber-100';
        icon = '🔔';
    }

    toast.className = `fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md text-xs font-semibold max-w-md transition-all duration-300 transform translate-y-2 opacity-0 ${bgStyle}`;
    toast.innerHTML = `
        <span class="text-base">${icon}</span>
        <span class="leading-relaxed flex-grow">${message}</span>
        <button type="button" class="text-white/60 hover:text-white ml-2 text-sm font-bold">&times;</button>
    `;

    document.body.appendChild(toast);

    toast.querySelector('button').addEventListener('click', () => {
        toast.remove();
    });

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4500);
}

// ==============================================================================
// 3. PROJECT CONTEXT & 4-TIER CASCADING SPATIAL HIERARCHY
// ==============================================================================
async function loadProjectsContext() {
    if (!db) {
        showSiteToast('Database client connection offline. Please reload.', 'error');
        return;
    }

    try {
        const { data: projects, error } = await db
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true });

        if (error) throw error;

        state.availableProjects = projects || [];
        projectSelect.innerHTML = '<option value="">-- Select Project --</option>';

        state.availableProjects.forEach(proj => {
            const opt = document.createElement('option');
            opt.value = proj.id;
            opt.textContent = `${proj.project_code ? '[' + proj.project_code + '] ' : ''}${proj.project_name}`;
            projectSelect.appendChild(opt);
        });

        // Sync with shell.js stored active Project ID
        const storedProjectId = localStorage.getItem('activeProjectId');
        if (storedProjectId && isValidUUID(storedProjectId)) {
            const match = state.availableProjects.find(p => p.id === storedProjectId);
            if (match) {
                state.activeProjectId = match.id;
                projectSelect.value = match.id;
                activeProjectBadge.textContent = match.project_name;
                await loadTowersForProject(match.id);
            }
        }

    } catch (err) {
        console.error('[loadProjectsContext Exception]:', err);
        showSiteToast('Could not fetch active projects: ' + err.message, 'error');
    }
}

/**
 * 3.1 Fetch and Populate Towers from project_zones
 */
async function loadTowersForProject(projectId) {
    if (!isValidUUID(projectId)) {
        resetStructureDropdowns();
        return;
    }

    towerSelect.innerHTML = '<option value="">-- Loading Towers... --</option>';
    towerSelect.disabled = true;
    floorSelect.innerHTML = '<option value="">-- Select Tower First --</option>';
    floorSelect.disabled = true;
    resetZoneDropdown();

    if (!db) return;

    try {
        const { data: zones, error } = await db
            .from('project_zones')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        state.currentProjectZones = zones || [];

        if (state.currentProjectZones.length === 0) {
            towerSelect.innerHTML = '<option value="">-- No Towers Configured --</option>';
            towerSelect.disabled = false;
            return;
        }

        const rawTowers = state.currentProjectZones.map(z => z.tower_name?.trim()).filter(Boolean);
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
            populateFloorsForTower(uniqueTowers[0]);
        }

    } catch (err) {
        console.error('[loadTowersForProject Error]:', err);
        showSiteToast('Failed to load project towers: ' + err.message, 'error');
        resetStructureDropdowns();
    }
}

/**
 * 3.2 Populate Floors Dropdown based on Selected Tower
 */
function populateFloorsForTower(selectedTower) {
    if (!selectedTower) {
        floorSelect.innerHTML = '<option value="">-- Select Tower First --</option>';
        floorSelect.disabled = true;
        resetZoneDropdown();
        return;
    }

    const matchingZones = state.currentProjectZones.filter(z => (z.tower_name || '').trim() === selectedTower.trim());
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
 * 3.3 Fetch and Populate Zone IDs from project_map_zones with Auto-Synthesis Fallback
 */
async function populateZonesForFloor(projectId, selectedTower, selectedFloor) {
    if (!isValidUUID(projectId) || !selectedTower || !selectedFloor) {
        resetZoneDropdown();
        return;
    }

    zoneSelect.innerHTML = '<option value="">-- Loading Units / Zones... --</option>';
    zoneSelect.disabled = true;

    try {
        const { data: mapZones, error } = await db
            .from('project_map_zones')
            .select('*')
            .eq('project_id', projectId)
            .ilike('tower_name', selectedTower.trim())
            .ilike('floor_level', selectedFloor.trim())
            .order('zone_id', { ascending: true });

        if (error) throw error;

        if (mapZones && mapZones.length > 0) {
            zoneSelect.innerHTML = '<option value="">-- Select Zone ID / Unit --</option>';
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

        // Automatic fallback: synthesize from architecture specifications in project_zones
        const matchingArch = state.currentProjectZones.find(z => 
            (z.tower_name || '').trim().toLowerCase() === selectedTower.trim().toLowerCase() && 
            (z.floor_name || z.zone_name || '').trim().toLowerCase() === selectedFloor.trim().toLowerCase()
        );

        if (matchingArch) {
            const synthesized = synthesizeZonesForFloor(projectId, matchingArch);
            if (synthesized.length > 0) {
                try {
                    await db.from('project_map_zones').insert(synthesized);
                } catch (persistErr) {
                    console.warn('[Plan Change Form] Auto-persist synthesized zones note:', persistErr);
                }

                zoneSelect.innerHTML = '<option value="">-- Select Zone ID / Unit --</option>';
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

        zoneSelect.innerHTML = '<option value="">-- No Units Found for This Floor --</option>';
        zoneSelect.disabled = false;

    } catch (err) {
        console.error('[Plan Change Form] Error loading zones:', err);
        zoneSelect.innerHTML = '<option value="">-- Failed to Load Units --</option>';
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

    // Generic Level Fallback
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
}

function resetStructureDropdowns() {
    state.currentProjectZones = [];
    towerSelect.innerHTML = '<option value="">-- Select Tower --</option>';
    towerSelect.disabled = false;
    floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';
    floorSelect.disabled = true;
    resetZoneDropdown();
}

// ==============================================================================
// 4. CASCADING SELECTION EVENT LISTENERS
// ==============================================================================
projectSelect.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (isValidUUID(val)) {
        state.activeProjectId = val;
        const selectedOption = e.target.options[e.target.selectedIndex];
        activeProjectBadge.textContent = selectedOption.text.replace(/^\[.*?\]\s*/, '');
        await loadTowersForProject(val);
    } else {
        state.activeProjectId = null;
        activeProjectBadge.textContent = 'Project Required';
        resetStructureDropdowns();
    }
});

towerSelect.addEventListener('change', (e) => {
    populateFloorsForTower(e.target.value);
});

floorSelect.addEventListener('change', async (e) => {
    const selectedTower = towerSelect.value;
    const selectedFloor = e.target.value;
    if (state.activeProjectId && selectedTower && selectedFloor) {
        await populateZonesForFloor(state.activeProjectId, selectedTower, selectedFloor);
    } else {
        resetZoneDropdown();
    }
});

// Sync with shell.js Project Change Events
window.addEventListener('projectChanged', async (e) => {
    if (e.detail && isValidUUID(e.detail.projectId)) {
        state.activeProjectId = e.detail.projectId;
        projectSelect.value = e.detail.projectId;
        activeProjectBadge.textContent = e.detail.projectName || 'Selected Site';
        await loadTowersForProject(e.detail.projectId);
    }
});

// ==============================================================================
// 5. DYNAMIC TRADE CATEGORY EXTENSION
// ==============================================================================
toggleCustomCategoryBtn.addEventListener('click', () => {
    customCategoryBox.classList.toggle('hidden');
    if (!customCategoryBox.classList.contains('hidden')) {
        newCategoryInput.focus();
    }
});

cancelNewCategoryBtn.addEventListener('click', () => {
    customCategoryBox.classList.add('hidden');
    newCategoryInput.value = '';
});

saveNewCategoryBtn.addEventListener('click', handleSaveNewCategory);

newCategoryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveNewCategory();
    }
});

function handleSaveNewCategory() {
    const customCat = newCategoryInput.value.trim();
    if (!customCat) {
        showSiteToast('Please type a category name.', 'warning');
        newCategoryInput.focus();
        return;
    }

    // Check if category already exists in dropdown
    let existingOption = null;
    for (let i = 0; i < bulletCategory.options.length; i++) {
        if (bulletCategory.options[i].value.toLowerCase() === customCat.toLowerCase()) {
            existingOption = bulletCategory.options[i];
            break;
        }
    }

    if (existingOption) {
        bulletCategory.value = existingOption.value;
        showSiteToast(`"${existingOption.value}" already exists and is now selected.`, 'info');
    } else {
        const newOpt = document.createElement('option');
        newOpt.value = customCat;
        newOpt.textContent = `${customCat} (Custom Trade)`;
        bulletCategory.appendChild(newOpt);
        bulletCategory.value = customCat;
        showSiteToast(`Custom category "${customCat}" added successfully!`, 'success');
    }

    customCategoryBox.classList.add('hidden');
    newCategoryInput.value = '';
    bulletText.focus();
}

// ==============================================================================
// 6. CLOUDFLARE R2 FILE UPLOAD & DROPZONE HANDLING
// ==============================================================================
function setFileForUpload(file) {
    if (!file) return;

    const validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(ext)) {
        showSiteToast('Invalid file format. Upload PDF, JPG, PNG or WEBP only.', 'error');
        return;
    }

    if (file.size > 15 * 1024 * 1024) {
        showSiteToast('File size exceeds 15MB limit. Please compress drawing.', 'error');
        return;
    }

    state.selectedFile = file;

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileIcon.textContent = ext.toUpperCase();
    
    uploadStatusBadge.textContent = 'Ready for Cloud Storage';
    uploadStatusBadge.className = 'text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200';

    dropzoneArea.classList.add('hidden');
    filePreviewCard.classList.remove('hidden');
}

function clearSelectedFile() {
    state.selectedFile = null;
    fileInput.value = '';
    uploadedR2Url.value = '';
    
    filePreviewCard.classList.add('hidden');
    dropzoneArea.classList.remove('hidden');
}

dropzoneArea.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        setFileForUpload(e.target.files[0]);
    }
});

dropzoneArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzoneArea.classList.add('border-brand-navy', 'bg-blue-50/40');
});

dropzoneArea.addEventListener('dragleave', () => {
    dropzoneArea.classList.remove('border-brand-navy', 'bg-blue-50/40');
});

dropzoneArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzoneArea.classList.remove('border-brand-navy', 'bg-blue-50/40');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        setFileForUpload(e.dataTransfer.files[0]);
    }
});

removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
});

// ==============================================================================
// 7. BULLET POINTS CHECKPOINT MANAGER
// ==============================================================================
function renderBullets() {
    bulletsList.innerHTML = '';
    bulletCountBadge.textContent = `${state.bullets.length} Items`;

    if (state.bullets.length === 0) {
        bulletsList.appendChild(bulletsEmptyState);
        bulletsEmptyState.classList.remove('hidden');
        return;
    }

    bulletsEmptyState.classList.add('hidden');

    state.bullets.forEach((item, index) => {
        const style = getCategoryBadgeConfig(item.category);
        const row = document.createElement('div');
        row.className = 'flex items-start justify-between gap-3 p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 transition';

        row.innerHTML = `
            <div class="flex items-start gap-2.5 min-w-0">
                <span class="text-xs font-bold text-slate-400 mt-0.5">#${index + 1}</span>
                <div class="space-y-1 min-w-0">
                    <span class="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border ${style.bg} ${style.text} ${style.border}">
                        ${item.category}
                    </span>
                    <p class="text-xs font-semibold text-slate-800 leading-snug break-words">
                        ${item.text}
                    </p>
                </div>
            </div>
            <button type="button" data-index="${index}" class="remove-bullet-btn p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition flex-shrink-0" title="Delete Point">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        `;

        row.querySelector('.remove-bullet-btn').addEventListener('click', () => {
            state.bullets.splice(index, 1);
            renderBullets();
        });

        bulletsList.appendChild(row);
    });
}

function handleAddBullet() {
    const textVal = bulletText.value.trim();
    const catVal = bulletCategory.value;

    if (!textVal) {
        showSiteToast('Please type the custom requirement description.', 'warning');
        bulletText.focus();
        return;
    }

    state.bullets.push({
        id: 'bp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        category: catVal,
        text: textVal,
        created_at: new Date().toISOString()
    });

    bulletText.value = '';
    bulletText.focus();
    renderBullets();
}

addBulletBtn.addEventListener('click', handleAddBullet);

bulletText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleAddBullet();
    }
});

// ==============================================================================
// 8. RECORD PERSISTENCE & SUBMISSION HANDLER
// ==============================================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (state.isSubmitting) return;

    // Step 1: Pre-flight Validations
    const projectId = projectSelect.value;
    if (!isValidUUID(projectId)) {
        showSiteToast('Please select a valid Site Project from the dropdown.', 'error');
        projectSelect.focus();
        return;
    }

    const towerBlock = towerSelect.value.trim();
    if (!towerBlock) {
        showSiteToast('Please select the Tower or Block.', 'warning');
        towerSelect.focus();
        return;
    }

    const floorLevel = floorSelect.value.trim();
    if (!floorLevel) {
        showSiteToast('Please select the Floor Level.', 'warning');
        floorSelect.focus();
        return;
    }

    const zoneId = zoneSelect.value.trim();
    if (!zoneId) {
        showSiteToast('Please select the Zone ID / Unit.', 'warning');
        zoneSelect.focus();
        return;
    }

    const customerName = customerNameInput.value.trim();
    if (!customerName) {
        showSiteToast('Customer Name is required.', 'warning');
        customerNameInput.focus();
        return;
    }

    if (!state.selectedFile && !uploadedR2Url.value) {
        showSiteToast('Please upload the customer-signed drawing or proof document.', 'error');
        dropzoneArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    if (state.bullets.length === 0) {
        showSiteToast('Please specify at least one trade change requirement in bullet points.', 'warning');
        bulletText.focus();
        return;
    }

    const hasStructuralImpact = structuralImpactToggle.checked;
    if (hasStructuralImpact) {
        const confirmStructural = window.confirm(
            '⚠️ ATTENTION: Structural Impact Flagged!\n\nYou have marked that this customer request alters RCC Columns, Beams, or Load-Bearing Members.\n\nAre you sure you want to log this without Project Head written clearance?'
        );
        if (!confirmStructural) return;
    }

    // Step 2: Lock UI
    state.isSubmitting = true;
    saveBtn.disabled = true;
    saveSpinner.classList.remove('hidden');
    saveBtnText.textContent = 'Uploading to Cloudflare R2...';

    try {
        let publicDrawingUrl = uploadedR2Url.value;

        // Step 3: Stream File to Cloudflare R2 Vault
        if (state.selectedFile) {
            uploadStatusBadge.textContent = 'Uploading to R2...';
            uploadStatusBadge.className = 'text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 animate-pulse';

            const sanitizedZone = zoneId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const folderPath = `plan-changes/${projectId}/${sanitizedZone}`;
            
            publicDrawingUrl = await uploadToR2(state.selectedFile, folderPath);
            uploadedR2Url.value = publicDrawingUrl;

            uploadStatusBadge.textContent = 'Vault Secured';
            uploadStatusBadge.className = 'text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200';
        }

        saveBtnText.textContent = 'Checking Revision History...';

        // Step 4: Determine Revision Number for this Zone
        let revisionNumber = 1;
        const { data: existingRecords, error: revError } = await db
            .from('unit_plan_changes')
            .select('id, revision_number')
            .eq('project_id', projectId)
            .ilike('zone_id', zoneId)
            .order('revision_number', { ascending: false })
            .limit(1);

        if (!revError && existingRecords && existingRecords.length > 0) {
            revisionNumber = (existingRecords[0].revision_number || 1) + 1;
            
            // Mark previously active records as 'Revised'
            await db
                .from('unit_plan_changes')
                .update({ status: 'Revised', updated_at: new Date().toISOString() })
                .eq('project_id', projectId)
                .ilike('zone_id', zoneId)
                .eq('status', 'Active');
        }

        saveBtnText.textContent = 'Saving Mandate...';

        // Step 5: Insert Plan Change into Primary Supabase
        const currentUserId = localStorage.getItem('userId') || 'system_engineer';

        const payload = {
            project_id: projectId,
            tower_block: towerBlock,
            floor_level: floorLevel,
            zone_id: zoneId,
            customer_name: customerName,
            customer_phone: customerPhoneInput.value.trim() || null,
            cost_impact_type: costImpactSelect.value,
            has_structural_impact: hasStructuralImpact,
            signed_drawing_url: publicDrawingUrl,
            change_bullets: state.bullets,
            revision_number: revisionNumber,
            status: 'Active',
            created_by: currentUserId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data: insertedData, error: insertError } = await db
            .from('unit_plan_changes')
            .insert([payload])
            .select();

        if (insertError) throw insertError;

        showSiteToast(
            `Plan change recorded successfully! (Zone: ${zoneId}, Rev: v${revisionNumber})`,
            'success'
        );

        setTimeout(() => {
            window.location.href = 'plan-change-list.html';
        }, 1200);

    } catch (err) {
        console.error('[Save Plan Change Error]:', err);
        showSiteToast('Submission failed: ' + (err.message || 'Check database connection'), 'error');
        saveBtn.disabled = false;
        saveSpinner.classList.add('hidden');
        saveBtnText.textContent = 'Save Plan Change Mandate';
        state.isSubmitting = false;
    }
});

// Reset Form Handler
resetFormBtn.addEventListener('click', () => {
    clearSelectedFile();
    state.bullets = [];
    renderBullets();
    structuralImpactToggle.checked = false;
    customCategoryBox.classList.add('hidden');
    newCategoryInput.value = '';
    
    const storedProjectId = localStorage.getItem('activeProjectId');
    if (storedProjectId && isValidUUID(storedProjectId)) {
        projectSelect.value = storedProjectId;
        loadTowersForProject(storedProjectId);
    } else {
        resetStructureDropdowns();
    }
});

// ==============================================================================
// 9. INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    loadProjectsContext();
    renderBullets();
});