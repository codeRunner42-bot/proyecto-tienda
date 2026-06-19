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

let cart = JSON.parse(localStorage.getItem('cart')||'[]');
const cartList = document.getElementById('cartList');
const cartCountEl = document.getElementById('cartCount');

let productsMap = {};

function renderCart(){
  cartCountEl.textContent = cart.reduce((s,i)=>s+i.qty,0);
  if(cart.length===0){
    cartList.innerHTML='<p style="text-align:center; padding:48px 0; color:var(--text-muted); font-size:1.1rem; font-weight:600;">El carrito está vacío.</p>';
    return;
  }
  cartList.innerHTML = `<table class="cart-table">
    <thead>
      <tr>
        <th></th>
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
        const stock = productsMap[i.id] ? productsMap[i.id].stock : '—'; 
        return `<tr data-id="${i.id}">
          <td><input type="checkbox" class="sel"/></td>
          <td><strong>${i.name}</strong></td>
          <td>${formatCurrency(i.price)}</td>
          <td><input class="qty" type="number" min="1" value="${i.qty}"/></td>
          <td class="stock">${stock}</td>
          <td class="sub">${formatCurrency(i.price*i.qty)}</td>
          <td><button class="remove">Eliminar</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
  attachCartHandlers();
}

function attachCartHandlers(){
  document.querySelectorAll('.qty').forEach(input=>{
    input.addEventListener('change',e=>{
      const row = e.target.closest('tr');
      const id = row.dataset.id; 
      let val = Math.max(1,parseInt(e.target.value)||1);
      const prod = productsMap[id]; 
      if(prod && typeof prod.stock==='number' && val>prod.stock){ 
        val = prod.stock; 
        showToast('Cantidad ajustada al stock máximo disponible', 'info'); 
        e.target.value = val; 
      }
      const item = cart.find(x=>x.id===id); 
      if(!item) return; 
      item.qty = val;
      row.querySelector('.sub').textContent = formatCurrency(item.qty*item.price);
      localStorage.setItem('cart',JSON.stringify(cart));
      cartCountEl.textContent = cart.reduce((s,i)=>s+i.qty,0);
    })
  });
  
  document.querySelectorAll('.remove').forEach(btn=>btn.addEventListener('click',e=>{
    const row = e.target.closest('tr');
    const id = row.dataset.id; 
    const item = cart.find(x=>x.id===id);
    const itemName = item ? item.name : 'Producto';
    cart = cart.filter(x=>x.id!==id); 
    localStorage.setItem('cart',JSON.stringify(cart)); 
    renderCart();
    showToast(`"${itemName}" removido del carrito`, 'info');
  }));
}

document.getElementById('buyBtn').addEventListener('click',()=>{
  const checked = Array.from(document.querySelectorAll('.sel')).map((c,i)=>({el:c,idx:i})).filter(x=>x.el.checked);
  if(checked.length===0) return showToast('Selecciona al menos un producto para comprar', 'error');
  const rows = Array.from(document.querySelectorAll('tbody tr'));
  const selected = checked.map(x=>{
    const r = rows[x.idx]; 
    const id = r.dataset.id; 
    return cart.find(i=>i.id===id);
  }).filter(Boolean);
  localStorage.setItem('checkoutItems',JSON.stringify(selected));
  location.href='checkout.html';
});

document.getElementById('whatsappLink').addEventListener('click', e => {
  e.preventDefault();
  const number = (typeof PHONE !== 'undefined' && PHONE !== '') ? PHONE : '573022880520';
  const text = encodeURIComponent('¡Hola! Tengo productos en mi carrito y me gustaría finalizar mi compra.');
  const url = `https://wa.me/${number}?text=${text}`;
  window.open(url, '_blank');
});

// Cargar productos y aplicar el tema guardado
applySavedTheme();
fetch('/api/products')
  .then(r=>r.json())
  .then(list=>{ 
    productsMap = {}; 
    list.forEach(p=>productsMap[p.id]=p); 
    renderCart(); 
  })
  .catch(()=>{ 
    productsMap = {}; 
    renderCart(); 
  });
