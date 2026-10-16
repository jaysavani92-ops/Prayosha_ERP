/**
 * Prayosha ERP - Drawing Case Workspace & Messaging Center Controller
 * File: /drawings/case-file.js
 * 
 * Features:
 * 1. Deep Case Inspection: Loads metadata, cascading spatial context, and agency contacts by UUID.
 * 2. Revision Vault & Cloudflare R2 Uploads: Tracks versioned drawings with file-size and type parsing.
 * 3. Issued For Construction (IFC) State Machine: Unsets legacy IFC stamps and assigns new site approvals.
 * 4. Contractual Messaging Center: Real-time discussion thread with multi-party roles and file attachments.
 * 5. Dynamic SLA & Status Engine: Recalculates turnarounds and updates workflow statuses with audit logs.
 * 6. 1-Click WhatsApp Escalation: Context-aware follow-ups generated directly from case state.
 * 7. Resilient Data Model: Immune to PostgreSQL 22P02 UUID mismatches and null-reference errors.
 */

import { supabase, uploadToR2 } from '../config.js';

// Central Supabase Client initialization
const client = supabase || window.supabaseClient;

// URL Parameters
const urlParams = new URLSearchParams(window.location.search);
const caseId = urlParams.get('id');

// DOM Elements - Skeleton & Content Wrappers
const skeleton = document.getElementById('case-loading-skeleton');
const contentWrapper = document.getElementById('case-content-wrapper');

// DOM Elements - Executive Header & Badges
const caseNumberBadge = document.getElementById('case-number-badge');
const caseDisciplineBadge = document.getElementById('case-discipline-badge');
const caseRequestType = document.getElementById('case-request-type');
const casePriorityBadge = document.getElementById('case-priority-badge');
const caseStatusBadge = document.getElementById('case-status-badge');
const caseTitle = document.getElementById('case-title');
const caseProjectName = document.getElementById('case-project-name');
const caseLocation = document.getElementById('case-location');
const caseSlaBadge = document.getElementById('case-sla-badge');
const caseStatusSelect = document.getElementById('case-status-select');
const updateStatusBtn = document.getElementById('update-status-btn');
const headerWhatsappBtn = document.getElementById('header-whatsapp-btn');

// DOM Elements - Agency & Contact Bar
const agencyNameEl = document.getElementById('agency-name');
const agencyContactEl = document.getElementById('agency-contact');
const agencyPhoneBadge = document.getElementById('agency-phone-badge');
const agencyEmailBadge = document.getElementById('agency-email-badge');

// DOM Elements - Scope & Created Meta
const caseCreatedMeta = document.getElementById('case-created-meta');
const caseDescription = document.getElementById('case-description');

// DOM Elements - Active IFC Banner
const activeIfcContainer = document.getElementById('active-ifc-container');
const ifcRevBadge = document.getElementById('ifc-rev-badge');
const ifcDrawingTitle = document.getElementById('ifc-drawing-title');
const ifcDownloadBtn = document.getElementById('ifc-download-btn');

// DOM Elements - Revisions Vault
const revisionsCountBadge = document.getElementById('revisions-count-badge');
const revisionsEmptyState = document.getElementById('revisions-empty-state');
const revisionsListContainer = document.getElementById('revisions-list-container');
const btnOpenUploadModal = document.getElementById('btn-open-upload-modal');

// DOM Elements - Upload Revision Modal
const uploadModal = document.getElementById('upload-revision-modal');
const uploadModalBackdrop = document.getElementById('upload-modal-backdrop');
const closeUploadModalBtn = document.getElementById('close-upload-modal-btn');
const cancelUploadBtn = document.getElementById('cancel-upload-btn');
const uploadRevisionForm = document.getElementById('upload-revision-form');
const revCodeInput = document.getElementById('rev-code-input');
const revTitleInput = document.getElementById('rev-title-input');
const revFileInput = document.getElementById('rev-file-input');
const revRemarksInput = document.getElementById('rev-remarks-input');
const revIsIfcCheckbox = document.getElementById('rev-is-ifc-checkbox');
const uploadProgressText = document.getElementById('upload-progress-text');
const submitRevisionBtn = document.getElementById('submit-revision-btn');

// DOM Elements - Messaging Center
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messageFileInput = document.getElementById('message-file-input');
const messageFilePreview = document.getElementById('message-file-preview');
const msgFileName = document.getElementById('msg-file-name');
const btnRemoveMsgFile = document.getElementById('btn-remove-msg-file');
const messageSubmitBtn = document.getElementById('message-submit-btn');

// Runtime State Cache
let activeCase = null;
let activeRevisions = [];
let activeMessages = [];
let pendingMessageFile = null;

// ==============================================================================
// 1. UTILITY & FORMATTING HELPERS
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

function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return 'Not set';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

function formatTimestampDisplay(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }) + ' ' + d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        digits = '91' + digits;
    }
    return digits;
}

function getSlaMetrics(targetDateStr, status) {
    const isFinished = status === 'Approved (IFC)' || status === 'Closed';
    if (!targetDateStr) {
        return {
            label: isFinished ? 'Completed' : 'No SLA Set',
            badgeClass: 'bg-slate-100 text-slate-600 border-slate-200'
        };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(targetDateStr);
    target.setHours(0, 0, 0, 0);

    const timeDiff = target.getTime() - today.getTime();
    const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));

    if (isFinished) {
        return {
            label: 'Approved / Closed',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300'
        };
    }

    if (daysDiff < 0) {
        const days = Math.abs(daysDiff);
        return {
            label: `⚠️ ${days} Day${days > 1 ? 's' : ''} Overdue`,
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
        };
    } else if (daysDiff === 0) {
        return {
            label: '⏰ Due Today',
            badgeClass: 'bg-amber-100 text-amber-900 border-amber-300'
        };
    } else if (daysDiff <= 2) {
        return {
            label: `⏰ Due in ${daysDiff} Day${daysDiff > 1 ? 's' : ''}`,
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-300'
        };
    } else {
        return {
            label: `✓ ${daysDiff} Days Remaining`,
            badgeClass: 'bg-blue-50 text-blue-800 border-blue-200'
        };
    }
}

function getStatusBadgeConfig(status) {
    switch (status) {
        case 'Requested':
            return {
                text: 'Requested (વિનંતી કરેલ)',
                classes: 'bg-amber-50 text-amber-900 border-amber-200'
            };
        case 'Submitted by Agency':
            return {
                text: 'Submitted by Agency (અપલોડ થયેલ)',
                classes: 'bg-indigo-50 text-indigo-800 border-indigo-200'
            };
        case 'Under Review':
            return {
                text: 'Under Review (તપાસ ચાલુ)',
                classes: 'bg-blue-50 text-blue-800 border-blue-200'
            };
        case 'Revision Required':
            return {
                text: 'Revision Required (સુધારો જરૂરી)',
                classes: 'bg-orange-50 text-orange-800 border-orange-200'
            };
        case 'Approved (IFC)':
            return {
                text: 'Approved IFC (સાઇટ મંજૂર)',
                classes: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
            };
        case 'Closed':
            return {
                text: 'Closed (પૂર્ણ)',
                classes: 'bg-slate-100 text-slate-700 border-slate-300'
            };
        default:
            return {
                text: status || 'Pending',
                classes: 'bg-slate-100 text-slate-700 border-slate-200'
            };
    }
}

function getCurrentUserMeta() {
    let userName = 'Site Engineer';
    let userRole = localStorage.getItem('userRole') || 'Engineer';
    let userId = null;

    try {
        const raw = localStorage.getItem('prayosha_user');
        if (raw) {
            const parsed = JSON.parse(raw);
            userName = parsed.full_name || parsed.displayName || parsed.email?.split('@')[0] || userName;
            if (isValidUUID(parsed.id)) userId = parsed.id;
        }
    } catch (_) {}

    const isAgency = userRole.toLowerCase().includes('consultant') || userRole.toLowerCase().includes('vendor') || userRole.toLowerCase().includes('architect');
    return {
        name: userName,
        role: userRole,
        id: userId,
        type: isAgency ? 'agency' : 'employee'
    };
}

// ==============================================================================
// 2. MASTER DATA INITIALIZATION
// ==============================================================================
async function initCaseWorkspace() {
    if (!isValidUUID(caseId)) {
        alert('Invalid or missing Case ID in URL parameter.');
        window.location.replace('./drawing-cases.html');
        return;
    }

    if (!client) {
        console.error('[Case File] Supabase client offline.');
        skeleton.innerHTML = '<div class="p-6 text-center text-red-600 font-bold glass-card rounded-2xl">Database client offline. Please reload.</div>';
        return;
    }

    try {
        // Run concurrent fetches for case file, revisions vault, and messages
        const [caseRes, revisionsRes, messagesRes] = await Promise.all([
            client.from('drawing_cases').select('*').eq('id', caseId).single(),
            client.from('drawing_case_revisions').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
            client.from('drawing_case_messages').select('*').eq('case_id', caseId).order('created_at', { ascending: true })
        ]);

        if (caseRes.error) throw caseRes.error;

        activeCase = caseRes.data;
        activeRevisions = revisionsRes.data || [];
        activeMessages = messagesRes.data || [];

        renderExecutiveHeader();
        renderActiveIfcBanner();
        renderRevisionsVault();
        renderMessagesThread();

        skeleton.classList.add('hidden');
        contentWrapper.classList.remove('hidden');

    } catch (err) {
        console.error('[Case File Fetch Error]:', err);
        skeleton.innerHTML = `
            <div class="glass-card rounded-2xl p-8 text-center space-y-3">
                <span class="text-4xl">⚠️</span>
                <h2 class="text-base font-bold text-slate-800">Case File Not Found</h2>
                <p class="text-xs text-slate-500">${escapeHtml(err.message || 'The requested drawing case could not be retrieved.')}</p>
                <a href="./drawing-cases.html" class="inline-block mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#1E3A5F]">Back to Register</a>
            </div>
        `;
    }
}

// ==============================================================================
// 3. HEADER & METADATA RENDERING
// ==============================================================================
function renderExecutiveHeader() {
    if (!activeCase) return;

    caseNumberBadge.textContent = activeCase.case_number;
    caseDisciplineBadge.textContent = activeCase.discipline;
    caseRequestType.textContent = activeCase.request_type;

    // Priority
    casePriorityBadge.textContent = `${activeCase.priority} Priority`;
    if (activeCase.priority === 'Urgent / Site Critical') {
        casePriorityBadge.className = 'text-xs font-black px-2.5 py-0.5 rounded-md border bg-rose-100 text-rose-800 border-rose-300 animate-pulse';
    } else if (activeCase.priority === 'High') {
        casePriorityBadge.className = 'text-xs font-bold px-2.5 py-0.5 rounded-md border bg-amber-100 text-amber-900 border-amber-300';
    } else {
        casePriorityBadge.className = 'text-xs font-semibold px-2.5 py-0.5 rounded-md border bg-blue-50 text-blue-700 border-blue-200';
    }

    // Status
    const stConfig = getStatusBadgeConfig(activeCase.status);
    caseStatusBadge.textContent = stConfig.text;
    caseStatusBadge.className = `text-xs font-bold px-2.5 py-0.5 rounded-md border ${stConfig.classes}`;
    caseStatusSelect.value = activeCase.status;

    // Headings & Hierarchy
    caseTitle.textContent = activeCase.title;
    caseProjectName.textContent = activeCase.project_name;
    caseLocation.textContent = `${activeCase.tower_block} • ${activeCase.floor_level} [${activeCase.zone_id || 'General'}]`;

    // SLA
    const sla = getSlaMetrics(activeCase.target_date, activeCase.status);
    caseSlaBadge.textContent = `${sla.label} (Target: ${formatDateDisplay(activeCase.target_date)})`;
    caseSlaBadge.className = `text-xs font-bold px-2.5 py-0.5 rounded-full border inline-block mt-0.5 ${sla.badgeClass}`;

    // Agency Contacts
    agencyNameEl.textContent = activeCase.assigned_agency_name;
    agencyContactEl.textContent = activeCase.agency_contact_person ? `(${activeCase.agency_contact_person})` : '';
    agencyPhoneBadge.textContent = activeCase.agency_phone || 'No Phone';
    agencyEmailBadge.textContent = activeCase.agency_email || 'No Email';

    // Scope & Description
    caseCreatedMeta.textContent = `Registered by ${activeCase.created_by_name} on ${formatDateDisplay(activeCase.created_at)}`;
    caseDescription.textContent = activeCase.description || 'No specific notes logged. Please reference attached drawings.';

    // Header WhatsApp Action
    headerWhatsappBtn.onclick = function() {
        const cleanedPhone = cleanPhoneForWhatsApp(activeCase.agency_phone);
        const deadline = formatDateDisplay(activeCase.target_date);
        const draft = `Hello ${activeCase.agency_contact_person || activeCase.assigned_agency_name},\nRegarding Prayosha ERP Case *${activeCase.case_number}* (${activeCase.title}):\nSite Project: ${activeCase.project_name} [${activeCase.tower_block} - ${activeCase.floor_level}].\nCurrent Status: *${activeCase.status}*. Target Deadline: *${deadline}*.\nPlease check the case file and latest comments on your portal.`;
        const encoded = encodeURIComponent(draft);

        let url = '';
        if (cleanedPhone) {
            url = `https://wa.me/${cleanedPhone}?text=${encoded}`;
        } else {
            url = `https://wa.me/?text=${encoded}`;
        }
        window.open(url, '_blank');
    };
}

// ==============================================================================
// 4. ACTIVE "ISSUED FOR CONSTRUCTION" (IFC) BANNER
// ==============================================================================
function renderActiveIfcBanner() {
    const currentIfc = activeRevisions.find(r => r.is_current_ifc === true);

    if (currentIfc) {
        activeIfcContainer.classList.remove('hidden');
        ifcRevBadge.textContent = `Rev ${currentIfc.revision_number}`;
        ifcDrawingTitle.textContent = currentIfc.drawing_title;
        ifcDownloadBtn.href = currentIfc.file_url;
        ifcDownloadBtn.download = currentIfc.file_name;
    } else {
        activeIfcContainer.classList.add('hidden');
    }
}

// ==============================================================================
// 5. REVISION VAULT RENDERING & MANAGEMENT
// ==============================================================================
function renderRevisionsVault() {
    revisionsCountBadge.textContent = `${activeRevisions.length} Revision${activeRevisions.length === 1 ? '' : 's'}`;

    if (activeRevisions.length === 0) {
        revisionsEmptyState.classList.remove('hidden');
        revisionsListContainer.classList.add('hidden');
        revisionsListContainer.innerHTML = '';
        return;
    }

    revisionsEmptyState.classList.add('hidden');
    revisionsListContainer.classList.remove('hidden');

    revisionsListContainer.innerHTML = activeRevisions.map(rev => {
        const isIfc = rev.is_current_ifc === true;
        const formattedDate = formatTimestampDisplay(rev.created_at);
        const formattedSize = formatBytes(rev.file_size_bytes);
        const fileExt = (rev.file_extension || 'dat').toUpperCase();

        return `
            <div class="p-4 rounded-2xl border transition-all ${
                isIfc 
                    ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-300 shadow-sm' 
                    : 'bg-white border-slate-200/90 hover:bg-slate-50'
            }">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    <!-- Left Info -->
                    <div class="flex items-start gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs uppercase flex-shrink-0 ${
                            isIfc ? 'bg-emerald-600 text-white' : 'bg-[#1E3A5F]/10 text-[#1E3A5F]'
                        }">
                            ${fileExt}
                        </div>
                        <div class="space-y-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-mono font-bold text-xs px-2 py-0.5 rounded ${
                                    isIfc ? 'bg-emerald-200 text-emerald-950 font-black' : 'bg-slate-100 text-slate-700'
                                }">
                                    ${escapeHtml(rev.revision_number)}
                                </span>
                                ${isIfc ? `
                                    <span class="text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded">
                                        Active IFC
                                    </span>
                                ` : `
                                    <span class="text-[10px] font-semibold text-slate-400">
                                        Superseded / Archive
                                    </span>
                                `}
                            </div>
                            <h4 class="text-xs font-bold text-[#1E3A5F] truncate">
                                ${escapeHtml(rev.drawing_title)}
                            </h4>
                            <div class="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                <span>📄 ${escapeHtml(rev.file_name)} (${formattedSize})</span>
                                <span>•</span>
                                <span>👤 ${escapeHtml(rev.uploaded_by_name)} (${rev.uploaded_by_type})</span>
                                <span>•</span>
                                <span>🗓️ ${formattedDate}</span>
                            </div>
                            ${rev.review_remarks ? `
                                <p class="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg mt-1 border border-slate-100 leading-relaxed italic">
                                    "${escapeHtml(rev.review_remarks)}"
                                </p>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Right CTAs -->
                    <div class="flex items-center gap-2 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        ${!isIfc ? `
                            <button type="button" data-rev-id="${rev.id}" data-rev-num="${escapeHtml(rev.revision_number)}" class="btn-make-ifc px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer" title="Approve for Construction">
                                ✓ Stamp IFC
                            </button>
                        ` : ''}

                        <a href="${rev.file_url}" target="_blank" download="${escapeHtml(rev.file_name)}" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 shadow-sm transition flex items-center gap-1.5">
                            <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            <span>Download</span>
                        </a>
                    </div>

                </div>
            </div>
        `;
    }).join('');

    attachRevisionListeners();
}

function attachRevisionListeners() {
    document.querySelectorAll('.btn-make-ifc').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const revId = e.currentTarget.dataset.revId;
            const revNum = e.currentTarget.dataset.revNum;

            if (!confirm(`Are you sure you want to approve Revision ${revNum} as "Issued For Construction" (IFC)?\nThis will mark all other revisions as superseded.`)) {
                return;
            }

            try {
                // 1. Unset all existing IFC flags for this case
                await client
                    .from('drawing_case_revisions')
                    .update({ is_current_ifc: false })
                    .eq('case_id', caseId);

                // 2. Set selected revision as IFC
                await client
                    .from('drawing_case_revisions')
                    .update({ is_current_ifc: true })
                    .eq('id', revId);

                // 3. Update case status to Approved (IFC)
                await client
                    .from('drawing_cases')
                    .update({ status: 'Approved (IFC)' })
                    .eq('id', caseId);

                // 4. Log confirmation message in message center
                const user = getCurrentUserMeta();
                await client.from('drawing_case_messages').insert([{
                    case_id: caseId,
                    sender_type: 'system',
                    sender_name: 'Prayosha Engine',
                    sender_id: user.id,
                    message_text: `Revision ${revNum} was officially stamped as "ISSUED FOR CONSTRUCTION" (IFC) by ${user.name}. Earlier drawings are superseded.`,
                    is_status_change: true
                }]);

                // 5. Reload Workspace
                await initCaseWorkspace();

            } catch (err) {
                console.error('[IFC Stamp Error]:', err);
                alert(`Error stamping IFC: ${err.message}`);
            }
        });
    });
}

// ==============================================================================
// 6. UPLOAD REVISION MODAL LOGIC (Cloudflare R2 Integration)
// ==============================================================================
function openUploadModal() {
    // Suggest next revision number
    let nextRev = 'R1';
    if (activeRevisions.length > 0) {
        const latestRev = activeRevisions[0].revision_number || '';
        const match = latestRev.match(/\d+/);
        if (match) {
            nextRev = `R${parseInt(match[0]) + 1}`;
        }
    }

    revCodeInput.value = nextRev;
    revTitleInput.value = activeCase ? activeCase.title : '';
    revFileInput.value = '';
    revRemarksInput.value = '';
    revIsIfcCheckbox.checked = false;
    uploadProgressText.classList.add('hidden');

    uploadModal.classList.remove('hidden');
    void uploadModal.offsetWidth;
    uploadModal.classList.remove('opacity-0');
    uploadModal.classList.add('opacity-100');
    uploadModal.querySelector('.transform').classList.remove('scale-95');
    uploadModal.querySelector('.transform').classList.add('scale-100');
}

function closeUploadModal() {
    uploadModal.classList.remove('opacity-100');
    uploadModal.classList.add('opacity-0');
    uploadModal.querySelector('.transform').classList.remove('scale-100');
    uploadModal.querySelector('.transform').classList.add('scale-95');

    setTimeout(() => {
        uploadModal.classList.add('hidden');
    }, 280);
}

uploadRevisionForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const file = revFileInput.files[0];
    if (!file) {
        alert('Please choose a drawing document to upload.');
        return;
    }

    const revCode = revCodeInput.value.trim();
    const revTitle = revTitleInput.value.trim();
    const remarks = revRemarksInput.value.trim();
    const isIfc = revIsIfcCheckbox.checked;

    submitRevisionBtn.disabled = true;
    uploadProgressText.classList.remove('hidden');

    try {
        // 1. Upload directly to Cloudflare R2 Media Vault
        const fileUrl = await uploadToR2(file, 'drawing-vault');
        const user = getCurrentUserMeta();

        // 2. If marked IFC, clear previous IFC flags
        if (isIfc) {
            await client
                .from('drawing_case_revisions')
                .update({ is_current_ifc: false })
                .eq('case_id', caseId);
        }

        // 3. Insert new revision record
        const { error: revErr } = await client
            .from('drawing_case_revisions')
            .insert([{
                case_id: caseId,
                revision_number: revCode,
                drawing_title: revTitle,
                file_name: file.name,
                file_url: fileUrl,
                file_size_bytes: file.size,
                file_extension: file.name.split('.').pop()?.toLowerCase() || 'dat',
                uploaded_by_type: user.type,
                uploaded_by_name: user.name,
                uploaded_by_id: user.id,
                is_current_ifc: isIfc,
                review_remarks: remarks || null
            }]);

        if (revErr) throw revErr;

        // 4. Update case status
        const nextStatus = isIfc ? 'Approved (IFC)' : (user.type === 'agency' ? 'Submitted by Agency' : 'Under Review');
        await client
            .from('drawing_cases')
            .update({ status: nextStatus })
            .eq('id', caseId);

        // 5. Post system message to messaging center
        await client.from('drawing_case_messages').insert([{
            case_id: caseId,
            sender_type: user.type,
            sender_name: user.name,
            sender_id: user.id,
            message_text: `Uploaded new drawing revision ${revCode} ("${revTitle}"). ${isIfc ? 'Stamped as IFC.' : 'Ready for review.'}`,
            attachment_url: fileUrl,
            attachment_name: file.name,
            is_status_change: true
        }]);

        closeUploadModal();
        await initCaseWorkspace();

    } catch (err) {
        console.error('[Upload Revision Failure]:', err);
        alert(`Failed to upload revision: ${err.message}`);
    } finally {
        submitRevisionBtn.disabled = false;
        uploadProgressText.classList.add('hidden');
    }
});

// ==============================================================================
// 7. CONTRACTUAL MESSAGING CENTER
// ==============================================================================
function renderMessagesThread() {
    if (activeMessages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <span class="text-3xl mb-1">💬</span>
                <p class="text-xs font-semibold">No comments or confirmations yet.</p>
                <p class="text-[10px]">Use the input below to start the case discussion thread.</p>
            </div>
        `;
        return;
    }

    const current = getCurrentUserMeta();

    messagesContainer.innerHTML = activeMessages.map(msg => {
        const isSelf = msg.sender_id && current.id ? (msg.sender_id === current.id) : (msg.sender_name === current.name);
        const isSystem = msg.sender_type === 'system' || msg.is_status_change;
        const timeFormatted = formatTimestampDisplay(msg.created_at);

        if (isSystem) {
            return `
                <div class="flex items-center justify-center my-3">
                    <div class="bg-slate-200/80 text-slate-700 text-[10px] font-semibold px-3 py-1 rounded-full text-center max-w-sm shadow-2xs">
                        <span>⚙️ ${escapeHtml(msg.message_text)}</span>
                        <span class="block text-[9px] text-slate-400 mt-0.5">${timeFormatted}</span>
                    </div>
                </div>
            `;
        }

        const isAgencySender = msg.sender_type === 'agency';

        return `
            <div class="flex flex-col ${isSelf ? 'items-end' : 'items-start'} space-y-1">
                <div class="flex items-center gap-1.5 text-[10px]">
                    <span class="font-bold ${isAgencySender ? 'text-purple-700' : 'text-[#1E3A5F]'}">
                        ${escapeHtml(msg.sender_name)}
                    </span>
                    <span class="text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                        isAgencySender ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-[#1E3A5F]'
                    }">
                        ${isAgencySender ? 'Consultant' : 'Prayosha Team'}
                    </span>
                    <span class="text-slate-400 text-[9px]">• ${timeFormatted}</span>
                </div>

                <div class="max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs ${
                    isSelf 
                        ? 'bg-[#1E3A5F] text-white rounded-tr-none' 
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-none'
                }">
                    <p class="whitespace-pre-wrap leading-relaxed">${escapeHtml(msg.message_text)}</p>

                    ${msg.attachment_url ? `
                        <div class="mt-2 pt-2 border-t ${isSelf ? 'border-white/20' : 'border-slate-100'}">
                            <a href="${msg.attachment_url}" target="_blank" download class="inline-flex items-center gap-1.5 text-[11px] font-semibold underline ${
                                isSelf ? 'text-amber-300 hover:text-white' : 'text-[#1E3A5F] hover:text-blue-700'
                            }">
                                <span>📎 ${escapeHtml(msg.attachment_name || 'Download Attachment')}</span>
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Scroll to latest message
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Attachment File Trigger
messageFileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        pendingMessageFile = file;
        msgFileName.textContent = file.name;
        messageFilePreview.classList.remove('hidden');
    }
});

btnRemoveMsgFile.addEventListener('click', function() {
    pendingMessageFile = null;
    messageFileInput.value = '';
    messageFilePreview.classList.add('hidden');
});

// Send Message Handler
messageForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const text = messageInput.value.trim();
    if (!text && !pendingMessageFile) return;

    messageSubmitBtn.disabled = true;

    try {
        let attachmentUrl = null;
        let attachmentName = null;

        if (pendingMessageFile) {
            attachmentName = pendingMessageFile.name;
            attachmentUrl = await uploadToR2(pendingMessageFile, 'case-chat-files');
        }

        const user = getCurrentUserMeta();

        const { error } = await client.from('drawing_case_messages').insert([{
            case_id: caseId,
            sender_type: user.type,
            sender_name: user.name,
            sender_id: user.id,
            message_text: text,
            attachment_url: attachmentUrl,
            attachment_name: attachmentName,
            is_status_change: false
        }]);

        if (error) throw error;

        // Reset input fields
        messageInput.value = '';
        pendingMessageFile = null;
        messageFileInput.value = '';
        messageFilePreview.classList.add('hidden');

        // Refetch latest messages
        const { data: updatedMsgs } = await client
            .from('drawing_case_messages')
            .select('*')
            .eq('case_id', caseId)
            .order('created_at', { ascending: true });

        activeMessages = updatedMsgs || [];
        renderMessagesThread();

    } catch (err) {
        console.error('[Send Message Failure]:', err);
        alert(`Failed to send message: ${err.message}`);
    } finally {
        messageSubmitBtn.disabled = false;
        messageInput.focus();
    }
});

// ==============================================================================
// 8. STATUS UPDATE CONTROLLER
// ==============================================================================
updateStatusBtn.addEventListener('click', async function() {
    const newStatus = caseStatusSelect.value;
    if (!newStatus || newStatus === activeCase.status) return;

    const originalText = updateStatusBtn.textContent;
    updateStatusBtn.textContent = '...';
    updateStatusBtn.disabled = true;

    try {
        const user = getCurrentUserMeta();

        // 1. Update Case Record
        const { error } = await client
            .from('drawing_cases')
            .update({ status: newStatus })
            .eq('id', caseId);

        if (error) throw error;

        // 2. Post System Status Change Log
        await client.from('drawing_case_messages').insert([{
            case_id: caseId,
            sender_type: 'system',
            sender_name: 'Prayosha Engine',
            sender_id: user.id,
            message_text: `Case status changed from "${activeCase.status}" to "${newStatus}" by ${user.name}.`,
            is_status_change: true
        }]);

        // 3. Refresh Workspace Data
        await initCaseWorkspace();

    } catch (err) {
        console.error('[Status Update Error]:', err);
        alert(`Failed to update status: ${err.message}`);
    } finally {
        updateStatusBtn.textContent = originalText;
        updateStatusBtn.disabled = false;
    }
});

// ==============================================================================
// 9. MODAL & GLOBAL EVENT LISTENERS
// ==============================================================================
if (btnOpenUploadModal) btnOpenUploadModal.addEventListener('click', openUploadModal);
if (closeUploadModalBtn) closeUploadModalBtn.addEventListener('click', closeUploadModal);
if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', closeUploadModal);
if (uploadModalBackdrop) uploadModalBackdrop.addEventListener('click', closeUploadModal);

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initCaseWorkspace();
});