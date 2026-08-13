// ============================================================
// LIBRARY.JS — Books Display, Search, Filter, Folders
// ============================================================
let allBooks     = [];
let allFolders   = [];
let currentView   = 'grid';
let currentFolder = 'all';
let currentSubFolder = 'all'; // kept for backward compatibility

// ── Load Books & Folders ──────────────────────────────────────
async function loadBooks() {
  try {
    const fSnap = await db.collection('folders').get();
    allFolders = fSnap.docs
      .filter(d => d.data().scope !== 'separate-library')
      .map(d => ({ id: d.id, parent: d.data().parent || null }));
    const bSnap = await db.collection('books').orderBy('uploadedAt', 'desc').get();
    allBooks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBooks();
  } catch(e) {
    console.error('loadBooks error:', e);
    renderBooks(); 
  }
}

// ── Category helpers (unlimited hierarchy) ─────────────────────
function getTopLevelFolders() { return allFolders.filter(f => !f.parent); }
function getChildFolders(parentId) { return allFolders.filter(f => f.parent === parentId); }
function getFolderById(id) { return allFolders.find(f => f.id === id); }
function getFolderPath(id) {
  const path = [];
  let cur = getFolderById(id);
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id); path.unshift(cur); cur = getFolderById(cur.parent);
  }
  return path;
}
function getDescendantIds(parentId) {
  const ids = [parentId];
  const walk = (id) => getChildFolders(id).forEach(c => { ids.push(c.id); walk(c.id); });
  walk(parentId);
  return ids;
}
function getFolderBookCount(folderId) {
  const ids = new Set(getDescendantIds(folderId));
  return allBooks.filter(b => ids.has(b.category)).length;
}
function buildCategoryOptionsHTML() {
  let html = '<option value="General">📁 General</option>';
  const walk = (parentId, depth) => {
    getChildFolders(parentId).filter(f => f.id !== 'General').forEach(f => {
      const prefix = depth ? '— '.repeat(Math.min(depth, 6)) : '📁 ';
      html += `<option value="${escapeHtml(f.id)}">${prefix}${escapeHtml(f.id)}</option>`;
      walk(f.id, depth + 1);
    });
  };
  getTopLevelFolders().filter(f => f.id !== 'General').forEach(f => {
    html += `<option value="${escapeHtml(f.id)}">📁 ${escapeHtml(f.id)}</option>`;
    walk(f.id, 1);
  });
  return html;
}

// ── Shared filtering (unlimited folder hierarchy) ──────────────
function getFilteredBooks() {
  const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  return allBooks.filter(book => {
    const matchSearch = !search || book.title?.toLowerCase().includes(search) || book.author?.toLowerCase().includes(search);
    const matchFolder = currentFolder === 'all' || getDescendantIds(currentFolder).includes(book.category);
    return matchSearch && matchFolder;
  });
}

// ── Render Books ──────────────────────────────────────────────
function renderBooks() {
  const gridEl  = document.getElementById('booksGrid');
  const listEl  = document.getElementById('booksListView');
  const emptyEl = document.getElementById('emptyState');
  if (!gridEl || !listEl || !emptyEl) return;
  const search  = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';

  gridEl.innerHTML = '';
  listEl.innerHTML = '';
  renderFolderChips();
  const filtered = getFilteredBooks();

  if (filtered.length === 0) {
    emptyEl.style.display = 'block'; gridEl.style.display = 'none'; listEl.style.display = 'none';
    const msg = document.getElementById('emptyMsg');
    if (msg) msg.textContent = search ? 'No results for "' + search + '"' : 'No items in this category yet.';
    updateStats(); return;
  }
  emptyEl.style.display = 'none';
  if (currentView === 'grid') {
    gridEl.style.display = 'grid'; listEl.style.display = 'none';
    filtered.forEach((book, i) => gridEl.appendChild(createGridCard(book, i)));
  } else {
    gridEl.style.display = 'none'; listEl.style.display = 'block';
    filtered.forEach((book, i) => listEl.appendChild(createListItem(book, i)));
  }
  updateStats();
}

// ── Hierarchical Library navigation ───────────────────────────
function renderFolderChips() {
  const bar = document.getElementById('folderChipsBar');
  if (!bar) return;
  bar.style.display = 'flex'; bar.innerHTML = '';

  const crumb = document.createElement('div');
  crumb.className = 'folder-chip-row';
  const all = document.createElement('button');
  all.className = 'folder-chip' + (currentFolder === 'all' ? ' active' : '');
  all.innerHTML = '📚 Library <span class="chip-count">' + allBooks.length + '</span>';
  all.onclick = () => { currentFolder = 'all'; currentSubFolder = 'all'; renderBooks(); };
  crumb.appendChild(all);

  if (currentFolder !== 'all') {
    getFolderPath(currentFolder).forEach(f => {
      const b = document.createElement('button');
      b.className = 'folder-chip' + (f.id === currentFolder ? ' active' : '');
      b.textContent = '› ' + f.id;
      b.onclick = () => { currentFolder = f.id; currentSubFolder = 'all'; renderBooks(); };
      crumb.appendChild(b);
    });
  }
  bar.appendChild(crumb);

  const children = currentFolder === 'all' ? getTopLevelFolders() : getChildFolders(currentFolder);
  if (children.length) {
    const row = document.createElement('div');
    row.className = 'folder-chip-row sub-row';
    children.forEach(f => {
      const chip = document.createElement('button');
      chip.className = 'folder-chip sub';
      chip.innerHTML = '📁 ' + escapeHtml(f.id) + ' <span class="chip-count">' + getFolderBookCount(f.id) + '</span>';
      chip.onclick = () => { currentFolder = f.id; currentSubFolder = 'all'; renderBooks(); };
      row.appendChild(chip);
    });
    bar.appendChild(row);
  }
}

// ── Grid Card — fully DOM-built to avoid innerHTML+= wiping nodes ─
function createGridCard(book, index) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.style.animationDelay = (index * 0.04) + 's';

  // Bulk checkbox (only in bulk mode)
  if (bulkMode && currentRole === 'admin') { // Only show for admins in bulk mode
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
  actionsDiv.appendChild(readBtn);

  // Download/Edit/Delete only shown in admin edit (Select) mode — kept out of the default browsing view
  if (bulkMode && currentRole === 'admin') {
    const dlLink = document.createElement('a');
    dlLink.className  = 'btn btn-ghost btn-sm';
    dlLink.href       = book.downloadUrl;
    dlLink.target     = '_blank';
    dlLink.rel        = 'noopener';
    dlLink.title      = 'Download';
    dlLink.textContent = '⬇';
    dlLink.onclick = (e) => e.stopPropagation();
    actionsDiv.appendChild(dlLink);

    const editBtn = document.createElement('button');
    editBtn.className   = 'btn-icon icon-edit';
    editBtn.title       = 'Edit';
    editBtn.textContent = '✏';
    editBtn.onclick = (e) => { e.stopPropagation(); openEditBookModal(book.id); };
    actionsDiv.appendChild(editBtn);

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
  const coverDiv = document.createElement('div'); // This is the cover for list view
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

  // Bulk checkbox (only in bulk mode)
  if (bulkMode && currentRole === 'admin') { // Only show for admins in bulk mode
    const cbWrap = document.createElement('label');
    cbWrap.className = 'bulk-check-wrap-list'; // Different class for list view
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'bulk-checkbox';
    cb.dataset.bookid = book.id;
    cb.checked = bulkSelected.has(book.id);
    cb.onclick = (e) => { e.stopPropagation(); toggleBookSelect(book.id, cb); };
    coverDiv.appendChild(cbWrap); // Append to cover div for positioning
    cbWrap.appendChild(cb);
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
  actionsDiv.appendChild(readBtn);

  if (bulkMode && currentRole === 'admin') {
    const dlLink = document.createElement('a');
    dlLink.className   = 'btn btn-ghost btn-sm';
    dlLink.href        = book.downloadUrl;
    dlLink.target      = '_blank';
    dlLink.rel         = 'noopener';
    dlLink.textContent = '⬇';
    dlLink.onclick = (e) => e.stopPropagation();
    actionsDiv.appendChild(dlLink);

    const editBtn = document.createElement('button');
    editBtn.className   = 'btn btn-ghost btn-sm';
    editBtn.textContent = '✏ Edit';
    editBtn.onclick = (e) => { e.stopPropagation(); openEditBookModal(book.id); };
    actionsDiv.appendChild(editBtn);

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

/**
 * Custom Prompt replacing window.prompt
 */
function showPrompt(title, placeholder, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('promptModal');
    const input = document.getElementById('promptInput');
    document.getElementById('promptTitle').textContent = title;
    input.placeholder = placeholder || '';
    input.value = defaultValue;
    modal.classList.add('open');
    setTimeout(() => input.focus(), 50);

    const done = (val) => {
      modal.classList.remove('open');
      document.getElementById('promptConfirmBtn').onclick = null;
      document.getElementById('promptCancelBtn').onclick = null;
      input.onkeydown = null;
      resolve(val);
    };

    document.getElementById('promptConfirmBtn').onclick = () => done(input.value.trim());
    document.getElementById('promptCancelBtn').onclick = () => done(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') done(input.value.trim());
      if (e.key === 'Escape') done(null);
    };
  });
}

/**
 * Custom Confirm replacing window.confirm
 */
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmBody').textContent = message;
    modal.classList.add('open');

    const done = (val) => {
      modal.classList.remove('open');
      document.getElementById('confirmBtn').onclick = null;
      document.getElementById('confirmCancelBtn').onclick = null;
      resolve(val);
    };

    document.getElementById('confirmBtn').onclick = () => done(true);
    document.getElementById('confirmCancelBtn').onclick = () => done(false);
  });
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

// ── Open Book ─────────────────────────────────────────────────
function openBook(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (book) openReader(book);
}

// ── Edit Book ─────────────────────────────────────────────────
let editTargetId = null;
async function openEditBookModal(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (!book) return;
  editTargetId = bookId;

  document.getElementById('editBookTitle').value  = book.title || '';
  document.getElementById('editBookAuthor').value = book.author || '';

  const select = document.getElementById('editBookCategory');
  select.innerHTML = buildCategoryOptionsHTML();
  select.value = book.category || 'General';

  document.getElementById('editBookOverlay').classList.add('open');
}
function closeEditBookModal() {
  document.getElementById('editBookOverlay').classList.remove('open');
  editTargetId = null;
}
async function saveEditBook() {
  if (!editTargetId) return;
  const title    = document.getElementById('editBookTitle').value.trim();
  const author   = document.getElementById('editBookAuthor').value.trim();
  const category = document.getElementById('editBookCategory').value;
  if (!title) { showToast('Title cannot be empty.', 'error'); return; }

  try {
    await db.collection('books').doc(editTargetId).update({ title, author: author || null, category });
    const idx = allBooks.findIndex(b => b.id === editTargetId);
    if (idx !== -1) allBooks[idx] = { ...allBooks[idx], title, author: author || null, category };
    closeEditBookModal();
    renderBooks();
    showToast('Item updated.', 'success');
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
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
  const icons = {
    pdf: '📕', epub: '📗', txt: '📄', doc: '📝', docx: '📝',
    apk: '📱', exe: '💻', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
    mp3: '🎵', wav: '🎵',
    mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬'
  };
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
  if (currentRole !== 'admin') return; // Only admins can use bulk mode
  bulkMode = !bulkMode;
  bulkSelected.clear();
  document.getElementById('bulkToolbar').style.display = bulkMode ? 'flex' : 'none';
  const btn = document.getElementById('bulkToggleBtn');
  const icon = document.getElementById('bulkToggleIcon');
  const label = document.getElementById('bulkToggleLabel');
  if (label) label.textContent = bulkMode ? 'Exit Select / Edit Mode' : 'Select / Edit Mode';
  if (icon)  icon.className    = bulkMode ? 'bx bx-x' : 'bx bx-checkbox';
  if (btn)   btn.classList.toggle('active-bulk', bulkMode);
  renderBooks();
}

function toggleBookSelect(bookId, checkbox) {
  if (checkbox.checked) { bulkSelected.add(bookId); }
  else                  { bulkSelected.delete(bookId); }
  updateBulkToolbar();
}

function toggleSelectAll() {
  const visible = getFilteredBooks();
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
  if (!await showConfirm('Bulk Delete', `Are you sure you want to delete ${cnt} selected book${cnt !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  try {
    const batch = db.batch();
    bulkSelected.forEach(id => batch.delete(db.collection('books').doc(id)));
    await batch.commit();
    allBooks = allBooks.filter(b => !bulkSelected.has(b.id));
    bulkSelected.clear();
    renderBooks();
    showToast(`${cnt} book${cnt !== 1 ? 's' : ''} deleted.`, 'success');
    if (typeof logAction === 'function') logAction(`BULK DELETE: Removed ${cnt} books`);
    updateBulkToolbar();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function bulkMove() {
  if (!bulkSelected.size) return;
  // Show inline folder selector
  const overlay = document.getElementById('bulkMoveOverlay');
  if (!overlay) return;
  const sel = document.getElementById('bulkFolderSelect');
  sel.innerHTML = buildCategoryOptionsHTML();
  overlay.classList.add('open');
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
    renderBooks(); // Re-render to update categories
    showToast(cnt + ' books moved to "' + folder + '"', 'success');
    if (typeof logAction === 'function') logAction(`BULK MOVE: ${cnt} books to folder "${folder}"`);
    updateBulkToolbar();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
function closeBulkMove() {
  const o = document.getElementById('bulkMoveOverlay');
  if (o) o.classList.remove('open');
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
