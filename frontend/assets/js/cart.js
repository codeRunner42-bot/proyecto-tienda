const PHONE = '573022880520'; // <--- CAMBIA ESTE NÚMERO TAMBIÉN

function formatCurrency(n){return '$'+Number(n).toFixed(2)}
let cart = JSON.parse(localStorage.getItem('cart')||'[]');
const cartList = document.getElementById('cartList');
const cartCountEl = document.getElementById('cartCount');

let productsMap = {};

function renderCart(){
  cartCountEl.textContent = cart.reduce((s,i)=>s+i.qty,0);
  if(cart.length===0){cartList.innerHTML='<p>El carrito está vacío.</p>';return}
  cartList.innerHTML = `<table class="cart-table"><thead><tr><th></th><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Stock</th><th>Subtotal</th><th></th></tr></thead><tbody>${cart.map(i=>{const stock = productsMap[i.id] ? productsMap[i.id].stock : '—'; return `<tr data-id="${i.id}"><td><input type="checkbox" class="sel"/></td><td>${i.name}</td><td>${formatCurrency(i.price)}</td><td><input class="qty" type="number" min="1" value="${i.qty}"/></td><td class="stock">${stock}</td><td class="sub">${formatCurrency(i.price*i.qty)}</td><td><button class="remove">Eliminar</button></td></tr>`}).join('')}</tbody></table>`;
  attachCartHandlers();
}

function attachCartHandlers(){
  document.querySelectorAll('.qty').forEach(input=>{
    input.addEventListener('change',e=>{
      const row = e.target.closest('tr');
      const id = row.dataset.id; let val = Math.max(1,parseInt(e.target.value)||1);
      const prod = productsMap[id]; if(prod && typeof prod.stock==='number' && val>prod.stock){ val = prod.stock; alert('Se ha ajustado la cantidad al stock disponible'); e.target.value = val; }
      const item = cart.find(x=>x.id===id); if(!item) return; item.qty = val;
      row.querySelector('.sub').textContent = formatCurrency(item.qty*item.price);
      localStorage.setItem('cart',JSON.stringify(cart));
      cartCountEl.textContent = cart.reduce((s,i)=>s+i.qty,0);
    })
  });
  document.querySelectorAll('.remove').forEach(btn=>btn.addEventListener('click',e=>{
    const id = e.target.closest('tr').dataset.id; cart = cart.filter(x=>x.id!==id); localStorage.setItem('cart',JSON.stringify(cart)); renderCart();
  }));
}

document.getElementById('buyBtn').addEventListener('click',()=>{
  const checked = Array.from(document.querySelectorAll('.sel')).map((c,i)=>({el:c,idx:i})).filter(x=>x.el.checked);
  if(checked.length===0) return alert('Selecciona al menos un producto para comprar');
  const rows = Array.from(document.querySelectorAll('tbody tr'));
  const selected = checked.map(x=>{
    const r = rows[x.idx]; const id = r.dataset.id; return cart.find(i=>i.id===id);
  }).filter(Boolean);
  localStorage.setItem('checkoutItems',JSON.stringify(selected));
  location.href='checkout.html';
});

document.getElementById('whatsappLink').addEventListener('click',e=>{e.preventDefault();const url=`https://wa.me/${PHONE}`;window.open(url,'_blank')});

// Cargar productos para obtener stock y luego renderizar el carrito
fetch('/api/products').then(r=>r.json()).then(list=>{ productsMap = {}; list.forEach(p=>productsMap[p.id]=p); renderCart(); }).catch(()=>{ productsMap = {}; renderCart(); });
