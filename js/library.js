// ============================================================
// LIBRARY.JS — Load, Display, Filter, Delete Books
// ============================================================

let allBooks = [];
let currentView = 'grid';
let currentFilter = 'all';
let currentFolder = 'all';
let bookToDelete = null;

// ── Load Books from Firestore ─────────────────────────────────
async function loadBooks() {
  try {
    const snapshot = await db.collection('books')
      .orderBy('uploadedAt', 'desc')
      .get();

    allBooks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateStats();
    renderBooks();
  } catch (err) {
    console.error('Error loading books:', err);
    showToast('Error loading library', 'error');
  }
}

// ── Render Books ──────────────────────────────────────────────
function renderBooks() {
  const search = document.getElementById('searchInput').value.toLowerCase();

  let filtered = allBooks.filter(book => {
    const matchSearch = !search ||
      book.title?.toLowerCase().includes(search) ||
      book.author?.toLowerCase().includes(search);
    const matchFilter = currentFilter === 'all' ||
      (currentFilter === 'pdf' && book.fileType === 'pdf') ||
      (currentFilter === 'epub' && book.fileType === 'epub') ||
      (currentFilter === 'other' && !['pdf', 'epub'].includes(book.fileType));
    const matchFolder = currentFolder === 'all' || book.category === currentFolder;
    return matchSearch && matchFilter && matchFolder;
  });

  const gridEl = document.getElementById('booksGrid');
  const listEl = document.getElementById('booksListView');
  const emptyEl = document.getElementById('emptyState');

  gridEl.innerHTML = '';
  listEl.innerHTML = '';

  renderFolders();
  if (filtered.length === 0) {
    emptyEl.style.display = 'block';
    document.getElementById('emptyMsg').textContent =
      search ? `No results for "${search}"` : 'No books yet. Ask an admin to upload some!';
    return;
  }
  emptyEl.style.display = 'none';

  filtered.forEach((book, i) => {
    if (currentView === 'grid') {
      gridEl.appendChild(createGridCard(book, i));
    } else {
      listEl.appendChild(createListItem(book, i));
    }
  });
}

// ── Grid Card ─────────────────────────────────────────────────
function createGridCard(book, index) {
  const div = document.createElement('div');
  div.className = 'book-card';
  div.style.animationDelay = `${index * 0.04}s`;

  const coverHtml = book.coverUrl
    ? `<img src="${book.coverUrl}" alt="cover" loading="lazy">`
    : `<div class="book-cover-placeholder">
         <div class="book-icon">${getFileIcon(book.fileType)}</div>
         <div class="book-ext">${book.fileType?.toUpperCase() || 'FILE'}</div>
       </div>`;

  const downloadBtn = `<a href="${book.downloadUrl}" target="_blank" class="btn btn-ghost btn-sm" title="Download">⬇️</a>`;
  const adminActions = currentRole === 'admin'
    ? `<button class="btn btn-danger btn-sm" onclick="deleteBook(event, '${book.id}', '${escapeHtml(book.title)}')">🗑</button>`
    : '';

  div.innerHTML = `
    <div class="book-cover" onclick="openBook('${book.id}')">
      ${coverHtml}
    </div>
    <div class="book-info" onclick="openBook('${book.id}')">
      <div class="book-title">${escapeHtml(book.title)}</div>
      <div class="book-meta">${book.author ? escapeHtml(book.author) : book.category || ''}</div>
    </div>
    <div class="book-actions">
      <button class="btn btn-primary btn-sm" style="flex:1" onclick="openBook('${book.id}')">Read</button>
      ${downloadBtn}
      ${adminActions}
    </div>`;
  return div;
}

// ── List Item ─────────────────────────────────────────────────
function createListItem(book, index) {
  const div = document.createElement('div');
  div.className = 'book-list-item';
  div.style.animationDelay = `${index * 0.03}s`;

  const coverHtml = book.coverUrl
    ? `<img src="${book.coverUrl}" alt="cover">`
    : getFileIcon(book.fileType);

  const downloadBtn = `<a href="${book.downloadUrl}" target="_blank" class="btn btn-ghost btn-sm" title="Download">⬇️</a>`;
  const adminActions = currentRole === 'admin'
    ? `<button class="btn btn-danger btn-sm" onclick="deleteBook(event, '${book.id}', '${escapeHtml(book.title)}')">🗑 Delete</button>`
    : '';

  const date = book.uploadedAt?.toDate
    ? book.uploadedAt.toDate().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
    : '';

  div.innerHTML = `
    <div class="list-cover">${coverHtml}</div>
    <div class="list-info" onclick="openBook('${book.id}')">
      <div class="list-title">${escapeHtml(book.title)}</div>
      <div class="list-meta">${book.author ? escapeHtml(book.author) + ' · ' : ''}${book.category || ''} ${date ? '· ' + date : ''}</div>
    </div>
    <div class="list-actions">
      <button class="btn btn-primary btn-sm" onclick="openBook('${book.id}')">📖 Read</button>
      ${downloadBtn}
      ${adminActions}
    </div>`;
  return div;
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent = allBooks.length;
  document.getElementById('statPDF').textContent  = allBooks.filter(b => b.fileType === 'pdf').length;
  document.getElementById('statEPUB').textContent = allBooks.filter(b => b.fileType === 'epub').length;
  document.getElementById('statOther').textContent = allBooks.filter(b => !['pdf','epub'].includes(b.fileType)).length;
}

// ── Folder Sidebar ────────────────────────────────────────────
function renderFolders() {
  const folders = ['all', ...new Set(allBooks.map(b => b.category).filter(Boolean))];
  const container = document.getElementById('folderList');
  if (!container) return;
  container.innerHTML = '';
  folders.forEach(folder => {
    const count = folder === 'all' ? allBooks.length : allBooks.filter(b => b.category === folder).length;
    const btn = document.createElement('button');
    btn.className = 'folder-btn' + (currentFolder === folder ? ' active' : '');
    btn.innerHTML = `<span>${folder === 'all' ? '📚 All Books' : '📁 ' + folder}</span><span class="folder-count">${count}</span>`;
    btn.onclick = () => {
      currentFolder = folder;
      document.querySelectorAll('.folder-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBooks();
    };
    container.appendChild(btn);
  });
}

// ── View & Filter ─────────────────────────────────────────────
function setView(view) {
  currentView = view;
  document.getElementById('booksGrid').style.display = view === 'grid' ? 'grid' : 'none';
  document.getElementById('booksListView').style.display = view === 'list' ? 'flex' : 'none';
  document.getElementById('gridBtn').classList.toggle('active', view === 'grid');
  document.getElementById('listBtn').classList.toggle('active', view === 'list');
  renderBooks();
}

function setFilter(filter, btnEl) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  renderBooks();
}

function filterBooks() { renderBooks(); }

// ── Navigation ────────────────────────────────────────────────
function showLibrary() {
  document.getElementById('libraryView').style.display = 'block';
  document.getElementById('readerView').style.display = 'none';
}

// ── Delete ────────────────────────────────────────────────────
function deleteBook(event, bookId, title) {
  event.stopPropagation();
  bookToDelete = bookId;
  document.getElementById('deleteBookName').textContent =
    `"${title}" will be permanently deleted. This cannot be undone.`;
  document.getElementById('deleteModal').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('open');
  bookToDelete = null;
}

async function confirmDelete() {
  if (!bookToDelete) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    // Get book data for storage deletion
    const bookDoc = await db.collection('books').doc(bookToDelete).get();
    const book = bookDoc.data();

    // Delete from Storage
    if (book?.storagePath) {
      await storage.ref(book.storagePath).delete().catch(() => {});
    }
    if (book?.coverPath) {
      await storage.ref(book.coverPath).delete().catch(() => {});
    }

    // Delete from Firestore
    await db.collection('books').doc(bookToDelete).delete();

    closeDeleteModal();
    showToast('Book deleted successfully', 'success');
    await loadBooks();
  } catch (err) {
    showToast('Error deleting book', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
}

// ── Open Book ─────────────────────────────────────────────────
async function openBook(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (!book) return;

  document.getElementById('libraryView').style.display = 'none';
  document.getElementById('readerView').style.display = 'block';
  await openReader(book);
}

// ── Helpers ───────────────────────────────────────────────────
function getFileIcon(type) {
  const icons = { pdf: '📄', epub: '📗', txt: '📝', doc: '📘', docx: '📘' };
  return icons[type] || '📁';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
