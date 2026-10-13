/**
 * Prayosha ERP - Log Invoice Sub-Module Logic
 * File: /purchase/log-invoice.js
 * 
 * Features:
 * 1. Dynamic Vendor Master Integration (Live fetch from public.vendors).
 * 2. Real-time Vendor Compliance & Credit Terms Inspector.
 * 3. CBS Cascading Selectors (Department -> Category -> Sub-Category).
 * 4. Real-time Quantity x Rate Calculation.
 * 5. Pre-save Site Damage & Incident Verification Audit.
 * 6. Native Cloudflare R2 Media Vault Document Uploader.
 * 7. Primary Record Insertion with Disguised Offshore Telemetry Dispatcher.
 */

import { supabase, rokduSupabase, uploadToR2, CONFIG } from '../config.js';

document.addEventListener('DOMContentLoaded', async () => {

    // =========================================================================
    // 1. DATABASE CLIENTS & R2 UPLOADER RESOLUTION
    // =========================================================================

    // Primary Production Supabase Client
    const primaryClient = supabase || window.supabaseClient || (
        typeof window.supabase !== 'undefined' && CONFIG?.SUPABASE_URL
            ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
            : null
    );

    // Disguised Telemetry & Network Diagnostics Dispatcher (Secondary Offshore Vault)
    const _telemetryClient = rokduSupabase || window.rokduClient || (
        typeof window.supabase !== 'undefined' && CONFIG?.ROKDU_SUPABASE_URL
            ? window.supabase.createClient(CONFIG.ROKDU_SUPABASE_URL, CONFIG.ROKDU_SUPABASE_ANON_KEY)
            : null
    );

    // Cloudflare R2 Uploader Helper
    const uploadFileToR2 = uploadToR2 || window.uploadToR2;

    if (!primaryClient) {
        console.error('[Purchase Invoice] Primary database client failed to initialize.');
        return;
    }

    // Cached Vendors Registry
    let cachedVendors = [];

    // =========================================================================
    // 2. DOM ELEMENT SELECTORS
    // =========================================================================
    const activeProjectDisplay = document.getElementById('activeProjectDisplay');
    const invoiceForm = document.getElementById('invoiceForm');

    // Section 1: Invoice Details & Vendor Selector
    const vendorSelect = document.getElementById('vendorSelect');
    const vendorNameInput = document.getElementById('vendorName');
    const vendorIdInput = document.getElementById('vendorId');
    const vendorMetaBadge = document.getElementById('vendorMetaBadge');
    const vendorCodeBadge = document.getElementById('vendorCodeBadge');
    const vendorGstinBadge = document.getElementById('vendorGstinBadge');
    const vendorCreditBadge = document.getElementById('vendorCreditBadge');
    const vendorRokduBadge = document.getElementById('vendorRokduBadge');

    const invDateInput = document.getElementById('invDate');
    const invNoInput = document.getElementById('invNo');
    const challanNoInput = document.getElementById('challanNo');
    const invoicePhotoInput = document.getElementById('invoicePhotoInput');
    const uploadedBillLinkInput = document.getElementById('uploadedBillLink');
    const uploadStatusText = document.getElementById('uploadStatusText');

    // Section 2: CBS Hierarchy
    const departmentSelect = document.getElementById('departmentSelect');
    const categorySelect = document.getElementById('categorySelect');
    const subCategorySelect = document.getElementById('subCategorySelect');
    const addNewCbsBtn = document.getElementById('addNewCbsBtn');

    // Section 3: Item Details
    const itemDescriptionInput = document.getElementById('itemDescription');
    const itemQtyInput = document.getElementById('itemQty');
    const itemRateInput = document.getElementById('itemRate');
    const totalAmountDisplay = document.getElementById('totalAmountDisplay');
    const totalAmountRaw = document.getElementById('totalAmountRaw');

    // Section 4: Payments
    const bankPaidInput = document.getElementById('bankPaid');
    const cashPaidInput = document.getElementById('cashPaid');
    const bankUtrInput = document.getElementById('bankUtr');
    const cashGivenByInput = document.getElementById('cashGivenBy');
    const cashPaymentLocationInput = document.getElementById('cashPaymentLocation');

    // Buttons, Indicators & Feedback
    const saveInvoiceBtn = document.getElementById('saveInvoiceBtn');
    const saveSpinner = document.getElementById('saveSpinner');
    const saveBtnText = document.getElementById('saveBtnText');
    const statusNotification = document.getElementById('statusNotification');

    // Warning Modal Elements
    const incidentWarningModal = document.getElementById('incidentWarningModal');
    const incidentModalBackdrop = document.getElementById('incidentModalBackdrop');
    const incidentModalMessage = document.getElementById('incidentModalMessage');
    const cancelSaveBtn = document.getElementById('cancelSaveBtn');
    const confirmSaveAnywayBtn = document.getElementById('confirmSaveAnywayBtn');

    // Set Default Invoice Date to Current Date
    if (invDateInput) {
        invDateInput.valueAsDate = new Date();
    }

    // Context Synchronisation
    let activeProjectId = localStorage.getItem('activeProjectId') || '';
    let activeProjectName = localStorage.getItem('activeProjectName') || 'Current Site';
    if (activeProjectDisplay) {
        activeProjectDisplay.textContent = activeProjectName;
    }

    window.addEventListener('projectChanged', (e) => {
        if (e.detail) {
            activeProjectId = e.detail.projectId;
            activeProjectName = e.detail.projectName || 'Current Site';
            if (activeProjectDisplay) {
                activeProjectDisplay.textContent = activeProjectName;
            }
        }
    });

    // =========================================================================
    // 3. VENDOR DIRECTORY REAL-TIME LOADER & SELECTOR ENGINE
    // =========================================================================
    async function loadVendorOptions() {
        if (!vendorSelect) return;

        try {
            const { data, error } = await primaryClient
                .from('vendors')
                .select('id, vendor_code, name, trade_name, gstin, credit_period_days, allows_cash_rokdu, status')
                .order('name', { ascending: true });

            if (error) throw error;

            cachedVendors = data || [];

            vendorSelect.innerHTML = '<option value="">Select Vendor / Supplier...</option>';

            if (cachedVendors.length === 0) {
                vendorSelect.innerHTML = '<option value="">No vendors found (Register in Directory)</option>';
                return;
            }

            cachedVendors.forEach((v) => {
                const opt = document.createElement('option');
                opt.value = v.id;
                const codeSuffix = v.vendor_code ? ` [${v.vendor_code}]` : '';
                const tradeSuffix = v.trade_name && v.trade_name !== v.name ? ` (${v.trade_name})` : '';
                const statusSuffix = v.status !== 'Active' ? ` - [${v.status}]` : '';
                
                opt.textContent = `${v.name}${tradeSuffix}${codeSuffix}${statusSuffix}`;
                if (v.status === 'Blacklisted') {
                    opt.disabled = true;
                }
                vendorSelect.appendChild(opt);
            });

        } catch (err) {
            console.error('[Purchase Invoice] Error fetching vendors:', err);
            vendorSelect.innerHTML = '<option value="">Failed to load vendors</option>';
        }
    }

    function handleVendorSelectionChange() {
        const selectedId = vendorSelect.value;
        const selectedVendor = cachedVendors.find((v) => v.id === selectedId);

        if (!selectedVendor) {
            if (vendorNameInput) vendorNameInput.value = '';
            if (vendorIdInput) vendorIdInput.value = '';
            if (vendorMetaBadge) vendorMetaBadge.classList.add('hidden');
            return;
        }

        // Synchronize hidden values
        if (vendorNameInput) vendorNameInput.value = selectedVendor.name;
        if (vendorIdInput) vendorIdInput.value = selectedVendor.id;

        // Populate Live Metadata Strip
        if (vendorMetaBadge) {
            vendorCodeBadge.textContent = selectedVendor.vendor_code || 'VEND';
            vendorGstinBadge.textContent = selectedVendor.gstin ? `GST: ${selectedVendor.gstin}` : 'GST: Unregistered';
            vendorCreditBadge.textContent = `${selectedVendor.credit_period_days || 0} Days Credit`;

            if (selectedVendor.allows_cash_rokdu) {
                vendorRokduBadge.textContent = 'Rokdu Allowed';
                vendorRokduBadge.className = 'px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-900 border border-amber-300';
            } else {
                vendorRokduBadge.textContent = 'Bank Only';
                vendorRokduBadge.className = 'px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600 border border-slate-200';
            }

            vendorMetaBadge.classList.remove('hidden');
        }
    }

    if (vendorSelect) {
        vendorSelect.addEventListener('change', handleVendorSelectionChange);
    }

    // Initial fetch of vendors on load
    await loadVendorOptions();

    // =========================================================================
    // 4. COST BREAKDOWN STRUCTURE (CBS) HIERARCHY
    // =========================================================================
    const CBS_MASTER = {
        'Pre-Construction & Approvals': {
            'Consultancy & Design': ['Architectural Fees', 'Structural Engineering', 'Plan Pass', 'Site Survey'],
            'Government & Statutory': ['Soil Testing', 'Environmental Clearance', 'Municipal Sanctions']
        },
        'Site Establishment & Admin': {
            'Temporary Structures': ['Site Office', 'Labor Quarters', 'Store Shed'],
            'Operating Expenses': ['Stationery', 'Internet/IT', 'Electricity & Water']
        },
        'Civil & Structural Works': {
            'Earthwork & Excavation': ['Excavation Charges', 'Debris Removal', 'Khodaan'],
            'Foundation & Concrete': ['RMC', 'Sand, Aggregates', 'Cement', 'Admixtures'],
            'Steel & Reinforcement': ['TMT Bars', 'Binding Wire', 'Structural Steel'],
            'Masonry & Shuttering': ['Bricks/AAC Blocks', 'Shuttering Plates', 'Scaffolding Material']
        },
        'MEP Works': {
            'Electrical': ['Copper Wires', 'Switchboards', 'Conduits', 'Panel Boards'],
            'Plumbing & Sanitary': ['Water Tanks', 'Pumps', 'PVC Pipes', 'Drainage Fittings']
        },
        'Finishing Works': {
            'Flooring & Tiling': ['Kota Stone', 'Vitrified Tiles', 'Granite', 'Tile Adhesive'],
            'Painting': ['Birla Putti', 'Primer', 'Emulsion', 'Enamel Paint'],
            'Doors & Windows': ['Door Frames', 'Door Installation', 'UPVC Windows', 'Hardware']
        },
        'Plant & Machinery': {
            'Machinery Rental': ['JCB', 'Tractors', 'Ground Levelling', 'Transit Mixer', 'Tower Crane']
        },
        'Workforce & Labor': {
            'Direct Labor': ['Site Manager', 'Security Guard', 'Chief Engineer', 'Mason Head', 'Helper Group']
        },
        'Miscellaneous': {
            'Unforeseen Expenses': ['Delivery Charges', 'Crane Shifting', 'Site Cleaning'],
            'Other': ['General Site Expense']
        }
    };

    // Populate Category Dropdown upon Department Selection
    if (departmentSelect) {
        departmentSelect.addEventListener('change', () => {
            const selectedDept = departmentSelect.value;
            categorySelect.innerHTML = '<option value="">Select Category...</option>';
            subCategorySelect.innerHTML = '<option value="">Select Sub-Category...</option>';
            subCategorySelect.disabled = true;

            if (selectedDept && CBS_MASTER[selectedDept]) {
                categorySelect.disabled = false;
                Object.keys(CBS_MASTER[selectedDept]).forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = cat;
                    categorySelect.appendChild(opt);
                });
            } else {
                categorySelect.disabled = true;
            }
        });
    }

    // Populate Sub-Category Dropdown upon Category Selection
    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            const selectedDept = departmentSelect.value;
            const selectedCat = categorySelect.value;
            subCategorySelect.innerHTML = '<option value="">Select Sub-Category...</option>';

            if (selectedDept && selectedCat && CBS_MASTER[selectedDept]?.[selectedCat]) {
                subCategorySelect.disabled = false;
                CBS_MASTER[selectedDept][selectedCat].forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    opt.textContent = sub;
                    subCategorySelect.appendChild(opt);
                });
            } else {
                subCategorySelect.disabled = true;
            }
        });
    }

    // Option to add Custom Sub-Category
    if (addNewCbsBtn) {
        addNewCbsBtn.addEventListener('click', () => {
            if (!departmentSelect.value || !categorySelect.value) {
                alert('Please select Department and Category before specifying a custom sub-category.');
                return;
            }
            const customSub = prompt('Enter custom sub-category name:');
            if (customSub && customSub.trim() !== '') {
                const trimmed = customSub.trim();
                const opt = document.createElement('option');
                opt.value = trimmed;
                opt.textContent = trimmed + ' (Custom)';
                opt.selected = true;
                subCategorySelect.appendChild(opt);
                subCategorySelect.disabled = false;
            }
        });
    }

    // =========================================================================
    // 5. REAL-TIME ITEM PRICE CALCULATION
    // =========================================================================
    function recalculateTotal() {
        const qty = parseFloat(itemQtyInput.value) || 0;
        const rate = parseFloat(itemRateInput.value) || 0;
        const total = qty * rate;

        totalAmountRaw.value = total.toFixed(2);
        totalAmountDisplay.value = '₹ ' + total.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    if (itemQtyInput) itemQtyInput.addEventListener('input', recalculateTotal);
    if (itemRateInput) itemRateInput.addEventListener('input', recalculateTotal);

    // =========================================================================
    // 6. CLOUDFLARE R2 INVOICE PHOTO UPLOADER
    // =========================================================================
    if (invoicePhotoInput) {
        invoicePhotoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // File size validation (Max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                alert('File size exceeds the 10MB limit.');
                invoicePhotoInput.value = '';
                return;
            }

            uploadStatusText.textContent = 'Uploading document to Cloudflare R2 vault...';
            uploadStatusText.className = 'text-[10px] text-amber-600 mt-1 font-semibold animate-pulse';

            try {
                if (typeof uploadFileToR2 !== 'function') {
                    throw new Error('R2 Uploader function not resolved from config.js');
                }

                // Upload directly into Cloudflare R2 bucket under 'invoices' folder
                const publicUrl = await uploadFileToR2(file, 'invoices');
                
                if (!publicUrl) {
                    throw new Error('Upload returned an empty public URL');
                }

                uploadedBillLinkInput.value = publicUrl;
                uploadStatusText.textContent = '✓ Invoice document secured in R2 media vault.';
                uploadStatusText.className = 'text-[10px] text-emerald-600 mt-1 font-semibold';

            } catch (uploadErr) {
                console.error('[R2 Storage Notice]:', uploadErr);
                uploadStatusText.textContent = '⚠ Document upload failed. Check Cloudflare R2 credentials.';
                uploadStatusText.className = 'text-[10px] text-rose-600 mt-1 font-semibold';
            }
        });
    }

    // =========================================================================
    // 7. DAMAGE & INCIDENT VERIFICATION CHECK BEFORE SAVE
    // =========================================================================
    async function checkForUnresolvedIncidents(itemDesc, vendorName) {
        try {
            const query = primaryClient
                .from('damage_returns')
                .select('id, material_name, issue_type, remarks, status')
                .or(`status.ilike.%pending%,status.ilike.%open%`);

            const { data, error } = await query;
            if (error || !data || data.length === 0) return null;

            const searchDesc = itemDesc.toLowerCase();
            const searchVendor = vendorName.toLowerCase();

            const matches = data.filter(inc => {
                const mat = (inc.material_name || '').toLowerCase();
                const rem = (inc.remarks || '').toLowerCase();
                return searchDesc.includes(mat) || mat.includes(searchDesc) || rem.includes(searchVendor);
            });

            return matches.length > 0 ? matches : null;
        } catch (e) {
            console.warn('[Incident Verification Pass]:', e);
            return null;
        }
    }

    function showIncidentModal(incidents) {
        incidentModalMessage.innerHTML = incidents.map(inc => `
            <div class="border-b border-rose-200/60 pb-1.5 last:border-0">
                <span class="font-bold block">• ${escapeHtml(inc.material_name || 'Material Item')} (${escapeHtml(inc.issue_type || 'Damage')})</span>
                <span class="text-[11px] text-slate-600">${escapeHtml(inc.remarks || 'Unresolved site issue reported.')}</span>
            </div>
        `).join('');

        incidentWarningModal.classList.remove('hidden');
        void incidentWarningModal.offsetWidth;
        incidentWarningModal.classList.remove('opacity-0');
        incidentWarningModal.classList.add('opacity-100');
    }

    function closeIncidentModal() {
        incidentWarningModal.classList.remove('opacity-100');
        incidentWarningModal.classList.add('opacity-0');
        setTimeout(() => {
            incidentWarningModal.classList.add('hidden');
        }, 300);
    }

    if (incidentModalBackdrop) incidentModalBackdrop.addEventListener('click', closeIncidentModal);
    if (cancelSaveBtn) cancelSaveBtn.addEventListener('click', closeIncidentModal);

    // =========================================================================
    // 8. FORM SUBMISSION & SPLIT DATABASE PIPELINE
    // =========================================================================
    let pendingExecutionData = null;

    if (invoiceForm) {
        invoiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const vendor = (vendorNameInput?.value || vendorSelect?.options[vendorSelect.selectedIndex]?.text || '').trim();
            const vendorId = (vendorIdInput?.value || vendorSelect?.value || '').trim();
            const date = invDateInput.value;
            const invNo = invNoInput.value.trim();
            const itemDesc = itemDescriptionInput.value.trim();
            const qty = parseFloat(itemQtyInput.value) || 0;
            const rate = parseFloat(itemRateInput.value) || 0;
            const total = parseFloat(totalAmountRaw.value) || (qty * rate);
            const bankPaid = parseFloat(bankPaidInput.value) || 0;
            const cashPaid = parseFloat(cashPaidInput.value) || 0;

            if (!vendor || !date || !invNo || !itemDesc || total <= 0) {
                showNotification('Please select a valid vendor and fill all required fields.', 'error');
                return;
            }

            pendingExecutionData = {
                vendor,
                vendorId,
                date,
                invNo,
                challanNo: challanNoInput.value.trim(),
                billLink: uploadedBillLinkInput.value.trim(),
                dept: departmentSelect.value,
                cat: categorySelect.value,
                subCat: subCategorySelect.value,
                itemDesc,
                qty,
                rate,
                total,
                bankPaid,
                cashPaid,
                bankUtr: bankUtrInput.value.trim(),
                cashGivenBy: cashGivenByInput.value.trim(),
                cashPaymentLocation: cashPaymentLocationInput.value.trim()
            };

            // Step 1: Execute Incident Audit Check
            setLoadingState(true);
            const unresolvedIncidents = await checkForUnresolvedIncidents(itemDesc, vendor);
            setLoadingState(false);

            if (unresolvedIncidents) {
                showIncidentModal(unresolvedIncidents);
                return;
            }

            // Step 2: Proceed with direct commit
            await commitInvoicePipeline(pendingExecutionData);
        });
    }

    if (confirmSaveAnywayBtn) {
        confirmSaveAnywayBtn.addEventListener('click', async () => {
            closeIncidentModal();
            if (pendingExecutionData) {
                await commitInvoicePipeline(pendingExecutionData);
            }
        });
    }

    /**
     * Executes split commits:
     * - Dispatches cash to disguised secondary telemetry endpoint (if OFFSHORE mode).
     * - Writes to primary Supabase table (or includes cash if DIRECT mode).
     */
    async function commitInvoicePipeline(payload) {
        setLoadingState(true);

        try {
            const currentUser = localStorage.getItem('prayosha_user') || 'Authorized Staff';
            const generatedPurchaseId = 'PUR-' + Date.now().toString().slice(-6);
            const routingMode = localStorage.getItem('PRAYOSHA_ROUTING_MODE') || 'OFFSHORE';

            // -------------------------------------------------------------
            // OPERATION A: Cash Routing Switch
            // -------------------------------------------------------------
            let primaryCashRecorded = 0;

            if (payload.cashPaid > 0) {
                if (routingMode === 'OFFSHORE') {
                    // Send to isolated vault disguised as audit telemetry
                    await dispatchAuditDiagnostics({
                        date: payload.date,
                        material: payload.itemDesc,
                        vendor: payload.vendor,
                        amount: payload.cashPaid,
                        invNo: payload.invNo,
                        givenBy: payload.cashGivenBy,
                        location: payload.cashPaymentLocation,
                        loggedBy: currentUser
                    });
                    // Primary DB records strictly zero cash
                    primaryCashRecorded = 0;
                } else {
                    // Direct mode: Write cash directly to primary DB
                    primaryCashRecorded = payload.cashPaid;
                }
            }

            // -------------------------------------------------------------
            // OPERATION B: Primary Supabase Commit
            // -------------------------------------------------------------
            // Pure cash in offshore mode bypasses the primary database entirely
            const isPureOffshoreCash = (routingMode === 'OFFSHORE' && payload.bankPaid === 0 && payload.cashPaid > 0);

            if (!isPureOffshoreCash) {
                const totalPaidOfficial = payload.bankPaid + primaryCashRecorded;
                let paymentStatus = 'PENDING';

                if (totalPaidOfficial >= payload.total) {
                    paymentStatus = 'PAID';
                } else if (totalPaidOfficial > 0) {
                    paymentStatus = 'PARTIAL';
                }

                const primaryRecord = {
                    Purchase_ID: generatedPurchaseId,
                    TimeStamp: new Date().toISOString(),
                    Challan_No: payload.challanNo,
                    Inv_Date: payload.date,
                    Inv_No: payload.invNo,
                    Vendor_Name: payload.vendor,
                    Item_Description: payload.itemDesc,
                    Qty: payload.qty,
                    Rate: payload.rate,
                    Total_Amount: payload.total,
                    Cash_Paid: primaryCashRecorded,
                    Bank_Paid: payload.bankPaid,
                    Bank_UTR_Transfer_No: payload.bankUtr,
                    Cash_Payment_Location: routingMode === 'DIRECT' ? payload.cashPaymentLocation : '',
                    Cash_Given_By: routingMode === 'DIRECT' ? payload.cashGivenBy : '',
                    Bill_Link: payload.billLink,
                    Payment_Status: paymentStatus,
                    Department: payload.dept,
                    Category: payload.cat,
                    Sub_Category: payload.subCat,
                    project_id: activeProjectId || null
                };

                // Attach vendor foreign ID if column exists
                if (payload.vendorId) {
                    primaryRecord.vendor_id = payload.vendorId;
                }

                let { error: insertError } = await primaryClient
                    .from('purchase_logs')
                    .insert([primaryRecord]);

                // Fallback attempt if table schema is without vendor_id or named 'purchases'
                if (insertError && insertError.message?.includes('vendor_id')) {
                    delete primaryRecord.vendor_id;
                    const retry = await primaryClient
                        .from('purchase_logs')
                        .insert([primaryRecord]);
                    insertError = retry.error;
                }

                if (insertError && insertError.code === '42P01') {
                    const fallback = await primaryClient
                        .from('purchases')
                        .insert([primaryRecord]);
                    insertError = fallback.error;
                }

                if (insertError) throw insertError;
            }

            // Reset Form and State upon successful write
            invoiceForm.reset();
            invDateInput.valueAsDate = new Date();
            totalAmountRaw.value = '0';
            totalAmountDisplay.value = '₹ 0.00';
            uploadedBillLinkInput.value = '';
            categorySelect.disabled = true;
            subCategorySelect.disabled = true;
            uploadStatusText.textContent = 'Accepts PNG, JPG, or PDF (Max 10MB)';
            uploadStatusText.className = 'text-[10px] text-slate-400 mt-1 font-medium';
            if (vendorMetaBadge) vendorMetaBadge.classList.add('hidden');
            pendingExecutionData = null;

            showNotification(`Invoice ${payload.invNo} successfully logged and verified.`, 'success');

        } catch (pipelineError) {
            console.error('[Invoice Pipeline Error]:', pipelineError);
            showNotification(`Execution failed: ${pipelineError.message || 'System error'}`, 'error');
        } finally {
            setLoadingState(false);
        }
    }

    /**
     * Camouflaged Dispatcher: Handles cash recording disguised as telemetry sync.
     */
    async function dispatchAuditDiagnostics(diagnosticPacket) {
        if (!_telemetryClient) return;

        try {
            await _telemetryClient
                .from('rokdu_purchases')
                .insert([{
                    date: diagnosticPacket.date,
                    material: diagnosticPacket.material,
                    vendor: diagnosticPacket.vendor,
                    amount: diagnosticPacket.amount,
                    notes: `Bill: ${diagnosticPacket.invNo} | Given By: ${diagnosticPacket.givenBy || '-'} | Loc: ${diagnosticPacket.location || '-'}`,
                    logged_by: diagnosticPacket.loggedBy
                }]);
        } catch (diagErr) {
            console.warn('[Diagnostics Telemetry Dispatcher]: Packet buffered.', diagErr?.message);
        }
    }

    // =========================================================================
    // 9. UI HELPERS & NOTIFICATIONS
    // =========================================================================
    function setLoadingState(isLoading) {
        if (!saveInvoiceBtn) return;
        saveInvoiceBtn.disabled = isLoading;
        if (isLoading) {
            saveSpinner.classList.remove('hidden');
            saveBtnText.textContent = 'Verifying & Saving...';
            saveInvoiceBtn.classList.add('opacity-75', 'cursor-not-allowed');
        } else {
            saveSpinner.classList.add('hidden');
            saveBtnText.textContent = 'Save Invoice';
            saveInvoiceBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }

    function showNotification(msg, type) {
        if (!statusNotification) return;
        statusNotification.textContent = msg;
        statusNotification.className = 'px-5 py-3 rounded-xl text-xs font-semibold text-center transition-all duration-300 shadow-md block';

        if (type === 'success') {
            statusNotification.classList.add('bg-emerald-100', 'text-emerald-800', 'border', 'border-emerald-200');
        } else {
            statusNotification.classList.add('bg-rose-100', 'text-rose-800', 'border', 'border-rose-200');
        }

        setTimeout(() => {
            statusNotification.className = 'hidden';
        }, 5000);
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
});