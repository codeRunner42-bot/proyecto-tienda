// ============================================================
// pos.js — Punto de Venta (POS / Venta Directa) - Ale Beauty Art
// ============================================================

(function() {
  // State variables
  let products = [];
  let cart = [];
  let payments = []; // { method, amount }

  // DOM elements
  const posSearch = document.getElementById('posSearch');
  const posCategoryFilter = document.getElementById('posCategoryFilter');
  const posCatalogGrid = document.getElementById('posCatalogGrid');
  const posCartBody = document.getElementById('posCartBody');
  const posSubtotal = document.getElementById('posSubtotal');
  const posTaxPercent = document.getElementById('posTaxPercent');
  const posTaxAmount = document.getElementById('posTaxAmount');
  const posTotal = document.getElementById('posTotal');
  
  // Customer inputs
  const posClientFirstName = document.getElementById('posClientFirstName');
  const posClientLastName = document.getElementById('posClientLastName');
  const posClientDoc = document.getElementById('posClientDoc');
  const posClientPhone = document.getElementById('posClientPhone');
  
  // Payments elements
  const posPaymentRowsContainer = document.getElementById('posPaymentRowsContainer');
  const posAddPaymentRowBtn = document.getElementById('posAddPaymentRow');
  const posTotalPaid = document.getElementById('posTotalPaid');
  const posBalanceRow = document.getElementById('posBalanceRow');
  const posNotes = document.getElementById('posNotes');
  const posSubmitSaleBtn = document.getElementById('posSubmitSaleBtn');
  const posClearCartBtn = document.getElementById('posClearCart');

  // Load products from DB
  async function fetchProducts() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('No se pudieron cargar los productos para el catálogo.');
      products = await res.json();
      renderCategoryFilter();
      renderCatalog();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Load category list dynamically
  function renderCategoryFilter() {
    const categories = [...new Set(products.map(p => p.category))].filter(Boolean);
    posCategoryFilter.innerHTML = '<option value="">Todas las categorías</option>' +
      categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('');
  }

  // Render product catalog cards
  function renderCatalog() {
    const query = posSearch.value.trim().toLowerCase();
    const cat = posCategoryFilter.value;
    
    let filtered = products;
    if (query) {
      filtered = filtered.filter(p => p.name.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query)));
    }
    if (cat) {
      filtered = filtered.filter(p => p.category === cat);
    }
    
    if (filtered.length === 0) {
      posCatalogGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px 0;">No se encontraron productos.</div>';
      return;
    }
    
    posCatalogGrid.innerHTML = filtered.map(p => {
      const hasStock = p.stock > 0;
      const imageUrl = p.image || 'assets/images/default-product.jpg';
      const btnText = hasStock ? '+ Agregar' : 'Sin Stock';
      const btnClass = hasStock ? 'btn btn-primary' : 'btn btn-secondary';
      const btnDisabled = hasStock ? '' : 'disabled';
      const badgeStyle = hasStock 
        ? `background: var(--bg-secondary); color: var(--accent);`
        : `background: #fdf0ee; color: #e74c3c;`;
      
      return `
        <div class="pos-product-card" style="background: var(--surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; display: flex; flex-direction: column; gap: 8px; transition: border-color var(--transition-fast);">
          <img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(p.name)}" style="width: 100%; height: 110px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid rgba(0,0,0,0.03);">
          <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
            <h4 style="margin: 0; font-size: 0.85rem; font-weight: 700; color: var(--accent-strong); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-height: 2.3em;">${escapeHTML(p.name)}</h4>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; font-size: 0.8rem;">
              <strong style="color: var(--accent); font-size: 0.9rem;">${formatCurrency(p.price)}</strong>
              <span style="padding: 2px 6px; border-radius: var(--radius-round); font-size: 0.7rem; font-weight: 700; ${badgeStyle}">Stock: ${p.stock}</span>
            </div>
          </div>
          <button class="${btnClass}" style="width: 100%; padding: 6px 12px; font-size: 0.78rem;" data-product-id="${p.id}" ${btnDisabled}>${btnText}</button>
        </div>
      `;
    }).join('');
  }

  // Cart operations
  function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock <= 0) return;
    
    const existing = cart.find(item => item.id === productId);
    if (existing) {
      if (existing.qty < product.stock) {
        existing.qty++;
      } else {
        showToast(`Stock máximo alcanzado para "${product.name}".`, 'info');
      }
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty: 1,
        maxStock: product.stock
      });
    }
    renderCart();
  }

  function updateCartQty(productId, qty) {
    const item = cart.find(c => c.id === productId);
    if (!item) return;
    
    qty = parseInt(qty);
    if (isNaN(qty) || qty <= 0) {
      qty = 1;
    }
    if (qty > item.maxStock) {
      qty = item.maxStock;
      showToast(`Stock máximo disponible alcanzado: ${item.maxStock}`, 'info');
    }
    item.qty = qty;
    renderCart();
  }

  // Update payments auto amount to cover total
  function autoFillPayment() {
    const totalVal = getPOSOrderTotal();
    if (payments.length === 1) {
      payments[0].amount = totalVal;
      const input = posPaymentRowsContainer.querySelector('.pos-payment-amount');
      if (input) input.value = totalVal;
    }
  }

  function removeFromCart(productId) {
    cart = cart.filter(c => c.id !== productId);
    renderCart();
  }

  function clearCart() {
    cart = [];
    renderCart();
  }

  // Render cart tables & update prices
  function renderCart() {
    if (cart.length === 0) {
      posCartBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">El carrito está vacío. Agrega productos del catálogo.</td></tr>';
      posSubtotal.textContent = '$0';
      posTaxAmount.textContent = '$0';
      posTotal.textContent = '$0';
      updatePaymentsTotal();
      return;
    }
    
    posCartBody.innerHTML = cart.map(item => `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 10px 0; font-weight: 500; color: var(--accent-strong);">${escapeHTML(item.name)}</td>
        <td style="padding: 10px 0; text-align: center;">
          <input type="number" class="pos-qty-input" data-product-id="${item.id}" min="1" max="${item.maxStock}" value="${item.qty}" style="width: 48px; padding: 4px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 0.8rem; text-align: center; background: var(--bg-primary);">
        </td>
        <td style="padding: 10px 0; text-align: right; color: var(--text-muted);">${formatCurrency(item.price)}</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 700; color: var(--accent-strong);">${formatCurrency(item.price * item.qty)}</td>
        <td style="padding: 10px 0; text-align: right;">
          <button class="pos-remove-item-btn" data-product-id="${item.id}" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 1rem; padding: 0 4px;">🗑</button>
        </td>
      </tr>
    `).join('');
    
    // Add event listeners to input elements
    posCartBody.querySelectorAll('.pos-qty-input').forEach(input => {
      input.addEventListener('change', e => {
        updateCartQty(e.target.dataset.productId, e.target.value);
      });
    });
    
    posCartBody.querySelectorAll('.pos-remove-item-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        removeFromCart(e.currentTarget.dataset.productId);
      });
    });
    
    // Totals calculations
    const subtotalVal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const taxRate = parseFloat(posTaxPercent.value) || 0;
    const taxVal = Math.round(subtotalVal * taxRate / 100);
    const totalVal = subtotalVal + taxVal;
    
    posSubtotal.textContent = formatCurrency(subtotalVal);
    posTaxAmount.textContent = formatCurrency(taxVal);
    posTotal.textContent = formatCurrency(totalVal);
    
    autoFillPayment();
    updatePaymentsTotal();
  }

  // Payments logic (Split payments)
  function initPayments() {
    const totalVal = getPOSOrderTotal();
    payments = [{ method: 'Efectivo', amount: totalVal }];
    renderPayments();
  }

  function addPaymentRow() {
    // Determine the remaining total to be paid
    const totalVal = getPOSOrderTotal();
    const currentPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, totalVal - currentPaid);
    
    payments.push({ method: 'Nequi', amount: remaining });
    renderPayments();
  }

  function removePaymentRow(index) {
    payments.splice(index, 1);
    renderPayments();
  }

  function updatePaymentField(index, field, value) {
    if (field === 'amount') {
      const val = parseFloat(value) || 0;
      payments[index].amount = Math.max(0, val);
    } else {
      payments[index].method = value;
    }
    updatePaymentsTotal();
  }

  function getPOSOrderTotal() {
    const totalEl = document.getElementById('posTotal');
    if (!totalEl) return 0;
    const totalText = totalEl.textContent.replace(/[^\d]/g, '');
    return parseFloat(totalText) || 0;
  }

  function renderPayments() {
    posPaymentRowsContainer.innerHTML = payments.map((p, idx) => `
      <div style="display: flex; gap: 8px; align-items: center;">
        <select class="pos-payment-method" data-index="${idx}" style="flex: 1; padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-primary); font-size: 0.85rem; cursor: pointer; outline: none;">
          <option value="Efectivo" ${p.method === 'Efectivo' ? 'selected' : ''}>💵 Efectivo</option>
          <option value="Nequi" ${p.method === 'Nequi' ? 'selected' : ''}>📱 Nequi</option>
          <option value="Transferencia" ${p.method === 'Transferencia' ? 'selected' : ''}>🏦 Transferencia</option>
        </select>
        <input type="number" class="pos-payment-amount" data-index="${idx}" min="0" value="${p.amount}" placeholder="Monto" style="width: 120px; padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-color); background: var(--bg-primary); font-size: 0.85rem; outline: none;">
        ${payments.length > 1 ? `
          <button class="pos-remove-payment" data-index="${idx}" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 1.1rem; padding: 0 4px;">✕</button>
        ` : ''}
      </div>
    `).join('');

    // Attach listeners
    posPaymentRowsContainer.querySelectorAll('.pos-payment-method').forEach(select => {
      select.addEventListener('change', e => {
        updatePaymentField(parseInt(e.target.dataset.index), 'method', e.target.value);
      });
    });

    posPaymentRowsContainer.querySelectorAll('.pos-payment-amount').forEach(input => {
      input.addEventListener('input', e => {
        updatePaymentField(parseInt(e.target.dataset.index), 'amount', e.target.value);
      });
    });

    posPaymentRowsContainer.querySelectorAll('.pos-remove-payment').forEach(btn => {
      btn.addEventListener('click', e => {
        removePaymentRow(parseInt(e.target.dataset.index));
      });
    });

    updatePaymentsTotal();
  }

  function updatePaymentsTotal() {
    const totalVal = getPOSOrderTotal();
    const currentPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    posTotalPaid.textContent = formatCurrency(currentPaid);
    
    const balance = currentPaid - totalVal;
    
    if (balance === 0) {
      posBalanceRow.innerHTML = `
        <span style="color: #27ae60; font-weight: 600;">✓ Pago completo</span>
        <span style="color: #27ae60; font-weight: 700;">$0</span>
      `;
    } else if (balance > 0) {
      // Check if we have Cash/Efectivo registered to justify giving change
      const hasCash = payments.some(p => p.method === 'Efectivo');
      const changeText = hasCash ? 'Cambio / Vuelto:' : 'Excedente:';
      posBalanceRow.innerHTML = `
        <span style="color: #27ae60; font-weight: 600;">${changeText}</span>
        <span style="color: #27ae60; font-weight: 700;">${formatCurrency(balance)}</span>
      `;
    } else {
      // Negative balance, partial payment / abono
      posBalanceRow.innerHTML = `
        <span style="color: #d4af37; font-weight: 600;">⏳ Resta (Abono pendiente):</span>
        <span style="color: #d4af37; font-weight: 700;">${formatCurrency(Math.abs(balance))}</span>
      `;
    }
  }

  // Handle final POS order submission
  async function submitSale() {
    if (cart.length === 0) {
      showToast('No hay productos en la venta.', 'error');
      return;
    }

    // Client fields client-side validation
    const fname = posClientFirstName.value.trim();
    const lname = posClientLastName.value.trim();
    const docId = posClientDoc.value.trim();
    const phoneVal = posClientPhone.value.trim();
    const notesVal = posNotes.value.trim();

    if (fname && fname.length > 50) {
      showToast('El nombre del cliente no puede superar los 50 caracteres.', 'error');
      return;
    }
    if (lname && lname.length > 50) {
      showToast('El apellido del cliente no puede superar los 50 caracteres.', 'error');
      return;
    }

    const DOC_REGEX = /^\d{5,15}$/;
    const PH_REGEX = /^\d{7,15}$/;

    if (docId && !DOC_REGEX.test(docId)) {
      showToast('El documento/cédula debe contener únicamente números y tener entre 5 y 15 dígitos.', 'error');
      return;
    }
    if (phoneVal && !PH_REGEX.test(phoneVal)) {
      showToast('El teléfono debe contener únicamente números y tener entre 7 y 15 dígitos.', 'error');
      return;
    }

    if (notesVal && notesVal.length > 500) {
      showToast('Las notas no pueden exceder los 500 caracteres.', 'error');
      return;
    }

    // Payment inputs validation
    for (const p of payments) {
      if (isNaN(p.amount) || p.amount < 0) {
        showToast('Los montos de pago registrados deben ser números válidos mayores o iguales a cero.', 'error');
        return;
      }
    }

    const totalVal = getPOSOrderTotal();
    const currentPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    // If it's a partial payment, ask for confirmation
    if (currentPaid < totalVal) {
      const rest = totalVal - currentPaid;
      if (!confirm(`La venta no está completamente pagada. Se registrará un abono de ${formatCurrency(currentPaid)} y un saldo pendiente de ${formatCurrency(rest)}.\n\n¿Desea continuar?`)) {
        return;
      }
    }

    // Lock button to avoid double submits
    posSubmitSaleBtn.disabled = true;
    posSubmitSaleBtn.style.opacity = '0.7';
    posSubmitSaleBtn.textContent = 'Registrando...';

    const buyer = {
      firstName: posClientFirstName.value.trim() || 'Cliente',
      lastName: posClientLastName.value.trim() || 'de mostrador',
      documentId: posClientDoc.value.trim() || '',
      phone: posClientPhone.value.trim() || '',
      address: 'Venta Directa'
    };

    const payload = {
      buyer,
      items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, qty: item.qty })),
      payments: payments.filter(p => p.amount > 0),
      tax_percent: parseFloat(posTaxPercent.value) || 0,
      notes: posNotes.value.trim()
    };

    try {
      const res = await fetch('/api/orders/direct', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la venta.');

      showToast(`Venta directa registrada correctamente. Factura ${data.invoice.number} generada.`, 'success');

      // Clear POS fields
      clearCart();
      posClientFirstName.value = '';
      posClientLastName.value = '';
      posClientDoc.value = '';
      posClientPhone.value = '';
      posNotes.value = '';
      initPayments();
      
      // Reload products catalog (in case stock changed)
      await fetchProducts();

      // Format response exactly as invoices.js expects for the preview modal
      const invoiceForModal = {
        id: data.invoice.id,
        order_id: data.invoice.order_id,
        number: data.invoice.number,
        status: data.invoice.status,
        subtotal: data.invoice.subtotal,
        tax: data.invoice.tax,
        total: data.invoice.total,
        notes: data.invoice.notes,
        createdAt: data.invoice.createdAt,
        paidAt: data.invoice.paidAt,
        order: {
          firstName: data.order.buyer.firstName,
          lastName: data.order.buyer.lastName,
          documentId: data.order.buyer.documentId,
          phone: data.order.buyer.phone,
          address: data.order.buyer.address,
          payment: data.order.payment,
          items: JSON.stringify(data.order.items),
          status: data.order.status
        }
      };

      // Open preview modal (which uses the shared invoices.js logic)
      if (typeof openInvoiceModal === 'function') {
        openInvoiceModal(invoiceForModal);
      } else {
        console.error('La función openInvoiceModal no está disponible a nivel global.');
      }

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      posSubmitSaleBtn.disabled = false;
      posSubmitSaleBtn.style.opacity = '';
      posSubmitSaleBtn.textContent = '🛒 Registrar Venta y Generar Factura';
    }
  }

  // Setup Event Listeners
  posSearch.addEventListener('input', renderCatalog);
  posCategoryFilter.addEventListener('change', renderCatalog);
  posAddPaymentRowBtn.addEventListener('click', addPaymentRow);
  posSubmitSaleBtn.addEventListener('click', submitSale);
  posClearCartBtn.addEventListener('click', clearCart);
  
  posTaxPercent.addEventListener('input', () => {
    let rate = parseFloat(posTaxPercent.value) || 0;
    if (rate < 0) posTaxPercent.value = 0;
    if (rate > 100) posTaxPercent.value = 100;
    renderCart();
  });

  posCatalogGrid.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const productId = btn.dataset.productId;
    if (productId) addToCart(productId);
  });

  // Listen for navigation clicks on sidebar
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset && btn.dataset.tab === 'pos') {
        // Load fresh list of products & categories
        fetchProducts();
        
        // Auto-initialize payment row to cover total
        if (payments.length === 0) {
          initPayments();
        }
      }
    });
  });

  // On-the-fly input validations for numbers only
  posClientDoc.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });
  posClientPhone.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  // Init payments row on file load
  initPayments();

})();
