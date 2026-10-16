/**
 * Prayosha ERP - Drawing Cases & Agency Register Controller
 * File: /drawings/drawing-cases.js
 * 
 * Features:
 * 1. Project Context Synchronization: Automatically filters cases by active project selected in shell.js.
 * 2. Real-Time KPI Analytics: Computes counts for Pending Agency, Under Site Review, Approved IFC, and Overdue cases.
 * 3. Multi-Faceted Query Filtering: Search by text, discipline, priority, SLA turnaround, and status tabs.
 * 4. SLA & Turnaround Escalation Engine: Calculates days remaining or overdue against target delivery dates.
 * 5. Direct WhatsApp Escalation Modal: Pre-drafts contextual follow-ups and launches WhatsApp API.
 * 6. Resilient Database Queries: Built with UUID checks and safe column mapping for PostgreSQL.
 */

import { supabase } from '../config.js';

// Central Supabase Client initialization
const client = supabase || window.supabaseClient;

// DOM Elements - Header & Global Actions
const activeProjectBadge = document.getElementById('header-active-project-badge');
const refreshBtn = document.getElementById('refreshBtn');

// DOM Elements - KPI Metrics
const kpiTotalCases = document.getElementById('kpi-total-cases');
const kpiPendingAgency = document.getElementById('kpi-pending-agency');
const kpiUnderReview = document.getElementById('kpi-under-review');
const kpiApprovedIfc = document.getElementById('kpi-approved-ifc');
const kpiOverdueCases = document.getElementById('kpi-overdue-cases');

// DOM Elements - Filters & Search
const searchInput = document.getElementById('searchInput');
const filterDiscipline = document.getElementById('filterDiscipline');
const filterPriority = document.getElementById('filterPriority');
const filterSla = document.getElementById('filterSla');
const statusTabs = document.querySelectorAll('.status-tab');

// Tab Counter Badges
const tabCntAll = document.getElementById('tab-cnt-all');
const tabCntRequested = document.getElementById('tab-cnt-requested');
const tabCntSubmitted = document.getElementById('tab-cnt-submitted');
const tabCntReview = document.getElementById('tab-cnt-review');
const tabCntRevision = document.getElementById('tab-cnt-revision');
const tabCntApproved = document.getElementById('tab-cnt-approved');
const tabCntClosed = document.getElementById('tab-cnt-closed');

// DOM Elements - Containers & Lists
const skeletonLoader = document.getElementById('cases-loading-skeleton');
const emptyState = document.getElementById('cases-empty-state');
const casesContainer = document.getElementById('cases-list-container');

// DOM Elements - Escalation & Reminder Modal
const escModal = document.getElementById('escalation-modal');
const escModalBackdrop = document.getElementById('escalation-modal-backdrop');
const closeEscModalBtn = document.getElementById('close-escalation-modal');
const cancelEscBtn = document.getElementById('esc-cancel-btn');
const escCaseNo = document.getElementById('esc-case-no');
const escCaseTitle = document.getElementById('esc-case-title');
const escAgencyName = document.getElementById('esc-agency-name');
const escDelayBadge = document.getElementById('esc-delay-badge');
const escMessageTextarea = document.getElementById('esc-message-textarea');
const escSendWaBtn = document.getElementById('esc-send-wa-btn');

// Runtime State
let rawCases = [];
let activeFilterStatus = '';
let activeDiscipline = '';
let activePriority = '';
let activeSla = '';
let activeSearchQuery = '';
let activeCaseForEscalation = null;

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

function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        digits = '91' + digits;
    }
    return digits;
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return 'Not set';
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

/**
 * Calculates SLA turnaround state:
 * - 'overdue': Past deadline and not yet approved/closed
 * - 'due_today': Due today or within next 48 hours
 * - 'on_track': Ahead of schedule
 * - 'completed': Case is closed or approved IFC
 */
function getSlaMetrics(targetDateStr, status) {
    const isFinished = status === 'Approved (IFC)' || status === 'Closed';
    if (!targetDateStr) {
        return {
            status: isFinished ? 'completed' : 'on_track',
            daysDiff: 0,
            label: isFinished ? 'Completed' : 'No SLA set',
            badgeClass: 'bg-slate-100 text-slate-600 border-slate-200'
        };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(targetDateStr);
    targetDate.setHours(0, 0, 0, 0);

    const timeDiff = targetDate.getTime() - today.getTime();
    const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));

    if (isFinished) {
        return {
            status: 'completed',
            daysDiff: daysDiff,
            label: 'Approved / Closed',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300'
        };
    }

    if (daysDiff < 0) {
        const overdueDays = Math.abs(daysDiff);
        return {
            status: 'overdue',
            daysDiff: daysDiff,
            label: `${overdueDays} Day${overdueDays > 1 ? 's' : ''} Overdue`,
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
        };
    } else if (daysDiff === 0) {
        return {
            status: 'due_today',
            daysDiff: daysDiff,
            label: 'Due Today',
            badgeClass: 'bg-amber-100 text-amber-900 border-amber-300'
        };
    } else if (daysDiff <= 2) {
        return {
            status: 'due_today',
            daysDiff: daysDiff,
            label: `Due in ${daysDiff} Day${daysDiff > 1 ? 's' : ''}`,
            badgeClass: 'bg-amber-100 text-amber-800 border-amber-300'
        };
    } else {
        return {
            status: 'on_track',
            daysDiff: daysDiff,
            label: `${daysDiff} Days Remaining`,
            badgeClass: 'bg-blue-50 text-blue-800 border-blue-200'
        };
    }
}

// Badge styling helper for Case Statuses
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
                text: 'Approved (IFC - સાઇટ મંજૂર)',
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

// Badge styling helper for Priorities
function getPriorityBadgeConfig(priority) {
    switch (priority) {
        case 'Urgent / Site Critical':
            return {
                label: '🚨 Urgent',
                classes: 'bg-rose-100 text-rose-800 border-rose-300 font-extrabold'
            };
        case 'High':
            return {
                label: '⚡ High',
                classes: 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
            };
        case 'Medium':
            return {
                label: 'Medium',
                classes: 'bg-blue-50 text-blue-700 border-blue-200'
            };
        case 'Low':
            return {
                label: 'Low',
                classes: 'bg-slate-100 text-slate-600 border-slate-200'
            };
        default:
            return {
                label: priority || 'Medium',
                classes: 'bg-slate-100 text-slate-600 border-slate-200'
            };
    }
}

// Discipline color helper
function getDisciplineBadgeClass(discipline) {
    const d = (discipline || '').toLowerCase();
    if (d.includes('arch')) return 'bg-purple-50 text-purple-800 border-purple-200';
    if (d.includes('struct')) return 'bg-blue-50 text-blue-800 border-blue-200';
    if (d.includes('mep') || d.includes('plumb') || d.includes('elect')) return 'bg-cyan-50 text-cyan-800 border-cyan-200';
    if (d.includes('fire')) return 'bg-rose-50 text-rose-800 border-rose-200';
    if (d.includes('land')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (d.includes('liason') || d.includes('noc')) return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
}

// ==============================================================================
// 2. DATA FETCHING & KPI CALCULATIONS
// ==============================================================================
async function loadDrawingCases() {
    skeletonLoader.classList.remove('hidden');
    casesContainer.classList.add('hidden');
    emptyState.classList.add('hidden');

    const activeProjectId = localStorage.getItem('activeProjectId');
    const activeProjectName = localStorage.getItem('activeProjectName') || 'Current Site';

    if (activeProjectBadge) {
        activeProjectBadge.textContent = activeProjectName;
    }

    if (!client) {
        console.warn('[Drawing Register] Supabase client offline.');
        skeletonLoader.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    try {
        let query = client
            .from('drawing_cases')
            .select('*')
            .order('created_at', { ascending: false });

        // Filter by project if genuine UUID exists[cite: 13]
        if (isValidUUID(activeProjectId)) {
            query = query.eq('project_id', activeProjectId);
        }

        const { data, error } = await query;

        if (error) throw error;

        rawCases = data || [];
        updateKpiMetrics(rawCases);
        applyFiltersAndRender();

    } catch (err) {
        console.error('[Drawing Register] Fetch error:', err);
        rawCases = [];
        updateKpiMetrics([]);
        applyFiltersAndRender();
    } finally {
        skeletonLoader.classList.add('hidden');
    }
}

function updateKpiMetrics(cases) {
    const total = cases.length;
    let pendingAgency = 0;
    let underReview = 0;
    let approvedIfc = 0;
    let overdue = 0;

    let cntRequested = 0;
    let cntSubmitted = 0;
    let cntReview = 0;
    let cntRevision = 0;
    let cntApproved = 0;
    let cntClosed = 0;

    cases.forEach(c => {
        const status = c.status;
        const sla = getSlaMetrics(c.target_date, status);

        // KPI Counts
        if (status === 'Requested' || status === 'Revision Required') {
            pendingAgency++;
        }
        if (status === 'Submitted by Agency' || status === 'Under Review') {
            underReview++;
        }
        if (status === 'Approved (IFC)') {
            approvedIfc++;
        }
        if (sla.status === 'overdue') {
            overdue++;
        }

        // Tab Counts
        if (status === 'Requested') cntRequested++;
        else if (status === 'Submitted by Agency') cntSubmitted++;
        else if (status === 'Under Review') cntReview++;
        else if (status === 'Revision Required') cntRevision++;
        else if (status === 'Approved (IFC)') cntApproved++;
        else if (status === 'Closed') cntClosed++;
    });

    // Update KPI Displays
    if (kpiTotalCases) kpiTotalCases.textContent = total;
    if (kpiPendingAgency) kpiPendingAgency.textContent = pendingAgency;
    if (kpiUnderReview) kpiUnderReview.textContent = underReview;
    if (kpiApprovedIfc) kpiApprovedIfc.textContent = approvedIfc;
    if (kpiOverdueCases) kpiOverdueCases.textContent = overdue;

    // Update Tab Count Badges
    if (tabCntAll) tabCntAll.textContent = total;
    if (tabCntRequested) tabCntRequested.textContent = cntRequested;
    if (tabCntSubmitted) tabCntSubmitted.textContent = cntSubmitted;
    if (tabCntReview) tabCntReview.textContent = cntReview;
    if (tabCntRevision) tabCntRevision.textContent = cntRevision;
    if (tabCntApproved) tabCntApproved.textContent = cntApproved;
    if (tabCntClosed) tabCntClosed.textContent = cntClosed;
}

// ==============================================================================
// 3. FILTERING & CARD RENDERING ENGINE
// ==============================================================================
function applyFiltersAndRender() {
    let filtered = [...rawCases];

    // 1. Status Tab Filter
    if (activeFilterStatus) {
        filtered = filtered.filter(c => c.status === activeFilterStatus);
    }

    // 2. Discipline Filter
    if (activeDiscipline) {
        filtered = filtered.filter(c => c.discipline === activeDiscipline);
    }

    // 3. Priority Filter
    if (activePriority) {
        filtered = filtered.filter(c => c.priority === activePriority);
    }

    // 4. SLA Filter
    if (activeSla) {
        filtered = filtered.filter(c => {
            const sla = getSlaMetrics(c.target_date, c.status);
            return sla.status === activeSla;
        });
    }

    // 5. Search Text Filter
    if (activeSearchQuery) {
        const q = activeSearchQuery.toLowerCase();
        filtered = filtered.filter(c => {
            const matchNo = (c.case_number || '').toLowerCase().includes(q);
            const matchTitle = (c.title || '').toLowerCase().includes(q);
            const matchAgency = (c.assigned_agency_name || '').toLowerCase().includes(q);
            const matchTower = (c.tower_block || '').toLowerCase().includes(q);
            const matchFloor = (c.floor_level || '').toLowerCase().includes(q);
            const matchZone = (c.zone_id || '').toLowerCase().includes(q);
            const matchDiscipline = (c.discipline || '').toLowerCase().includes(q);

            return matchNo || matchTitle || matchAgency || matchTower || matchFloor || matchZone || matchDiscipline;
        });
    }

    // Render list or empty state
    if (filtered.length === 0) {
        casesContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
        casesContainer.innerHTML = '';
    } else {
        emptyState.classList.add('hidden');
        casesContainer.classList.remove('hidden');
        casesContainer.innerHTML = filtered.map(renderCaseCard).join('');
        attachCardEventListeners();
    }
}

function renderCaseCard(item) {
    const statusCfg = getStatusBadgeConfig(item.status);
    const priorityCfg = getPriorityBadgeConfig(item.priority);
    const slaMetrics = getSlaMetrics(item.target_date, item.status);
    const discBadgeClass = getDisciplineBadgeClass(item.discipline);
    const formattedDeadline = formatDateDisplay(item.target_date);
    const formattedCreated = formatDateDisplay(item.created_at);

    const isSiteCritical = item.priority === 'Urgent / Site Critical';
    const isApprovedIfc = item.status === 'Approved (IFC)';

    return `
        <div class="glass-card rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border ${
            isSiteCritical 
                ? 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/10' 
                : (isApprovedIfc ? 'border-emerald-200' : 'border-slate-200/80')
        }">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                
                <!-- Left: Case Identity & Title -->
                <div class="space-y-2 flex-grow min-w-0">
                    
                    <!-- Badges Row -->
                    <div class="flex items-center gap-2 flex-wrap text-xs">
                        <!-- Case Number -->
                        <span class="font-mono font-bold text-[#1E3A5F] bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                            ${escapeHtml(item.case_number)}
                        </span>

                        <!-- Discipline -->
                        <span class="font-semibold px-2 py-0.5 rounded-md border text-[11px] ${discBadgeClass}">
                            ${escapeHtml(item.discipline)}
                        </span>

                        <!-- Request Type -->
                        <span class="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-[11px] font-medium">
                            ${escapeHtml(item.request_type)}
                        </span>

                        <!-- Priority -->
                        <span class="px-2 py-0.5 rounded-md border text-[11px] ${priorityCfg.classes}">
                            ${priorityCfg.label}
                        </span>

                        <!-- Status -->
                        <span class="px-2 py-0.5 rounded-md border text-[11px] ${statusCfg.classes}">
                            ${statusCfg.text}
                        </span>
                    </div>

                    <!-- Title -->
                    <div>
                        <a href="./case-file.html?id=${item.id}" class="text-sm font-bold text-[#1E3A5F] hover:text-[#2A4E7F] hover:underline transition block">
                            ${escapeHtml(item.title)}
                        </a>
                        ${item.description ? `
                            <p class="text-xs text-slate-500 font-medium line-clamp-2 mt-1 leading-relaxed">
                                ${escapeHtml(item.description)}
                            </p>
                        ` : ''}
                    </div>

                    <!-- Location & Metadata -->
                    <div class="flex items-center gap-4 text-[11px] text-slate-500 flex-wrap pt-0.5 font-medium">
                        <span class="flex items-center gap-1 text-slate-700">
                            <span class="text-slate-400">📍 Location:</span>
                            <strong class="font-semibold text-slate-800">${escapeHtml(item.tower_block)} • ${escapeHtml(item.floor_level)}</strong>
                            ${item.zone_id ? `<span class="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-mono text-[10px] border border-slate-200">${escapeHtml(item.zone_id)}</span>` : ''}
                        </span>

                        <span class="flex items-center gap-1">
                            <span class="text-slate-400">🏢 Agency:</span>
                            <strong class="text-slate-700 font-semibold">${escapeHtml(item.assigned_agency_name)}</strong>
                            ${item.agency_contact_person ? `<span class="text-slate-400">(${escapeHtml(item.agency_contact_person)})</span>` : ''}
                        </span>

                        <span class="flex items-center gap-1">
                            <span class="text-slate-400">🗓️ Logged:</span>
                            <span>${formattedCreated}</span>
                        </span>
                    </div>
                </div>

                <!-- Right: SLA Turnaround & Actions -->
                <div class="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-3 flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    
                    <!-- SLA Badge -->
                    <div class="text-left lg:text-right">
                        <div class="text-[10px] uppercase font-bold text-slate-400">Turnaround SLA</div>
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span class="text-xs font-bold px-2.5 py-0.5 rounded-full border ${slaMetrics.badgeClass}">
                                ${slaMetrics.label}
                            </span>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-0.5">Target: <strong>${formattedDeadline}</strong></div>
                    </div>

                    <!-- Action CTAs -->
                    <div class="flex items-center gap-2">
                        <!-- WhatsApp Reminder Button -->
                        <button type="button" data-case-id="${item.id}" class="esc-modal-trigger px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 shadow-sm transition flex items-center gap-1.5 cursor-pointer" title="Send WhatsApp Reminder / Escalation">
                            <svg class="w-3.5 h-3.5 fill-current text-emerald-600" viewBox="0 0 24 24">
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                            </svg>
                            <span>WhatsApp</span>
                        </button>

                        <!-- Open Workspace Link -->
                        <a href="./case-file.html?id=${item.id}" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#1E3A5F] hover:bg-[#2A4E7F] shadow-sm hover:shadow transition flex items-center gap-1.5">
                            <span>Open Case</span>
                            <span>→</span>
                        </a>
                    </div>

                </div>

            </div>
        </div>
    `;
}

// ==============================================================================
// 4. WHATSAPP ESCALATION & REMINDER MODAL ENGINE
// ==============================================================================
function buildEscalationDraft(caseItem) {
    const sla = getSlaMetrics(caseItem.target_date, caseItem.status);
    const deadlineFormatted = formatDateDisplay(caseItem.target_date);
    const contactName = caseItem.agency_contact_person || caseItem.assigned_agency_name;

    let urgencyTag = 'REMINDER';
    let delayText = '';

    if (sla.status === 'overdue') {
        const days = Math.abs(sla.daysDiff);
        urgencyTag = 'URGENT ESCALATION - SITE OVERDUE';
        delayText = `⚠️ *CURRENT DELAY:* Overdue by *${days} day(s)* against agreed deadline (${deadlineFormatted}).\nSite execution is on hold pending these drawings.\n`;
    } else if (sla.status === 'due_today') {
        urgencyTag = 'DEADLINE DUE TODAY';
        delayText = `⏳ *DEADLINE:* This drawing request is due *TODAY (${deadlineFormatted})*.\n`;
    } else {
        delayText = `🗓️ *Target Deadline:* ${deadlineFormatted}\n`;
    }

    return `🚨 *PRAYOSHA ERP - DRAWING ${urgencyTag}*
Dear ${contactName},

This is an official follow-up regarding the pending drawing / clarification request for Prayosha Group.

📋 *Case No:* ${caseItem.case_number}
🏢 *Site Project:* ${caseItem.project_name}
📍 *Location:* ${caseItem.tower_block} • ${caseItem.floor_level} (${caseItem.zone_id || 'All'})
📐 *Discipline:* ${caseItem.discipline} (${caseItem.request_type})
📌 *Title:* ${caseItem.title}
⚡ *Priority:* ${caseItem.priority}
${delayText}
Kindly log in to your Prayosha ERP consultant account to upload the required drawing revisions or provide status updates immediately.

Thank you,
_Prayosha Group Engineering Operations_`;
}

function openEscalationModal(caseId) {
    const matched = rawCases.find(c => c.id === caseId);
    if (!matched) return;

    activeCaseForEscalation = matched;
    const sla = getSlaMetrics(matched.target_date, matched.status);

    escCaseNo.textContent = matched.case_number;
    escCaseTitle.textContent = matched.title;
    escAgencyName.textContent = matched.assigned_agency_name;

    escDelayBadge.textContent = sla.label;
    escDelayBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded border inline-block mt-0.5 ${sla.badgeClass}`;

    // Generate editable WhatsApp message draft
    escMessageTextarea.value = buildEscalationDraft(matched);

    // Open Modal with smooth transition
    escModal.classList.remove('hidden');
    void escModal.offsetWidth;
    escModal.classList.remove('opacity-0');
    escModal.classList.add('opacity-100');
    escModal.querySelector('.transform').classList.remove('scale-95');
    escModal.querySelector('.transform').classList.add('scale-100');
}

function closeEscalationModal() {
    escModal.classList.remove('opacity-100');
    escModal.classList.add('opacity-0');
    escModal.querySelector('.transform').classList.remove('scale-100');
    escModal.querySelector('.transform').classList.add('scale-95');

    setTimeout(() => {
        escModal.classList.add('hidden');
        activeCaseForEscalation = null;
    }, 280);
}

function handleSendEscalationWhatsApp() {
    if (!activeCaseForEscalation) return;

    const rawPhone = activeCaseForEscalation.agency_phone || '';
    const cleanPhone = cleanPhoneForWhatsApp(rawPhone);
    const finalMessage = escMessageTextarea.value.trim();
    const encoded = encodeURIComponent(finalMessage);

    let url = '';
    if (cleanPhone) {
        url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    } else {
        url = `https://wa.me/?text=${encoded}`;
    }

    window.open(url, '_blank');
    closeEscalationModal();
}

function attachCardEventListeners() {
    document.querySelectorAll('.esc-modal-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const caseId = e.currentTarget.dataset.caseId;
            openEscalationModal(caseId);
        });
    });
}

// ==============================================================================
// 5. EVENT LISTENERS & FILTER BINDINGS
// ==============================================================================
// Status Tabs Click Listener
statusTabs.forEach(tab => {
    tab.addEventListener('click', function() {
        statusTabs.forEach(t => {
            t.className = 'status-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition flex-shrink-0';
        });

        this.className = 'status-tab px-3.5 py-1.5 rounded-xl text-xs font-bold transition bg-[#1E3A5F] text-white shadow-sm flex-shrink-0';
        activeFilterStatus = this.dataset.status;
        applyFiltersAndRender();
    });
});

// Dropdowns & Search
if (filterDiscipline) {
    filterDiscipline.addEventListener('change', (e) => {
        activeDiscipline = e.target.value;
        applyFiltersAndRender();
    });
}

if (filterPriority) {
    filterPriority.addEventListener('change', (e) => {
        activePriority = e.target.value;
        applyFiltersAndRender();
    });
}

if (filterSla) {
    filterSla.addEventListener('change', (e) => {
        activeSla = e.target.value;
        applyFiltersAndRender();
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        activeSearchQuery = e.target.value.trim();
        applyFiltersAndRender();
    });
}

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        loadDrawingCases();
    });
}

// Modal Listeners
if (closeEscModalBtn) closeEscModalBtn.addEventListener('click', closeEscalationModal);
if (cancelEscBtn) cancelEscBtn.addEventListener('click', closeEscalationModal);
if (escModalBackdrop) escModalBackdrop.addEventListener('click', closeEscalationModal);
if (escSendWaBtn) escSendWaBtn.addEventListener('click', handleSendEscalationWhatsApp);

// Listen to Shell Project Switcher Event[cite: 12]
window.addEventListener('projectChanged', (e) => {
    loadDrawingCases();
});

// ==============================================================================
// 6. INITIAL RUN
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    loadDrawingCases();
});