const ordersTableBody = document.querySelector('#ordersTable tbody');
const orderSearch = document.getElementById('orderSearch');

function formatCurrency(n){
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

const orderStatus = document.getElementById('orderStatus');
let allOrders = [];

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

function showOrderStatus(text, type='info') {
  showToast(text, type);
  if (orderStatus) {
    orderStatus.textContent = text;
    orderStatus.className = `message ${type}`;
  }
}

// Load metrics for orders dashboard header
async function loadAdminStats() {
  try {
    const token = getAdminToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    
    // Calculate orders metrics from current active orders
    const activeOrders = allOrders.filter(o => o.status !== 'cancelled');
    const totalRevenue = activeOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const countOrders = activeOrders.length;
    const avgTicket = countOrders > 0 ? (totalRevenue / countOrders) : 0;
    
    document.getElementById('statRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('statOrders').textContent = countOrders;
    document.getElementById('statAvgTicket').textContent = formatCurrency(avgTicket);
    
    // Fetch products to count low stock items
    const prodRes = await fetch('/api/products', { headers });
    if (prodRes.ok) {
      const products = await prodRes.json();
      const lowStockCount = products.filter(p => typeof p.stock === 'number' && p.stock <= 2).length;
      document.getElementById('statLowStock').textContent = lowStockCount;
    }
  } catch (err) {
    console.error('Error al cargar estadísticas en panel de pedidos:', err);
  }
}

function renderOrders(orders) {
  ordersTableBody.innerHTML = orders.map(order => {
    return `
      <tr data-id="${order.id}">
        <td>${order.id}</td>
        <td><strong>${order.buyer.firstName} ${order.buyer.lastName}</strong></td>
        <td>${order.buyer.phone}</td>
        <td style="font-weight: 800; color: var(--accent);">${formatCurrency(order.total)}</td>
        <td><span class="eyebrow" style="margin: 0; padding: 4px 8px; font-size: 0.75rem;">${order.payment}</span></td>
        <td><span style="font-weight:700;">${order.status}</span></td>
        <td>${new Date(order.createdAt).toLocaleString()}</td>
        <td>
          <select class="statusSelect" style="padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-primary); font-weight: 600; cursor: pointer;">
            <option value="pending" ${order.status==='pending' ? 'selected' : ''}>Pendiente</option>
            <option value="processing" ${order.status==='processing' ? 'selected' : ''}>Procesando</option>
            <option value="shipped" ${order.status==='shipped' ? 'selected' : ''}>Enviado</option>
            <option value="delivered" ${order.status==='delivered' ? 'selected' : ''}>Entregado</option>
            <option value="cancelled" ${order.status==='cancelled' ? 'selected' : ''}>Cancelado</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

async function fetchOrders() {
  if (!requireLogin()) return;
  try {
    const response = await fetch('/api/orders', { headers: { ...authHeaders() } });
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('adminToken');
        location.href = 'admin-login.html';
        return;
      }
      throw new Error('No se pudieron cargar los pedidos.');
    }
    allOrders = await response.json();
    renderOrders(allOrders);
    loadAdminStats();
  } catch (err) {
    showOrderStatus(err.message, 'error');
  }
}

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
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'No se pudo actualizar el estado.');
    }
    const updated = await response.json();
    showOrderStatus(`Pedido ${updated.id} actualizado a "${updated.status}".`, 'success');
    allOrders = allOrders.map(order => order.id === updated.id ? updated : order);
    loadAdminStats(); // Recalculate metrics in case of cancellation changes
  } catch (err) {
    showOrderStatus(err.message, 'error');
  }
});

orderSearch.addEventListener('input', () => {
  const term = orderSearch.value.trim().toLowerCase();
  const filtered = allOrders.filter(order => {
    return (
      order.id.toLowerCase().includes(term) ||
      order.buyer.firstName.toLowerCase().includes(term) ||
      order.buyer.lastName.toLowerCase().includes(term) ||
      order.buyer.phone.toLowerCase().includes(term)
    );
  });
  renderOrders(filtered);
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  location.href = 'admin-login.html';
});

// Run Setup on load
applySavedTheme();
fetchOrders();
