/**
 * Prayosha ERP - Petty Cash Expense Logger Controller
 * File: /petty-cash/log-expense.js
 * Description: Manages expense voucher creation, camera snapping, digital signature pad,
 *              native Cloudflare R2 upload helper integration, dynamic category grid selection,
 *              and Supabase cash-out transaction dispatch.
 */

import { supabase, uploadToR2 } from '../config.js';

// Central Supabase Client reference from config.js
const supabaseClient = supabase || window.supabaseClient;

// Application State
const state = {
    currentUser: null,
    projects: [],
    selectedProjectId: null,
    wallet: null,
    categories: [],
    selectedCategoryId: null,
    selectedFile: null,
    isDrawingSignature: false,
    signatureCaptured: false
};

// UUID validation helper to prevent PostgreSQL 22P02 syntax errors
const isValidUUID = (id) => {
    if (!id || typeof id !== 'string') return false;
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(id);
};

// Currency Formatter
const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    return num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

// DOM Elements Cache
const elements = {
    formLogExpense: document.getElementById('form-log-expense'),
    headerWalletBalance: document.getElementById('header-wallet-balance'),
    selectProject: document.getElementById('select-project'),
    inputTxnDate: document.getElementById('input-txn-date'),
    inputVoucherNo: document.getElementById('input-voucher-no'),
    inputAmount: document.getElementById('input-amount'),
    selectedCategoryName: document.getElementById('selected-category-name'),
    inputCategoryId: document.getElementById('input-category-id'),
    categoryGridContainer: document.getElementById('category-grid-container'),
    inputPaidTo: document.getElementById('input-paid-to'),
    selectPaymentMode: document.getElementById('select-payment-mode'),
    bannerUpiInfo: document.getElementById('banner-upi-info'),
    selectVoucherType: document.getElementById('select-voucher-type'),
    inputBillFile: document.getElementById('input-bill-file'),
    btnCameraTrigger: document.getElementById('btn-camera-trigger'),
    previewContainer: document.getElementById('preview-container'),
    imagePreview: document.getElementById('image-preview'),
    previewFilename: document.getElementById('preview-filename'),
    previewFilesize: document.getElementById('preview-filesize'),
    uploadStatusTag: document.getElementById('upload-status-tag'),
    btnRemoveImage: document.getElementById('btn-remove-image'),
    selfVoucherBox: document.getElementById('self-voucher-box'),
    signatureCanvas: document.getElementById('signature-canvas'),
    btnClearSignature: document.getElementById('btn-clear-signature'),
    textareaDescription: document.getElementById('textarea-description'),
    btnSubmitExpense: document.getElementById('btn-submit-expense')
};

// Lifecycle Initialization
document.addEventListener('DOMContentLoaded', async () => {
    resolveCurrentUser();
    initDateAndVoucher();
    initSignaturePad();
    attachEventListeners();
    await fetchCategories();
    await fetchProjects();
});

// Resolve Logged-in User Context
function resolveCurrentUser() {
    try {
        const storedUser = localStorage.getItem('prayosha_user') || localStorage.getItem('user');
        if (storedUser) {
            state.currentUser = JSON.parse(storedUser);
        } else {
            state.currentUser = {
                id: '00000000-0000-0000-0000-000000000001',
                full_name: 'Site Custodian',
                role: 'Site Engineer'
            };
        }
    } catch (e) {
        state.currentUser = {
            id: '00000000-0000-0000-0000-000000000001',
            full_name: 'Site Custodian',
            role: 'Site Engineer'
        };
    }
}

// Initialize Default Date & Auto Voucher Code
function initDateAndVoucher() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (elements.inputTxnDate) {
        elements.inputTxnDate.value = dateStr;
    }

    generateVoucherPreview(yyyy, mm);
}

function generateVoucherPreview(yyyy, mm) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const voucherPreview = `PC-${yyyy}${mm}-${randomSuffix}`;
    if (elements.inputVoucherNo) {
        elements.inputVoucherNo.value = voucherPreview;
    }
}

// Fetch Categories & Render Visual Grid
async function fetchCategories() {
    try {
        const { data, error } = await supabaseClient
            .from('petty_cash_categories')
            .select('*')
            .eq('is_active', true)
            .order('name_en', { ascending: true });

        if (error) throw error;
        state.categories = data || [];
        renderCategoryGrid();
    } catch (err) {
        console.error('Error fetching categories:', err);
        if (elements.categoryGridContainer) {
            elements.categoryGridContainer.innerHTML = `
                <div class="col-span-full py-4 text-center text-xs text-rose-500 font-medium">
                    Failed to load categories. Please check database connection.
                </div>
            `;
        }
    }
}

function renderCategoryGrid() {
    if (!elements.categoryGridContainer) return;

    if (state.categories.length === 0) {
        elements.categoryGridContainer.innerHTML = `
            <div class="col-span-full py-4 text-center text-xs text-slate-400">
                No active categories defined.
            </div>
        `;
        return;
    }

    const html = state.categories.map(cat => {
        return `
            <button type="button" data-id="${cat.id}" data-name="${cat.name_en}" class="category-card p-3 rounded-xl border border-slate-200/80 bg-white/70 hover:bg-slate-50 flex flex-col items-center justify-center text-center transition-all group active:scale-95 shadow-sm">
                <div class="w-8 h-8 rounded-lg bg-navy/5 group-hover:bg-navy group-hover:text-amber text-navy flex items-center justify-center text-sm mb-1.5 transition-colors">
                    <i class="fa-solid fa-${cat.icon || 'receipt'}"></i>
                </div>
                <span class="text-[11px] font-bold text-slate-800 line-clamp-1 leading-tight">${cat.name_en}</span>
                <span class="text-[9px] text-slate-400 line-clamp-1 font-medium mt-0.5">${cat.name_gu}</span>
            </button>
        `;
    }).join('');

    elements.categoryGridContainer.innerHTML = html;

    const cards = elements.categoryGridContainer.querySelectorAll('.category-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => {
                c.classList.remove('border-navy', 'ring-2', 'ring-navy/20', 'bg-navy/5');
                c.classList.add('border-slate-200/80', 'bg-white/70');
            });

            card.classList.add('border-navy', 'ring-2', 'ring-navy/20', 'bg-navy/5');
            card.classList.remove('border-slate-200/80', 'bg-white/70');

            state.selectedCategoryId = card.dataset.id;
            if (elements.inputCategoryId) elements.inputCategoryId.value = card.dataset.id;
            if (elements.selectedCategoryName) elements.selectedCategoryName.textContent = card.dataset.name;
        });
    });
}

// Fetch Projects (Uses project_name and project_code, and syncs with shell.js)
async function fetchProjects() {
    try {
        const { data, error } = await supabaseClient
            .from('projects')
            .select('id, project_name, project_code')
            .order('project_name', { ascending: true });

        if (error) throw error;

        state.projects = data || [];

        if (state.projects.length > 0) {
            const cachedProjectId = localStorage.getItem('activeProjectId');
            const foundProject = state.projects.find(p => p.id === cachedProjectId);

            elements.selectProject.innerHTML = state.projects
                .map(p => {
                    const code = p.project_code ? `[${p.project_code}] ` : '';
                    const isSelected = foundProject ? (p.id === foundProject.id) : false;
                    return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${code}${p.project_name}</option>`;
                })
                .join('');

            state.selectedProjectId = foundProject ? foundProject.id : state.projects[0].id;
            await loadWalletForProject(state.selectedProjectId);
        } else {
            elements.selectProject.innerHTML = '<option value="">No Active Projects Found</option>';
            if (elements.headerWalletBalance) elements.headerWalletBalance.textContent = '₹ 0.00';
        }
    } catch (err) {
        console.error('Error fetching projects:', err);
        elements.selectProject.innerHTML = '<option value="">Error Loading Projects</option>';
        if (elements.headerWalletBalance) elements.headerWalletBalance.textContent = '₹ 0.00';
    }
}

// Load or Auto-provision Site Wallet
async function loadWalletForProject(projectId) {
    if (!projectId || !isValidUUID(projectId)) {
        if (elements.headerWalletBalance) elements.headerWalletBalance.textContent = '₹ 0.00';
        return;
    }

    try {
        let { data: walletData, error } = await supabaseClient
            .from('petty_cash_wallets')
            .select('*')
            .eq('project_id', projectId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        // Auto-provision if missing
        if (!walletData) {
            const custodianId = isValidUUID(state.currentUser?.id)
                ? state.currentUser.id
                : '00000000-0000-0000-0000-000000000001';

            const { data: newWallet, error: createError } = await supabaseClient
                .from('petty_cash_wallets')
                .insert([{
                    project_id: projectId,
                    custodian_id: custodianId,
                    sanctioned_limit: 100000.00,
                    current_balance: 0.00,
                    is_active: true
                }])
                .select()
                .single();

            if (!createError) {
                walletData = newWallet;
            }
        }

        state.wallet = walletData;

        if (elements.headerWalletBalance) {
            const balance = Number(walletData?.current_balance) || 0;
            elements.headerWalletBalance.textContent = `₹ ${formatCurrency(balance)}`;
        }
    } catch (err) {
        console.error('Error fetching project float balance:', err);
        if (elements.headerWalletBalance) elements.headerWalletBalance.textContent = '₹ 0.00';
    }
}

// Event Listeners Setup
function attachEventListeners() {
    if (elements.selectProject) {
        elements.selectProject.addEventListener('change', async (e) => {
            state.selectedProjectId = e.target.value;
            localStorage.setItem('activeProjectId', state.selectedProjectId);
            await loadWalletForProject(state.selectedProjectId);
        });
    }

    // Sync with Global Shell Project Switcher Dispatched Events
    window.addEventListener('projectChanged', async (e) => {
        if (e.detail && e.detail.projectId) {
            state.selectedProjectId = e.detail.projectId;
            if (elements.selectProject) {
                elements.selectProject.value = e.detail.projectId;
            }
            await loadWalletForProject(state.selectedProjectId);
        }
    });

    if (elements.selectPaymentMode) {
        elements.selectPaymentMode.addEventListener('change', (e) => {
            if (e.target.value === 'ENGINEER_UPI') {
                elements.bannerUpiInfo.classList.remove('hidden');
            } else {
                elements.bannerUpiInfo.classList.add('hidden');
            }
        });
    }

    if (elements.selectVoucherType) {
        elements.selectVoucherType.addEventListener('change', (e) => {
            if (e.target.value === 'SELF_VOUCHER') {
                elements.selfVoucherBox.classList.remove('hidden');
                resizeSignatureCanvas();
            } else {
                elements.selfVoucherBox.classList.add('hidden');
            }
        });
    }

    if (elements.btnCameraTrigger && elements.inputBillFile) {
        elements.btnCameraTrigger.addEventListener('click', () => {
            elements.inputBillFile.click();
        });

        elements.inputBillFile.addEventListener('change', handleFileSelection);
    }

    if (elements.btnRemoveImage) {
        elements.btnRemoveImage.addEventListener('click', removeSelectedFile);
    }

    if (elements.formLogExpense) {
        elements.formLogExpense.addEventListener('submit', handleFormSubmit);
    }
}

// File Attachment Handling & Preview
function handleFileSelection(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    state.selectedFile = file;

    if (elements.previewFilename) elements.previewFilename.textContent = file.name;
    if (elements.previewFilesize) elements.previewFilesize.textContent = `${(file.size / 1024).toFixed(1)} KB`;

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            elements.imagePreview.src = event.target.result;
            elements.previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        elements.imagePreview.src = 'https://cdn-icons-png.flaticon.com/512/337/337946.png';
        elements.previewContainer.classList.remove('hidden');
    }
}

function removeSelectedFile() {
    state.selectedFile = null;
    if (elements.inputBillFile) elements.inputBillFile.value = '';
    if (elements.previewContainer) elements.previewContainer.classList.add('hidden');
    if (elements.imagePreview) elements.imagePreview.src = '';
}

// Self-Voucher Signature Pad (Touch & Mouse Support)
function initSignaturePad() {
    const canvas = elements.signatureCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1E3A5F';

    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function startDraw(e) {
        e.preventDefault();
        state.isDrawingSignature = true;
        state.signatureCaptured = true;
        const pos = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }

    function moveDraw(e) {
        if (!state.isDrawingSignature) return;
        e.preventDefault();
        const pos = getCoords(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }

    function endDraw(e) {
        if (state.isDrawingSignature) {
            e.preventDefault();
            state.isDrawingSignature = false;
        }
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', endDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    window.addEventListener('touchend', endDraw, { passive: false });

    if (elements.btnClearSignature) {
        elements.btnClearSignature.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            state.signatureCaptured = false;
        });
    }
}

function resizeSignatureCanvas() {
    const canvas = elements.signatureCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0) {
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1E3A5F';
    }
}

// Form Submission & Supabase Dispatch
async function handleFormSubmit(e) {
    e.preventDefault();

    if (!state.selectedProjectId || !isValidUUID(state.selectedProjectId)) {
        alert('Please select a valid site project.');
        return;
    }

    if (!state.selectedCategoryId) {
        alert('Please select an expense category from the grid.');
        return;
    }

    const amount = parseFloat(elements.inputAmount.value);
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid expense amount.');
        return;
    }

    const paidTo = elements.inputPaidTo.value.trim();
    if (!paidTo) {
        alert('Please state who received the payment (Paid To).');
        return;
    }

    const description = elements.textareaDescription.value.trim();
    if (!description) {
        alert('Please provide the site purpose/description for this expense.');
        return;
    }

    const txnDate = elements.inputTxnDate.value;
    const monthYear = txnDate.substring(0, 7);
    const voucherNo = elements.inputVoucherNo.value;
    const paymentMode = elements.selectPaymentMode.value;
    const voucherType = elements.selectVoucherType.value;

    if (!state.wallet || !isValidUUID(state.wallet.id)) {
        alert('Site wallet record not initialized. Please ensure the project has an active wallet.');
        return;
    }

    try {
        elements.btnSubmitExpense.disabled = true;
        elements.btnSubmitExpense.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Recording...';

        let billAttachmentUrl = null;

        // Process Physical Bill Attachment via native uploadToR2
        if (state.selectedFile) {
            billAttachmentUrl = await uploadToR2(state.selectedFile, `petty-cash/${state.selectedProjectId}/${monthYear}`);
        }
        // Process Digital Self-Voucher Signature Canvas
        else if (voucherType === 'SELF_VOUCHER' && state.signatureCaptured) {
            const signatureBlob = await new Promise(resolve => elements.signatureCanvas.toBlob(resolve, 'image/png'));
            if (signatureBlob) {
                const sigFile = new File([signatureBlob], `${voucherNo}_sig.png`, { type: 'image/png' });
                billAttachmentUrl = await uploadToR2(sigFile, `petty-cash/${state.selectedProjectId}/${monthYear}`);
            }
        }

        const custodianId = isValidUUID(state.currentUser?.id)
            ? state.currentUser.id
            : (state.wallet.custodian_id || '00000000-0000-0000-0000-000000000001');

        // Insert Transaction Record
        const { error: txError } = await supabaseClient
            .from('petty_cash_transactions')
            .insert([{
                voucher_no: voucherNo,
                wallet_id: state.wallet.id,
                project_id: state.selectedProjectId,
                custodian_id: custodianId,
                category_id: state.selectedCategoryId,
                txn_type: 'CASH_OUT',
                amount: amount,
                txn_date: txnDate,
                month_year: monthYear,
                paid_to: paidTo,
                payment_mode: paymentMode,
                voucher_type: voucherType,
                description: description,
                bill_attachment_url: billAttachmentUrl,
                ho_audit_status: 'PENDING'
            }]);

        if (txError) throw txError;

        alert('Petty cash expense successfully recorded!');
        window.location.href = 'petty-cash.html';

    } catch (err) {
        console.error('Failed to log expense:', err);
        alert('Error recording transaction: ' + (err.message || 'Unknown database error'));
        elements.btnSubmitExpense.disabled = false;
        elements.btnSubmitExpense.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Save & Log Expense</span>';
    }
}