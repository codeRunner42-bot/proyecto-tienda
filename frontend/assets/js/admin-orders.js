const ordersTableBody = document.querySelector('#ordersTable tbody');
const orderSearch = document.getElementById('orderSearch');
const orderStatus = document.getElementById('orderStatus');
let allOrders = [];

function getAdminToken() {
  return localStorage.getItem('adminToken');
}

function requireLogin() {
  const token = getAdminToken();
  if (!token) {
    location.href = 'admin-login.html';
    return false;
  }
  return true;
}

function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function showOrderStatus(text, type='info') {
  orderStatus.textContent = text;
  orderStatus.className = `message ${type}`;
}

function renderOrders(orders) {
  ordersTableBody.innerHTML = orders.map(order => {
    return `
      <tr data-id="${order.id}">
        <td>${order.id}</td>
        <td>${order.buyer.firstName} ${order.buyer.lastName}</td>
        <td>${order.buyer.phone}</td>
        <td>$${Number(order.total).toFixed(2)}</td>
        <td>${order.payment}</td>
        <td>${order.status}</td>
        <td>${new Date(order.createdAt).toLocaleString()}</td>
        <td>
          <select class="statusSelect">
            <option value="pending" ${order.status==='pending' ? 'selected' : ''}>pending</option>
            <option value="processing" ${order.status==='processing' ? 'selected' : ''}>processing</option>
            <option value="shipped" ${order.status==='shipped' ? 'selected' : ''}>shipped</option>
            <option value="delivered" ${order.status==='delivered' ? 'selected' : ''}>delivered</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

async function fetchOrders() {
  if (!requireLogin()) return;
  try {
    const response = await fetch('/api/orders', { headers: { ...authHeaders() } });
    if (!response.ok) throw new Error('No se pudieron cargar los pedidos.');
    allOrders = await response.json();
    renderOrders(allOrders);
    showOrderStatus('Pedidos cargados correctamente.', 'success');
  } catch (err) {
    showOrderStatus(err.message, 'error');
  }
}

ordersTableBody.addEventListener('change', async (event) => {
  if (!event.target.classList.contains('statusSelect')) return;
  const row = event.target.closest('tr');
  const id = row.dataset.id;
  const newStatus = event.target.value;
  try {
    const response = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status: newStatus })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'No se pudo actualizar el estado.');
    }
    const updated = await response.json();
    showOrderStatus(`Pedido ${updated.id} actualizado a ${updated.status}.`, 'success');
    allOrders = allOrders.map(order => order.id === updated.id ? updated : order);
  } catch (err) {
    showOrderStatus(err.message, 'error');
  }
});

orderSearch.addEventListener('input', () => {
  const term = orderSearch.value.trim().toLowerCase();
  const filtered = allOrders.filter(order => {
    return (
      order.id.toLowerCase().includes(term) ||
      order.buyer.firstName.toLowerCase().includes(term) ||
      order.buyer.lastName.toLowerCase().includes(term) ||
      order.buyer.phone.toLowerCase().includes(term)
    );
  });
  renderOrders(filtered);
});

fetchOrders();
