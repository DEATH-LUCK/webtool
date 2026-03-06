// ============================================================
// ADMIN.JS — Admin Panel: Users, Folders, Move Books
// ============================================================

function openAdminPanel() {
  document.getElementById('adminPanel').classList.add('open');
  loadAdminPanel();
}
function closeAdminPanel() {
  document.getElementById('adminPanel').classList.remove('open');
}
async function loadAdminPanel() {
  await loadUsersTab();
  await loadFoldersTab();
}

// ── Switch Tabs ───────────────────────────────────────────────
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.style.display = 'none');
  document.getElementById('adminTab_' + tab).style.display = 'block';
  event.target.classList.add('active');
}

// ── USERS TAB ─────────────────────────────────────────────────
async function loadUsersTab() {
  const container = document.getElementById('adminUsersList');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text2); padding:12px;">Loading...</p>';
  try {
    const snapshot = await db.collection('users').get();
    container.innerHTML = '';
    if (snapshot.empty) {
      container.innerHTML = '<p style="color:var(--text2); padding:12px;">No users found.</p>';
      return;
    }
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const isAdmin = data.role === 'admin';
      const isSelf = doc.id === currentUser.email || doc.id === currentUser.uid;
      const div = document.createElement('div');
      div.className = 'admin-user-row';
      div.innerHTML = `
        <div class="admin-user-info">
          <div class="admin-user-email">${doc.id}</div>
          <div class="admin-user-role ${isAdmin ? 'role-admin' : 'role-user'}">${isAdmin ? '👑 Admin' : '👤 User'}</div>
        </div>
        <div class="admin-user-actions">
          ${!isSelf ? `<button class="btn btn-ghost btn-sm" onclick="toggleAdminRole('${doc.id}', ${isAdmin})">${isAdmin ? '⬇️ Make User' : '⬆️ Make Admin'}</button>` : '<span style="color:var(--text2);font-size:0.75rem;">You</span>'}
        </div>`;
      container.appendChild(div);
    });
  } catch(e) {
    container.innerHTML = '<p style="color:var(--danger); padding:12px;">Error: ' + e.message + '</p>';
  }
}

async function toggleAdminRole(userId, isCurrentlyAdmin) {
  try {
    const newRole = isCurrentlyAdmin ? 'user' : 'admin';
    await db.collection('users').doc(userId).update({ role: newRole });
    showToast(userId + ' is now ' + newRole + '!', 'success');
    await loadUsersTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function addNewAdmin() {
  const emailInput = document.getElementById('newAdminEmail');
  const email = emailInput.value.trim();
  if (!email) { showToast('Email daalo', 'error'); return; }
  try {
    const snapshot = await db.collection('users').get();
    let found = false;
    for (const doc of snapshot.docs) {
      if (doc.id === email || doc.data().email === email) {
        await db.collection('users').doc(doc.id).update({ role: 'admin' });
        found = true;
        break;
      }
    }
    if (!found) {
      await db.collection('users').doc(email).set({ role: 'admin', email: email }, { merge: true });
    }
    showToast(email + ' ko admin bana diya!', 'success');
    emailInput.value = '';
    await loadUsersTab();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ── FOLDERS TAB ───────────────────────────────────────────────
async function loadFoldersTab() {
  const container = document.getElementById('adminFoldersList');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text2); padding:12px;">Loading...</p>';

  try {
    // Load books
    const booksSnap = await db.collection('books').get();
    const folderMap = {};
    booksSnap.docs.forEach(doc => {
      const d = doc.data();
      const cat = d.category || 'General';
      if (!folderMap[cat]) folderMap[cat] = [];
      folderMap[cat].push({ id: doc.id, title: d.title || 'Untitled' });
    });

    // Load empty folders
    const foldersSnap = await db.collection('folders').get();
    foldersSnap.docs.forEach(doc => {
      if (!folderMap[doc.id]) folderMap[doc.id] = [];
    });

    const allFolderNames = Object.keys(folderMap);
    container.innerHTML = '';

    // New folder input
    container.innerHTML = `
      <div class="admin-new-folder">
        <input type="text" id="newFolderNameInput" class="form-input" placeholder="New folder name..." style="flex:1; min-width:0;">
        <button class="btn btn-primary btn-sm" onclick="createNewFolder()">➕ Create</button>
      </div>`;

    if (allFolderNames.length === 0) {
      container.innerHTML += '<p style="color:var(--text2); text-align:center; padding:20px;">No folders yet</p>';
      return;
    }

    allFolderNames.sort().forEach(folder => {
      const books = folderMap[folder];
      const safeId = 'fb_' + folder.replace(/[^a-zA-Z0-9]/g, '_');

      const booksHtml = books.length === 0
        ? '<p style="color:var(--text2); font-size:0.82rem; padding:12px;">Empty folder — upload karo ya delete karo</p>'
        : books.map(b =>
            '<div class="admin-book-row">' +
            '<span class="admin-book-title">📄 ' + b.title + '</span>' +
            '<select class="admin-move-select" onchange="moveBook(\'' + b.id + '\', this.value)">' +
            '<option value="">📂 Move to...</option>' +
            allFolderNames.filter(f => f !== folder).map(f => '<option value="' + f + '">📁 ' + f + '</option>').join('') +
            '</select></div>'
          ).join('');

      const folderDiv = document.createElement('div');
      folderDiv.className = 'admin-folder-row';
      folderDiv.innerHTML =
        '<div class="admin-folder-header" onclick="toggleFolderExpand(\'' + safeId + '\')">' +
          '<div style="display:flex; align-items:center; gap:8px;">' +
            '<span class="folder-chevron" id="chev_' + safeId + '">▶</span>' +
            '<strong>📁 ' + folder + '</strong>' +
            '<span style="color:var(--text2); font-size:0.78rem;">(' + books.length + ' books)</span>' +
          '</div>' +
          '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteFolder(\'' + folder + '\', ' + books.length + ')">🗑 Delete</button>' +
        '</div>' +
        '<div class="admin-folder-books" id="' + safeId + '" style="display:none;">' +
          booksHtml +
        '</div>';

      container.appendChild(folderDiv);
    });

  } catch(e) {
    container.innerHTML = '<p style="color:var(--danger); padding:12px;">Error: ' + e.message + '</p>';
  }
}

function toggleFolderExpand(id) {
  const el = document.getElementById(id);
  const chev = document.getElementById('chev_' + id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (chev) chev.textContent = isOpen ? '▶' : '▼';
}

async function createNewFolder() {
  const input = document.getElementById('newFolderNameInput');
  const name = input ? input.value.trim() : '';
  if (!name) { showToast('Folder ka naam daalo', 'error'); return; }
  try {
    await db.collection('folders').doc(name).set({
      name: name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('📁 "' + name + '" folder bana diya!', 'success');
    if (input) input.value = '';
    addFolderToDropdown(name);
    if (typeof loadAllFolders === 'function') await loadAllFolders();
    await loadFoldersTab();
    await loadBooks();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function addFolderToDropdown(name) {
  const select = document.getElementById('bookCategory');
  if (!select) return;
  const exists = Array.from(select.options).some(o => o.value === name);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = '📁 ' + name;
    const lastOpt = select.querySelector('option[value="__new__"]');
    if (lastOpt) select.insertBefore(opt, lastOpt);
    else select.appendChild(opt);
  }
}

async function moveBook(bookId, newFolder) {
  if (!newFolder) return;
  try {
    await db.collection('books').doc(bookId).update({ category: newFolder });
    showToast('Book moved to "' + newFolder + '"!', 'success');
    await loadFoldersTab();
    await loadBooks();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function deleteFolder(folder, bookCount) {
  const msg = bookCount > 0
    ? '"' + folder + '" folder aur uski ' + bookCount + ' books DELETE hongi. Pakka?'
    : '"' + folder + '" folder delete karna chahte ho?';
  if (!confirm(msg)) return;
  try {
    if (bookCount > 0) {
      const snap = await db.collection('books').where('category', '==', folder).get();
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    await db.collection('folders').doc(folder).delete().catch(() => {});
    showToast('"' + folder + '" delete ho gaya!', 'success');
    if (typeof loadAllFolders === 'function') await loadAllFolders();
    await loadFoldersTab();
    await loadBooks();
  } catch(e) {
    showToast('Error: ' + e.message, 'error');
  }
}
