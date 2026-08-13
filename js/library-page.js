// ============================================================
// LIBRARY-PAGE.JS — Separate top-menu Library
// IMPORTANT: This is NOT the existing Book Library.
// It uses the existing `folders` collection with a separate scope.
// ============================================================

const SEPARATE_LIBRARY_SCOPE = 'separate-library';
const SEPARATE_LIBRARY_PREFIX = 'lib_';

let separateLibraryCategories = [];
let separateLibraryPath = [];
let separateLibraryLoaded = false;

const DEFAULT_SEPARATE_LIBRARY = [
  { id: 'lib_software',      name: 'Software',      parent: null,             icon: '💻', order: 10 },
  { id: 'lib_windows',       name: 'Windows',       parent: 'lib_software',   icon: '🪟', order: 20 },
  { id: 'lib_windows_apps',  name: 'Apps',          parent: 'lib_windows',    icon: '📱', order: 30 },
  { id: 'lib_windows_games', name: 'Games',         parent: 'lib_windows',    icon: '🎮', order: 40 },
  { id: 'lib_android',       name: 'Android',       parent: 'lib_software',   icon: '🤖', order: 50 },
  { id: 'lib_android_apps',  name: 'Apps',          parent: 'lib_android',    icon: '📱', order: 60 },
  { id: 'lib_android_games', name: 'Games',         parent: 'lib_android',    icon: '🎮', order: 70 },
  { id: 'lib_entertainment', name: 'Entertainment', parent: null,             icon: '🎬', order: 80 },
  { id: 'lib_music',         name: 'Music',         parent: 'lib_entertainment', icon: '🎵', order: 90 },
  { id: 'lib_videos',        name: 'Videos',        parent: 'lib_entertainment', icon: '🎬', order: 100 },
  { id: 'lib_archive',       name: 'Archive',       parent: null,             icon: '📦', order: 110 }
];

function separateLibrarySort(a, b) {
  return (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name));
}

function separateLibraryChildren(parentId) {
  return separateLibraryCategories
    .filter(c => (c.parent || null) === (parentId || null))
    .sort(separateLibrarySort);
}

function separateLibraryFind(id) {
  return separateLibraryCategories.find(c => c.id === id) || null;
}

function separateLibraryDescendants(id) {
  const found = [];
  const walk = parentId => {
    separateLibraryChildren(parentId).forEach(child => {
      found.push(child);
      walk(child.id);
    });
  };
  walk(id);
  return found;
}

async function ensureSeparateLibraryDefaults() {
  // We deliberately use the existing `folders` collection because the
  // project already has Firestore permissions for it. The `scope` field
  // keeps these categories completely separate from Book Library folders.
  const snap = await db.collection('folders').get();
  const existing = new Set(
    snap.docs
      .filter(d => d.data().scope === SEPARATE_LIBRARY_SCOPE && d.id.startsWith(SEPARATE_LIBRARY_PREFIX))
      .map(d => d.id)
  );

  const missing = DEFAULT_SEPARATE_LIBRARY.filter(c => !existing.has(c.id));
  if (!missing.length) return;

  const batch = db.batch();
  missing.forEach(c => {
    batch.set(db.collection('folders').doc(c.id), {
      name: c.name,
      parent: c.parent,
      icon: c.icon,
      order: c.order,
      scope: SEPARATE_LIBRARY_SCOPE,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  await batch.commit();
}

async function loadSeparateLibraryCategories() {
  try {
    // Seed defaults if necessary. If an existing deployment does not allow
    // writes, we still render the built-in defaults below so the page works.
    try {
      await ensureSeparateLibraryDefaults();
    } catch (seedError) {
      console.warn('Separate Library default seed skipped:', seedError);
    }

    const snap = await db.collection('folders').get();
    separateLibraryCategories = snap.docs
      .filter(d => d.data().scope === SEPARATE_LIBRARY_SCOPE && d.id.startsWith(SEPARATE_LIBRARY_PREFIX))
      .map(d => ({ id: d.id, ...d.data() }))
      .sort(separateLibrarySort);

    // If the database was empty or the seed was blocked, show the correct
    // default tree in memory instead of a blank page.
    if (!separateLibraryCategories.length) {
      separateLibraryCategories = DEFAULT_SEPARATE_LIBRARY.map(c => ({ ...c }));
    }
    separateLibraryLoaded = true;
  } catch (e) {
    console.error('Separate Library load error:', e);
    separateLibraryCategories = DEFAULT_SEPARATE_LIBRARY.map(c => ({ ...c }));
    separateLibraryLoaded = true;
  }
}

function renderSeparateLibraryPage() {
  const grid = document.getElementById('separateLibraryGrid');
  const crumb = document.getElementById('separateLibraryBreadcrumb');
  if (!grid || !crumb) return;

  const currentParent = separateLibraryPath.length
    ? separateLibraryPath[separateLibraryPath.length - 1]
    : null;
  const children = separateLibraryChildren(currentParent);

  const rootCrumb = '<button class="library-crumb" onclick="separateLibraryGoHome()">📚 Library</button>';
  const pathCrumbs = separateLibraryPath.map((id, index) => {
    const item = separateLibraryFind(id);
    if (!item) return '';
    return ` <span>›</span> <button class="library-crumb" onclick="separateLibraryGoTo(${index})">${escapeHtml(item.name)}</button>`;
  }).join('');
  crumb.innerHTML = rootCrumb + pathCrumbs;

  if (!children.length) {
    grid.innerHTML = '<div class="separate-library-empty">No categories in this section yet.</div>';
    return;
  }

  grid.innerHTML = children.map(c => `
    <button class="separate-library-card" onclick="openSeparateLibraryCategory('${escapeAttr(c.id)}')">
      <span class="separate-library-icon">${escapeHtml(c.icon || '📁')}</span>
      <span class="separate-library-name">${escapeHtml(c.name)}</span>
    </button>
  `).join('');
}

function separateLibraryGoHome() {
  separateLibraryPath = [];
  renderSeparateLibraryPage();
}

function separateLibraryGoTo(index) {
  separateLibraryPath = separateLibraryPath.slice(0, index + 1);
  renderSeparateLibraryPage();
}

function openSeparateLibraryCategory(id) {
  if (!separateLibraryFind(id)) return;
  separateLibraryPath.push(id);
  renderSeparateLibraryPage();
}

async function openLibraryPage() {
  closeReader();
  closeAdminPanel();

  const page = document.getElementById('separateLibraryPage');
  const bookLibrary = document.getElementById('libraryView');
  const reader = document.getElementById('readerView');
  const main = document.querySelector('.app-main');
  const sidebar = document.getElementById('appSidebar');

  // Keep .app-main visible because the separate Library page lives inside it.
  // Hiding .app-main here makes the Library page itself disappear.
  if (bookLibrary) bookLibrary.style.display = 'none';
  if (reader) reader.style.display = 'none';
  if (main) main.style.display = '';
  if (page) page.style.display = 'block';
  if (sidebar) sidebar.style.display = 'flex';

  separateLibraryPath = [];
  const grid = document.getElementById('separateLibraryGrid');
  if (grid) grid.innerHTML = '<div class="separate-library-empty"><div class="spinner"></div><p>Loading Library...</p></div>';

  if (!separateLibraryLoaded) await loadSeparateLibraryCategories();
  renderSeparateLibraryPage();
}

function closeLibraryPage() {
  const page = document.getElementById('separateLibraryPage');
  const main = document.querySelector('.app-main');
  const bookLibrary = document.getElementById('libraryView');
  if (page) page.style.display = 'none';
  if (main) main.style.display = '';
  if (bookLibrary) bookLibrary.style.display = 'block';
  separateLibraryPath = [];
}

// ============================================================
// ADMIN — Manage ONLY the separate top-menu Library
// ============================================================

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
    renderSeparateLibraryAdminPane();
  } catch (e) {
    el.innerHTML = `<div class="empty-admin"><p style="color:var(--red)">Error: ${escapeHtml(e.message)}</p></div>`;
  }
}

function renderSeparateLibraryAdminPane() {
  const el = document.getElementById('adminPane_library');
  if (!el) return;
  const roots = separateLibraryChildren(null);

  el.innerHTML = `
    <div class="admin-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
        <div>
          <h4 style="margin:0;">📚 Library Categories</h4>
          <p class="muted" style="font-size:.72rem;margin-top:5px;">Only the separate top-menu Library is managed here. The Book Library categories in Edit remain unchanged.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="addSeparateLibraryCategory(null)">➕ Category</button>
      </div>
      <div id="separateLibraryAdminTree">
        ${roots.length ? renderSeparateLibraryAdminTree(roots) : '<p class="muted">No categories yet.</p>'}
      </div>
    </div>`;
}

function renderSeparateLibraryAdminTree(items) {
  return items.map(c => {
    const children = separateLibraryChildren(c.id);
    const safeId = escapeAttr(c.id);
    return `
      <div class="separate-library-admin-row">
        <div class="separate-library-admin-main">
          <span class="separate-library-admin-icon">${escapeHtml(c.icon || '📁')}</span>
          <strong>${escapeHtml(c.name)}</strong>
          ${children.length ? `<span class="muted"> · ${children.length} sub</span>` : ''}
        </div>
        <div class="folder-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="addSeparateLibraryCategory('${safeId}')">➕ Sub</button>
          <button class="btn btn-ghost btn-sm" onclick="renameSeparateLibraryCategory('${safeId}')">✏ Rename</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSeparateLibraryCategory('${safeId}')">🗑 Delete</button>
        </div>
        ${children.length ? `<div class="separate-library-admin-children">${renderSeparateLibraryAdminTree(children)}</div>` : ''}
      </div>`;
  }).join('');
}

async function addSeparateLibraryCategory(parentId) {
  if (!isSuperAdmin) { showToast('Only Superadmin can manage Library categories.', 'error'); return; }
  const name = await showPrompt('New Library Category', 'Enter category name:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const iconInput = await showPrompt('Category Icon', 'Enter an emoji (optional):', '📁');
  const icon = (iconInput || '').trim() || '📁';

  const duplicate = separateLibraryCategories.some(c =>
    c.name.toLowerCase() === trimmed.toLowerCase() && (c.parent || null) === (parentId || null)
  );
  if (duplicate) { showToast('A category with this name already exists here.', 'error'); return; }

  try {
    const ref = db.collection('folders').doc(SEPARATE_LIBRARY_PREFIX + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    await ref.set({
      name: trimmed,
      parent: parentId || null,
      icon,
      order: Date.now(),
      scope: SEPARATE_LIBRARY_SCOPE,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await logAction(`LIBRARY CATEGORY CREATED: ${trimmed}`);
    separateLibraryLoaded = false;
    await loadSeparateLibraryCategories();
    renderSeparateLibraryAdminPane();
    renderSeparateLibraryPage();
    showToast(`📚 "${trimmed}" created.`, 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function renameSeparateLibraryCategory(id) {
  if (!isSuperAdmin) { showToast('Only Superadmin can manage Library categories.', 'error'); return; }
  const cat = separateLibraryFind(id);
  if (!cat) return;
  const name = await showPrompt('Rename Library Category', 'Enter new name:', cat.name);
  if (!name || !name.trim() || name.trim() === cat.name) return;
  const trimmed = name.trim();

  const duplicate = separateLibraryCategories.some(c =>
    c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase() && (c.parent || null) === (cat.parent || null)
  );
  if (duplicate) { showToast('A category with this name already exists here.', 'error'); return; }

  try {
    await db.collection('folders').doc(id).update({ name: trimmed });
    await logAction(`LIBRARY CATEGORY RENAMED: ${cat.name} → ${trimmed}`);
    separateLibraryLoaded = false;
    await loadSeparateLibraryCategories();
    renderSeparateLibraryAdminPane();
    renderSeparateLibraryPage();
    showToast('Category renamed.', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteSeparateLibraryCategory(id) {
  if (!isSuperAdmin) { showToast('Only Superadmin can manage Library categories.', 'error'); return; }
  const cat = separateLibraryFind(id);
  if (!cat) return;

  const descendants = separateLibraryDescendants(id);
  const msg = descendants.length
    ? `Delete "${cat.name}" and its ${descendants.length} sub-categories?`
    : `Delete "${cat.name}"?`;
  if (!await showConfirm('Delete Library Category', msg)) return;

  try {
    const ids = [id, ...descendants.map(c => c.id)];
    // Firestore batches are limited to 500 writes; chunk for safety.
    for (let i = 0; i < ids.length; i += 450) {
      const batch = db.batch();
      ids.slice(i, i + 450).forEach(folderId => {
        batch.delete(db.collection('folders').doc(folderId));
      });
      await batch.commit();
    }

    await logAction(`LIBRARY CATEGORY DELETED: ${cat.name}`);
    separateLibraryLoaded = false;
    separateLibraryPath = separateLibraryPath.filter(pathId => !ids.includes(pathId));
    await loadSeparateLibraryCategories();
    renderSeparateLibraryAdminPane();
    renderSeparateLibraryPage();
    showToast('Category deleted.', 'success');
  } catch (e) {
    showToast('Error deleting category: ' + e.message, 'error');
  }
}
