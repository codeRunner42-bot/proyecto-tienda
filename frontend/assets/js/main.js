const PHONE = '573022880520'; // <--- CAMBIA ESTE NÚMERO (ejemplo: 573101234567)

let products = [];
let cart = JSON.parse(localStorage.getItem('cart')||'[]');
const productsEl = document.getElementById('products');
const cartCount = document.getElementById('cartCount');
const cartBtn = document.getElementById('cartBtn');

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
  productsEl.innerHTML = list.map(p=>`<article class="product"><img src="${p.image}" alt="${p.name}"><h3>${p.name}</h3><p>${p.description}</p><div class="price">$${p.price.toFixed(2)}</div><button onclick="addToCart('${p.id}')">Añadir</button></article>`).join('');
}

function load(){
  fetch('/api/products').then(r=>r.json()).then(data=>{products=data;renderProducts(products);}).catch(()=>{products=[];renderProducts([])});
  updateCartUI();
}

function filterCategory(cat){
  const btns = document.querySelectorAll('.cat-btn');btns.forEach(b=>b.classList.toggle('active',b.dataset.cat===cat||cat==='all'&&b.dataset.cat==='all'));
  if(cat==='all') renderProducts(products);
  else renderProducts(products.filter(p=>p.category===cat));
}

document.addEventListener('click',e=>{ if(e.target.matches('.cat-btn')){filterCategory(e.target.dataset.cat)} });

document.getElementById('whatsappLink').addEventListener('click',e=>{e.preventDefault();const url=`https://wa.me/${PHONE}`;window.open(url,'_blank')});

load();
