function formatCurrency(n){
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}
let products = [];
let cart = JSON.parse(localStorage.getItem('cart')||'[]');
let currentCategory = 'all';
let currentSort = 'relevance';
const productsEl = document.getElementById('products');
const cartCount = document.getElementById('cartCount');
const cartBtn = document.getElementById('cartBtn');
const sortSelect = document.getElementById('sortSelect');

function updateCartUI(){
  cartCount.textContent = cart.reduce((s,i)=>s+i.qty,0);
  localStorage.setItem('cart',JSON.stringify(cart));
}

function addToCart(id){
  const p = products.find(x=>x.id===id);
  if(!p) return alert('Producto no encontrado');
  const exists = cart.find(x=>x.id===id);
  const currentQty = exists ? exists.qty : 0;
  if(typeof p.stock==='number' && currentQty+1>p.stock) return alert('No hay suficiente stock disponible');
  if(exists) exists.qty++;
  else cart.push({id:p.id,name:p.name,price:p.price,qty:1});
  updateCartUI();
}

function renderProducts(list){
  productsEl.innerHTML = list.map(p=>`<article class="product"><img src="${p.image}" alt="${p.name}"><h3>${p.name}</h3><p>${p.description}</p><div class="price">${formatCurrency(p.price)}</div><button onclick="addToCart('${p.id}')">Añadir</button></article>`).join('');
}

function updateDisplay() {
  let filtered = [...products];

  // 1. Filtrar por categoría
  if (currentCategory !== 'all') {
    filtered = filtered.filter(p => p.category === currentCategory);
  }

  // 2. Ordenar
  if (currentSort === 'price-low') filtered.sort((a, b) => a.price - b.price);
  else if (currentSort === 'price-high') filtered.sort((a, b) => b.price - a.price);
  else if (currentSort === 'name-az') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (currentSort === 'name-za') filtered.sort((a, b) => b.name.localeCompare(a.name));

  renderProducts(filtered);
}

function load(){
  fetch('/api/products').then(r=>r.json()).then(data=>{products=data;updateDisplay();}).catch(()=>{products=[];renderProducts([])});
  updateCartUI();
}

function filterCategory(cat){
  currentCategory = cat;
  const btns = document.querySelectorAll('.cat-btn, .cat-card');
  btns.forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  updateDisplay();
}

document.addEventListener('click',e=>{ 
  if(e.target.matches('.cat-btn') || e.target.closest('.cat-card')){
    const cat = e.target.dataset.cat || e.target.closest('.cat-card').dataset.cat;
    filterCategory(cat);
  } 
});

sortSelect?.addEventListener('change', (e) => {
  currentSort = e.target.value;
  updateDisplay();
});

const waHandler = e => {
    e.preventDefault();
    const number = (typeof PHONE !== 'undefined' && PHONE !== '') ? PHONE : '573022880520';
    const text = encodeURIComponent('¡Hola! Me gustaría recibir más información sobre sus productos.');
    const url = `https://wa.me/${number}?text=${text}`;
    window.open(url, '_blank');
};

document.getElementById('whatsappLink')?.addEventListener('click', waHandler);
document.getElementById('topWhatsappLink')?.addEventListener('click', waHandler);

load();
