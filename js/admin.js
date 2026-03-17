// ============================================================
// ADMIN.JS — Professional Admin Panel
// ============================================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function getMyPermissions() {
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (!doc.exists) return {};
    const data = doc.data();
    if (data.superadmin === true) return {
      superadmin:true, canApproveUsers:true, canManageAdmins:true,
      canDeleteBooks:true, canManageFolders:true, canViewStats:true, canBanUsers:true
    };
    return data.permissions || {};
  } catch(e) { return {}; }
}

async function openAdminPanel() {
  if (currentRole !== 'admin') return;
  // Auto superadmin for owner
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
  if (tab === 'stats')   loadStatsPane();
  if (tab === 'logs')    loadLogsPane();
}

// ══════════════════════════════════════════════════════════════
// USERS TAB
// ══════════════════════════════════════════════════════════════
async function loadUsersPane() {
  const el = document.getElementById('usersList');
  el.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">Loading...</p>';
  try {
    const myPerms = await getMyPermissions();
    const snap    = await db.collection('users').get();
    if (snap.empty) { el.innerHTML = '<p class="muted">No users found.</p>'; return; }
    el.innerHTML = '';

    const pending  = [], admins = [], users = [], banned = [];
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (d.status === 'pending')  pending.push({doc, data:d});
      else if (d.status === 'banned') banned.push({doc, data:d});
      else if (d.role === 'admin') admins.push({doc, data:d});
      else                         users.push({doc, data:d});
    });

    function sectionHeader(icon, label, count, color) {
      const h = document.createElement('div');
      h.style.cssText = 'display:flex;align-items:center;gap:8px;margin:16px 0 8px;';
      h.innerHTML = '<span style="font-size:0.8rem;font-weight:700;color:' + color + ';">' + icon + ' ' + label + ' (' + count + ')</span>';
      el.appendChild(h);
    }

    function renderRow(doc, data, myPerms) {
      const email      = data.email || '(no email)';
      const isAdmin    = data.role === 'admin';
      const isSuperAdm = data.superadmin === true;
      const isBanned   = data.status === 'banned';
      const isPending  = data.status === 'pending';
      const isSelf     = doc.id === currentUser.uid;

      const row = document.createElement('div');
      row.className = 'user-row';
      if (isPending) row.style.borderColor = 'var(--amber)';
      if (isBanned)  row.style.borderColor = '#ff4444';

      let badge = '';
      if (isSuperAdm)  badge = '<span style="color:#ff6b6b;font-size:0.72rem;">⭐ Super Admin</span>';
      else if (isAdmin) badge = '<span style="color:var(--amber);font-size:0.72rem;">👑 Admin</span>';
      else if (isBanned)badge = '<span style="color:#ff4444;font-size:0.72rem;">🚫 Banned</span>';
      else if (isPending)badge= '<span style="color:var(--amber);font-size:0.72rem;">⏳ Pending</span>';
      else              badge = '<span style="color:var(--text2);font-size:0.72rem;">👤 User</span>';

      // Joined date
      let joined = '';
      if (data.createdAt) {
        try { joined = '<span style="color:var(--text2);font-size:0.7rem;">Joined: ' + data.createdAt.toDate().toLocaleDateString() + '</span>'; } catch(e) {}
      }

      let actions = '';
      if (isSelf) {
        actions = '<span class="muted" style="font-size:0.75rem;">You</span>';
      } else if (isPending) {
        if (myPerms.superadmin || myPerms.canApproveUsers) {
          actions =
            '<button class="btn btn-primary btn-sm" onclick="approveUser(\'' + doc.id + '\')">✅ Approve</button>' +
            '<button class="btn btn-danger btn-sm" onclick="rejectUser(\'' + doc.id + '\')">✕ Reject</button>';
        } else {
          actions = '<span class="muted" style="font-size:0.72rem;">No permission</span>';
        }
      } else if (isBanned) {
        if (myPerms.superadmin || myPerms.canBanUsers) {
          actions = '<button class="btn btn-ghost btn-sm" onclick="unbanUser(\'' + doc.id + '\')">🔓 Unban</button>';
        }
      } else if (isAdmin) {
        if (myPerms.superadmin) {
          actions =
            '<button class="btn btn-ghost btn-sm" onclick="openPermissions(\'' + doc.id + '\',\'' + escapeHtml(email) + '\')">⚙️ Perms</button>' +
            '<button class="btn btn-danger btn-sm" onclick="demoteAdmin(\'' + doc.id + '\')">⬇ Demote</button>';
        } else {
          actions = '<span class="muted" style="font-size:0.72rem;">Super Admin only</span>';
        }
      } else {
        let btns = [];
        if (myPerms.superadmin || myPerms.canManageAdmins) {
          btns.push('<button class="btn btn-ghost btn-sm" onclick="promoteToAdmin(\'' + doc.id + '\',\'' + escapeHtml(email) + '\')">⬆ Admin</button>');
        }
        if (myPerms.superadmin || myPerms.canBanUsers) {
          btns.push('<button class="btn btn-danger btn-sm" onclick="banUser(\'' + doc.id + '\')">🚫 Ban</button>');
        }
        if (myPerms.superadmin) {
          btns.push('<button class="btn btn-danger btn-sm" onclick="deleteUser(\'' + doc.id + '\',\'' + escapeHtml(email) + '\')">🗑</button>');
        }
        actions = btns.join('') || '<span class="muted" style="font-size:0.72rem;">No actions</span>';
      }

      row.innerHTML =
        '<div class="user-info">' +
          '<div class="user-email" style="font-size:0.85rem;word-break:break-all;">' + escapeHtml(email) + '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' + badge + joined + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px;align-items:center;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">' + actions + '</div>';

      el.appendChild(row);
    }

    if (pending.length)  { sectionHeader('⏳','PENDING APPROVAL', pending.length, 'var(--amber)'); pending.forEach(({doc,data}) => renderRow(doc, data, myPerms)); }
    if (banned.length)   { sectionHeader('🚫','BANNED USERS',     banned.length,  '#ff4444');       banned.forEach(({doc,data})  => renderRow(doc, data, myPerms)); }
    if (admins.length)   { sectionHeader('👑','ADMINS',           admins.length,  'var(--amber)');  admins.forEach(({doc,data})  => renderRow(doc, data, myPerms)); }
    if (users.length)    { sectionHeader('👤','USERS',            users.length,   'var(--text2)');  users.forEach(({doc,data})   => renderRow(doc, data, myPerms)); }

  } catch(e) {
    el.innerHTML = '<p style="color:var(--danger)">Error: ' + e.message + '</p>';
    console.error(e);
  }
}

async function approveUser(userId) {
  try {
    await db.collection('users').doc(userId).update({ status: 'approved' });
    await logAction('Approved user: ' + userId);
    showToast('✅ User approved!', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function rejectUser(userId) {
  if (!confirm('Reject and delete this user?')) return;
  try {
    await db.collection('users').doc(userId).delete();
    await logAction('Rejected user: ' + userId);
    showToast('User rejected.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function banUser(userId) {
  if (!confirm('Ban this user? They will not be able to login.')) return;
  try {
    await db.collection('users').doc(userId).update({ status: 'banned' });
    await logAction('Banned user: ' + userId);
    showToast('🚫 User banned.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function unbanUser(userId) {
  try {
    await db.collection('users').doc(userId).update({ status: 'approved' });
    await logAction('Unbanned user: ' + userId);
    showToast('🔓 User unbanned.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteUser(userId, email) {
  if (!confirm('Permanently delete ' + email + '? This cannot be undone.')) return;
  try {
    await db.collection('users').doc(userId).delete();
    await logAction('Deleted user: ' + email);
    showToast('User deleted.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function promoteToAdmin(userId, email) {
  if (!confirm('Make ' + email + ' an admin?')) return;
  try {
    await db.collection('users').doc(userId).update({
      role: 'admin', status: 'approved',
      permissions: { canApproveUsers:true, canManageAdmins:false, canDeleteBooks:true, canManageFolders:true, canBanUsers:true, canViewStats:true }
    });
    await logAction('Promoted to admin: ' + email);
    showToast(email + ' is now an admin!', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function demoteAdmin(userId) {
  if (!confirm('Remove admin role?')) return;
  try {
    await db.collection('users').doc(userId).update({ role: 'user', superadmin: false, permissions: {} });
    await logAction('Demoted admin: ' + userId);
    showToast('Demoted to user.', 'success');
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function addAdmin() {
  const input = document.getElementById('adminEmailInput');
  const email = input?.value.trim();
  if (!email) { showToast('Enter an email.', 'error'); return; }
  try {
    const snap = await db.collection('users').get();
    let found  = false;
    for (const doc of snap.docs) {
      if (doc.data().email === email) {
        await db.collection('users').doc(doc.id).update({
          role: 'admin', status: 'approved',
          permissions: { canApproveUsers:true, canManageAdmins:false, canDeleteBooks:true, canManageFolders:true, canBanUsers:true, canViewStats:true }
        });
        found = true; break;
      }
    }
    if (!found) showToast('User not found. They must sign up first.', 'error');
    else { showToast(email + ' is now admin!', 'success'); input.value = ''; loadUsersPane(); }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ── Permissions Modal ─────────────────────────────────────────
async function openPermissions(userId, email) {
  const doc  = await db.collection('users').doc(userId).get();
  const p    = doc.exists ? (doc.data().permissions || {}) : {};

  const modal = document.createElement('div');
  modal.id = 'permModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML =
    '<div style="background:var(--card);border-radius:16px;padding:24px;width:100%;max-width:400px;max-height:90vh;overflow-y:auto;">' +
      '<h3 style="margin:0 0 4px;color:var(--amber);">⚙️ Admin Permissions</h3>' +
      '<p style="color:var(--text2);font-size:0.82rem;margin-bottom:20px;">' + escapeHtml(email) + '</p>' +
      permCheck('canApproveUsers',  '✅ Approve / Reject Users',  p.canApproveUsers) +
      permCheck('canBanUsers',      '🚫 Ban / Unban Users',       p.canBanUsers) +
      permCheck('canManageAdmins',  '👑 Promote / Demote Admins', p.canManageAdmins) +
      permCheck('canDeleteBooks',   '🗑 Delete Books',             p.canDeleteBooks) +
      permCheck('canManageFolders', '📁 Manage Folders',           p.canManageFolders) +
      permCheck('canViewStats',     '📊 View Statistics',          p.canViewStats) +
      '<div style="display:flex;gap:10px;margin-top:20px;">' +
        '<button class="btn btn-primary" style="flex:1;" onclick="savePermissions(\'' + userId + '\')">💾 Save</button>' +
        '<button class="btn btn-ghost" onclick="document.getElementById(\'permModal\').remove()">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

function permCheck(key, label, checked) {
  return '<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;">' +
    '<input type="checkbox" id="perm_' + key + '" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--amber);">' +
    '<span style="font-size:0.9rem;">' + label + '</span>' +
    '</label>';
}

async function savePermissions(userId) {
  const perms = {
    canApproveUsers:  !!document.getElementById('perm_canApproveUsers')?.checked,
    canBanUsers:      !!document.getElementById('perm_canBanUsers')?.checked,
    canManageAdmins:  !!document.getElementById('perm_canManageAdmins')?.checked,
    canDeleteBooks:   !!document.getElementById('perm_canDeleteBooks')?.checked,
    canManageFolders: !!document.getElementById('perm_canManageFolders')?.checked,
    canViewStats:     !!document.getElementById('perm_canViewStats')?.checked,
  };
  try {
    await db.collection('users').doc(userId).update({ permissions: perms });
    await logAction('Updated permissions for: ' + userId);
    showToast('✅ Permissions saved!', 'success');
    document.getElementById('permModal')?.remove();
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// STATS TAB
// ══════════════════════════════════════════════════════════════
async function loadStatsPane() {
  const el = document.getElementById('adminPane_stats');
  el.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">Loading stats...</p>';
  try {
    const myPerms = await getMyPermissions();
    if (!myPerms.superadmin && !myPerms.canViewStats) {
      el.innerHTML = '<p class="muted" style="text-align:center;padding:40px;">🔒 No permission to view stats.</p>';
      return;
    }
    const [uSnap, bSnap, fSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('books').get(),
      db.collection('folders').get()
    ]);

    const users      = uSnap.docs.map(d => d.data());
    const totalUsers = users.length;
    const admins     = users.filter(u => u.role === 'admin').length;
    const pending    = users.filter(u => u.status === 'pending').length;
    const banned     = users.filter(u => u.status === 'banned').length;
    const totalBooks = bSnap.size;
    const totalFolders = fSnap.size;

    // File type breakdown
    const types = {};
    bSnap.docs.forEach(d => {
      const t = d.data().fileType || 'unknown';
      types[t] = (types[t] || 0) + 1;
    });

    // Total storage
    let totalBytes = 0;
    bSnap.docs.forEach(d => { totalBytes += d.data().fileSize || 0; });
    const totalSize = totalBytes > 1073741824
      ? (totalBytes/1073741824).toFixed(2) + ' GB'
      : totalBytes > 1048576
        ? (totalBytes/1048576).toFixed(1) + ' MB'
        : (totalBytes/1024).toFixed(1) + ' KB';

    el.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:4px;">' +
        statCard('👥', 'Total Users',   totalUsers, 'var(--amber)') +
        statCard('📚', 'Total Books',   totalBooks, 'var(--primary)') +
        statCard('📁', 'Folders',       totalFolders, '#4caf50') +
        statCard('💾', 'Storage Used',  totalSize, '#2196f3') +
        statCard('⏳', 'Pending',       pending, 'orange') +
        statCard('🚫', 'Banned',        banned, '#ff4444') +
        statCard('👑', 'Admins',        admins, 'var(--amber)') +
        statCard('✅', 'Active Users',  totalUsers - pending - banned, '#4caf50') +
      '</div>' +
      '<div style="margin-top:16px;padding:16px;background:var(--bg);border-radius:12px;">' +
        '<p style="font-weight:600;margin-bottom:10px;">📄 Books by Type</p>' +
        Object.entries(types).map(([t,c]) =>
          '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">' +
          '<span>' + t.toUpperCase() + '</span><strong>' + c + '</strong></div>'
        ).join('') +
      '</div>';
  } catch(e) {
    el.innerHTML = '<p style="color:var(--danger)">Error: ' + e.message + '</p>';
  }
}

function statCard(icon, label, value, color) {
  return '<div style="background:var(--bg);border-radius:12px;padding:16px;text-align:center;">' +
    '<div style="font-size:1.8rem;">' + icon + '</div>' +
    '<div style="font-size:1.4rem;font-weight:700;color:' + color + ';">' + value + '</div>' +
    '<div style="font-size:0.78rem;color:var(--text2);">' + label + '</div>' +
    '</div>';
}

// ══════════════════════════════════════════════════════════════
// LOGS TAB
// ══════════════════════════════════════════════════════════════
async function logAction(message) {
  try {
    await db.collection('logs').add({
      message,
      adminEmail: currentUser?.email || 'unknown',
      timestamp:  firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) {}
}

async function loadLogsPane() {
  const el = document.getElementById('adminPane_logs');
  el.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">Loading logs...</p>';
  try {
    const myPerms = await getMyPermissions();
    if (!myPerms.superadmin) {
      el.innerHTML = '<p class="muted" style="text-align:center;padding:40px;">🔒 Super Admin only.</p>';
      return;
    }
    const snap = await db.collection('logs').orderBy('timestamp', 'desc').limit(50).get();
    if (snap.empty) { el.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">No logs yet.</p>'; return; }
    el.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button class="btn btn-danger btn-sm" onclick="clearLogs()">🗑 Clear Logs</button></div>';
    snap.docs.forEach(doc => {
      const d    = doc.data();
      const time = d.timestamp ? d.timestamp.toDate().toLocaleString() : 'just now';
      const row  = document.createElement('div');
      row.style.cssText = 'padding:10px;border-bottom:1px solid var(--border);font-size:0.82rem;';
      row.innerHTML =
        '<div style="color:var(--text2);font-size:0.72rem;">' + time + ' — ' + escapeHtml(d.adminEmail) + '</div>' +
        '<div style="margin-top:2px;">' + escapeHtml(d.message) + '</div>';
      el.appendChild(row);
    });
  } catch(e) {
    el.innerHTML = '<p style="color:var(--danger)">Error: ' + e.message + '</p>';
  }
}

async function clearLogs() {
  if (!confirm('Clear all logs?')) return;
  try {
    const snap  = await db.collection('logs').get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    showToast('Logs cleared.', 'success');
    loadLogsPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// FOLDERS TAB
// ══════════════════════════════════════════════════════════════
async function loadFoldersPane() {
  const el = document.getElementById('foldersList');
  el.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">Loading...</p>';
  try {
    const myPerms  = await getMyPermissions();
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
      const safeId = 'fp_' + folder.replace(/[^a-z0-9]/gi,'_');
      const booksHtml = books.length === 0
        ? '<p class="muted" style="padding:12px;font-size:0.82rem;">Empty folder</p>'
        : books.map(b =>
            '<div class="folder-book-row">' +
            '<span class="folder-book-title">📄 ' + escapeHtml(b.title) + '</span>' +
            (canManage
              ? '<select class="move-select" onchange="moveBook(\'' + b.id + '\',this.value,this)">' +
                '<option value="">Move to...</option>' +
                allFolderNames.filter(f => f !== folder).map(f =>
                  '<option value="' + escapeHtml(f) + '">📁 ' + escapeHtml(f) + '</option>'
                ).join('') + '</select>'
              : '') +
            '</div>'
          ).join('');
      const div = document.createElement('div');
      div.className = 'folder-manage-row';
      div.innerHTML =
        '<div class="folder-manage-header" onclick="togglePane(\'' + safeId + '\')">' +
          '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span id="chev_' + safeId + '">▶</span>' +
            '<strong>📁 ' + escapeHtml(folder) + '</strong>' +
            '<span class="muted" style="font-size:0.78rem;">(' + books.length + ')</span>' +
          '</div>' +
          (canManage
            ? '<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteFolder(\'' + folder + '\',' + books.length + ')">🗑</button>'
            : '') +
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
    await logAction('Created folder: ' + name);
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
  const msg = count > 0 ? 'Delete "' + folder + '" and its ' + count + ' books?' : 'Delete empty folder "' + folder + '"?';
  if (!confirm(msg)) return;
  try {
    if (count > 0) {
      const snap  = await db.collection('books').where('category','==',folder).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await db.collection('folders').doc(folder).delete().catch(()=>{});
    await logAction('Deleted folder: ' + folder);
    showToast('"' + folder + '" deleted.', 'success');
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
