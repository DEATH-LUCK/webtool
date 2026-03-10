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

  let filtered = allBooks.filter(book => {
    const matchSearch = !search ||
      book.title?.toLowerCase().includes(search) ||
      book.author?.toLowerCase().includes(search);
    const matchFilter =
      currentFilter === 'all' ||
      currentFilter === 'folders' ||
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
    chip.onclick = () => {
      currentFolder = folder;
      renderBooks();
    };
    bar.appendChild(chip);
  });
}

// ── Grid Card ─────────────────────────────────────────────────
function createGridCard(book, index) {
  const div = document.createElement('div');
  div.className = 'book-card';
  div.style.animationDelay = (index * 0.04) + 's';

  // Build cover safely without inline onerror string injection
  const coverDiv = document.createElement('div');
  coverDiv.className = 'card-cover';
  coverDiv.style.cursor = 'pointer';
  coverDiv.onclick = () => openBook(book.id);

  if (book.coverUrl) {
    const img = document.createElement('img');
    img.src = book.coverUrl;
    img.alt = 'cover';
    img.loading = 'lazy';
    img.onerror = function() {
      coverDiv.innerHTML = '<div class="cover-placeholder"><span class="cover-icon">' +
        getFileIcon(book.fileType) + '</span><span class="cover-ext">' +
        (book.fileType || 'FILE').toUpperCase() + '</span></div>';
    };
    coverDiv.appendChild(img);
  } else {
    coverDiv.innerHTML = '<div class="cover-placeholder"><span class="cover-icon">' +
      getFileIcon(book.fileType) + '</span><span class="cover-ext">' +
      (book.fileType || 'FILE').toUpperCase() + '</span></div>';
  }

  const adminHtml = currentRole === 'admin'
    ? '<button class="btn-icon btn-danger" title="Delete" data-bookid="' + escapeHtml(book.id) + '" data-title="' + escapeHtml(book.title) + '">🗑</button>'
    : '';

  div.appendChild(coverDiv);
  div.innerHTML +=
    '<div class="card-body" onclick="openBook(\'' + escapeHtml(book.id) + '\')">' +
      '<div class="card-title">' + escapeHtml(book.title) + '</div>' +
      '<div class="card-meta">' + escapeHtml(book.author ? book.author : (book.category || '')) + '</div>' +
    '</div>' +
    '<div class="card-actions">' +
      '<button class="btn btn-primary btn-sm" onclick="openBook(\'' + escapeHtml(book.id) + '\')">Read</button>' +
      '<a href="' + escapeHtml(book.downloadUrl) + '" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" title="Download">⬇</a>' +
      adminHtml +
    '</div>';

  // Attach delete handler safely
  const delBtn = div.querySelector('.btn-icon.btn-danger');
  if (delBtn) {
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      confirmDelete(e, book.id, book.title);
    });
  }

  return div;
}

// ── List Item ─────────────────────────────────────────────────
function createListItem(book, index) {
  const div = document.createElement('div');
  div.className = 'book-list-item';
  div.style.animationDelay = (index * 0.03) + 's';

  const coverHtml = book.coverUrl
    ? '<img src="' + escapeHtml(book.coverUrl) + '" alt="cover" onerror="this.outerHTML=\'' + getFileIcon(book.fileType) + '\'">'
    : getFileIcon(book.fileType);

  const date = book.uploadedAt?.toDate
    ? book.uploadedAt.toDate().toLocaleDateString('en-US', { day:'2-digit', month:'short', year:'numeric' })
    : '';

  div.innerHTML =
    '<div class="list-cover" onclick="openBook(\'' + escapeHtml(book.id) + '\')">' + coverHtml + '</div>' +
    '<div class="list-body" onclick="openBook(\'' + escapeHtml(book.id) + '\')">' +
      '<div class="list-title">' + escapeHtml(book.title) + '</div>' +
      '<div class="list-meta">' +
        escapeHtml(book.author ? book.author + ' · ' : '') +
        escapeHtml(book.category || '') + (date ? ' · ' + date : '') +
      '</div>' +
    '</div>' +
    '<div class="list-actions">' +
      '<button class="btn btn-primary btn-sm" onclick="openBook(\'' + escapeHtml(book.id) + '\')">📖 Read</button>' +
      '<a href="' + escapeHtml(book.downloadUrl) + '" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">⬇</a>' +
      (currentRole === 'admin'
        ? '<button class="btn btn-danger btn-sm" data-bookid="' + escapeHtml(book.id) + '" data-title="' + escapeHtml(book.title) + '">🗑 Delete</button>'
        : '') +
    '</div>';

  const delBtn = div.querySelector('.btn-danger[data-bookid]');
  if (delBtn) {
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      confirmDelete(e, book.id, book.title);
    });
  }

  return div;
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
  document.getElementById('deleteBookTitle').textContent = '"' + title + '"';
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
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
