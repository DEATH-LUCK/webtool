// ============================================================
// LIBRARY.JS — Books Display, Search, Filter, Folders
// ============================================================
let allBooks     = [];
let allFolders   = [];
let currentView   = 'grid';
let currentFilter = 'all';
let currentFolder = 'all';

// ── Load Books & Folders ──────────────────────────────────────
async function loadBooks() {
  try {
    const fSnap = await db.collection('folders').get();
    allFolders = fSnap.docs.map(d => d.id);
    const bSnap = await db.collection('books').orderBy('uploadedAt', 'desc').get();
    allBooks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBooks();
  } catch(e) {
    console.error('loadBooks error:', e);
  }
}

// ── Render Books ──────────────────────────────────────────────
function renderBooks() {
  const gridEl  = document.getElementById('booksGrid');
  const listEl  = document.getElementById('booksListView');
  const emptyEl = document.getElementById('emptyState');
  const search  = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';

  gridEl.innerHTML = '';
  listEl.innerHTML = '';
  renderFolderChips();

  const filtered = allBooks.filter(book => {
    const matchSearch = !search ||
      book.title?.toLowerCase().includes(search) ||
      book.author?.toLowerCase().includes(search);
    const matchFilter =
      currentFilter === 'all' || currentFilter === 'folders' ||
      (currentFilter === 'pdf'   && book.fileType === 'pdf') ||
      (currentFilter === 'epub'  && book.fileType === 'epub') ||
      (currentFilter === 'other' && !['pdf','epub'].includes(book.fileType));
    const matchFolder = currentFolder === 'all' || book.category === currentFolder;
    return matchSearch && matchFilter && matchFolder;
  });

  if (filtered.length === 0) {
    emptyEl.style.display = 'block';
    gridEl.style.display  = 'none';
    listEl.style.display  = 'none';
    document.getElementById('emptyMsg').textContent =
      search ? 'No results for "' + search + '"' : 'No books yet.';
    updateStats();
    return;
  }

  emptyEl.style.display = 'none';
  if (currentView === 'grid') {
    gridEl.style.display = 'grid';
    listEl.style.display = 'none';
    filtered.forEach((book, i) => gridEl.appendChild(createGridCard(book, i)));
  } else {
    gridEl.style.display = 'none';
    listEl.style.display = 'block';
    filtered.forEach((book, i) => listEl.appendChild(createListItem(book, i)));
  }
  updateStats();
}

// ── Folder Chips ──────────────────────────────────────────────
function renderFolderChips() {
  const bar = document.getElementById('folderChipsBar');
  if (!bar) return;
  const bookFolders = new Set(allBooks.map(b => b.category).filter(Boolean));
  allFolders.forEach(f => bookFolders.add(f));
  const folders = ['all', ...bookFolders];
  bar.style.display = currentFilter === 'folders' ? 'flex' : 'none';
  bar.innerHTML = '';
  folders.forEach(folder => {
    const count = folder === 'all' ? allBooks.length : allBooks.filter(b => b.category === folder).length;
    const chip = document.createElement('button');
    chip.className = 'folder-chip' + (currentFolder === folder ? ' active' : '');
    chip.innerHTML = (folder === 'all' ? '📚 All' : '📁 ' + escapeHtml(folder)) +
      ' <span class="chip-count">' + count + '</span>';
    chip.onclick = () => { currentFolder = folder; renderBooks(); };
    bar.appendChild(chip);
  });
}

// ── Grid Card — fully DOM-built to avoid innerHTML+= wiping nodes ─
function createGridCard(book, index) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.style.animationDelay = (index * 0.04) + 's';

  // Bulk checkbox (only in bulk mode)
  if (bulkMode) {
    const cbWrap = document.createElement('label');
    cbWrap.className = 'bulk-check-wrap';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'bulk-checkbox';
    cb.dataset.bookid = book.id;
    cb.checked = bulkSelected.has(book.id);
    cb.onclick = (e) => { e.stopPropagation(); toggleBookSelect(book.id, cb); };
    cbWrap.appendChild(cb);
    card.appendChild(cbWrap);
    card.classList.add('bulk-card');
  }

  // Cover
  const coverDiv = document.createElement('div');
  coverDiv.className = 'card-cover';
  coverDiv.style.cursor = 'pointer';
  coverDiv.onclick = () => openBook(book.id);

  if (book.coverUrl) {
    const img = document.createElement('img');
    img.src     = book.coverUrl;
    img.alt     = 'cover';
    img.loading = 'lazy';
    img.onerror = () => { _renderGeneratedCover(coverDiv, book); };
    coverDiv.appendChild(img);
  } else {
    _renderGeneratedCover(coverDiv, book);
  }

  // Body
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'card-body';
  bodyDiv.style.cursor = 'pointer';
  bodyDiv.onclick = () => openBook(book.id);

  const titleEl = document.createElement('div');
  titleEl.className   = 'card-title';
  titleEl.textContent = book.title || 'Untitled';

  const metaEl = document.createElement('div');
  metaEl.className   = 'card-meta';
  metaEl.textContent = book.author || book.category || '';

  bodyDiv.appendChild(titleEl);
  bodyDiv.appendChild(metaEl);

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'card-actions';

  const readBtn = document.createElement('button');
  readBtn.className   = 'btn btn-primary btn-sm';
  readBtn.textContent = 'Read';
  readBtn.onclick     = () => openBook(book.id);

  const dlLink = document.createElement('a');
  dlLink.className  = 'btn btn-ghost btn-sm';
  dlLink.href       = book.downloadUrl;
  dlLink.target     = '_blank';
  dlLink.rel        = 'noopener';
  dlLink.title      = 'Download';
  dlLink.textContent = '⬇';

  actionsDiv.appendChild(readBtn);
  actionsDiv.appendChild(dlLink);

  if (currentRole === 'admin') {
    const delBtn = document.createElement('button');
    delBtn.className   = 'btn-icon btn-danger';
    delBtn.title       = 'Delete';
    delBtn.textContent = '🗑';
    delBtn.onclick = (e) => { e.stopPropagation(); confirmDelete(e, book.id, book.title); };
    actionsDiv.appendChild(delBtn);
  }

  card.appendChild(coverDiv);
  card.appendChild(bodyDiv);
  card.appendChild(actionsDiv);
  return card;
}

// ── List Item ─────────────────────────────────────────────────
function createListItem(book, index) {
  const item = document.createElement('div');
  item.className = 'book-list-item';
  item.style.animationDelay = (index * 0.03) + 's';

  // Cover thumb
  const coverDiv = document.createElement('div');
  coverDiv.className = 'list-cover';
  coverDiv.style.cursor = 'pointer';
  coverDiv.onclick = () => openBook(book.id);
  if (book.coverUrl) {
    const img = document.createElement('img');
    img.src = book.coverUrl;
    img.alt = 'cover';
    img.onerror = () => { _renderListCover(coverDiv, book); };
    coverDiv.appendChild(img);
  } else {
    _renderListCover(coverDiv, book);
  }

  // Body text
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'list-body';
  bodyDiv.style.cursor = 'pointer';
  bodyDiv.onclick = () => openBook(book.id);

  const titleEl = document.createElement('div');
  titleEl.className   = 'list-title';
  titleEl.textContent = book.title || 'Untitled';

  const date = book.uploadedAt?.toDate
    ? book.uploadedAt.toDate().toLocaleDateString('en-US', {day:'2-digit', month:'short', year:'numeric'})
    : '';
  const metaEl = document.createElement('div');
  metaEl.className   = 'list-meta';
  metaEl.textContent = [book.author, book.category, date].filter(Boolean).join(' · ');

  bodyDiv.appendChild(titleEl);
  bodyDiv.appendChild(metaEl);

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'list-actions';

  const readBtn = document.createElement('button');
  readBtn.className   = 'btn btn-primary btn-sm';
  readBtn.textContent = '📖 Read';
  readBtn.onclick     = () => openBook(book.id);

  const dlLink = document.createElement('a');
  dlLink.className   = 'btn btn-ghost btn-sm';
  dlLink.href        = book.downloadUrl;
  dlLink.target      = '_blank';
  dlLink.rel         = 'noopener';
  dlLink.textContent = '⬇';

  actionsDiv.appendChild(readBtn);
  actionsDiv.appendChild(dlLink);

  if (currentRole === 'admin') {
    const delBtn = document.createElement('button');
    delBtn.className   = 'btn btn-danger btn-sm';
    delBtn.textContent = '🗑 Delete';
    delBtn.onclick = (e) => { e.stopPropagation(); confirmDelete(e, book.id, book.title); };
    actionsDiv.appendChild(delBtn);
  }

  item.appendChild(coverDiv);
  item.appendChild(bodyDiv);
  item.appendChild(actionsDiv);
  return item;
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent = allBooks.length;
  document.getElementById('statPDF').textContent   = allBooks.filter(b => b.fileType === 'pdf').length;
  document.getElementById('statEPUB').textContent  = allBooks.filter(b => b.fileType === 'epub').length;
  document.getElementById('statOther').textContent = allBooks.filter(b => !['pdf','epub'].includes(b.fileType)).length;
}

// ── View & Filter ─────────────────────────────────────────────
function setView(view, btn) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBooks();
}
function setFilter(filter, btn) {
  currentFilter = filter;
  if (filter !== 'folders') currentFolder = 'all';
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBooks();
}

// ── Open Book ─────────────────────────────────────────────────
function openBook(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (book) openReader(book);
}

// ── Delete ────────────────────────────────────────────────────
let deleteTargetId = null;
function confirmDelete(e, bookId, title) {
  e.stopPropagation();
  deleteTargetId = bookId;
  document.getElementById('deleteBookTitle').textContent = '"' + (title || 'this book') + '"';
  document.getElementById('deleteModal').classList.add('open');
}
function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('open');
  deleteTargetId = null;
}
async function executeDelete() {
  if (!deleteTargetId) return;
  try {
    await db.collection('books').doc(deleteTargetId).delete();
    allBooks = allBooks.filter(b => b.id !== deleteTargetId);
    closeDeleteModal();
    renderBooks();
    showToast('Book deleted.', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Helpers ───────────────────────────────────────────────────
function getFileIcon(type) {
  const icons = { pdf: '📕', epub: '📗', txt: '📄', doc: '📝', docx: '📝' };
  return icons[type] || '📁';
}
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ════════════════════════════════════════════════
// BULK ACTIONS
// ════════════════════════════════════════════════
let bulkMode    = false;
let bulkSelected = new Set();

function toggleBulkMode() {
  bulkMode = !bulkMode;
  bulkSelected.clear();
  document.getElementById('bulkToolbar').style.display = bulkMode ? 'flex' : 'none';
  document.getElementById('bulkToggleBtn').textContent = bulkMode ? '✕ Cancel' : '☑ Select';
  document.getElementById('bulkToggleBtn').className   = bulkMode ? 'btn btn-ghost btn-sm active-bulk' : 'btn btn-ghost btn-sm';
  renderBooks();
}

function toggleBookSelect(bookId, checkbox) {
  if (checkbox.checked) { bulkSelected.add(bookId); }
  else                  { bulkSelected.delete(bookId); }
  updateBulkToolbar();
}

function toggleSelectAll() {
  const visible = allBooks.filter(b => {
    const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    const matchSearch = !search || b.title?.toLowerCase().includes(search) || b.author?.toLowerCase().includes(search);
    const matchFilter = currentFilter === 'all' || currentFilter === 'folders' ||
      (currentFilter === 'pdf' && b.fileType === 'pdf') ||
      (currentFilter === 'epub' && b.fileType === 'epub') ||
      (currentFilter === 'other' && !['pdf','epub'].includes(b.fileType));
    const matchFolder = currentFolder === 'all' || b.category === currentFolder;
    return matchSearch && matchFilter && matchFolder;
  });
  const allChecked = visible.every(b => bulkSelected.has(b.id));
  visible.forEach(b => allChecked ? bulkSelected.delete(b.id) : bulkSelected.add(b.id));
  document.querySelectorAll('.bulk-checkbox').forEach(cb => {
    const id = cb.dataset.bookid;
    cb.checked = bulkSelected.has(id);
  });
  updateBulkToolbar();
}

function updateBulkToolbar() {
  const cnt = bulkSelected.size;
  const countEl = document.getElementById('bulkCount');
  if (countEl) countEl.textContent = cnt + ' selected';
  const delBtn  = document.getElementById('bulkDeleteBtn');
  const movBtn  = document.getElementById('bulkMoveBtn');
  if (delBtn) delBtn.disabled = cnt === 0;
  if (movBtn) movBtn.disabled = cnt === 0;
}

async function bulkDelete() {
  if (!bulkSelected.size) return;
  const cnt = bulkSelected.size;
  if (!confirm('Delete ' + cnt + ' book' + (cnt !== 1 ? 's' : '') + '? Cannot be undone.')) return;
  try {
    const batch = db.batch();
    bulkSelected.forEach(id => batch.delete(db.collection('books').doc(id)));
    await batch.commit();
    allBooks = allBooks.filter(b => !bulkSelected.has(b.id));
    bulkSelected.clear();
    renderBooks();
    showToast(cnt + ' books deleted.', 'success');
    if (typeof logActivity === 'function') logActivity('bulk_deleted', { count: cnt });
    updateBulkToolbar();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function bulkMove() {
  if (!bulkSelected.size) return;
  // Show inline folder selector
  const overlay = document.getElementById('bulkMoveOverlay');
  if (!overlay) return;
  const sel = document.getElementById('bulkFolderSelect');
  sel.innerHTML = '<option value="">Choose folder…</option>';
  allFolders.forEach(f => {
    const o = document.createElement('option');
    o.value = f; o.textContent = f; sel.appendChild(o);
  });
  overlay.style.display = 'flex';
}

async function confirmBulkMove() {
  const sel = document.getElementById('bulkFolderSelect');
  const folder = sel?.value;
  if (!folder) { showToast('Choose a folder.', 'error'); return; }
  const cnt = bulkSelected.size;
  try {
    const batch = db.batch();
    bulkSelected.forEach(id => batch.update(db.collection('books').doc(id), { category: folder }));
    await batch.commit();
    allBooks.forEach(b => { if (bulkSelected.has(b.id)) b.category = folder; });
    bulkSelected.clear();
    closeBulkMove();
    renderBooks();
    showToast(cnt + ' books moved to "' + folder + '"', 'success');
    updateBulkToolbar();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
function closeBulkMove() {
  const o = document.getElementById('bulkMoveOverlay');
  if (o) o.style.display = 'none';
}

// ── Cover Helpers ────────────────────────────────────────────
function _renderGeneratedCover(container, book) {
  // Try to render a canvas-based cover for books with no image
  const canvas = document.createElement('canvas');
  canvas.width  = 120;
  canvas.height = 168;
  canvas.style.cssText = 'width:100%;height:100%;display:block;';

  const ctx = canvas.getContext('2d');
  const colors = {
    pdf:  { bg1: '#1a0f02', bg2: '#0d0701', accent: '#c8902a' },
    epub: { bg1: '#0a1a10', bg2: '#050d08', accent: '#4a8a5a' },
    txt:  { bg1: '#0a0f1a', bg2: '#050810', accent: '#5a6aaa' },
    doc:  { bg1: '#0a0f1a', bg2: '#050810', accent: '#4a6a9a' },
    docx: { bg1: '#0a0f1a', bg2: '#050810', accent: '#4a6a9a' },
  };
  const c = colors[book.fileType] || { bg1: '#111', bg2: '#070707', accent: '#888' };

  const grad = ctx.createLinearGradient(0, 0, 0, 168);
  grad.addColorStop(0, c.bg1);
  grad.addColorStop(1, c.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 120, 168);

  // Spine
  ctx.fillStyle = c.accent;
  ctx.fillRect(0, 0, 3, 168);

  // Type badge
  ctx.fillStyle = c.accent + '33';
  ctx.fillRect(0, 130, 120, 38);
  ctx.fillStyle = c.accent;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText((book.fileType || 'FILE').toUpperCase(), 60, 151);

  // Title
  const title = book.title || 'Untitled';
  ctx.fillStyle = '#e8d5a3';
  ctx.font = 'bold 11px serif';
  ctx.textAlign = 'center';
  // Wrap
  const words = title.split(' ');
  let line = '', y = 58, lines = [];
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > 98 && line) { lines.push(line); line = w; }
    else line = test;
    if (lines.length >= 4) break;
  }
  if (line && lines.length < 4) lines.push(line);
  const startY = 80 - (lines.length * 14) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 60, startY + i * 15));

  // Decorative line above title
  ctx.strokeStyle = c.accent + '88';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(14, startY - 9); ctx.lineTo(106, startY - 9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, startY + lines.length * 15 + 2); ctx.lineTo(106, startY + lines.length * 15 + 2); ctx.stroke();

  container.innerHTML = '';
  container.appendChild(canvas);
}

function _renderListCover(container, book) {
  container.style.background = 'var(--ink3)';
  container.style.display    = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.fontSize   = '1.4rem';
  container.textContent = getFileIcon(book.fileType);
}
