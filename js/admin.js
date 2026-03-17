// ============================================================
// ADMIN.JS — Admin Panel
// ============================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function openAdminPanel() {
  if (currentRole !== 'admin') return;
  // Auto-set superadmin for magargangman@gmail.com
  try {
    const myDoc = await db.collection('users').doc(currentUser.uid).get();
    if (myDoc.exists && !myDoc.data().superadmin && currentUser.email === 'magargangman@gmail.com') {
      await db.collection('users').doc(currentUser.uid).update({ superadmin: true });
    }
  } catch(e) {}
  document.getElementById('adminPanel').classList.add('open');
  showAdminTab('users', document.querySelector('.admin-tab-btn'));
}
function closeAdminPanel() {
  document.getElementById('adminPanel').classList.remove('open');
}

function showAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById('adminPane_' + tab);
  if (pane) pane.style.display = 'block';
  if (btn) btn.classList.add('active');
  if (tab === 'users')   loadUsersPane();
  if (tab === 'folders') loadFoldersPane();
}

// ── Get current admin permissions ────────────────────────────
async function getMyPermissions() {
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (!doc.exists) return {};
    const data = doc.data();
    // superadmin has all permissions
    if (data.superadmin === true) return { superadmin: true, canApproveUsers: true, canManageAdmins: true, canDeleteBooks: true, canManageFolders: true };
    return data.permissions || {};
  } catch(e) { return {}; }
}

// ── USERS ─────────────────────────────────────────────────────
async function loadUsersPane() {
  const el = document.getElementById('usersList');
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const myPerms = await getMyPermissions();
    const snap = await db.collection('users').get();

    if (snap.empty) { el.innerHTML = '<p class="muted">No users found.</p>'; return; }
    el.innerHTML = '';

    // Sort: pending first, then admins, then users
    const docs = snap.docs.sort((a, b) => {
      const order = (d) => {
        if (d.status === 'pending') return 0;
        if (d.role === 'admin')     return 1;
        return 2;
      };
      return order(a.data()) - order(b.data());
    });

    // Section headers
    let shownPending = false, shownAdmins = false, shownUsers = false;

    docs.forEach(doc => {
      const data      = doc.data();
      // Get email from data.email field (not doc.id which is UID)
      const email     = data.email || '(no email)';
      const isAdmin   = data.role === 'admin';
      const isSuperAdmin = data.superadmin === true;
      const isPending = data.status === 'pending';
      const isSelf    = doc.id === currentUser.uid;

      // Section headers
      if (isPending && !shownPending) {
        shownPending = true;
        const h = document.createElement('div');
        h.innerHTML = '<p style="color:var(--amber);font-weight:600;margin:12px 0 6px;font-size:0.85rem;">⏳ PENDING APPROVAL</p>';
        el.appendChild(h);
      } else if (!isPending && isAdmin && !shownAdmins) {
        shownAdmins = true;
        const h = document.createElement('div');
        h.innerHTML = '<p style="color:var(--text2);font-weight:600;margin:12px 0 6px;font-size:0.85rem;">👑 ADMINS</p>';
        el.appendChild(h);
      } else if (!isPending && !isAdmin && !shownUsers) {
        shownUsers = true;
        const h = document.createElement('div');
        h.innerHTML = '<p style="color:var(--text2);font-weight:600;margin:12px 0 6px;font-size:0.85rem;">👤 USERS</p>';
        el.appendChild(h);
      }

      const row = document.createElement('div');
      row.className = 'user-row';
      if (isPending) row.style.cssText = 'border-color:var(--amber);background:rgba(232,164,53,0.05);';

      // Badge
      let badge = '';
      if (isPending)       badge = '<span style="color:var(--amber);font-size:0.72rem;">⏳ Pending</span>';
      else if (isSuperAdmin) badge = '<span style="color:#ff6b6b;font-size:0.72rem;">⭐ Super Admin</span>';
      else if (isAdmin)    badge = '<span style="color:var(--amber);font-size:0.72rem;">👑 Admin</span>';
      else                 badge = '<span style="color:var(--text2);font-size:0.72rem;">👤 User</span>';

      // Actions
      let actions = '';

      if (isPending) {
        // Approve/reject pending users — needs canApproveUsers permission
        if (myPerms.superadmin || myPerms.canApproveUsers) {
          actions =
            '<button class="btn btn-primary btn-sm" onclick="approveUser(\'' + doc.id + '\')">✅ Approve</button>' +
            '<button class="btn btn-danger btn-sm" onclick="rejectUser(\'' + doc.id + '\')">✕</button>';
        } else {
          actions = '<span class="muted" style="font-size:0.72rem;">No permission</span>';
        }
      } else if (isSelf) {
        actions = '<span class="muted" style="font-size:0.75rem;">You</span>';
      } else if (isAdmin) {
        // Admin management — only superadmin can change other admins
        if (myPerms.superadmin) {
          if (true) {  // superadmin can manage all other admins
            actions =
              '<button class="btn btn-ghost btn-sm" onclick="openPermissions(\'' + doc.id + '\',\'' + escapeHtml(email) + '\')">⚙️ Permissions</button>' +
              '<button class="btn btn-danger btn-sm" onclick="demoteAdmin(\'' + doc.id + '\')">⬇ User</button>';
          }
        } else {
          actions = '<span class="muted" style="font-size:0.72rem;">Super Admin only</span>';
        }
      } else {
        // Normal user — promote to admin needs canManageAdmins
        if (myPerms.superadmin || myPerms.canManageAdmins) {
          actions = '<button class="btn btn-ghost btn-sm" onclick="promoteToAdmin(\'' + doc.id + '\',\'' + escapeHtml(email) + '\')">⬆ Make Admin</button>';
        }
      }

      row.innerHTML =
        '<div class="user-info">' +
          '<div class="user-email" style="font-size:0.85rem;word-break:break-all;">' + escapeHtml(email) + '</div>' +
          badge +
        '</div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">' + actions + '</div>';

      el.appendChild(row);
    });

  } catch(e) {
    el.innerHTML = '<p style="color:var(--danger)">Error: ' + e.message + '</p>';
    console.error(e);
  }
}

async function approveUser(userId) {
  try {
    await db.collection('users').doc(userId).update({ status: 'approved' });
    showToast('✅ User approved!', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function rejectUser(userId) {
  if (!confirm('Reject and delete this user?')) return;
  try {
    await db.collection('users').doc(userId).delete();
    showToast('User rejected and removed.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function promoteToAdmin(userId, email) {
  if (!confirm('Make ' + email + ' an admin?')) return;
  try {
    // Default permissions for new admin
    await db.collection('users').doc(userId).update({
      role: 'admin',
      status: 'approved',
      permissions: {
        canApproveUsers:  true,
        canManageAdmins:  false,
        canDeleteBooks:   true,
        canManageFolders: true,
      }
    });
    showToast(email + ' is now an admin!', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function demoteAdmin(userId) {
  if (!confirm('Remove admin role from this user?')) return;
  try {
    await db.collection('users').doc(userId).update({ 
      role: 'user', 
      superadmin: false,
      permissions: {} 
    });
    showToast('Admin demoted to user.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ── Permissions Modal ─────────────────────────────────────────
async function openPermissions(userId, email) {
  const doc  = await db.collection('users').doc(userId).get();
  const data = doc.data();
  const p    = data.permissions || {};

  const modal = document.createElement('div');
  modal.id = 'permModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:var(--card);border-radius:16px;padding:24px;width:100%;max-width:400px;">' +
      '<h3 style="margin:0 0 4px;">⚙️ Permissions</h3>' +
      '<p style="color:var(--text2);font-size:0.85rem;margin-bottom:20px;">' + escapeHtml(email) + '</p>' +
      permCheck('canApproveUsers',  '✅ Approve/Reject Users', p.canApproveUsers) +
      permCheck('canManageAdmins',  '👑 Manage Admins',        p.canManageAdmins) +
      permCheck('canDeleteBooks',   '🗑 Delete Books',          p.canDeleteBooks) +
      permCheck('canManageFolders', '📁 Manage Folders',        p.canManageFolders) +
      '<div style="display:flex;gap:10px;margin-top:20px;">' +
        '<button class="btn btn-primary" style="flex:1;" onclick="savePermissions(\'' + userId + '\')">Save</button>' +
        '<button class="btn btn-ghost" onclick="document.getElementById(\'permModal\').remove()">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

function permCheck(key, label, checked) {
  return '<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;">' +
    '<input type="checkbox" id="perm_' + key + '" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;">' +
    '<span>' + label + '</span>' +
    '</label>';
}

async function savePermissions(userId) {
  const perms = {
    canApproveUsers:  document.getElementById('perm_canApproveUsers')?.checked  || false,
    canManageAdmins:  document.getElementById('perm_canManageAdmins')?.checked  || false,
    canDeleteBooks:   document.getElementById('perm_canDeleteBooks')?.checked   || false,
    canManageFolders: document.getElementById('perm_canManageFolders')?.checked || false,
  };
  try {
    await db.collection('users').doc(userId).update({ permissions: perms });
    showToast('Permissions saved!', 'success');
    document.getElementById('permModal')?.remove();
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ── Add Admin by email ────────────────────────────────────────
async function addAdmin() {
  const input = document.getElementById('adminEmailInput');
  const email = input?.value.trim();
  if (!email) { showToast('Enter an email address.', 'error'); return; }
  try {
    const snap = await db.collection('users').get();
    let found = false;
    for (const doc of snap.docs) {
      if (doc.data().email === email) {
        await db.collection('users').doc(doc.id).update({
          role: 'admin', status: 'approved',
          permissions: { canApproveUsers: true, canManageAdmins: false, canDeleteBooks: true, canManageFolders: true }
        });
        found = true; break;
      }
    }
    if (!found) showToast('User not found. They must sign up first.', 'error');
    else { showToast(email + ' is now an admin!', 'success'); input.value = ''; loadUsersPane(); }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ── FOLDERS ───────────────────────────────────────────────────
async function loadFoldersPane() {
  const el = document.getElementById('foldersList');
  el.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const myPerms = await getMyPermissions();
    const canManage = myPerms.superadmin || myPerms.canManageFolders;

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

    allFolderNames.forEach(folder => {
      const books  = folderMap[folder];
      const safeId = 'fp_' + folder.replace(/[^a-z0-9]/gi, '_');

      const booksHtml = books.length === 0
        ? '<p class="muted" style="padding:12px;font-size:0.82rem;">Empty folder</p>'
        : books.map(b =>
            '<div class="folder-book-row">' +
            '<span class="folder-book-title">📄 ' + escapeHtml(b.title) + '</span>' +
            (canManage ? '<select class="move-select" onchange="moveBook(\'' + b.id + '\',this.value,this)">' +
            '<option value="">Move to...</option>' +
            allFolderNames.filter(f => f !== folder).map(f =>
              '<option value="' + escapeHtml(f) + '">📁 ' + escapeHtml(f) + '</option>'
            ).join('') + '</select>' : '') +
            '</div>'
          ).join('');

      const div = document.createElement('div');
      div.className = 'folder-manage-row';
      div.innerHTML =
        '<div class="folder-manage-header" onclick="togglePane(\'' + safeId + '\')">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span class="chevron" id="chev_' + safeId + '">▶</span>' +
            '<strong>📁 ' + escapeHtml(folder) + '</strong>' +
            '<span class="muted" style="font-size:0.78rem;">(' + books.length + ' books)</span>' +
          '</div>' +
          (canManage ? '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteFolder(\'' + folder + '\',' + books.length + ')">🗑</button>' : '') +
        '</div>' +
        '<div class="folder-manage-body" id="' + safeId + '" style="display:none;">' + booksHtml + '</div>';
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
  const input = document.getElementById('newFolderInput');
  const name  = input?.value.trim();
  if (!name) { showToast('Enter a folder name.', 'error'); return; }
  try {
    await db.collection('folders').doc(name).set({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
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
    ? 'Delete "' + folder + '" and its ' + count + ' books?'
    : 'Delete the empty folder "' + folder + '"?';
  if (!confirm(msg)) return;
  try {
    if (count > 0) {
      const snap  = await db.collection('books').where('category','==',folder).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await db.collection('folders').doc(folder).delete().catch(()=>{});
    showToast('"' + folder + '" deleted.', 'success');
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
