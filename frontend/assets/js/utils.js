// ============================================================
// utils.js — Funciones y utilidades compartidas en todas las páginas
// ============================================================

// Formatea un número como moneda colombiana (COP)
function formatCurrency(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

// Escapa HTML para prevenir inyección XSS
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Sistema global de notificaciones Toast
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
    <button class="toast-close" aria-label="Cerrar notificación">✕</button>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}

// Etiqueta legible del método de pago — unifica todos los archivos
function getPaymentLabel(payment) {
  switch (String(payment || '').toLowerCase()) {
    case 'nequi':
      return 'Nequi 📱';
    case 'contra_entrega':
    case 'cash':
      return 'Contra entrega 💵';
    case 'transfer':
      return 'Transferencia Bancaria 🏦';
    default:
      return payment || 'No especificado';
  }
}

// Aplicar tema guardado (oscuro/claro)
function applySavedTheme() {
  const savedTheme = localStorage.getItem('theme');
  const themeToggle = document.getElementById('themeToggle');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeToggle) themeToggle.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    if (themeToggle) themeToggle.textContent = '🌙';
  }
}

// Event listener del botón de tema
document.getElementById('themeToggle')?.addEventListener('click', () => {
  const themeToggle = document.getElementById('themeToggle');
  if (document.body.classList.contains('dark-mode')) {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
    if (themeToggle) themeToggle.textContent = '🌙';
  } else {
    document.body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
    if (themeToggle) themeToggle.textContent = '☀️';
  }
});

// ── Ocultar menú de categorías al hacer scroll en móvil ──────────────────────
(function () {
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    // Solo aplica en pantallas móviles
    if (window.innerWidth > 768) return;
    const catNav = document.querySelector('.category-nav');
    if (!catNav) return;

    const currentY = window.scrollY;
    if (currentY > lastScrollY && currentY > 60) {
      // Scrolleando hacia abajo → ocultar
      catNav.classList.add('nav-collapsed');
    } else {
      // Scrolleando hacia arriba o en el tope → mostrar
      catNav.classList.remove('nav-collapsed');
    }
    lastScrollY = currentY;
  }, { passive: true });
})();
