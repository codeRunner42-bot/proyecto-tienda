// ============================================================
// checkout.js — Lógica de finalización de compra
// (formatCurrency, showToast, applySavedTheme, themeToggle → utils.js)
// ============================================================

const cartCountEl = document.getElementById('cartCount');
let checkoutItems = JSON.parse(localStorage.getItem('checkoutItems') || '[]');

// Si el carrito de checkout está vacío, redirigir limpiamente (#1 — elimina alert() nativo)
if (!checkoutItems || checkoutItems.length === 0) {
  showToast('No hay artículos seleccionados para pagar. Selecciona productos en el carrito.', 'error');
  setTimeout(() => { location.href = 'cart.html'; }, 1800);
}

function renderSummary() {
  const container = document.getElementById('orderSummary');
  if (!container) return;
  const lines = checkoutItems.map(i => `<div>${escapeHTML(i.name)} x ${i.qty} — ${formatCurrency(i.price * i.qty)}</div>`).join('');
  const total = checkoutItems.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);
  container.innerHTML = `<div>
    ${lines}
    <hr style="border:none; border-top:1px solid var(--border-color); margin: 12px 0;"/>
    <div class="total-row">Total: ${formatCurrency(Number(total))}</div>
  </div>`;
  if (cartCountEl) cartCountEl.textContent = checkoutItems.reduce((s, i) => s + i.qty, 0);
}

// Auto-fill forms from logged in user or cached fields
function autofillForm() {
  const orderForm = document.getElementById('orderForm');
  if (!orderForm) return;

  const clientUserStr = localStorage.getItem('clientUser');
  let user = null;
  if (clientUserStr) {
    try { user = JSON.parse(clientUserStr); } catch(e) {}
  }

  const fName = user ? user.firstName : (localStorage.getItem('last_firstName') || '');
  const lName = user ? user.lastName : (localStorage.getItem('last_lastName') || '');
  const documentId = user ? user.documentId : (localStorage.getItem('last_documentId') || '');
  const phone = user ? user.phone : (localStorage.getItem('last_phone') || '');
  const address = user ? user.address : (localStorage.getItem('last_address') || '');

  orderForm.querySelector('[name="firstName"]').value = fName;
  orderForm.querySelector('[name="lastName"]').value = lName;
  orderForm.querySelector('[name="documentId"]').value = documentId;
  orderForm.querySelector('[name="phone"]').value = phone;
  orderForm.querySelector('[name="address"]').value = address;
}

document.getElementById('orderForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);

  // Read authenticated user if any
  const clientUserStr = localStorage.getItem('clientUser');
  let clientUser = null;
  try { if (clientUserStr) clientUser = JSON.parse(clientUserStr); } catch(e) {}

  const buyer = {
    firstName: fd.get('firstName').trim(),
    lastName: fd.get('lastName').trim(),
    documentId: fd.get('documentId').trim(),
    phone: fd.get('phone').trim(),
    address: fd.get('address').trim()
  };
  const payment = fd.get('payment');
  const total = checkoutItems.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);

  const orderPayload = {
    user_id: clientUser ? clientUser.id : null,
    buyer,
    payment,
    items: checkoutItems.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
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

    // Cachear datos de envío para futuras compras como invitado
    localStorage.setItem('last_firstName', buyer.firstName);
    localStorage.setItem('last_lastName', buyer.lastName);
    localStorage.setItem('last_documentId', buyer.documentId);
    localStorage.setItem('last_phone', buyer.phone);
    localStorage.setItem('last_address', buyer.address);

    // Limpiar items comprados del carrito
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const boughtIds = checkoutItems.map(i => i.id);
    cart = cart.filter(i => !boughtIds.includes(i.id));
    localStorage.setItem('cart', JSON.stringify(cart));
    localStorage.removeItem('checkoutItems');

    // Generar mensaje de WhatsApp con etiqueta de pago correcta (#4)
    const phoneNum = (typeof PHONE !== 'undefined' && PHONE !== '') ? PHONE : '573146093646';
    const itemsText = order.items.map(i => `- ${i.name} (x${i.qty}): ${formatCurrency(i.price * i.qty)}`).join('\n');
    const paymentText = getPaymentLabel(order.payment); // usa getPaymentLabel de utils.js
    const totalFormatted = formatCurrency(order.total);
    const addressText = order.buyer.address ? order.buyer.address : 'No especificada';

    const whatsappMessage = `¡Hola Ale Beauty Art! He realizado un nuevo pedido en la web.\n\n*ID del Pedido:* ${order.id}\n*Cliente:* ${order.buyer.firstName} ${order.buyer.lastName}\n*Cédula/Documento:* ${order.buyer.documentId || 'No especificado'}\n*Teléfono:* ${order.buyer.phone}\n*Dirección:* ${addressText}\n*Método de Pago:* ${paymentText}\n\n*Detalle de Productos:*\n${itemsText}\n\n*Total:* ${totalFormatted}\n\nPor favor, confirmen mi pedido. ¡Gracias!`;
    const waUrl = `https://wa.me/${phoneNum}?text=${encodeURIComponent(whatsappMessage)}`;

    window.open(waUrl, '_blank');

    showToast(`¡Pedido creado con ID ${order.id}! Redirigiendo a tu recibo...`, 'success');

    setTimeout(() => {
      location.href = `order-success.html?orderId=${order.id}`;
    }, 1200);
  } catch (err) {
    showToast(err.message, 'error');
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

applySavedTheme();
renderSummary();
autofillForm();
