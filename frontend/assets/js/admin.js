const apiUrl = '/api/products';
const adminStatus = document.getElementById('adminStatus');
const adminListBody = document.querySelector('#adminList tbody');
const searchInput = document.getElementById('searchInput');
const productForm = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const newProductBtn = document.getElementById('newProductBtn');
const cancelEditBtn = document.getElementById('cancelEdit');
let allProducts = [];

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

function showStatus(text, type = 'info') {
  adminStatus.textContent = text;
  adminStatus.className = `message ${type}`;
}

async function fetchProducts() {
  if (!requireLogin()) return;
  try {
    const response = await fetch(apiUrl, { headers: { ...authHeaders() } });
    if (!response.ok) throw new Error('No se pudo cargar la lista de productos.');
    allProducts = await response.json();
    renderProductTable(allProducts);
    showStatus('Productos cargados con éxito.', 'success');
  } catch (error) {
    showStatus('Error al conectar con la API de administración. Inicia el servidor con npm start.', 'error');
  }
}

function renderProductTable(products) {
  adminListBody.innerHTML = products.map(product => {
    return `
      <tr data-id="${product.id}">
        <td>${product.id}</td>
        <td>${product.name}</td>
        <td>${product.category}</td>
        <td>${Number(product.price).toFixed(2)}</td>
        <td>${product.stock ?? 0}</td>
        <td>
          <button class="btn btn-secondary editBtn">Editar</button>
          <button class="btn btn-danger deleteBtn">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

function resetForm() {
  productForm.reset();
  productForm.id.value = '';
  formTitle.textContent = 'Agregar producto';
  showStatus('Rellena el formulario para agregar un producto nuevo.', 'info');
}

function fillForm(product) {
  productForm.id.value = product.id;
  productForm.name.value = product.name;
  productForm.category.value = product.category;
  productForm.price.value = product.price;
  productForm.stock.value = product.stock;
  productForm.image.value = product.image;
  productForm.description.value = product.description;
  formTitle.textContent = 'Editar producto';
  showStatus(`Editando producto ${product.id}.`, 'info');
}

async function createProduct(data) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'No se pudo crear el producto.');
  }
  return response.json();
}

async function updateProduct(id, data) {
  const response = await fetch(`${apiUrl}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'No se pudo actualizar el producto.');
  }
  return response.json();
}

async function deleteProduct(id) {
  const response = await fetch(`${apiUrl}/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'No se pudo eliminar el producto.');
  }
  return response.json();
}

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(productForm);
  const productData = {
    name: formData.get('name').trim(),
    category: formData.get('category').trim(),
    price: Number(formData.get('price')),
    stock: Number(formData.get('stock')) || 0,
    image: formData.get('image').trim() || 'https://via.placeholder.com/400x300?text=Producto',
    description: formData.get('description').trim(),
  };
  const imageFile = document.getElementById('imageUpload').files[0];
  const id = formData.get('id');

  try {
    if (imageFile) {
      const formDataFile = new FormData();
      formDataFile.append('image', imageFile);
      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: formDataFile,
      });
      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.error || 'No se pudo subir la imagen.');
      }
      const uploadData = await uploadResponse.json();
      productData.image = uploadData.url;
    }

    if (id) {
      await updateProduct(id, productData);
      showStatus('Producto actualizado correctamente.', 'success');
    } else {
      await createProduct(productData);
      showStatus('Producto creado correctamente.', 'success');
    }
    await fetchProducts();
    resetForm();
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

adminListBody.addEventListener('click', async (event) => {
  const row = event.target.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.classList.contains('editBtn')) {
    const product = allProducts.find((item) => item.id === id);
    if (product) fillForm(product);
  }
  if (event.target.classList.contains('deleteBtn')) {
    if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
    try {
      await deleteProduct(id);
      await fetchProducts();
      showStatus('Producto eliminado correctamente.', 'success');
      resetForm();
    } catch (error) {
      showStatus(error.message, 'error');
    }
  }
});

searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = allProducts.filter((product) => {
    return (
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term) ||
      String(product.id).toLowerCase().includes(term)
    );
  });
  renderProductTable(filtered);
});

newProductBtn.addEventListener('click', resetForm);
cancelEditBtn.addEventListener('click', resetForm);

if (requireLogin()) {
  fetchProducts();
}
