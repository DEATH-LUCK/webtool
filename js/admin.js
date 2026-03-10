// ============================================================
// ADMIN.JS — Admin Panel
// ============================================================
// escapeHtml is defined in library.js

function openAdminPanel() {
  if (currentRole !== 'admin') return;
  document.getElementById('adminPanel').classList.add('open');
  _showAdminTab('users');
}
function closeAdminPanel() {
  document.getElementById('adminPanel').classList.remove('open');
}

// Called from HTML onclick — receives the button element
function showAdminTab(tab, evtTarget) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
  document.getElementById('adminPane_' + tab).style.display = 'block';
  if (evtTarget) evtTarget.classList.add('active');
  if (tab === 'users')   loadUsersPane();
  if (tab === 'folders') loadFoldersPane();
}

// Internal call (no button target needed)
function _showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
  document.getElementById('adminPane_' + tab).style.display = 'block';
  const btn = document.querySelector('.admin-tab-btn[data-tab="' + tab + '"]');
  if (btn) btn.classList.add('active');
  if (tab === 'users')   loadUsersPane();
  if (tab === 'folders') loadFoldersPane();
}

// ── USERS ─────────────────────────────────────────────────────
async function loadUsersPane() {
  const el = document.getElementById('usersList');
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const snap = await db.collection('users').get();
    if (snap.empty) { el.innerHTML = '<p class="muted">No users found.</p>'; return; }
    el.innerHTML = '';
    snap.docs.forEach(doc => {
      const data    = doc.data();
      const isAdmin = data.role === 'admin';
      const isSelf  = doc.id === currentUser.uid || doc.id === currentUser.email;

      const row = document.createElement('div');
      row.className = 'user-row';

      const info = document.createElement('div');
      info.className = 'user-info';
      info.innerHTML =
        '<div class="user-email">' + escapeHtml(doc.id) + '</div>' +
        '<div class="user-badge ' + (isAdmin ? 'badge-admin' : 'badge-user') + '">' +
          (isAdmin ? '👑 Admin' : '👤 User') +
        '</div>';

      const actions = document.createElement('div');
      if (!isSelf) {
        const btn = document.createElement('button');
        btn.className   = 'btn btn-ghost btn-sm';
        btn.textContent = isAdmin ? '⬇ Make User' : '⬆ Make Admin';
        btn.onclick     = () => toggleRole(doc.id, isAdmin);
        actions.appendChild(btn);
      } else {
        actions.innerHTML = '<span class="muted" style="font-size:0.75rem">You</span>';
      }

      row.appendChild(info);
      row.appendChild(actions);
      el.appendChild(row);
    });
  } catch(e) {
    el.innerHTML = '<p style="color:var(--danger)">Error: ' + e.message + '</p>';
  }
}

async function toggleRole(userId, isAdmin) {
  try {
    await db.collection('users').doc(userId).update({ role: isAdmin ? 'user' : 'admin' });
    showToast(userId + ' role updated!', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function addAdmin() {
  const email = document.getElementById('adminEmailInput').value.trim();
  if (!email) { showToast('Enter an email address.', 'error'); return; }
  try {
    const snap = await db.collection('users').get();
    let found = false;
    for (const doc of snap.docs) {
      if (doc.id === email || doc.data().email === email) {
        await db.collection('users').doc(doc.id).update({ role: 'admin' });
        found = true; break;
      }
    }
    if (!found) {
      await db.collection('users').doc(email).set({ role: 'admin', email }, { merge: true });
    }
    showToast(email + ' is now an admin!', 'success');
    document.getElementById('adminEmailInput').value = '';
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ── FOLDERS ───────────────────────────────────────────────────
async function loadFoldersPane() {
  const el = document.getElementById('foldersList');
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const [bSnap, fSnap] = await Promise.all([
      db.collection('books').get(),
      db.collection('folders').get()
    ]);

    const folderMap = {};
    fSnap.docs.forEach(doc => { if (!folderMap[doc.id]) folderMap[doc.id] = []; });
    bSnap.docs.forEach(doc => {
      const d = doc.data();
      const cat = d.category || 'General';
      if (!folderMap[cat]) folderMap[cat] = [];
      folderMap[cat].push({ id: doc.id, title: d.title || 'Untitled' });
    });

    const allFolderNames = Object.keys(folderMap).sort();
    el.innerHTML = '';

    if (allFolderNames.length === 0) {
      el.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">No folders yet.</p>';
      return;
    }

    allFolderNames.forEach(folderName => {
      const books  = folderMap[folderName];
      const safeId = 'fp_' + folderName.replace(/[^a-z0-9]/gi, '_') + '_' + Math.random().toString(36).slice(2,6);

      const div = document.createElement('div');
      div.className = 'folder-manage-row';

      // Header
      const header = document.createElement('div');
      header.className = 'folder-manage-header';
      header.onclick   = () => togglePane(safeId);

      const headerLeft = document.createElement('div');
      headerLeft.style.cssText = 'display:flex;align-items:center;gap:8px;';
      headerLeft.innerHTML =
        '<span class="chevron" id="chev_' + safeId + '">▶</span>' +
        '<strong>📁 ' + escapeHtml(folderName) + '</strong>' +
        '<span class="muted" style="font-size:0.78rem;">(' + books.length + ' books)</span>';

      // FIX: use DOM event instead of inline onclick with string interpolation
      const delBtn = document.createElement('button');
      delBtn.className   = 'btn btn-danger btn-sm';
      delBtn.textContent = '🗑 Delete';
      delBtn.onclick = (e) => { e.stopPropagation(); deleteFolder(folderName, books.length); };

      header.appendChild(headerLeft);
      header.appendChild(delBtn);

      // Body
      const body = document.createElement('div');
      body.className    = 'folder-manage-body';
      body.id           = safeId;
      body.style.display = 'none';

      if (books.length === 0) {
        body.innerHTML = '<p class="muted" style="padding:12px;font-size:0.82rem;">Empty folder</p>';
      } else {
        books.forEach(b => {
          const bookRow = document.createElement('div');
          bookRow.className = 'folder-book-row';

          const titleSpan = document.createElement('span');
          titleSpan.className   = 'folder-book-title';
          titleSpan.textContent = '📄 ' + b.title;

          const moveSelect = document.createElement('select');
          moveSelect.className = 'move-select';
          const defaultOpt = document.createElement('option');
          defaultOpt.value = ''; defaultOpt.textContent = 'Move to...';
          moveSelect.appendChild(defaultOpt);
          allFolderNames.filter(f => f !== folderName).forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = '📁 ' + f;
            moveSelect.appendChild(opt);
          });
          moveSelect.onchange = function() { moveBook(b.id, this.value, this); };

          bookRow.appendChild(titleSpan);
          bookRow.appendChild(moveSelect);
          body.appendChild(bookRow);
        });
      }

      div.appendChild(header);
      div.appendChild(body);
      el.appendChild(div);
    });

  } catch(e) {
    el.innerHTML = '<p style="color:var(--danger)">Error: ' + e.message + '</p>';
  }
}

function togglePane(id) {
  const el = document.getElementById(id);
  const ch = document.getElementById('chev_' + id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (ch) ch.textContent = open ? '▶' : '▼';
}

async function createFolder() {
  const input = document.getElementById('adminNewFolderInput');
  const name  = input?.value.trim();
  if (!name) { showToast('Enter a folder name.', 'error'); return; }
  try {
    await db.collection('folders').doc(name).set({
      name, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('📁 "' + name + '" created!', 'success');
    input.value = '';
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function moveBook(bookId, newFolder, selectEl) {
  if (!newFolder) return;
  try {
    await db.collection('books').doc(bookId).update({ category: newFolder });
    showToast('Moved to "' + newFolder + '"!', 'success');
    if (selectEl) selectEl.value = '';
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteFolder(folder, count) {
  const msg = count > 0
    ? 'Delete "' + folder + '" and its ' + count + ' books? This cannot be undone.'
    : 'Delete the empty folder "' + folder + '"?';
  if (!confirm(msg)) return;
  try {
    if (count > 0) {
      const snap  = await db.collection('books').where('category', '==', folder).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await db.collection('folders').doc(folder).delete().catch(() => {});
    showToast('"' + folder + '" deleted.', 'success');
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
