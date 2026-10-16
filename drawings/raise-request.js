/**
 * Prayosha ERP - Raise Drawing & Agency Request Controller
 * File: /drawings/raise-request.js
 * 
 * Features:
 * 1. 4-Tier Cascading Hierarchy: Site Project -> Tower/Block -> Floor Level -> Zone ID.
 * 2. Vendor / Consultant Integration: Dynamic loading from database with auto-filled contact points.
 * 3. Media Vault Integration: Uploads markup sketches, PDFs, or site photos to Cloudflare R2.
 * 4. Case Sequence Engine: Generates human-readable case IDs (DRW-YYMM-XXXX).
 * 5. Multi-Party Audit Logging: Automatically creates initial case files, revisions, and timeline logs.
 * 6. 1-Click WhatsApp Dispatch Modal: Generates pre-formatted bilingual dispatch messages with direct API links.
 * 7. Resilient PostgreSQL Handling: Immune to UUID (22P02) and schema syntax mismatches.
 */

import { supabase, uploadToR2 } from '../config.js';

// Central Supabase Client initialization
const client = supabase || window.supabaseClient;

// DOM Elements - Core Form
const form = document.getElementById('raiseRequestForm');
const projectSelect = document.getElementById('project_name');
const towerSelect = document.getElementById('tower_block');
const floorSelect = document.getElementById('floor_level');
const zoneSelect = document.getElementById('zone_id');
const disciplineSelect = document.getElementById('discipline');
const requestTypeSelect = document.getElementById('request_type');
const prioritySelect = document.getElementById('priority');
const targetDateInput = document.getElementById('target_date');

// DOM Elements - Agency & Contact
const agencySelect = document.getElementById('assigned_agency');
const contactPersonInput = document.getElementById('agency_contact_person');
const phoneInput = document.getElementById('agency_phone');
const emailInput = document.getElementById('agency_email');

// DOM Elements - Case Content & Attachments
const titleInput = document.getElementById('case_title');
const descriptionInput = document.getElementById('case_description');
const fileInput = document.getElementById('reference_file');
const uploadStatus = document.getElementById('upload-status');
const submitBtn = document.getElementById('submitBtn');
const feedbackBox = document.getElementById('form-feedback');

// DOM Elements - WhatsApp Confirmation Modal
const waModal = document.getElementById('whatsapp-modal');
const waBackdrop = document.getElementById('whatsapp-modal-backdrop');
const closeWaModalBtn = document.getElementById('close-whatsapp-modal');
const modalCaseNo = document.getElementById('modal-case-no');
const modalAgencyName = document.getElementById('modal-agency-name');
const modalTargetDate = document.getElementById('modal-target-date');
const modalWaPreview = document.getElementById('modal-whatsapp-preview');
const sendWaBtn = document.getElementById('send-whatsapp-btn');
const viewCaseBtn = document.getElementById('view-case-btn');

// Runtime State Cache
let currentProjectZones = [];
let availableVendors = [];
let generatedCaseDetails = null;

// ==============================================================================
// 1. UTILITY & VALIDATION HELPERS
// ==============================================================================
function isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid.trim());
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

function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        digits = '91' + digits;
    }
    return digits;
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return 'N/A';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

function generateCaseNumber() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `DRW-${yy}${mm}-${randomSuffix}`;
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

// Set Minimum Target Date to Today
function setDefaultTargetDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const minDate = `${yyyy}-${mm}-${dd}`;
    targetDateInput.min = minDate;

    // Default target date: 4 days from now
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 4);
    const defYyyy = defaultDate.getFullYear();
    const defMm = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const defDd = String(defaultDate.getDate()).padStart(2, '0');
    targetDateInput.value = `${defYyyy}-${defMm}-${defDd}`;
}

// ==============================================================================
// 2. PROJECT CONTEXT & VENDORS INITIALIZATION
// ==============================================================================
async function initContext() {
    setDefaultTargetDate();
    const activeProjectName = localStorage.getItem('activeProjectName') || '';
    const activeProjectId = localStorage.getItem('activeProjectId') || '';

    if (!client) {
        console.warn('[Drawing Requests] Supabase client offline. Using local session fallback.');
        populateFallbackProject(activeProjectName);
        return;
    }

    try {
        // Run concurrent fetches for projects and vendor consultants
        const [projectsRes, vendorsRes] = await Promise.all([
            client.from('projects').select('id, project_name, project_code').order('project_name', { ascending: true }),
            client.from('vendors').select('*').order('name', { ascending: true })
        ]);

        // 1. Populate Projects Dropdown
        if (!projectsRes.error && projectsRes.data && projectsRes.data.length > 0) {
            projectSelect.innerHTML = '<option value="">-- Select Project --</option>';
            let matchedOption = null;

            projectsRes.data.forEach(project => {
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

            if (!matchedOption && projectsRes.data.length > 0) {
                projectSelect.selectedIndex = 1;
                matchedOption = projectSelect.options[1];
            }

            if (matchedOption && isValidUUID(matchedOption.dataset.id)) {
                localStorage.setItem('activeProjectId', matchedOption.dataset.id);
                localStorage.setItem('activeProjectName', matchedOption.value);
                if (matchedOption.dataset.code) {
                    localStorage.setItem('activeProjectCode', matchedOption.dataset.code);
                }
                await loadProjectStructure(matchedOption.dataset.id);
            }
        } else {
            populateFallbackProject(activeProjectName);
        }

        // 2. Populate External Agencies / Consultants
        if (!vendorsRes.error && vendorsRes.data && vendorsRes.data.length > 0) {
            availableVendors = vendorsRes.data;
            populateAgenciesDropdown(availableVendors);
        } else {
            populateFallbackAgencies();
        }

    } catch (err) {
        console.error('[Drawing Requests] Initialization error:', err);
        populateFallbackProject(activeProjectName);
        populateFallbackAgencies();
    }
}

function populateFallbackProject(name) {
    const displayName = name || 'Prayosha Construction Project';
    projectSelect.innerHTML = `
        <option value="">-- Select Project --</option>
        <option value="${displayName}" selected>${displayName}</option>
    `;
    resetStructureDropdowns();
}

function populateAgenciesDropdown(vendors) {
    agencySelect.innerHTML = '<option value="">-- Select Consultant Agency --</option>';

    // Filter or highlight consultants and architects
    vendors.forEach(v => {
        const opt = document.createElement('option');
        const vendorId = v.id || v.vendor_id;
        opt.value = v.name || v.vendor_name || 'Consultant Agency';
        opt.dataset.id = vendorId;
        opt.dataset.contact = v.contact_person || v.owner_name || '';
        opt.dataset.phone = v.phone || v.mobile || v.contact_no || '';
        opt.dataset.email = v.email || '';
        opt.dataset.discipline = v.discipline || v.category || v.trade || '';

        const typeBadge = opt.dataset.discipline ? ` (${opt.dataset.discipline})` : '';
        opt.textContent = `${opt.value}${typeBadge}`;
        agencySelect.appendChild(opt);
    });

    // Add manual custom entry option
    const manualOpt = document.createElement('option');
    manualOpt.value = 'OTHER_AGENCY';
    manualOpt.textContent = '+ Register New / Unlisted Consultant...';
    agencySelect.appendChild(manualOpt);
}

function populateFallbackAgencies() {
    agencySelect.innerHTML = `
        <option value="">-- Select Consultant Agency --</option>
        <option value="Prayosha Principal Architects" data-phone="9825000001" data-contact="Chief Architect">Prayosha Principal Architects (Architectural)</option>
        <option value="Apex Structural Engineers" data-phone="9825000002" data-contact="Lead Structural Consultant">Apex Structural Engineers (RCC)</option>
        <option value="AquaFire MEP Consultants" data-phone="9825000003" data-contact="MEP Coordinator">AquaFire MEP Consultants (Plumbing & Fire)</option>
        <option value="GreenScape Studio" data-phone="9825000004" data-contact="Landscape Planner">GreenScape Studio (Landscape)</option>
        <option value="OTHER_AGENCY">+ Register New / Unlisted Consultant...</option>
    `;
}

// When agency selection changes, auto-fill contact fields
agencySelect.addEventListener('change', function() {
    const selectedOpt = this.options[this.selectedIndex];

    if (this.value === 'OTHER_AGENCY') {
        const customName = prompt('Enter Consultant / Agency Name:');
        if (customName && customName.trim()) {
            const opt = document.createElement('option');
            opt.value = customName.trim();
            opt.textContent = customName.trim();
            opt.selected = true;
            this.insertBefore(opt, selectedOpt);

            contactPersonInput.value = '';
            phoneInput.value = '';
            emailInput.value = '';
            contactPersonInput.focus();
        } else {
            this.selectedIndex = 0;
        }
        return;
    }

    if (selectedOpt && selectedOpt.value) {
        contactPersonInput.value = selectedOpt.dataset.contact || '';
        phoneInput.value = selectedOpt.dataset.phone || '';
        emailInput.value = selectedOpt.dataset.email || '';

        // Auto-match discipline if suggested by agency profile
        const vendorDiscipline = selectedOpt.dataset.discipline?.toLowerCase() || '';
        if (vendorDiscipline) {
            Array.from(disciplineSelect.options).forEach(opt => {
                if (opt.value && vendorDiscipline.includes(opt.value.toLowerCase())) {
                    disciplineSelect.value = opt.value;
                }
            });
        }
    } else {
        contactPersonInput.value = '';
        phoneInput.value = '';
        emailInput.value = '';
    }
});

// ==============================================================================
// 3. 4-TIER CASCADING HIERARCHY LOGIC
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
            towerSelect.innerHTML = '<option value="General Campus">General Campus / Common</option>';
            towerSelect.disabled = false;
            floorSelect.innerHTML = '<option value="Ground Level">Ground Level</option>';
            floorSelect.disabled = false;
            zoneSelect.innerHTML = '<option value="Campus-01">Campus Wide</option>';
            zoneSelect.disabled = false;
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

        // Add campus wide option
        const commonOpt = document.createElement('option');
        commonOpt.value = 'Common / Site Wide';
        commonOpt.textContent = 'Common / Site Wide Facilities';
        towerSelect.appendChild(commonOpt);

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
        console.error('[Drawing Requests] Error loading project structure:', err);
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

    if (selectedTower === 'Common / Site Wide') {
        floorSelect.innerHTML = '<option value="Ground / Site Level">Ground / Site Level</option>';
        floorSelect.disabled = false;
        zoneSelect.innerHTML = '<option value="SITE-WIDE-01">Entire Site / Layout</option>';
        zoneSelect.disabled = false;
        return;
    }

    const matchingZones = currentProjectZones.filter(z => (z.tower_name || '').trim() === selectedTower.trim());
    const rawFloors = matchingZones.map(z => (z.floor_name || z.zone_name || '').trim()).filter(Boolean);
    const uniqueFloors = Array.from(new Set(rawFloors));

    floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';

    if (uniqueFloors.length === 0) {
        floorSelect.innerHTML = '<option value="Typical Floor">Typical Floor</option>';
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

        if (!error && mapZones && mapZones.length > 0) {
            zoneSelect.innerHTML = '<option value="">-- Entire Floor / Select Zone --</option>';
            
            // Add Entire Floor level choice
            const allFloorOpt = document.createElement('option');
            allFloorOpt.value = `${selectedTower}-${getFloorAbbreviation(selectedFloor)}-ALL`;
            allFloorOpt.textContent = `[ALL] Entire ${selectedFloor} Layout`;
            zoneSelect.appendChild(allFloorOpt);

            mapZones.forEach(zone => {
                const opt = document.createElement('option');
                opt.value = zone.zone_id;
                const label = zone.room_identifier ? `[${zone.zone_id}] ${zone.room_identifier}` : zone.zone_id;
                const cat = zone.category ? ` (${zone.category})` : '';
                opt.textContent = `${label}${cat}`;
                zoneSelect.appendChild(opt);
            });

            zoneSelect.disabled = false;
            return;
        }

        // Fallback: Synthesize zones from architecture configuration
        const matchingArch = currentProjectZones.find(z => 
            (z.tower_name || '').trim().toLowerCase() === selectedTower.trim().toLowerCase() && 
            (z.floor_name || z.zone_name || '').trim().toLowerCase() === selectedFloor.trim().toLowerCase()
        );

        if (matchingArch) {
            const synthesized = synthesizeZonesForFloor(projectId, matchingArch);
            zoneSelect.innerHTML = '<option value="">-- Entire Floor / Select Zone --</option>';

            const allFloorOpt = document.createElement('option');
            allFloorOpt.value = `${selectedTower}-${getFloorAbbreviation(selectedFloor)}-ALL`;
            allFloorOpt.textContent = `[ALL] Entire ${selectedFloor} Layout`;
            zoneSelect.appendChild(allFloorOpt);

            synthesized.forEach(zone => {
                const opt = document.createElement('option');
                opt.value = zone.zone_id;
                const label = zone.room_identifier ? `[${zone.zone_id}] ${zone.room_identifier}` : zone.zone_id;
                opt.textContent = `${label} (${zone.category || 'Civil'})`;
                zoneSelect.appendChild(opt);
            });

            zoneSelect.disabled = false;
            return;
        }

        // Generic Floor Zone Option
        zoneSelect.innerHTML = `
            <option value="${selectedTower}-${getFloorAbbreviation(selectedFloor)}-ALL">[ALL] Entire ${selectedFloor}</option>
            <option value="${selectedTower}-${getFloorAbbreviation(selectedFloor)}-FLATS">Residential Flats</option>
            <option value="${selectedTower}-${getFloorAbbreviation(selectedFloor)}-CORE">Lift & Staircase Core</option>
        `;
        zoneSelect.disabled = false;

    } catch (err) {
        console.error('[Drawing Requests] Error populating zones:', err);
        zoneSelect.innerHTML = '<option value="GENERAL-ZONE">General Floor Zone</option>';
        zoneSelect.disabled = false;
    }
}

function synthesizeZonesForFloor(projectId, record) {
    const tower = record.tower_name || 'Tower A';
    const floor = record.floor_name || record.zone_name || 'Ground Floor';
    const towerPrefix = tower.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
    const floorPrefix = getFloorAbbreviation(floor);

    const totalFlats = parseInt(record.total_flats) || 0;
    const totalShops = parseInt(record.total_shops) || 0;
    const zones = [];

    for (let f = 1; f <= totalFlats; f++) {
        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: `${towerPrefix}-${floorPrefix}-FLAT-${String(f).padStart(2, '0')}`,
            room_identifier: `Flat ${f}`,
            category: 'Flat'
        });
    }

    for (let s = 1; s <= totalShops; s++) {
        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: `${towerPrefix}-${floorPrefix}-SHOP-${String(s).padStart(2, '0')}`,
            room_identifier: `Shop ${s}`,
            category: 'Shop'
        });
    }

    if (zones.length === 0) {
        zones.push({
            project_id: projectId,
            tower_name: tower,
            floor_level: floor,
            zone_id: `${towerPrefix}-${floorPrefix}-Z01`,
            room_identifier: record.amenity || floor,
            category: 'General'
        });
    }

    return zones;
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

// Cascading Change Listeners
projectSelect.addEventListener('change', async function() {
    const selectedOption = this.options[this.selectedIndex];
    const projectId = selectedOption ? selectedOption.dataset.id : null;

    if (isValidUUID(projectId)) {
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

    if (isValidUUID(projectId) && selectedTower && selectedFloor) {
        await populateZonesForFloor(projectId, selectedTower, selectedFloor);
    } else {
        resetZoneDropdown();
    }
});

// Auto-Draft Case Title Helper
function updateSuggestedTitle() {
    const tower = towerSelect.value;
    const floor = floorSelect.value;
    const discipline = disciplineSelect.value;
    const reqType = requestTypeSelect.value;

    if (tower && floor && discipline && !titleInput.value) {
        titleInput.value = `${discipline} - ${reqType} for ${tower} (${floor})`;
    }
}

disciplineSelect.addEventListener('change', updateSuggestedTitle);
requestTypeSelect.addEventListener('change', updateSuggestedTitle);

// ==============================================================================
// 4. FORM SUBMISSION & CLOUDFLARE R2 UPLOAD
// ==============================================================================
form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-[#1E3A5F] inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Registering Case...
    `;
    submitBtn.disabled = true;

    try {
        if (!client) {
            throw new Error('Supabase client connection offline. Please check your network.');
        }

        // 1. Resolve Project Metadata
        const selectedOption = projectSelect.options[projectSelect.selectedIndex];
        let projectId = selectedOption ? selectedOption.dataset.id : localStorage.getItem('activeProjectId');
        const projectName = projectSelect.value;

        if (!isValidUUID(projectId)) {
            // Find valid UUID from database if available
            const { data: matchedP } = await client.from('projects').select('id').eq('project_name', projectName).maybeSingle();
            if (matchedP && isValidUUID(matchedP.id)) {
                projectId = matchedP.id;
            } else {
                throw new Error('Please select a valid site project from the dropdown.');
            }
        }

        // 2. Resolve Agency Details
        const agencySelectedOpt = agencySelect.options[agencySelect.selectedIndex];
        const agencyId = agencySelectedOpt ? agencySelectedOpt.dataset.id : null;
        const agencyName = agencySelect.value;
        const contactPerson = contactPersonInput.value.trim();
        const agencyPhone = phoneInput.value.trim();
        const agencyEmail = emailInput.value.trim();

        // 3. User Identity
        let creatorName = 'Site Engineer';
        let creatorId = null;
        try {
            const userStr = localStorage.getItem('prayosha_user');
            if (userStr) {
                const u = JSON.parse(userStr);
                creatorName = u.full_name || u.displayName || u.email || 'Site Engineer';
                creatorId = isValidUUID(u.id) ? u.id : null;
            }
        } catch (_) {}

        // 4. File Upload (Optional Cloudflare R2 Upload)
        let attachedFileUrl = null;
        let attachedFileName = null;
        let attachedFileSize = null;
        let attachedFileExt = null;

        const fileToUpload = fileInput.files[0];
        if (fileToUpload) {
            uploadStatus.textContent = 'Uploading file to Cloudflare R2...';
            uploadStatus.className = 'text-[11px] font-semibold text-amber-600 animate-pulse';

            attachedFileName = fileToUpload.name;
            attachedFileSize = fileToUpload.size;
            attachedFileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'dat';

            try {
                attachedFileUrl = await uploadToR2(fileToUpload, 'drawing-requests');
                uploadStatus.textContent = '✓ Uploaded to R2';
                uploadStatus.className = 'text-[11px] font-semibold text-emerald-600';
            } catch (r2Err) {
                console.error('[R2 Upload Error]:', r2Err);
                uploadStatus.textContent = 'Upload failed, continuing without file.';
                uploadStatus.className = 'text-[11px] font-semibold text-red-500';
            }
        }

        // 5. Generate Case Number
        const caseNumber = generateCaseNumber();

        // 6. Assemble Master Case Payload
        const casePayload = {
            case_number: caseNumber,
            project_id: projectId,
            project_name: projectName,
            tower_block: towerSelect.value,
            floor_level: floorSelect.value,
            zone_id: zoneSelect.value || `${towerSelect.value}-${floorSelect.value}`,
            discipline: disciplineSelect.value,
            request_type: requestTypeSelect.value,
            title: titleInput.value.trim(),
            description: descriptionInput.value.trim() || null,
            priority: prioritySelect.value,
            status: 'Requested',
            assigned_agency_name: agencyName,
            agency_contact_person: contactPerson || null,
            agency_phone: agencyPhone,
            agency_email: agencyEmail || null,
            target_date: targetDateInput.value,
            created_by_name: creatorName
        };

        if (isValidUUID(agencyId)) {
            casePayload.assigned_agency_id = agencyId;
        }
        if (isValidUUID(creatorId)) {
            casePayload.created_by_id = creatorId;
        }

        // 7. Insert Case into Supabase
        const { data: newCase, error: insertError } = await client
            .from('drawing_cases')
            .insert([casePayload])
            .select()
            .single();

        if (insertError) throw insertError;

        const createdCaseId = newCase.id;

        // 8. If Reference File was uploaded, register in Revisions Vault (R0 / Reference)
        if (attachedFileUrl) {
            try {
                await client.from('drawing_case_revisions').insert([{
                    case_id: createdCaseId,
                    revision_number: 'Ref-0',
                    drawing_title: `Site Reference - ${attachedFileName}`,
                    file_name: attachedFileName,
                    file_url: attachedFileUrl,
                    file_size_bytes: attachedFileSize,
                    file_extension: attachedFileExt,
                    uploaded_by_type: 'employee',
                    uploaded_by_name: creatorName,
                    uploaded_by_id: isValidUUID(creatorId) ? creatorId : null,
                    is_current_ifc: false,
                    review_remarks: 'Initial markup/reference sketch uploaded with case request.'
                }]);
            } catch (revErr) {
                console.warn('[Drawing Requests] Revisions vault notice:', revErr);
            }
        }

        // 9. Post Initial System Message to Internal Message Center
        try {
            await client.from('drawing_case_messages').insert([{
                case_id: createdCaseId,
                sender_type: 'system',
                sender_name: 'Prayosha Engine',
                message_text: `Case #${caseNumber} registered by ${creatorName} for ${agencyName}. Priority: ${casePayload.priority}. Deadline: ${formatDateDisplay(casePayload.target_date)}.`,
                attachment_url: attachedFileUrl,
                attachment_name: attachedFileName,
                is_status_change: true
            }]);
        } catch (msgErr) {
            console.warn('[Drawing Requests] Initial message log notice:', msgErr);
        }

        // 10. Success Feedback & WhatsApp Modal Launch
        generatedCaseDetails = {
            id: createdCaseId,
            caseNumber: caseNumber,
            projectName: projectName,
            tower: casePayload.tower_block,
            floor: casePayload.floor_level,
            zone: casePayload.zone_id,
            discipline: casePayload.discipline,
            requestType: casePayload.request_type,
            title: casePayload.title,
            priority: casePayload.priority,
            targetDate: casePayload.target_date,
            agencyName: agencyName,
            contactPerson: contactPerson,
            phone: agencyPhone,
            description: casePayload.description
        };

        launchWhatsAppModal(generatedCaseDetails);

        // Feedback Banner
        feedbackBox.className = 'p-4 rounded-2xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 block shadow-sm flex items-center gap-2 mb-6';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Case File <strong>${caseNumber}</strong> registered successfully! Notification prepared for <strong>${escapeHtml(agencyName)}</strong>.</span>
        `;

        // Clear content fields while maintaining project hierarchy
        titleInput.value = '';
        descriptionInput.value = '';
        fileInput.value = '';
        uploadStatus.textContent = '';

    } catch (err) {
        console.error('[Case Registration Failure]:', err);
        feedbackBox.className = 'p-4 rounded-2xl text-xs font-semibold bg-red-50 text-red-800 border border-red-200 block shadow-sm flex items-center gap-2 mb-6';
        feedbackBox.innerHTML = `
            <svg class="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Error registering case: ${escapeHtml(err.message || 'Database transaction error')}</span>
        `;
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
});

// ==============================================================================
// 5. WHATSAPP DISPATCH MODAL ENGINE
// ==============================================================================
function buildWhatsAppMessage(caseInfo) {
    const formattedDate = formatDateDisplay(caseInfo.targetDate);
    const greeting = caseInfo.contactPerson ? `Dear ${caseInfo.contactPerson},` : `Dear ${caseInfo.agencyName},`;

    return `🏗️ *PRAYOSHA ERP - DRAWING REQUEST*
${greeting}

A formal drawing / technical clarification request has been assigned to your agency on Prayosha ERP.

📋 *Case No:* ${caseInfo.caseNumber}
🏢 *Site Project:* ${caseInfo.projectName}
📍 *Location:* ${caseInfo.tower} | ${caseInfo.floor} [${caseInfo.zone}]
📐 *Discipline:* ${caseInfo.discipline}
📑 *Request Type:* ${caseInfo.requestType}
📌 *Case Title:* ${caseInfo.title}
⚡ *Priority:* ${caseInfo.priority}
⏳ *Turnaround Deadline:* ${formattedDate}

${caseInfo.description ? `*Site Notes & Scope:*\n${caseInfo.description}\n` : ''}
Please log in to your Prayosha ERP consultant account to review the request, communicate with the site engineers, and upload the required drawings directly to the case file.

_Prayosha Group Site Management System_`;
}

function launchWhatsAppModal(caseInfo) {
    modalCaseNo.textContent = caseInfo.caseNumber;
    modalAgencyName.textContent = caseInfo.agencyName + (caseInfo.contactPerson ? ` (${caseInfo.contactPerson})` : '');
    modalTargetDate.textContent = formatDateDisplay(caseInfo.targetDate);

    const waDraft = buildWhatsAppMessage(caseInfo);
    modalWaPreview.textContent = waDraft;

    // Direct Case Workspace link
    viewCaseBtn.href = `./case-file.html?id=${caseInfo.id}`;

    // Setup WhatsApp Button Action
    sendWaBtn.onclick = function() {
        const cleanedPhone = cleanPhoneForWhatsApp(caseInfo.phone);
        const encodedMsg = encodeURIComponent(waDraft);

        let waUrl = '';
        if (cleanedPhone) {
            waUrl = `https://wa.me/${cleanedPhone}?text=${encodedMsg}`;
        } else {
            waUrl = `https://wa.me/?text=${encodedMsg}`;
        }

        window.open(waUrl, '_blank');
    };

    // Open Modal with Smooth Animation
    waModal.classList.remove('hidden');
    void waModal.offsetWidth;
    waModal.classList.remove('opacity-0');
    waModal.classList.add('opacity-100');
    waModal.querySelector('.transform').classList.remove('scale-95');
    waModal.querySelector('.transform').classList.add('scale-100');
}

function closeWhatsAppModal() {
    waModal.classList.remove('opacity-100');
    waModal.classList.add('opacity-0');
    waModal.querySelector('.transform').classList.remove('scale-100');
    waModal.querySelector('.transform').classList.add('scale-95');

    setTimeout(() => {
        waModal.classList.add('hidden');
    }, 280);
}

// Modal Listeners
if (closeWaModalBtn) closeWaModalBtn.addEventListener('click', closeWhatsAppModal);
if (waBackdrop) waBackdrop.addEventListener('click', closeWhatsAppModal);

// ==============================================================================
// 6. INITIAL RUN
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    initContext();
});