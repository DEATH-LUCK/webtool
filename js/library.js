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
    img.onerror = () => {
      coverDiv.innerHTML =
        '<div class="cover-placeholder"><span class="cover-icon">' + getFileIcon(book.fileType) +
        '</span><span class="cover-ext">' + (book.fileType || 'FILE').toUpperCase() + '</span></div>';
    };
    coverDiv.appendChild(img);
  } else {
    coverDiv.innerHTML =
      '<div class="cover-placeholder"><span class="cover-icon">' + getFileIcon(book.fileType) +
      '</span><span class="cover-ext">' + (book.fileType || 'FILE').toUpperCase() + '</span></div>';
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
    img.onerror = () => { coverDiv.textContent = getFileIcon(book.fileType); };
    coverDiv.appendChild(img);
  } else {
    coverDiv.textContent = getFileIcon(book.fileType);
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
