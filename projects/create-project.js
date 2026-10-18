import { supabase, uploadToR2 } from '../config.js';

let globalAmenities = ['Gym', 'Swimming Pool', 'Yoga', 'Clubhouse', 'Garden', 'Play Area'];

// Master Typology Profiles Engine with Bilingual Gujarati Labels
let activeTypologyTab = '2 BHK';
let typologyProfiles = {
    '1 BHK': [
        { code: 'HALL', name: 'Living Hall', name_gu: 'લિવિંગ હોલ / હોલ', active: true },
        { code: 'KIT', name: 'Kitchen', name_gu: 'રસોડું / કિચન', active: true },
        { code: 'MBR', name: 'Bedroom', name_gu: 'બેડરૂમ', active: true },
        { code: 'CT', name: 'Common Toilet', name_gu: 'કોમન ટોઇલેટ', active: true },
        { code: 'BAL1', name: 'Balcony', name_gu: 'બાલ્કની', active: true },
        { code: 'WSH', name: 'Wash Area', name_gu: 'વોશ એરિયા', active: true }
    ],
    '2 BHK': [
        { code: 'HALL', name: 'Living Hall', name_gu: 'લિવિંગ હોલ / હોલ', active: true },
        { code: 'KIT', name: 'Kitchen', name_gu: 'રસોડું / કિચન', active: true },
        { code: 'MBR', name: 'Master Bedroom', name_gu: 'માસ્ટર બેડરૂમ', active: true },
        { code: 'BR1', name: 'Bedroom 1', name_gu: 'બેડરૂમ ૧', active: true },
        { code: 'CT', name: 'Common Toilet', name_gu: 'કોમન ટોઇલેટ', active: true },
        { code: 'AT1', name: 'Attach Toilet', name_gu: 'એટેચ ટોઇલેટ', active: true },
        { code: 'BAL1', name: 'Balcony', name_gu: 'બાલ્કની', active: true },
        { code: 'WSH', name: 'Wash Area', name_gu: 'વોશ એરિયા', active: true }
    ],
    '3 BHK': [
        { code: 'HALL', name: 'Living Hall', name_gu: 'લિવિંગ હોલ / હોલ', active: true },
        { code: 'KIT', name: 'Kitchen', name_gu: 'રસોડું / કિચન', active: true },
        { code: 'MBR', name: 'Master Bedroom', name_gu: 'માસ્ટર બેડરૂમ', active: true },
        { code: 'GBR', name: 'Guest Bedroom', name_gu: 'ગેસ્ટ બેડરૂમ', active: true },
        { code: 'BR1', name: 'Bedroom 1', name_gu: 'બેડરૂમ ૧', active: true },
        { code: 'CT', name: 'Common Toilet', name_gu: 'કોમન ટોઇલેટ', active: true },
        { code: 'AT1', name: 'Attach Toilet 1', name_gu: 'એટેચ ટોઇલેટ ૧', active: true },
        { code: 'AT2', name: 'Attach Toilet 2', name_gu: 'એટેચ ટોઇલેટ ૨', active: true },
        { code: 'BAL1', name: 'Living Balcony', name_gu: 'હોલ બાલ્કની', active: true },
        { code: 'BAL2', name: 'Bed Balcony', name_gu: 'બેડરૂમ બાલ્કની', active: true },
        { code: 'WSH', name: 'Wash Area / Store', name_gu: 'વોશ એરિયા / સ્ટોર', active: true }
    ],
    '4 BHK': [
        { code: 'HALL', name: 'Grand Living & Dining', name_gu: 'લિવિંગ અને ડાઇનિંગ હોલ', active: true },
        { code: 'KIT', name: 'Kitchen', name_gu: 'રસોડું / કિચન', active: true },
        { code: 'STR', name: 'Store Room', name_gu: 'સ્ટોર રૂમ', active: true },
        { code: 'MBR', name: 'Master Bedroom 1', name_gu: 'માસ્ટર બેડરૂમ ૧', active: true },
        { code: 'MBR2', name: 'Master Bedroom 2', name_gu: 'માસ્ટર બેડરૂમ ૨', active: true },
        { code: 'BR1', name: 'Children Bedroom', name_gu: 'ચિલ્ડ્રન બેડરૂમ', active: true },
        { code: 'GBR', name: 'Guest Bedroom', name_gu: 'ગેસ્ટ બેડરૂમ', active: true },
        { code: 'CT', name: 'Common Toilet', name_gu: 'કોમન ટોઇલેટ', active: true },
        { code: 'AT1', name: 'Attach Toilet 1', name_gu: 'એટેચ ટોઇલેટ ૧', active: true },
        { code: 'AT2', name: 'Attach Toilet 2', name_gu: 'એટેચ ટોઇલેટ ૨', active: true },
        { code: 'AT3', name: 'Attach Toilet 3', name_gu: 'એટેચ ટોઇલેટ ૩', active: true },
        { code: 'BAL1', name: 'Main Balcony', name_gu: 'મેઇન બાલ્કની', active: true },
        { code: 'BAL2', name: 'Standing Balcony', name_gu: 'સ્ટેન્ડિંગ બાલ્કની', active: true },
        { code: 'WSH', name: 'Dry Balcony / Wash', name_gu: 'ડ્રાય બાલ્કની / વોશ', active: true }
    ],
    'Penthouse': [
        { code: 'HALL', name: 'Double Height Living Room', name_gu: 'ડબલ હાઇટ લિવિંગ રૂમ', active: true },
        { code: 'DIN', name: 'Dining Lounge', name_gu: 'ડાઇનિંગ લાઉન્જ', active: true },
        { code: 'KIT', name: 'Modular Kitchen & Pantry', name_gu: 'મોડ્યુલર કિચન & પેન્ટ્રી', active: true },
        { code: 'MBR1', name: 'Presidential Master Suite', name_gu: 'પ્રેસિડેન્શિયલ માસ્ટર સ્યુટ', active: true },
        { code: 'MBR2', name: 'Master Suite 2', name_gu: 'માસ્ટર સ્યુટ ૨', active: true },
        { code: 'BR1', name: 'Guest Suite', name_gu: 'ગેસ્ટ સ્યુટ', active: true },
        { code: 'TER', name: 'Private Sky Terrace', name_gu: 'પ્રાઇવેટ સ્કાય ટેરેસ', active: true },
        { code: 'FAM', name: 'Family Lounge', name_gu: 'ફેમિલી લાઉન્જ', active: true },
        { code: 'WSH', name: 'Utility & Servant Area', name_gu: 'યુટિલિટી & સર્વન્ટ એરિયા', active: true }
    ]
};

// State Variables
let isEditMode = false;
let editProjectId = null;
let existingPhotoUrl = null;
let towerCount = 0;
let facilityCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Role-Based Access Guard
    const userRole = localStorage.getItem('userRole');
    if (userRole && userRole !== 'Owner' && userRole !== 'General Manager' && userRole !== 'Construction Head') {
        showToast('Access restricted: Only Owners and Construction Heads can access project architecture.', 'error');
        setTimeout(() => {
            window.location.href = 'project-dashboard.html';
        }, 1200);
        return;
    }

    // 2. Determine Create vs Edit Mode from URL
    const urlParams = new URLSearchParams(window.location.search);
    editProjectId = urlParams.get('id');
    isEditMode = Boolean(editProjectId);

    // 3. Initial Static & Reference Data Loading
    await loadCustomDropdownValues();
    await loadEmployeeDropdowns();
    initTypologyModal();

    if (isEditMode) {
        setupEditModeUI();
        await loadExistingProjectForEditing(editProjectId);
    } else {
        await generateNextProjectCode();
    }

    // 4. Dynamic Custom Option Registration
    ['project_type', 'contract_type', 'status'].forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;

        select.addEventListener('change', async (e) => {
            if (e.target.value === '_ADD_NEW_') {
                const label = e.target.previousElementSibling ? e.target.previousElementSibling.innerText : selectId;
                const newValue = prompt(`Enter new custom value for ${label}:`);
                
                if (newValue && newValue.trim() !== '') {
                    const val = newValue.trim();
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    e.target.insertBefore(opt, e.target.lastElementChild);
                    e.target.value = val;
                    
                    try {
                        await supabase.from('dropdown_values').insert([{ category: selectId, value: val }]);
                        showToast(`Saved "${val}" to options list`, 'success');
                    } catch (err) {
                        console.warn('Could not persist custom dropdown option:', err);
                    }
                } else {
                    e.target.selectedIndex = 0;
                }
            }
        });
    });

    // 5. Auto Budget Calculation
    const sqftInput = document.getElementById('total_sqft');
    const rateInput = document.getElementById('rate_per_sqft');
    const budgetOutput = document.getElementById('estimated_budget');
    
    const calculateBudget = () => {
        const total = (parseFloat(sqftInput.value) || 0) * (parseFloat(rateInput.value) || 0);
        budgetOutput.value = `₹${total.toLocaleString('en-IN')}`;
    };
    
    sqftInput.addEventListener('input', calculateBudget);
    rateInput.addEventListener('input', calculateBudget);

    // ==========================================
    // UNIFIED STRUCTURE BUILDER HANDLERS
    // ==========================================
    const projectTypeSelect = document.getElementById('project_type');
    const structureContainer = document.getElementById('structureContainer');

    projectTypeSelect.addEventListener('change', () => {
        if (projectTypeSelect.value !== '_ADD_NEW_') {
            const { showFlats, showShops } = getColumnVisibility();
            document.querySelectorAll('.col-flats').forEach(el => el.style.display = showFlats ? 'block' : 'none');
            document.querySelectorAll('.col-shops').forEach(el => el.style.display = showShops ? 'block' : 'none');
        }
    });

    // Add Tower Block
    document.getElementById('addTowerBtn').addEventListener('click', () => {
        towerCount++;
        const towerName = `Tower ${String.fromCharCode(64 + towerCount)}`; 
        const { showFlats, showShops } = getColumnVisibility();

        const html = `
            <div class="structure-card tower-card p-4 rounded-xl shadow-sm border border-gray-200 relative mb-4">
                <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
                    <input type="text" class="structure-name font-bold text-lg prayosha-navy bg-transparent border-b border-dashed border-gray-400 focus:outline-none w-full sm:w-1/3" value="${towerName}" title="Rename Block">
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="btn-add-basement text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">+ Add Basement</button>
                        <button type="button" class="btn-add-floor text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition">+ Add Floor</button>
                        <button type="button" class="btn-clone-tower text-xs bg-brand-amber/20 text-brand-navy border border-brand-amber px-3 py-1.5 rounded-lg hover:bg-brand-amber hover:text-white transition font-semibold" title="Clone Entire Tower Setup">⧉ Clone Tower</button>
                        <button type="button" class="btn-delete-structure text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition ml-2">Delete</button>
                    </div>
                </div>
                
                <div class="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase border-b pb-2 mb-2 px-2">
                    <div class="col-span-3">Floor / Level</div>
                    <div class="col-span-2 col-flats" style="display: ${showFlats ? 'block' : 'none'}">Total Flats</div>
                    <div class="col-span-2 col-shops" style="display: ${showShops ? 'block' : 'none'}">Total Shops</div>
                    <div class="col-span-3">Amenities</div>
                    <div class="col-span-2 text-right">Actions</div>
                </div>

                <div class="floors-container space-y-3">
                    ${generateTowerFloorHTML('Ground Floor', showFlats, showShops)}
                </div>
            </div>
        `;
        structureContainer.insertAdjacentHTML('beforeend', html);
    });

    // Add Facility
    document.getElementById('addFacilityBtn').addEventListener('click', () => {
        facilityCount++;
        const facilityName = `Clubhouse ${facilityCount}`; 

        const html = `
            <div class="structure-card facility-card p-4 rounded-xl shadow-sm border border-gray-200 relative mb-4">
                <div class="flex justify-between items-center mb-4">
                    <input type="text" class="structure-name font-bold text-lg text-indigo-900 bg-transparent border-b border-dashed border-gray-400 focus:outline-none w-1/2" value="${facilityName}" title="Rename Facility">
                    <div class="flex gap-2">
                        <button type="button" class="btn-add-basement text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">+ Add Basement</button>
                        <button type="button" class="btn-add-floor text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition">+ Add Floor</button>
                        <button type="button" class="btn-delete-structure text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition ml-2">Delete</button>
                    </div>
                </div>
                
                <div class="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase border-b pb-2 mb-2 px-2">
                    <div class="col-span-3">Floor / Level</div>
                    <div class="col-span-4">Custom Rooms / Zones (Comma separated)</div>
                    <div class="col-span-3">Amenities</div>
                    <div class="col-span-2 text-right">Actions</div>
                </div>

                <div class="floors-container space-y-3">
                    ${generateFacilityFloorHTML('Ground Floor')}
                </div>
            </div>
        `;
        structureContainer.insertAdjacentHTML('beforeend', html);
    });

    // Add Ground Zone
    document.getElementById('addGroundZoneBtn').addEventListener('click', () => {
        const html = `
            <div class="structure-card ground-card p-4 rounded-xl shadow-sm border border-gray-200 relative mb-4">
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-2 w-1/2">
                        <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <input type="text" class="structure-name font-bold text-lg text-emerald-900 bg-transparent border-b border-dashed border-gray-400 focus:outline-none w-full" value="Main Garden" title="Rename Zone">
                    </div>
                    <button type="button" class="btn-delete-structure text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition">Delete</button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3 border border-gray-100 rounded-lg">
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Description / Features</label>
                        <input type="text" class="input-field text-sm ground-desc" placeholder="e.g. Landscaping, Walkways">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Total Area (Sq.Ft)</label>
                        <input type="number" class="input-field text-sm ground-area" placeholder="0">
                    </div>
                </div>
            </div>
        `;
        structureContainer.insertAdjacentHTML('beforeend', html);
    });

    // ==========================================
    // CRITICAL EVENT DELEGATION
    // ==========================================
    structureContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('trigger-sizing')) {
            updateTowerSizingPanel(e.target.closest('.floor-group'));
        }
        if (e.target.classList.contains('trigger-facility-sizing')) {
            updateFacilitySizingPanel(e.target.closest('.floor-group'));
        }
        if (e.target.classList.contains('size-flat')) {
            const card = e.target.closest('.flat-unit-card');
            const sqft = parseFloat(e.target.value) || 0;
            const typologySelect = card.querySelector('.select-typology');
            if (typologySelect && sqft > 0) {
                if (sqft < 900) typologySelect.value = '1 BHK';
                else if (sqft < 1400) typologySelect.value = '2 BHK';
                else if (sqft < 2100) typologySelect.value = '3 BHK';
                else if (sqft < 3000) typologySelect.value = '4 BHK';
                else typologySelect.value = 'Penthouse';
            }
        }
    });

    structureContainer.addEventListener('click', (e) => {
        // Delete Structure
        if (e.target.classList.contains('btn-delete-structure')) {
            const structure = e.target.closest('.structure-card');
            if (structure && confirm('Are you sure you want to delete this structure?')) {
                structure.remove();
            }
            return;
        }
        
        // Remove Floor Row
        if (e.target.classList.contains('btn-remove-floor')) {
            const floorGroup = e.target.closest('.floor-group');
            const floorsContainer = floorGroup.parentElement;
            
            if (floorsContainer.querySelectorAll('.floor-group').length <= 1) {
                showToast('A structure must have at least one floor level.', 'error');
                return;
            }
            
            floorGroup.remove();
            return;
        }

        // Add Floor
        if (e.target.classList.contains('btn-add-floor')) {
            const card = e.target.closest('.structure-card');
            if (!card) return;
            const cont = card.querySelector('.floors-container');
            const isFacility = card.classList.contains('facility-card');
            
            if (isFacility) {
                cont.insertAdjacentHTML('beforeend', generateFacilityFloorHTML(getNextFloorName(cont)));
            } else {
                const { showFlats, showShops } = getColumnVisibility();
                cont.insertAdjacentHTML('beforeend', generateTowerFloorHTML(getNextFloorName(cont), showFlats, showShops, false));
            }
            return;
        }

        // Add Basement
        if (e.target.classList.contains('btn-add-basement')) {
            const card = e.target.closest('.structure-card');
            if (!card) return;
            const cont = card.querySelector('.floors-container');
            const isFacility = card.classList.contains('facility-card');
            
            if (isFacility) {
                cont.insertAdjacentHTML('afterbegin', generateFacilityFloorHTML(getNextBasementName(cont)));
            } else {
                const { showFlats, showShops } = getColumnVisibility();
                cont.insertAdjacentHTML('afterbegin', generateTowerFloorHTML(getNextBasementName(cont), showFlats, showShops, true));
            }
            return;
        }

        // 1-Click Clone Tower Configuration
        if (e.target.classList.contains('btn-clone-tower')) {
            const sourceCard = e.target.closest('.structure-card');
            if (!sourceCard) return;

            towerCount++;
            const newTowerName = `Tower ${String.fromCharCode(64 + towerCount)}`;
            
            const clonedCard = sourceCard.cloneNode(true);
            const nameInput = clonedCard.querySelector('.structure-name');
            if (nameInput) nameInput.value = newTowerName;

            const origInputs = sourceCard.querySelectorAll('input, select');
            const cloneInputs = clonedCard.querySelectorAll('input, select');
            origInputs.forEach((inp, idx) => {
                if (cloneInputs[idx] && inp !== nameInput) {
                    if (inp.type === 'checkbox') {
                        cloneInputs[idx].checked = inp.checked;
                    } else {
                        cloneInputs[idx].value = inp.value;
                    }
                }
            });

            structureContainer.appendChild(clonedCard);
            showToast(`Cloned configuration successfully to ${newTowerName}!`, 'success');
            return;
        }

        // Copy Floor Format
        if (e.target.classList.contains('btn-copy-floor')) {
            const floorGroup = e.target.closest('.floor-group');
            const card = floorGroup.closest('.structure-card');
            const container = card.querySelector('.floors-container');
            const isFacility = card.classList.contains('facility-card');

            const isBasement = floorGroup.querySelector('.floor-name-input').value.toLowerCase().includes('basement');
            const nextName = isBasement ? getNextBasementName(container) : getNextFloorName(container);

            closeAllAmenityDropdowns();

            if (isFacility) {
                const roomVal = floorGroup.querySelector('.room-input').value;
                const amenityVal = floorGroup.querySelector('.amenity-display').value;
                
                const html = generateFacilityFloorHTML(nextName);
                floorGroup.insertAdjacentHTML('afterend', html);
                
                const newRow = floorGroup.nextElementSibling;
                newRow.querySelector('.room-input').value = roomVal;
                newRow.querySelector('.amenity-display').value = amenityVal;
                
                updateFacilitySizingPanel(newRow);
                floorGroup.querySelectorAll('.size-room').forEach(oldInp => {
                    const match = newRow.querySelector(`.size-room[data-room="${oldInp.getAttribute('data-room')}"]`);
                    if (match) match.value = oldInp.value;
                });
            } else {
                const { showFlats, showShops } = getColumnVisibility();
                const flatsVal = floorGroup.querySelector('.flat-input').value;
                const shopsVal = floorGroup.querySelector('.shop-input').value;
                const amenityVal = floorGroup.querySelector('.amenity-display').value;

                const html = generateTowerFloorHTML(nextName, showFlats, showShops, isBasement);
                floorGroup.insertAdjacentHTML('afterend', html);
                
                const newRow = floorGroup.nextElementSibling;
                newRow.querySelector('.flat-input').value = flatsVal;
                newRow.querySelector('.shop-input').value = shopsVal;
                newRow.querySelector('.amenity-display').value = amenityVal;

                updateTowerSizingPanel(newRow);

                const oldFlatSizes = Array.from(floorGroup.querySelectorAll('.size-flat')).map(i => i.value);
                const oldTypologies = Array.from(floorGroup.querySelectorAll('.select-typology')).map(s => s.value);
                const oldShopSizes = Array.from(floorGroup.querySelectorAll('.size-shop')).map(i => i.value);

                newRow.querySelectorAll('.size-flat').forEach((inp, idx) => inp.value = oldFlatSizes[idx] || '');
                newRow.querySelectorAll('.select-typology').forEach((sel, idx) => sel.value = oldTypologies[idx] || '2 BHK');
                newRow.querySelectorAll('.size-shop').forEach((inp, idx) => inp.value = oldShopSizes[idx] || '');
            }
            return;
        }

        // Apply First Flat's Sq.Ft & Typology to All on this Floor
        if (e.target.classList.contains('btn-apply-all-flats')) {
            const container = e.target.closest('div.bg-white');
            const flatInputs = container.querySelectorAll('.size-flat');
            const typologySelects = container.querySelectorAll('.select-typology');
            
            if (flatInputs.length > 0) {
                const firstVal = flatInputs[0].value;
                const firstTypology = typologySelects.length > 0 ? typologySelects[0].value : '2 BHK';
                
                flatInputs.forEach(inp => inp.value = firstVal);
                typologySelects.forEach(sel => sel.value = firstTypology);
            }
            return;
        }

        // Generic Apply All sizes for shops
        if (e.target.classList.contains('btn-apply-all')) {
            const targetClass = e.target.getAttribute('data-target');
            const container = e.target.closest('div.bg-white');
            const inputs = container.querySelectorAll(targetClass);
            if (inputs.length > 0) {
                const val = inputs[0].value;
                inputs.forEach(inp => inp.value = val);
            }
            return;
        }

        // Amenities UI Toggle
        if (e.target.classList.contains('amenity-display')) {
            const wrapper = e.target.closest('.multi-select-wrapper');
            const dropdown = wrapper.querySelector('.options-container');
            const isCurrentlyOpen = !dropdown.classList.contains('hidden');

            closeAllAmenityDropdowns();

            if (!isCurrentlyOpen) {
                dropdown.classList.remove('hidden');
                const floorRow = e.target.closest('.floor-row');
                const floorGroup = e.target.closest('.floor-group');
                if (floorRow) floorRow.classList.add('dropdown-active');
                if (floorGroup) floorGroup.classList.add('dropdown-active');
            }
            return;
        }

        // Custom Amenity Registration
        if (e.target.classList.contains('btn-add-custom-amenity')) {
            const wrapper = e.target.closest('.options-container');
            const input = wrapper.querySelector('.custom-amenity-input');
            const newVal = input.value.trim();
            
            if (newVal) {
                if (!globalAmenities.includes(newVal)) {
                    globalAmenities.push(newVal);
                    try {
                        supabase.from('dropdown_values').insert([{ category: 'amenity', value: newVal }]).then();
                    } catch (_) {}
                }
                
                const listCont = wrapper.querySelector('.amenity-list-container');
                const html = `<label class="flex items-center text-xs mb-1 p-1 hover:bg-gray-50 rounded cursor-pointer">
                                <input type="checkbox" value="${newVal}" class="mr-2 amenity-cb" checked> ${newVal}
                              </label>`;
                listCont.insertAdjacentHTML('beforeend', html);
                input.value = '';
                
                const newCheckbox = listCont.lastElementChild.querySelector('input');
                newCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
        }
    });

    structureContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('amenity-cb')) {
            const wrapper = e.target.closest('.multi-select-wrapper');
            const display = wrapper.querySelector('.amenity-display');
            const checked = Array.from(wrapper.querySelectorAll('.amenity-cb:checked')).map(cb => cb.value);
            display.value = checked.join(', ');

            const floorGroup = e.target.closest('.floor-group');
            const isFacility = e.target.closest('.structure-card').classList.contains('facility-card');
            if (isFacility) updateFacilitySizingPanel(floorGroup);
            else updateTowerSizingPanel(floorGroup);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.multi-select-wrapper')) {
            closeAllAmenityDropdowns();
        }
    });

    // ==========================================
    // FORM SUBMISSION (CREATE & UPDATE ENGINE)
    // ==========================================
    document.getElementById('createProjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn');
        const submitBtnText = document.getElementById('submitBtnText');
        const originalText = submitBtnText ? submitBtnText.textContent : 'Save Architecture';

        if (submitBtnText) submitBtnText.textContent = isEditMode ? 'Updating Architecture...' : 'Saving Architecture...';
        submitBtn.disabled = true;

        try {
            const photoFile = document.getElementById('project_photo').files[0];
            let photoUrl = existingPhotoUrl;
            if (photoFile) {
                photoUrl = await uploadToR2(photoFile, 'project-photos'); 
            }

            const chiefEngineer = document.getElementById('assigned_chief_engineer').value || null;
            const projectManager = document.getElementById('assigned_project_manager').value || null;
            const contractor = document.getElementById('assigned_contractor').value || null;
            const teamArray = [chiefEngineer, projectManager, contractor].filter(Boolean);

            const { data: { session } } = await supabase.auth.getSession();
            const createdBy = session ? session.user.id : null;

            const sqft = parseFloat(sqftInput.value) || 0;
            const rate = parseFloat(rateInput.value) || 0;

            const basePayload = {
                project_name: document.getElementById('project_name').value.trim(),
                project_type: projectTypeSelect.value,
                contract_type: document.getElementById('contract_type').value,
                status: document.getElementById('status').value,
                description: document.getElementById('description').value.trim(),
                rera_number: document.getElementById('rera_number').value.trim(),
                project_address: document.getElementById('project_address').value.trim(),
                map_link: document.getElementById('map_link').value.trim(),
                total_sqft: sqft,
                rate_per_sqft: rate,
                estimated_budget: sqft * rate,
                start_date: document.getElementById('start_date').value || null,
                target_end_date: document.getElementById('target_end_date').value || null,
                project_photo_url: photoUrl,
                project_team_array: teamArray
            };

            if (!isEditMode) {
                basePayload.project_code = document.getElementById('project_code').value;
                basePayload.created_by = createdBy;
            }

            const fullPayload = {
                ...basePayload,
                assigned_chief_engineer: chiefEngineer,
                assigned_project_manager: projectManager,
                assigned_contractor: contractor
            };

            let projectData = null;

            if (isEditMode) {
                // UPDATE EXISTING PROJECT
                let updateAttempt = await supabase.from('projects').update(fullPayload).eq('id', editProjectId).select().single();
                if (updateAttempt.error && (updateAttempt.error.code === '23503' || String(updateAttempt.error.message).includes('foreign key constraint'))) {
                    const fallbackPayload = {
                        ...basePayload,
                        assigned_chief_engineer: null,
                        assigned_project_manager: null,
                        assigned_contractor: null
                    };
                    updateAttempt = await supabase.from('projects').update(fallbackPayload).eq('id', editProjectId).select().single();
                }
                if (updateAttempt.error) throw updateAttempt.error;
                projectData = updateAttempt.data;

            } else {
                // INSERT NEW PROJECT
                let insertAttempt = await supabase.from('projects').insert([fullPayload]).select().single();
                if (insertAttempt.error && (insertAttempt.error.code === '23503' || String(insertAttempt.error.message).includes('foreign key constraint'))) {
                    const fallbackPayload = {
                        ...basePayload,
                        assigned_chief_engineer: null,
                        assigned_project_manager: null,
                        assigned_contractor: null
                    };
                    insertAttempt = await supabase.from('projects').insert([fallbackPayload]).select().single();
                }
                if (insertAttempt.error) throw insertAttempt.error;
                projectData = insertAttempt.data;
            }

            // 2. Prepare Zones & Inventory Units
            const zonesToInsert = [];
            const unitsToInsert = [];
            const cards = structureContainer.querySelectorAll('.structure-card');

            cards.forEach(card => {
                const structName = card.querySelector('.structure-name').value.trim();
                let cleanName = structName.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase().trim();
                let towerPrefix = cleanName.slice(0, 3);
                const tMatch = cleanName.match(/TOWER\s*([A-Z0-9])/);
                if (tMatch) towerPrefix = `T${tMatch[1]}`;
                
                if (card.classList.contains('ground-card')) {
                    const desc = card.querySelector('.ground-desc').value.trim();
                    const area = parseFloat(card.querySelector('.ground-area').value) || 0;
                    zonesToInsert.push({
                        project_id: projectData.id,
                        tower_name: structName,
                        floor_name: 'Ground',
                        zone_type: 'Common Zone',
                        total_flats: 0,
                        total_shops: 0,
                        amenity: desc || 'N.A.',
                        unit_configuration: { total_area: area }
                    });
                    return;
                }

                const isFacility = card.classList.contains('facility-card');
                const floorGroups = card.querySelectorAll('.floor-group');

                // AUTO-INJECT EXTERNAL TOWER ENVELOPE
                if (!isFacility) {
                    zonesToInsert.push({
                        project_id: projectData.id,
                        tower_name: structName,
                        floor_name: 'External Elevation',
                        zone_type: 'External Structure',
                        total_flats: 0,
                        total_shops: 0,
                        amenity: 'Exterior Plaster, Texture & Elevation Painting',
                        unit_configuration: { 
                            scope: 'External Wall Plaster, Waterproofing Primer, Texture, Apex Paint & Scaffolding',
                            zone_code: `${towerPrefix}-EXT-ELEV`
                        }
                    });
                }

                floorGroups.forEach(group => {
                    const floorName = group.querySelector('.floor-name-input').value.trim();
                    const amenity = group.querySelector('.amenity-display').value.trim() || 'N.A.';
                    const floorLevel = parseFloorLevel(floorName);
                    let zoneType = floorName.toLowerCase().includes('basement') ? 'Basement' : 'Floor';
                    
                    let flats = 0, shops = 0;
                    let configJSON = { amenities_sizes: {} };

                    group.querySelectorAll('.size-amenity').forEach(inp => {
                        configJSON.amenities_sizes[inp.getAttribute('data-amenity')] = parseFloat(inp.value) || 0;
                    });

                    if (isFacility) {
                        const roomInput = group.querySelector('.room-input').value.trim();
                        configJSON.rooms = {};
                        configJSON.custom_labels = roomInput;
                        group.querySelectorAll('.size-room').forEach(inp => {
                            configJSON.rooms[inp.getAttribute('data-room')] = parseFloat(inp.value) || 0;
                        });
                    } else {
                        flats = parseInt(group.querySelector('.flat-input').value) || 0;
                        shops = parseInt(group.querySelector('.shop-input').value) || 0;
                        configJSON.flats = [];
                        configJSON.shops = [];
                        configJSON.flat_typologies = [];
                        configJSON.flat_details = [];

                        const flatInputs = group.querySelectorAll('.size-flat');
                        const typologySelects = group.querySelectorAll('.select-typology');

                        for (let f = 1; f <= flats; f++) {
                            const flatSize = parseFloat(flatInputs[f - 1] ? flatInputs[f - 1].value : 0) || 0;
                            const assignedTypology = typologySelects[f - 1] ? typologySelects[f - 1].value : '2 BHK';
                            const activeInclusions = (typologyProfiles[assignedTypology] || []).filter(i => i.active);

                            configJSON.flats.push(flatSize);
                            configJSON.flat_typologies.push(assignedTypology);

                            let unitNum;
                            if (floorLevel === 0) unitNum = `G${String(f).padStart(2, '0')}`;
                            else if (floorLevel < 0) unitNum = `B${Math.abs(floorLevel)}${String(f).padStart(2, '0')}`;
                            else unitNum = `${floorLevel}${String(f).padStart(2, '0')}`;

                            const unitCode = `${towerPrefix}-Flat-${unitNum}`;

                            configJSON.flat_details.push({
                                unit_number: unitCode,
                                flat_number: unitNum,
                                sqft: flatSize,
                                typology: assignedTypology,
                                inclusions: activeInclusions
                            });

                            unitsToInsert.push({
                                project_id: projectData.id,
                                tower_block: structName,
                                floor_number: floorLevel,
                                unit_number: unitCode,
                                unit_type: assignedTypology,
                                carpet_area_sqft: flatSize,
                                status: 'available'
                            });
                        }

                        // Concrete Inventory Shops
                        const shopInputs = group.querySelectorAll('.size-shop');
                        for (let s = 1; s <= shops; s++) {
                            const shopSize = parseFloat(shopInputs[s - 1] ? shopInputs[s - 1].value : 0) || 0;
                            configJSON.shops.push(shopSize);

                            let unitNum;
                            if (floorLevel === 0) unitNum = `G${String(s).padStart(2, '0')}`;
                            else if (floorLevel < 0) unitNum = `B${Math.abs(floorLevel)}${String(s).padStart(2, '0')}`;
                            else unitNum = `${floorLevel}${String(s).padStart(2, '0')}`;

                            const shopCode = `${towerPrefix}-Shop-${unitNum}`;

                            unitsToInsert.push({
                                project_id: projectData.id,
                                tower_block: structName,
                                floor_number: floorLevel,
                                unit_number: shopCode,
                                unit_type: 'Shop',
                                carpet_area_sqft: shopSize,
                                status: 'available'
                            });
                        }
                    }

                    configJSON.typology_snapshot = typologyProfiles;

                    zonesToInsert.push({
                        project_id: projectData.id,
                        tower_name: structName,
                        floor_name: floorName,
                        zone_type: isFacility ? 'Facility' : zoneType,
                        total_flats: flats,
                        total_shops: shops,
                        amenity: amenity,
                        unit_configuration: configJSON
                    });
                });
            });

            // AUTO-INJECT EXTERNAL SITE INFRASTRUCTURE PACKAGE
            zonesToInsert.push({
                project_id: projectData.id,
                tower_name: 'Site Infrastructure',
                floor_name: 'Ground',
                zone_type: 'External Infrastructure',
                total_flats: 0,
                total_shops: 0,
                amenity: 'Boundary Wall, Main Gate, Storm Drainage & Paver Blocks',
                unit_configuration: { 
                    total_area: sqft,
                    scope: 'Compound Wall, Security Cabin, Main Gate, Sewage Pipeline, Internal Concrete Roads'
                }
            });

            // 3. Synchronize 'project_zones' in Supabase
            if (isEditMode) {
                await supabase.from('project_zones').delete().eq('project_id', projectData.id);
            }
            if (zonesToInsert.length > 0) {
                const { error: zoneError } = await supabase.from('project_zones').insert(zonesToInsert);
                if (zoneError) throw zoneError;
            }

            // 4. Synchronize 'project_units' in Supabase
            if (isEditMode) {
                await supabase.from('project_units').delete().eq('project_id', projectData.id);
            }
            if (unitsToInsert.length > 0) {
                const { error: unitError } = await supabase.from('project_units').insert(unitsToInsert);
                if (unitError) {
                    console.warn('[Project Architecture] Warning: Failed to populate project_units inventory:', unitError);
                }
            }

            // Sync Active Workspace
            if (localStorage.getItem('activeProjectId') === projectData.id || !isEditMode) {
                localStorage.setItem('activeProjectId', projectData.id);
                localStorage.setItem('activeProjectCode', projectData.project_code);
                localStorage.setItem('activeProjectName', projectData.project_name);
                window.dispatchEvent(new CustomEvent('prayosha:project-switched', { detail: projectData }));
                window.dispatchEvent(new CustomEvent('projectChanged', { 
                    detail: { projectId: projectData.id, projectName: projectData.project_name } 
                }));
            }

            showToast(isEditMode 
                ? `Project "${projectData.project_name}" updated successfully!` 
                : `Project "${projectData.project_name}" created with ${unitsToInsert.length} units!`, 
                'success'
            );

            setTimeout(() => {
                window.location.href = 'project-dashboard.html';
            }, 1200);

        } catch (error) {
            console.error('Error saving project:', error);
            showToast(`Saving error: ${error.message}`, 'error');
            if (submitBtnText) submitBtnText.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
});

// ==========================================
// EDIT MODE PRE-POPULATION ENGINE
// ==========================================
function setupEditModeUI() {
    const pageModeBadge = document.getElementById('pageModeBadge');
    const pageHeadingTitle = document.getElementById('pageHeadingTitle');
    const pageSubHeadingText = document.getElementById('pageSubHeadingText');
    const submitBtnText = document.getElementById('submitBtnText');
    const editProjectIdInput = document.getElementById('edit_project_id');

    if (pageModeBadge) pageModeBadge.textContent = 'Edit Project Mode';
    if (pageHeadingTitle) pageHeadingTitle.textContent = 'Edit Project Architecture';
    if (pageSubHeadingText) pageSubHeadingText.textContent = 'Modify metadata, financials, and structural floor/zone hierarchy';
    if (submitBtnText) submitBtnText.textContent = 'Update Project Architecture';
    if (editProjectIdInput) editProjectIdInput.value = editProjectId;
}

async function loadExistingProjectForEditing(projectId) {
    showToast('Loading existing project architecture...', 'info');

    try {
        // 1. Fetch Project Record
        const { data: project, error: projError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (projError) throw projError;
        if (!project) throw new Error('Project record not found');

        // Populate Form Fields
        document.getElementById('project_code').value = project.project_code || '';
        document.getElementById('project_name').value = project.project_name || '';
        document.getElementById('project_type').value = project.project_type || 'Residential';
        document.getElementById('contract_type').value = project.contract_type || 'Material Only';
        document.getElementById('status').value = project.status || 'Planning';
        document.getElementById('description').value = project.description || '';
        document.getElementById('rera_number').value = project.rera_number || '';
        document.getElementById('project_address').value = project.project_address || '';
        document.getElementById('map_link').value = project.map_link || '';

        document.getElementById('total_sqft').value = project.total_sqft || '';
        document.getElementById('rate_per_sqft').value = project.rate_per_sqft || '';
        document.getElementById('estimated_budget').value = `₹${Number(project.estimated_budget || 0).toLocaleString('en-IN')}`;

        if (project.start_date) {
            document.getElementById('start_date').value = project.start_date.split('T')[0];
        }
        if (project.target_end_date || project.target_date) {
            const tDate = project.target_end_date || project.target_date;
            document.getElementById('target_end_date').value = tDate.split('T')[0];
        }

        // Project Photo Preview
        if (project.project_photo_url) {
            existingPhotoUrl = project.project_photo_url;
            const photoCont = document.getElementById('currentPhotoContainer');
            const photoPreview = document.getElementById('currentPhotoPreview');
            const photoLink = document.getElementById('currentPhotoLink');

            if (photoCont && photoPreview && photoLink) {
                photoPreview.src = existingPhotoUrl;
                photoLink.href = existingPhotoUrl;
                photoCont.classList.remove('hidden');
            }
        }

        // Assigned Staff / Team
        if (project.assigned_chief_engineer) {
            document.getElementById('assigned_chief_engineer').value = project.assigned_chief_engineer;
        }
        if (project.assigned_project_manager) {
            document.getElementById('assigned_project_manager').value = project.assigned_project_manager;
        }
        if (project.assigned_contractor) {
            document.getElementById('assigned_contractor').value = project.assigned_contractor;
        }

        // 2. Fetch Project Zones
        const { data: zones, error: zoneError } = await supabase
            .from('project_zones')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

        if (zoneError) throw zoneError;

        if (zones && zones.length > 0) {
            reconstructStructureBuilderFromZones(zones);
        }

        showToast('Project architecture loaded for editing', 'success');

    } catch (err) {
        console.error('Failed to load project details:', err);
        showToast(`Could not load project: ${err.message}`, 'error');
    }
}

// ----------------------------------------------------
// DYNAMIC STRUCTURE RECONSTRUCTION ENGINE
// ----------------------------------------------------
function reconstructStructureBuilderFromZones(zones) {
    const structureContainer = document.getElementById('structureContainer');
    structureContainer.innerHTML = ''; // Clear default container

    // Filter out synthetic envelope packages
    const activeZones = zones.filter(z => 
        z.zone_type !== 'External Structure' && 
        z.zone_type !== 'External Infrastructure' &&
        z.tower_name !== 'Site Infrastructure' &&
        z.floor_name !== 'External Elevation'
    );

    // Group zones by structure/tower name
    const structuresMap = {};
    activeZones.forEach(zone => {
        const name = zone.tower_name || 'Tower A';
        if (!structuresMap[name]) structuresMap[name] = [];
        structuresMap[name].push(zone);
    });

    const { showFlats, showShops } = getColumnVisibility();

    Object.keys(structuresMap).forEach(structureName => {
        const structureZones = structuresMap[structureName];
        const isGroundZone = structureZones.some(z => z.zone_type === 'Common Zone');
        const isFacility = structureZones.some(z => z.zone_type === 'Facility');

        if (isGroundZone) {
            // Reconstruct Ground Card
            const gz = structureZones[0];
            const area = gz.unit_configuration?.total_area || 0;
            const desc = (gz.amenity && gz.amenity !== 'N.A.') ? gz.amenity : '';

            const html = `
                <div class="structure-card ground-card p-4 rounded-xl shadow-sm border border-gray-200 relative mb-4">
                    <div class="flex justify-between items-center mb-4">
                        <div class="flex items-center gap-2 w-1/2">
                            <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            <input type="text" class="structure-name font-bold text-lg text-emerald-900 bg-transparent border-b border-dashed border-gray-400 focus:outline-none w-full" value="${structureName}" title="Rename Zone">
                        </div>
                        <button type="button" class="btn-delete-structure text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition">Delete</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3 border border-gray-100 rounded-lg">
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Description / Features</label>
                            <input type="text" class="input-field text-sm ground-desc" value="${desc}" placeholder="e.g. Landscaping, Walkways">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Total Area (Sq.Ft)</label>
                            <input type="number" class="input-field text-sm ground-area" value="${area}" placeholder="0">
                        </div>
                    </div>
                </div>
            `;
            structureContainer.insertAdjacentHTML('beforeend', html);

        } else if (isFacility) {
            // Reconstruct Facility Card
            facilityCount++;
            const cardId = `facility-${Date.now()}-${facilityCount}`;
            const html = `
                <div id="${cardId}" class="structure-card facility-card p-4 rounded-xl shadow-sm border border-gray-200 relative mb-4">
                    <div class="flex justify-between items-center mb-4">
                        <input type="text" class="structure-name font-bold text-lg text-indigo-900 bg-transparent border-b border-dashed border-gray-400 focus:outline-none w-1/2" value="${structureName}" title="Rename Facility">
                        <div class="flex gap-2">
                            <button type="button" class="btn-add-basement text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">+ Add Basement</button>
                            <button type="button" class="btn-add-floor text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition">+ Add Floor</button>
                            <button type="button" class="btn-delete-structure text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition ml-2">Delete</button>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase border-b pb-2 mb-2 px-2">
                        <div class="col-span-3">Floor / Level</div>
                        <div class="col-span-4">Custom Rooms / Zones (Comma separated)</div>
                        <div class="col-span-3">Amenities</div>
                        <div class="col-span-2 text-right">Actions</div>
                    </div>

                    <div class="floors-container space-y-3"></div>
                </div>
            `;
            structureContainer.insertAdjacentHTML('beforeend', html);
            const cardEl = document.getElementById(cardId);
            const floorsCont = cardEl.querySelector('.floors-container');

            structureZones.forEach(z => {
                const floorHTML = generateFacilityFloorHTML(z.floor_name);
                floorsCont.insertAdjacentHTML('beforeend', floorHTML);
                const floorGroup = floorsCont.lastElementChild;

                const customRooms = z.unit_configuration?.custom_labels || (z.unit_configuration?.rooms ? Object.keys(z.unit_configuration.rooms).join(', ') : '');
                floorGroup.querySelector('.room-input').value = customRooms;

                const amenityStr = (z.amenity && z.amenity !== 'N.A.') ? z.amenity : '';
                floorGroup.querySelector('.amenity-display').value = amenityStr;

                // Sync checkboxes
                if (amenityStr) {
                    const checkedList = amenityStr.split(',').map(a => a.trim());
                    floorGroup.querySelectorAll('.amenity-cb').forEach(cb => {
                        if (checkedList.includes(cb.value)) cb.checked = true;
                    });
                }

                updateFacilitySizingPanel(floorGroup);

                // Populate room and amenity sizes
                if (z.unit_configuration?.rooms) {
                    Object.entries(z.unit_configuration.rooms).forEach(([room, size]) => {
                        const inp = floorGroup.querySelector(`.size-room[data-room="${room}"]`);
                        if (inp) inp.value = size;
                    });
                }
                if (z.unit_configuration?.amenities_sizes) {
                    Object.entries(z.unit_configuration.amenities_sizes).forEach(([amenity, size]) => {
                        const inp = floorGroup.querySelector(`.size-amenity[data-amenity="${amenity}"]`);
                        if (inp) inp.value = size;
                    });
                }
            });

        } else {
            // Reconstruct Tower Block
            towerCount++;
            const cardId = `tower-${Date.now()}-${towerCount}`;
            const html = `
                <div id="${cardId}" class="structure-card tower-card p-4 rounded-xl shadow-sm border border-gray-200 relative mb-4">
                    <div class="flex flex-wrap justify-between items-center gap-2 mb-4">
                        <input type="text" class="structure-name font-bold text-lg prayosha-navy bg-transparent border-b border-dashed border-gray-400 focus:outline-none w-full sm:w-1/3" value="${structureName}" title="Rename Block">
                        <div class="flex flex-wrap gap-2">
                            <button type="button" class="btn-add-basement text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">+ Add Basement</button>
                            <button type="button" class="btn-add-floor text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition">+ Add Floor</button>
                            <button type="button" class="btn-clone-tower text-xs bg-brand-amber/20 text-brand-navy border border-brand-amber px-3 py-1.5 rounded-lg hover:bg-brand-amber hover:text-white transition font-semibold" title="Clone Entire Tower Setup">⧉ Clone Tower</button>
                            <button type="button" class="btn-delete-structure text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200 transition ml-2">Delete</button>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase border-b pb-2 mb-2 px-2">
                        <div class="col-span-3">Floor / Level</div>
                        <div class="col-span-2 col-flats" style="display: ${showFlats ? 'block' : 'none'}">Total Flats</div>
                        <div class="col-span-2 col-shops" style="display: ${showShops ? 'block' : 'none'}">Total Shops</div>
                        <div class="col-span-3">Amenities</div>
                        <div class="col-span-2 text-right">Actions</div>
                    </div>

                    <div class="floors-container space-y-3"></div>
                </div>
            `;
            structureContainer.insertAdjacentHTML('beforeend', html);
            const cardEl = document.getElementById(cardId);
            const floorsCont = cardEl.querySelector('.floors-container');

            structureZones.forEach(z => {
                const isBasement = (z.zone_type === 'Basement' || z.floor_name.toLowerCase().includes('basement'));
                const floorHTML = generateTowerFloorHTML(z.floor_name, showFlats, showShops, isBasement);
                floorsCont.insertAdjacentHTML('beforeend', floorHTML);
                const floorGroup = floorsCont.lastElementChild;

                floorGroup.querySelector('.flat-input').value = z.total_flats || 0;
                floorGroup.querySelector('.shop-input').value = z.total_shops || 0;

                const amenityStr = (z.amenity && z.amenity !== 'N.A.') ? z.amenity : '';
                floorGroup.querySelector('.amenity-display').value = amenityStr;

                if (amenityStr) {
                    const checkedList = amenityStr.split(',').map(a => a.trim());
                    floorGroup.querySelectorAll('.amenity-cb').forEach(cb => {
                        if (checkedList.includes(cb.value)) cb.checked = true;
                    });
                }

                // Render Sizing & Typology Panel
                updateTowerSizingPanel(floorGroup);

                // Populate flat sizes and typology dropdowns
                const config = z.unit_configuration || {};
                const flatInputs = floorGroup.querySelectorAll('.size-flat');
                const typologySelects = floorGroup.querySelectorAll('.select-typology');

                if (config.flats && config.flats.length > 0) {
                    config.flats.forEach((size, idx) => {
                        if (flatInputs[idx]) flatInputs[idx].value = size;
                    });
                }

                if (config.flat_typologies && config.flat_typologies.length > 0) {
                    config.flat_typologies.forEach((typ, idx) => {
                        if (typologySelects[idx]) typologySelects[idx].value = typ;
                    });
                } else if (config.flat_details && config.flat_details.length > 0) {
                    config.flat_details.forEach((det, idx) => {
                        if (typologySelects[idx] && det.typology) typologySelects[idx].value = det.typology;
                    });
                }

                // Populate shop sizes
                const shopInputs = floorGroup.querySelectorAll('.size-shop');
                if (config.shops && config.shops.length > 0) {
                    config.shops.forEach((size, idx) => {
                        if (shopInputs[idx]) shopInputs[idx].value = size;
                    });
                }

                // Populate amenity sizes
                if (config.amenities_sizes) {
                    Object.entries(config.amenities_sizes).forEach(([amenity, size]) => {
                        const inp = floorGroup.querySelector(`.size-amenity[data-amenity="${amenity}"]`);
                        if (inp) inp.value = size;
                    });
                }
            });
        }
    });
}

// ==========================================
// FLOOR GENERATION TEMPLATES & HELPERS
// ==========================================
function getColumnVisibility() {
    const projectTypeSelect = document.getElementById('project_type');
    const type = projectTypeSelect ? (projectTypeSelect.value || '') : '';
    return { 
        showFlats: type.includes('Residential'), 
        showShops: type.includes('Commercial') 
    };
}

function getNextFloorName(container) {
    const existing = Array.from(container.querySelectorAll('.floor-name-input'))
        .map(inp => inp.value).filter(val => !val.toLowerCase().includes('basement'));
    if (existing.length === 0) return 'Ground Floor';
    if (existing.length === 1) return '1st Floor';
    if (existing.length === 2) return '2nd Floor';
    if (existing.length === 3) return '3rd Floor';
    return `${existing.length}th Floor`;
}

function getNextBasementName(container) {
    const existing = Array.from(container.querySelectorAll('.floor-name-input'))
        .map(inp => inp.value).filter(val => val.toLowerCase().includes('basement'));
    return `Basement ${existing.length + 1}`;
}

function generateTowerFloorHTML(name, showFlats, showShops, isBasement = false) {
    const disabled = isBasement ? 'disabled' : '';
    const bg = isBasement ? 'bg-gray-100 cursor-not-allowed text-gray-400' : 'bg-white';
    return `
        <div class="floor-group">
            <div class="floor-row grid grid-cols-12 gap-2 items-center bg-white p-2 border border-gray-200 rounded shadow-sm relative">
                <div class="col-span-3"><input type="text" class="input-field text-sm p-1 floor-name-input font-medium" value="${name}"></div>
                <div class="col-span-2 col-flats" style="display: ${showFlats ? 'block' : 'none'}">
                    <input type="number" class="input-field text-sm p-1 flat-input trigger-sizing ${bg}" value="0" min="0" ${disabled}>
                </div>
                <div class="col-span-2 col-shops" style="display: ${showShops ? 'block' : 'none'}">
                    <input type="number" class="input-field text-sm p-1 shop-input trigger-sizing ${bg}" value="0" min="0" ${disabled}>
                </div>
                ${generateAmenityDropdown()}
                <div class="col-span-2 flex justify-end gap-1">
                    <button type="button" class="btn-copy-floor text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200">Copy</button>
                    <button type="button" class="btn-remove-floor text-xs bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100 border border-red-200">X</button>
                </div>
            </div>
        </div>
    `;
}

function generateFacilityFloorHTML(name) {
    return `
        <div class="floor-group">
            <div class="floor-row grid grid-cols-12 gap-2 items-center bg-white p-2 border border-gray-200 rounded shadow-sm relative">
                <div class="col-span-3"><input type="text" class="input-field text-sm p-1 floor-name-input font-medium" value="${name}"></div>
                <div class="col-span-4">
                    <input type="text" class="input-field text-sm p-1 room-input trigger-facility-sizing" placeholder="e.g. Reception, Gym, Spa">
                </div>
                ${generateAmenityDropdown()}
                <div class="col-span-2 flex justify-end gap-1">
                    <button type="button" class="btn-copy-floor text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200">Copy</button>
                    <button type="button" class="btn-remove-floor text-xs bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100 border border-red-200">X</button>
                </div>
            </div>
        </div>
    `;
}

function updateTowerSizingPanel(floorGroup) {
    const floorRow = floorGroup.querySelector('.floor-row');
    const floorName = floorRow.querySelector('.floor-name-input').value.trim();
    const floorLevel = parseFloorLevel(floorName);
    
    const flats = parseInt(floorRow.querySelector('.flat-input').value) || 0;
    const shops = parseInt(floorRow.querySelector('.shop-input').value) || 0;
    const amenityStr = floorRow.querySelector('.amenity-display').value;
    const amenities = amenityStr.split(',').map(a => a.trim()).filter(Boolean);
    
    let existingFlats = [], existingTypologies = [], existingShops = [], existingAmenities = {};
    const existingPanel = floorGroup.querySelector('.sizing-panel');
    if (existingPanel) {
        existingPanel.querySelectorAll('.size-flat').forEach(i => existingFlats.push(i.value));
        existingPanel.querySelectorAll('.select-typology').forEach(s => existingTypologies.push(s.value));
        existingPanel.querySelectorAll('.size-shop').forEach(i => existingShops.push(i.value));
        existingPanel.querySelectorAll('.size-amenity').forEach(i => existingAmenities[i.getAttribute('data-amenity')] = i.value);
        existingPanel.remove();
    }

    if (flats === 0 && shops === 0 && amenities.length === 0) {
        floorRow.classList.add('rounded');
        floorRow.classList.remove('rounded-t-lg', 'border-b-0');
        return; 
    }

    floorRow.classList.remove('rounded');
    floorRow.classList.add('rounded-t-lg', 'border-b-0');

    let html = `<div class="sizing-panel bg-slate-50/90 p-3.5 rounded-b-xl border-x border-b border-gray-200 mb-2 grid grid-cols-1 gap-4 shadow-inner">`;
    
    if (flats > 0) {
        html += `<div class="bg-white p-3 rounded-xl border border-gray-200">
                    <div class="flex justify-between items-center mb-2.5">
                        <div>
                            <span class="text-xs font-bold text-brand-navy uppercase tracking-wide">Flats Configuration & Typologies</span>
                            <span class="text-[10px] text-slate-400 ml-2">(Auto-adjusts typology based on Carpet Sq.Ft)</span>
                        </div>
                        <button type="button" class="btn-apply-all-flats text-[10px] bg-brand-navy/10 text-brand-navy px-2.5 py-1 rounded-lg hover:bg-brand-navy hover:text-white transition font-bold">
                            Apply First Flat to All
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">`;

        for (let i = 1; i <= flats; i++) {
            const val = existingFlats[i - 1] || '';
            const selectedTypology = existingTypologies[i - 1] || (parseFloat(val) >= 1800 ? '4 BHK' : (parseFloat(val) >= 1200 ? '3 BHK' : '2 BHK'));

            let unitNum;
            if (floorLevel === 0) unitNum = `G${String(i).padStart(2, '0')}`;
            else if (floorLevel < 0) unitNum = `B${Math.abs(floorLevel)}${String(i).padStart(2, '0')}`;
            else unitNum = `${floorLevel}${String(i).padStart(2, '0')}`;

            html += `
                <div class="flat-unit-card bg-slate-50 p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
                    <div class="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1.5">
                        <span class="text-brand-navy">Flat ${unitNum}</span>
                        <span class="text-[9px] font-semibold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100">Unit ${i}</span>
                    </div>
                    <div class="flex gap-1.5">
                        <input type="number" class="input-field text-xs p-1.5 size-flat border-gray-300 w-1/2 bg-white" placeholder="Sq.Ft" value="${val}" data-flat-idx="${i}">
                        <select class="input-field text-xs p-1.5 select-typology border-gray-300 w-1/2 cursor-pointer bg-white font-medium" data-flat-idx="${i}">
                            <option value="1 BHK" ${selectedTypology === '1 BHK' ? 'selected' : ''}>1 BHK</option>
                            <option value="2 BHK" ${selectedTypology === '2 BHK' ? 'selected' : ''}>2 BHK</option>
                            <option value="3 BHK" ${selectedTypology === '3 BHK' ? 'selected' : ''}>3 BHK</option>
                            <option value="4 BHK" ${selectedTypology === '4 BHK' ? 'selected' : ''}>4 BHK</option>
                            <option value="Penthouse" ${selectedTypology === 'Penthouse' ? 'selected' : ''}>Penthouse</option>
                        </select>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    
    if (shops > 0) {
        html += `<div class="bg-white p-3 rounded-xl border border-gray-200">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-gray-700 uppercase">Commercial Shop Sizes (Sq.Ft)</span>
                        <button type="button" class="btn-apply-all text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-100 font-semibold" data-target=".size-shop">Apply First to All</button>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">`;
        for (let i = 1; i <= shops; i++) {
            const val = existingShops[i - 1] || '';
            let unitNum;
            if (floorLevel === 0) unitNum = `G${String(i).padStart(2, '0')}`;
            else if (floorLevel < 0) unitNum = `B${Math.abs(floorLevel)}${String(i).padStart(2, '0')}`;
            else unitNum = `${floorLevel}${String(i).padStart(2, '0')}`;

            html += `<div>
                        <label class="block text-[10px] font-bold text-slate-500 mb-0.5">Shop ${unitNum}</label>
                        <input type="number" class="input-field text-xs p-1.5 size-shop border-gray-300 bg-white" placeholder="Sq.Ft" value="${val}">
                     </div>`;
        }
        html += `</div></div>`;
    }

    if (amenities.length > 0) {
        html += `<div class="bg-white p-3 rounded-xl border border-gray-200">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-emerald-700 uppercase">Amenity Area Sizes (Sq.Ft)</span>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">`;
        amenities.forEach(amenity => {
            const val = existingAmenities[amenity] || '';
            html += `<div>
                        <label class="block text-[10px] text-gray-500 mb-1 truncate">${amenity}</label>
                        <input type="number" class="input-field text-xs p-1.5 size-amenity border-gray-300 bg-white" data-amenity="${amenity}" placeholder="Sq.Ft" value="${val}">
                     </div>`;
        });
        html += `</div></div>`;
    }

    html += `</div>`;
    floorGroup.insertAdjacentHTML('beforeend', html);
}

function updateFacilitySizingPanel(floorGroup) {
    const floorRow = floorGroup.querySelector('.floor-row');
    const roomStr = floorRow.querySelector('.room-input').value;
    const rooms = roomStr.split(',').map(r => r.trim()).filter(Boolean);
    const amenityStr = floorRow.querySelector('.amenity-display').value;
    const amenities = amenityStr.split(',').map(a => a.trim()).filter(Boolean);

    let existingMap = {};
    const existingPanel = floorGroup.querySelector('.sizing-panel');
    if (existingPanel) {
        existingPanel.querySelectorAll('.size-room, .size-amenity').forEach(i => {
            const key = i.getAttribute('data-room') || i.getAttribute('data-amenity');
            existingMap[key] = i.value;
        });
        existingPanel.remove();
    }

    if (rooms.length === 0 && amenities.length === 0) {
        floorRow.classList.add('rounded');
        floorRow.classList.remove('rounded-t-lg', 'border-b-0');
        return;
    }

    floorRow.classList.remove('rounded');
    floorRow.classList.add('rounded-t-lg', 'border-b-0');

    let html = `<div class="sizing-panel bg-indigo-50/50 p-3 rounded-b-lg border-x border-b border-gray-200 mb-2">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-bold text-indigo-800 uppercase">Room & Amenity Sizes (Sq.Ft)</span>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">`;
    
    rooms.forEach(room => {
        const val = existingMap[room] || '';
        html += `<div>
                    <label class="block text-[10px] text-gray-500 mb-1 truncate">${room}</label>
                    <input type="number" class="input-field text-xs p-1 size-room border-gray-300 bg-white" data-room="${room}" placeholder="Sq.Ft" value="${val}">
                 </div>`;
    });

    amenities.forEach(amenity => {
        const val = existingMap[amenity] || '';
        html += `<div>
                    <label class="block text-[10px] text-emerald-700 font-semibold mb-1 truncate">${amenity}</label>
                    <input type="number" class="input-field text-xs p-1 size-amenity border-gray-300 bg-white" data-amenity="${amenity}" placeholder="Sq.Ft" value="${val}">
                 </div>`;
    });
    
    html += `</div></div>`;
    floorGroup.insertAdjacentHTML('beforeend', html);
}

function generateAmenityDropdown() {
    let optionsHTML = globalAmenities.map(amenity => 
        `<label class="flex items-center text-xs mb-1 p-1 hover:bg-gray-50 rounded cursor-pointer">
            <input type="checkbox" value="${amenity}" class="mr-2 amenity-cb"> ${amenity}
        </label>`
    ).join('');

    return `
        <div class="col-span-3 relative multi-select-wrapper">
            <input type="text" class="input-field text-sm p-1 amenity-display cursor-pointer bg-white" readonly placeholder="Click to select..." value="">
            <div class="absolute z-50 hidden bg-white border border-gray-200 shadow-2xl rounded mt-1 w-full p-2 options-container custom-scroll">
                <div class="amenity-list-container max-h-32 overflow-y-auto">
                    ${optionsHTML}
                </div>
                <div class="border-t border-gray-200 mt-2 pt-2 flex gap-1">
                    <input type="text" class="input-field text-[10px] p-1 flex-1 custom-amenity-input" placeholder="New amenity...">
                    <button type="button" class="btn-add-custom-amenity bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] hover:bg-emerald-200 font-bold">+</button>
                </div>
            </div>
        </div>`;
}

function closeAllAmenityDropdowns() {
    document.querySelectorAll('.options-container').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.floor-row.dropdown-active').forEach(r => r.classList.remove('dropdown-active'));
    document.querySelectorAll('.floor-group.dropdown-active').forEach(g => g.classList.remove('dropdown-active'));
}

function parseFloorLevel(name) {
    if (!name) return 0;
    const lower = name.toLowerCase().trim();
    if (lower.includes('basement')) {
        const num = parseInt(lower.replace(/\D/g, '')) || 1;
        return -num;
    }
    if (lower.includes('ground') || lower === '0' || lower === 'g' || lower === 'gf') {
        return 0;
    }
    const num = parseInt(lower.replace(/\D/g, ''));
    return isNaN(num) ? 0 : num;
}

// ==========================================
// MASTER TYPOLOGY INCLUSIONS CONTROLLER
// ==========================================
function initTypologyModal() {
    const modal = document.getElementById('inclusionsModal');
    const openBtn = document.getElementById('addFlatInclusionsBtn');
    const closeBtn = document.getElementById('closeInclusionsBtn');
    const cancelBtn = document.getElementById('cancelInclusionsBtn');
    const saveBtn = document.getElementById('saveInclusionsBtn');
    const addRowBtn = document.getElementById('addNewInclusionBtn');
    const listContainer = document.getElementById('inclusionsList');
    const activeLabel = document.getElementById('activeTypologyLabel');
    const tabButtons = document.querySelectorAll('.typology-tab-btn');

    if (!modal || !openBtn) return;

    const renderActiveTypologyList = () => {
        if (!typologyProfiles[activeTypologyTab]) {
            typologyProfiles[activeTypologyTab] = [];
        }

        if (activeLabel) {
            activeLabel.textContent = `Configuring ${activeTypologyTab} Inclusions`;
        }

        tabButtons.forEach(btn => {
            const isMatch = btn.getAttribute('data-typology') === activeTypologyTab;
            if (isMatch) {
                btn.className = 'typology-tab-btn px-4 py-2 text-xs font-bold rounded-t-xl transition bg-white text-brand-navy border-t-2 border-brand-amber shadow-2xs';
            } else {
                btn.className = 'typology-tab-btn px-4 py-2 text-xs font-bold rounded-t-xl transition text-slate-600 hover:text-brand-navy hover:bg-white/60';
            }
        });

        listContainer.innerHTML = '';
        typologyProfiles[activeTypologyTab].forEach((inc, index) => {
            const row = document.createElement('div');
            row.className = 'grid grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-gray-200 shadow-2xs';
            row.innerHTML = `
                <div class="col-span-2">
                    <input type="text" class="input-field text-xs p-1.5 font-bold inc-code uppercase bg-slate-50 text-slate-600" value="${inc.code || ''}" placeholder="CODE">
                </div>
                <div class="col-span-5">
                    <input type="text" class="input-field text-xs p-1.5 font-semibold inc-name" value="${inc.name || ''}" placeholder="e.g. Master Bedroom">
                </div>
                <div class="col-span-4">
                    <input type="text" class="input-field text-xs p-1.5 inc-name-gu text-slate-600" value="${inc.name_gu || ''}" placeholder="દા.ત. માસ્ટર બેડરૂમ">
                </div>
                <div class="col-span-1 flex items-center justify-center gap-1.5">
                    <input type="checkbox" class="inc-active accent-brand-navy w-4 h-4 cursor-pointer" ${inc.active ? 'checked' : ''} title="Include in Sub-Zone Generation">
                </div>
            `;
            listContainer.appendChild(row);
        });
    };

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            saveCurrentTypologyFromDOM();
            activeTypologyTab = btn.getAttribute('data-typology');
            renderActiveTypologyList();
        });
    });

    const saveCurrentTypologyFromDOM = () => {
        const rows = listContainer.querySelectorAll('.grid');
        const updated = [];
        rows.forEach(r => {
            const code = r.querySelector('.inc-code').value.trim();
            const name = r.querySelector('.inc-name').value.trim();
            const name_gu = r.querySelector('.inc-name-gu').value.trim();
            const active = r.querySelector('.inc-active').checked;
            if (name) {
                updated.push({
                    code: code || name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase(),
                    name,
                    name_gu,
                    active
                });
            }
        });
        typologyProfiles[activeTypologyTab] = updated;
    };

    openBtn.addEventListener('click', () => {
        renderActiveTypologyList();
        modal.classList.remove('hidden');
    });

    const closeModal = () => modal.classList.add('hidden');
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    addRowBtn.addEventListener('click', () => {
        typologyProfiles[activeTypologyTab].push({
            code: `RM${typologyProfiles[activeTypologyTab].length + 1}`,
            name: 'New Custom Room',
            name_gu: '',
            active: true
        });
        renderActiveTypologyList();
    });

    saveBtn.addEventListener('click', () => {
        saveCurrentTypologyFromDOM();
        closeModal();
        showToast('All Typology Profiles saved! Dynamic floor plates will apply these presets.', 'success');
    });
}

async function loadCustomDropdownValues() {
    try {
        const { data, error } = await supabase.from('dropdown_values').select('*');
        if (error || !data) return;
        
        data.forEach(item => {
            if (item.category === 'amenity') {
                if (!globalAmenities.includes(item.value)) globalAmenities.push(item.value);
            } else {
                const select = document.getElementById(item.category);
                if (select) {
                    const opt = document.createElement('option');
                    opt.value = item.value;
                    opt.textContent = item.value;
                    select.insertBefore(opt, select.lastElementChild);
                }
            }
        });
    } catch (err) {
        console.warn('Could not load custom dropdowns:', err);
    }
}

async function generateNextProjectCode() {
    try {
        const { count, error } = await supabase.from('projects').select('*', { count: 'exact', head: true });
        if (error) throw error;
        document.getElementById('project_code').value = `PRSG-${((count || 0) + 1).toString().padStart(3, '0')}`;
    } catch (error) {
        document.getElementById('project_code').value = `PRSG-001`;
    }
}

async function loadEmployeeDropdowns() {
    try {
        const eD = document.getElementById('assigned_chief_engineer');
        const mD = document.getElementById('assigned_project_manager');
        const cD = document.getElementById('assigned_contractor');

        if (!eD || !mD || !cD) return;

        eD.innerHTML = '<option value="">-- Assign Engineer --</option>';
        mD.innerHTML = '<option value="">-- Assign Manager --</option>';
        cD.innerHTML = '<option value="">-- Assign Contractor --</option>';

        const { data: staffList, error: staffError } = await supabase
            .from('user_roles')
            .select('id, display_name, username, role')
            .order('display_name', { ascending: true });

        if (staffError) {
            console.warn('[Project Setup] Could not load staff from user_roles:', staffError);
        }

        const { data: vendorList, error: vendorError } = await supabase
            .from('vendors')
            .select('id, name, trade_name, category, status')
            .order('name', { ascending: true });

        if (vendorError) {
            console.warn('[Project Setup] Could not load contractors from vendors:', vendorError);
        }

        if (staffList && staffList.length > 0) {
            staffList.forEach(u => {
                const name = u.display_name || u.username || 'Staff';
                const role = u.role || 'Member';
                const label = `${name} (${role})`;

                if (
                    role.includes('Engineer') || 
                    role.includes('Construction Head') || 
                    role.includes('Supervisor') || 
                    role.includes('Owner')
                ) {
                    eD.add(new Option(label, u.id));
                }

                if (
                    role.includes('Manager') || 
                    role.includes('Construction Head') || 
                    role.includes('Owner')
                ) {
                    mD.add(new Option(label, u.id));
                }

                if (role.includes('Contractor') || role.includes('Agency')) {
                    cD.add(new Option(label, u.id));
                }
            });
        }

        if (vendorList && vendorList.length > 0) {
            const contractors = vendorList.filter(v => 
                v.status !== 'Blacklisted' && 
                (
                    v.category === 'Labor Contractor' || 
                    v.category === 'Equipment Rental' || 
                    v.category === 'Consultant Agency' ||
                    !v.category ||
                    v.category.toLowerCase().includes('contractor') ||
                    v.category.toLowerCase().includes('agency')
                )
            );

            const displayList = contractors.length > 0 ? contractors : vendorList;

            displayList.forEach(v => {
                const firmName = v.name || v.trade_name || 'Agency';
                const categoryTag = v.category ? ` [${v.category}]` : '';
                cD.add(new Option(`${firmName}${categoryTag}`, v.id));
            });
        }

    } catch (e) {
        console.error('[Project Setup] Exception loading employee and contractor dropdowns:', e);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

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
        : 'bg-amber-400';

    toast.className = `glass-card pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold transform transition-all duration-300 translate-y-4 opacity-0 ${bgClass}`;
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