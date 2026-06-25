// ============================================================
// account.js — Lógica de perfil y cuenta de cliente
// (formatCurrency, escapeHTML, showToast, applySavedTheme, themeToggle → utils.js)
// ============================================================

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

const loginCard = document.getElementById('loginCard');
const registerCard = document.getElementById('registerCard');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const showLoginBtn = document.getElementById('showLoginBtn');

// Profile Fields
const profName = document.getElementById('profName');
const profDocumentId = document.getElementById('profDocumentId');
const profEmail = document.getElementById('profEmail');
const profPhone = document.getElementById('profPhone');
const profAddress = document.getElementById('profAddress');
const clientLogoutBtn = document.getElementById('clientLogoutBtn');

// Card Switching Event Listeners
showRegisterBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  loginCard.style.display = 'none';
  registerCard.style.display = 'block';
});

showLoginBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  registerCard.style.display = 'none';
  loginCard.style.display = 'block';
});

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
    authContainer.style.display = 'flex';
    dashboardContainer.style.display = 'none';
    loginCard.style.display = 'block';
    registerCard.style.display = 'none';
  }
}

// Fetch user profile and order list
async function loadProfileAndHistory(token) {
  try {
    const res = await fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      // Token expirado o inválido
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
    if (profDocumentId) profDocumentId.textContent = user.documentId || 'No registrado';
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
      if (o.status === 'pending')    { statusClass = 'status-pending';    statusText = 'Pendiente 🕒'; }
      else if (o.status === 'processing') { statusClass = 'status-processing'; statusText = 'Preparando 📦'; }
      else if (o.status === 'shipped')    { statusClass = 'status-shipped';    statusText = 'Despachado 🚚'; }
      else if (o.status === 'delivered')  { statusClass = 'status-delivered';  statusText = 'Entregado 🟢'; }
      else if (o.status === 'cancelled')  { statusClass = 'status-cancelled';  statusText = 'Cancelado ✕'; }

      const totalItemsQty = o.items.reduce((sum, item) => sum + item.qty, 0);
      const itemsSummaryText = `${totalItemsQty} ${totalItemsQty === 1 ? 'artículo' : 'artículos'}`;

      // Etiqueta de pago unificada (#12)
      const paymentText = getPaymentLabel(o.payment);

      return `
        <div class="account-order-card">
          <div class="account-order-header">
            <div class="order-header-info">
              <h4>Pedido: <span style="color:var(--accent); font-family:var(--font-heading); font-weight:bold;">${o.id}</span></h4>
              <div class="order-header-meta">
                <span>📅 ${new Date(o.createdAt).toLocaleDateString()}</span>
                <span>🛍️ ${itemsSummaryText}</span>
                <span>💰 Total: <strong>${formatCurrency(o.total)}</strong></span>
              </div>
            </div>
            <div class="order-header-right">
              <span class="order-status-tag ${statusClass}">${statusText}</span>
              <span class="accordion-chevron">▼</span>
            </div>
          </div>
          <div class="account-order-details">
            <div class="order-meta-grid">
              <div class="order-meta-item">
                <p><strong>Método de Pago:</strong></p>
                <p>${paymentText}</p>
              </div>
              <div class="order-meta-item">
                <p><strong>Dirección de Envío:</strong></p>
                <p>${escapeHTML(o.buyer.address) || 'Recogida en tienda'}</p>
              </div>
              <div class="order-meta-item">
                <p><strong>Teléfono de Contacto:</strong></p>
                <p>${escapeHTML(o.buyer.phone) || 'No registrado'}</p>
              </div>
            </div>

            <div class="order-products-table-wrapper">
              <table class="order-products-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="text-center">Cant.</th>
                    <th class="text-right">Precio Unit.</th>
                    <th class="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${o.items.map(item => `
                    <tr>
                      <td>${escapeHTML(item.name)}</td>
                      <td class="text-center">${item.qty}</td>
                      <td class="text-right">${formatCurrency(item.price)}</td>
                      <td class="text-right">${formatCurrency(item.price * item.qty)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="details-footer">
              <div class="order-total-sum">
                Total del Pedido: <strong>${formatCurrency(o.total)}</strong>
              </div>
              <button class="btn btn-secondary" onclick="location.href='tracking.html?id=${o.id}'" style="padding:8px 16px; font-size:0.8rem; border:1px solid var(--border-color); border-radius: var(--radius-round)">
                Seguir Envío 🚚
              </button>
            </div>
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
    address: fd.get('address').trim(),
    documentId: fd.get('documentId').trim()
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

    showToast('¡Cuenta creada correctamente! Ahora puedes iniciar sesión.', 'success');

    registerCard.style.display = 'none';
    loginCard.style.display = 'block';

    const loginEmailInput = clientLoginForm.querySelector('input[name="email"]');
    if (loginEmailInput) loginEmailInput.value = payload.email;

    const loginPasswordInput = clientLoginForm.querySelector('input[name="password"]');
    if (loginPasswordInput) loginPasswordInput.focus();

    clientRegisterForm.reset();
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

    // Guardar datos para auto-rellenar checkout
    localStorage.setItem('last_firstName', data.user.firstName);
    localStorage.setItem('last_lastName', data.user.lastName);
    localStorage.setItem('last_phone', data.user.phone);
    localStorage.setItem('last_address', data.user.address);
    localStorage.setItem('last_documentId', data.user.documentId || '');

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

// Event Delegation for Accordion Toggles
customerOrdersList?.addEventListener('click', (e) => {
  const header = e.target.closest('.account-order-header');
  if (header) {
    const card = header.closest('.account-order-card');
    if (card) card.classList.toggle('active');
  }
});

// Restringir entrada en tiempo real según el tipo de campo
document.addEventListener('input', (e) => {
  if (!e.target) return;
  if (e.target.name === 'documentId' || e.target.name === 'phone') {
    e.target.value = e.target.value.replace(/\D/g, '');
  } else if (e.target.name === 'firstName' || e.target.name === 'lastName') {
    e.target.value = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]/g, '');
  }
});

// Initialize on Load
applySavedTheme();
checkAuth();
