// ============================================================
// ADMIN.JS — Admin Panel (v2 — full management)
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

function showAdminTab(tab, evtTarget) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="adminPane_"]').forEach(p => p.style.display = 'none');
  document.getElementById('adminPane_' + tab).style.display = 'block';
  if (evtTarget) evtTarget.classList.add('active');
  if (tab === 'users')   loadUsersPane();
  if (tab === 'folders') loadFoldersPane();
}

function _showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="adminPane_"]').forEach(p => p.style.display = 'none');
  document.getElementById('adminPane_' + tab).style.display = 'block';
  const btn = document.querySelector('.admin-tab-btn[data-tab="' + tab + '"]');
  if (btn) btn.classList.add('active');
  if (tab === 'users')   loadUsersPane();
  if (tab === 'folders') loadFoldersPane();
}

// ══════════════════════════════════════════════
// USERS PANE
// ══════════════════════════════════════════════
async function loadUsersPane() {
  const el = document.getElementById('usersList');
  el.innerHTML = '<p class="muted" style="padding:16px 0">Loading users…</p>';
  try {
    const snap = await db.collection('users').get();
    if (snap.empty) {
      el.innerHTML = '<p class="muted" style="padding:16px 0">No users found.</p>';
      return;
    }
    el.innerHTML = '';

    // Sort: admins first, then by email/id
    const docs = snap.docs.slice().sort((a, b) => {
      const aAdmin = a.data().role === 'admin' ? 0 : 1;
      const bAdmin = b.data().role === 'admin' ? 0 : 1;
      if (aAdmin !== bAdmin) return aAdmin - bAdmin;
      const aEmail = a.data().email || a.id;
      const bEmail = b.data().email || b.id;
      return aEmail.localeCompare(bEmail);
    });

    docs.forEach(doc => {
      const data    = doc.data();
      const isAdmin = data.role === 'admin';
      // Show email if stored, otherwise show UID truncated
      const displayEmail = data.email || doc.id;
      const isUID  = !data.email; // if no email field, it's a UID
      const isSelf = doc.id === currentUser.uid || doc.id === currentUser.email;

      const row = document.createElement('div');
      row.className = 'user-row';

      // Avatar circle
      const avatar = document.createElement('div');
      avatar.className = 'user-avatar ' + (isAdmin ? 'user-avatar-admin' : '');
      avatar.textContent = displayEmail[0].toUpperCase();

      // Info section
      const info = document.createElement('div');
      info.className = 'user-info';

      const emailEl = document.createElement('div');
      emailEl.className = 'user-email';
      emailEl.textContent = displayEmail;
      // If UID being shown, add a warning title
      if (isUID) emailEl.title = 'UID: ' + doc.id + ' (email not stored)';

      const badgeEl = document.createElement('div');
      badgeEl.className = 'user-role-badge ' + (isAdmin ? 'role-admin' : 'role-user');
      badgeEl.textContent = isAdmin ? '⬟ Admin' : '○ User';

      info.appendChild(emailEl);
      info.appendChild(badgeEl);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'user-actions';

      if (isSelf) {
        const selfBadge = document.createElement('span');
        selfBadge.className = 'you-badge';
        selfBadge.textContent = 'You';
        actions.appendChild(selfBadge);
      } else {
        // Toggle role button
        const roleBtn = document.createElement('button');
        roleBtn.className = 'btn btn-sm ' + (isAdmin ? 'btn-ghost' : 'btn-amber-outline');
        roleBtn.textContent = isAdmin ? '↓ Make User' : '↑ Make Admin';
        roleBtn.title = isAdmin ? 'Revoke admin access' : 'Grant admin access';
        roleBtn.onclick = () => toggleRole(doc.id, isAdmin);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-sm btn-danger';
        delBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
        delBtn.title = 'Delete user';
        delBtn.onclick = () => deleteUser(doc.id, displayEmail, isAdmin);

        actions.appendChild(roleBtn);
        actions.appendChild(delBtn);
      }

      row.appendChild(avatar);
      row.appendChild(info);
      row.appendChild(actions);
      el.appendChild(row);
    });

    // User count badge
    const countEl = document.getElementById('userCountBadge');
    if (countEl) countEl.textContent = snap.size;

  } catch(e) {
    el.innerHTML = '<p class="error-msg">Error loading users: ' + e.message + '</p>';
  }
}

async function toggleRole(userId, isAdmin) {
  try {
    await db.collection('users').doc(userId).update({ role: isAdmin ? 'user' : 'admin' });
    showToast(isAdmin ? 'Role changed to User' : 'Role changed to Admin', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteUser(userId, displayEmail, isAdmin) {
  if (isAdmin) {
    showToast('Cannot delete an admin. Demote to User first.', 'error');
    return;
  }
  const confirmed = confirm('Delete user "' + displayEmail + '"?\n\nThis removes their access record. Their books will remain.');
  if (!confirmed) return;
  try {
    await db.collection('users').doc(userId).delete();
    showToast('User removed.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function addAdmin() {
  const input = document.getElementById('adminEmailInput');
  const email = input.value.trim();
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
    input.value = '';
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════
// FOLDERS PANE
// ══════════════════════════════════════════════
async function loadFoldersPane() {
  const el = document.getElementById('foldersList');
  el.innerHTML = '<p class="muted" style="padding:16px 0">Loading folders…</p>';
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
      folderMap[cat].push({ id: doc.id, title: d.title || 'Untitled', author: d.author || '' });
    });

    const allFolderNames = Object.keys(folderMap).sort();
    el.innerHTML = '';

    // Folder count badge
    const countEl = document.getElementById('folderCountBadge');
    if (countEl) countEl.textContent = allFolderNames.length;

    if (allFolderNames.length === 0) {
      el.innerHTML = '<div class="empty-admin"><div class="empty-admin-icon">📂</div><p>No folders yet. Create one above.</p></div>';
      return;
    }

    allFolderNames.forEach(folderName => {
      const books  = folderMap[folderName];
      const safeId = 'fp_' + Math.random().toString(36).slice(2, 8);

      const card = document.createElement('div');
      card.className = 'folder-card';

      // ── Folder Card Header ────────────────────────────────
      const header = document.createElement('div');
      header.className = 'folder-card-header';

      const left = document.createElement('div');
      left.className = 'folder-card-left';
      left.onclick = () => toggleFolderCard(safeId);
      left.style.cursor = 'pointer';
      left.innerHTML =
        '<div class="folder-card-icon">📁</div>' +
        '<div class="folder-card-meta">' +
          '<span class="folder-card-name">' + escapeHtml(folderName) + '</span>' +
          '<span class="folder-card-count">' + books.length + ' book' + (books.length !== 1 ? 's' : '') + '</span>' +
        '</div>' +
        '<span class="folder-chevron" id="chev_' + safeId + '">›</span>';

      const headerActions = document.createElement('div');
      headerActions.className = 'folder-header-actions';

      // Rename button
      const renameBtn = document.createElement('button');
      renameBtn.className = 'btn btn-sm btn-ghost';
      renameBtn.innerHTML = '✏ Rename';
      renameBtn.onclick = (e) => { e.stopPropagation(); startRenameFolder(folderName, card); };

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg> Delete';
      delBtn.onclick = (e) => { e.stopPropagation(); deleteFolder(folderName, books.length); };

      headerActions.appendChild(renameBtn);
      headerActions.appendChild(delBtn);
      header.appendChild(left);
      header.appendChild(headerActions);

      // ── Rename inline input (hidden by default) ───────────
      const renameRow = document.createElement('div');
      renameRow.className = 'folder-rename-row';
      renameRow.id = 'rename_' + safeId;
      renameRow.style.display = 'none';
      renameRow.innerHTML =
        '<input type="text" class="folder-rename-input" placeholder="New folder name…" value="' + escapeHtml(folderName) + '">' +
        '<button class="btn btn-primary btn-sm rename-save-btn">Save</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="cancelRename(\'' + safeId + '\')">Cancel</button>';
      renameRow.querySelector('.rename-save-btn').onclick = () => {
        const newName = renameRow.querySelector('input').value.trim();
        renameFolder(folderName, newName, safeId);
      };

      // ── Books Body ─────────────────────────────────────────
      const body = document.createElement('div');
      body.className = 'folder-card-body';
      body.id = safeId;
      body.style.display = 'none';

      if (books.length === 0) {
        body.innerHTML = '<p class="folder-empty-msg">This folder is empty.</p>';
      } else {
        books.forEach(b => {
          const bookRow = document.createElement('div');
          bookRow.className = 'folder-book-entry';

          const bookInfo = document.createElement('div');
          bookInfo.className = 'folder-book-info';
          bookInfo.innerHTML =
            '<span class="folder-book-name">' + escapeHtml(b.title) + '</span>' +
            (b.author ? '<span class="folder-book-author">' + escapeHtml(b.author) + '</span>' : '');

          const moveWrap = document.createElement('div');
          moveWrap.className = 'folder-book-actions';

          const moveSelect = document.createElement('select');
          moveSelect.className = 'move-select';
          const defaultOpt = document.createElement('option');
          defaultOpt.value = ''; defaultOpt.textContent = 'Move to…';
          moveSelect.appendChild(defaultOpt);
          allFolderNames.filter(f => f !== folderName).forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f;
            moveSelect.appendChild(opt);
          });
          moveSelect.onchange = function() { if (this.value) moveBook(b.id, this.value, this); };

          // Delete book from here too
          const delBookBtn = document.createElement('button');
          delBookBtn.className = 'btn btn-sm btn-danger';
          delBookBtn.innerHTML = '🗑';
          delBookBtn.title = 'Delete this book';
          delBookBtn.onclick = () => {
            if (confirm('Delete "' + b.title + '"? This cannot be undone.')) {
              db.collection('books').doc(b.id).delete().then(() => {
                allBooks = allBooks.filter(ab => ab.id !== b.id);
                renderBooks();
                showToast('"' + b.title + '" deleted.', 'success');
                loadFoldersPane();
              }).catch(err => showToast('Error: ' + err.message, 'error'));
            }
          };

          moveWrap.appendChild(moveSelect);
          moveWrap.appendChild(delBookBtn);
          bookRow.appendChild(bookInfo);
          bookRow.appendChild(moveWrap);
          body.appendChild(bookRow);
        });
      }

      card.appendChild(header);
      card.appendChild(renameRow);
      card.appendChild(body);
      el.appendChild(card);
    });

  } catch(e) {
    el.innerHTML = '<p class="error-msg">Error: ' + e.message + '</p>';
  }
}

function toggleFolderCard(id) {
  const body = document.getElementById(id);
  const chev = document.getElementById('chev_' + id);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
}

function startRenameFolder(folderName, card) {
  const rows = card.querySelectorAll('.folder-rename-row');
  if (rows.length) {
    rows[0].style.display = rows[0].style.display === 'none' ? 'flex' : 'none';
    if (rows[0].style.display === 'flex') rows[0].querySelector('input').focus();
  }
}
function cancelRename(safeId) {
  const row = document.getElementById('rename_' + safeId);
  if (row) row.style.display = 'none';
}

async function renameFolder(oldName, newName, safeId) {
  if (!newName || newName === oldName) {
    showToast('Enter a different name.', 'error'); return;
  }
  try {
    // Create new folder doc
    await db.collection('folders').doc(newName).set({
      name: newName, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Move all books
    const snap = await db.collection('books').where('category', '==', oldName).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { category: newName }));
    await batch.commit();
    // Delete old folder
    await db.collection('folders').doc(oldName).delete().catch(() => {});
    showToast('Folder renamed to "' + newName + '"', 'success');
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
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
    showToast('Moved to "' + newFolder + '"', 'success');
    if (selectEl) selectEl.value = '';
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteFolder(folder, count) {
  const msg = count > 0
    ? 'Delete "' + folder + '" and all ' + count + ' book(s) inside?\nThis cannot be undone.'
    : 'Delete empty folder "' + folder + '"?';
  if (!confirm(msg)) return;
  try {
    if (count > 0) {
      const snap  = await db.collection('books').where('category', '==', folder).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      allBooks = allBooks.filter(b => b.category !== folder);
      renderBooks();
    }
    await db.collection('folders').doc(folder).delete().catch(() => {});
    showToast('"' + folder + '" deleted.', 'success');
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ── User Filter ───────────────────────────────────────────────
function filterUsers(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('#usersList .user-row').forEach(row => {
    const emailEl = row.querySelector('.user-email');
    const text = emailEl ? emailEl.textContent.toLowerCase() : '';
    row.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}
