function formatCurrency(n){return '$'+Number(n).toFixed(2)}
const cartCountEl = document.getElementById('cartCount');
let checkoutItems = JSON.parse(localStorage.getItem('checkoutItems')||'[]');
if(!checkoutItems || checkoutItems.length===0){alert('No hay items seleccionados para checkout');location.href='cart.html'}

function renderSummary(){
  const container = document.getElementById('orderSummary');
  const lines = checkoutItems.map(i=>`<div>${i.name} x ${i.qty} — ${formatCurrency(i.price*i.qty)}</div>`).join('');
  const total = checkoutItems.reduce((s,i)=>s+i.price*i.qty,0).toFixed(2);
  container.innerHTML = `<div>${lines}<hr/><strong>Total: ${formatCurrency(total)}</strong></div>`;
  cartCountEl.textContent = checkoutItems.reduce((s,i)=>s+i.qty,0);
}

document.getElementById('orderForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const buyer = {
    firstName: fd.get('firstName'),
    lastName: fd.get('lastName'),
    phone: fd.get('phone'),
    address: fd.get('address')
  };
  const payment = fd.get('payment');
  const total = checkoutItems.reduce((s,i)=>s+i.price*i.qty,0).toFixed(2);
  const orderPayload = {
    buyer,
    payment,
    items: checkoutItems.map(i=>({ id:i.id, name:i.name, price:i.price, qty:i.qty })),
    total: Number(total)
  };

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'No se pudo guardar el pedido.');
    }
    const order = await response.json();

    const itemsText = checkoutItems.map(i=>`${i.name} x${i.qty} - ${formatCurrency(i.price*i.qty)}`).join('%0A');
    const paymentText = payment==='nequi' ? 'Pago con Nequi (enviar comprobante al WhatsApp)' : 'Pago contra entrega (pagar al recibir)';
    const message = encodeURIComponent(`Nuevo pedido\nPedido ID: ${order.id}\nCliente: ${buyer.firstName} ${buyer.lastName}\nTel: ${buyer.phone}\nDirección: ${buyer.address || '-'}\nMétodo de pago: ${paymentText}\n\nProductos:\n${itemsText}\n\nTotal: ${formatCurrency(total)}`);
    const number = typeof PHONE !== 'undefined' ? PHONE : '573022880520';
    const url = `https://wa.me/${number}?text=${message}`;

    let cart = JSON.parse(localStorage.getItem('cart')||'[]');
    const boughtIds = checkoutItems.map(i=>i.id);
    cart = cart.filter(i=>!boughtIds.includes(i.id));
    localStorage.setItem('cart',JSON.stringify(cart));
    localStorage.removeItem('checkoutItems');
    window.open(url,'_blank');
    alert(`Pedido creado con ID ${order.id} y enviado a WhatsApp.`);
    location.href='index.html';
  } catch (err) {
    alert(err.message);
  }
});

renderSummary();
