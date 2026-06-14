# Tienda simple

Proyecto de ejemplo: tienda para vender maquillaje, perfumería y tecnología.

## Estructura del proyecto

- `backend/`: servidor Express, datos y API REST.
- `frontend/`: archivos HTML, CSS, JavaScript y assets del sitio.

## Cómo ejecutar

1. Abre una terminal en la carpeta `backend`:

```bash
cd pagina/backend
```

2. Instala dependencias:

```bash
npm install
```

3. Inicia el servidor:

```bash
npm start
```

4. Abre en el navegador:

http://localhost:3000/

5. Administra productos en:

http://localhost:3000/admin.html

6. Revisa pedidos en:

http://localhost:3000/admin-orders.html

## Recomendación

No uses `Live Server` ni abras los archivos `html` directamente: este proyecto necesita el backend para que el frontend funcione correctamente.

## Qué puedes hacer

Desde el panel de administración puedes:
- crear nuevos productos
- editar productos existentes
- eliminar productos
- buscar por nombre o categoría
- ver pedidos recibidos y cambiar el estado de cada pedido

Los cambios se guardan en `backend/products.json` y `backend/orders.json`.
