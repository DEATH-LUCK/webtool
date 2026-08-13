// ============================================================
// LIBRARY.JS — Books Display, Search, Filter, Folders
// ============================================================
let allBooks     = [];
let allFolders   = [];
let currentView   = 'grid';
let currentFolder = 'all';
let currentSubFolder = 'all';

// ── Library navigation ─────────────────────────────────────────
function showLibrary() {
  const reader = document.getElementById('readerView');
  const library = document.getElementById('libraryView');
  const appPage = document.getElementById('appPage');
  const sidebar = document.getElementById('appSidebar');
  const main = document.querySelector('.app-main');

  if (reader) reader.style.display = 'none';
  if (library) library.style.display = 'block';
  if (appPage) appPage.style.display = 'block';
  if (sidebar) sidebar.style.display = 'flex';
  if (main) main.style.marginLeft = '';

  // If an admin overlay is open, return to the main Library view.
  const admin = document.getElementById('adminPanel');
  if (admin) admin.classList.remove('open');

  // Refresh the collection when returning to Library.
  if (typeof loadBooks === 'function') loadBooks();
}

// ── Load Books & Folders ──────────────────────────────────────
async function loadBooks() {
  try {
    const fSnap = await db.collection('folders').get();
    allFolders = fSnap.docs.map(d => ({ id: d.id, parent: d.data().parent || null }));
    const bSnap = await db.collection('books').orderBy('uploadedAt', 'desc').get();
    allBooks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBooks();
  } catch(e) {
    console.error('loadBooks error:', e);
    renderBooks(); 
  }
}

// ── Category helpers (2-level: top-level category > sub-category) ─
function getTopLevelFolders() { return allFolders.filter(f => !f.parent); }
function getChildFolders(parentId) { return allFolders.filter(f => f.parent === parentId); }
function buildCategoryOptionsHTML() {
  let html = '<option value="General">📁 General</option>';
  getTopLevelFolders().filter(f => f.id !== 'General').forEach(f => {
    const children = getChildFolders(f.id);
    if (children.length) {
      html += `<optgroup label="📁 ${escapeHtml(f.id)}">`;
      html += `<option value="${escapeHtml(f.id)}">📁 ${escapeHtml(f.id)} (general)</option>`;
      children.forEach(c => { html += `<option value="${escapeHtml(c.id)}">— ${escapeHtml(c.id)}</option>`; });
      html += `</optgroup>`;
    } else {
      html += `<option value="${escapeHtml(f.id)}">📁 ${escapeHtml(f.id)}</option>`;
    }
  });
  return html;
}

// ── Shared filtering (search + 2-level folder match) ────────────
function getFilteredBooks() {
  const search = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  return allBooks.filter(book => {
    const matchSearch = !search ||
      book.title?.toLowerCase().includes(search) ||
      book.author?.toLowerCase().includes(search);
    let matchFolder = true;
    if (currentFolder !== 'all') {
      if (currentSubFolder !== 'all') {
        matchFolder = book.category === currentSubFolder;
      } else if (book.category === currentFolder) {
        matchFolder = true;
      } else {
        const bf = allFolders.find(f => f.id === book.category);
        matchFolder = !!(bf && bf.parent === currentFolder);
      }
    }
    return matchSearch && matchFolder;
  });
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

  const filtered = getFilteredBooks();

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
  } else { // List view
    gridEl.style.display = 'none';
    listEl.style.display = 'block';
    filtered.forEach((book, i) => listEl.appendChild(createListItem(book, i)));
  }
  updateStats();
}

// ── Folder Chips (2-level: category + sub-category) ────────────
function renderFolderChips() {
  const bar = document.getElementById('folderChipsBar');
  if (!bar) return;
  bar.style.display = 'flex';
  bar.innerHTML = '';

  // Row 1: top-level categories
  const row1 = document.createElement('div');
  row1.className = 'folder-chip-row';

  const allChip = document.createElement('button');
  allChip.className = 'folder-chip' + (currentFolder === 'all' ? ' active' : '');
  allChip.innerHTML = '📚 All <span class="chip-count">' + allBooks.length + '</span>';
  allChip.onclick = () => { currentFolder = 'all'; currentSubFolder = 'all'; renderBooks(); };
  row1.appendChild(allChip);

  getTopLevelFolders().forEach(f => {
    const children = getChildFolders(f.id);
    const idsInGroup = [f.id, ...children.map(c => c.id)];
    const count = allBooks.filter(b => idsInGroup.includes(b.category)).length;
    const chip = document.createElement('button');
    chip.className = 'folder-chip' + (currentFolder === f.id ? ' active' : '');
    chip.innerHTML = '📁 ' + escapeHtml(f.id) + ' <span class="chip-count">' + count + '</span>';
    chip.onclick = () => { currentFolder = f.id; currentSubFolder = 'all'; renderBooks(); };
    row1.appendChild(chip);
  });
  bar.appendChild(row1);

  // Row 2: sub-categories of the selected top-level category (if it has any)
  if (currentFolder !== 'all') {
    const children = getChildFolders(currentFolder);
    if (children.length) {
      const row2 = document.createElement('div');
      row2.className = 'folder-chip-row sub-row';

      const idsInGroup = [currentFolder, ...children.map(c => c.id)];
      const allSubChip = document.createElement('button');
      allSubChip.className = 'folder-chip sub' + (currentSubFolder === 'all' ? ' active' : '');
      allSubChip.innerHTML = 'All in ' + escapeHtml(currentFolder) +
        ' <span class="chip-count">' + allBooks.filter(b => idsInGroup.includes(b.category)).length + '</span>';
      allSubChip.onclick = () => { currentSubFolder = 'all'; renderBooks(); };
      row2.appendChild(allSubChip);

      children.forEach(c => {
        const count = allBooks.filter(b => b.category === c.id).length;
        const chip = document.createElement('button');
        chip.className = 'folder-chip sub' + (currentSubFolder === c.id ? ' active' : '');
        chip.innerHTML = escapeHtml(c.id) + ' <span class="chip-count">' + count + '</span>';
        chip.onclick = () => { currentSubFolder = c.id; renderBooks(); };
        row2.appendChild(chip);
      });
      bar.appendChild(row2);
    }
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
