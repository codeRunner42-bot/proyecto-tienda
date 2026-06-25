// ============================================================
// invoices.js — Sistema de Facturación - Ale Beauty Art
// Datos del negocio: Ale Beauty Art | CC 1083433594
// Dirección: Carrera 29 #17-17, Barranquilla | Tel: 3146093646
// ============================================================

const BUSINESS_INFO = {
  name: 'Ale Beauty Art',
  owner: 'Alejandra Owens',
  document: 'CC 1083433594',
  address: 'Carrera 29 #17-17',
  city: 'Barranquilla, Colombia',
  phone: '314 609 3646',
};

// ── State ──────────────────────────────────────────────────
let allInvoices = [];
let currentInvoiceData = null;

// ── DOM refs ───────────────────────────────────────────────
const invoicesTableBody = document.getElementById('invoicesTableBody');
const invoiceModal      = document.getElementById('invoiceModal');
const invoicePreview    = document.getElementById('invoicePreview');
const invoiceFormWrapper= document.getElementById('invoiceFormWrapper');
const invoiceForm       = document.getElementById('invoiceForm');
const invOrderSelect    = document.getElementById('invOrderSelect');
const newInvoiceBtn     = document.getElementById('newInvoiceBtn');
const cancelInvoiceForm = document.getElementById('cancelInvoiceForm');
const closeModalBtn     = document.getElementById('closeInvoiceModal');
const downloadPdfBtn    = document.getElementById('downloadPdfBtn');
const printInvoiceBtn   = document.getElementById('printInvoiceBtn');
const invFilterBtn      = document.getElementById('invFilterBtn');
const invClearFilterBtn = document.getElementById('invClearFilterBtn');
const invFilterFrom     = document.getElementById('invFilterFrom');
const invFilterTo       = document.getElementById('invFilterTo');

// ── Helpers ────────────────────────────────────────────────
function statusLabel(s) {
  if (s === 'paid')      return { text: 'Pagada',    color: '#27ae60', bg: '#eafaf1' };
  if (s === 'cancelled') return { text: 'Anulada',   color: '#e74c3c', bg: '#fdf0ee' };
  return                        { text: 'Pendiente', color: '#d4af37', bg: '#fefbec' };
}

function paymentLabel(p) {
  if (p === 'nequi') return 'Nequi';
  if (p === 'contraentrega') return 'Contra entrega';
  return p || '—';
}

// ── Load invoices ──────────────────────────────────────────
async function loadInvoices(from, to) {
  from = from || '';
  to   = to   || '';
  try {
    const invoiceRes = await fetch('/api/invoices', { headers: authHeaders() });
    if (!invoiceRes.ok) throw new Error('No se pudieron cargar las facturas.');
    allInvoices = await invoiceRes.json();

    let filtered = allInvoices;
    if (from) filtered = filtered.filter(function(inv){ return inv.createdAt >= from; });
    if (to)   filtered = filtered.filter(function(inv){ return inv.createdAt <= to + 'T23:59:59.999Z'; });

    renderInvoicesTable(filtered);
    loadInvoiceStats(from, to);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Stats ──────────────────────────────────────────────────
async function loadInvoiceStats(from, to) {
  from = from || '';
  to   = to   || '';
  try {
    let url = '/api/invoices/stats';
    const params = [];
    if (from) params.push('from=' + encodeURIComponent(from));
    if (to)   params.push('to='   + encodeURIComponent(to));
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return;
    const s = await res.json();

    document.getElementById('statInvTotal').textContent     = formatCurrency(Number(s.total_revenue)     || 0);
    document.getElementById('statInvPaid').textContent      = formatCurrency(Number(s.paid_revenue)      || 0);
    document.getElementById('statInvPending').textContent   = formatCurrency(Number(s.pending_revenue)   || 0);
    document.getElementById('statInvCancelled').textContent = formatCurrency(Number(s.cancelled_revenue) || 0);
  } catch (_) {}
}

// ── Render table ───────────────────────────────────────────
function renderInvoicesTable(invoices) {
  if (!invoicesTableBody) return;
  if (!invoices || invoices.length === 0) {
    invoicesTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">No hay facturas generadas.</td></tr>';
    return;
  }
  invoicesTableBody.innerHTML = invoices.map(function(inv) {
    const sl = statusLabel(inv.status);
    const order = inv.order || {};
    const clientName = order.firstName
      ? escapeHTML(order.firstName + ' ' + (order.lastName || ''))
      : '—';
    const markPaidBtn = inv.status === 'pending'
      ? '<button class="btn btn-primary markPaidBtn" style="padding:5px 10px;font-size:0.8rem;background:#27ae60;">✓ Pagar</button>'
      : '';
    const cancelBtn = inv.status !== 'cancelled'
      ? '<button class="btn btn-secondary cancelInvBtn" style="padding:5px 10px;font-size:0.8rem;">Anular</button>'
      : '';
    return '<tr data-inv-id="' + inv.id + '">' +
      '<td><strong style="color:var(--accent);">' + inv.number + '</strong></td>' +
      '<td style="font-size:0.8rem;color:var(--text-muted);">' + inv.order_id + '</td>' +
      '<td>' + clientName + '</td>' +
      '<td>' + formatCurrency(inv.subtotal) + '</td>' +
      '<td>' + (inv.tax > 0 ? formatCurrency(inv.tax) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
      '<td><strong style="color:var(--accent);">' + formatCurrency(inv.total) + '</strong></td>' +
      '<td><span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;color:' + sl.color + ';background:' + sl.bg + ';">' + sl.text + '</span></td>' +
      '<td style="font-size:0.82rem;">' + new Date(inv.createdAt).toLocaleDateString('es-CO') + '</td>' +
      '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<button class="btn btn-secondary previewInvBtn" style="padding:5px 10px;font-size:0.8rem;">👁 Ver</button>' +
        markPaidBtn + cancelBtn +
        '<button class="btn btn-danger deleteInvBtn" style="padding:5px 10px;font-size:0.8rem;">🗑</button>' +
      '</td></tr>';
  }).join('');
}

// ── Build invoice HTML preview ─────────────────────────────
function buildInvoiceHTML(inv) {
  const order = inv.order || {};
  let items = [];
  try { items = JSON.parse(order.items || '[]'); } catch (_) {}

  const sl = statusLabel(inv.status);
  const paidLine = inv.paidAt
    ? '<p style="margin:2px 0;font-size:0.85rem;"><strong>Fecha de pago:</strong> ' + new Date(inv.paidAt).toLocaleDateString('es-CO') + '</p>'
    : '';

  const itemsRows = items.map(function(item) {
    return '<tr>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #f0e6ed;">' + escapeHTML(item.name) + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #f0e6ed;text-align:center;">' + item.qty + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #f0e6ed;text-align:right;">' + formatCurrency(item.price) + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #f0e6ed;text-align:right;font-weight:700;">' + formatCurrency(item.price * item.qty) + '</td>' +
    '</tr>';
  }).join('');

  const taxRow = inv.tax > 0
    ? '<tr><td colspan="3" style="padding:6px 12px;text-align:right;color:#777;">IVA:</td><td style="padding:6px 12px;text-align:right;">' + formatCurrency(inv.tax) + '</td></tr>'
    : '';

  const notesBlock = inv.notes
    ? '<div style="background:#f8f8f8;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:0.85rem;color:#555;"><strong>Notas:</strong> ' + escapeHTML(inv.notes) + '</div>'
    : '';

  return '<div id="invoicePrintArea" style="font-family:\'Outfit\',sans-serif;color:#1a1a2e;max-width:680px;margin:0 auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #8b1a4a;">' +
      '<div>' +
        '<h1 style="font-size:2rem;font-weight:900;color:#8b1a4a;margin:0 0 4px;">' + BUSINESS_INFO.name + '</h1>' +
        '<p style="margin:2px 0;font-size:0.85rem;color:#555;">' + BUSINESS_INFO.document + '</p>' +
        '<p style="margin:2px 0;font-size:0.85rem;color:#555;">' + BUSINESS_INFO.address + '</p>' +
        '<p style="margin:2px 0;font-size:0.85rem;color:#555;">' + BUSINESS_INFO.city + '</p>' +
        '<p style="margin:2px 0;font-size:0.85rem;color:#555;">Tel: ' + BUSINESS_INFO.phone + '</p>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="background:#8b1a4a;color:#fff;padding:12px 20px;border-radius:10px;margin-bottom:10px;">' +
          '<div style="font-size:0.75rem;opacity:0.85;text-transform:uppercase;letter-spacing:1px;">Factura</div>' +
          '<div style="font-size:1.4rem;font-weight:900;">' + inv.number + '</div>' +
        '</div>' +
        '<p style="margin:2px 0;font-size:0.82rem;color:#555;">Fecha: <strong>' + new Date(inv.createdAt).toLocaleDateString('es-CO') + '</strong></p>' +
        paidLine +
        '<span style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:20px;font-size:0.78rem;font-weight:800;color:' + sl.color + ';background:' + sl.bg + ';border:1.5px solid ' + sl.color + ';">' + sl.text + '</span>' +
      '</div>' +
    '</div>' +
    '<div style="background:#fdf2f6;border-radius:10px;padding:16px 20px;margin-bottom:24px;">' +
      '<h3 style="margin:0 0 10px;font-size:0.85rem;text-transform:uppercase;letter-spacing:1px;color:#8b1a4a;">Datos del Cliente</h3>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
        '<p style="margin:2px 0;font-size:0.88rem;"><strong>Nombre:</strong> ' + escapeHTML((order.firstName||'') + ' ' + (order.lastName||'')) + '</p>' +
        '<p style="margin:2px 0;font-size:0.88rem;"><strong>Cédula:</strong> ' + escapeHTML(order.documentId||'—') + '</p>' +
        '<p style="margin:2px 0;font-size:0.88rem;"><strong>Teléfono:</strong> ' + escapeHTML(order.phone||'—') + '</p>' +
        '<p style="margin:2px 0;font-size:0.88rem;"><strong>Pago:</strong> ' + paymentLabel(order.payment) + '</p>' +
        '<p style="margin:2px 0;font-size:0.88rem;grid-column:1/-1;"><strong>Dirección:</strong> ' + escapeHTML(order.address||'—') + '</p>' +
      '</div>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">' +
      '<thead><tr style="background:#8b1a4a;color:#fff;">' +
        '<th style="padding:10px 12px;text-align:left;font-size:0.85rem;">Producto</th>' +
        '<th style="padding:10px 12px;text-align:center;font-size:0.85rem;">Cant.</th>' +
        '<th style="padding:10px 12px;text-align:right;font-size:0.85rem;">Precio Unit.</th>' +
        '<th style="padding:10px 12px;text-align:right;font-size:0.85rem;">Subtotal</th>' +
      '</tr></thead>' +
      '<tbody>' + itemsRows + '</tbody>' +
      '<tfoot>' +
        '<tr><td colspan="3" style="padding:8px 12px;text-align:right;color:#777;border-top:2px solid #f0e6ed;">Subtotal:</td><td style="padding:8px 12px;text-align:right;border-top:2px solid #f0e6ed;">' + formatCurrency(inv.subtotal) + '</td></tr>' +
        taxRow +
        '<tr style="background:#fdf2f6;"><td colspan="3" style="padding:10px 12px;text-align:right;font-weight:800;font-size:1rem;color:#8b1a4a;">TOTAL:</td><td style="padding:10px 12px;text-align:right;font-weight:900;font-size:1.1rem;color:#8b1a4a;">' + formatCurrency(inv.total) + '</td></tr>' +
      '</tfoot>' +
    '</table>' +
    notesBlock +
    '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #f0e6ed;text-align:center;color:#aaa;font-size:0.78rem;">' +
      '<p style="margin:0;">Pedido ref: ' + inv.order_id + ' • ' + BUSINESS_INFO.name + ' • ' + BUSINESS_INFO.city + '</p>' +
      '<p style="margin:4px 0 0;">Gracias por tu compra 💄</p>' +
    '</div>' +
  '</div>';
}

// ── Open preview modal ─────────────────────────────────────
function openInvoiceModal(inv) {
  currentInvoiceData = inv;
  invoicePreview.innerHTML = buildInvoiceHTML(inv);
  invoiceModal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  invoiceModal.style.display = 'none';
  document.body.style.overflow = '';
  currentInvoiceData = null;
}

// ── PDF Generation ─────────────────────────────────────────
function downloadInvoicePDF(inv) {
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    showToast('La librería PDF aún está cargando, intenta de nuevo.', 'error');
    return;
  }
  const jsPDF = (window.jspdf || window).jsPDF;
  const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
  const order = inv.order || {};
  let items   = [];
  try { items = JSON.parse(order.items || '[]'); } catch (_) {}

  const sl    = statusLabel(inv.status);
  const pageW = doc.internal.pageSize.getWidth();
  const primary   = [139, 26, 74];
  const lightPink = [253, 242, 246];
  let y = 0;

  // Header bar
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(BUSINESS_INFO.name, 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(BUSINESS_INFO.document + ' | ' + BUSINESS_INFO.address + ' | ' + BUSINESS_INFO.city + ' | Tel: ' + BUSINESS_INFO.phone, 14, 22);

  // Invoice badge
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageW - 64, 6, 50, 22, 3, 3, 'F');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('FACTURA', pageW - 39, 13, { align: 'center' });
  doc.setFontSize(14);
  doc.text(inv.number, pageW - 39, 21, { align: 'center' });
  y = 46;

  // Date & status
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Fecha: ' + new Date(inv.createdAt).toLocaleDateString('es-CO'), 14, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('Estado: ' + sl.text, pageW - 14, y, { align: 'right' });
  y += 10;

  // Client box
  doc.setFillColor(lightPink[0], lightPink[1], lightPink[2]);
  doc.roundedRect(14, y, pageW - 28, 28, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('DATOS DEL CLIENTE', 20, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  doc.text('Nombre: ' + (order.firstName || '') + ' ' + (order.lastName || ''), 20, y + 14);
  doc.text('Cédula: ' + (order.documentId || '—'), 20, y + 20);
  const halfW = (pageW - 28) / 2;
  doc.text('Tel: ' + (order.phone || '—'), 20 + halfW, y + 14);
  doc.text('Pago: ' + paymentLabel(order.payment), 20 + halfW, y + 20);
  if (order.address) doc.text('Dirección: ' + order.address, 20, y + 26);
  y += 35;

  // Table header
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(14, y, pageW - 28, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('Producto',    18,         y + 6);
  doc.text('Cant.',       pageW - 74, y + 6, { align: 'right' });
  doc.text('Precio Unit.',pageW - 44, y + 6, { align: 'right' });
  doc.text('Subtotal',    pageW - 16, y + 6, { align: 'right' });
  y += 9;

  // Rows
  items.forEach(function(item, i) {
    if (i % 2 === 0) {
      doc.setFillColor(250, 248, 255);
      doc.rect(14, y, pageW - 28, 8, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(String(item.name).substring(0, 45), 18,         y + 5.5);
    doc.text(String(item.qty),                   pageW - 74, y + 5.5, { align: 'right' });
    doc.text(formatCurrency(item.price),          pageW - 44, y + 5.5, { align: 'right' });
    doc.text(formatCurrency(item.price * item.qty),pageW - 16,y + 5.5, { align: 'right' });
    y += 8;
  });

  // Totals
  y += 4;
  doc.setDrawColor(240, 230, 237);
  doc.line(pageW - 90, y, pageW - 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Subtotal:',         pageW - 50, y, { align: 'right' });
  doc.setTextColor(40, 40, 40);
  doc.text(formatCurrency(inv.subtotal), pageW - 16, y, { align: 'right' });
  y += 7;

  if (inv.tax > 0) {
    doc.setTextColor(100, 100, 100);
    doc.text('IVA:', pageW - 50, y, { align: 'right' });
    doc.setTextColor(40, 40, 40);
    doc.text(formatCurrency(inv.tax), pageW - 16, y, { align: 'right' });
    y += 7;
  }

  doc.setFillColor(lightPink[0], lightPink[1], lightPink[2]);
  doc.roundedRect(pageW - 90, y - 2, 76, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text('TOTAL:',               pageW - 50, y + 7, { align: 'right' });
  doc.setFontSize(12);
  doc.text(formatCurrency(inv.total), pageW - 16, y + 7, { align: 'right' });
  y += 20;

  if (inv.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Notas: ' + inv.notes, 14, y);
    y += 8;
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 14;
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, footerY - 4, pageW, 20, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Pedido ref: ' + inv.order_id + '  •  ' + BUSINESS_INFO.name + '  •  ' + BUSINESS_INFO.city + '  •  Gracias por tu compra', pageW / 2, footerY + 4, { align: 'center' });

  doc.save(inv.number + '.pdf');
}

// ── Table event delegation ─────────────────────────────────
if (invoicesTableBody) {
  invoicesTableBody.addEventListener('click', async function(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const invId = row.dataset.invId;
    const inv   = allInvoices.find(function(i) { return i.id === invId; });
    if (!inv) return;

    if (btn.classList.contains('previewInvBtn')) {
      openInvoiceModal(inv);
    }

    if (btn.classList.contains('markPaidBtn')) {
      try {
        const res = await fetch('/api/invoices/' + invId, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ status: 'paid' })
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Factura marcada como pagada.', 'success');
        await loadInvoices();
      } catch (err) { showToast(err.message, 'error'); }
    }

    if (btn.classList.contains('cancelInvBtn')) {
      if (!confirm('¿Anular esta factura?')) return;
      try {
        const res = await fetch('/api/invoices/' + invId, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ status: 'cancelled' })
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Factura anulada.', 'success');
        await loadInvoices();
      } catch (err) { showToast(err.message, 'error'); }
    }

    if (btn.classList.contains('deleteInvBtn')) {
      if (!confirm('¿Eliminar esta factura definitivamente?')) return;
      try {
        const res = await fetch('/api/invoices/' + invId, {
          method: 'DELETE',
          headers: authHeaders()
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast('Factura eliminada.', 'success');
        await loadInvoices();
      } catch (err) { showToast(err.message, 'error'); }
    }
  });
}

// ── Modal controls ─────────────────────────────────────────
if (closeModalBtn)  closeModalBtn.addEventListener('click',  closeModal);
if (invoiceModal)   invoiceModal.addEventListener('click',   function(e) { if (e.target === invoiceModal) closeModal(); });

if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', function() {
  if (currentInvoiceData) downloadInvoicePDF(currentInvoiceData);
});

if (printInvoiceBtn) printInvoiceBtn.addEventListener('click', function() {
  const printContent = (document.getElementById('invoicePrintArea') || {}).innerHTML || '';
  const win = window.open('', '_blank');
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;900&display=swap" rel="stylesheet">' +
    '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:\'Outfit\',sans-serif;padding:30px;color:#1a1a2e;}@media print{body{padding:10px;}}</style>' +
    '</head><body>' + printContent + '</body></html>');
  win.document.close();
  win.focus();
  win.print();
});

// ── New invoice form ───────────────────────────────────────
if (newInvoiceBtn) newInvoiceBtn.addEventListener('click', function() {
  const invoicedOrderIds = new Set(allInvoices.map(function(i){ return i.order_id; }));
  invOrderSelect.innerHTML = '<option value="">Seleccionar pedido...</option>' +
    (allOrders || [])
      .filter(function(o){ return !invoicedOrderIds.has(o.id); })
      .map(function(o){
        return '<option value="' + o.id + '">' + o.id + ' — ' + o.buyer.firstName + ' ' + o.buyer.lastName + ' (' + formatCurrency(o.total) + ')</option>';
      }).join('');
  invoiceFormWrapper.style.display = 'block';
  invoiceFormWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

if (cancelInvoiceForm) cancelInvoiceForm.addEventListener('click', function() {
  invoiceFormWrapper.style.display = 'none';
  if (invoiceForm) invoiceForm.reset();
});

if (invoiceForm) invoiceForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  const order_id    = invOrderSelect.value;
  const tax_percent = Number(document.getElementById('invTax').value)   || 0;
  const notes       = document.getElementById('invNotes').value.trim();

  if (!order_id) { showToast('Selecciona un pedido.', 'error'); return; }

  try {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ order_id: order_id, tax_percent: tax_percent, notes: notes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('Factura ' + data.number + ' generada correctamente.', 'success');
    invoiceFormWrapper.style.display = 'none';
    if (invoiceForm) invoiceForm.reset();
    await loadInvoices();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Filters ────────────────────────────────────────────────
if (invFilterBtn) invFilterBtn.addEventListener('click', function() {
  loadInvoices(invFilterFrom.value, invFilterTo.value);
});

if (invClearFilterBtn) invClearFilterBtn.addEventListener('click', function() {
  invFilterFrom.value = '';
  invFilterTo.value   = '';
  loadInvoices();
});

// ── Load on tab click ──────────────────────────────────────
document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(btn) {
  if (btn.dataset && btn.dataset.tab === 'invoices') {
    btn.addEventListener('click', function() { loadInvoices(); });
  }
});
