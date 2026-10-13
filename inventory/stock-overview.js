/**
 * Prayosha ERP - Stock Overview Controller
 * File: /inventory/stock-overview.js
 * 
 * Features:
 * 1. Project-Scoped Master Stock Register: Fetches and manages items per active project.
 * 2. Real-Time Financial & KPI Aggregation: Computes total inventory valuation, active SKUs,
 *    consumed quantities, and low-stock reorder thresholds.
 * 3. Dynamic Search & Category Filtering: Instant client-side filtering across SKU codes and names.
 * 4. Add SKU Modal Workflow: Full validation, insertion into Supabase, and stock initialization.
 * 5. Low-Stock Alerts & 1-Click Indent Routing: Pre-fills indent requisition requests for depleted stock.
 * 6. Responsive UI & Error Handling: Graceful loading states, empty fallbacks, and delete management.
 */

import { supabase } from '../config.js';

// Central Supabase Client
const client = supabase || window.supabaseClient;

// DOM Elements - Table & Controls
const stockTableBody = document.getElementById('stockTableBody');
const activeProjectBadge = document.getElementById('activeProjectBadge');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const refreshBtn = document.getElementById('refreshBtn');

// DOM Elements - KPI Summary Cards
const kpiTotalValuation = document.getElementById('kpiTotalValuation');
const kpiTotalItems = document.getElementById('kpiTotalItems');
const kpiLowStockCount = document.getElementById('kpiLowStockCount');
const kpiTotalConsumed = document.getElementById('kpiTotalConsumed');

// DOM Elements - Add SKU Modal
const openAddSkuBtn = document.getElementById('openAddSkuBtn');
const closeAddSkuBtn = document.getElementById('closeAddSkuBtn');
const cancelAddSkuBtn = document.getElementById('cancelAddSkuBtn');
const modalAddSku = document.getElementById('modalAddSku');
const formAddSku = document.getElementById('formAddSku');
const saveSkuSubmitBtn = document.getElementById('saveSkuSubmitBtn');

// Form Input Fields
const newSkuCode = document.getElementById('newSkuCode');
const newSkuName = document.getElementById('newSkuName');
const newSkuCategory = document.getElementById('newSkuCategory');
const newSkuUnit = document.getElementById('newSkuUnit');
const newSkuRate = document.getElementById('newSkuRate');
const newSkuStock = document.getElementById('newSkuStock');
const newSkuReorder = document.getElementById('newSkuReorder');

// In-Memory Item Cache
let allStockItems = [];
let currentProjectId = null;

/**
 * 1. Initialize Active Project Context
 */
async function resolveActiveProjectId() {
    let projectId = localStorage.getItem('activeProjectId');
    const projectName = localStorage.getItem('activeProjectName') || '';
    const projectCode = localStorage.getItem('activeProjectCode') || '';

    // Validate UUID format (8-4-4-4-12)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!projectId || !uuidRegex.test(projectId)) {
        if (client) {
            try {
                let query = client.from('projects').select('id, project_name, project_code');
                if (projectName) {
                    query = query.ilike('project_name', `%${projectName}%`);
                }
                const { data: projects, error } = await query.limit(1);

                if (!error && projects && projects.length > 0) {
                    projectId = projects[0].id;
                    localStorage.setItem('activeProjectId', projectId);
                    localStorage.setItem('activeProjectName', projects[0].project_name || projectName);
                    if (projects[0].project_code) {
                        localStorage.setItem('activeProjectCode', projects[0].project_code);
                    }
                }
            } catch (err) {
                console.warn('[StockOverview] Project resolution warning:', err);
            }
        }
    }

    currentProjectId = projectId;

    if (activeProjectBadge) {
        const displayName = localStorage.getItem('activeProjectName') || 'Active Project';
        const displayCode = localStorage.getItem('activeProjectCode') || '';
        activeProjectBadge.textContent = displayCode ? `[${displayCode}] ${displayName}` : displayName;
    }

    return currentProjectId;
}

/**
 * 2. Fetch and Load Stock Items from Supabase
 */
async function loadStockRegister() {
    await resolveActiveProjectId();

    if (!stockTableBody) return;

    stockTableBody.innerHTML = `
        <tr>
            <td colspan="9" class="py-16 text-center text-slate-400">
                <div class="inline-block animate-spin rounded-full h-7 w-7 border-b-2 border-[#1E3A5F] mb-2"></div>
                <p class="text-xs font-semibold">Fetching latest inventory balances from database...</p>
            </td>
        </tr>
    `;

    if (!client) {
        stockTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-8 text-center text-red-600 font-semibold text-xs">
                    Database client connection unavailable. Please check config.js.
                </td>
            </tr>
        `;
        return;
    }

    try {
        let query = client
            .from('inventory_items')
            .select('*')
            .order('item_code', { ascending: true });

        // Scope to active project if present
        if (currentProjectId) {
            query = query.eq('project_id', currentProjectId);
        }

        const { data: items, error } = await query;

        if (error) throw error;

        allStockItems = items || [];

        // Update Dynamic UI
        updateKpiMetrics(allStockItems);
        populateCategoryFilter(allStockItems);
        renderFilteredStock();

    } catch (err) {
        console.error('[StockOverview Load Error]:', err);
        stockTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-8 text-center text-red-700 font-semibold text-xs">
                    Failed to load stock data: ${err.message || 'Unknown network error'}.
                    <button onclick="window.location.reload()" class="ml-2 text-xs underline font-bold text-red-800">Retry</button>
                </td>
            </tr>
        `;
    }
}

/**
 * 3. Update Metric KPI Summary Cards
 */
function updateKpiMetrics(items) {
    let totalValuation = 0;
    let totalItems = items.length;
    let lowStockCount = 0;
    let totalConsumed = 0;

    items.forEach(item => {
        const stock = Number(item.current_stock) || 0;
        const rate = Number(item.rate) || 0;
        const reorder = Number(item.reorder_level) || 0;
        const consumed = Number(item.consumed_till_date) || 0;

        totalValuation += stock * rate;
        totalConsumed += consumed;

        if (stock <= reorder) {
            lowStockCount += 1;
        }
    });

    const currencyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
    const countFormatter = new Intl.NumberFormat('en-IN');

    if (kpiTotalValuation) kpiTotalValuation.textContent = currencyFormatter.format(Math.round(totalValuation));
    if (kpiTotalItems) kpiTotalItems.textContent = countFormatter.format(totalItems);
    if (kpiLowStockCount) kpiLowStockCount.textContent = countFormatter.format(lowStockCount);
    if (kpiTotalConsumed) kpiTotalConsumed.textContent = countFormatter.format(totalConsumed);
}

/**
 * 4. Populate Category Filter Dropdown Dynamically
 */
function populateCategoryFilter(items) {
    if (!categoryFilter) return;

    const currentSelection = categoryFilter.value;
    const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort();

    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentSelection) opt.selected = true;
        categoryFilter.appendChild(opt);
    });
}

/**
 * 5. Format Timestamps Helper
 */
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

/**
 * 6. Render Filtered Table Rows
 */
function renderFilteredStock() {
    if (!stockTableBody) return;

    const searchTerm = (searchInput ? searchInput.value.trim().toLowerCase() : '');
    const selectedCategory = (categoryFilter ? categoryFilter.value : '');

    const filtered = allStockItems.filter(item => {
        const matchesCategory = !selectedCategory || item.category === selectedCategory;
        const matchesSearch = !searchTerm || (
            (item.item_code && item.item_code.toLowerCase().includes(searchTerm)) ||
            (item.item_name && item.item_name.toLowerCase().includes(searchTerm))
        );
        return matchesCategory && matchesSearch;
    });

    stockTableBody.innerHTML = '';

    if (filtered.length === 0) {
        stockTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="py-16 text-center text-slate-400">
                    <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3 text-xl">
                        📦
                    </div>
                    <h3 class="text-sm font-bold text-slate-700 mb-1">No Material SKUs Found</h3>
                    <p class="text-xs text-slate-400 max-w-sm mx-auto">No inventory items match your current filter criteria or project selection.</p>
                </td>
            </tr>
        `;
        return;
    }

    const numberFormat = new Intl.NumberFormat('en-IN');
    const currencyFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    filtered.forEach(item => {
        const stock = Number(item.current_stock) || 0;
        const reorder = Number(item.reorder_level) || 0;
        const rate = Number(item.rate) || 0;
        const consumed = Number(item.consumed_till_date) || 0;
        const isLowStock = stock <= reorder;

        const row = document.createElement('tr');
        row.className = isLowStock 
            ? 'bg-rose-50/40 hover:bg-rose-50/70 transition border-b border-rose-100' 
            : 'hover:bg-slate-50 transition border-b border-slate-100';

        row.innerHTML = `
            <!-- Item Code / Name -->
            <td class="py-3.5 px-4">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold ${isLowStock ? 'text-rose-700' : 'text-[#1E3A5F]'}">
                        ${item.item_name || 'Unnamed Item'}
                    </span>
                    ${isLowStock ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">LOW</span>' : ''}
                </div>
                <div class="text-[10px] font-semibold text-slate-400 mt-0.5">
                    Code: <span class="text-slate-600 uppercase font-mono">${item.item_code || 'N/A'}</span>
                </div>
            </td>

            <!-- Category -->
            <td class="py-3.5 px-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    ${item.category || 'General'}
                </span>
            </td>

            <!-- Rate -->
            <td class="py-3.5 px-4 text-right font-medium text-slate-700">
                ₹ ${currencyFormat.format(rate)}
            </td>

            <!-- Current Stock -->
            <td class="py-3.5 px-4 text-center">
                <span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${isLowStock ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                    ${numberFormat.format(stock)}
                </span>
            </td>

            <!-- Unit -->
            <td class="py-3.5 px-3 text-center text-xs text-slate-500 font-semibold">
                ${item.unit || 'units'}
            </td>

            <!-- Reorder Level -->
            <td class="py-3.5 px-4 text-center text-xs font-semibold ${isLowStock ? 'text-rose-600 font-bold' : 'text-slate-600'}">
                ${numberFormat.format(reorder)}
            </td>

            <!-- Last Updated -->
            <td class="py-3.5 px-4 text-center text-[11px] text-slate-500 font-medium">
                ${formatDate(item.last_updated)}
            </td>

            <!-- Consumed Till Date -->
            <td class="py-3.5 px-4 text-right text-xs font-semibold text-slate-700">
                ${numberFormat.format(consumed)}
            </td>

            <!-- Actions -->
            <td class="py-3.5 px-4 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    <a href="request-indent.html?item_id=${encodeURIComponent(item.id)}&item_name=${encodeURIComponent(item.item_name)}" 
                       title="Raise Indent Requisition" 
                       class="p-1.5 rounded-lg border border-slate-200 hover:border-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white text-slate-600 transition text-xs font-semibold flex items-center gap-1">
                        <svg class="w-3.5 h-3.5 text-[#FFBF00]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span class="hidden sm:inline">Indent</span>
                    </a>

                    <button type="button" 
                            onclick="window.deleteStockItem('${item.id}', '${item.item_name}')" 
                            title="Delete SKU" 
                            class="p-1.5 rounded-lg border border-slate-200 hover:border-red-400 hover:bg-red-50 text-slate-400 hover:text-red-600 transition cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        `;

        stockTableBody.appendChild(row);
    });
}

/**
 * 7. Delete SKU Workflow
 */
window.deleteStockItem = async function(itemId, itemName) {
    if (!itemId) return;
    const confirmed = confirm(`Are you sure you want to delete material SKU "${itemName}"? This will permanently remove its inventory records.`);
    if (!confirmed) return;

    try {
        const { error } = await client
            .from('inventory_items')
            .delete()
            .eq('id', itemId);

        if (error) throw error;

        await loadStockRegister();
    } catch (err) {
        alert(`Failed to delete SKU: ${err.message || 'Error occurred.'}`);
    }
};

/**
 * 8. Modal Management - Open / Close
 */
function openAddSkuModal() {
    if (modalAddSku) {
        modalAddSku.classList.remove('hidden');
        if (newSkuCode) newSkuCode.focus();
    }
}

function closeAddSkuModal() {
    if (modalAddSku) {
        modalAddSku.classList.add('hidden');
        if (formAddSku) formAddSku.reset();
    }
}

/**
 * 9. Handle Add SKU Form Submission
 */
async function handleAddSkuSubmit(e) {
    e.preventDefault();

    await resolveActiveProjectId();

    if (!currentProjectId) {
        alert('Please select an active project in the header navigation before adding inventory.');
        return;
    }

    const itemCode = newSkuCode.value.trim().toUpperCase();
    const itemName = newSkuName.value.trim();
    const category = newSkuCategory.value;
    const unit = newSkuUnit.value.trim().toLowerCase();
    const rate = parseFloat(newSkuRate.value) || 0;
    const currentStock = parseFloat(newSkuStock.value) || 0;
    const reorderLevel = parseFloat(newSkuReorder.value) || 0;

    if (!itemCode || !itemName || !unit) {
        alert('Please fill out all required fields marked with *.');
        return;
    }

    if (saveSkuSubmitBtn) {
        saveSkuSubmitBtn.disabled = true;
        saveSkuSubmitBtn.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <span>Saving...</span>
        `;
    }

    try {
        const payload = {
            project_id: currentProjectId,
            item_code: itemCode,
            item_name: itemName,
            category: category,
            unit: unit,
            rate: rate,
            current_stock: currentStock,
            reorder_level: reorderLevel,
            consumed_till_date: 0,
            last_updated: new Date().toISOString()
        };

        const { error } = await client
            .from('inventory_items')
            .insert([payload]);

        if (error) {
            if (error.code === '23505') {
                throw new Error(`An item with code "${itemCode}" already exists for this project.`);
            }
            throw error;
        }

        closeAddSkuModal();
        await loadStockRegister();

    } catch (err) {
        alert(`Failed to save SKU: ${err.message || 'Unknown database error'}`);
    } finally {
        if (saveSkuSubmitBtn) {
            saveSkuSubmitBtn.disabled = false;
            saveSkuSubmitBtn.innerHTML = `<span>Save SKU</span>`;
        }
    }
}

/**
 * 10. Event Listeners Setup
 */
if (openAddSkuBtn) openAddSkuBtn.addEventListener('click', openAddSkuModal);
if (closeAddSkuBtn) closeAddSkuBtn.addEventListener('click', closeAddSkuModal);
if (cancelAddSkuBtn) cancelAddSkuBtn.addEventListener('click', closeAddSkuModal);
if (formAddSku) formAddSku.addEventListener('submit', handleAddSkuSubmit);

if (modalAddSku) {
    modalAddSku.addEventListener('click', (e) => {
        if (e.target === modalAddSku) closeAddSkuModal();
    });
}

if (searchInput) searchInput.addEventListener('input', renderFilteredStock);
if (categoryFilter) categoryFilter.addEventListener('change', renderFilteredStock);
if (refreshBtn) refreshBtn.addEventListener('click', loadStockRegister);

// Listen to Global Project Switcher event emitted by shell.js
window.addEventListener('projectChanged', () => {
    loadStockRegister();
});

// Initial Bootstrap on Page Load
document.addEventListener('DOMContentLoaded', loadStockRegister);