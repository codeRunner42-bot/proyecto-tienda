const apiUrl = '/api/products';
const adminStatus = document.getElementById('adminStatus');

function formatCurrency(n){
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

// Global Toast System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '⚠️';
  
  toast.innerHTML = `
    <span style="display:flex; align-items:center; gap:8px;">
      <span style="font-size:1.1rem; font-weight:bold;">${icon}</span>
      <span>${message}</span>
    </span>
    <button class="toast-close">✕</button>
  `;
  
  container.appendChild(toast);
  
  // Close handler
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  });
  
  // Auto remove
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}

// Theme Persistence
const body = document.body;
function applySavedTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
  } else {
    body.classList.remove('dark-mode');
  }
}

const adminListBody = document.querySelector('#adminList tbody');
const searchInput = document.getElementById('searchInput');
const productForm = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const newProductBtn = document.getElementById('newProductBtn');
const cancelEditBtn = document.getElementById('cancelEdit');
const imagePreview = document.getElementById('imagePreview');
const imageInput = productForm.querySelector('[name="image"]');
const imageUpload = document.getElementById('imageUpload');
let allProducts = [];

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

// Load statistics from database to stats card
async function loadAdminStats() {
  try {
    const token = getAdminToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    
    // Calculate low stock from local products
    const lowStockCount = allProducts.filter(p => typeof p.stock === 'number' && p.stock <= 2).length;
    document.getElementById('statLowStock').textContent = lowStockCount;
    
    // Fetch orders to calculate revenue, average ticket, count
    const response = await fetch('/api/orders', { headers });
    if (response.ok) {
      const orders = await response.json();
      const activeOrders = orders.filter(o => o.status !== 'cancelled');
      const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const countOrders = activeOrders.length;
      const avgTicket = countOrders > 0 ? (totalRevenue / countOrders) : 0;
      
      document.getElementById('statRevenue').textContent = formatCurrency(totalRevenue);
      document.getElementById('statOrders').textContent = countOrders;
      document.getElementById('statAvgTicket').textContent = formatCurrency(avgTicket);
    }
  } catch (err) {
    console.error('Error al cargar métricas de panel:', err);
  }
}

async function fetchProducts() {
  if (!requireLogin()) return;
  try {
    const response = await fetch(apiUrl, { headers: { ...authHeaders() } });
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        location.href = 'admin-login.html';
        return;
      }
      throw new Error('No se pudo cargar la lista de productos.');
    }
    allProducts = await response.json();
    renderProductTable(allProducts);
    loadAdminStats();
  } catch (error) {
    showStatus('Error al conectar con la API de administración.', 'error');
  }
}

function renderProductTable(products) {
  adminListBody.innerHTML = products.map(product => {
    const imgSrc = product.image || 'https://via.placeholder.com/400x300?text=Sin+Imagen';
    return `
      <tr data-id="${product.id}">
        <td>${product.id}</td>
        <td><img src="${imgSrc}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);"></td>
        <td><strong>${product.name}</strong></td>
        <td>${product.category}</td>
        <td>${formatCurrency(product.price)}</td>
        <td>${product.stock ?? 0}</td>
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
  imagePreview.src = 'https://via.placeholder.com/400x300?text=Vista+Previa';
}

function fillForm(product) {
  productForm.id.value = product.id;
  productForm.name.value = product.name;
  productForm.category.value = product.category;
  productForm.price.value = product.price;
  productForm.stock.value = product.stock;
  productForm.image.value = product.image;
  // Convert images array back to comma separated string for form
  productForm.images.value = product.images ? product.images.join(', ') : '';
  productForm.description.value = product.description;
  imagePreview.src = product.image || 'https://via.placeholder.com/400x300?text=Sin+Imagen';
  formTitle.textContent = 'Editar producto';
  showStatus(`Editando producto: "${product.name}" (${product.id}).`, 'info');
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
  
  // Parse images string input into JSON array
  const secondaryImages = formData.get('images').trim() 
    ? formData.get('images').split(',').map(s => s.trim()).filter(Boolean) 
    : [];

  const productData = {
    name: formData.get('name').trim(),
    category: formData.get('category').trim(),
    price: Number(formData.get('price')),
    stock: Number(formData.get('stock')) || 0,
    image: formData.get('image').trim() || 'https://via.placeholder.com/400x300?text=Producto',
    images: secondaryImages,
    description: formData.get('description').trim(),
  };
  const imageFile = document.getElementById('imageUpload').files[0];
  const id = formData.get('id');

  try {
    if (imageFile) {
      const formDataFile = new FormData();
      formDataFile.append('image', imageFile);
      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: formDataFile,
      });
      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || 'No se pudo subir la imagen.');
      }
      const uploadData = await uploadResponse.json();
      productData.image = uploadData.url;
    }

    if (id) {
      await updateProduct(id, productData);
      showStatus('Producto actualizado correctamente.', 'success');
    } else {
      await createProduct(productData);
      showStatus('Producto creado correctamente.', 'success');
    }
    await fetchProducts();
    resetForm();
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

// Update image preview from URL
imageInput.addEventListener('input', () => {
  const url = imageInput.value.trim() || 'https://via.placeholder.com/400x300?text=Vista+Previa';
  imagePreview.src = url;
});

// Update image preview from local file
imageUpload.addEventListener('change', () => {
  const file = imageUpload.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
});

adminListBody.addEventListener('click', async (event) => {
  const row = event.target.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.classList.contains('editBtn')) {
    const product = allProducts.find((item) => item.id === id);
    if (product) fillForm(product);
  }
  if (event.target.classList.contains('deleteBtn')) {
    if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
    try {
      await deleteProduct(id);
      showStatus('Producto eliminado correctamente.', 'success');
      await fetchProducts();
      resetForm();
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

newProductBtn.addEventListener('click', resetForm);
cancelEditBtn.addEventListener('click', resetForm);

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  location.href = 'admin-login.html';
});

// Run Setup on load
applySavedTheme();
if (requireLogin()) {
  fetchProducts();
}
