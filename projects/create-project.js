import { supabase, uploadToR2 } from '../config.js';

let globalAmenities = ['Gym', 'Swimming Pool', 'Yoga', 'Clubhouse', 'Garden', 'Play Area'];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Role-Based Access Guard
    const userRole = localStorage.getItem('userRole');
    if (userRole && userRole !== 'Owner' && userRole !== 'General Manager') {
        showToast('Access restricted: Only Owners and General Managers can create projects.', 'error');
        setTimeout(() => {
            window.location.href = 'project-dashboard.html';
        }, 1200);
        return;
    }

    // 2. Initial Data Loading
    await generateNextProjectCode();
    await loadEmployeeDropdowns();
    await loadCustomDropdownValues();

    // 3. Dynamic Custom Option Registration
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

    // 4. Auto Budget Calculation
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
    // UNIFIED STRUCTURE BUILDER
    // ==========================================
    const projectTypeSelect = document.getElementById('project_type');
    const structureContainer = document.getElementById('structureContainer');
    
    let towerCount = 0;
    let facilityCount = 0;

    const getColumnVisibility = () => {
        const type = projectTypeSelect.value || '';
        return { 
            showFlats: type.includes('Residential'), 
            showShops: type.includes('Commercial') 
        };
    };

    projectTypeSelect.addEventListener('change', () => {
        if (projectTypeSelect.value !== '_ADD_NEW_') {
            const { showFlats, showShops } = getColumnVisibility();
            document.querySelectorAll('.col-flats').forEach(el => el.style.display = showFlats ? 'block' : 'none');
            document.querySelectorAll('.col-shops').forEach(el => el.style.display = showShops ? 'block' : 'none');
        }
    });

    // Floor Naming Helpers
    const getNextFloorName = (container) => {
        const existing = Array.from(container.querySelectorAll('.floor-name-input'))
            .map(inp => inp.value).filter(val => !val.toLowerCase().includes('basement'));
        if (existing.length === 0) return 'Ground Floor';
        if (existing.length === 1) return '1st Floor';
        if (existing.length === 2) return '2nd Floor';
        if (existing.length === 3) return '3rd Floor';
        return `${existing.length}th Floor`;
    };

    const getNextBasementName = (container) => {
        const existing = Array.from(container.querySelectorAll('.floor-name-input'))
            .map(inp => inp.value).filter(val => val.toLowerCase().includes('basement'));
        return `Basement ${existing.length + 1}`;
    };

    // ----------------------------------------------------
    // TEMPLATE 1: TOWER BLOCK
    // ----------------------------------------------------
    document.getElementById('addTowerBtn').addEventListener('click', () => {
        towerCount++;
        const towerName = `Tower ${String.fromCharCode(64 + towerCount)}`; 
        const { showFlats, showShops } = getColumnVisibility();

        const html = `
            <div class="structure-card tower-card p-4 rounded-xl shadow-sm border border-gray-200 relative mb-4">
                <div class="flex justify-between items-center mb-4">
                    <input type="text" class="structure-name font-bold text-lg prayosha-navy bg-transparent border-b border-dashed border-gray-400 focus:outline-none w-1/2" value="${towerName}" title="Rename Block">
                    <div class="flex gap-2">
                        <button type="button" class="btn-add-basement text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 transition">+ Add Basement</button>
                        <button type="button" class="btn-add-floor text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition">+ Add Floor</button>
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

    // ----------------------------------------------------
    // TEMPLATE 2: MULTI-LEVEL FACILITY (CLUBHOUSE)
    // ----------------------------------------------------
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

    // ----------------------------------------------------
    // TEMPLATE 3: FLAT GROUND ZONE
    // ----------------------------------------------------
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

    // ----------------------------------------------------
    // SIZING PANELS
    // ----------------------------------------------------
    function updateTowerSizingPanel(floorGroup) {
        const floorRow = floorGroup.querySelector('.floor-row');
        const flats = parseInt(floorRow.querySelector('.flat-input').value) || 0;
        const shops = parseInt(floorRow.querySelector('.shop-input').value) || 0;
        const amenityStr = floorRow.querySelector('.amenity-display').value;
        const amenities = amenityStr.split(',').map(a => a.trim()).filter(Boolean);
        
        let existingFlats = [], existingShops = [], existingAmenities = {};
        const existingPanel = floorGroup.querySelector('.sizing-panel');
        if (existingPanel) {
            existingPanel.querySelectorAll('.size-flat').forEach(i => existingFlats.push(i.value));
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

        let html = `<div class="sizing-panel bg-gray-50 p-3 rounded-b-lg border-x border-b border-gray-200 mb-2 grid grid-cols-1 gap-4">`;
        
        if (flats > 0) {
            html += `<div class="bg-white p-2 rounded border border-gray-200">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-bold text-gray-600">FLAT SIZES (Sq.Ft)</span>
                            <button type="button" class="btn-apply-all text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200" data-target=".size-flat">Apply First to All</button>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">`;
            for(let i = 1; i <= flats; i++) {
                const val = existingFlats[i - 1] || '';
                html += `<input type="number" class="input-field text-xs p-1 size-flat border-gray-300" placeholder="Flat ${i}" value="${val}">`;
            }
            html += `</div></div>`;
        }
        
        if (shops > 0) {
            html += `<div class="bg-white p-2 rounded border border-gray-200">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-bold text-gray-600">SHOP SIZES (Sq.Ft)</span>
                            <button type="button" class="btn-apply-all text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-200" data-target=".size-shop">Apply First to All</button>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">`;
            for(let i = 1; i <= shops; i++) {
                const val = existingShops[i - 1] || '';
                html += `<input type="number" class="input-field text-xs p-1 size-shop border-gray-300" placeholder="Shop ${i}" value="${val}">`;
            }
            html += `</div></div>`;
        }

        if (amenities.length > 0) {
            html += `<div class="bg-white p-2 rounded border border-gray-200">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-bold text-emerald-700">AMENITY SIZES (Sq.Ft)</span>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">`;
            amenities.forEach(amenity => {
                const val = existingAmenities[amenity] || '';
                html += `<div>
                            <label class="block text-[10px] text-gray-500 mb-1 truncate">${amenity}</label>
                            <input type="number" class="input-field text-xs p-1 size-amenity border-gray-300" data-amenity="${amenity}" placeholder="Sq.Ft" value="${val}">
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
                        <input type="number" class="input-field text-xs p-1 size-room border-gray-300" data-room="${room}" placeholder="Sq.Ft" value="${val}">
                     </div>`;
        });

        amenities.forEach(amenity => {
            const val = existingMap[amenity] || '';
            html += `<div>
                        <label class="block text-[10px] text-emerald-700 font-semibold mb-1 truncate">${amenity}</label>
                        <input type="number" class="input-field text-xs p-1 size-amenity border-gray-300" data-amenity="${amenity}" placeholder="Sq.Ft" value="${val}">
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

        // Copy Format
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
                const oldShopSizes = Array.from(floorGroup.querySelectorAll('.size-shop')).map(i => i.value);

                newRow.querySelectorAll('.size-flat').forEach((inp, idx) => inp.value = oldFlatSizes[idx] || '');
                newRow.querySelectorAll('.size-shop').forEach((inp, idx) => inp.value = oldShopSizes[idx] || '');
            }
            return;
        }

        // Apply All
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

        // Amenities UI Toggle with Stacking Elevation
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

        // Inline Custom Amenity Addition
        if (e.target.classList.contains('btn-add-custom-amenity')) {
            const wrapper = e.target.closest('.options-container');
            const input = wrapper.querySelector('.custom-amenity-input');
            const newVal = input.value.trim();
            
            if (newVal) {
                if (!globalAmenities.includes(newVal)) {
                    globalAmenities.push(newVal);
                    supabase.from('dropdown_values').insert([{ category: 'amenity', value: newVal }]).then();
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

    // Close on clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.multi-select-wrapper')) {
            closeAllAmenityDropdowns();
        }
    });

    // ==========================================
    // FORM SUBMISSION & SUPABASE INSERTION
    // ==========================================
    document.getElementById('createProjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = `
            <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Saving Architecture...
        `;
        submitBtn.disabled = true;

        try {
            const photoFile = document.getElementById('project_photo').files[0];
            let photoUrl = null;
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

            const { data: projectData, error: projectError } = await supabase
                .from('projects')
                .insert([{
                    project_code: document.getElementById('project_code').value,
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
                    assigned_chief_engineer: chiefEngineer,
                    assigned_project_manager: projectManager,
                    assigned_contractor: contractor,
                    project_team_array: teamArray,
                    created_by: createdBy
                }]).select().single();

            if (projectError) throw projectError;

            const zonesToInsert = [];
            const cards = structureContainer.querySelectorAll('.structure-card');

            cards.forEach(card => {
                const structName = card.querySelector('.structure-name').value.trim();
                
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

                floorGroups.forEach(group => {
                    const floorName = group.querySelector('.floor-name-input').value.trim();
                    const amenity = group.querySelector('.amenity-display').value.trim() || 'N.A.';
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
                        group.querySelectorAll('.size-flat').forEach(inp => configJSON.flats.push(parseFloat(inp.value) || 0));
                        group.querySelectorAll('.size-shop').forEach(inp => configJSON.shops.push(parseFloat(inp.value) || 0));
                    }

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

            if (zonesToInsert.length > 0) {
                const { error: zoneError } = await supabase.from('project_zones').insert(zonesToInsert);
                if (zoneError) throw zoneError;
            }

            // Set new project as the active workspace project
            localStorage.setItem('activeProjectId', projectData.id);
            localStorage.setItem('activeProjectCode', projectData.project_code);
            localStorage.setItem('activeProjectName', projectData.project_name);
            window.dispatchEvent(new CustomEvent('prayosha:project-switched', { detail: projectData }));

            showToast(`Project "${projectData.project_name}" created & activated!`, 'success');

            setTimeout(() => {
                window.location.href = 'project-dashboard.html';
            }, 1200);

        } catch (error) {
            console.error('Error creating project:', error);
            showToast(`Creation error: ${error.message}`, 'error');
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
});

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
        const { data: users, error } = await supabase.from('profiles').select('id, full_name, role');
        if (error) throw error;
        const eD = document.getElementById('assigned_chief_engineer');
        const mD = document.getElementById('assigned_project_manager');
        const cD = document.getElementById('assigned_contractor');
        
        (users || []).forEach(u => {
            const roleStr = u.role || 'Member';
            const opt = new Option(`${u.full_name} (${roleStr})`, u.id);
            if (roleStr.includes('Engineer')) eD.add(opt.cloneNode(true));
            else if (roleStr.includes('Manager')) mD.add(opt.cloneNode(true));
            else if (roleStr.includes('Contractor')) cD.add(opt.cloneNode(true));
            else { 
                eD.add(opt.cloneNode(true)); 
                mD.add(opt.cloneNode(true)); 
                cD.add(opt.cloneNode(true)); 
            }
        });
    } catch (e) {
        console.warn('Could not load profiles for assignment:', e);
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