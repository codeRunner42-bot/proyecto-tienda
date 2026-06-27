// Cargar variables de entorno desde .env para desarrollo local
try {
  require('dotenv').config();
} catch (e) {
  // Ignorar si dotenv no está instalado (por ejemplo en producción)
}

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;

// Limpiar y configurar Cloudinary desde CLOUDINARY_URL si está presente
if (process.env.CLOUDINARY_URL) {
  let cloudinaryUrl = process.env.CLOUDINARY_URL.trim();
  // Quitar comillas si las tuviera (común al pegar en algunos entornos)
  if ((cloudinaryUrl.startsWith('"') && cloudinaryUrl.endsWith('"')) || 
      (cloudinaryUrl.startsWith("'") && cloudinaryUrl.endsWith("'"))) {
    cloudinaryUrl = cloudinaryUrl.slice(1, -1).trim();
  }
  process.env.CLOUDINARY_URL = cloudinaryUrl;

  const match = cloudinaryUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (match) {
    const apiKey = match[1];
    const apiSecret = match[2];
    const cloudName = match[3];
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    console.log('Cloudinary inicializado con éxito. Cloud Name:', cloudName);
  } else {
    console.error('Error: El formato de CLOUDINARY_URL no es válido. Debe ser "cloudinary://<api_key>:<api_secret>@<cloud_name>"');
    cloudinary.config({ cloud_name: '', api_key: '', api_secret: '' });
  }
} else {
  console.warn('ADVERTENCIA: CLOUDINARY_URL no está definida. Las imágenes se guardarán de forma local en la carpeta "uploads/". NOTA: En servidores como Render, estas imágenes se borrarán cuando el servidor se reinicie.');
}

const app = express();
const port = process.env.PORT || 3000;

const PRODUCTS_FILE = path.join(__dirname, 'products.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const FRONTEND_PATH = path.resolve(__dirname, '../frontend');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS_PLAIN = process.env.ADMIN_PASS || '1234';
const JWT_SECRET = process.env.JWT_SECRET || 'ale-beauty-art-secret-key-12345';

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{7,15}$/;
const DOCUMENT_REGEX = /^\d{5,15}$/;
const NAME_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'\-]+$/;
const VALID_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

// Setup Tables in PostgreSQL
async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      description TEXT DEFAULT '',
      image TEXT DEFAULT '',
      images TEXT DEFAULT '[]'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      "firstName" TEXT NOT NULL,
      "lastName" TEXT NOT NULL,
      "documentId" TEXT,
      phone TEXT NOT NULL,
      address TEXT DEFAULT '',
      payment TEXT NOT NULL,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      "createdAt" TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      product_id TEXT NOT NULL,
      author TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT DEFAULT '',
      "createdAt" TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      "firstName" TEXT NOT NULL,
      "lastName" TEXT NOT NULL,
      "documentId" TEXT,
      phone TEXT NOT NULL,
      address TEXT DEFAULT ''
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      subtotal REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      notes TEXT DEFAULT '',
      "createdAt" TEXT NOT NULL,
      "paidAt" TEXT
    )
  `);

  console.log('Base de datos PostgreSQL configurada correctamente.');
}

let adminPasswordHash = '';

// Hash plain password on startup
async function initAdminPassword() {
  adminPasswordHash = await bcrypt.hash(ADMIN_PASS_PLAIN, 10);
  console.log(`Seguridad de administración inicializada. Usuario: "${ADMIN_USER}".`);
}

// Migrate data from JSON files to PostgreSQL database if tables are empty
async function migrateData() {
  try {
    // Migrate Products
    const countResult = await pool.query('SELECT COUNT(*) as count FROM products');
    if (parseInt(countResult.rows[0].count) === 0) {
      console.log('Detectada base de datos de productos vacía. Buscando products.json para migración...');
      try {
        const content = await fs.readFile(PRODUCTS_FILE, 'utf8');
        const products = JSON.parse(content || '[]');
        for (const p of products) {
          await pool.query(
            `INSERT INTO products (id, name, category, price, stock, description, image, images)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, p.name, p.category, Number(p.price || 0), Number(p.stock || 0),
             p.description || '', p.image || '', '[]']
          );
        }
        console.log(`Migración de productos completada. Se migraron ${products.length} productos.`);
      } catch (err) {
        console.log('No se pudo migrar products.json. Continuando sin migrar productos.');
      }
    }

    // Migrate Orders
    const ordersCountResult = await pool.query('SELECT COUNT(*) as count FROM orders');
    if (parseInt(ordersCountResult.rows[0].count) === 0) {
      console.log('Detectada tabla de pedidos vacía. Buscando orders.json para migración...');
      try {
        const content = await fs.readFile(ORDERS_FILE, 'utf8');
        const orders = JSON.parse(content || '[]');
        for (const o of orders) {
          await pool.query(
            `INSERT INTO orders (id, user_id, "firstName", "lastName", phone, address, payment, items, total, status, "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [o.id, null, o.buyer.firstName || '', o.buyer.lastName || '',
             o.buyer.phone || '', o.buyer.address || '', o.payment || '',
             JSON.stringify(o.items || []), Number(o.total || 0),
             o.status || 'pending', o.createdAt || new Date().toISOString()]
          );
        }
        console.log(`Migración de pedidos completada. Se migraron ${orders.length} pedidos.`);
      } catch (err) {
        console.log('No se pudo migrar orders.json. Continuando sin migrar pedidos.');
      }
    }
  } catch (error) {
    console.error('Error durante la migración a PostgreSQL:', error);
  }
}

// Usar memoria en lugar de disco — Cloudinary sube el buffer directamente
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB máximo
});

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

// Security Middleware checking JWT tokens for Admin panel
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.substring(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Se requiere inicio de sesión administrativo.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.user === ADMIN_USER) {
      req.adminUser = decoded.user;
      return next();
    }
    throw new Error();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión expirada o token inválido. Por favor, inicia sesión nuevamente.' });
  }
}

async function generateId() {
  try {
    const result = await pool.query('SELECT id FROM products');
    const rows = result.rows;
    let maxNum = 0;
    for (const row of rows) {
      if (row.id && row.id.startsWith('p')) {
        const num = parseInt(row.id.substring(1), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    return 'p' + (maxNum + 1);
  } catch (e) {
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 10000).toString(36);
  }
}

function generateOrderId() {
  return 'o' + Date.now().toString(36) + Math.floor(Math.random() * 10000).toString(36);
}

// API Healthcheck
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// Admin Login endpoint
app.post('/api/admin/login', async (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER) {
    const match = await bcrypt.compare(pass, adminPasswordHash);
    if (match) {
      const token = jwt.sign({ user: ADMIN_USER }, JWT_SECRET, { expiresIn: '8h' });
      return res.json({ token });
    }
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
});

// Image Upload endpoint (Admin only) — sube a Cloudinary si está configurado, con fallback local
app.post('/api/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });

  // Si CLOUDINARY_URL está configurada, forzar la subida a Cloudinary y no usar fallback local en caso de fallo
  if (process.env.CLOUDINARY_URL) {
    const config = cloudinary.config();
    if (!config.cloud_name || !config.api_key || !config.api_secret) {
      return res.status(400).json({
        error: 'CLOUDINARY_URL está configurada pero su formato es incorrecto. Debe tener la estructura: cloudinary://API_KEY:API_SECRET@CLOUD_NAME'
      });
    }

    try {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'alebeauty', resource_type: 'image' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });
      return res.json({ url: uploadResult.secure_url });
    } catch (cloudinaryErr) {
      console.error('Error al subir a Cloudinary:', cloudinaryErr);
      return res.status(500).json({
        error: `Fallo al subir a Cloudinary: ${cloudinaryErr.message || JSON.stringify(cloudinaryErr)}`
      });
    }
  }

  // Fallback local: Solo si CLOUDINARY_URL no está configurada en absoluto
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = Date.now().toString(36) + '-' + Math.round(Math.random() * 1e9) + ext;
    const filepath = path.join(UPLOADS_DIR, filename);
    await fs.writeFile(filepath, req.file.buffer);
    
    console.warn('Advertencia: Imagen guardada localmente debido a la falta de CLOUDINARY_URL. Recuerda que se borrará si el servidor se reinicia.');
    return res.json({ url: `/uploads/${filename}` });
  } catch (localErr) {
    console.error('Error al guardar imagen localmente:', localErr);
    return res.status(500).json({ error: 'No se pudo guardar la imagen localmente.' });
  }
});

// ==========================================================================
// CLIENT AUTHENTICATION ENDPOINTS
// ==========================================================================

// Register customer
app.post('/api/users/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, address, documentId } = req.body || {};
    if (!email || !password || !firstName || !lastName || !phone || !documentId) {
      return res.status(400).json({ error: 'Todos los campos obligatorios (*) deben completarse.' });
    }

    const emailKey = email.trim().toLowerCase();
    if (emailKey.length > 100) {
      return res.status(400).json({ error: 'El correo electrónico no puede superar los 100 caracteres.' });
    }
    if (!EMAIL_REGEX.test(emailKey)) {
      return res.status(400).json({ error: 'Formato de correo electrónico no válido.' });
    }
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    if (cleanFirstName.length < 2 || cleanFirstName.length > 50) {
      return res.status(400).json({ error: 'El nombre debe tener entre 2 y 50 caracteres.' });
    }
    if (!NAME_REGEX.test(cleanFirstName)) {
      return res.status(400).json({ error: 'El nombre solo puede contener letras y espacios.' });
    }
    if (cleanLastName.length < 2 || cleanLastName.length > 50) {
      return res.status(400).json({ error: 'El apellido debe tener entre 2 y 50 caracteres.' });
    }
    if (!NAME_REGEX.test(cleanLastName)) {
      return res.status(400).json({ error: 'El apellido solo puede contener letras y espacios.' });
    }
    if (!PHONE_REGEX.test(phone.trim())) {
      return res.status(400).json({ error: 'El teléfono debe contener únicamente números y tener entre 7 y 15 dígitos.' });
    }
    if (!DOCUMENT_REGEX.test(documentId.trim())) {
      return res.status(400).json({ error: 'El documento/cédula debe contener únicamente números y tener entre 5 y 15 dígitos.' });
    }
    const cleanPassword = password.trim();
    if (cleanPassword.length < 6 || cleanPassword.length > 50) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 50 caracteres.' });
    }
    if (address && address.trim().length > 150) {
      return res.status(400).json({ error: 'La dirección no puede superar los 150 caracteres.' });
    }

    const checkResult = await pool.query('SELECT id FROM users WHERE email = $1', [emailKey]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cuenta registrada con este correo electrónico.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);

    await pool.query(
      `INSERT INTO users (id, email, password, "firstName", "lastName", "documentId", phone, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, emailKey, hash, firstName.trim(), lastName.trim(),
       documentId.trim(), phone.trim(), (address || '').trim()]
    );

    const token = jwt.sign({ userId, email: emailKey }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({
      token,
      user: { id: userId, email: emailKey, firstName, lastName, phone, address, documentId }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error al registrar la cuenta de cliente.' });
  }
});

// Login customer
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
    }
    if (email.trim().length > 100 || password.trim().length > 50) {
      return res.status(400).json({ error: 'El correo o contraseña ingresada excede los límites de longitud permitidos.' });
    }

    const emailKey = email.trim().toLowerCase();
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [emailKey]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Correo electrónico o contraseña incorrectos.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Correo electrónico o contraseña incorrectos.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        address: user.address,
        documentId: user.documentId
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesión de cliente.' });
  }
});

// Get customer profile + order history
app.get('/api/users/me', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.substring(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado. Inicia sesión.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userResult = await pool.query(
      `SELECT id, email, "firstName", "lastName", phone, address, "documentId" FROM users WHERE id = $1`,
      [decoded.userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    // Fetch orders placed by this user
    const ordersResult = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY "createdAt" DESC`,
      [decoded.userId]
    );
    const orders = ordersResult.rows.map(o => ({
      id: o.id,
      buyer: {
        firstName: o.firstName,
        lastName: o.lastName,
        phone: o.phone,
        address: o.address,
        documentId: o.documentId
      },
      payment: o.payment,
      items: JSON.parse(o.items),
      total: o.total,
      status: o.status,
      createdAt: o.createdAt
    }));

    res.json({ user, orders });
  } catch (err) {
    res.status(401).json({ error: 'Sesión de cliente inválida o expirada.' });
  }
});

// ==========================================================================
// REVIEWS ENDPOINTS
// ==========================================================================

// GET reviews for a product
app.get('/api/products/:id/reviews', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM reviews WHERE product_id = $1 ORDER BY "createdAt" DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener reviews:', error);
    res.status(500).json({ error: 'No se pudieron obtener los comentarios del producto.' });
  }
});

// POST review for a product
app.post('/api/products/:id/reviews', async (req, res) => {
  try {
    const { author, rating, comment } = req.body || {};
    if (!author || rating == null) {
      return res.status(400).json({ error: 'El nombre y la calificación son obligatorios.' });
    }

    const checkResult = await pool.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'El producto al que intenta calificar no existe.' });
    }

    const newReview = {
      product_id: req.params.id,
      author: String(author).trim(),
      rating: Math.max(1, Math.min(5, Number(rating))),
      comment: String(comment || '').trim(),
      createdAt: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO reviews (product_id, author, rating, comment, "createdAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [newReview.product_id, newReview.author, newReview.rating, newReview.comment, newReview.createdAt]
    );

    res.status(201).json(newReview);
  } catch (error) {
    console.error('Error al registrar review:', error);
    res.status(500).json({ error: 'No se pudo registrar tu opinión.' });
  }
});

// ==========================================================================
// PUBLIC ORDER STATUS (TRACKING) ENDPOINT
// ==========================================================================

app.get('/api/public/orders/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, "firstName", "lastName", "documentId", payment, items, total, status, "createdAt"
       FROM orders WHERE id = $1`,
      [req.params.id]
    );
    const o = result.rows[0];
    if (!o) return res.status(404).json({ error: 'Código de pedido no encontrado.' });

    res.json({
      id: o.id,
      buyer: {
        firstName: o.firstName,
        lastName: o.lastName[0] + '***', // partially masked for privacy
        documentId: o.documentId,
      },
      payment: o.payment,
      items: JSON.parse(o.items),
      total: o.total,
      status: o.status,
      createdAt: o.createdAt
    });
  } catch (error) {
    console.error('Error al buscar pedido:', error);
    res.status(500).json({ error: 'Error al buscar el pedido.' });
  }
});

// ==========================================================================
// PRODUCT ENDPOINTS
// ==========================================================================

// GET all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    const products = result.rows.map(p => {
      let parsedImages = [];
      try {
        parsedImages = p.images ? JSON.parse(p.images) : [];
      } catch(e) {
        parsedImages = p.images ? p.images.split(',').map(s => s.trim()).filter(Boolean) : [];
      }
      return { ...p, images: parsedImages };
    });
    res.json(products);
  } catch (error) {
    console.error('Error al cargar productos:', error);
    res.status(500).json({ error: 'No se pudieron cargar los productos.' });
  }
});

// GET product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const p = result.rows[0];
    if (!p) return res.status(404).json({ error: 'Producto no encontrado.' });

    let parsedImages = [];
    try {
      parsedImages = p.images ? JSON.parse(p.images) : [];
    } catch(e) {
      parsedImages = p.images ? p.images.split(',').map(s => s.trim()).filter(Boolean) : [];
    }

    res.json({ ...p, images: parsedImages });
  } catch (error) {
    console.error('Error al leer producto:', error);
    res.status(500).json({ error: 'Error al leer el producto.' });
  }
});

// CREATE product (Admin only)
app.post('/api/products', requireAdmin, async (req, res) => {
  try {
    const payload = req.body;
    const id = payload.id ? String(payload.id).trim() : await generateId();

    if (!payload.name || !payload.category || payload.price == null) {
      return res.status(400).json({ error: 'Nombre, categoría y precio son campos obligatorios.' });
    }
    if (Number(payload.price) <= 0) {
      return res.status(400).json({ error: 'El precio del producto debe ser mayor que cero.' });
    }
    if (payload.stock != null && Number(payload.stock) < 0) {
      return res.status(400).json({ error: 'El stock del producto no puede ser negativo.' });
    }

    const checkResult = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un producto con ese id.' });
    }

    const imagesStr = Array.isArray(payload.images)
      ? JSON.stringify(payload.images)
      : (payload.images ? String(payload.images).trim() : '[]');

    const product = {
      id,
      name: String(payload.name).trim(),
      category: String(payload.category).trim(),
      price: Number(payload.price),
      stock: payload.stock == null ? 0 : Number(payload.stock),
      description: String(payload.description || '').trim(),
      image: String(payload.image || 'https://via.placeholder.com/400x300?text=Producto').trim(),
      images: imagesStr
    };

    await pool.query(
      `INSERT INTO products (id, name, category, price, stock, description, image, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [product.id, product.name, product.category, product.price, product.stock,
       product.description, product.image, product.images]
    );

    res.status(201).json({ ...product, images: JSON.parse(product.images) });
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: 'No se pudo crear el producto en la base de datos.' });
  }
});

// UPDATE product (Admin only)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });

    const payload = req.body;
    if (payload.price != null && Number(payload.price) <= 0) {
      return res.status(400).json({ error: 'El precio del producto debe ser mayor que cero.' });
    }
    if (payload.stock != null && Number(payload.stock) < 0) {
      return res.status(400).json({ error: 'El stock del producto no puede ser negativo.' });
    }

    const imagesStr = payload.images !== undefined
      ? (Array.isArray(payload.images) ? JSON.stringify(payload.images) : String(payload.images).trim())
      : existing.images;

    const updated = {
      name: payload.name != null ? String(payload.name).trim() : existing.name,
      category: payload.category != null ? String(payload.category).trim() : existing.category,
      price: payload.price != null ? Number(payload.price) : existing.price,
      stock: payload.stock != null ? Number(payload.stock) : existing.stock,
      description: payload.description != null ? String(payload.description).trim() : existing.description,
      image: payload.image != null ? String(payload.image).trim() : existing.image,
      images: imagesStr
    };

    await pool.query(
      `UPDATE products
       SET name = $1, category = $2, price = $3, stock = $4, description = $5, image = $6, images = $7
       WHERE id = $8`,
      [updated.name, updated.category, updated.price, updated.stock,
       updated.description, updated.image, updated.images, req.params.id]
    );

    let parsedImages = [];
    try {
      parsedImages = updated.images ? JSON.parse(updated.images) : [];
    } catch(e) {
      parsedImages = updated.images ? updated.images.split(',').map(s => s.trim()).filter(Boolean) : [];
    }

    res.json({ id: req.params.id, ...updated, images: parsedImages });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ error: 'No se pudo actualizar el producto.' });
  }
});

// DELETE product (Admin only)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });

    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);

    res.json({ deleted: existing });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'No se pudo eliminar el producto.' });
  }
});

// ==========================================================================
// ORDER ENDPOINTS
// ==========================================================================

// GET all orders (Admin only)
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM orders ORDER BY "createdAt" DESC`);
    const orders = result.rows.map(o => ({
      id: o.id,
      user_id: o.user_id,
      buyer: {
        firstName: o.firstName,
        lastName: o.lastName,
        documentId: o.documentId,
        phone: o.phone,
        address: o.address,
      },
      payment: o.payment,
      items: JSON.parse(o.items),
      total: o.total,
      status: o.status,
      createdAt: o.createdAt
    }));
    res.json(orders);
  } catch (error) {
    console.error('Error al cargar pedidos:', error);
    res.status(500).json({ error: 'No se pudieron cargar los pedidos.' });
  }
});

// GET order by ID (Admin only)
app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const o = result.rows[0];
    if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });

    res.json({
      id: o.id,
      user_id: o.user_id,
      buyer: {
        firstName: o.firstName,
        lastName: o.lastName,
        documentId: o.documentId,
        phone: o.phone,
        address: o.address,
      },
      payment: o.payment,
      items: JSON.parse(o.items),
      total: o.total,
      status: o.status,
      createdAt: o.createdAt
    });
  } catch (error) {
    console.error('Error al leer pedido:', error);
    res.status(500).json({ error: 'Error al leer el pedido.' });
  }
});

// CREATE order (Guest or registered user) - atomic transaction
app.post('/api/orders', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.buyer || !payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      return res.status(400).json({ error: 'Los datos del cliente y los productos son obligatorios.' });
    }

    const { firstName, lastName, phone, documentId } = payload.buyer;
    if (!firstName || !lastName || !phone || !documentId) {
      return res.status(400).json({ error: 'El nombre, apellido, teléfono y documento de identidad del comprador son obligatorios.' });
    }
    if (!PHONE_REGEX.test(String(phone).trim())) {
      return res.status(400).json({ error: 'El teléfono del comprador debe contener únicamente números y tener entre 7 y 15 dígitos.' });
    }
    if (!DOCUMENT_REGEX.test(String(documentId).trim())) {
      return res.status(400).json({ error: 'El documento/cédula del comprador debe contener únicamente números y tener entre 5 y 15 dígitos.' });
    }

    const total = Number(payload.total || payload.items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty || 0)), 0));
    const orderId = generateOrderId();

    // Execute atomic PostgreSQL transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemsToUpdate = [];

      for (const item of payload.items) {
        const productResult = await client.query('SELECT * FROM products WHERE id = $1', [String(item.id)]);
        const product = productResult.rows[0];
        if (!product) {
          throw new Error(`El producto "${item.name || item.id}" ya no existe.`);
        }
        if (typeof product.stock === 'number') {
          if (product.stock < Number(item.qty)) {
            throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}, solicitado: ${item.qty}`);
          }
          itemsToUpdate.push({ product, qty: Number(item.qty) });
        }
      }

      // Descontar stock en base de datos
      for (const update of itemsToUpdate) {
        const newStock = update.product.stock - update.qty;
        await client.query('UPDATE products SET stock = $1 WHERE id = $2', [newStock, update.product.id]);
      }

      await client.query(
        `INSERT INTO orders (id, user_id, "firstName", "lastName", "documentId", phone, address, payment, items, total, status, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          orderId,
          payload.user_id ? String(payload.user_id) : null,
          String(firstName).trim(),
          String(lastName).trim(),
          String(documentId).trim(),
          String(phone).trim(),
          String(payload.buyer.address || '').trim(),
          String(payload.payment || 'desconocido'),
          JSON.stringify(payload.items.map(item => ({
            id: String(item.id),
            name: String(item.name),
            price: Number(item.price),
            qty: Number(item.qty),
          }))),
          total,
          'pending',
          new Date().toISOString()
        ]
      );

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: txError.message });
    } finally {
      client.release();
    }

    const order = {
      id: orderId,
      user_id: payload.user_id ? String(payload.user_id) : null,
      buyer: {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        documentId: String(documentId).trim(),
        phone: String(phone).trim(),
        address: String(payload.buyer.address || '').trim(),
      },
      payment: String(payload.payment || 'desconocido'),
      items: payload.items.map(item => ({
        id: String(item.id),
        name: String(item.name),
        price: Number(item.price),
        qty: Number(item.qty),
      })),
      total,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    res.status(201).json(order);
  } catch (error) {
    console.error('Error al crear pedido:', error);
    res.status(500).json({ error: 'No se pudo crear el pedido.' });
  }
});

// UPDATE order status (Admin only)
app.put('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Pedido no encontrado.' });

    const payload = req.body;
    const updatedStatus = payload.status != null ? String(payload.status).trim() : existing.status;

    if (payload.status != null && !VALID_STATUSES.includes(updatedStatus)) {
      return res.status(400).json({ error: 'El estado del pedido no es válido.' });
    }

    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [updatedStatus, req.params.id]);

    res.json({
      id: existing.id,
      user_id: existing.user_id,
      buyer: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        documentId: existing.documentId,
        phone: existing.phone,
        address: existing.address,
      },
      payment: existing.payment,
      items: JSON.parse(existing.items),
      total: existing.total,
      status: updatedStatus,
      createdAt: existing.createdAt
    });
  } catch (error) {
    console.error('Error al actualizar pedido:', error);
    res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
  }
});

// DELETE order (Admin only)
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Pedido no encontrado.' });

    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);

    res.json({ deleted: existing });
  } catch (error) {
    console.error('Error al eliminar pedido:', error);
    res.status(500).json({ error: 'No se pudo eliminar el pedido.' });
  }
});

// ==========================================================================
// CLIENTS ADMIN CRUD ENDPOINTS
// ==========================================================================

// GET all users (Admin only)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, "firstName", "lastName", phone, address, "documentId" FROM users`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al cargar clientes:', error);
    res.status(500).json({ error: 'No se pudieron cargar los clientes.' });
  }
});

// CREATE user (Admin only)
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, address, documentId } = req.body || {};
    if (!email || !password || !firstName || !lastName || !phone || !documentId) {
      return res.status(400).json({ error: 'Todos los campos obligatorios (*) deben completarse.' });
    }

    const emailKey = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(emailKey)) {
      return res.status(400).json({ error: 'Formato de correo electrónico no válido.' });
    }
    if (!PHONE_REGEX.test(phone.trim())) {
      return res.status(400).json({ error: 'El teléfono debe contener únicamente números y tener entre 7 y 15 dígitos.' });
    }
    if (!DOCUMENT_REGEX.test(documentId.trim())) {
      return res.status(400).json({ error: 'El documento/cédula debe contener únicamente números y tener entre 5 y 15 dígitos.' });
    }
    if (password.trim().length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const checkResult = await pool.query('SELECT id FROM users WHERE email = $1', [emailKey]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una cuenta registrada con este correo electrónico.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const userId = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);

    await pool.query(
      `INSERT INTO users (id, email, password, "firstName", "lastName", "documentId", phone, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, emailKey, hash, firstName.trim(), lastName.trim(),
       documentId.trim(), phone.trim(), (address || '').trim()]
    );

    res.status(201).json({ id: userId, email: emailKey, firstName, lastName, phone, address, documentId });
  } catch (error) {
    console.error('Error al crear cliente:', error);
    res.status(500).json({ error: 'Error al registrar el cliente.' });
  }
});

// UPDATE user (Admin only)
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const { email, password, firstName, lastName, phone, address, documentId } = req.body || {};
    if (!email || !firstName || !lastName || !phone || !documentId) {
      return res.status(400).json({ error: 'Email, nombre, apellido, teléfono y documento son requeridos.' });
    }

    const emailKey = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(emailKey)) {
      return res.status(400).json({ error: 'Formato de correo electrónico no válido.' });
    }
    if (!PHONE_REGEX.test(phone.trim())) {
      return res.status(400).json({ error: 'El teléfono debe contener únicamente números y tener entre 7 y 15 dígitos.' });
    }
    if (!DOCUMENT_REGEX.test(documentId.trim())) {
      return res.status(400).json({ error: 'El documento/cédula debe contener únicamente números y tener entre 5 y 15 dígitos.' });
    }
    if (password && password.trim() !== '' && password.trim().length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    // Check email uniqueness if email changed
    if (emailKey !== existing.email) {
      const checkResult = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [emailKey, req.params.id]
      );
      if (checkResult.rows.length > 0) {
        return res.status(400).json({ error: 'Ya existe otra cuenta registrada con este correo electrónico.' });
      }
    }

    let hash = existing.password;
    if (password && password.trim() !== '') {
      hash = await bcrypt.hash(password, 10);
    }

    await pool.query(
      `UPDATE users
       SET email = $1, password = $2, "firstName" = $3, "lastName" = $4, phone = $5, address = $6, "documentId" = $7
       WHERE id = $8`,
      [emailKey, hash, firstName.trim(), lastName.trim(),
       phone.trim(), (address || '').trim(), documentId.trim(), req.params.id]
    );

    res.json({ id: req.params.id, email: emailKey, firstName, lastName, phone, address, documentId });
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ error: 'No se pudo actualizar el cliente.' });
  }
});

// DELETE user (Admin only)
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    res.json({ deleted: existing });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({ error: 'No se pudo eliminar el cliente.' });
  }
});

// ==========================================================================
// REVIEWS ADMIN CRUD ENDPOINTS
// ==========================================================================

// GET all reviews (Admin only)
app.get('/api/admin/reviews', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, p.name as "productName"
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.id
      ORDER BY r."createdAt" DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al cargar reviews:', error);
    res.status(500).json({ error: 'No se pudieron cargar las opiniones.' });
  }
});

// CREATE review (Admin only)
app.post('/api/admin/reviews', requireAdmin, async (req, res) => {
  try {
    const { product_id, author, rating, comment } = req.body || {};
    if (!product_id || !author || rating == null) {
      return res.status(400).json({ error: 'El producto, el autor y la calificación son obligatorios.' });
    }

    const checkResult = await pool.query('SELECT id FROM products WHERE id = $1', [product_id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    const createdAt = new Date().toISOString();
    const newRating = Math.max(1, Math.min(5, Number(rating)));
    const newAuthor = String(author).trim();
    const newComment = String(comment || '').trim();

    await pool.query(
      `INSERT INTO reviews (product_id, author, rating, comment, "createdAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [product_id, newAuthor, newRating, newComment, createdAt]
    );

    res.status(201).json({ product_id, author: newAuthor, rating: newRating, comment: newComment, createdAt });
  } catch (error) {
    console.error('Error al crear review (admin):', error);
    res.status(500).json({ error: 'No se pudo registrar la opinión.' });
  }
});

// UPDATE review (Admin only)
app.put('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Opinión no encontrada.' });

    const { author, rating, comment } = req.body || {};
    if (!author || rating == null) {
      return res.status(400).json({ error: 'El autor y la calificación son obligatorios.' });
    }

    const newRating = Math.max(1, Math.min(5, Number(rating)));
    const newAuthor = String(author).trim();
    const newComment = String(comment || '').trim();

    await pool.query(
      `UPDATE reviews SET author = $1, rating = $2, comment = $3 WHERE id = $4`,
      [newAuthor, newRating, newComment, req.params.id]
    );

    res.json({
      id: Number(req.params.id),
      product_id: existing.product_id,
      author: newAuthor,
      rating: newRating,
      comment: newComment,
      createdAt: existing.createdAt
    });
  } catch (error) {
    console.error('Error al actualizar review:', error);
    res.status(500).json({ error: 'No se pudo actualizar la opinión.' });
  }
});

// DELETE review (Admin only)
app.delete('/api/admin/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const existingResult = await pool.query('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Opinión no encontrada.' });

    await pool.query('DELETE FROM reviews WHERE id = $1', [req.params.id]);

    res.json({ deleted: existing });
  } catch (error) {
    console.error('Error al eliminar review:', error);
    res.status(500).json({ error: 'No se pudo eliminar la opinión.' });
  }
});

// ==========================================================================
// INVOICES (BILLING) ENDPOINTS
// ==========================================================================

// Auto-generate invoice number FAC-YYYY-NNN
async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
    [`FAC-${year}-%`]
  );
  if (result.rows.length === 0) return `FAC-${year}-001`;
  const last = result.rows[0].number;
  const lastNum = parseInt(last.split('-')[2], 10);
  return `FAC-${year}-${String(lastNum + 1).padStart(3, '0')}`;
}

function formatInvoiceRow(inv) {
  return {
    id: inv.id,
    order_id: inv.order_id,
    number: inv.number,
    status: inv.status,
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: inv.total,
    notes: inv.notes,
    createdAt: inv.createdAt,
    paidAt: inv.paidAt || null,
    order: inv.order_data ? JSON.parse(inv.order_data) : null
  };
}

// GET all invoices with order details (Admin only)
app.get('/api/invoices', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*,
        json_build_object(
          'firstName', o."firstName",
          'lastName', o."lastName",
          'documentId', o."documentId",
          'phone', o.phone,
          'address', o.address,
          'payment', o.payment,
          'items', o.items::text,
          'status', o.status
        )::text AS order_data
      FROM invoices i
      LEFT JOIN orders o ON i.order_id = o.id
      ORDER BY i."createdAt" DESC
    `);
    res.json(result.rows.map(formatInvoiceRow));
  } catch (error) {
    console.error('Error al cargar facturas:', error);
    res.status(500).json({ error: 'No se pudieron cargar las facturas.' });
  }
});

// GET invoice stats by period (Admin only)
app.get('/api/invoices/stats', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    let whereClause = '';
    const params = [];
    if (from && to) {
      whereClause = `WHERE "createdAt" >= $1 AND "createdAt" <= $2`;
      params.push(from, to + 'T23:59:59.999Z');
    } else if (from) {
      whereClause = `WHERE "createdAt" >= $1`;
      params.push(from);
    }
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(total), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) AS paid_revenue,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0) AS pending_revenue,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total ELSE 0 END), 0) AS cancelled_revenue,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_count
      FROM invoices ${whereClause}
    `, params);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener estadísticas de facturas:', error);
    res.status(500).json({ error: 'No se pudieron obtener las estadísticas.' });
  }
});

// GET invoice by ID (Admin only)
app.get('/api/invoices/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*,
        json_build_object(
          'firstName', o."firstName",
          'lastName', o."lastName",
          'documentId', o."documentId",
          'phone', o.phone,
          'address', o.address,
          'payment', o.payment,
          'items', o.items::text,
          'status', o.status
        )::text AS order_data
      FROM invoices i
      LEFT JOIN orders o ON i.order_id = o.id
      WHERE i.id = $1
    `, [req.params.id]);
    const inv = result.rows[0];
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });
    res.json(formatInvoiceRow(inv));
  } catch (error) {
    console.error('Error al leer factura:', error);
    res.status(500).json({ error: 'Error al leer la factura.' });
  }
});

// CREATE invoice from order (Admin only)
app.post('/api/invoices', requireAdmin, async (req, res) => {
  try {
    const { order_id, tax_percent, notes } = req.body || {};
    if (!order_id) return res.status(400).json({ error: 'El ID del pedido es obligatorio.' });

    if (tax_percent != null) {
      const parsedTax = Number(tax_percent);
      if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
        return res.status(400).json({ error: 'El porcentaje de IVA debe ser un número entre 0 y 100.' });
      }
    }

    if (notes && (typeof notes !== 'string' || notes.trim().length > 500)) {
      return res.status(400).json({ error: 'Las notas no pueden exceder los 500 caracteres.' });
    }

    // Check order exists
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });

    // Avoid duplicate invoices for same order
    const dupCheck = await pool.query('SELECT id FROM invoices WHERE order_id = $1', [order_id]);
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe una factura para este pedido.' });
    }

    const taxRate = Math.max(0, Math.min(100, Number(tax_percent || 0)));
    const subtotal = Number(order.total);
    const tax = parseFloat((subtotal * taxRate / 100).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));
    const invoiceNumber = await generateInvoiceNumber();
    const invoiceId = 'inv-' + Date.now().toString(36) + Math.floor(Math.random() * 9999).toString(36);
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO invoices (id, order_id, number, status, subtotal, tax, total, notes, "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [invoiceId, order_id, invoiceNumber, 'pending', subtotal, tax, total, notes || '', createdAt]
    );

    res.status(201).json({
      id: invoiceId, order_id, number: invoiceNumber,
      status: 'pending', subtotal, tax, total,
      notes: notes || '', createdAt, paidAt: null
    });
  } catch (error) {
    console.error('Error al crear factura:', error);
    res.status(500).json({ error: 'No se pudo crear la factura.' });
  }
});

// UPDATE invoice status (Admin only)
app.put('/api/invoices/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    const inv = result.rows[0];
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });

    const { status, notes } = req.body || {};
    const validStatuses = ['pending', 'paid', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado de factura no válido.' });
    }

    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string' || notes.trim().length > 500) {
        return res.status(400).json({ error: 'Las notas no pueden exceder los 500 caracteres.' });
      }
    }

    const newStatus = status || inv.status;
    const newNotes = notes !== undefined ? String(notes).trim() : inv.notes;
    const paidAt = newStatus === 'paid' && inv.status !== 'paid'
      ? new Date().toISOString()
      : (newStatus === 'paid' ? inv.paidAt : null);

    await pool.query(
      `UPDATE invoices SET status = $1, notes = $2, "paidAt" = $3 WHERE id = $4`,
      [newStatus, newNotes, paidAt, req.params.id]
    );

    res.json({ ...inv, status: newStatus, notes: newNotes, paidAt });
  } catch (error) {
    console.error('Error al actualizar factura:', error);
    res.status(500).json({ error: 'No se pudo actualizar la factura.' });
  }
});

// DELETE invoice (Admin only)
app.delete('/api/invoices/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    const inv = result.rows[0];
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });
    await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    res.json({ deleted: inv });
  } catch (error) {
    console.error('Error al eliminar factura:', error);
    res.status(500).json({ error: 'No se pudo eliminar la factura.' });
  }
});

// CREATE direct sale (POS) (Admin only)
app.post('/api/orders/direct', requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const { buyer, items, payments, tax_percent, notes } = payload;

    // 1. Items array basic validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe agregar al menos un producto a la venta.' });
    }

    // 2. Tax percent range and numeric validation
    if (tax_percent != null) {
      const parsedTax = Number(tax_percent);
      if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
        return res.status(400).json({ error: 'El porcentaje de IVA debe ser un número entre 0 y 100.' });
      }
    }

    // 3. Buyer fields length and format validations (optional fields)
    if (buyer) {
      if (buyer.firstName && (typeof buyer.firstName !== 'string' || buyer.firstName.trim().length > 50)) {
        return res.status(400).json({ error: 'El nombre del cliente no puede exceder los 50 caracteres.' });
      }
      if (buyer.lastName && (typeof buyer.lastName !== 'string' || buyer.lastName.trim().length > 50)) {
        return res.status(400).json({ error: 'El apellido del cliente no puede exceder los 50 caracteres.' });
      }
      if (buyer.documentId && buyer.documentId.trim() !== '') {
        if (typeof buyer.documentId !== 'string' || !DOCUMENT_REGEX.test(buyer.documentId.trim())) {
          return res.status(400).json({ error: 'La cédula del cliente debe contener únicamente números y tener entre 5 y 15 dígitos.' });
        }
      }
      if (buyer.phone && buyer.phone.trim() !== '') {
        if (typeof buyer.phone !== 'string' || !PHONE_REGEX.test(buyer.phone.trim())) {
          return res.status(400).json({ error: 'El teléfono del cliente debe contener únicamente números y tener entre 7 y 15 dígitos.' });
        }
      }
      if (buyer.address && (typeof buyer.address !== 'string' || buyer.address.trim().length > 150)) {
        return res.status(400).json({ error: 'La dirección no puede exceder los 150 caracteres.' });
      }
    }

    // 4. Notes validation
    if (notes && (typeof notes !== 'string' || notes.trim().length > 500)) {
      return res.status(400).json({ error: 'Las notas no pueden exceder los 500 caracteres.' });
    }

    // 5. Payments list validation
    if (payments) {
      if (!Array.isArray(payments)) {
        return res.status(400).json({ error: 'El listado de pagos debe ser un arreglo válido.' });
      }
      const validMethods = ['Efectivo', 'Nequi', 'Transferencia'];
      for (const p of payments) {
        if (!p.method || !validMethods.includes(p.method)) {
          return res.status(400).json({ error: `Método de pago no válido: "${p.method}". Permitidos: ${validMethods.join(', ')}` });
        }
        const amt = Number(p.amount);
        if (isNaN(amt) || amt < 0) {
          return res.status(400).json({ error: 'El monto de pago debe ser un número mayor o igual a cero.' });
        }
      }
    }

    // 6. Items structure & types validation
    for (const item of items) {
      if (!item.id || typeof item.id !== 'string') {
        return res.status(400).json({ error: 'Cada artículo de la venta debe tener un ID de producto válido.' });
      }
      const qty = Number(item.qty);
      if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
        return res.status(400).json({ error: `La cantidad para el producto con ID "${item.id}" debe ser un entero positivo.` });
      }
      const price = Number(item.price);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ error: `El precio para el producto con ID "${item.id}" debe ser un número válido.` });
      }
    }

    const firstName = (buyer && buyer.firstName) ? String(buyer.firstName).trim() : 'Cliente';
    const lastName = (buyer && buyer.lastName) ? String(buyer.lastName).trim() : 'de mostrador';
    const documentId = (buyer && buyer.documentId) ? String(buyer.documentId).trim() : '';
    const phone = (buyer && buyer.phone) ? String(buyer.phone).trim() : '';
    const address = (buyer && buyer.address) ? String(buyer.address).trim() : 'Venta Directa';

    const subtotal = Number(items.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty || 0)), 0));
    const taxRate = Math.max(0, Math.min(100, Number(tax_percent || 0)));
    const tax = parseFloat((subtotal * taxRate / 100).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));

    // Process payments details
    let paymentText = '';
    let totalPaid = 0;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      const paymentParts = [];
      for (const p of payments) {
        const amt = Number(p.amount || 0);
        if (amt > 0) {
          totalPaid += amt;
          paymentParts.push(`${p.method}: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amt)}`);
        }
      }
      if (paymentParts.length > 0) {
        paymentText = 'Pago Mixto (' + paymentParts.join(', ') + ')';
      } else {
        paymentText = 'Pendiente';
      }
    } else {
      paymentText = 'Pendiente';
    }

    // Determine status
    const isPaid = totalPaid >= total;
    const invoiceStatus = isPaid ? 'paid' : 'pending';
    const paidAt = isPaid ? new Date().toISOString() : null;

    const orderId = generateOrderId();
    const invoiceId = 'inv-' + Date.now().toString(36) + Math.floor(Math.random() * 9999).toString(36);
    const createdAt = new Date().toISOString();

    // Prepare note with payment breakdown
    let finalNotes = notes || '';
    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    const paymentBreakdown = `[Detalle Pago: Total: ${formatter.format(total)} | Pagado: ${formatter.format(totalPaid)} | Resta: ${formatter.format(Math.max(0, total - totalPaid))}]`;
    if (finalNotes) {
      finalNotes = `${finalNotes}\n${paymentBreakdown}`;
    } else {
      finalNotes = paymentBreakdown;
    }

    // Connect to pg and start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const itemsToUpdate = [];
      for (const item of items) {
        const productResult = await client.query('SELECT * FROM products WHERE id = $1', [String(item.id)]);
        const product = productResult.rows[0];
        if (!product) {
          throw new Error(`El producto "${item.name || item.id}" no existe.`);
        }
        if (typeof product.stock === 'number') {
          if (product.stock < Number(item.qty)) {
            throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}, solicitado: ${item.qty}`);
          }
          itemsToUpdate.push({ product, qty: Number(item.qty) });
        }
      }

      // Update product stock
      for (const update of itemsToUpdate) {
        const newStock = update.product.stock - update.qty;
        await client.query('UPDATE products SET stock = $1 WHERE id = $2', [newStock, update.product.id]);
      }

      // Insert Order
      await client.query(
        `INSERT INTO orders (id, user_id, "firstName", "lastName", "documentId", phone, address, payment, items, total, status, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          orderId,
          null,
          firstName,
          lastName,
          documentId,
          phone,
          address,
          paymentText,
          JSON.stringify(items.map(item => ({
            id: String(item.id),
            name: String(item.name),
            price: Number(item.price),
            qty: Number(item.qty)
          }))),
          total,
          'delivered', // Venta directa se entrega inmediatamente
          createdAt
        ]
      );

      // Generate Invoice number inside Tx
      const year = new Date(createdAt).getFullYear();
      const numResult = await client.query(
        `SELECT number FROM invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
        [`FAC-${year}-%`]
      );
      let invoiceNumber = `FAC-${year}-001`;
      if (numResult.rows.length > 0) {
        const last = numResult.rows[0].number;
        const lastNum = parseInt(last.split('-')[2], 10);
        invoiceNumber = `FAC-${year}-${String(lastNum + 1).padStart(3, '0')}`;
      }

      // Insert Invoice
      await client.query(
        `INSERT INTO invoices (id, order_id, number, status, subtotal, tax, total, notes, "createdAt", "paidAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [invoiceId, orderId, invoiceNumber, invoiceStatus, subtotal, tax, total, finalNotes, createdAt, paidAt]
      );

      await client.query('COMMIT');

      res.status(201).json({
        order: {
          id: orderId,
          buyer: { firstName, lastName, documentId, phone, address },
          payment: paymentText,
          items,
          total,
          status: 'delivered',
          createdAt
        },
        invoice: {
          id: invoiceId,
          order_id: orderId,
          number: invoiceNumber,
          status: invoiceStatus,
          subtotal,
          tax,
          total,
          notes: finalNotes,
          createdAt,
          paidAt
        }
      });

    } catch (txError) {
      await client.query('ROLLBACK');
      console.error('Error en transacción de venta directa:', txError);
      return res.status(400).json({ error: txError.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al registrar venta directa:', error);
    res.status(500).json({ error: 'No se pudo registrar la venta directa.' });
  }
});

// Launch server
async function start() {
  await ensureUploadDir();
  await setupDatabase();
  await initAdminPassword();
  await migrateData();

  app.listen(port, () => {
    console.log(`Servidor iniciado en http://localhost:${port}`);
  });
}

start().catch(err => {
  console.error('Fallo al iniciar el servidor:', err);
  process.exit(1);
});
