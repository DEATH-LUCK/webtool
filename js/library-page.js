// ============================================================
// LIBRARY-PAGE.JS — Separate Library navigation page
// This is intentionally independent from the existing Book Library.
// ============================================================

let separateLibraryCategories = [];
let separateLibraryPath = [];
let separateLibraryLoaded = false;

const DEFAULT_LIBRARY_CATEGORIES = [
  { name: 'Software', parent: null, icon: '💻' },
  { name: 'Windows', parent: 'Software', icon: '🪟' },
  { name: 'Apps', parent: 'Windows', icon: '📱' },
  { name: 'Games', parent: 'Windows', icon: '🎮' },
  { name: 'Android', parent: 'Software', icon: '🤖' },
  { name: 'Apps', parent: 'Android', icon: '📱' },
  { name: 'Games', parent: 'Android', icon: '🎮' },
  { name: 'Entertainment', parent: null, icon: '🎬' },
  { name: 'Music', parent: 'Entertainment', icon: '🎵' },
  { name: 'Videos', parent: 'Entertainment', icon: '🎬' },
  { name: 'Archive', parent: null, icon: '📦' }
];

function libraryCategoryPathKey(parentPath, name) {
  return [...parentPath, name].join(' / ');
}

async function ensureLibraryPageCategories() {
  const snap = await db.collection('libraryCategories').get();
  if (!snap.empty) return;

  // Seed only the NEW Library page. Book folders are never touched.
  const batch = db.batch();
  const ids = {};
  DEFAULT_LIBRARY_CATEGORIES.forEach(item => {
    const path = [];
    let parentId = null;
    if (item.parent) {
      // Resolve parent by its unique path in this small default tree.
      const parentIndex = DEFAULT_LIBRARY_CATEGORIES.findIndex(x => x.name === item.parent &&
        DEFAULT_LIBRARY_CATEGORIES.indexOf(x) < DEFAULT_LIBRARY_CATEGORIES.indexOf(item));
      const parent = DEFAULT_LIBRARY_CATEGORIES[parentIndex];
      const parentKey = parent ? (parent.parent ? `${parent.parent}/${parent.name}` : parent.name) : item.parent;
      parentId = ids[parentKey] || null;
    }
    const ref = db.collection('libraryCategories').doc();
    const key = item.parent ? `${item.parent}/${item.name}` : item.name;
    ids[key] = ref.id;
    batch.set(ref, { name: item.name, parent: parentId, icon: item.icon, order: DEFAULT_LIBRARY_CATEGORIES.indexOf(item), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
}

function getDefaultLibraryCategories() {
  const ids = {};
  return DEFAULT_LIBRARY_CATEGORIES.map((item, index) => {
    const key = item.parent ? `${item.parent}/${item.name}` : item.name;
    const parentKey = item.parent || null;
    const obj = { id: 'default-' + key.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: item.name, parent: parentKey ? ids[parentKey] || null : null, icon: item.icon, order: index, isDefault: true };
    ids[key] = obj.id;
    return obj;
  });
}

async function loadSeparateLibraryCategories() {
  try {
    await ensureLibraryPageCategories();
    const snap = await db.collection('libraryCategories').orderBy('order').get();
    separateLibraryCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!separateLibraryCategories.length) separateLibraryCategories = getDefaultLibraryCategories();
    separateLibraryLoaded = true;
  } catch (e) {
    // The navigation must still work even if Firestore rules/network prevent loading.
    // This fallback is only for the separate Library page; Book Library is untouched.
    console.error('Separate Library load error:', e);
    separateLibraryCategories = getDefaultLibraryCategories();
    separateLibraryLoaded = true;
  }
}

function libraryChildren(parentId) {
  return separateLibraryCategories.filter(c => (c.parent || null) === (parentId || null));
}

async function openLibraryPage() {
  closeReader();
  closeAdminPanel();
  const oldLibrary = document.getElementById('libraryView');
  const reader = document.getElementById('readerView');
  const page = document.getElementById('separateLibraryPage');
  if (oldLibrary) oldLibrary.style.display = 'none';
  if (reader) reader.style.display = 'none';
  if (page) page.style.display = 'block';
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) sidebar.style.display = 'flex';
  separateLibraryPath = [];
  const grid = document.getElementById('separateLibraryGrid');
  if (grid) grid.innerHTML = '<div class="separate-library-empty"><div class="spinner"></div><p>Loading Library...</p></div>';
  if (!separateLibraryLoaded) await loadSeparateLibraryCategories();
  renderSeparateLibraryPage();
}

function closeLibraryPage() {
  const page = document.getElementById('separateLibraryPage');
  const oldLibrary = document.getElementById('libraryView');
  if (page) page.style.display = 'none';
  if (oldLibrary) oldLibrary.style.display = 'block';
  separateLibraryPath = [];
}

function renderSeparateLibraryPage() {
  const grid = document.getElementById('separateLibraryGrid');
  const crumb = document.getElementById('separateLibraryBreadcrumb');
  if (!grid || !crumb) return;

  const parentId = separateLibraryPath.length ? separateLibraryPath[separateLibraryPath.length - 1] : null;
  const children = libraryChildren(parentId);
  const pathNames = separateLibraryPath.map(id => separateLibraryCategories.find(c => c.id === id)?.name).filter(Boolean);

  crumb.innerHTML = `<button class="library-crumb" onclick="separateLibraryPath=[];renderSeparateLibraryPage()">📚 Library</button>` +
    pathNames.map((name, i) => ` <span>›</span> <button class="library-crumb" onclick="separateLibraryPath=separateLibraryPath.slice(0,${i+1});renderSeparateLibraryPage()">${escapeHtml(name)}</button>`).join('');

  if (!children.length) {
    grid.innerHTML = '<div class="separate-library-empty">No items in this category yet.</div>';
    return;
  }

  grid.innerHTML = children.map(c => `
    <button class="separate-library-card" onclick="openSeparateLibraryCategory('${c.id}')">
      <span class="separate-library-icon">${escapeHtml(c.icon || '📁')}</span>
      <span class="separate-library-name">${escapeHtml(c.name)}</span>
    </button>
  `).join('');
}

function openSeparateLibraryCategory(id) {
  if (!separateLibraryCategories.some(c => c.id === id)) return;
  separateLibraryPath.push(id);
  renderSeparateLibraryPage();
}

// Admin: manage ONLY the separate Library page categories.
async function loadSeparateLibraryAdminPane() {
  const el = document.getElementById('adminPane_library');
  if (!el) return;
  if (!isSuperAdmin) {
    el.innerHTML = '<div class="empty-admin"><p class="muted">🔒 Superadmin access required.</p></div>';
    return;
  }
  el.innerHTML = '<div class="empty-admin"><div class="spinner"></div><p>Loading Library categories...</p></div>';
  try {
    await loadSeparateLibraryCategories();
    const roots = libraryChildren(null);
    el.innerHTML = `
      <div class="admin-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
          <div><h4 style="margin:0;">📚 Separate Library</h4><p class="muted" style="font-size:.72rem;margin-top:5px;">These categories belong only to the top-menu Library page. Book Library categories are separate.</p></div>
          <button class="btn btn-primary btn-sm" onclick="addSeparateLibraryCategory(null)">➕ Category</button>
        </div>
        <div id="separateLibraryAdminTree">${renderSeparateLibraryAdminTree(roots)}</div>
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-admin"><p style="color:var(--red)">Error: ${escapeHtml(e.message)}</p></div>`;
  }
}

function renderSeparateLibraryAdminTree(items) {
  return items.map(c => {
    const children = libraryChildren(c.id);
    return `<div class="separate-library-admin-row">
      <div><span class="separate-library-admin-icon">${escapeHtml(c.icon || '📁')}</span><strong>${escapeHtml(c.name)}</strong><span class="muted">${children.length ? ` · ${children.length} sub` : ''}</span></div>
      <div class="folder-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="addSeparateLibraryCategory('${c.id}')">➕ Sub</button>
        <button class="btn btn-ghost btn-sm" onclick="renameSeparateLibraryCategory('${c.id}')">✏</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSeparateLibraryCategory('${c.id}')">🗑</button>
      </div>
      ${children.length ? `<div class="separate-library-admin-children">${renderSeparateLibraryAdminTree(children)}</div>` : ''}
    </div>`;
  }).join('');
}

async function addSeparateLibraryCategory(parentId) {
  const name = await showPrompt('New Library Category', 'Enter category name:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const icon = await showPrompt('Category Icon', 'Enter an emoji (optional):', '📁');
  const exists = separateLibraryCategories.some(c => c.name.toLowerCase() === trimmed.toLowerCase() && (c.parent || null) === (parentId || null));
  if (exists) { showToast('A category with this name already exists here.', 'error'); return; }
  try {
    await db.collection('libraryCategories').add({ name: trimmed, parent: parentId || null, icon: icon?.trim() || '📁', order: Date.now(), createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await logAction(`LIBRARY CATEGORY CREATED: ${trimmed}`);
    await loadSeparateLibraryAdminPane();
    await loadSeparateLibraryCategories();
    renderSeparateLibraryPage();
    showToast(`📚 "${trimmed}" created.`, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function renameSeparateLibraryCategory(id) {
  const cat = separateLibraryCategories.find(c => c.id === id);
  if (!cat) return;
  const name = await showPrompt('Rename Library Category', 'Enter new name:', cat.name);
  if (!name || !name.trim() || name.trim() === cat.name) return;
  try {
    await db.collection('libraryCategories').doc(id).update({ name: name.trim() });
    await logAction(`LIBRARY CATEGORY RENAMED: ${cat.name} → ${name.trim()}`);
    await loadSeparateLibraryAdminPane();
    await loadSeparateLibraryCategories();
    renderSeparateLibraryPage();
    showToast('Category renamed.', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteSeparateLibraryCategory(id) {
  const cat = separateLibraryCategories.find(c => c.id === id);
  if (!cat) return;
  const descendants = [];
  const collect = parent => libraryChildren(parent).forEach(c => { descendants.push(c); collect(c.id); });
  collect(id);
  const msg = descendants.length ? `Delete "${cat.name}" and its ${descendants.length} sub-categories?` : `Delete "${cat.name}"?`;
  if (!await showConfirm('Delete Library Category', msg)) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection('libraryCategories').doc(id));
    descendants.forEach(c => batch.delete(db.collection('libraryCategories').doc(c.id)));
    await batch.commit();
    await logAction(`LIBRARY CATEGORY DELETED: ${cat.name}`);
    await loadSeparateLibraryAdminPane();
    await loadSeparateLibraryCategories();
    separateLibraryPath = separateLibraryPath.filter(x => x !== id && !descendants.some(c => c.id === x));
    renderSeparateLibraryPage();
    showToast('Category deleted.', 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}
