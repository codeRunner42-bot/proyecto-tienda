const loginStatus = document.getElementById('loginStatus');
const loginForm = document.getElementById('loginForm');

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
    location.href = 'admin.html';
  } catch (error) {
    showLoginStatus(error.message, 'error');
  }
});
