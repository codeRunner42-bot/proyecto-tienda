const loginStatus = document.getElementById('loginStatus');
const loginForm = document.getElementById('loginForm');

// Theme Toggler / Persister
const body = document.body;
function applySavedTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
  } else {
    body.classList.remove('dark-mode');
  }
}

function showLoginStatus(text, type='info') {
  loginStatus.textContent = text;
  loginStatus.className = `message ${type}`;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = {
    user: formData.get('user').trim(),
    pass: formData.get('pass').trim(),
  };

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'No se pudo iniciar sesión.');
    }
    const data = await response.json();
    localStorage.setItem('adminToken', data.token);
    showLoginStatus('¡Acceso concedido! Redirigiendo...', 'success');
    setTimeout(() => {
      location.href = 'admin.html';
    }, 1000);
  } catch (error) {
    showLoginStatus(error.message, 'error');
  }
});

// Initialize theme
applySavedTheme();
