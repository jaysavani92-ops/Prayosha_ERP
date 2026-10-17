/**
 * Prayosha ERP - Unit Handover & Snag Clearance Controller
 * File: /possession/unit-handover.js
 * 
 * Features:
 * 1. Unit context loader with URL query parameter support (?unitId=...).
 * 2. Hard Chabi (Key) Security Gate with Head Office clearance toggle.
 * 3. Punch-list management with Cloudflare R2 defect photo capture & full-screen preview.
 * 4. Pre-delivery readiness progress calculation (Snags Rectified vs Total).
 * 5. Automated Tri-Lingual WhatsApp Priority Dispatcher with strict management order.
 * 6. Final keys delivery workflow updating both possession and master unit tables.
 * 7. Printable Handover Certificate & Punch-List inspection sheet.
 */

import { supabase, uploadToR2 } from '../config.js';

// ==============================================================================
// 1. STATE & CONSTANTS
// ==============================================================================
let currentProjectId = null;
let allProjectUnits = [];
let selectedUnitId = null;
let currentUnit = null;
let currentPossession = null;
let currentSnags = [];
let pendingPhotoFile = null;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==============================================================================
// 2. LIFECYCLE & INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await resolveActiveProject();
    await loadProjectUnitsDropdown();
    await loadSiteStaffDropdown();

    // Check if unitId was passed via URL query parameter (e.g. unit-handover.html?unitId=...)
    const urlParams = new URLSearchParams(window.location.search);
    const passedUnitId = urlParams.get('unitId');

    if (passedUnitId && UUID_REGEX.test(passedUnitId)) {
        selectedUnitId = passedUnitId;
    } else if (allProjectUnits.length > 0) {
        selectedUnitId = allProjectUnits[0].id;
    }

    if (selectedUnitId) {
        const unitSelect = document.getElementById('select-project-unit');
        if (unitSelect) unitSelect.value = selectedUnitId;
        await loadUnitHandoverWorkspace(selectedUnitId);
    }
});

// React to global project switch from universal shell
window.addEventListener('projectChanged', async (e) => {
    if (e.detail && e.detail.projectId) {
        currentProjectId = e.detail.projectId;
        await loadProjectUnitsDropdown();
        if (allProjectUnits.length > 0) {
            selectedUnitId = allProjectUnits[0].id;
            const unitSelect = document.getElementById('select-project-unit');
            if (unitSelect) unitSelect.value = selectedUnitId;
            await loadUnitHandoverWorkspace(selectedUnitId);
        } else {
            resetWorkspaceView();
        }
    }
});

/**
 * Resolves current active project UUID safely from localStorage or database
 */
async function resolveActiveProject() {
    let storedId = localStorage.getItem('activeProjectId');

    if (storedId && UUID_REGEX.test(storedId)) {
        currentProjectId = storedId;
        return;
    }

    try {
        const { data, error } = await supabase
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true })
            .limit(1);

        if (!error && data && data.length > 0) {
            currentProjectId = data[0].id;
            localStorage.setItem('activeProjectId', currentProjectId);
            localStorage.setItem('activeProjectName', data[0].project_name || 'Site Project');
            localStorage.setItem('activeProjectCode', data[0].project_code || 'SITE');
        }
    } catch (err) {
        console.error('[Unit Handover] Project resolution exception:', err);
    }
}

// ==============================================================================
// 3. DROPDOWN LOADERS
// ==============================================================================
async function loadProjectUnitsDropdown() {
    const select = document.getElementById('select-project-unit');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Flat / Unit --</option>';

    if (!currentProjectId || !UUID_REGEX.test(currentProjectId)) return;

    try {
        const { data, error } = await supabase
            .from('project_units')
            .select('*')
            .eq('project_id', currentProjectId)
            .order('tower_block', { ascending: true })
            .order('floor_number', { ascending: false })
            .order('unit_number', { ascending: true });

        if (error) throw error;

        allProjectUnits = data || [];

        allProjectUnits.forEach(unit => {
            const opt = document.createElement('option');
            opt.value = unit.id;
            const statusLabel = (unit.status || 'available').toUpperCase();
            opt.textContent = `[${unit.tower_block}] Unit ${unit.unit_number} (${statusLabel})`;
            select.appendChild(opt);
        });

    } catch (err) {
        console.error('[Unit Handover] Error loading units dropdown:', err);
    }
}

async function loadSiteStaffDropdown() {
    const select = document.getElementById('dispatch-engineer-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select In-Charge Staff --</option>';

    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, full_name, role, phone')
            .in('role', ['site_engineer', 'supervisor', 'project_manager', 'Engineer', 'Supervisor']);

        if (!error && data && data.length > 0) {
            data.forEach(user => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ name: user.full_name, phone: user.phone || '' });
                opt.textContent = `${user.full_name} (${(user.role || 'Site Staff').replace(/_/g, ' ')})`;
                select.appendChild(opt);
            });
        } else {
            const defaults = [
                { name: 'Nilesh Patel', role: 'Site Engineer', phone: '+91 98250 11223' },
                { name: 'Bhavesh Savani', role: 'Finishing Supervisor', phone: '+91 98790 44556' },
                { name: 'Ramesh Kalsariya', role: 'Project Incharge', phone: '+91 99090 77889' }
            ];
            defaults.forEach(d => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify({ name: d.name, phone: d.phone });
                opt.textContent = `${d.name} (${d.role})`;
                select.appendChild(opt);
            });
        }
    } catch (_) {
        const fallbackOpt = document.createElement('option');
        fallbackOpt.value = JSON.stringify({ name: 'Site Supervisor', phone: '' });
        fallbackOpt.textContent = 'Site Supervisor (General)';
        select.appendChild(fallbackOpt);
    }
}

// ==============================================================================
// 4. UNIT WORKSPACE CONTROLLER & DATA BINDING
// ==============================================================================
async function loadUnitHandoverWorkspace(unitId) {
    if (!unitId || !UUID_REGEX.test(unitId)) return;

    selectedUnitId = unitId;
    currentUnit = allProjectUnits.find(u => u.id === unitId);

    try {
        // Parallel queries to fetch possession record and active snags for this specific unit
        const [possRes, snagsRes] = await Promise.all([
            supabase
                .from('possession_records')
                .select('*')
                .eq('unit_id', unitId)
                .maybeSingle(),

            supabase
                .from('possession_snag_items')
                .select('*')
                .eq('unit_id', unitId)
                .order('created_at', { ascending: false })
        ]);

        if (possRes.error) throw possRes.error;
        if (snagsRes.error) throw snagsRes.error;

        currentPossession = possRes.data;
        currentSnags = snagsRes.data || [];

        renderUnitHeaderAndMeta();
        renderChabiSecurityGate();
        renderReadinessMetrics();
        renderCustomerAndDates();
        renderSnagsList();

    } catch (err) {
        console.error('[Unit Handover] Error loading workspace data:', err);
        alert('Failed to load unit details: ' + err.message);
    }
}

function renderUnitHeaderAndMeta() {
    if (!currentUnit) return;

    const unitTitleEl = document.getElementById('header-unit-title');
    const badgeNoEl = document.getElementById('unit-badge-unit-no');
    const infoTitleEl = document.getElementById('unit-info-title');
    const infoTypeEl = document.getElementById('unit-info-type');
    const infoSubtextEl = document.getElementById('unit-info-subtext');

    const formattedUnit = `${currentUnit.tower_block} - ${currentUnit.unit_number}`;
    if (unitTitleEl) unitTitleEl.textContent = `Unit Handover: ${formattedUnit}`;
    if (badgeNoEl) badgeNoEl.textContent = currentUnit.unit_number;
    if (infoTitleEl) infoTitleEl.textContent = `${currentUnit.unit_number} (${currentUnit.unit_type || 'Residential'})`;
    if (infoTypeEl) infoTypeEl.textContent = (currentUnit.status || 'available').toUpperCase();

    const floorText = currentUnit.floor_number === 0 ? 'Ground Floor' : `Floor ${currentUnit.floor_number}`;
    const areaText = currentUnit.carpet_area_sqft ? ` • ${currentUnit.carpet_area_sqft} Sq.Ft` : '';
    if (infoSubtextEl) infoSubtextEl.textContent = `${currentUnit.tower_block} • ${floorText}${areaText}`;
}

function renderChabiSecurityGate() {
    const banner = document.getElementById('chabi-gate-banner');
    const badge = document.getElementById('chabi-lock-status-badge');
    const meta = document.getElementById('ho-clearance-meta');
    const btnToggle = document.getElementById('btn-toggle-ho-clearance');
    const btnText = document.getElementById('btn-toggle-ho-text');
    const btnDeliver = document.getElementById('btn-deliver-keys-final');

    const isUnlocked = currentPossession ? Boolean(currentPossession.is_key_handover_allowed) : false;

    if (isUnlocked) {
        if (banner) banner.className = 'p-4 sm:p-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 shadow-sm transition-all duration-300';
        if (badge) {
            badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white';
            badge.textContent = 'KEYS UNLOCKED (HO NOC GRANTED)';
        }
        if (meta) {
            const byWho = currentPossession.ho_clearance_by || 'Head Office Admin';
            const when = currentPossession.ho_clearance_at ? new Date(currentPossession.ho_clearance_at).toLocaleDateString('en-GB') : 'Verified';
            meta.innerHTML = `<span class="text-emerald-800">HO Clearance Approved by <strong>${escapeHtml(byWho)}</strong> on ${when}. Authorized to release keys.</span>`;
        }
        if (btnToggle) btnToggle.className = 'w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer';
        if (btnText) btnText.textContent = 'Lock Keys (Revoke HO Clearance)';

        if (btnDeliver) {
            btnDeliver.disabled = false;
            btnDeliver.className = 'w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-2 cursor-pointer';
        }
    } else {
        if (banner) banner.className = 'p-4 sm:p-5 rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/70 shadow-sm transition-all duration-300';
        if (badge) {
            badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white';
            badge.textContent = 'KEYS LOCKED';
        }
        if (meta) {
            meta.innerHTML = '<span class="text-rose-800/80">HO Clearance Status: <strong>Pending Accounts, Maintenance & Legal NOC</strong></span>';
        }
        if (btnToggle) btnToggle.className = 'w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-2 cursor-pointer';
        if (btnText) btnText.textContent = 'Authorize Key Handover (HO Gate)';

        if (btnDeliver) {
            btnDeliver.disabled = true;
            btnDeliver.className = 'w-full py-3 rounded-xl bg-slate-200 text-slate-400 text-xs font-bold transition cursor-not-allowed flex items-center justify-center gap-2';
        }
    }
}

function renderReadinessMetrics() {
    const totalSnags = currentSnags.length;
    const rectifiedSnags = currentSnags.filter(s => s.status === 'rectified' || s.status === 'verified').length;

    let percentage = 100;
    if (totalSnags > 0) {
        percentage = Math.round((rectifiedSnags / totalSnags) * 100);
    }

    const pctEl = document.getElementById('readiness-percentage');
    const barEl = document.getElementById('readiness-progress-bar');
    const statsEl = document.getElementById('readiness-snag-stats');
    const tagEl = document.getElementById('readiness-status-tag');

    if (pctEl) pctEl.textContent = `${percentage}%`;
    if (barEl) {
        barEl.style.width = `${percentage}%`;
        if (percentage === 100) {
            barEl.className = 'bg-emerald-500 h-full rounded-full transition-all duration-500';
        } else if (percentage >= 50) {
            barEl.className = 'bg-brand-amber h-full rounded-full transition-all duration-500';
        } else {
            barEl.className = 'bg-rose-500 h-full rounded-full transition-all duration-500';
        }
    }

    if (statsEl) statsEl.textContent = `${rectifiedSnags} of ${totalSnags} Snags Rectified`;

    if (tagEl) {
        if (percentage === 100) {
            tagEl.className = 'text-emerald-700 font-bold';
            tagEl.textContent = 'QC Approved & Ready';
        } else {
            tagEl.className = 'text-amber-700 font-bold';
            tagEl.textContent = `${totalSnags - rectifiedSnags} Rectifications Pending`;
        }
    }

    // Auto-reflect in pre-delivery checklist
    const snagCheck = document.getElementById('gate-snags-cleared');
    if (snagCheck) snagCheck.checked = (percentage === 100 && totalSnags > 0);
}

function renderCustomerAndDates() {
    const custNameEl = document.getElementById('customer-name');
    const custPhoneEl = document.getElementById('customer-phone');
    const bookDateEl = document.getElementById('booking-date');
    const commitDateEl = document.getElementById('committed-date');
    const countdownEl = document.getElementById('committed-countdown');
    const actualDateEl = document.getElementById('actual-possession-date');
    const actualStatusEl = document.getElementById('actual-possession-status');

    if (currentPossession && currentPossession.customer_name) {
        if (custNameEl) custNameEl.textContent = currentPossession.customer_name;
        if (custPhoneEl) custPhoneEl.textContent = currentPossession.customer_phone || 'No phone recorded';
        if (bookDateEl) bookDateEl.textContent = currentPossession.booking_date 
            ? new Date(currentPossession.booking_date).toLocaleDateString('en-GB') 
            : 'Recent Booking';

        if (commitDateEl) {
            commitDateEl.textContent = currentPossession.committed_possession_date 
                ? new Date(currentPossession.committed_possession_date).toLocaleDateString('en-GB') 
                : 'Pending Commitment';
        }

        if (countdownEl && currentPossession.committed_possession_date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(currentPossession.committed_possession_date);
            target.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                countdownEl.className = 'text-[11px] font-bold text-rose-600 block';
                countdownEl.textContent = `${Math.abs(diffDays)} Days Overdue ⚠️`;
            } else if (diffDays === 0) {
                countdownEl.className = 'text-[11px] font-bold text-amber-600 block';
                countdownEl.textContent = 'Due Today';
            } else {
                countdownEl.className = 'text-[11px] font-bold text-emerald-700 block';
                countdownEl.textContent = `${diffDays} Days Remaining`;
            }
        }

        if (actualDateEl) {
            actualDateEl.textContent = currentPossession.actual_possession_date 
                ? new Date(currentPossession.actual_possession_date).toLocaleDateString('en-GB') 
                : 'Not Handed Over';
        }

        if (actualStatusEl) {
            if (currentPossession.workflow_status === 'keys_delivered') {
                actualStatusEl.className = 'text-[11px] font-bold text-indigo-700 block';
                actualStatusEl.textContent = 'Possession Complete';
            } else {
                actualStatusEl.className = 'text-[11px] font-semibold text-slate-500 block';
                actualStatusEl.textContent = 'Pre-Delivery Stage';
            }
        }

    } else {
        if (custNameEl) custNameEl.textContent = 'Available (Unsold)';
        if (custPhoneEl) custPhoneEl.textContent = '-';
        if (bookDateEl) bookDateEl.textContent = '-';
        if (commitDateEl) commitDateEl.textContent = 'Not Allotted';
        if (countdownEl) countdownEl.textContent = '-';
        if (actualDateEl) actualDateEl.textContent = '-';
        if (actualStatusEl) actualStatusEl.textContent = 'Available for Sale';
    }
}

// ==============================================================================
// 5. SNAG & PUNCH-LIST CHECKLIST MANAGER
// ==============================================================================
function renderSnagsList() {
    const container = document.getElementById('snag-items-list');
    if (!container) return;

    const catFilter = document.getElementById('filter-snag-category')?.value || 'ALL';
    const statusFilter = document.getElementById('filter-snag-status')?.value || 'ALL';

    const filtered = currentSnags.filter(snag => {
        if (catFilter !== 'ALL' && snag.category !== catFilter) return false;
        if (statusFilter !== 'ALL' && snag.status !== statusFilter) return false;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                <span class="text-2xl text-slate-300 block mb-1">✓</span>
                <p class="text-xs font-semibold text-slate-600">No defect items found</p>
                <p class="text-[10px] text-slate-400">All punch-list snags are either cleared or none match the selected filter.</p>
            </div>
        `;
        return;
    }

    let html = '';
    filtered.forEach(snag => {
        const isRectified = snag.status === 'rectified' || snag.status === 'verified';
        const isVerified = snag.status === 'verified';

        let badgeStyle = 'bg-amber-100 text-amber-800 border-amber-200';
        let statusText = 'Pending Rectification';
        if (isVerified) {
            badgeStyle = 'bg-indigo-100 text-indigo-800 border-indigo-200';
            statusText = 'QC Verified';
        } else if (isRectified) {
            badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-200';
            statusText = 'Site Rectified';
        }

        html += `
            <div class="p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm space-y-2 hover:border-slate-300 transition">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-start gap-2.5 min-w-0">
                        <input type="checkbox" data-snag-id="${snag.id}" ${isRectified ? 'checked' : ''} class="snag-checkbox mt-0.5 rounded text-brand-navy focus:ring-brand-navy cursor-pointer">
                        <div>
                            <span class="text-xs font-bold text-brand-navy block">${escapeHtml(snag.category)}</span>
                            <p class="text-xs ${isRectified ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}">${escapeHtml(snag.item_description)}</p>
                        </div>
                    </div>

                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeStyle} flex-shrink-0">
                        ${statusText}
                    </span>
                </div>

                <!-- Footer: Photos & Timestamps -->
                <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                    <div class="flex items-center gap-2">
                        ${snag.photo_before_url ? `
                            <button type="button" data-img-url="${snag.photo_before_url}" data-img-title="Before Defect: ${escapeHtml(snag.item_description)}" class="btn-preview-photo text-brand-navy font-bold hover:underline flex items-center gap-1 cursor-pointer">
                                <span>📷</span> <span>Before Photo</span>
                            </button>
                        ` : '<span class="italic">No photo attached</span>'}
                    </div>

                    <div class="flex items-center gap-2">
                        <span>Logged: ${new Date(snag.created_at).toLocaleDateString('en-GB')}</span>
                        <button type="button" data-delete-id="${snag.id}" title="Remove punch item" class="btn-delete-snag text-red-400 hover:text-red-600 font-bold ml-1 cursor-pointer">✕</button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Attach listeners to checkboxes
    container.querySelectorAll('.snag-checkbox').forEach(cb => {
        cb.addEventListener('change', async (e) => {
            const id = e.target.getAttribute('data-snag-id');
            const targetStatus = e.target.checked ? 'rectified' : 'pending';
            await updateSnagStatus(id, targetStatus);
        });
    });

    // Attach listeners to photo preview
    container.querySelectorAll('.btn-preview-photo').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-img-url');
            const title = btn.getAttribute('data-img-title');
            openPhotoModal(url, title);
        });
    });

    // Attach listeners to delete button
    container.querySelectorAll('.btn-delete-snag').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-delete-id');
            if (confirm('Delete this punch-list item?')) {
                await deleteSnagItem(id);
            }
        });
    });
}

async function handleAddPunchItem() {
    if (!selectedUnitId || !currentUnit) {
        alert('Please select a unit first.');
        return;
    }

    const category = document.getElementById('input-snag-category')?.value || 'Painting/Touchup';
    const descInput = document.getElementById('input-snag-desc');
    const desc = descInput ? descInput.value.trim() : '';

    if (!desc) {
        alert('Please describe the defect or rectification scope.');
        return;
    }

    const saveBtn = document.getElementById('btn-save-snag');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Uploading...';
    }

    try {
        // Upload photo to R2 if selected
        let uploadedPhotoUrl = null;
        if (pendingPhotoFile) {
            uploadedPhotoUrl = await uploadToR2(pendingPhotoFile, 'possession-snags');
        }

        // Ensure possession record exists
        let possessionId = currentPossession ? currentPossession.id : null;
        if (!possessionId) {
            const { data: newPoss, error: possErr } = await supabase
                .from('possession_records')
                .insert([{
                    project_id: currentProjectId,
                    unit_id: selectedUnitId,
                    customer_name: 'Unassigned Buyer',
                    committed_possession_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    workflow_status: 'finishing_pending'
                }])
                .select()
                .single();

            if (possErr) throw possErr;
            currentPossession = newPoss;
            possessionId = newPoss.id;
        }

        // Insert Snag
        const { data: newSnag, error: snagErr } = await supabase
            .from('possession_snag_items')
            .insert([{
                possession_id: possessionId,
                unit_id: selectedUnitId,
                category,
                item_description: desc,
                status: 'pending',
                photo_before_url: uploadedPhotoUrl
            }])
            .select()
            .single();

        if (snagErr) throw snagErr;

        currentSnags.unshift(newSnag);

        // Reset inputs
        if (descInput) descInput.value = '';
        pendingPhotoFile = null;
        const photoLabel = document.getElementById('snag-photo-preview-name');
        if (photoLabel) photoLabel.textContent = 'No file chosen';

        renderReadinessMetrics();
        renderSnagsList();

    } catch (err) {
        console.error('[Unit Handover] Error adding punch item:', err);
        alert('Failed to save punch item: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '+ Add Punch Item';
        }
    }
}

async function updateSnagStatus(snagId, targetStatus) {
    try {
        const { error } = await supabase
            .from('possession_snag_items')
            .update({
                status: targetStatus,
                rectified_at: targetStatus === 'rectified' ? new Date().toISOString() : null
            })
            .eq('id', snagId);

        if (error) throw error;

        const idx = currentSnags.findIndex(s => s.id === snagId);
        if (idx !== -1) {
            currentSnags[idx].status = targetStatus;
            currentSnags[idx].rectified_at = targetStatus === 'rectified' ? new Date().toISOString() : null;
        }

        renderReadinessMetrics();
        renderSnagsList();

    } catch (err) {
        console.error('[Unit Handover] Error updating status:', err);
        alert('Could not update status: ' + err.message);
    }
}

async function deleteSnagItem(snagId) {
    try {
        const { error } = await supabase
            .from('possession_snag_items')
            .delete()
            .eq('id', snagId);

        if (error) throw error;

        currentSnags = currentSnags.filter(s => s.id !== snagId);
        renderReadinessMetrics();
        renderSnagsList();

    } catch (err) {
        console.error('[Unit Handover] Error deleting snag:', err);
        alert('Could not delete snag item: ' + err.message);
    }
}

// ==============================================================================
// 6. CHABI GATE & FINAL HANDOVER WORKFLOW
// ==============================================================================
async function handleToggleHOClearance() {
    if (!currentPossession) {
        alert('No booking entry found for this unit. Please register customer allotment details first.');
        return;
    }

    const currentLock = Boolean(currentPossession.is_key_handover_allowed);
    const newLock = !currentLock;

    const actionText = newLock ? 'GRANT Head Office Key Handover NOC' : 'LOCK and REVOKE Key Release Authorization';
    if (!confirm(`Are you sure you want to ${actionText} for ${currentUnit.unit_number}?`)) {
        return;
    }

    try {
        const currentUserStr = localStorage.getItem('prayosha_user');
        let userName = 'Head Office Admin';
        if (currentUserStr) {
            try { userName = JSON.parse(currentUserStr).full_name || 'Head Office Admin'; } catch (_) {}
        }

        const { error } = await supabase
            .from('possession_records')
            .update({
                is_key_handover_allowed: newLock,
                ho_clearance_by: newLock ? userName : null,
                ho_clearance_at: newLock ? new Date().toISOString() : null,
                workflow_status: newLock ? 'ho_approved' : 'finishing_pending'
            })
            .eq('id', currentPossession.id);

        if (error) throw error;

        currentPossession.is_key_handover_allowed = newLock;
        currentPossession.ho_clearance_by = newLock ? userName : null;
        currentPossession.ho_clearance_at = newLock ? new Date().toISOString() : null;
        currentPossession.workflow_status = newLock ? 'ho_approved' : 'finishing_pending';

        renderChabiSecurityGate();

    } catch (err) {
        console.error('[Unit Handover] Clearance toggle exception:', err);
        alert('Failed to update clearance: ' + err.message);
    }
}

async function handleFinalDeliverKeys() {
    if (!currentPossession || !currentPossession.is_key_handover_allowed) {
        alert('Action Blocked: Physical keys cannot be handed over without authorized Head Office clearance.');
        return;
    }

    // Verify statutory & accounts checklist
    const accCleared = document.getElementById('gate-accounts-cleared')?.checked;
    const maintCleared = document.getElementById('gate-maintenance-collected')?.checked;

    if (!accCleared || !maintCleared) {
        if (!confirm('Final accounts or maintenance deposit checkboxes are unchecked. Do you still wish to proceed with official key delivery?')) {
            return;
        }
    }

    if (!confirm(`CONFIRM KEY HANDOVER: Keys for ${currentUnit.unit_number} will be recorded as delivered to ${currentPossession.customer_name} today.`)) {
        return;
    }

    try {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Update Possession Record
        const { error: possErr } = await supabase
            .from('possession_records')
            .update({
                workflow_status: 'keys_delivered',
                actual_possession_date: todayStr
            })
            .eq('id', currentPossession.id);

        if (possErr) throw possErr;

        // 2. Update Unit Master Record
        const { error: unitErr } = await supabase
            .from('project_units')
            .update({ status: 'handed_over' })
            .eq('id', currentUnit.id);

        if (unitErr) throw unitErr;

        currentUnit.status = 'handed_over';
        currentPossession.workflow_status = 'keys_delivered';
        currentPossession.actual_possession_date = todayStr;

        renderUnitHeaderAndMeta();
        renderCustomerAndDates();
        renderChabiSecurityGate();

        alert(`Keys for Unit ${currentUnit.unit_number} have been successfully handed over to ${currentPossession.customer_name}.`);

    } catch (err) {
        console.error('[Unit Handover] Error delivering keys:', err);
        alert('Failed to record delivery: ' + err.message);
    }
}

// ==============================================================================
// 7. WHATSAPP PRIORITY SITE DISPATCH
// ==============================================================================
function handleDispatchWhatsApp() {
    if (!currentUnit) {
        alert('Please choose a unit first.');
        return;
    }

    const select = document.getElementById('dispatch-engineer-select');
    const selectedVal = select ? select.value : '';

    if (!selectedVal) {
        alert('Please select an Assigned Site Supervisor / Engineer from the dropdown.');
        return;
    }

    const staff = JSON.parse(selectedVal);
    const customNotes = document.getElementById('dispatch-custom-notes')?.value.trim() || 'Execute finishing touches immediately.';

    const openSnags = currentSnags.filter(s => s.status !== 'verified');
    const targetDate = currentPossession && currentPossession.committed_possession_date 
        ? new Date(currentPossession.committed_possession_date).toLocaleDateString('en-GB') 
        : 'Immediate';

    const message = 
`🚨 *PRAYOSHA PRIORITY WORK ORDER: UNIT RECTIFICATION*
-----------------------------------------
🏢 *Unit:* ${currentUnit.tower_block} - ${currentUnit.unit_number} (${currentUnit.unit_type || 'Residential'})
👤 *Customer:* ${currentPossession ? currentPossession.customer_name : 'Valued Buyer'}
📅 *Target Possession Date:* ${targetDate}
👷 *Assigned In-Charge:* ${staff.name}
📋 *Pending Punch Snags:* ${openSnags.length} item(s)

📝 *Special Notes:*
${customNotes}

⚠️ *STRICT MANAGEMENT ORDER:*
Complete deep cleaning and snag rectification on war footing. 
*UNDER NO CIRCUMSTANCES SHALL KEYS BE HANDED OVER OR BUYER INTERIOR ACCESS COMMENCED WITHOUT OFFICIAL HEAD OFFICE CLEARANCE.*

_Prayosha ERP Operating System_`;

    const encoded = encodeURIComponent(message);
    const cleanPhone = (staff.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;

    // Log telemetry
    supabase
        .from('possession_worker_alerts')
        .insert([{
            project_id: currentProjectId,
            unit_id: currentUnit.id,
            recipient_name: staff.name,
            recipient_role: 'Site In-Charge',
            recipient_phone: staff.phone || 'N/A',
            message_text: message,
            dispatch_channel: 'whatsapp'
        }])
        .then(() => {});

    window.open(waUrl, '_blank');
}

// ==============================================================================
// 8. PRINT HANDOVER CERTIFICATE & PHOTO VIEWER
// ==============================================================================
function handlePrintCertificate() {
    if (!currentUnit || !currentPossession) {
        alert('No booking record available to generate a handover certificate.');
        return;
    }
    window.print();
}

function openPhotoModal(url, title) {
    const modal = document.getElementById('image-preview-modal');
    const modalImg = document.getElementById('image-modal-img');
    const modalTitle = document.getElementById('image-modal-title');

    if (!modal || !modalImg) return;

    modalImg.src = url;
    if (modalTitle) modalTitle.textContent = title || 'Defect Evidence Photo';

    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
}

function closePhotoModal() {
    const modal = document.getElementById('image-preview-modal');
    if (!modal) return;

    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        const modalImg = document.getElementById('image-modal-img');
        if (modalImg) modalImg.src = '';
    }, 300);
}

// ==============================================================================
// 9. EVENT LISTENERS
// ==============================================================================
function setupEventListeners() {
    // Unit Switcher
    const unitSelect = document.getElementById('select-project-unit');
    if (unitSelect) {
        unitSelect.addEventListener('change', (e) => {
            const chosenId = e.target.value;
            if (chosenId) {
                loadUnitHandoverWorkspace(chosenId);
            }
        });
    }

    // Snag Filters
    const catFilter = document.getElementById('filter-snag-category');
    const statusFilter = document.getElementById('filter-snag-status');
    if (catFilter) catFilter.addEventListener('change', renderSnagsList);
    if (statusFilter) statusFilter.addEventListener('change', renderSnagsList);

    // Snag Photo Input
    const photoInput = document.getElementById('input-snag-photo');
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                pendingPhotoFile = e.target.files[0];
                const previewName = document.getElementById('snag-photo-preview-name');
                if (previewName) previewName.textContent = pendingPhotoFile.name;
            }
        });
    }

    // Add Snag Button
    const btnSaveSnag = document.getElementById('btn-save-snag');
    if (btnSaveSnag) btnSaveSnag.addEventListener('click', handleAddPunchItem);

    // Chabi Gate Clearance Toggle
    const btnToggleHO = document.getElementById('btn-toggle-ho-clearance');
    if (btnToggleHO) btnToggleHO.addEventListener('click', handleToggleHOClearance);

    // Final Handover Button
    const btnDeliverKeys = document.getElementById('btn-deliver-keys-final');
    if (btnDeliverKeys) btnDeliverKeys.addEventListener('click', handleFinalDeliverKeys);

    // WhatsApp Dispatch Button
    const btnDispatchWA = document.getElementById('btn-dispatch-whatsapp');
    if (btnDispatchWA) btnDispatchWA.addEventListener('click', handleDispatchWhatsApp);

    // Print Button
    const btnPrint = document.getElementById('btn-print-possession-sheet');
    if (btnPrint) btnPrint.addEventListener('click', handlePrintCertificate);

    // Photo Modal Close
    const btnClosePhoto = document.getElementById('btn-close-image-modal');
    const modalBackdrop = document.getElementById('image-modal-backdrop');
    if (btnClosePhoto) btnClosePhoto.addEventListener('click', closePhotoModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closePhotoModal);
}

// ==============================================================================
// 10. UTILITIES
// ==============================================================================
function resetWorkspaceView() {
    selectedUnitId = null;
    currentUnit = null;
    currentPossession = null;
    currentSnags = [];

    const titleEl = document.getElementById('header-unit-title');
    if (titleEl) titleEl.textContent = 'Unit Handover & Snag Clearance';

    const infoTitleEl = document.getElementById('unit-info-title');
    if (infoTitleEl) infoTitleEl.textContent = 'Select a unit to view details';

    renderReadinessMetrics();
    renderCustomerAndDates();
    renderChabiSecurityGate();
    renderSnagsList();
}

function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}