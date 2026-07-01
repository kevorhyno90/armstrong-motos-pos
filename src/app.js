import {
  initDb,
  getProducts,
  saveProduct,
  deleteProduct,
  getSales,
  addSale,
  getSettings,
  saveSetting,
  exportBackup,
  importBackup
} from './db.js';

import { generateBarcode } from './barcode.js';

// Application State
let state = {
  products: [],
  sales: [],
  cart: [],
  settings: {
    shopName: 'Armstrong Motos',
    currency: 'Ksh',
    address: 'Industrial Area, Enterprise Road, Nairobi',
    phone: '+254 700 000 000',
    lowStockAlertLimit: 5
  },
  activeScreen: 'pos',
  capturedImageBase64: null,
  editingProductId: null,
  cameraStream: null
};

// DOM Elements
const screens = {
  pos: document.getElementById('screen-pos'),
  inventory: document.getElementById('screen-inventory'),
  sales: document.getElementById('screen-sales'),
  dashboard: document.getElementById('screen-dashboard'),
  settings: document.getElementById('screen-settings')
};

const navItems = document.querySelectorAll('.nav-item');
const activeScreenTitle = document.getElementById('active-screen-title');

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  try {
    showToast('Initializing POS system...', 'info');
    await initDb();
    
    // Load Settings
    const dbSettings = await getSettings();
    state.settings = { ...state.settings, ...dbSettings };
    applySettingsToUI();
    
    // Load Database collections
    await reloadData();
    
    // Setup Event Listeners
    setupNavigation();
    setupPOSHandlers();
    setupInventoryHandlers();
    setupSalesHandlers();
    setupDashboardHandlers();
    setupSettingsHandlers();
    setupPwaInstallation();
    
    // Initial renders
    renderPOSCatalog();
    renderInventoryTable();
    checkLowStockLevels();
    
    showToast('POS initialized successfully. Database active.', 'success');
  } catch (error) {
    console.error('App init failed:', error);
    showToast('Failed to load database. Running in offline fallback.', 'danger');
  }
});

// Toast Notification Engine
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Icon based on type
  let icon = '';
  if (type === 'success') {
    icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
  } else if (type === 'warning') {
    icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  } else if (type === 'danger') {
    icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else {
    icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = `
    ${icon}
    <div class="toast-message">${message}</div>
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);

  // Close trigger
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 200);
  });

  // Auto self-dismiss
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 200);
    }
  }, 4000);
}

// Reload all datasets
async function reloadData() {
  state.products = await getProducts();
  state.sales = await getSales();
}

// UI Settings applier
function applySettingsToUI() {
  document.getElementById('set-shop-name').value = state.settings.shopName;
  document.getElementById('set-shop-currency').value = state.settings.currency;
  document.getElementById('set-shop-address').value = state.settings.address;
  document.getElementById('set-shop-phone').value = state.settings.phone;
  document.getElementById('set-low-stock-alert').value = state.settings.lowStockAlertLimit;

  // Header Title/Pills
  document.querySelector('.brand-name').textContent = state.settings.shopName;
  
  // Update currency labels inside POS Cart
  updatePOSSummaryUI();
}

// Low stock levels scanning
function checkLowStockLevels() {
  const limit = parseInt(state.settings.lowStockAlertLimit) || 5;
  const lowStockItems = state.products.filter(p => parseInt(p.stock) <= parseInt(p.minStock));
  const alertBadge = document.getElementById('low-stock-alert');
  
  if (lowStockItems.length > 0) {
    alertBadge.style.display = 'flex';
    alertBadge.querySelector('span').textContent = `${lowStockItems.length} Spares Low Stock`;
    // Update dashboard statistics count too
    const dashLowCount = document.getElementById('dash-low-stock-count');
    if (dashLowCount) dashLowCount.textContent = lowStockItems.length;
  } else {
    alertBadge.style.display = 'none';
    const dashLowCount = document.getElementById('dash-low-stock-count');
    if (dashLowCount) dashLowCount.textContent = 0;
  }
}

// ==================== NAVIGATION DRIVER ====================
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const screenId = item.getAttribute('data-screen');
      switchScreen(screenId);
    });
  });

  // Add click to dashboard low stock card to navigate to Inventory
  document.getElementById('dash-low-stock-card').addEventListener('click', () => {
    document.getElementById('inventory-stock-filter').value = 'LOW';
    switchScreen('inventory');
    renderInventoryTable();
  });
}

function switchScreen(screenId) {
  // Update state
  state.activeScreen = screenId;

  // Update Nav visual active indicator
  navItems.forEach(item => {
    if (item.getAttribute('data-screen') === screenId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Hide all screens, show current
  Object.keys(screens).forEach(id => {
    if (id === screenId) {
      screens[id].classList.add('active');
    } else {
      screens[id].classList.remove('active');
    }
  });

  // Update header text title
  const titles = {
    pos: 'POS Cashier checkout',
    inventory: 'Spares Inventory Registry',
    sales: 'Sales Transactions Log',
    dashboard: 'Business Intelligence Analytics',
    settings: 'POS Shop Configuration'
  };
  activeScreenTitle.textContent = titles[screenId] || 'POS System';

  // Load screen specific actions
  if (screenId === 'pos') {
    renderPOSCatalog();
  } else if (screenId === 'inventory') {
    renderInventoryTable();
  } else if (screenId === 'sales') {
    renderSalesHistory();
  } else if (screenId === 'dashboard') {
    renderDashboardAnalytics();
  }
}

// ==================== POS CASHIER CONTROLLER ====================
function setupPOSHandlers() {
  const searchInput = document.getElementById('pos-search');
  const catFilter = document.getElementById('pos-category-filter');
  const clearBtn = document.getElementById('clear-cart-btn');
  const checkoutBtn = document.getElementById('checkout-btn');
  const discountInput = document.getElementById('cart-discount');
  const amountPaidInput = document.getElementById('cart-amount-paid');

  searchInput.addEventListener('input', renderPOSCatalog);
  catFilter.addEventListener('change', renderPOSCatalog);
  document.getElementById('pos-model-filter').addEventListener('change', renderPOSCatalog);
  
  clearBtn.addEventListener('click', () => {
    state.cart = [];
    renderCartItems();
    showToast('POS Cart cleared', 'info');
  });

  discountInput.addEventListener('input', calculateCartTotals);
  
  // Real-time calculation of change due
  amountPaidInput.addEventListener('input', () => {
    const total = parseFloat(document.getElementById('cart-total').textContent.replace(/[^\d.]/g, '')) || 0;
    const paid = parseFloat(amountPaidInput.value) || 0;
    const changeRow = document.getElementById('cart-change-row');
    const changeVal = document.getElementById('cart-change-value');
    
    if (paid >= total && total > 0) {
      const change = paid - total;
      changeRow.style.display = 'flex';
      changeVal.textContent = `${state.settings.currency} ${change.toFixed(2)}`;
    } else {
      changeRow.style.display = 'none';
    }
  });

  checkoutBtn.addEventListener('click', handleCheckout);
  
  // Receipt close handles restarting a transaction
  document.getElementById('close-receipt-btn').addEventListener('click', () => {
    closeModal('receipt-modal');
    state.cart = [];
    renderCartItems();
    amountPaidInput.value = '';
    document.getElementById('cart-change-row').style.display = 'none';
  });

  document.getElementById('print-receipt-btn').addEventListener('click', () => {
    window.print();
  });
}

function renderPOSCatalog() {
  const searchVal = document.getElementById('pos-search').value.toLowerCase();
  const catVal = document.getElementById('pos-category-filter').value;
  const modelVal = document.getElementById('pos-model-filter').value;
  const grid = document.getElementById('pos-products-grid');
  
  grid.innerHTML = '';
  
  // Filter products
  const filtered = state.products.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchVal) ||
      product.sku.toLowerCase().includes(searchVal) ||
      (product.model && product.model.toLowerCase().includes(searchVal));
    const matchesCat = catVal === 'ALL' || product.category === catVal;
    const matchesModel = modelVal === 'ALL' || (product.model && product.model.toLowerCase().includes(modelVal.toLowerCase()));
    return matchesSearch && matchesCat && matchesModel;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:1rem;"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
        <p>No motorcycle spare parts match your query.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const isLowStock = parseInt(product.stock) <= parseInt(product.minStock);
    const stockClass = isLowStock ? 'product-card-stock low' : 'product-card-stock';
    const stockText = isLowStock ? `Low: ${product.stock}` : `Stock: ${product.stock}`;

    card.innerHTML = `
      <div class="${stockClass}">${stockText}</div>
      <div class="product-card-photo">
        ${product.photo ? `<img src="${product.photo}" alt="${product.name}">` : `
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        `}
      </div>
      <div class="product-card-info">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
          <span class="product-card-sku">${product.sku}</span>
          <span style="font-size:0.65rem; color:var(--accent-teal); font-weight:600; text-transform:uppercase;">${product.model || 'Universal'}</span>
        </div>
        <span class="product-card-name" title="${product.name}">${product.name}</span>
        <div class="product-card-bottom">
          <span class="product-card-price">${state.settings.currency} ${parseFloat(product.price).toFixed(2)}</span>
          <span class="product-card-category">${product.category}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => addCartItem(product.id));
    grid.appendChild(card);
  });
}

function addCartItem(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  if (parseInt(product.stock) <= 0) {
    showToast(`Failed: '${product.name}' is out of stock!`, 'danger');
    return;
  }

  const existing = state.cart.find(item => item.productId === productId);
  
  if (existing) {
    if (existing.qty >= parseInt(product.stock)) {
      showToast(`Cannot add: Only ${product.stock} units available in stock.`, 'warning');
      return;
    }
    existing.qty += 1;
  } else {
    state.cart.push({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      price: parseFloat(product.price),
      cost: parseFloat(product.cost),
      qty: 1
    });
  }

  renderCartItems();
  showToast(`Added '${product.name}' to cart`, 'success');
}

function renderCartItems() {
  const container = document.getElementById('cart-items-container');
  container.innerHTML = '';
  
  if (state.cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <p>Your cashier cart is empty.<br>Click items on the left to add.</p>
      </div>
    `;
    updatePOSSummaryUI();
    return;
  }

  state.cart.forEach(item => {
    const pInfo = state.products.find(p => p.id === item.productId);
    const maxStock = pInfo ? pInfo.stock : item.qty;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-details">
        <span class="cart-item-name">${item.name}</span>
        <span class="cart-item-sku">${item.sku}</span>
        <span class="cart-item-price-info">${state.settings.currency} ${item.price.toFixed(2)} each</span>
      </div>
      <div class="cart-item-actions">
        <button class="cart-item-remove" data-id="${item.productId}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
        <div class="qty-control">
          <button class="qty-btn dec" data-id="${item.productId}">-</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn inc" data-id="${item.productId}" ${item.qty >= maxStock ? 'disabled style="opacity:0.4;"' : ''}>+</button>
        </div>
      </div>
    `;

    // Bind item actions
    row.querySelector('.cart-item-remove').addEventListener('click', () => {
      state.cart = state.cart.filter(c => c.productId !== item.productId);
      renderCartItems();
    });

    row.querySelector('.qty-btn.dec').addEventListener('click', () => {
      if (item.qty > 1) {
        item.qty -= 1;
      } else {
        state.cart = state.cart.filter(c => c.productId !== item.productId);
      }
      renderCartItems();
    });

    row.querySelector('.qty-btn.inc').addEventListener('click', () => {
      if (item.qty < maxStock) {
        item.qty += 1;
        renderCartItems();
      }
    });

    container.appendChild(row);
  });

  updatePOSSummaryUI();
}

function calculateCartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discountInput = document.getElementById('cart-discount').value || '0';
  
  let discount = 0;
  if (discountInput.endsWith('%')) {
    const percent = parseFloat(discountInput.replace('%', '')) || 0;
    discount = subtotal * (percent / 100);
  } else {
    discount = parseFloat(discountInput) || 0;
  }

  // Cap discount
  discount = Math.min(discount, subtotal);

  const total = subtotal - discount;

  // Render
  document.getElementById('cart-subtotal').textContent = `${state.settings.currency} ${subtotal.toFixed(2)}`;
  document.getElementById('cart-total').textContent = `${state.settings.currency} ${total.toFixed(2)}`;
  
  // Toggle checkout button
  const checkoutBtn = document.getElementById('checkout-btn');
  checkoutBtn.disabled = state.cart.length === 0;

  return { subtotal, discount, total };
}

function updatePOSSummaryUI() {
  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById('cart-count').textContent = count;
  calculateCartTotals();
}

async function handleCheckout() {
  if (state.cart.length === 0) return;

  const { subtotal, discount, total } = calculateCartTotals();
  const paymentMethod = document.getElementById('cart-pay-method').value;
  const amountPaidInput = document.getElementById('cart-amount-paid');
  const paid = parseFloat(amountPaidInput.value) || total;

  if (paid < total) {
    showToast(`Insufficient Funds! Customer paid ${paid.toFixed(2)} but due amount is ${total.toFixed(2)}`, 'warning');
    return;
  }

  const change = paid - total;
  const transactionId = `TRX-${Date.now().toString().slice(-6)}`;
  const timestamp = new Date().toISOString();

  try {
    // 1. Update stock levels in local DB
    for (const item of state.cart) {
      const dbProd = state.products.find(p => p.id === item.productId);
      if (dbProd) {
        dbProd.stock = Math.max(0, parseInt(dbProd.stock) - item.qty);
        await saveProduct(dbProd);
      }
    }

    // 2. Save transaction to DB
    const saleRecord = {
      id: transactionId,
      timestamp,
      items: state.cart.map(item => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        price: item.price,
        cost: item.cost,
        qty: item.qty
      })),
      subtotal,
      discount,
      total,
      paid,
      change,
      paymentMethod
    };

    await addSale(saleRecord);
    await reloadData();

    // 3. Render Receipt
    renderReceiptModal(saleRecord);

    // 4. Update Catalog & Inventory lists
    renderPOSCatalog();
    renderInventoryTable();
    checkLowStockLevels();

    showToast(`Checkout complete. Receipt ${transactionId} created!`, 'success');
  } catch (error) {
    console.error('Checkout failed:', error);
    showToast('Transaction checkout error. Please retry.', 'danger');
  }
}

function renderReceiptModal(sale) {
  document.getElementById('rec-shop-name').textContent = state.settings.shopName;
  document.getElementById('rec-shop-addr').textContent = state.settings.address;
  document.getElementById('rec-shop-phone').textContent = `Tel: ${state.settings.phone}`;

  document.getElementById('rec-id').textContent = sale.id;
  
  // Format Date nice
  const dateObj = new Date(sale.timestamp);
  document.getElementById('rec-date').textContent = dateObj.toLocaleString();
  document.getElementById('rec-pay').textContent = sale.paymentMethod;

  const itemsGrid = document.getElementById('rec-items-grid');
  itemsGrid.innerHTML = '';

  sale.items.forEach(item => {
    const itemTotal = item.price * item.qty;
    itemsGrid.innerHTML += `
      <div class="receipt-row">
        <span class="receipt-item-desc">${item.name} (${item.sku})</span>
      </div>
      <div class="receipt-row" style="margin-bottom: 0.25rem;">
        <span class="receipt-qty-price">${item.qty} x ${state.settings.currency} ${item.price.toFixed(2)}</span>
        <span>${state.settings.currency} ${itemTotal.toFixed(2)}</span>
      </div>
    `;
  });

  document.getElementById('rec-subtotal').textContent = `${state.settings.currency} ${sale.subtotal.toFixed(2)}`;
  document.getElementById('rec-discount').textContent = `${state.settings.currency} ${sale.discount.toFixed(2)}`;
  document.getElementById('rec-total').textContent = `${state.settings.currency} ${sale.total.toFixed(2)}`;
  document.getElementById('rec-paid').textContent = `${state.settings.currency} ${sale.paid.toFixed(2)}`;
  document.getElementById('rec-change').textContent = `${state.settings.currency} ${sale.change.toFixed(2)}`;

  // Generate Receipt Barcode dynamically
  generateBarcode('#receipt-barcode-svg', sale.id, {
    lineColor: '#000000',
    textColor: '#000000',
    background: '#ffffff',
    height: 40,
    width: 1.5,
    margin: 5
  });

  openModal('receipt-modal');
}

// ==================== INVENTORY REGISTRY ====================
function setupInventoryHandlers() {
  const addBtn = document.getElementById('add-product-btn');
  const searchInput = document.getElementById('inventory-search');
  const catFilter = document.getElementById('inventory-category-filter');
  const stockFilter = document.getElementById('inventory-stock-filter');
  const modal = document.getElementById('product-modal');
  const closeBtns = modal.querySelectorAll('.modal-close-btn, .modal-cancel-btn');
  const fileTrigger = document.getElementById('file-upload-trigger-btn');
  const fileInput = document.getElementById('prod-file-input');
  const cameraTrigger = document.getElementById('camera-capture-trigger-btn');
  const cameraSnap = document.getElementById('camera-snap-btn');
  const cameraClose = document.getElementById('camera-close-btn');
  const saveSubmit = document.getElementById('save-product-submit');
  const skuInput = document.getElementById('prod-sku');

  addBtn.addEventListener('click', () => openProductModal(null));
  
  closeBtns.forEach(btn => btn.addEventListener('click', () => closeModal('product-modal')));

  searchInput.addEventListener('input', renderInventoryTable);
  catFilter.addEventListener('change', renderInventoryTable);
  document.getElementById('inventory-model-filter').addEventListener('change', renderInventoryTable);
  stockFilter.addEventListener('change', renderInventoryTable);

  fileTrigger.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleProductImageUpload);

  cameraTrigger.addEventListener('click', openWebcamCapture);
  cameraSnap.addEventListener('click', captureWebcamSnapshot);
  cameraClose.addEventListener('click', closeWebcamCapture);
  document.querySelector('#camera-modal .modal-close-btn').addEventListener('click', closeWebcamCapture);

  saveSubmit.addEventListener('click', saveProductFormSubmit);
  
  // Real-time Barcode rendering as user types SKU in form
  skuInput.addEventListener('input', () => {
    const value = skuInput.value.trim();
    const barcodeContainer = document.getElementById('modal-barcode-container');
    if (value) {
      barcodeContainer.style.display = 'flex';
      generateBarcode('#modal-barcode', value, {
        height: 40,
        margin: 5
      });
    } else {
      barcodeContainer.style.display = 'none';
    }
  });
}

function openProductModal(productId = null) {
  state.editingProductId = productId;
  state.capturedImageBase64 = null;
  
  const title = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');
  const barcodeContainer = document.getElementById('modal-barcode-container');
  const imgPreview = document.getElementById('prod-img-preview');
  
  form.reset();
  imgPreview.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
  `;
  barcodeContainer.style.display = 'none';

  if (productId) {
    title.textContent = 'Edit Motorcycle Spare Part';
    const prod = state.products.find(p => p.id === productId);
    if (prod) {
      document.getElementById('prod-id').value = prod.id;
      document.getElementById('prod-name').value = prod.name;
      document.getElementById('prod-sku').value = prod.sku;
      document.getElementById('prod-category').value = prod.category;
      document.getElementById('prod-model').value = prod.model || '';
      document.getElementById('prod-cost').value = prod.cost;
      document.getElementById('prod-price').value = prod.price;
      document.getElementById('prod-stock').value = prod.stock;
      document.getElementById('prod-min-stock').value = prod.minStock;
      
      if (prod.photo) {
        state.capturedImageBase64 = prod.photo;
        imgPreview.innerHTML = `<img src="${prod.photo}" alt="Preview">`;
      }
      
      barcodeContainer.style.display = 'flex';
      generateBarcode('#modal-barcode', prod.sku, {
        height: 40,
        margin: 5
      });
    }
  } else {
    title.textContent = 'Add New Motorcycle Spare';
    document.getElementById('prod-id').value = '';
    
    // Auto generate high fidelity SKU
    const randomSKUNum = Math.floor(10000 + Math.random() * 90000);
    const autoSKU = `AM-${randomSKUNum}`;
    document.getElementById('prod-sku').value = autoSKU;
    
    barcodeContainer.style.display = 'flex';
    generateBarcode('#modal-barcode', autoSKU, {
      height: 40,
      margin: 5
    });
  }

  openModal('product-modal');
}

function handleProductImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    state.capturedImageBase64 = e.target.result;
    document.getElementById('prod-img-preview').innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    showToast('Photo uploaded successfully', 'success');
  };
  reader.readAsDataURL(file);
}

// Camera functions
async function openWebcamCapture() {
  const video = document.getElementById('camera-video');
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, // uses back camera on phones
      audio: false
    });
    video.srcObject = state.cameraStream;
    openModal('camera-modal');
  } catch (error) {
    console.error('Camera open failed:', error);
    showToast('Could not access camera. Please upload file instead.', 'danger');
  }
}

function captureWebcamSnapshot() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  
  if (!video.srcObject) return;

  const ctx = canvas.getContext('2d');
  
  // Set dimensions matching live video feed
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  
  // Capture frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Convert frame to low-size JPEG Base64
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  state.capturedImageBase64 = dataUrl;
  
  // Update Preview Box
  document.getElementById('prod-img-preview').innerHTML = `<img src="${dataUrl}" alt="Preview">`;
  showToast('Webcam snapshot captured', 'success');
  
  closeWebcamCapture();
}

function closeWebcamCapture() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }
  document.getElementById('camera-modal').classList.remove('active');
}

async function saveProductFormSubmit() {
  const name = document.getElementById('prod-name').value.trim();
  let sku = document.getElementById('prod-sku').value.trim();
  const category = document.getElementById('prod-category').value;
  const model = document.getElementById('prod-model').value.trim() || 'Universal';
  const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
  const price = parseFloat(document.getElementById('prod-price').value) || 0;
  const stock = parseInt(document.getElementById('prod-stock').value) || 0;
  const minStock = parseInt(document.getElementById('prod-min-stock').value) || 5;
  const id = document.getElementById('prod-id').value || `PROD-${Date.now()}`;

  if (!name) {
    showToast('Spare Name is required', 'warning');
    return;
  }

  if (!sku) {
    sku = `AM-${Math.floor(10000 + Math.random() * 90000)}`;
  }

  // Validate duplicate SKU (only when creating new or changing SKU)
  const isEditing = !!document.getElementById('prod-id').value;
  const skuExists = state.products.some(p => p.sku === sku && p.id !== id);
  if (skuExists) {
    showToast(`SKU '${sku}' already belongs to another spare part.`, 'warning');
    return;
  }

  const product = {
    id,
    name,
    sku,
    category,
    model,
    cost,
    price,
    stock,
    minStock,
    photo: state.capturedImageBase64
  };

  try {
    await saveProduct(product);
    await reloadData();
    
    // Close modal
    closeModal('product-modal');
    
    // Refresh views
    renderPOSCatalog();
    renderInventoryTable();
    checkLowStockLevels();
    
    showToast(isEditing ? `Updated '${name}'` : `Added '${name}' successfully`, 'success');
  } catch (error) {
    console.error('Save failed:', error);
    showToast('Database error. Could not save product.', 'danger');
  }
}

function renderInventoryTable() {
  const searchVal = document.getElementById('inventory-search').value.toLowerCase();
  const catVal = document.getElementById('inventory-category-filter').value;
  const modelVal = document.getElementById('inventory-model-filter').value;
  const stockVal = document.getElementById('inventory-stock-filter').value;
  const tbody = document.getElementById('inventory-table-body');
  
  tbody.innerHTML = '';

  const filtered = state.products.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchVal) ||
      p.sku.toLowerCase().includes(searchVal) ||
      p.category.toLowerCase().includes(searchVal) ||
      (p.model && p.model.toLowerCase().includes(searchVal));
    const matchesCat = catVal === 'ALL' || p.category === catVal;
    const matchesModel = modelVal === 'ALL' || (p.model && p.model.toLowerCase().includes(modelVal.toLowerCase()));
    
    let matchesStock = true;
    const isLow = parseInt(p.stock) <= parseInt(p.minStock);
    const isOut = parseInt(p.stock) === 0;

    if (stockVal === 'LOW') matchesStock = isLow;
    else if (stockVal === 'OUT') matchesStock = isOut;

    return matchesSearch && matchesCat && matchesModel && matchesStock;
  });

  // Populate category filters dynamically in both POS and Inventory dropdowns if needed
  updateCategoryDropdowns();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No spare parts registered matching your filters.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    
    const isLow = parseInt(p.stock) <= parseInt(p.minStock);
    const isOut = parseInt(p.stock) === 0;
    
    if (isOut) tr.className = 'critical-stock-row';
    else if (isLow) tr.className = 'low-stock-row';

    let statusText = 'Good';
    let statusClass = 'stock-cell good';
    if (isOut) {
      statusText = 'Out of Stock';
      statusClass = 'stock-cell critical';
    } else if (isLow) {
      statusText = 'Low Stock';
      statusClass = 'stock-cell low';
    }

    tr.innerHTML = `
      <td>
        <div class="photo-cell">
          ${p.photo ? `<img src="${p.photo}">` : `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          `}
        </div>
      </td>
      <td>
        <div class="barcode-badge" data-sku="${p.sku}">
          <svg class="tbl-barcode-svg" id="tbl-barcode-${p.id}"></svg>
          <span style="font-size:0.6rem; font-family:var(--font-mono); font-weight:600; color: #1e293b;">${p.sku}</span>
        </div>
      </td>
      <td style="font-weight: 600;">${p.name}</td>
      <td>${p.category}</td>
      <td style="font-weight: 500; color: var(--accent-primary);">${p.model || 'Universal'}</td>
      <td style="font-family: var(--font-mono);">${state.settings.currency} ${parseFloat(p.cost).toFixed(2)}</td>
      <td style="font-family: var(--font-mono); font-weight: 600; color: var(--accent-teal);">${state.settings.currency} ${parseFloat(p.price).toFixed(2)}</td>
      <td style="font-family: var(--font-mono); text-align: center; font-weight: 700;">${p.stock}</td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td>
        <div class="actions-cell">
          <button class="action-icon-btn edit" data-id="${p.id}" title="Edit Product">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="action-icon-btn delete" data-id="${p.id}" title="Delete Product">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
    
    // Draw table barcode
    generateBarcode(`#tbl-barcode-${p.id}`, p.sku, {
      height: 25,
      width: 1.2,
      displayValue: false,
      margin: 2
    });
  });

  // Bind Actions dynamically
  tbody.querySelectorAll('.action-icon-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => openProductModal(btn.getAttribute('data-id')));
  });

  tbody.querySelectorAll('.action-icon-btn.delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const prod = state.products.find(p => p.id === id);
      if (!prod) return;

      if (confirm(`Wipe '${prod.name}' entirely from the inventory database?`)) {
        try {
          await deleteProduct(id);
          await reloadData();
          renderInventoryTable();
          renderPOSCatalog();
          checkLowStockLevels();
          showToast(`Deleted '${prod.name}'`, 'warning');
        } catch (error) {
          console.error(error);
          showToast('Could not delete item.', 'danger');
        }
      }
    });
  });
}

// Keep category filter options in sync with what's registered
function updateCategoryDropdowns() {
  const categories = ['Engine', 'Braking', 'Suspension', 'Electrical', 'Tyres', 'Lubes', 'Accessories'];
  const posSelect = document.getElementById('pos-category-filter');
  const invSelect = document.getElementById('inventory-category-filter');

  // Clear choices after ALL
  posSelect.innerHTML = '<option value="ALL">All Categories</option>';
  invSelect.innerHTML = '<option value="ALL">All Categories</option>';

  categories.forEach(cat => {
    posSelect.innerHTML += `<option value="${cat}">${cat} Spares</option>`;
    invSelect.innerHTML += `<option value="${cat}">${cat} Spares</option>`;
  });
}

// Generic PDF exporter function
function exportElementToPDF(element, filename) {
  if (!element) return;
  
  showToast('Generating PDF Report...', 'info');
  
  // Add print mode styling class to body
  document.body.classList.add('generating-pdf');
  
  const opt = {
    margin:       [0.4, 0.4, 0.4, 0.4],
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true,
      backgroundColor: '#090d16'
    },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  
  window.html2pdf().set(opt).from(element).save()
    .then(() => {
      showToast('PDF Report downloaded!', 'success');
    })
    .catch((err) => {
      console.error('PDF export failed:', err);
      showToast('PDF generation failed.', 'danger');
    })
    .finally(() => {
      document.body.classList.remove('generating-pdf');
    });
}

// ==================== SALES TRANSACTIONS LOG ====================
function setupSalesHandlers() {
  document.getElementById('sales-search').addEventListener('input', renderSalesHistory);
  
  // PDF Export
  document.getElementById('download-sales-pdf-btn').addEventListener('click', () => {
    const reportArea = document.querySelector('#screen-sales .sales-panel');
    const dateStr = new Date().toISOString().split('T')[0];
    exportElementToPDF(reportArea, `armstrong_motos_sales_report_${dateStr}.pdf`);
  });
}

function setupDashboardHandlers() {
  // PDF Export
  document.getElementById('download-dashboard-pdf-btn').addEventListener('click', () => {
    const reportArea = document.querySelector('#screen-dashboard .dashboard-panel');
    const dateStr = new Date().toISOString().split('T')[0];
    exportElementToPDF(reportArea, `armstrong_motos_dashboard_analytics_${dateStr}.pdf`);
  });
}

function renderSalesHistory() {
  const searchVal = document.getElementById('sales-search').value.toLowerCase();
  const tbody = document.getElementById('sales-table-body');
  
  tbody.innerHTML = '';

  const filtered = state.sales.filter(s => {
    const matchesSearch = 
      s.id.toLowerCase().includes(searchVal) ||
      s.paymentMethod.toLowerCase().includes(searchVal) ||
      s.items.some(item => item.name.toLowerCase().includes(searchVal) || item.sku.toLowerCase().includes(searchVal));
    return matchesSearch;
  }).reverse(); // Latest transactions show first

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No transaction history match details.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(s => {
    const tr = document.createElement('tr');
    
    // Construct items summaries
    const itemsSummary = s.items.map(i => `${i.name} (x${i.qty})`).join(', ');
    const dateObj = new Date(s.timestamp);

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-teal);">${s.id}</td>
      <td style="font-size:0.8rem;">${dateObj.toLocaleString()}</td>
      <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">${itemsSummary}</td>
      <td style="font-family: var(--font-mono);">${state.settings.currency} ${s.subtotal.toFixed(2)}</td>
      <td style="font-family: var(--font-mono); color: var(--danger);">${state.settings.currency} ${s.discount.toFixed(2)}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--success);">${state.settings.currency} ${s.total.toFixed(2)}</td>
      <td style="font-family: var(--font-mono);">${state.settings.currency} ${s.paid.toFixed(2)}</td>
      <td><span style="font-size: 0.8rem; background-color: var(--bg-tertiary); padding: 0.2rem 0.5rem; border-radius: 4px;">${s.paymentMethod}</span></td>
      <td>
        <button class="action-icon-btn reprint-btn" data-id="${s.id}" title="Reprint Receipt">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
    
    // Reprint action
    tr.querySelector('.reprint-btn').addEventListener('click', () => {
      renderReceiptModal(s);
    });
  });
}

// ==================== BUSINESS ANALYTICS ====================
function renderDashboardAnalytics() {
  const revenueVal = state.sales.reduce((sum, s) => sum + s.total, 0);
  
  // Profit = Sale Price - Buy Cost
  let profitVal = 0;
  state.sales.forEach(sale => {
    sale.items.forEach(item => {
      const cost = item.cost || 0;
      const profitPerUnit = item.price - cost;
      profitVal += (profitPerUnit * item.qty);
    });
    // Deduct discount from profit proportionately
    profitVal -= sale.discount;
  });

  document.getElementById('dash-revenue').textContent = `${state.settings.currency} ${revenueVal.toFixed(2)}`;
  document.getElementById('dash-profit').textContent = `${state.settings.currency} ${profitVal.toFixed(2)}`;
  document.getElementById('dash-sales-count').textContent = state.sales.length;

  checkLowStockLevels();
  renderAnalyticsChart();
  renderTopSellingProducts();
}

function renderAnalyticsChart() {
  const container = document.getElementById('chart-svg-container');
  container.innerHTML = '';

  // Get last 7 days keys
  const days = [];
  const salesMap = {};
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const matchStr = d.toISOString().split('T')[0];
    days.push({ label: dateStr, match: matchStr });
    salesMap[matchStr] = 0;
  }

  // Populate days totals
  state.sales.forEach(s => {
    const saleDay = s.timestamp.split('T')[0];
    if (salesMap[saleDay] !== undefined) {
      salesMap[saleDay] += s.total;
    }
  });

  const chartData = days.map(day => ({
    label: day.label,
    value: salesMap[day.match]
  }));

  // Build high fidelity custom SVG Chart
  const maxValue = Math.max(...chartData.map(d => d.value), 100);
  const chartHeight = 160;
  const chartWidth = 500;
  const paddingLeft = 50;
  const paddingBottom = 25;
  const graphWidth = chartWidth - paddingLeft;
  const graphHeight = chartHeight - paddingBottom;

  let points = '';
  let fillPoints = `${paddingLeft},${graphHeight} `;

  chartData.forEach((d, index) => {
    const x = paddingLeft + (index * (graphWidth / (chartData.length - 1)));
    // Inverted Y axis for canvas
    const y = graphHeight - ((d.value / maxValue) * (graphHeight - 15));
    points += `${x},${y} `;
    fillPoints += `${x},${y} `;
  });
  fillPoints += `${paddingLeft + graphWidth},${graphHeight}`;

  // Grid lines
  let gridLines = '';
  const gridDivs = 4;
  for (let i = 0; i <= gridDivs; i++) {
    const y = 10 + (i * (graphHeight - 10) / gridDivs);
    const gridValue = maxValue - (i * maxValue / gridDivs);
    gridLines += `
      <line x1="${paddingLeft}" y1="${y}" x2="${chartWidth}" y2="${y}" stroke="#374151" stroke-dasharray="4,4" stroke-width="1"/>
      <text x="5" y="${y + 4}" fill="#9ca3af" font-size="9" font-family="sans-serif">${state.settings.currency} ${Math.round(gridValue)}</text>
    `;
  }

  // Axis labels
  let labelsSvg = '';
  chartData.forEach((d, index) => {
    const x = paddingLeft + (index * (graphWidth / (chartData.length - 1)));
    labelsSvg += `
      <text x="${x}" y="${chartHeight - 5}" fill="#9ca3af" font-size="10" font-family="sans-serif" text-anchor="middle">${d.label}</text>
      <circle cx="${x}" cy="${graphHeight - ((d.value / maxValue) * (graphHeight - 15))}" r="4" fill="#f97316" stroke="#ffffff" stroke-width="1.5">
        <title>${d.label}: ${state.settings.currency} ${d.value.toFixed(2)}</title>
      </circle>
    `;
  });

  const svgMarkup = `
    <svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="svg-chart">
      <!-- Grid & Y Values -->
      ${gridLines}
      
      <!-- Shading Area under line -->
      <polygon points="${fillPoints}" fill="url(#chart-grad)" opacity="0.15"/>
      
      <!-- Graph Line -->
      <polyline points="${points}" fill="none" stroke="#f97316" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      
      <!-- Markers and X Labels -->
      ${labelsSvg}
      
      <!-- Definitions -->
      <defs>
        <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f97316"/>
          <stop offset="100%" stop-color="#f97316" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  `;

  container.innerHTML = svgMarkup;
}

function renderTopSellingProducts() {
  const list = document.getElementById('dash-top-products');
  list.innerHTML = '';

  // Accumulate totals
  const prodSales = {};
  state.sales.forEach(sale => {
    sale.items.forEach(item => {
      prodSales[item.productId] = (prodSales[item.productId] || 0) + item.qty;
    });
  });

  // Sort and pick top 5
  const sorted = Object.keys(prodSales)
    .map(id => {
      const prod = state.products.find(p => p.id === id);
      return {
        id,
        name: prod ? prod.name : 'Unknown Spare Part',
        qty: prodSales[id]
      };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  if (sorted.length === 0) {
    list.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding: 2rem;">No items sold yet.</div>`;
    return;
  }

  sorted.forEach((item, index) => {
    list.innerHTML += `
      <div class="top-product-item">
        <div class="top-product-rank">${index + 1}</div>
        <div class="top-product-details">
          <div class="top-product-name">${item.name}</div>
          <div class="top-product-sales">${item.qty} units sold</div>
        </div>
      </div>
    `;
  });
}

// ==================== SYSTEM SETTINGS DRIVER ====================
function setupSettingsHandlers() {
  // Save settings form
  document.getElementById('save-shop-settings-btn').addEventListener('click', async () => {
    const shopName = document.getElementById('set-shop-name').value.trim();
    const currency = document.getElementById('set-shop-currency').value.trim();
    const address = document.getElementById('set-shop-address').value.trim();
    const phone = document.getElementById('set-shop-phone').value.trim();
    const lowStockAlertLimit = parseInt(document.getElementById('set-low-stock-alert').value) || 5;

    if (!shopName || !currency) {
      showToast('Shop Name and Currency are mandatory fields', 'warning');
      return;
    }

    try {
      await saveSetting('shopName', shopName);
      await saveSetting('currency', currency);
      await saveSetting('address', address);
      await saveSetting('phone', phone);
      await saveSetting('lowStockAlertLimit', lowStockAlertLimit);
      
      state.settings = { shopName, currency, address, phone, lowStockAlertLimit };
      applySettingsToUI();
      
      renderPOSCatalog();
      renderInventoryTable();
      
      showToast('Shop configurations saved successfully', 'success');
    } catch (e) {
      console.error(e);
      showToast('Configuration failed to save.', 'danger');
    }
  });

  // DB Backup Exporter
  document.getElementById('export-backup-btn').addEventListener('click', async () => {
    try {
      const backupJson = await exportBackup();
      
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `armstrong_motos_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('Database JSON backup downloaded!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Backup failed to generate.', 'danger');
    }
  });

  // DB Backup Importer
  const importTrigger = document.getElementById('import-backup-trigger-btn');
  const fileInput = document.getElementById('import-backup-file');

  importTrigger.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm('Warning: Importing this backup will clear and overwrite all current items, inventory values, and sales logs in the app. Continue?')) {
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await importBackup(e.target.result);
        showToast('Restoring database content...', 'info');
        
        await reloadData();
        
        // Reload Settings from db
        const dbSettings = await getSettings();
        state.settings = { ...state.settings, ...dbSettings };
        applySettingsToUI();

        // Refresh views
        renderPOSCatalog();
        renderInventoryTable();
        checkLowStockLevels();

        showToast('Database restore complete! POS updated successfully.', 'success');
      } catch (error) {
        console.error(error);
        showToast('Restore failed! Invalid file formatting.', 'danger');
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  // DB reset & clear
  document.getElementById('reset-db-btn').addEventListener('click', async () => {
    if (confirm('CRITICAL ACTION: Are you sure you want to completely wipe the entire POS registry? This clears all inventory, cost indexes, and sales records.')) {
      if (confirm('Double verification: Type "RESET" in the next box to confirm wiping.')) {
        const confirmStr = prompt('Type RESET to confirm deletion:');
        if (confirmStr === 'RESET') {
          showToast('Wiping browser IndexedDB database...', 'warning');
          
          const req = indexedDB.deleteDatabase('ArmstrongMotosDB');
          req.onsuccess = () => {
            showToast('Database wiped clean. Reloading POS app...', 'success');
            setTimeout(() => window.location.reload(), 1500);
          };
          req.onerror = () => {
            showToast('Wiping failed. Open DevTools console.', 'danger');
          };
        } else {
          showToast('Wipe cancelled.', 'info');
        }
      }
    }
  });
}

// ==================== SYSTEM OVERLAY MODALS ====================
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
  // Check if camera stream is active and stop it on modal cancellation
  if (modalId === 'product-modal' || modalId === 'camera-modal') {
    closeWebcamCapture();
  }
}

// Global modal closer when clicking overlay background
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal(overlay.id);
    }
  });
});

// Bind close button actions on modal overlays
document.querySelectorAll('.modal-overlay .modal-close-btn, .modal-overlay .modal-cancel-btn').forEach(btn => {
  btn.addEventListener('click', (event) => {
    const overlay = event.target.closest('.modal-overlay');
    if (overlay) {
      closeModal(overlay.id);
    }
  });
});

// ==================== PROGRESSIVE WEB APP (PWA) ====================
function setupPwaInstallation() {
  let deferredPrompt;
  const installBtn = document.getElementById('pwa-install');
  const onlineStatus = document.getElementById('online-status');

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI to show the install button
    installBtn.style.display = 'flex';
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA Installation outcome: ${outcome}`);
    // We've used the prompt, and can't use it again, discard it
    deferredPrompt = null;
    // Hide the install button
    installBtn.style.display = 'none';
  });

  // Track app installation state
  window.addEventListener('appinstalled', (evt) => {
    console.log('Armstrong Motos POS installed successfully!');
    installBtn.style.display = 'none';
    showToast('Armstrong Motos POS installed as App!', 'success');
  });

  // Online / Offline listeners
  window.addEventListener('online', () => {
    onlineStatus.className = 'status-badge status-online';
    onlineStatus.querySelector('span').textContent = 'Online';
    showToast('Network restored. Running Online.', 'info');
  });

  window.addEventListener('offline', () => {
    onlineStatus.className = 'status-badge status-offline';
    onlineStatus.querySelector('span').textContent = 'Offline Mode';
    showToast('Network disconnected. Running locally.', 'warning');
  });
  
  // Initial check
  if (!navigator.onLine) {
    onlineStatus.className = 'status-badge status-offline';
    onlineStatus.querySelector('span').textContent = 'Offline Mode';
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered:', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }
}
