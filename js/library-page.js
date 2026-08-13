// ============================================================
// LIBRARY-PAGE.JS — Separate Library navigation page
// Uses the existing `folders` collection with a private scope so
// it remains fully separate from the Book Library UI/categories.
// ============================================================

let separateLibraryCategories = [];
let separateLibraryPath = [];
let separateLibraryLoaded = false;

const SEPARATE_LIBRARY_SCOPE = 'separate-library';

const DEFAULT_LIBRARY_CATEGORIES = [
  { key:'software', name:'Software', parentKey:null, icon:'💻' },
  { key:'windows', name:'Windows', parentKey:'software', icon:'🪟' },
  { key:'windows-apps', name:'Apps', parentKey:'windows', icon:'📱' },
  { key:'windows-games', name:'Games', parentKey:'windows', icon:'🎮' },
  { key:'android', name:'Android', parentKey:'software', icon:'🤖' },
  { key:'android-apps', name:'Apps', parentKey:'android', icon:'📱' },
  { key:'android-games', name:'Games', parentKey:'android', icon:'🎮' },
  { key:'entertainment', name:'Entertainment', parentKey:null, icon:'🎬' },
  { key:'music', name:'Music', parentKey:'entertainment', icon:'🎵' },
  { key:'videos', name:'Videos', parentKey:'entertainment', icon:'🎬' },
  { key:'archive', name:'Archive', parentKey:null, icon:'📦' }
];

function libraryChildren(parentId) {
  const pid = parentId || null;
  return separateLibraryCategories
    .filter(c => (c.parent || null) === pid)
    .sort((a,b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
}

async function ensureLibraryPageCategories() {
  // IMPORTANT: use the existing folders collection. The project's
  // Firestore rules already permit admins to manage this collection;
  // the `scope` field keeps these documents out of the Book Library.
  const snap = await db.collection('folders').where('scope', '==', SEPARATE_LIBRARY_SCOPE).get();
  if (!snap.empty) return;

  const batch = db.batch();
  const ids = {};
  const now = Date.now();

  DEFAULT_LIBRARY_CATEGORIES.forEach((item, index) => {
    const ref = db.collection('folders').doc();
    ids[item.key] = ref.id;
    batch.set(ref, {
      name: item.name,
      parent: item.parentKey ? ids[item.parentKey] : null,
      icon: item.icon,
      scope: SEPARATE_LIBRARY_SCOPE,
      order: index,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  await batch.commit();
}

async function loadSeparateLibraryCategories() {
  try {
    await ensureLibraryPageCategories();
    const snap = await db.collection('folders')
      .where('scope', '==', SEPARATE_LIBRARY_SCOPE)
      .get();
    separateLibraryCategories = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      parent: d.data().parent || null
    }));
    separateLibraryLoaded = true;
  } catch (e) {
    console.error('Separate Library load error:', e);
    separateLibraryLoaded = false;
    showToast('Could not load Library categories: ' + e.message, 'error');
  }
}

async function openLibraryPage() {
  if (typeof closeReader === 'function') closeReader();
  if (typeof closeAdminPanel === 'function') closeAdminPanel();

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

  await loadSeparateLibraryCategories();
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

  const parentId = separateLibraryPath.length
    ? separateLibraryPath[separateLibraryPath.length - 1]
    : null;
  const children = libraryChildren(parentId);
  const pathNames = separateLibraryPath
    .map(id => separateLibraryCategories.find(c => c.id === id)?.name)
    .filter(Boolean);

  crumb.innerHTML =
    `<button class="library-crumb" onclick="separateLibraryPath=[];renderSeparateLibraryPage()">📚 Library</button>` +
    pathNames.map((name, i) =>
      ` <span>›</span> <button class="library-crumb" onclick="separateLibraryPath=separateLibraryPath.slice(0,${i+1});renderSeparateLibraryPage()">${escapeHtml(name)}</button>`
    ).join('');

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

// ============================================================
// ADMIN — manages ONLY the separate top-menu Library page.
// Book Library category tools remain in admin.js untouched.
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
    const roots = libraryChildren(null);
    el.innerHTML = `
      <div class="admin-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
          <div>
            <h4 style="margin:0;">📚 Library Page Categories</h4>
            <p class="muted" style="font-size:.72rem;margin-top:5px;">These categories belong only to the top-menu Library page. The existing Book Library categories are separate.</p>
          </div>
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
  const exists = separateLibraryCategories.some(c =>
    c.name.toLowerCase() === trimmed.toLowerCase() && (c.parent || null) === (parentId || null)
  );
  if (exists) { showToast('A category with this name already exists here.', 'error'); return; }

  try {
    await db.collection('folders').add({
      name: trimmed,
      parent: parentId || null,
      icon: icon?.trim() || '📁',
      scope: SEPARATE_LIBRARY_SCOPE,
      order: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await logAction(`LIBRARY CATEGORY CREATED: ${trimmed}`);
    separateLibraryLoaded = false;
    await loadSeparateLibraryCategories();
    await loadSeparateLibraryAdminPane();
    renderSeparateLibraryPage();
    showToast(`📚 "${trimmed}" created.`, 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function renameSeparateLibraryCategory(id) {
  const cat = separateLibraryCategories.find(c => c.id === id);
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
    await loadSeparateLibraryAdminPane();
    renderSeparateLibraryPage();
    showToast('Category renamed.', 'success');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteSeparateLibraryCategory(id) {
  const cat = separateLibraryCategories.find(c => c.id === id);
  if (!cat) return;

  const descendants = [];
  const collect = parent => {
    libraryChildren(parent).forEach(c => {
      descendants.push(c);
      collect(c.id);
    });
  };
  collect(id);

  const msg = descendants.length
    ? `Delete "${cat.name}" and its ${descendants.length} sub-categories?`
    : `Delete "${cat.name}"?`;
  if (!await showConfirm('Delete Library Category', msg)) return;

  try {
    const batch = db.batch();
    batch.delete(db.collection('folders').doc(id));
    descendants.forEach(c => batch.delete(db.collection('folders').doc(c.id)));
    await batch.commit();

    await logAction(`LIBRARY CATEGORY DELETED: ${cat.name}`);
    separateLibraryLoaded = false;
    separateLibraryPath = separateLibraryPath.filter(x => x !== id && !descendants.some(c => c.id === x));
    await loadSeparateLibraryCategories();
    await loadSeparateLibraryAdminPane();
    renderSeparateLibraryPage();
    showToast('Category deleted.', 'success');
  } catch (e) {
    console.error('deleteSeparateLibraryCategory error:', e);
    showToast('Error: ' + e.message, 'error');
  }
}
