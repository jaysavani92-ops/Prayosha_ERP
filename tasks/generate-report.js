const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.getElementById('reportForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitBtn = this.querySelector('button[type="submit"]');
    const feedbackBox = document.getElementById('report-feedback');
    const todayStr = new Date().toISOString().split('T')[0];
    
    const reportType = document.getElementById('report_type').value;
    const filterProject = document.getElementById('filter_project').value;
    const filterAgency = document.getElementById('filter_agency').value.trim();
    
    // Check which radio button is selected
    const exportFormat = document.querySelector('input[name="format"]:checked').value;

    submitBtn.innerHTML = `Generating...`;
    submitBtn.disabled = true;

    try {
        let query = supabaseClient.from('civil_tasks').select('*');

        if (reportType === 'Active Tasks') {
            query = query.neq('status', 'Completed');
        } else if (reportType === 'Delayed Tasks') {
            query = query.neq('status', 'Completed').lt('expected_completion_date', todayStr);
        } else if (reportType === 'Completed Tasks') {
            query = query.eq('status', 'Completed');
        }

        if (filterProject !== 'All') {
            query = query.eq('project_name', filterProject);
        }
        if (filterAgency) {
            query = query.ilike('assigned_agency', `%${filterAgency}%`);
        }

        const { data: tasks, error } = await query;
        if (error) throw error;

        if (tasks.length === 0) {
            feedbackBox.className = "p-4 rounded-lg text-sm font-medium mt-4 bg-yellow-100 text-yellow-800 border border-yellow-200 block";
            feedbackBox.innerText = `No data found matching these filters.`;
            resetButton();
            return;
        }

        const filenameBase = `Prayosha_Report_${reportType.replace(/\s+/g, '_')}_${todayStr}`;

        // ==========================================
        // ROUTE 1: CSV EXPORT
        // ==========================================
        if (exportFormat === 'csv') {
            const headers = ["Task_ID", "Project", "Tower", "Floor", "Zone_ID", "Category", "Assigned_Agency", "Status", "Assigned_Date", "Expected_Completion", "Completed_Date", "Delayed_Reason"];
            const csvRows = [headers.join(',')];

            tasks.forEach(task => {
                const row = [
                    task.id, task.project_name, task.tower_block, task.floor_level, task.zone_id,
                    task.category, task.assigned_agency || 'Unassigned', task.status,
                    task.assigned_date || '', task.expected_completion_date || '', task.completed_date || '',
                    task.delayed_reason ? `"${task.delayed_reason.replace(/"/g, '""')}"` : ''
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
        } 
        // ==========================================
        // ROUTE 2: PDF EXPORT
        // ==========================================
        else if (exportFormat === 'pdf') {
            // Initialize jsPDF (Landscape orientation for wide tables)
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape'); 
            
            // PDF Header Styling
            doc.setFontSize(18);
            doc.setTextColor(30, 58, 95); // brand-navy
            doc.text(`Prayosha ERP - ${reportType}`, 14, 15);
            
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generated on: ${todayStr} | Filtered by Project: ${filterProject} ${filterAgency ? '| Agency: ' + filterAgency : ''}`, 14, 22);

            // Prepare Table Data
            const tableColumns = ["Task ID", "Tower / Floor", "Zone ID", "Category", "Agency", "Status", "Deadline"];
            const tableRows = [];

            tasks.forEach(task => {
                const shortId = task.id.split('-')[0]; // Use first segment of UUID to save space
                const location = `${task.tower_block} / ${task.floor_level}`;
                
                tableRows.push([
                    shortId.toUpperCase(),
                    location,
                    task.zone_id,
                    task.category,
                    task.assigned_agency || 'Unassigned',
                    task.status,
                    task.expected_completion_date || '-'
                ]);
            });

            // Draw Table
            doc.autoTable({
                head: [tableColumns],
                body: tableRows,
                startY: 28,
                theme: 'grid',
                styles: { fontSize: 8, font: 'helvetica' },
                headStyles: { fillColor: [30, 58, 95] }, // Match brand-navy
                alternateRowStyles: { fillColor: [245, 247, 250] }
            });

            // Trigger Download
            doc.save(`${filenameBase}.pdf`);
        }

        // Success UI
        feedbackBox.className = "p-4 rounded-lg text-sm font-medium mt-4 bg-green-100 text-green-800 border border-green-200 block";
        feedbackBox.innerText = `Successfully downloaded ${exportFormat.toUpperCase()} with ${tasks.length} records!`;

    } catch (err) {
        feedbackBox.className = "p-4 rounded-lg text-sm font-medium mt-4 bg-red-100 text-red-800 border border-red-200 block";
        feedbackBox.innerText = `Error generating report: ${err.message}`;
        console.error("Report Error:", err);
    } finally {
        resetButton();
    }

    function resetButton() {
        submitBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Generate & Download
        `;
        submitBtn.disabled = false;
        setTimeout(() => { feedbackBox.classList.add('hidden'); }, 4000);
    }
});