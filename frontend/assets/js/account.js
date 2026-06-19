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
  
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  });
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}

// Theme Persistence
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

function applySavedTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    if (themeToggle) themeToggle.textContent = '☀️';
  } else {
    body.classList.remove('dark-mode');
    if (themeToggle) themeToggle.textContent = '🌙';
  }
}

themeToggle?.addEventListener('click', () => {
  if (body.classList.contains('dark-mode')) {
    body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
    themeToggle.textContent = '🌙';
  } else {
    body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
    themeToggle.textContent = '☀️';
  }
});

// Update Cart Count
const cart = JSON.parse(localStorage.getItem('cart') || '[]');
const cartCount = document.getElementById('cartCount');
if (cartCount) cartCount.textContent = cart.reduce((s, i) => s + i.qty, 0);

// Dom Elements
const authContainer = document.getElementById('authContainer');
const dashboardContainer = document.getElementById('dashboardContainer');
const clientLoginForm = document.getElementById('clientLoginForm');
const clientRegisterForm = document.getElementById('clientRegisterForm');
const customerOrdersList = document.getElementById('customerOrdersList');

// Profile Fields
const profName = document.getElementById('profName');
const profEmail = document.getElementById('profEmail');
const profPhone = document.getElementById('profPhone');
const profAddress = document.getElementById('profAddress');
const clientLogoutBtn = document.getElementById('clientLogoutBtn');

function getClientToken() {
  return localStorage.getItem('clientToken');
}

// Check logged in state and render corresponding panel
async function checkAuth() {
  const token = getClientToken();
  if (token) {
    authContainer.style.display = 'none';
    dashboardContainer.style.display = 'grid';
    await loadProfileAndHistory(token);
  } else {
    authContainer.style.display = 'grid';
    dashboardContainer.style.display = 'none';
  }
}

// Fetch user profile and order list
async function loadProfileAndHistory(token) {
  try {
    const res = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) {
      // Token might be expired
      localStorage.removeItem('clientToken');
      localStorage.removeItem('clientUser');
      checkAuth();
      return;
    }
    
    const data = await res.json();
    const user = data.user;
    const orders = data.orders;
    
    // Set profile info
    profName.textContent = `${user.firstName} ${user.lastName}`;
    profEmail.textContent = user.email;
    profPhone.textContent = user.phone;
    profAddress.textContent = user.address || 'Sin dirección registrada';
    
    // Render orders
    if (orders.length === 0) {
      customerOrdersList.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:32px;">Aún no has realizado ningún pedido.</p>`;
      return;
    }
    
    customerOrdersList.innerHTML = orders.map(o => {
      let statusClass = 'status-pending';
      let statusText = o.status;
      if (o.status === 'pending') { statusClass = 'status-pending'; statusText = 'Pendiente 🕒'; }
      else if (o.status === 'processing') { statusClass = 'status-processing'; statusText = 'Preparando 📦'; }
      else if (o.status === 'shipped') { statusClass = 'status-shipped'; statusText = 'Despachado 🚚'; }
      else if (o.status === 'delivered') { statusClass = 'status-delivered'; statusText = 'Entregado 🟢'; }
      else if (o.status === 'cancelled') { statusClass = 'status-cancelled'; statusText = 'Cancelado ✕'; }
      
      const itemsString = o.items.map(i => `${i.name} (x${i.qty})`).join(', ');
      
      return `
        <div class="account-order-item">
          <div class="order-info-left">
            <h4>Pedido: <span style="color:var(--accent); font-family:var(--font-heading);">${o.id}</span></h4>
            <p style="margin-bottom:6px;"><strong>Artículos:</strong> ${itemsString}</p>
            <p>Fecha: ${new Date(o.createdAt).toLocaleDateString()} — total: <strong>${formatCurrency(o.total)}</strong></p>
          </div>
          <div class="order-info-right">
            <span class="order-status-tag ${statusClass}">${statusText}</span>
            <button class="btn btn-secondary" onclick="location.href='tracking.html?id=${o.id}'" style="padding:6px 12px; font-size:0.75rem; border:1px solid var(--border-color)">Seguir Envío</button>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (err) {
    showToast('Error al cargar la información del perfil.', 'error');
  }
}

// Client Register Submission
clientRegisterForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    firstName: fd.get('firstName').trim(),
    lastName: fd.get('lastName').trim(),
    email: fd.get('email').trim(),
    password: fd.get('password').trim(),
    phone: fd.get('phone').trim(),
    address: fd.get('address').trim()
  };
  
  try {
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Fallo al crear la cuenta.');
    }
    
    const data = await res.json();
    localStorage.setItem('clientToken', data.token);
    localStorage.setItem('clientUser', JSON.stringify(data.user));
    showToast('¡Cuenta creada correctamente!', 'success');
    
    // Save to checkout cache fields for convenience
    localStorage.setItem('last_firstName', data.user.firstName);
    localStorage.setItem('last_lastName', data.user.lastName);
    localStorage.setItem('last_phone', data.user.phone);
    localStorage.setItem('last_address', data.user.address);
    
    checkAuth();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Client Login Submission
clientLoginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    email: fd.get('email').trim(),
    password: fd.get('password').trim()
  };
  
  try {
    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Credenciales inválidas.');
    }
    
    const data = await res.json();
    localStorage.setItem('clientToken', data.token);
    localStorage.setItem('clientUser', JSON.stringify(data.user));
    showToast('Sesión iniciada con éxito.', 'success');
    
    // Save info for checkout forms
    localStorage.setItem('last_firstName', data.user.firstName);
    localStorage.setItem('last_lastName', data.user.lastName);
    localStorage.setItem('last_phone', data.user.phone);
    localStorage.setItem('last_address', data.user.address);
    
    checkAuth();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Logout
clientLogoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('clientToken');
  localStorage.removeItem('clientUser');
  showToast('Has cerrado sesión.', 'info');
  checkAuth();
});

// Initialize on Load
applySavedTheme();
checkAuth();
