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

// Theme Toggler
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

const cartCountEl = document.getElementById('cartCount');
let checkoutItems = JSON.parse(localStorage.getItem('checkoutItems')||'[]');

if(!checkoutItems || checkoutItems.length===0){
  alert('No hay items seleccionados para checkout');
  location.href='cart.html';
}

function renderSummary(){
  const container = document.getElementById('orderSummary');
  if (!container) return;
  const lines = checkoutItems.map(i=>`<div>${i.name} x ${i.qty} — ${formatCurrency(i.price*i.qty)}</div>`).join('');
  const total = checkoutItems.reduce((s,i)=>s+i.price*i.qty,0).toFixed(2);
  container.innerHTML = `<div>
    ${lines}
    <hr style="border:none; border-top:1px solid var(--border-color); margin: 12px 0;"/>
    <div class="total-row">Total: ${formatCurrency(Number(total))}</div>
  </div>`;
  if (cartCountEl) cartCountEl.textContent = checkoutItems.reduce((s,i)=>s+i.qty,0);
}

// Auto-fill forms from logged in user or cached fields
function autofillForm() {
  const orderForm = document.getElementById('orderForm');
  if (!orderForm) return;
  
  const clientUserStr = localStorage.getItem('clientUser');
  let user = null;
  if (clientUserStr) {
    try {
      user = JSON.parse(clientUserStr);
    } catch(e) {}
  }
  
  const fName = user ? user.firstName : (localStorage.getItem('last_firstName') || '');
  const lName = user ? user.lastName : (localStorage.getItem('last_lastName') || '');
  const phone = user ? user.phone : (localStorage.getItem('last_phone') || '');
  const address = user ? user.address : (localStorage.getItem('last_address') || '');
  
  orderForm.querySelector('[name="firstName"]').value = fName;
  orderForm.querySelector('[name="lastName"]').value = lName;
  orderForm.querySelector('[name="phone"]').value = phone;
  orderForm.querySelector('[name="address"]').value = address;
}

document.getElementById('orderForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  
  // Read authenticated user if any
  const clientUserStr = localStorage.getItem('clientUser');
  let clientUser = null;
  try {
    if (clientUserStr) clientUser = JSON.parse(clientUserStr);
  } catch(e) {}
  
  const buyer = {
    firstName: fd.get('firstName').trim(),
    lastName: fd.get('lastName').trim(),
    phone: fd.get('phone').trim(),
    address: fd.get('address').trim()
  };
  const payment = fd.get('payment');
  const total = checkoutItems.reduce((s,i)=>s+i.price*i.qty,0).toFixed(2);
  
  const orderPayload = {
    user_id: clientUser ? clientUser.id : null,
    buyer,
    payment,
    items: checkoutItems.map(i=>({ id:i.id, name:i.name, price:i.price, qty:i.qty })),
    total: Number(total)
  };

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'No se pudo guardar el pedido.');
    }
    const order = await response.json();

    // Cache billing/shipping details for guest checkouts convenience
    localStorage.setItem('last_firstName', buyer.firstName);
    localStorage.setItem('last_lastName', buyer.lastName);
    localStorage.setItem('last_phone', buyer.phone);
    localStorage.setItem('last_address', buyer.address);

    let cart = JSON.parse(localStorage.getItem('cart')||'[]');
    const boughtIds = checkoutItems.map(i=>i.id);
    cart = cart.filter(i=>!boughtIds.includes(i.id));
    localStorage.setItem('cart',JSON.stringify(cart));
    localStorage.removeItem('checkoutItems');
    
    showToast(`¡Pedido creado con ID ${order.id}! Redirigiendo a tu recibo...`, 'success');
    
    setTimeout(() => {
      location.href = `order-success.html?orderId=${order.id}`;
    }, 1200);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

applySavedTheme();
renderSummary();
autofillForm();
