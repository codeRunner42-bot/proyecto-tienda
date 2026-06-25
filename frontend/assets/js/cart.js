// ============================================================
// cart.js — Lógica del carrito de compras
// (formatCurrency, showToast, applySavedTheme, themeToggle → utils.js)
// ============================================================

let cart = JSON.parse(localStorage.getItem('cart') || '[]');
const cartList = document.getElementById('cartList');
const cartCountEl = document.getElementById('cartCount');

let productsMap = {};

function renderCart() {
  cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0);

  if (cart.length === 0) {
    cartList.innerHTML = '<p style="text-align:center; padding:48px 0; color:var(--text-muted); font-size:1.1rem; font-weight:600;">El carrito está vacío.</p>';
    return;
  }

  cartList.innerHTML = `<table class="cart-table">
    <thead>
      <tr>
        <th>
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.8rem; font-weight:600;">
            <input type="checkbox" id="selectAll" title="Seleccionar todos" style="cursor:pointer; width:16px; height:16px;"> Todo
          </label>
        </th>
        <th>Producto</th>
        <th>Precio</th>
        <th>Cantidad</th>
        <th>Stock</th>
        <th>Subtotal</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${cart.map(i => {
        const prod = productsMap[i.id];
        const stock = prod ? prod.stock : null;
        const isOutOfStock = prod && typeof prod.stock === 'number' && prod.stock === 0;
        const stockExceeded = prod && typeof prod.stock === 'number' && i.qty > prod.stock;
        const stockDisplay = stock !== null ? stock : '—';

        // Aviso visual si el producto está agotado o la cantidad supera el stock (#16)
        let warningHtml = '';
        if (isOutOfStock) {
          warningHtml = '<br><span style="color:#e74c3c; font-size:0.75rem; font-weight:600;">⚠️ Producto agotado</span>';
        } else if (stockExceeded) {
          warningHtml = `<br><span style="color:#d4af37; font-size:0.75rem; font-weight:600;">⚠️ Stock máximo: ${prod.stock}</span>`;
        }

        return `<tr data-id="${i.id}" ${isOutOfStock ? 'style="opacity:0.6;"' : ''}>
          <td><input type="checkbox" class="sel" ${isOutOfStock ? 'disabled' : ''}/></td>
          <td><strong>${i.name}</strong>${warningHtml}</td>
          <td>${formatCurrency(i.price)}</td>
          <td><input class="qty" type="number" min="1" max="${stock || 9999}" value="${i.qty}" ${isOutOfStock ? 'disabled' : ''}/></td>
          <td class="stock">${stockDisplay}</td>
          <td class="sub">${formatCurrency(i.price * i.qty)}</td>
          <td><button class="remove">Eliminar</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  attachCartHandlers();

  // Seleccionar todos (#15)
  const selectAllCb = document.getElementById('selectAll');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', () => {
      document.querySelectorAll('.sel:not(:disabled)').forEach(cb => {
        cb.checked = selectAllCb.checked;
      });
    });

    // Sincronizar "seleccionar todos" cuando se cambia un checkbox individual
    cartList.addEventListener('change', e => {
      if (e.target.classList.contains('sel')) {
        const all = document.querySelectorAll('.sel:not(:disabled)');
        const checked = document.querySelectorAll('.sel:not(:disabled):checked');
        selectAllCb.checked = all.length === checked.length;
        selectAllCb.indeterminate = checked.length > 0 && checked.length < all.length;
      }
    });
  }
}

function attachCartHandlers() {
  document.querySelectorAll('.qty').forEach(input => {
    input.addEventListener('change', e => {
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      let val = Math.max(1, parseInt(e.target.value) || 1);
      const prod = productsMap[id];
      if (prod && typeof prod.stock === 'number' && val > prod.stock) {
        val = prod.stock;
        showToast('Cantidad ajustada al stock máximo disponible', 'info');
        e.target.value = val;
      }
      const item = cart.find(x => x.id === id);
      if (!item) return;
      item.qty = val;
      row.querySelector('.sub').textContent = formatCurrency(item.qty * item.price);
      localStorage.setItem('cart', JSON.stringify(cart));
      cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0);
    });
  });

  document.querySelectorAll('.remove').forEach(btn => btn.addEventListener('click', e => {
    const row = e.target.closest('tr');
    const id = row.dataset.id;
    const item = cart.find(x => x.id === id);
    const itemName = item ? item.name : 'Producto';
    cart = cart.filter(x => x.id !== id);
    localStorage.setItem('cart', JSON.stringify(cart));
    renderCart();
    showToast(`"${itemName}" removido del carrito`, 'info');
  }));
}

document.getElementById('buyBtn').addEventListener('click', () => {
  const checked = Array.from(document.querySelectorAll('.sel')).map((c, i) => ({ el: c, idx: i })).filter(x => x.el.checked);
  if (checked.length === 0) return showToast('Selecciona al menos un producto para comprar', 'error');

  const rows = Array.from(document.querySelectorAll('tbody tr'));
  const selected = checked.map(x => {
    const r = rows[x.idx];
    const id = r.dataset.id;
    return cart.find(i => i.id === id);
  }).filter(Boolean);

  // Validar que ningún seleccionado esté agotado
  const outOfStockItems = selected.filter(item => {
    const prod = productsMap[item.id];
    return prod && typeof prod.stock === 'number' && prod.stock === 0;
  });
  if (outOfStockItems.length > 0) {
    return showToast(`"${outOfStockItems[0].name}" está agotado. Retíralo del carrito primero.`, 'error');
  }

  localStorage.setItem('checkoutItems', JSON.stringify(selected));
  location.href = 'checkout.html';
});

document.getElementById('whatsappLink')?.addEventListener('click', e => {
  e.preventDefault();
  const number = (typeof PHONE !== 'undefined' && PHONE !== '') ? PHONE : '573022880520';
  const text = encodeURIComponent('¡Hola! Tengo productos en mi carrito y me gustaría finalizar mi compra.');
  window.open(`https://wa.me/${number}?text=${text}`, '_blank');
});

// Cargar productos, aplicar tema guardado
applySavedTheme();
fetch('/api/products')
  .then(r => r.json())
  .then(list => {
    productsMap = {};
    list.forEach(p => productsMap[p.id] = p);
    renderCart();
  })
  .catch(() => {
    productsMap = {};
    renderCart();
  });
