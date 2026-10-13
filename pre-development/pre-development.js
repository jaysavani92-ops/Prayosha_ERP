/**
 * ==============================================================================
 * PRAYOSHA ERP - PRE-DEVELOPMENT MODULE CONTROLLER (PHASE 1: LIASONING)
 * File: /pre-development/pre-development.js
 * Tech Stack: Vanilla JS (ES Modules), Supabase, Cloudflare R2, Tailwind CSS
 * ==============================================================================
 */

import { supabase, uploadToR2 } from '../config.js';

// Helper: Validate standard 36-character UUID
function isValidUUID(str) {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

// ==============================================================================
// APPLICATION STATE
// ==============================================================================
const state = {
    activeProjectId: null,
    activeProject: null,
    activeProjectName: '',
    activeProjectCode: '',
    projectsList: [],
    currentUser: null,
    userRole: 'Chief Engineer',
    userId: null,
    currentPhase: 'liasoning',

    // Master statutory categories from Super Core Engine
    categories: {
        liasoning: [],
        development_cost: [],
        development: []
    },

    // Current project records for Phase 1
    liasoningRecords: new Map(), // category_id -> record

    // KPI Summary Metrics from other phases
    kpiMetrics: {
        totalBoqBudget: 0,
        totalVariance: 0,
        readyDevCount: 0,
        totalDevCount: 0
    },

    // Active upload context for modal
    uploadContext: {
        phase: 'liasoning',
        categoryId: null,
        categoryName: null,
        selectedFile: null
    },

    // Search filter
    searchQuery: '',

    // Realtime Notifications
    unreadNotificationsCount: 0
};

// ==============================================================================
// INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    initSession();
    setupEventListeners();
    await loadUserContext();
    await fetchProjectsList();
    await loadActiveProject();
    setupRealtimeSubscriptions();
    setupCrossModuleSync();
});

/**
 * Restore active project from localStorage or URL parameter
 */
function initSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const paramProjectId = urlParams.get('project');

    if (paramProjectId && isValidUUID(paramProjectId)) {
        localStorage.setItem('activeProjectId', paramProjectId);
    }

    const storedId = localStorage.getItem('activeProjectId');
    state.activeProjectId = isValidUUID(storedId) ? storedId : null;
    state.activeProjectName = localStorage.getItem('activeProjectName') || '';
    state.activeProjectCode = localStorage.getItem('activeProjectCode') || '';
    state.userRole = localStorage.getItem('userRole') || 'Chief Engineer';
    state.userId = localStorage.getItem('userId') || null;
}

/**
 * Listen for workspace project switches triggered by universal shell top navbar
 */
function setupCrossModuleSync() {
    window.addEventListener('prayosha:project-switched', async (e) => {
        const project = e.detail;
        if (project && isValidUUID(project.id)) {
            state.activeProjectId = project.id;
            state.activeProjectName = project.project_name || '';
            state.activeProjectCode = project.project_code || '';
            await loadActiveProject();
            showToast(`Pre-Development synchronized: ${state.activeProjectName}`, 'info');
        } else {
            state.activeProjectId = null;
            state.activeProject = null;
            await loadActiveProject();
        }
    });
}

/**
 * Fetch authenticated user safely without triggering 401 Unauthorized
 */
async function loadUserContext() {
    try {
        const storedRole = localStorage.getItem('userRole');
        if (storedRole) state.userRole = storedRole;

        const storedUser = localStorage.getItem('prayosha_user');
        if (storedUser) {
            try {
                const parsed = JSON.parse(storedUser);
                state.currentUser = parsed;
                state.userId = isValidUUID(parsed.id) ? parsed.id : null;
            } catch (_) {}
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
            state.currentUser = session.user;
            state.userId = isValidUUID(session.user.id) ? session.user.id : state.userId;

            const { data: profile } = await supabase
                .from('profiles')
                .select('role, full_name')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profile) {
                state.userRole = profile.role || state.userRole;
                state.currentUser.full_name = profile.full_name || session.user.email;
            }
        }
    } catch (err) {
        console.warn('User auth session fallback:', err.message);
    }
}

/**
 * Fetch all projects
 */
async function fetchProjectsList() {
    try {
        const { data: projects, error } = await supabase
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name');

        if (error) throw error;

        state.projectsList = (projects || []).map(p => ({
            id: p.id,
            name: p.project_name || 'Untitled Project',
            project_code: p.project_code || ''
        }));
    } catch (err) {
        console.error('Error fetching projects list:', err.message);
        showToast('Could not load projects list', 'warning');
    }
}

/**
 * Load Active Project Data & Initialize UI
 */
async function loadActiveProject() {
    const alertBox = document.getElementById('noProjectAlert');
    const badge = document.getElementById('activeProjectBadge');
    const badgeText = document.getElementById('activeProjectCodeName');

    if (!isValidUUID(state.activeProjectId)) {
        if (alertBox) alertBox.classList.remove('hidden');
        if (badge) badge.classList.add('hidden');
        resetKpiSummary();
        renderEmptyStateTable();
        return;
    }

    if (alertBox) alertBox.classList.add('hidden');

    state.activeProject = state.projectsList.find(p => p.id === state.activeProjectId);
    if (state.activeProject) {
        if (badge && badgeText) {
            badge.classList.remove('hidden');
            badgeText.textContent = `${state.activeProject.project_code ? '[' + state.activeProject.project_code + '] ' : ''}${state.activeProject.name}`;
        }
        localStorage.setItem('activeProjectId', state.activeProject.id);
        localStorage.setItem('activeProjectName', state.activeProject.name);
        if (state.activeProject.project_code) {
            localStorage.setItem('activeProjectCode', state.activeProject.project_code);
        }
    }

    await fetchMasterCategories();
    await Promise.all([
        loadLiasoningData(),
        fetchBackgroundKpis(),
        fetchUnreadNotifications()
    ]);

    updateKpiSummary();
}

function renderEmptyStateTable() {
    const lBody = document.getElementById('liasoningTableBody');
    const msg = `<tr><td colspan="8" class="text-center py-8 text-amber-300/80 font-medium text-xs">Please select a specific project from the top navigation dropdown to load records.</td></tr>`;
    if (lBody) lBody.innerHTML = msg;
}

// ==============================================================================
// SUPER CORE ENGINE: MASTER CATEGORIES MANAGEMENT
// ==============================================================================
async function fetchMasterCategories() {
    try {
        const { data, error } = await supabase
            .from('pre_dev_categories')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        state.categories.liasoning = (data || []).filter(c => c.phase === 'liasoning');
        state.categories.development_cost = (data || []).filter(c => c.phase === 'development_cost');
        state.categories.development = (data || []).filter(c => c.phase === 'development');

        const badgeLiasoning = document.getElementById('tabBadgeLiasoning');
        const badgeBoq = document.getElementById('tabBadgeBoq');
        const badgeDev = document.getElementById('tabBadgeDev');

        if (badgeLiasoning) badgeLiasoning.textContent = state.categories.liasoning.length;
        if (badgeBoq) badgeBoq.textContent = state.categories.development_cost.length;
        if (badgeDev) badgeDev.textContent = state.categories.development.length;

    } catch (err) {
        console.error('Error fetching master categories:', err.message);
        showToast('Error loading pre-development categories', 'warning');
    }
}

// ==============================================================================
// PHASE 1: LIASONING DATA FETCH & PERSISTENCE
// ==============================================================================
async function loadLiasoningData() {
    if (!isValidUUID(state.activeProjectId)) return;
    try {
        const { data, error } = await supabase
            .from('pre_dev_liasoning')
            .select('*')
            .eq('project_id', state.activeProjectId);

        if (error) throw error;

        state.liasoningRecords.clear();
        (data || []).forEach(r => state.liasoningRecords.set(r.category_id, r));

        renderLiasoningTable();
    } catch (err) {
        console.error('Error loading Liasoning data:', err.message);
    }
}

/**
 * Capture all active DOM inputs before re-rendering or saving
 */
function syncDomInputsToState() {
    const tbody = document.getElementById('liasoningTableBody');
    if (!tbody) return;

    tbody.querySelectorAll('tr[data-cat-id]').forEach(rowEl => {
        const catId = rowEl.dataset.catId;
        const statusToggle = rowEl.querySelector('.liasoning-status-toggle');
        const refInput = rowEl.querySelector('.liasoning-ref-input');
        const dateInput = rowEl.querySelector('.liasoning-date-input');
        const remarkInput = rowEl.querySelector('.liasoning-remark-input');

        const existing = state.liasoningRecords.get(catId) || {};

        if (statusToggle) existing.status = statusToggle.checked ? 'Yes' : 'No';
        if (refInput) existing.reference_no = refInput.value.trim() || null;
        if (dateInput) existing.clearance_date = dateInput.value ? dateInput.value : null;
        if (remarkInput) existing.remarks = remarkInput.value.trim() || null;

        state.liasoningRecords.set(catId, existing);
    });
}

function renderLiasoningTable() {
    const tbody = document.getElementById('liasoningTableBody');
    if (!tbody) return;

    const query = state.searchQuery.toLowerCase().trim();
    const categories = state.categories.liasoning.filter(c => 
        !query || c.name.toLowerCase().includes(query)
    );

    if (categories.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-slate-500 font-medium">
                    No liasoning clearances match your search.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = categories.map((cat, idx) => {
        const rec = state.liasoningRecords.get(cat.id) || {
            status: 'No',
            reference_no: '',
            clearance_date: '',
            document_url: '',
            document_name: '',
            remarks: ''
        };
        const isYes = rec.status === 'Yes';
        const formattedDate = rec.clearance_date ? rec.clearance_date.split('T')[0] : '';

        return `
            <tr data-cat-id="${cat.id}" class="hover:bg-slate-800/40 transition">
                <td class="py-3 px-4 text-center font-mono text-slate-500 text-xs">${idx + 1}</td>
                <td class="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full ${isYes ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
                    <span>${escapeHtml(cat.name)}</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" class="sr-only switch-checkbox liasoning-status-toggle" 
                               data-cat-id="${cat.id}" ${isYes ? 'checked' : ''}>
                        <div class="switch-label w-11 h-6 bg-slate-700 rounded-full transition-colors duration-200">
                            <div class="switch-handle w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-md transform translate-x-0.5 translate-y-0.5"></div>
                        </div>
                    </label>
                </td>
                <td class="py-3 px-4">
                    <input type="text" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full liasoning-ref-input" 
                           data-cat-id="${cat.id}" placeholder="Inward / Sanction No." 
                           value="${escapeHtml(rec.reference_no || '')}">
                </td>
                <td class="py-3 px-4">
                    <input type="date" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full liasoning-date-input" 
                           data-cat-id="${cat.id}" 
                           value="${formattedDate}">
                </td>
                <td class="py-3 px-4">
                    ${rec.document_url ? `
                        <div class="flex items-center gap-1.5">
                            <a href="${rec.document_url}" target="_blank" rel="noopener noreferrer" class="truncate max-w-[120px] text-prayosha-amber hover:underline text-[11px] font-medium flex items-center gap-1" title="${escapeHtml(rec.document_name || 'View File')}">
                                <i class="fa-solid fa-file-pdf"></i> ${escapeHtml(rec.document_name || 'Document')}
                            </a>
                            <button type="button" class="text-slate-400 hover:text-white text-xs upload-doc-btn cursor-pointer" 
                                    data-phase="liasoning" data-cat-id="${cat.id}" data-cat-name="${escapeHtml(cat.name)}" title="Replace file">
                                <i class="fa-solid fa-arrows-rotate"></i>
                            </button>
                        </div>
                    ` : `
                        <button type="button" class="px-2.5 py-1 rounded-lg glass-card hover:border-prayosha-amber/40 text-slate-300 text-[11px] font-medium transition flex items-center gap-1 upload-doc-btn cursor-pointer" 
                                data-phase="liasoning" data-cat-id="${cat.id}" data-cat-name="${escapeHtml(cat.name)}">
                            <i class="fa-solid fa-cloud-arrow-up text-prayosha-amber"></i> Attach File
                        </button>
                    `}
                </td>
                <td class="py-3 px-4">
                    <input type="text" class="glass-input text-xs py-1.5 px-2.5 rounded-lg w-full liasoning-remark-input" 
                           data-cat-id="${cat.id}" placeholder="Remarks..." 
                           value="${escapeHtml(rec.remarks || '')}">
                </td>
                <td class="py-3 px-4 text-center">
                    <button type="button" class="w-7 h-7 rounded-lg glass-card text-emerald-400 hover:bg-emerald-500/20 save-single-liasoning-btn cursor-pointer" 
                            data-cat-id="${cat.id}" title="Quick Save Item">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    bindLiasoningRowEvents();
}

function bindLiasoningRowEvents() {
    // 1. Status Toggle
    document.querySelectorAll('.liasoning-status-toggle').forEach(el => {
        el.addEventListener('change', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.liasoningRecords.get(catId) || {};
            existing.status = e.target.checked ? 'Yes' : 'No';
            state.liasoningRecords.set(catId, existing);
            updateKpiSummary();
        });
    });

    // 2. Reference Number Input
    document.querySelectorAll('.liasoning-ref-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.liasoningRecords.get(catId) || {};
            existing.reference_no = e.target.value.trim() || null;
            state.liasoningRecords.set(catId, existing);
        });
    });

    // 3. Clearance Date Input
    document.querySelectorAll('.liasoning-date-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.liasoningRecords.get(catId) || {};
            existing.clearance_date = e.target.value ? e.target.value : null;
            state.liasoningRecords.set(catId, existing);
        });
    });

    // 4. Remarks Input
    document.querySelectorAll('.liasoning-remark-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const catId = e.target.dataset.catId;
            const existing = state.liasoningRecords.get(catId) || {};
            existing.remarks = e.target.value.trim() || null;
            state.liasoningRecords.set(catId, existing);
        });
    });

    // 5. Cloudflare R2 Upload Trigger
    document.querySelectorAll('.upload-doc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            syncDomInputsToState();
            const current = e.currentTarget;
            openUploadModal(current.dataset.phase, current.dataset.catId, current.dataset.catName);
        });
    });

    // 6. Single Row Quick Save Button
    document.querySelectorAll('.save-single-liasoning-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.catId;
            await saveSingleLiasoningRecord(catId);
        });
    });
}

/**
 * Save All Phase 1 Liasoning Clearances to Supabase
 */
async function saveAllLiasoningRecords() {
    if (!isValidUUID(state.activeProjectId)) {
        showToast('Please select a specific project first', 'warning');
        return;
    }

    syncDomInputsToState();

    const masterSaveBtn = document.getElementById('masterSaveBtn');
    const originalBtnHtml = masterSaveBtn ? masterSaveBtn.innerHTML : '';
    if (masterSaveBtn) {
        masterSaveBtn.disabled = true;
        masterSaveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Saving Phase 1...</span>`;
    }

    const rowsToUpsert = [];
    state.categories.liasoning.forEach(cat => {
        const catId = cat.id;
        const currentRec = state.liasoningRecords.get(catId) || {};

        const record = {
            project_id: state.activeProjectId,
            category_id: catId,
            status: currentRec.status || 'No',
            reference_no: currentRec.reference_no || null,
            clearance_date: currentRec.clearance_date ? currentRec.clearance_date : null,
            document_url: currentRec.document_url || null,
            document_name: currentRec.document_name || null,
            remarks: currentRec.remarks || null,
            updated_by: isValidUUID(state.userId) ? state.userId : null,
            updated_at: new Date().toISOString()
        };

        state.liasoningRecords.set(catId, record);
        rowsToUpsert.push(record);
    });

    try {
        const { error } = await supabase
            .from('pre_dev_liasoning')
            .upsert(rowsToUpsert, { onConflict: 'project_id,category_id' });

        if (error) throw error;

        const approvedCount = rowsToUpsert.filter(r => r.status === 'Yes').length;
        await createAuditLog(
            'liasoning',
            'BATCH_UPDATE',
            `Saved ${rowsToUpsert.length} liasoning clearances (${approvedCount} approved).`
        );

        showToast('Liasoning statutory clearances saved successfully!', 'success');
        renderLiasoningTable();
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving liasoning records:', err.message);
        showToast('Failed to save Liasoning records: ' + err.message, 'warning');
    } finally {
        if (masterSaveBtn) {
            masterSaveBtn.disabled = false;
            masterSaveBtn.innerHTML = originalBtnHtml;
        }
    }
}

/**
 * Quick Save Single Liasoning Row
 */
async function saveSingleLiasoningRecord(catId) {
    if (!isValidUUID(state.activeProjectId)) return;

    syncDomInputsToState();
    const currentRec = state.liasoningRecords.get(catId) || {};

    const record = {
        project_id: state.activeProjectId,
        category_id: catId,
        status: currentRec.status || 'No',
        reference_no: currentRec.reference_no || null,
        clearance_date: currentRec.clearance_date ? currentRec.clearance_date : null,
        document_url: currentRec.document_url || null,
        document_name: currentRec.document_name || null,
        remarks: currentRec.remarks || null,
        updated_by: isValidUUID(state.userId) ? state.userId : null,
        updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabase
            .from('pre_dev_liasoning')
            .upsert(record, { onConflict: 'project_id,category_id' });

        if (error) throw error;

        state.liasoningRecords.set(catId, record);

        const category = state.categories.liasoning.find(c => c.id === catId);
        await createAuditLog(
            'liasoning',
            'ITEM_UPDATE',
            `Updated ${category ? category.name : 'Clearance'}: Status is ${record.status}`
        );

        showToast(`Saved ${category ? category.name : 'clearance'}!`, 'success');
        updateKpiSummary();
    } catch (err) {
        console.error('Error saving item:', err.message);
        showToast('Error saving item: ' + err.message, 'warning');
    }
}

// ==============================================================================
// CLOUDFLARE R2 OBJECT STORAGE UPLOADER
// ==============================================================================
function openUploadModal(phase, catId, catName) {
    state.uploadContext = {
        phase: phase || 'liasoning',
        categoryId: catId,
        categoryName: catName,
        selectedFile: null
    };

    const targetLabel = document.getElementById('uploadTargetItemName');
    if (targetLabel) {
        targetLabel.textContent = `Phase 1: Liasoning • ${catName}`;
    }

    const fileInput = document.getElementById('r2FileInput');
    if (fileInput) fileInput.value = '';

    const chip = document.getElementById('selectedFileChip');
    if (chip) chip.classList.add('hidden');

    const progressContainer = document.getElementById('uploadProgressBarContainer');
    if (progressContainer) progressContainer.classList.add('hidden');

    const progressBar = document.getElementById('uploadProgressBar');
    if (progressBar) progressBar.style.width = '0%';

    const progressText = document.getElementById('uploadProgressText');
    if (progressText) progressText.textContent = '0%';

    const modal = document.getElementById('uploadDocModal');
    if (modal) modal.classList.remove('hidden');
}

function closeUploadModal() {
    const modal = document.getElementById('uploadDocModal');
    if (modal) modal.classList.add('hidden');
}

async function handleDirectR2Upload() {
    const file = state.uploadContext.selectedFile;
    if (!file) {
        showToast('Please select a document to upload', 'warning');
        return;
    }

    const { phase, categoryId } = state.uploadContext;
    const progressContainer = document.getElementById('uploadProgressBarContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const confirmBtn = document.getElementById('confirmUploadBtn');

    if (progressContainer) progressContainer.classList.remove('hidden');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add('opacity-50');
    }

    try {
        if (progressBar) progressBar.style.width = '40%';
        if (progressText) progressText.textContent = '40%';

        const folder = `pre-dev/${state.activeProjectId || 'common'}/${phase}`;
        const publicFileUrl = await uploadToR2(file, folder);

        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = '100%';

        // Update local memory and preserve typed inputs
        syncDomInputsToState();
        const rec = state.liasoningRecords.get(categoryId) || { status: 'Yes' };
        rec.document_url = publicFileUrl;
        rec.document_name = file.name;
        rec.status = 'Yes';
        state.liasoningRecords.set(categoryId, rec);

        renderLiasoningTable();
        showToast(`Document attached to ${state.uploadContext.categoryName}!`, 'success');
        closeUploadModal();

    } catch (err) {
        console.error('Cloudflare R2 Upload Failed:', err);
        showToast('Upload failed: ' + err.message, 'warning');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50');
        }
    }
}

// ==============================================================================
// SUPER CORE ENGINE: DYNAMIC SUB-CATEGORIES CRUD
// ==============================================================================
function openSuperEngineModal() {
    renderSuperEngineCategoriesList();
    const modal = document.getElementById('superEngineModal');
    if (modal) modal.classList.remove('hidden');
}

function closeSuperEngineModal() {
    const modal = document.getElementById('superEngineModal');
    if (modal) modal.classList.add('hidden');
}

function renderSuperEngineCategoriesList() {
    const listContainer = document.getElementById('superEngineCategoryList');
    const phaseSelect = document.getElementById('superEnginePhaseSelect');
    if (!listContainer || !phaseSelect) return;

    const activePhase = phaseSelect.value;
    const items = state.categories[activePhase] || [];

    if (items.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-8 text-slate-500 text-xs">
                No active sub-categories found in this phase.
            </div>`;
        return;
    }

    listContainer.innerHTML = items.map((cat, idx) => `
        <div class="glass-card rounded-xl p-3 flex items-center justify-between gap-3 border border-white/5">
            <div class="flex items-center gap-3 min-w-0">
                <span class="text-xs font-mono text-slate-500 w-5">${idx + 1}</span>
                <div class="min-w-0">
                    <input type="text" class="glass-input text-xs font-semibold py-1 px-2 rounded w-full sm:w-64 category-rename-input" 
                           data-cat-id="${cat.id}" value="${escapeHtml(cat.name)}">
                    <div class="text-[10px] text-slate-500 mt-0.5">
                        Group: <span class="text-slate-400 font-medium">${escapeHtml(cat.category_group || 'General')}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <button type="button" class="px-2.5 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 save-cat-rename-btn cursor-pointer" 
                        data-cat-id="${cat.id}" title="Save Name Change">
                    <i class="fa-solid fa-floppy-disk"></i>
                </button>
                <button type="button" class="px-2.5 py-1 rounded text-[11px] bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 delete-cat-btn cursor-pointer" 
                        data-cat-id="${cat.id}" data-cat-name="${escapeHtml(cat.name)}" title="Deactivate Sub-Category">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        </div>
    `).join('');

    listContainer.querySelectorAll('.save-cat-rename-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.catId;
            const input = listContainer.querySelector(`.category-rename-input[data-cat-id="${catId}"]`);
            if (input) {
                await updateCategoryName(catId, input.value.trim());
            }
        });
    });

    listContainer.querySelectorAll('.delete-cat-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const catId = e.currentTarget.dataset.catId;
            const catName = e.currentTarget.dataset.catName;
            if (confirm(`Are you sure you want to disable "${catName}"?`)) {
                await deleteCategory(catId);
            }
        });
    });
}

async function handleAddNewCategory() {
    const nameInput = document.getElementById('newCategoryNameInput');
    const groupInput = document.getElementById('newCategoryGroupInput');
    const phaseSelect = document.getElementById('superEnginePhaseSelect');

    const name = nameInput ? nameInput.value.trim() : '';
    const group = (groupInput && groupInput.value.trim()) ? groupInput.value.trim() : 'General';
    const phase = phaseSelect ? phaseSelect.value : 'liasoning';

    if (!name) {
        showToast('Please enter a sub-category name', 'warning');
        return;
    }

    try {
        const nextOrder = (state.categories[phase]?.length || 0) + 1;
        const { error } = await supabase
            .from('pre_dev_categories')
            .insert({
                phase: phase,
                category_group: group,
                name: name,
                default_uom: 'Nos',
                sort_order: nextOrder,
                is_active: true
            });

        if (error) throw error;

        if (nameInput) nameInput.value = '';
        showToast(`Added "${name}" to statutory clearances!`, 'success');

        await fetchMasterCategories();
        renderSuperEngineCategoriesList();
        renderLiasoningTable();
    } catch (err) {
        console.error('Error creating category:', err.message);
        showToast('Error creating sub-category: ' + err.message, 'warning');
    }
}

async function updateCategoryName(catId, newName) {
    if (!newName) return;
    try {
        const { error } = await supabase
            .from('pre_dev_categories')
            .update({ name: newName, updated_at: new Date().toISOString() })
            .eq('id', catId);

        if (error) throw error;

        showToast('Sub-category updated!', 'success');
        await fetchMasterCategories();
        renderLiasoningTable();
    } catch (err) {
        console.error('Error updating category:', err.message);
        showToast('Error updating name', 'warning');
    }
}

async function deleteCategory(catId) {
    try {
        const { error } = await supabase
            .from('pre_dev_categories')
            .update({ is_active: false })
            .eq('id', catId);

        if (error) throw error;

        showToast('Sub-category disabled', 'info');
        await fetchMasterCategories();
        renderSuperEngineCategoriesList();
        renderLiasoningTable();
    } catch (err) {
        console.error('Error disabling category:', err.message);
        showToast('Could not disable category', 'warning');
    }
}

// ==============================================================================
// AUDIT LOGGING & DRAWER (RESILIENT UUID HANDLING)
// ==============================================================================
async function createAuditLog(phase, actionType, summary, changes = {}) {
    if (!isValidUUID(state.activeProjectId)) return;

    try {
        const actorName = state.currentUser?.full_name || 
                          state.currentUser?.displayName || 
                          localStorage.getItem('userRole') || 
                          'Site Administrator';

        const payload = {
            project_id: state.activeProjectId,
            phase: phase,
            action_type: actionType,
            summary: summary,
            changes: changes || {},
            actor_id: isValidUUID(state.userId) ? state.userId : null,
            actor_name: actorName
        };

        const { error } = await supabase
            .from('pre_dev_audit_logs')
            .insert([payload]);

        if (error) {
            console.warn('[Audit Log Write Notice]:', error.message);
        }
    } catch (err) {
        console.warn('[Audit Log Skipped]:', err.message);
    }
}

async function openAuditDrawer() {
    const drawer = document.getElementById('auditDrawer');
    const timeline = document.getElementById('auditLogTimeline');
    if (!drawer || !timeline) return;

    drawer.classList.remove('hidden');

    if (!isValidUUID(state.activeProjectId)) {
        timeline.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">Please select a project to view its audit log.</div>`;
        return;
    }

    timeline.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-xs">
            <i class="fa-solid fa-spinner fa-spin text-prayosha-amber text-sm mb-1"></i>
            <div>Loading audit history...</div>
        </div>
    `;

    try {
        let query = supabase
            .from('pre_dev_audit_logs')
            .select('*')
            .eq('project_id', state.activeProjectId)
            .order('created_at', { ascending: false })
            .limit(30);

        let { data, error } = await query;

        // Resilient fallback if created_at ordering is restricted
        if (error) {
            const fallback = await supabase
                .from('pre_dev_audit_logs')
                .select('*')
                .eq('project_id', state.activeProjectId)
                .limit(30);
            data = fallback.data;
            error = fallback.error;
        }

        if (error) throw error;

        if (!data || data.length === 0) {
            timeline.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">No audit history recorded yet for this project.</div>`;
            return;
        }

        timeline.innerHTML = data.map(log => {
            const timeAgo = formatTimeAgo(log.created_at);
            const phaseLabel = log.phase === 'liasoning' ? 'Phase 1: Liasoning' : 
                              (log.phase === 'development_cost' ? 'Phase 2: BOQ' : 'Phase 3: Site');

            return `
                <div class="glass-card rounded-xl p-3 border-l-2 border-prayosha-amber space-y-1">
                    <div class="flex items-center justify-between text-[11px]">
                        <span class="font-bold text-prayosha-amber uppercase tracking-wider">${phaseLabel}</span>
                        <span class="text-slate-500">${timeAgo}</span>
                    </div>
                    <p class="text-xs text-slate-200 font-medium">${escapeHtml(log.summary)}</p>
                    <div class="text-[10px] text-slate-400 flex items-center gap-1.5 pt-1">
                        <i class="fa-solid fa-user-shield text-[9px]"></i>
                        <span>${escapeHtml(log.actor_name || 'System Admin')}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading audit logs:', err.message);
        timeline.innerHTML = `<div class="text-center py-8 text-rose-400 text-xs">Could not load audit log history.</div>`;
    }
}

function closeAuditDrawer() {
    const drawer = document.getElementById('auditDrawer');
    if (drawer) drawer.classList.add('hidden');
}

// ==============================================================================
// BACKGROUND KPIS (PHASE 2 & PHASE 3 METRICS FETCH)
// ==============================================================================
async function fetchBackgroundKpis() {
    if (!isValidUUID(state.activeProjectId)) return;

    try {
        // Query BOQ Budget
        const { data: boqData } = await supabase
            .from('pre_dev_boq')
            .select('quantity, new_rate, old_rate')
            .eq('project_id', state.activeProjectId);

        let sumOld = 0;
        let sumNew = 0;
        (boqData || []).forEach(r => {
            const q = Number(r.quantity) || 0;
            sumOld += q * (Number(r.old_rate) || 0);
            sumNew += q * (Number(r.new_rate) || 0);
        });

        state.kpiMetrics.totalBoqBudget = sumNew;
        state.kpiMetrics.totalVariance = sumNew - sumOld;

        // Query Site Mobilization
        const { data: devData } = await supabase
            .from('pre_dev_development')
            .select('status')
            .eq('project_id', state.activeProjectId);

        state.kpiMetrics.totalDevCount = state.categories.development.length || 10;
        state.kpiMetrics.readyDevCount = (devData || []).filter(r => r.status === 'Yes').length;

    } catch (e) {
        console.warn('Background KPI calculation note:', e.message);
    }
}

// ==============================================================================
// REALTIME NOTIFICATIONS & SUBSCRIPTIONS
// ==============================================================================
function setupRealtimeSubscriptions() {
    try {
        const channel = supabase
            .channel('pre-dev-realtime-channel')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications' },
                (payload) => {
                    handleIncomingNotification(payload.new);
                }
            )
            .subscribe();

        return channel;
    } catch (err) {
        console.warn('Realtime subscription skipped:', err.message);
    }
}

function handleIncomingNotification(notification) {
    state.unreadNotificationsCount += 1;
    updateNotificationBadge();
    showToast(notification.title + ': ' + notification.message, 'info');

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
            body: notification.message,
            icon: '../icons/icon-192x192.png'
        });
    }
}

async function fetchUnreadNotifications() {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) return;

        state.unreadNotificationsCount = data?.length || 0;
        updateNotificationBadge();
    } catch (err) {
        console.warn('Could not fetch notifications:', err.message);
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    if (state.unreadNotificationsCount > 0) {
        badge.textContent = state.unreadNotificationsCount > 9 ? '9+' : state.unreadNotificationsCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function openNotificationsDrawer() {
    const drawer = document.getElementById('notificationsDrawer');
    const list = document.getElementById('notificationsList');
    if (!drawer || !list) return;

    drawer.classList.remove('hidden');

    try {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs">No notifications found.</div>`;
            return;
        }

        list.innerHTML = data.map(item => `
            <div class="glass-card rounded-xl p-3 border-l-2 ${item.is_read ? 'border-slate-700 opacity-60' : 'border-emerald-400'} space-y-1">
                <div class="flex items-center justify-between text-[11px]">
                    <span class="font-bold text-white">${escapeHtml(item.title)}</span>
                    <span class="text-slate-500">${formatTimeAgo(item.created_at)}</span>
                </div>
                <p class="text-xs text-slate-300">${escapeHtml(item.message)}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading notifications:', err.message);
    }
}

function closeNotificationsDrawer() {
    const drawer = document.getElementById('notificationsDrawer');
    if (drawer) drawer.classList.add('hidden');
}

async function markAllNotificationsRead() {
    try {
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('is_read', false);

        state.unreadNotificationsCount = 0;
        updateNotificationBadge();
        openNotificationsDrawer();
        showToast('All notifications marked as read', 'info');
    } catch (err) {
        console.error('Error marking notifications read:', err.message);
    }
}

// ==============================================================================
// KPI SUMMARY BAR UPDATES
// ==============================================================================
function resetKpiSummary() {
    const kpiLCount = document.getElementById('kpiLiasoningCount');
    const kpiLPct = document.getElementById('kpiLiasoningPercent');
    const kpiLBar = document.getElementById('kpiLiasoningBar');
    const kpiNewAmt = document.getElementById('kpiTotalNewAmount');
    const kpiVar = document.getElementById('kpiTotalVariance');
    const kpiDCount = document.getElementById('kpiDevCount');
    const kpiDPct = document.getElementById('kpiDevPercent');
    const kpiDBar = document.getElementById('kpiDevBar');

    if (kpiLCount) kpiLCount.textContent = '0 / 0';
    if (kpiLPct) kpiLPct.textContent = '0%';
    if (kpiLBar) kpiLBar.style.width = '0%';
    if (kpiNewAmt) kpiNewAmt.textContent = '0.00';
    if (kpiVar) kpiVar.textContent = '0.00';
    if (kpiDCount) kpiDCount.textContent = '0 / 0';
    if (kpiDPct) kpiDPct.textContent = '0%';
    if (kpiDBar) kpiDBar.style.width = '0%';
}

function updateKpiSummary() {
    if (!isValidUUID(state.activeProjectId)) {
        resetKpiSummary();
        return;
    }

    // 1. Liasoning Clearances Progress
    const totalLiasoning = state.categories.liasoning.length || 11;
    let approvedLiasoning = 0;
    state.categories.liasoning.forEach(c => {
        const rec = state.liasoningRecords.get(c.id);
        if (rec && rec.status === 'Yes') approvedLiasoning++;
    });

    const liasoningPct = totalLiasoning > 0 ? Math.round((approvedLiasoning / totalLiasoning) * 100) : 0;
    const kpiLCount = document.getElementById('kpiLiasoningCount');
    const kpiLPct = document.getElementById('kpiLiasoningPercent');
    const kpiLBar = document.getElementById('kpiLiasoningBar');

    if (kpiLCount) kpiLCount.textContent = `${approvedLiasoning} / ${totalLiasoning}`;
    if (kpiLPct) kpiLPct.textContent = `${liasoningPct}%`;
    if (kpiLBar) kpiLBar.style.width = `${liasoningPct}%`;

    // 2. Phase 2 BOQ Budget & Variance
    const kpiNewAmt = document.getElementById('kpiTotalNewAmount');
    const kpiVar = document.getElementById('kpiTotalVariance');
    const varIndicator = document.getElementById('kpiVarianceIndicator');
    const varIconBox = document.getElementById('kpiVarianceIconBox');

    if (kpiNewAmt) kpiNewAmt.textContent = formatNumber(state.kpiMetrics.totalBoqBudget);
    if (kpiVar) kpiVar.textContent = formatNumber(Math.abs(state.kpiMetrics.totalVariance));

    if (varIndicator && varIconBox) {
        const v = state.kpiMetrics.totalVariance;
        if (v > 0) {
            varIndicator.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> +₹${formatNumber(v)} (Escalation)`;
            varIndicator.className = 'text-[11px] font-semibold text-rose-400 flex items-center gap-1';
            varIconBox.className = 'w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center text-xl flex-shrink-0';
        } else if (v < 0) {
            varIndicator.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> -₹${formatNumber(Math.abs(v))} (Savings)`;
            varIndicator.className = 'text-[11px] font-semibold text-emerald-400 flex items-center gap-1';
            varIconBox.className = 'w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xl flex-shrink-0';
        } else {
            varIndicator.innerHTML = `<i class="fa-solid fa-minus"></i> Baseline Setup`;
            varIndicator.className = 'text-[11px] font-semibold text-slate-400 flex items-center gap-1';
            varIconBox.className = 'w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-xl flex-shrink-0';
        }
    }

    // 3. Phase 3 Site Readiness
    const totalDev = state.kpiMetrics.totalDevCount || 10;
    const readyDev = state.kpiMetrics.readyDevCount || 0;
    const devPct = totalDev > 0 ? Math.round((readyDev / totalDev) * 100) : 0;

    const kpiDCount = document.getElementById('kpiDevCount');
    const kpiDPct = document.getElementById('kpiDevPercent');
    const kpiDBar = document.getElementById('kpiDevBar');

    if (kpiDCount) kpiDCount.textContent = `${readyDev} / ${totalDev}`;
    if (kpiDPct) kpiDPct.textContent = `${devPct}%`;
    if (kpiDBar) kpiDBar.style.width = `${devPct}%`;
}

// ==============================================================================
// EVENT LISTENERS & DOM HOOKS
// ==============================================================================
function setupEventListeners() {
    // Master Save Button
    const masterSave = document.getElementById('masterSaveBtn');
    if (masterSave) {
        masterSave.addEventListener('click', () => {
            saveAllLiasoningRecords();
        });
    }

    // Live Search
    const searchInput = document.getElementById('phaseSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderLiasoningTable();
        });
    }

    // Drag & Drop File Upload
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('r2FileInput');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-prayosha-amber');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-prayosha-amber');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-prayosha-amber');
            if (e.dataTransfer.files.length) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });
    }

    const removeFileBtn = document.getElementById('removeSelectedFileBtn');
    if (removeFileBtn) {
        removeFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.uploadContext.selectedFile = null;
            document.getElementById('selectedFileChip').classList.add('hidden');
            if (fileInput) fileInput.value = '';
        });
    }

    document.getElementById('closeUploadModalBtn')?.addEventListener('click', closeUploadModal);
    document.getElementById('cancelUploadBtn')?.addEventListener('click', closeUploadModal);
    document.getElementById('confirmUploadBtn')?.addEventListener('click', handleDirectR2Upload);

    document.getElementById('openSuperEngineBtn')?.addEventListener('click', openSuperEngineModal);
    document.getElementById('closeSuperEngineBtn')?.addEventListener('click', closeSuperEngineModal);
    document.getElementById('closeSuperEngineFooterBtn')?.addEventListener('click', closeSuperEngineModal);
    document.getElementById('superEnginePhaseSelect')?.addEventListener('change', renderSuperEngineCategoriesList);
    document.getElementById('addNewCategoryBtn')?.addEventListener('click', handleAddNewCategory);

    document.getElementById('openAuditDrawerBtn')?.addEventListener('click', openAuditDrawer);
    document.getElementById('closeAuditDrawerBtn')?.addEventListener('click', closeAuditDrawer);

    document.getElementById('notificationBtn')?.addEventListener('click', openNotificationsDrawer);
    document.getElementById('closeNotificationsDrawerBtn')?.addEventListener('click', closeNotificationsDrawer);
    document.getElementById('markAllReadBtn')?.addEventListener('click', markAllNotificationsRead);

    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function handleFileSelection(file) {
    if (!file) return;
    state.uploadContext.selectedFile = file;
    const nameLabel = document.getElementById('selectedFileName');
    const chip = document.getElementById('selectedFileChip');
    if (nameLabel) nameLabel.textContent = file.name;
    if (chip) chip.classList.remove('hidden');
}

// ==============================================================================
// UTILITIES & HELPERS
// ==============================================================================
function formatNumber(num) {
    if (isNaN(num) || num === null) return '0.00';
    return Number(num).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'success' 
        ? 'bg-slate-900/90 border-emerald-500 text-white' 
        : (type === 'warning' ? 'bg-slate-900/90 border-rose-500 text-white' : 'bg-slate-900/90 border-prayosha-amber text-white');

    toast.className = `glass-card pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-xs font-semibold ${bgClass} transition-all duration-300 transform translate-y-2 opacity-0`;
    toast.innerHTML = `
        <span class="w-2 h-2 rounded-full ${type === 'success' ? 'bg-emerald-400' : (type === 'warning' ? 'bg-rose-400' : 'bg-prayosha-amber')}"></span>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3800);
}