const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;
const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const FRONTEND_PATH = path.resolve(__dirname, '../frontend');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'secret-admin-token';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now().toString(36) + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(FRONTEND_PATH));

async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.error('No se pudo crear uploads:', err);
  }
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  const [, token] = auth.split(' ');
  return token || null;
}

function requireAdmin(req, res, next) {
  const token = extractToken(req);
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado. Inicia sesión como administrador.' });
  }
  next();
}

// Ruta para mantener el servidor activo (Keep-alive)
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

app.post('/api/admin/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return res.json({ token: ADMIN_TOKEN });
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
});

app.post('/api/upload-image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

async function readProducts() {
  try {
    const content = await fs.readFile(PRODUCTS_FILE, 'utf8');
    return JSON.parse(content || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeProducts(products) {
  const content = JSON.stringify(products, null, 2);
  await fs.writeFile(PRODUCTS_FILE, content, 'utf8');
}

async function readOrders() {
  try {
    const content = await fs.readFile(ORDERS_FILE, 'utf8');
    return JSON.parse(content || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeOrders(orders) {
  const content = JSON.stringify(orders, null, 2);
  await fs.writeFile(ORDERS_FILE, content, 'utf8');
}

function generateId() {
  return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 10000).toString(36);
}

function generateOrderId() {
  return 'o' + Date.now().toString(36) + Math.floor(Math.random() * 10000).toString(36);
}

app.get('/api/products', async (req, res) => {
  try {
    const products = await readProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar los productos.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const products = await readProducts();
    const product = products.find((item) => item.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Error al leer el producto.' });
  }
});

app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const products = await readProducts();
    const payload = req.body;
    const id = payload.id ? String(payload.id).trim() : generateId();
    if (!payload.name || !payload.category || payload.price == null) {
      return res.status(400).json({ error: 'name, category y price son obligatorios.' });
    }
    if (products.some((item) => item.id === id)) {
      return res.status(400).json({ error: 'Ya existe un producto con ese id.' });
    }
    const product = {
      id,
      name: String(payload.name).trim(),
      category: String(payload.category).trim(),
      price: Number(payload.price),
      stock: payload.stock == null ? 0 : Number(payload.stock),
      description: String(payload.description || '').trim(),
      image: String(payload.image || 'https://via.placeholder.com/400x300?text=Producto').trim(),
    };
    products.push(product);
    await writeProducts(products);
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo crear el producto.' });
  }
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const products = await readProducts();
    const index = products.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Producto no encontrado.' });
    const payload = req.body;
    const existing = products[index];
    const updated = {
      ...existing,
      name: payload.name != null ? String(payload.name).trim() : existing.name,
      category: payload.category != null ? String(payload.category).trim() : existing.category,
      price: payload.price != null ? Number(payload.price) : existing.price,
      stock: payload.stock != null ? Number(payload.stock) : existing.stock,
      description: payload.description != null ? String(payload.description).trim() : existing.description,
      image: payload.image != null ? String(payload.image).trim() : existing.image,
    };
    products[index] = updated;
    await writeProducts(products);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo actualizar el producto.' });
  }
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const products = await readProducts();
    const index = products.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Producto no encontrado.' });
    const [deleted] = products.splice(index, 1);
    await writeProducts(products);
    res.json({ deleted });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo eliminar el producto.' });
  }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await readOrders();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar los pedidos.' });
  }
});

app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const orders = await readOrders();
    const order = orders.find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Error al leer el pedido.' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const orders = await readOrders();
    const payload = req.body;

    if (!payload.buyer || !payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      return res.status(400).json({ error: 'buyer y items son obligatorios.' });
    }

    const products = await readProducts();
    const itemsToUpdate = [];

    for (const item of payload.items) {
      const product = products.find((p) => p.id === String(item.id));
      if (!product) {
        return res.status(400).json({ error: `El producto "${item.name || item.id}" ya no existe.` });
      }
      if (typeof product.stock === 'number') {
        if (product.stock < Number(item.qty)) {
          return res.status(400).json({
            error: `Stock insuficiente para ${product.name}. Disponible: ${product.stock}, solicitado: ${item.qty}`
          });
        }
        itemsToUpdate.push({ product, qty: Number(item.qty) });
      }
    }

    // Descontar stock
    for (const update of itemsToUpdate) {
      update.product.stock -= update.qty;
    }
    await writeProducts(products);

    const total = Number(payload.total || payload.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty || 0)), 0));
    const order = {
      id: generateOrderId(),
      buyer: {
        firstName: String(payload.buyer.firstName || '').trim(),
        lastName: String(payload.buyer.lastName || '').trim(),
        phone: String(payload.buyer.phone || '').trim(),
        address: String(payload.buyer.address || '').trim(),
      },
      payment: String(payload.payment || 'desconocido'),
      items: payload.items.map((item) => ({
        id: String(item.id),
        name: String(item.name),
        price: Number(item.price),
        qty: Number(item.qty),
      })),
      total,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    orders.push(order);
    await writeOrders(orders);
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo crear el pedido.' });
  }
});

app.put('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const orders = await readOrders();
    const index = orders.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Pedido no encontrado.' });
    const payload = req.body;
    const existing = orders[index];
    const updated = {
      ...existing,
      status: payload.status != null ? String(payload.status).trim() : existing.status,
    };
    orders[index] = updated;
    await writeOrders(orders);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
  }
});

ensureUploadDir().then(() => {
  app.listen(port, () => {
    console.log(`Servidor iniciado en http://localhost:${port}`);
  });
});
