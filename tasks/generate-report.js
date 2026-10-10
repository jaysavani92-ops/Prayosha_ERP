/**
 * Prayosha ERP - Analytics & Report Generator Controller
 * File: /tasks/generate-report.js
 * 
 * Features:
 * 1. Automatic Project Population: Fetches projects from Supabase and auto-selects the active workspace project.
 * 2. Multi-Scope Task Querying: Supports All Tasks, Active Tasks, Delayed Tasks, and Completed Archives.
 * 3. Dual Engine Export:
 *    - RFC 4180 Compliant CSV Export (Excel/Sheets ready)
 *    - Styled Executive PDF Document (via jsPDF + autoTable)
 * 4. Executive Feedback UI: Styled status alerts and error handling.
 */

// Supabase Client Initialization
const SUPABASE_PROJECT_URL = window.SUPABASE_URL || 'https://lmzowftkbjdzqmmgxcrf.supabase.co';
const SUPABASE_PUBLIC_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_ey0ZqXs2eGyaJ5y1ZWtrnA_Rul705D0';

const supabaseClient = window.supabaseClient || (window.supabase 
    ? window.supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLIC_KEY) 
    : null);

// DOM Elements
const reportForm = document.getElementById('reportForm');
const filterProjectSelect = document.getElementById('filter_project');
const feedbackBox = document.getElementById('report-feedback');

/**
 * 1. Initialize and Synchronize Project Filter Dropdown
 */
async function initProjectFilters() {
    const activeProjectName = localStorage.getItem('activeProjectName') || '';

    if (!supabaseClient) {
        populateFallbackProjects(activeProjectName);
        return;
    }

    try {
        const { data: projects, error } = await supabaseClient
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true });

        if (error) throw error;

        if (projects && projects.length > 0) {
            filterProjectSelect.innerHTML = '<option value="All">All Projects</option>';

            projects.forEach(project => {
                const opt = document.createElement('option');
                opt.value = project.project_name;
                opt.textContent = project.project_code 
                    ? `[${project.project_code}] ${project.project_name}` 
                    : project.project_name;

                if (project.project_name.toLowerCase() === activeProjectName.toLowerCase()) {
                    opt.selected = true;
                }

                filterProjectSelect.appendChild(opt);
            });
        } else {
            populateFallbackProjects(activeProjectName);
        }
    } catch (err) {
        console.error('[Report Generator] Error loading projects:', err);
        populateFallbackProjects(activeProjectName);
    }
}

/**
 * Fallback project filter options
 */
function populateFallbackProjects(activeProject) {
    if (!filterProjectSelect) return;
    const defaultProj = activeProject || 'Prayosha Imperia';
    filterProjectSelect.innerHTML = `
        <option value="All">All Projects</option>
        <option value="${defaultProj}" selected>${defaultProj}</option>
    `;
}

/**
 * 2. Form Submission & Document Generation
 */
reportForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    const todayStr = new Date().toISOString().split('T')[0];
    
    const reportType = document.getElementById('report_type').value;
    const filterProject = filterProjectSelect.value;
    const filterAgency = document.getElementById('filter_agency').value.trim();
    const exportFormat = document.querySelector('input[name="format"]:checked').value;

    submitBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-brand-amber inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        Generating ${exportFormat.toUpperCase()}...
    `;
    submitBtn.disabled = true;

    try {
        if (!supabaseClient) throw new Error('Supabase client connection not active.');

        let query = supabaseClient.from('civil_tasks').select('*');

        // Apply Report Scope Filters
        if (reportType === 'Active Tasks') {
            query = query.neq('status', 'Completed');
        } else if (reportType === 'Delayed Tasks') {
            query = query.neq('status', 'Completed').lt('expected_completion_date', todayStr);
        } else if (reportType === 'Completed Tasks') {
            query = query.eq('status', 'Completed');
        }

        // Apply Project Scope Filter
        if (filterProject !== 'All') {
            query = query.eq('project_name', filterProject);
        }

        // Apply Agency Filter
        if (filterAgency) {
            query = query.ilike('assigned_agency', `%${filterAgency}%`);
        }

        const { data: tasks, error } = await query;
        if (error) throw error;

        if (!tasks || tasks.length === 0) {
            feedbackBox.className = "p-4 rounded-xl text-xs font-semibold mt-4 bg-amber-50 text-amber-800 border border-amber-200 block shadow-sm";
            feedbackBox.innerText = `No task records found matching your selected scope and filters.`;
            return;
        }

        const filenameBase = `Prayosha_${reportType.replace(/\s+/g, '_')}_${todayStr}`;

        // ==========================================
        // ROUTE 1: CSV EXPORT
        // ==========================================
        if (exportFormat === 'csv') {
            const headers = [
                "Task_ID",
                "Project",
                "Tower_Block",
                "Floor_Level",
                "Zone_ID",
                "Category",
                "Assigned_Agency",
                "Status",
                "Assigned_Date",
                "Expected_Completion",
                "Completed_Date",
                "Delayed_Reason"
            ];

            const csvRows = [headers.join(',')];

            tasks.forEach(task => {
                const escapeCsv = (str) => {
                    if (str === null || str === undefined) return '';
                    const cleanStr = String(str).replace(/"/g, '""');
                    return `"${cleanStr}"`;
                };

                const row = [
                    escapeCsv(task.id),
                    escapeCsv(task.project_name),
                    escapeCsv(task.tower_block),
                    escapeCsv(task.floor_level),
                    escapeCsv(task.zone_id),
                    escapeCsv(task.category),
                    escapeCsv(task.assigned_agency || 'Unassigned'),
                    escapeCsv(task.status),
                    escapeCsv(task.assigned_date || ''),
                    escapeCsv(task.expected_completion_date || ''),
                    escapeCsv(task.completed_date || ''),
                    escapeCsv(task.delayed_reason || '')
                ];
                csvRows.push(row.join(','));
            });

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            
            downloadLink.href = url;
            downloadLink.download = `${filenameBase}.csv`;
            downloadLink.style.visibility = 'hidden';
            
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(url);
        } 
        // ==========================================
        // ROUTE 2: PDF DOCUMENT EXPORT
        // ==========================================
        else if (exportFormat === 'pdf') {
            if (!window.jspdf || !window.jspdf.jsPDF) {
                throw new Error('PDF engine not loaded. Please ensure CDN scripts are accessible.');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); 
            
            // Executive Header
            doc.setFontSize(16);
            doc.setTextColor(30, 58, 95); // Brand Navy (#1E3A5F)
            doc.text(`Prayosha ERP - ${reportType}`, 14, 15);
            
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139); // Slate 500
            doc.text(`Generated: ${todayStr} | Project: ${filterProject} ${filterAgency ? '| Agency: ' + filterAgency : ''}`, 14, 21);

            // Table Columns & Rows
            const tableColumns = ["Ref ID", "Tower / Floor", "Zone ID", "Work Category", "Assigned Agency", "Live Status", "Target Deadline"];
            const tableRows = [];

            tasks.forEach(task => {
                const shortId = (task.id && typeof task.id === 'string') 
                    ? task.id.split('-')[0].toUpperCase() 
                    : 'TSK';
                const location = `${task.tower_block || ''} / ${task.floor_level || ''}`;
                
                tableRows.push([
                    `#${shortId}`,
                    location,
                    task.zone_id || 'N/A',
                    task.category || 'Civil',
                    task.assigned_agency || 'Unassigned',
                    task.status || 'Active',
                    task.expected_completion_date || '-'
                ]);
            });

            // AutoTable Rendering
            doc.autoTable({
                head: [tableColumns],
                body: tableRows,
                startY: 26,
                theme: 'grid',
                styles: { fontSize: 8, font: 'helvetica', cellPadding: 2.5 },
                headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                margin: { top: 26, left: 14, right: 14, bottom: 14 }
            });

            doc.save(`${filenameBase}.pdf`);
        }

        // Success UI Feedback
        feedbackBox.className = "p-4 rounded-xl text-xs font-semibold mt-4 bg-emerald-50 text-emerald-800 border border-emerald-200 block shadow-sm";
        feedbackBox.innerHTML = `✓ Successfully generated and downloaded <strong>${exportFormat.toUpperCase()}</strong> report containing <strong>${tasks.length}</strong> record(s).`;

    } catch (err) {
        console.error('[Report Generation Error]:', err);
        feedbackBox.className = "p-4 rounded-xl text-xs font-semibold mt-4 bg-red-50 text-red-800 border border-red-200 block shadow-sm";
        feedbackBox.innerText = `Error generating report: ${err.message || 'Export failed'}`;
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        setTimeout(() => { feedbackBox.classList.add('hidden'); }, 6000);
    }
});

// Run filter initialization on load
document.addEventListener('DOMContentLoaded', initProjectFilters);