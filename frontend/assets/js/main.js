// ============================================================
// main.js — Lógica de la tienda principal
// (formatCurrency, escapeHTML, showToast, applySavedTheme, themeToggle → utils.js)
// ============================================================

// Global Variables
let products = [];
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let currentCategory = 'all';
let currentSort = 'relevance';
let searchKeyword = '';

// Gallery Variables
let modalActiveImages = [];
let modalActiveImageIndex = 0;

// DOM Elements
const productsEl = document.getElementById('products');
const cartCount = document.getElementById('cartCount');
const sortSelect = document.getElementById('sortSelect');
const storeSearchInput = document.getElementById('storeSearchInput');
const searchClearBtn = document.getElementById('searchClearBtn');

// Modal Elements
const productModal = document.getElementById('productModal');
const modalClose = document.getElementById('modalClose');
const modalImg = document.getElementById('modalImg');
const modalCat = document.getElementById('modalCat');
const modalTitle = document.getElementById('modalTitle');
const modalPrice = document.getElementById('modalPrice');
const modalDesc = document.getElementById('modalDesc');
const modalStock = document.getElementById('modalStock');
const modalAddBtn = document.getElementById('modalAddBtn');

// Update Cart Count in Header
function updateCartUI() {
  if (cartCount) cartCount.textContent = cart.reduce((s, i) => s + i.qty, 0);
  localStorage.setItem('cart', JSON.stringify(cart));
}

// Add to Cart Logic
function addToCart(id, btn) {
  const p = products.find(x => x.id === id);
  if (!p) return showToast('Producto no encontrado', 'error');

  const exists = cart.find(x => x.id === id);
  const currentQty = exists ? exists.qty : 0;

  if (typeof p.stock === 'number' && currentQty + 1 > p.stock) {
    return showToast('No hay suficiente stock disponible para añadir más.', 'error');
  }

  if (exists) exists.qty++;
  else cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });

  updateCartUI();
  showToast(`¡"${p.name}" añadido al carrito!`, 'success');

  // Feedback visual en el botón
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = '✓ ¡Añadido!';
    btn.style.background = '#2ecc71';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
      btn.disabled = false;
    }, 1200);
  }
}

// Render Skeletons during loading
function renderSkeletons() {
  if (!productsEl) return;
  productsEl.innerHTML = Array(4).fill(0).map(() => `
    <article class="skeleton-card skeleton-shimmer">
      <div class="skeleton-img"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text-half"></div>
      <div class="skeleton-price"></div>
      <div class="skeleton-button"></div>
    </article>
  `).join('');
}

// Render thumbnails in product modal and bind click events
function renderThumbnails() {
  const thumbContainer = document.getElementById('modalThumbnails');
  if (!thumbContainer) return;

  if (modalActiveImages.length <= 1) {
    thumbContainer.innerHTML = '';
    return;
  }

  thumbContainer.innerHTML = modalActiveImages.map((imgUrl, idx) => {
    const activeClass = idx === modalActiveImageIndex ? 'active' : '';
    return `<img src="${imgUrl}" class="modal-thumb ${activeClass}" data-index="${idx}" alt="Imagen ${idx + 1}" />`;
  }).join('');

  thumbContainer.querySelectorAll('.modal-thumb').forEach(thumb => {
    thumb.addEventListener('click', (e) => {
      modalActiveImageIndex = Number(e.target.dataset.index);
      updateModalImage();
    });
  });
}

// Update Modal Image index
function updateModalImage() {
  if (modalActiveImages.length > 0 && modalImg) {
    modalImg.src = modalActiveImages[modalActiveImageIndex];
    renderThumbnails();
  }
}

// Open Detail Modal
function openProductModal(id, event) {
  // Prevent modal if user clicks on add button
  if (event && event.target.tagName.toLowerCase() === 'button') return;

  const p = products.find(x => x.id === id);
  if (!p) return;

  // Set product ID on modal for reference (for reviews form)
  productModal.dataset.productId = p.id;

  // Setup Images Gallery Array
  modalActiveImages = [p.image];
  if (p.images && Array.isArray(p.images)) {
    p.images.forEach(img => {
      if (img && img.trim() !== '') modalActiveImages.push(img.trim());
    });
  }
  modalActiveImageIndex = 0;
  updateModalImage();

  // Toggle gallery arrows visibility + accesibilidad
  const prevBtn = document.getElementById('galleryPrev');
  const nextBtn = document.getElementById('galleryNext');
  if (modalActiveImages.length <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
  } else {
    if (prevBtn) prevBtn.style.display = 'flex';
    if (nextBtn) nextBtn.style.display = 'flex';
  }

  modalCat.textContent = p.category;
  modalTitle.textContent = p.name;
  modalPrice.textContent = formatCurrency(p.price);
  modalDesc.textContent = p.description || 'Sin descripción disponible.';

  if (p.stock === 0) {
    modalStock.innerHTML = `<span style="color:#e74c3c;">🔴 Agotado</span>`;
    modalAddBtn.disabled = true;
    modalAddBtn.textContent = 'Agotado';
    modalAddBtn.style.background = '#bdc3c7';
    modalAddBtn.style.cursor = 'not-allowed';
  } else if (p.stock <= 2) {
    modalStock.innerHTML = `<span style="color:#d4af37;">⚠️ ¡Últimas unidades! (${p.stock} disponibles)</span>`;
    modalAddBtn.disabled = false;
    modalAddBtn.textContent = 'Añadir al carrito';
    modalAddBtn.style.background = '';
    modalAddBtn.style.cursor = '';
  } else {
    modalStock.innerHTML = `<span style="color:#2ecc71;">🟢 En Stock (${p.stock} disponibles)</span>`;
    modalAddBtn.disabled = false;
    modalAddBtn.textContent = 'Añadir al carrito';
    modalAddBtn.style.background = '';
    modalAddBtn.style.cursor = '';
  }

  // Assign add to cart click
  modalAddBtn.onclick = () => {
    addToCart(p.id);
    const exists = cart.find(x => x.id === p.id);
    const qty = exists ? exists.qty : 0;
    if (qty >= p.stock) {
      modalStock.innerHTML = `<span style="color:#e74c3c;">⚠️ Límite de stock alcanzado en carrito</span>`;
    }
  };

  // Load reviews for this product
  loadReviews(p.id);

  productModal.classList.add('active');
}

// Close Modal
function closeModal() {
  productModal.classList.remove('active');
}

modalClose?.addEventListener('click', closeModal);
productModal?.addEventListener('click', (e) => {
  if (e.target === productModal) closeModal();
});

// Gallery Navigation Events con aria-labels
const galleryPrevBtn = document.getElementById('galleryPrev');
const galleryNextBtn = document.getElementById('galleryNext');

if (galleryPrevBtn) {
  galleryPrevBtn.setAttribute('aria-label', 'Imagen anterior');
  galleryPrevBtn.addEventListener('click', () => {
    if (modalActiveImages.length > 1) {
      modalActiveImageIndex = (modalActiveImageIndex - 1 + modalActiveImages.length) % modalActiveImages.length;
      updateModalImage();
    }
  });
}
if (galleryNextBtn) {
  galleryNextBtn.setAttribute('aria-label', 'Imagen siguiente');
  galleryNextBtn.addEventListener('click', () => {
    if (modalActiveImages.length > 1) {
      modalActiveImageIndex = (modalActiveImageIndex + 1) % modalActiveImages.length;
      updateModalImage();
    }
  });
}

// Load and Render Customer Reviews
function loadReviews(productId) {
  const listEl = document.getElementById('reviewsList');
  const avgEl = document.getElementById('modalRatingAvg');
  if (!listEl) return;

  listEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:12px; font-size:0.85rem;">Cargando opiniones...</div>';

  fetch(`/api/products/${productId}/reviews`)
    .then(r => r.json())
    .then(reviews => {
      if (reviews.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:12px; font-size:0.85rem;">Aún no hay opiniones. ¡Sé el primero en calificar!</div>';
        if (avgEl) avgEl.textContent = '(Sin opiniones)';
        return;
      }

      const avg = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
      if (avgEl) avgEl.textContent = `(${avg} ★ de ${reviews.length} opiniones)`;

      listEl.innerHTML = reviews.map(r => {
        const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        return `
          <div style="border-bottom:1px solid var(--border-color); padding-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <strong style="font-size:0.85rem; color:var(--accent-strong);">${escapeHTML(r.author)}</strong>
              <span style="color:var(--gold); font-size:0.8rem; font-weight:700;">${stars}</span>
            </div>
            <p style="margin:0; font-size:0.85rem; color:var(--text-main); line-height:1.4;">${escapeHTML(r.comment) || '<i>Sin comentario.</i>'}</p>
            <span style="font-size:0.7rem; color:var(--text-muted); display:block; margin-top:2px;">${new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
        `;
      }).join('');
    })
    .catch(() => {
      listEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:12px; font-size:0.85rem;">Error al cargar opiniones.</div>';
    });
}

// Review Submission Handler con protección anti-spam
document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const productId = productModal.dataset.productId;
  if (!productId) return;

  const author = document.getElementById('reviewAuthor').value.trim();
  const rating = Number(document.getElementById('reviewRating').value);
  const comment = document.getElementById('reviewComment').value.trim();

  // Validaciones del cliente
  if (author.length < 2) {
    return showToast('El nombre debe tener al menos 2 caracteres.', 'error');
  }
  if (comment.length > 500) {
    return showToast('El comentario no puede superar los 500 caracteres.', 'error');
  }

  // Anti-spam: máximo 1 reseña por producto cada 2 minutos
  const cooldownKey = `review_cooldown_${productId}`;
  const lastSubmit = localStorage.getItem(cooldownKey);
  if (lastSubmit && Date.now() - Number(lastSubmit) < 120000) {
    return showToast('Por favor espera un momento antes de enviar otra opinión.', 'error');
  }

  try {
    const res = await fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, rating, comment })
    });

    if (!res.ok) throw new Error();

    localStorage.setItem(cooldownKey, Date.now().toString());
    showToast('¡Tu opinión ha sido enviada con éxito!', 'success');
    document.getElementById('reviewComment').value = '';
    loadReviews(productId);
  } catch (err) {
    showToast('No se pudo guardar tu opinión. Inténtalo de nuevo.', 'error');
  }
});

// Render Product Cards con fallback de imagen
function renderProducts(list) {
  if (!productsEl) return;
  if (list.length === 0) {
    productsEl.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:48px 0; color:var(--text-muted); font-size:1.1rem; font-weight:600;">No se encontraron productos coincidentes.</div>`;
    return;
  }

  productsEl.innerHTML = list.map((p, i) => {
    const stockWarn = (p.stock <= 2 && p.stock > 0) ? `<span class="stock-pill">¡Últimas ${p.stock} u.!</span>` : '';
    const outOfStock = (p.stock === 0) ? `<span class="stock-pill" style="background:#7d576a; box-shadow:none;">Agotado</span>` : '';
    const btnHtml = (p.stock === 0)
      ? `<button disabled style="background:#bdc3c7; cursor:not-allowed; box-shadow:none;">Agotado</button>`
      : `<button onclick="event.stopPropagation(); addToCart('${p.id}', this)">Añadir al carrito</button>`;

    // Fallback de imagen si no carga (#17)
    const fallbackImg = `https://via.placeholder.com/400x300?text=Imagen+no+disponible`;

    return `<article class="product product-animated" style="animation-delay: ${i * 0.03}s" onclick="openProductModal('${p.id}', event)">
      <div class="product-img-wrapper">
        <span class="product-cat-tag">${escapeHTML(p.category)}</span>
        ${stockWarn}
        ${outOfStock}
        <img src="${p.image}" alt="${escapeHTML(p.name)}" onerror="this.src='${fallbackImg}'; this.onerror=null;">
      </div>
      <h3>${escapeHTML(p.name)}</h3>
      <p>${escapeHTML(p.description)}</p>
      <div class="price">${formatCurrency(p.price)}</div>
      ${btnHtml}
    </article>`;
  }).join('');
}

// Update Screen Display (Filters + Search + Sort)
function updateDisplay() {
  let filtered = [...products];

  // 1. Category Filter
  if (currentCategory !== 'all') {
    filtered = filtered.filter(p => p.category === currentCategory);
  }

  // 2. Keyword Search
  if (searchKeyword.length > 0) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchKeyword) ||
      p.category.toLowerCase().includes(searchKeyword) ||
      (p.description && p.description.toLowerCase().includes(searchKeyword))
    );
  }

  // 3. Sorting
  if (currentSort === 'price-low') filtered.sort((a, b) => a.price - b.price);
  else if (currentSort === 'price-high') filtered.sort((a, b) => b.price - a.price);
  else if (currentSort === 'name-az') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (currentSort === 'name-za') filtered.sort((a, b) => b.name.localeCompare(a.name));

  renderProducts(filtered);
}

// Load Products from API
function load() {
  renderSkeletons();
  fetch('/api/products')
    .then(r => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then(data => {
      products = data;
      updateDisplay();
    })
    .catch(() => {
      products = [];
      renderProducts([]);
      showToast('Error al conectar con la tienda. Inicia el servidor.', 'error');
    });

  updateCartUI();
  applySavedTheme();
}

// Category Filter Switch
function filterCategory(cat) {
  currentCategory = cat;
  const btns = document.querySelectorAll('.cat-btn, .cat-card');
  btns.forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  updateDisplay();
}

// Event Delegation for Category Clicks
document.addEventListener('click', e => {
  if (e.target.matches('.cat-btn') || e.target.closest('.cat-card')) {
    const cat = e.target.dataset.cat || e.target.closest('.cat-card').dataset.cat;
    filterCategory(cat);
  }
});

// Sorting Event
sortSelect?.addEventListener('change', (e) => {
  currentSort = e.target.value;
  updateDisplay();
});

// Search Input Logic
storeSearchInput?.addEventListener('input', (e) => {
  searchKeyword = e.target.value.trim().toLowerCase();
  if (searchClearBtn) searchClearBtn.style.display = searchKeyword.length > 0 ? 'block' : 'none';
  updateDisplay();
});

// Clear Search Input
searchClearBtn?.addEventListener('click', () => {
  if (storeSearchInput) {
    storeSearchInput.value = '';
    searchKeyword = '';
    searchClearBtn.style.display = 'none';
    updateDisplay();
  }
});

// WhatsApp Link Generator
const waHandler = e => {
  e.preventDefault();
  const number = (typeof PHONE !== 'undefined' && PHONE !== '') ? PHONE : '573022880520';
  const text = encodeURIComponent('¡Hola! Me gustaría recibir más información sobre sus productos.');
  window.open(`https://wa.me/${number}?text=${text}`, '_blank');
};

document.getElementById('whatsappLink')?.addEventListener('click', waHandler);
document.getElementById('topWhatsappLink')?.addEventListener('click', waHandler);

// Autofill customer name if logged in
const clientUserStr = localStorage.getItem('clientUser');
if (clientUserStr) {
  try {
    const clientUser = JSON.parse(clientUserStr);
    const authLink = document.querySelector('a[href="account.html"]');
    if (authLink) {
      authLink.textContent = `Hola, ${escapeHTML(clientUser.firstName)}`;
    }
    const authorInput = document.getElementById('reviewAuthor');
    if (authorInput) {
      authorInput.value = `${clientUser.firstName} ${clientUser.lastName}`;
    }
  } catch(e) {}
}

// Initialize Page
load();
