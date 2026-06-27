// ============================================================
// admin.js — Panel de administración
// (formatCurrency, escapeHTML, showToast, applySavedTheme, themeToggle → utils.js)
// ============================================================

const apiUrl = '/api/products';
const adminStatus = document.getElementById('adminStatus');


// Admin Authentication Helpers
function getAdminToken() {
  return localStorage.getItem('adminToken');
}

function requireLogin() {
  const token = getAdminToken();
  if (!token) {
    location.href = 'admin-login.html';
    return false;
  }
  return true;
}

function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function showStatus(text, type = 'info') {
  showToast(text, type);
  if (adminStatus) {
    adminStatus.textContent = text;
    adminStatus.className = `message ${type}`;
  }
}

// Tab switcher logic
const tabButtons = document.querySelectorAll('.sidebar-nav .nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const pageTitle = document.getElementById('pageTitle');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    
    tabButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    tabPanes.forEach(pane => pane.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    const titles = {
      dashboard: 'Dashboard',
      products: 'Gestión de Productos',
      orders: 'Gestión de Pedidos',
      invoices: 'Gestión de Facturas',
      pos: 'Punto de Venta (Venta Directa)',
      users: 'Gestión de Clientes',
      reviews: 'Moderación de Opiniones'
    };
    pageTitle.textContent = titles[tabName] || 'Administración';
  });
});

// Global state variables
let allProducts = [];
let allOrders = [];
let allUsers = [];
let allReviews = [];

// DOM bindings
const adminListBody = document.querySelector('#adminList tbody');
const searchInput = document.getElementById('searchInput');
const productForm = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const newProductBtn = document.getElementById('newProductBtn');
const cancelEditBtn = document.getElementById('cancelEdit');
const productFormWrapper = document.getElementById('productFormWrapper');

// ── Multi-image uploader state ─────────────────────────────
// Each entry: { url: string, isUploading: bool, isMain: bool }
let imgEntries = [];

const imgDropZone    = document.getElementById('imgDropZone');
const multiUpload    = document.getElementById('multiImageUpload');
const imgGrid        = document.getElementById('imgThumbnailGrid');
const hiddenMain     = document.getElementById('hiddenMainImage');
const hiddenExtras   = document.getElementById('hiddenExtraImages');

// Click drop zone → open file picker
imgDropZone.addEventListener('click', () => multiUpload.click());

// Drag-and-drop styling
imgDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  imgDropZone.style.borderColor = 'var(--accent)';
  imgDropZone.style.background  = 'var(--accent-light, rgba(139,26,74,0.06))';
});
imgDropZone.addEventListener('dragleave', () => {
  imgDropZone.style.borderColor = '';
  imgDropZone.style.background  = '';
});
imgDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  imgDropZone.style.borderColor = '';
  imgDropZone.style.background  = '';
  if (e.dataTransfer.files.length) handleImageFiles(e.dataTransfer.files);
});
multiUpload.addEventListener('change', () => {
  if (multiUpload.files.length) handleImageFiles(multiUpload.files);
  multiUpload.value = '';
});

// Añadir imagen por URL — soporta varias a la vez (coma o salto de línea)
const imgUrlInput  = document.getElementById('imgUrlInput');
const imgUrlAddBtn = document.getElementById('imgUrlAddBtn');
const imgUrlPreviewRow = document.getElementById('imgUrlPreviewRow');

// Vista previa en tiempo real mientras escribe en el textarea
imgUrlInput.addEventListener('input', () => {
  const raw = imgUrlInput.value;
  const urls = raw.split(/[,\n]/).map(u => u.trim()).filter(u => u.startsWith('http://') || u.startsWith('https://'));
  if (urls.length === 0) {
    imgUrlPreviewRow.style.display = 'none';
    imgUrlPreviewRow.innerHTML = '';
    return;
  }
  imgUrlPreviewRow.style.display = 'flex';
  imgUrlPreviewRow.innerHTML = urls.map(u =>
    `<img src="${u}" alt="preview" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:2px solid var(--border-color);" onerror="this.style.display='none'">`
  ).join('');
});

function addImageByUrl() {
  const raw = imgUrlInput.value.trim();
  if (!raw) return;
  const urls = raw.split(/[,\n]/).map(u => u.trim()).filter(u => u);
  let added = 0;
  for (const url of urls) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
    imgEntries.push({ url, isUploading: false, isMain: imgEntries.length === 0 && added === 0 });
    added++;
  }
  if (added === 0) {
    showStatus('Las URLs deben comenzar con http:// o https://', 'error');
    return;
  }
  imgUrlInput.value = '';
  imgUrlPreviewRow.style.display = 'none';
  imgUrlPreviewRow.innerHTML = '';
  renderImgGrid();
  syncHiddenFields();
}

imgUrlAddBtn.addEventListener('click', addImageByUrl);
imgUrlInput.addEventListener('keydown', (e) => {
  // Ctrl+Enter o Cmd+Enter para añadir sin salto de línea
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addImageByUrl(); }
});


async function handleImageFiles(files) {
  for (const file of files) {
    const idx = imgEntries.length;
    // Vista previa local inmediata mientras sube a Cloudinary
    const localPreviewUrl = URL.createObjectURL(file);
    imgEntries.push({ url: localPreviewUrl, isUploading: true, isMain: imgEntries.length === 0 });
    renderImgGrid();

    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al subir imagen.');
      }
      const data = await res.json();
      URL.revokeObjectURL(localPreviewUrl);
      imgEntries[idx].url = data.url;
      imgEntries[idx].isUploading = false;

      if (!imgEntries.some(e => e.isMain)) imgEntries[idx].isMain = true;
    } catch (err) {
      URL.revokeObjectURL(localPreviewUrl);
      imgEntries.splice(idx, 1);
      showStatus(err.message, 'error');
    }
    renderImgGrid();
  }
  syncHiddenFields();
}

function renderImgGrid() {
  imgGrid.innerHTML = imgEntries.map((entry, i) => {
    const isMain = entry.isMain;
    return `
      <div data-imgidx="${i}" style="position:relative; width:100px; height:100px; border-radius:10px; border:3px solid ${isMain && !entry.isUploading ? 'var(--accent)' : 'var(--border-color)'}; overflow:hidden; box-shadow: ${isMain && !entry.isUploading ? '0 0 0 2px var(--accent)' : 'none'};">
        <img src="${entry.url}" alt="img" style="width:100%; height:100%; object-fit:cover; display:block; ${entry.isUploading ? 'filter:blur(3px) brightness(0.65);' : ''}">
        ${entry.isUploading
          ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">⏳</div>'
          : `${isMain ? '<div style="position:absolute;top:4px;left:4px;background:var(--accent);color:#fff;font-size:0.6rem;font-weight:800;padding:2px 6px;border-radius:20px;">PRINCIPAL</div>' : ''}
        <div style="position:absolute;bottom:0;left:0;right:0;display:flex;gap:2px;background:rgba(0,0,0,0.55);padding:4px;">
          ${!isMain ? `<button type="button" class="imgSetMain" data-i="${i}" style="flex:1;background:var(--accent);color:#fff;border:none;border-radius:4px;font-size:0.62rem;cursor:pointer;padding:2px;">⭐ Principal</button>` : ''}
          <button type="button" class="imgRemove" data-i="${i}" style="flex:1;background:#e74c3c;color:#fff;border:none;border-radius:4px;font-size:0.62rem;cursor:pointer;padding:2px;">🗑 Quitar</button>
        </div>`
        }
      </div>`;
  }).join('');
}

imgGrid.addEventListener('click', (e) => {
  const setBtn = e.target.closest('.imgSetMain');
  const delBtn = e.target.closest('.imgRemove');
  if (setBtn) {
    const i = Number(setBtn.dataset.i);
    imgEntries.forEach((en, idx) => en.isMain = idx === i);
    renderImgGrid();
    syncHiddenFields();
  }
  if (delBtn) {
    const i = Number(delBtn.dataset.i);
    imgEntries.splice(i, 1);
    // Ensure one stays main
    if (imgEntries.length > 0 && !imgEntries.some(e => e.isMain)) imgEntries[0].isMain = true;
    renderImgGrid();
    syncHiddenFields();
  }
});

function syncHiddenFields() {
  const mainEntry = imgEntries.find(e => e.isMain && e.url);
  hiddenMain.value  = mainEntry ? mainEntry.url : '';
  hiddenExtras.value = imgEntries.filter(e => !e.isMain && e.url).map(e => e.url).join(',');
}

function clearImgEntries() {
  imgEntries = [];
  renderImgGrid();
  syncHiddenFields();
}

function loadImgEntries(mainUrl, extraUrls) {
  imgEntries = [];
  if (mainUrl) imgEntries.push({ url: mainUrl, isUploading: false, isMain: true });
  (extraUrls || []).forEach(u => {
    if (u) imgEntries.push({ url: u, isUploading: false, isMain: false });
  });
  renderImgGrid();
  syncHiddenFields();
}

// Load statistics from database to stats card


async function loadAdminStats() {
  try {
    const lowStockCount = allProducts.filter(p => typeof p.stock === 'number' && p.stock <= 2).length;
    document.getElementById('statLowStock').textContent = lowStockCount;
    
    const activeOrders = allOrders.filter(o => o.status !== 'cancelled');
    const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const countOrders = activeOrders.length;
    const avgTicket = countOrders > 0 ? (totalRevenue / countOrders) : 0;
    
    document.getElementById('statRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('statOrders').textContent = countOrders;
    document.getElementById('statAvgTicket').textContent = formatCurrency(avgTicket);
    
    renderLatestOrders();
  } catch (err) {
    console.error('Error al cargar métricas de panel:', err);
  }
}

function renderLatestOrders() {
  const latestOrdersTableBody = document.querySelector('#latestOrdersTable tbody');
  if (!latestOrdersTableBody) return;
  
  if (allOrders.length === 0) {
    latestOrdersTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px;">No hay pedidos recibidos.</td></tr>`;
    return;
  }
  
  const recent = allOrders.slice(0, 3);
  latestOrdersTableBody.innerHTML = recent.map(order => {
    let statusClass = 'status-pending';
    let statusText = order.status;
    if (order.status === 'pending') { statusClass = 'status-pending'; statusText = 'Pendiente'; }
    else if (order.status === 'processing') { statusClass = 'status-processing'; statusText = 'Preparando'; }
    else if (order.status === 'shipped') { statusClass = 'status-shipped'; statusText = 'Despachado'; }
    else if (order.status === 'delivered') { statusClass = 'status-delivered'; statusText = 'Entregado'; }
    else if (order.status === 'cancelled') { statusClass = 'status-cancelled'; statusText = 'Cancelado'; }
    
    return `
      <tr>
        <td>${order.id}</td>
        <td><strong>${order.buyer.firstName} ${order.buyer.lastName}</strong></td>
        <td style="font-weight: 700; color: var(--accent);">${formatCurrency(order.total)}</td>
        <td><span class="order-status-pill ${statusClass}" style="margin:0; padding:4px 10px; font-size:0.75rem;">${statusText}</span></td>
        <td>${new Date(order.createdAt).toLocaleDateString()}</td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// PRODUCTS CRUD LOGIC
// ==========================================================================



function renderProductTable(products) {
  adminListBody.innerHTML = products.map(product => {
    const imgSrc = product.image || 'https://via.placeholder.com/400x300?text=Sin+Imagen';
    
    // Stock visual coloring
    const stockVal = product.stock ?? 0;
    let stockBadge = '';
    if (stockVal === 0) {
      stockBadge = `<span style="color:#e74c3c; font-weight:700;">🔴 Agotado</span>`;
    } else if (stockVal <= 2) {
      stockBadge = `<span style="color:#d4af37; font-weight:700;">⚠️ Bajo (${stockVal})</span>`;
    } else {
      stockBadge = `<span style="color:#27ae60; font-weight:700;">🟢 En Stock (${stockVal})</span>`;
    }
    
    return `
      <tr data-id="${product.id}">
        <td>${product.id}</td>
        <td><img src="${imgSrc}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);"></td>
        <td><strong>${product.name}</strong></td>
        <td>${product.category}</td>
        <td>${formatCurrency(product.price)}</td>
        <td>${stockBadge}</td>
        <td>
          <button class="btn btn-secondary editBtn" style="padding: 6px 12px; font-size: 0.85rem;">Editar</button>
          <button class="btn btn-danger deleteBtn" style="padding: 6px 12px; font-size: 0.85rem;">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

function resetForm() {
  productForm.reset();
  productForm.id.value = '';
  formTitle.textContent = 'Agregar producto';
  clearImgEntries();
}

function fillForm(product) {
  productForm.id.value = product.id;
  productForm.name.value = product.name;
  productForm.category.value = product.category;
  productForm.price.value = product.price;
  productForm.stock.value = product.stock;
  productForm.description.value = product.description;
  loadImgEntries(product.image, product.images);
  formTitle.textContent = 'Editar producto';
  productFormWrapper.style.display = 'block';
  showStatus(`Editando producto: "${product.name}" (${product.id}).`, 'info');
  productFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function createProduct(data) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'No se pudo crear el producto.');
  }
  return response.json();
}

async function updateProduct(id, data) {
  const response = await fetch(`${apiUrl}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'No se pudo actualizar el producto.');
  }
  return response.json();
}

async function deleteProduct(id) {
  const response = await fetch(`${apiUrl}/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'No se pudo eliminar el producto.');
  }
  return response.json();
}

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);

  syncHiddenFields();

  const mainImage = hiddenMain.value.trim() || 'https://via.placeholder.com/400x300?text=Producto';
  const extraImages = hiddenExtras.value.trim()
    ? hiddenExtras.value.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const productData = {
    name: formData.get('name').trim(),
    category: formData.get('category').trim(),
    price: Number(formData.get('price')),
    stock: Number(formData.get('stock')) || 0,
    image: mainImage,
    images: extraImages,
    description: formData.get('description').trim(),
  };
  const id = formData.get('id');

  try {
    if (id) {
      await updateProduct(id, productData);
      showStatus('Producto actualizado correctamente.', 'success');
    } else {
      await createProduct(productData);
      showStatus('Producto creado correctamente.', 'success');
    }
    
    productFormWrapper.style.display = 'none';
    resetForm();
    await loadAllData();
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

// (image preview listeners removed — handled by multi-uploader)

adminListBody.addEventListener('click', async (event) => {
  const btn = event.target;
  const row = btn.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  if (btn.classList.contains('editBtn')) {
    const product = allProducts.find((item) => item.id === id);
    if (product) fillForm(product);
  }
  if (btn.classList.contains('deleteBtn')) {
    if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
    try {
      await deleteProduct(id);
      showStatus('Producto eliminado correctamente.', 'success');
      await loadAllData();
      resetForm();
      productFormWrapper.style.display = 'none';
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }
});

searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = allProducts.filter((product) => {
    return (
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term) ||
      String(product.id).toLowerCase().includes(term)
    );
  });
  renderProductTable(filtered);
});

newProductBtn.addEventListener('click', () => {
  resetForm();
  productFormWrapper.style.display = 'block';
});
cancelEditBtn.addEventListener('click', () => {
  resetForm();
  productFormWrapper.style.display = 'none';
});


// ==========================================================================
// ORDERS CRUD LOGIC
// ==========================================================================

const ordersTableBody = document.querySelector('#ordersTable tbody');
const orderSearch = document.getElementById('orderSearch');

async function fetchOrders() {
  const response = await fetch('/api/orders', { headers: authHeaders() });
  if (!response.ok) throw new Error('No se pudieron cargar los pedidos.');
  allOrders = await response.json();
  renderOrdersTable(allOrders);
}

function renderOrdersTable(orders) {
  ordersTableBody.innerHTML = orders.map(order => {
    return `
      <tr data-id="${order.id}">
        <td>${order.id}</td>
        <td><strong>${escapeHTML(order.buyer.firstName)} ${escapeHTML(order.buyer.lastName)}</strong></td>
        <td>${escapeHTML(order.buyer.documentId) || '—'}</td>
        <td>${escapeHTML(order.buyer.phone)}</td>
        <td style="font-weight: 800; color: var(--accent);">${formatCurrency(order.total)}</td>
        <td><span class="eyebrow" style="margin: 0; padding: 4px 8px; font-size: 0.75rem;">${escapeHTML(order.payment)}</span></td>
        <td><span style="font-weight:700;">${escapeHTML(order.status)}</span></td>
        <td>${new Date(order.createdAt).toLocaleString()}</td>
        <td>
          <select class="statusSelect" style="padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); font-weight: 600; cursor: pointer;">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pendiente</option>
            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Procesando</option>
            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Enviado</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Entregado</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
          </select>
        </td>
        <td>
          <button class="btn btn-danger deleteOrderBtn" style="padding: 6px 12px; font-size: 0.85rem;">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

orderSearch.addEventListener('input', () => {
  const term = orderSearch.value.trim().toLowerCase();
  const filtered = allOrders.filter(order => {
    return (
      order.id.toLowerCase().includes(term) ||
      order.buyer.firstName.toLowerCase().includes(term) ||
      order.buyer.lastName.toLowerCase().includes(term) ||
      (order.buyer.documentId && order.buyer.documentId.toLowerCase().includes(term)) ||
      order.buyer.phone.toLowerCase().includes(term)
    );
  });
  renderOrdersTable(filtered);
});

ordersTableBody.addEventListener('change', async (event) => {
  if (!event.target.classList.contains('statusSelect')) return;
  const row = event.target.closest('tr');
  const id = row.dataset.id;
  const newStatus = event.target.value;
  try {
    const response = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status: newStatus })
    });
    if (!response.ok) throw new Error('No se pudo actualizar el estado.');
    const updated = await response.json();
    showStatus(`Pedido ${updated.id} actualizado a "${updated.status}".`, 'success');
    allOrders = allOrders.map(o => o.id === updated.id ? updated : o);
    loadAdminStats();
    renderOrdersTable(allOrders);
  } catch (err) {
    showStatus(err.message, 'error');
  }
});

ordersTableBody.addEventListener('click', async (event) => {
  if (!event.target.classList.contains('deleteOrderBtn')) return;
  const row = event.target.closest('tr');
  const id = row.dataset.id;
  if (!confirm('¿Eliminar este pedido de forma permanente?')) return;
  try {
    const response = await fetch(`/api/orders/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('No se pudo eliminar el pedido.');
    showStatus('Pedido eliminado correctamente.', 'success');
    allOrders = allOrders.filter(o => o.id !== id);
    loadAdminStats();
    renderOrdersTable(allOrders);
  } catch (err) {
    showStatus(err.message, 'error');
  }
});


// ==========================================================================
// CLIENTS (USERS) CRUD LOGIC
// ==========================================================================

const usersTableBody = document.querySelector('#usersTable tbody');
const userSearch = document.getElementById('userSearch');
const userForm = document.getElementById('userForm');
const userFormWrapper = document.getElementById('userFormWrapper');
const newUserBtn = document.getElementById('newUserBtn');
const cancelUserEditBtn = document.getElementById('cancelUserEdit');
const userFormTitle = document.getElementById('userFormTitle');
const userPasswordInput = document.getElementById('userPasswordInput');

async function fetchUsers() {
  const response = await fetch('/api/admin/users', { headers: authHeaders() });
  if (!response.ok) throw new Error('No se pudieron cargar los clientes.');
  allUsers = await response.json();
  renderUsersTable(allUsers);
}

function renderUsersTable(users) {
  usersTableBody.innerHTML = users.map(user => {
    return `
      <tr data-id="${user.id}">
        <td>${user.id}</td>
        <td>${escapeHTML(user.documentId) || '—'}</td>
        <td>${escapeHTML(user.email)}</td>
        <td><strong>${escapeHTML(user.firstName)} ${escapeHTML(user.lastName)}</strong></td>
        <td>${escapeHTML(user.phone)}</td>
        <td>${escapeHTML(user.address) || '<em style="color:var(--text-muted)">Sin dirección</em>'}</td>
        <td>
          <button class="btn btn-secondary editUserBtn" style="padding: 6px 12px; font-size: 0.85rem;">Editar</button>
          <button class="btn btn-danger deleteUserBtn" style="padding: 6px 12px; font-size: 0.85rem;">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

userSearch.addEventListener('input', () => {
  const term = userSearch.value.trim().toLowerCase();
  const filtered = allUsers.filter(user => {
    return (
      user.email.toLowerCase().includes(term) ||
      user.firstName.toLowerCase().includes(term) ||
      user.lastName.toLowerCase().includes(term) ||
      (user.documentId && user.documentId.toLowerCase().includes(term)) ||
      user.phone.toLowerCase().includes(term)
    );
  });
  renderUsersTable(filtered);
});

newUserBtn.addEventListener('click', () => {
  userForm.reset();
  userForm.id.value = '';
  userFormTitle.textContent = 'Crear Cliente';
  userPasswordInput.required = true;
  userPasswordInput.placeholder = 'Contraseña *';
  userFormWrapper.style.display = 'block';
});

cancelUserEditBtn.addEventListener('click', () => {
  userForm.reset();
  userFormWrapper.style.display = 'none';
});

usersTableBody.addEventListener('click', async (event) => {
  const btn = event.target;
  const row = btn.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  
  if (btn.classList.contains('editUserBtn')) {
    const user = allUsers.find(u => u.id === id);
    if (user) {
      userForm.id.value = user.id;
      userForm.email.value = user.email;
      userForm.firstName.value = user.firstName;
      userForm.lastName.value = user.lastName;
      userForm.documentId.value = user.documentId || '';
      userForm.phone.value = user.phone;
      userForm.address.value = user.address || '';
      userFormTitle.textContent = 'Editar Cliente';
      userPasswordInput.required = false;
      userPasswordInput.placeholder = 'Nueva Contraseña (dejar en blanco para conservar)';
      userFormWrapper.style.display = 'block';
    }
  }
  
  if (btn.classList.contains('deleteUserBtn')) {
    if (!confirm('¿Eliminar este cliente? Se borrarán sus datos de inicio de sesión.')) return;
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!response.ok) throw new Error('No se pudo eliminar el cliente.');
      showStatus('Cliente eliminado correctamente.', 'success');
      await fetchUsers();
      userFormWrapper.style.display = 'none';
      userForm.reset();
    } catch (err) {
      showStatus(err.message, 'error');
    }
  }
});

userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(userForm);
  const id = formData.get('id');
  
  const userData = {
    email: formData.get('email').trim(),
    firstName: formData.get('firstName').trim(),
    lastName: formData.get('lastName').trim(),
    documentId: formData.get('documentId').trim(),
    phone: formData.get('phone').trim(),
    address: formData.get('address').trim(),
  };
  
  const password = formData.get('password');
  if (password && password.trim() !== '') {
    userData.password = password;
  }
  
  try {
    let response;
    if (id) {
      response = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(userData)
      });
    } else {
      if (!password || password.trim() === '') {
        throw new Error('La contraseña es obligatoria para clientes nuevos.');
      }
      response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(userData)
      });
    }
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'No se pudo guardar el cliente.');
    }
    
    showStatus(id ? 'Cliente actualizado con éxito.' : 'Cliente creado con éxito.', 'success');
    userFormWrapper.style.display = 'none';
    userForm.reset();
    await fetchUsers();
  } catch (err) {
    showStatus(err.message, 'error');
  }
});


// ==========================================================================
// REVIEWS CRUD LOGIC
// ==========================================================================

const reviewsTableBody = document.querySelector('#reviewsTable tbody');
const reviewSearch = document.getElementById('reviewSearch');
const reviewForm = document.getElementById('reviewForm');
const reviewFormWrapper = document.getElementById('reviewFormWrapper');
const newReviewBtn = document.getElementById('newReviewBtn');
const cancelReviewEditBtn = document.getElementById('cancelReviewEdit');
const reviewFormTitle = document.getElementById('reviewFormTitle');
const reviewProductSelect = reviewForm.querySelector('select[name="product_id"]');

async function fetchReviews() {
  const response = await fetch('/api/admin/reviews', { headers: authHeaders() });
  if (!response.ok) throw new Error('No se pudieron cargar las opiniones.');
  allReviews = await response.json();
  renderReviewsTable(allReviews);
}

function renderReviewsTable(reviews) {
  reviewsTableBody.innerHTML = reviews.map(rev => {
    const stars = '★'.repeat(rev.rating) + '☆'.repeat(5 - rev.rating);
    const prodName = rev.productName ? escapeHTML(rev.productName) : `<span style="color:var(--text-muted)">Producto eliminado (${escapeHTML(rev.product_id)})</span>`;
    return `
      <tr data-id="${rev.id}">
        <td>${rev.id}</td>
        <td><strong>${prodName}</strong></td>
        <td>${escapeHTML(rev.author)}</td>
        <td style="color:var(--gold); font-weight:800; font-size:1.1rem;">${stars}</td>
        <td>${escapeHTML(rev.comment) || '<em style="color:var(--text-muted)">Sin comentario</em>'}</td>
        <td>${new Date(rev.createdAt).toLocaleString()}</td>
        <td>
          <button class="btn btn-secondary editReviewBtn" style="padding: 6px 12px; font-size: 0.85rem;">Editar</button>
          <button class="btn btn-danger deleteReviewBtn" style="padding: 6px 12px; font-size: 0.85rem;">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

reviewSearch.addEventListener('input', () => {
  const term = reviewSearch.value.trim().toLowerCase();
  const filtered = allReviews.filter(rev => {
    return (
      rev.author.toLowerCase().includes(term) ||
      (rev.productName && rev.productName.toLowerCase().includes(term)) ||
      (rev.comment && rev.comment.toLowerCase().includes(term))
    );
  });
  renderReviewsTable(filtered);
});

function populateProductsSelect() {
  reviewProductSelect.innerHTML = allProducts.map(p => {
    return `<option value="${p.id}">${p.name} (ID: ${p.id})</option>`;
  }).join('');
}

newReviewBtn.addEventListener('click', () => {
  reviewForm.reset();
  reviewForm.id.value = '';
  reviewFormTitle.textContent = 'Crear Opinión';
  reviewProductSelect.disabled = false;
  populateProductsSelect();
  reviewFormWrapper.style.display = 'block';
});

cancelReviewEditBtn.addEventListener('click', () => {
  reviewForm.reset();
  reviewFormWrapper.style.display = 'none';
});

reviewsTableBody.addEventListener('click', async (event) => {
  const btn = event.target;
  const row = btn.closest('tr');
  if (!row) return;
  const id = Number(row.dataset.id);
  
  if (btn.classList.contains('editReviewBtn')) {
    const rev = allReviews.find(r => r.id === id);
    if (rev) {
      reviewForm.id.value = rev.id;
      populateProductsSelect();
      reviewProductSelect.value = rev.product_id;
      reviewProductSelect.disabled = true; // No permitir cambiar de producto en edición
      
      reviewForm.author.value = rev.author;
      reviewForm.rating.value = rev.rating;
      reviewForm.comment.value = rev.comment || '';
      reviewFormTitle.textContent = 'Editar Opinión';
      reviewFormWrapper.style.display = 'block';
    }
  }
  
  if (btn.classList.contains('deleteReviewBtn')) {
    if (!confirm('¿Eliminar esta opinión permanentemente?')) return;
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!response.ok) throw new Error('No se pudo eliminar la opinión.');
      showStatus('Opinión eliminada correctamente.', 'success');
      await fetchReviews();
      reviewFormWrapper.style.display = 'none';
      reviewForm.reset();
    } catch (err) {
      showStatus(err.message, 'error');
    }
  }
});

reviewForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(reviewForm);
  const id = formData.get('id');
  
  const reviewData = {
    product_id: reviewProductSelect.value,
    author: formData.get('author').trim(),
    rating: Number(formData.get('rating')),
    comment: formData.get('comment').trim(),
  };
  
  try {
    let response;
    if (id) {
      response = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(reviewData)
      });
    } else {
      response = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(reviewData)
      });
    }
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'No se pudo guardar la opinión.');
    }
    
    showStatus(id ? 'Opinión actualizada con éxito.' : 'Opinión creada con éxito.', 'success');
    reviewFormWrapper.style.display = 'none';
    reviewForm.reset();
    await fetchReviews();
  } catch (err) {
    showStatus(err.message, 'error');
  }
});


// ==========================================================================
// UNIFIED DATA LOADING & SYSTEM START
// ==========================================================================

async function loadAllData() {
  if (!requireLogin()) return;
  try {
    // Load products first
    const prodResponse = await fetch(apiUrl, { headers: authHeaders() });
    if (!prodResponse.ok) {
      if (prodResponse.status === 401) {
        localStorage.removeItem('adminToken');
        location.href = 'admin-login.html';
        return;
      }
      throw new Error('No se pudieron cargar los productos.');
    }
    allProducts = await prodResponse.json();
    renderProductTable(allProducts);
    
    // Load remaining data asynchronously
    await Promise.all([
      fetchOrders(),
      fetchUsers(),
      fetchReviews()
    ]);
    
    loadAdminStats();
  } catch (error) {
    showStatus('Error de conexión con el servidor: ' + error.message, 'error');
  }
}

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  location.href = 'admin-login.html';
});

// Run Setup on load
applySavedTheme();
if (requireLogin()) {
  loadAllData();
}

// Restringir entrada en tiempo real según el tipo de campo
document.addEventListener('input', (e) => {
  if (e.target) {
    if (e.target.name === 'documentId' || e.target.name === 'phone' || e.target.name === 'price' || e.target.name === 'stock') {
      e.target.value = e.target.value.replace(/\D/g, '');
    } else if (e.target.name === 'firstName' || e.target.name === 'lastName') {
      e.target.value = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]/g, '');
    }
  }
});

