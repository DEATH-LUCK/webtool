// ============================================================
// ADMIN.JS — Full Professional Admin Panel (Integrated)
// ============================================================

/**
 * Utility: Secures strings against XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Permissions Fetcher
 */
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
  } catch(e) { 
    console.error("Permission error:", e);
    return {}; 
  }
}

/**
 * Panel Controller
 */
async function openAdminPanel() {
  if (currentRole !== 'admin') {
    if (typeof showToast === 'function') showToast("Access Denied", "error");
    return;
  }
  
  // Auto superadmin for owner
  try {
    const ownerEmail = 'magargangman@gmail.com';
    const myDoc = await db.collection('users').doc(currentUser.uid).get();
    if (myDoc.exists && !myDoc.data().superadmin && currentUser.email === ownerEmail) {
      await db.collection('users').doc(currentUser.uid).update({ superadmin: true });
    }
  } catch(e) { console.warn("Auto-promote failed:", e); }

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
// USERS MANAGEMENT
// ══════════════════════════════════════════════════════════════

async function loadUsersPane() {
  const el = document.getElementById('usersList');
  el.innerHTML = '<p class="muted" style="text-align:center;padding:20px;">Loading directory...</p>';
  try {
    const myPerms = await getMyPermissions();
    const snap    = await db.collection('users').orderBy('email').get();
    if (snap.empty) { el.innerHTML = '<p class="muted">No users found.</p>'; return; }
    el.innerHTML = '';

    const groups = { pending: [], admins: [], users: [], banned: [] };
    snap.docs.forEach(doc => {
      const d = doc.data();
      if (d.status === 'pending')  groups.pending.push({doc, data:d});
      else if (d.status === 'banned') groups.banned.push({doc, data:d});
      else if (d.role === 'admin') groups.admins.push({doc, data:d});
      else groups.users.push({doc, data:d});
    });

    const sectionHeader = (icon, label, count, color) => {
      const h = document.createElement('div');
      h.style.cssText = `display:flex;align-items:center;gap:8px;margin:16px 0 8px;font-size:0.8rem;font-weight:700;color:${color};`;
      h.innerHTML = `${icon} ${label} (${count})`;
      el.appendChild(h);
    };

    if (groups.pending.length) {
      sectionHeader('⏳','PENDING APPROVAL', groups.pending.length, 'var(--amber)');
      groups.pending.forEach(item => renderUserRow(item.doc, item.data, myPerms));
    }
    if (groups.admins.length) {
      sectionHeader('👑','ADMINS', groups.admins.length, 'var(--amber)');
      groups.admins.forEach(item => renderUserRow(item.doc, item.data, myPerms));
    }
    if (groups.users.length) {
      sectionHeader('👤','USERS', groups.users.length, 'var(--text2)');
      groups.users.forEach(item => renderUserRow(item.doc, item.data, myPerms));
    }
    if (groups.banned.length) {
      sectionHeader('🚫','BANNED', groups.banned.length, '#ff4444');
      groups.banned.forEach(item => renderUserRow(item.doc, item.data, myPerms));
    }

  } catch(e) {
    el.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
  }
}

function renderUserRow(doc, data, myPerms) {
  const email = data.email || '(no email)';
  const isSelf = doc.id === currentUser.uid;
  const row = document.createElement('div');
  row.className = 'user-row';
  
  // Dynamic Badges
  let badge = '<span style="color:var(--text2);font-size:0.72rem;">👤 User</span>';
  if (data.superadmin) badge = '<span style="color:#ff6b6b;font-size:0.72rem;">⭐ Super Admin</span>';
  else if (data.role === 'admin') badge = '<span style="color:var(--amber);font-size:0.72rem;">👑 Admin</span>';

  // Action Buttons
  let actions = '';
  if (isSelf) {
    actions = '<span class="muted" style="font-size:0.75rem;">(You)</span>';
  } else {
    let btns = [];
    if (data.status === 'pending' && (myPerms.superadmin || myPerms.canApproveUsers)) {
      btns.push(`<button class="btn btn-primary btn-sm" onclick="approveUser('${doc.id}')">✅</button>`);
      btns.push(`<button class="btn btn-danger btn-sm" onclick="rejectUser('${doc.id}')">✕</button>`);
    }
    if (data.role === 'admin' && myPerms.superadmin) {
      btns.push(`<button class="btn btn-ghost btn-sm" onclick="openPermissions('${doc.id}','${escapeHtml(email)}')">⚙️</button>`);
      btns.push(`<button class="btn btn-danger btn-sm" onclick="demoteAdmin('${doc.id}')">⬇</button>`);
    }
    if (data.role !== 'admin' && data.status !== 'banned') {
      if (myPerms.superadmin || myPerms.canManageAdmins) btns.push(`<button class="btn btn-ghost btn-sm" onclick="promoteToAdmin('${doc.id}','${escapeHtml(email)}')">⬆ Admin</button>`);
      if (myPerms.superadmin || myPerms.canBanUsers) btns.push(`<button class="btn btn-danger btn-sm" onclick="banUser('${doc.id}')">🚫</button>`);
    }
    if (data.status === 'banned' && (myPerms.superadmin || myPerms.canBanUsers)) {
      btns.push(`<button class="btn btn-ghost btn-sm" onclick="unbanUser('${doc.id}')">🔓 Unban</button>`);
    }
    actions = btns.join('') || '<span class="muted" style="font-size:0.72rem;">Locked</span>';
  }

  row.innerHTML = `
    <div class="user-info">
      <div style="font-size:0.85rem;word-break:break-all;">${escapeHtml(email)}</div>
      <div style="display:flex;gap:6px;">${badge}</div>
    </div>
    <div style="display:flex;gap:4px;">${actions}</div>
  `;
  document.getElementById('usersList').appendChild(row);
}

// User Actions (Approve, Ban, Promote, etc.)
async function approveUser(id) {
  try { await db.collection('users').doc(id).update({ status: 'approved' }); showToast("User Approved", "success"); loadUsersPane(); } catch(e) { alert(e.message); }
}
async function banUser(id) {
  if (confirm("Ban this user?")) {
    try { await db.collection('users').doc(id).update({ status: 'banned' }); showToast("User Banned", "success"); loadUsersPane(); } catch(e) { alert(e.message); }
  }
}
async function unbanUser(id) {
  try { await db.collection('users').doc(id).update({ status: 'approved' }); showToast("User Unbanned", "success"); loadUsersPane(); } catch(e) { alert(e.message); }
}
async function promoteToAdmin(id, email) {
  if (confirm(`Promote ${email} to Admin?`)) {
    try { await db.collection('users').doc(id).update({ role: 'admin', permissions: { canApproveUsers:true, canDeleteBooks:true } }); loadUsersPane(); } catch(e) { alert(e.message); }
  }
}
async function demoteAdmin(id) {
  if (confirm("Demote to regular user?")) {
    try { await db.collection('users').doc(id).update({ role: 'user', superadmin: false }); loadUsersPane(); } catch(e) { alert(e.message); }
  }
}

// ══════════════════════════════════════════════════════════════
// PERMISSIONS MODAL
// ══════════════════════════════════════════════════════════════

async function openPermissions(userId, email) {
  const doc  = await db.collection('users').doc(userId).get();
  const p    = doc.exists ? (doc.data().permissions || {}) : {};

  const modal = document.createElement('div');
  modal.id = 'permModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--card);border-radius:16px;padding:24px;width:100%;max-width:400px;">
      <h3 style="margin:0;color:var(--amber);">⚙️ Permissions</h3>
      <p style="font-size:0.8rem;margin-bottom:15px;">${escapeHtml(email)}</p>
      ${permCheck('canApproveUsers',  'Approve Users',  p.canApproveUsers)}
      ${permCheck('canBanUsers',      'Ban Users',       p.canBanUsers)}
      ${permCheck('canManageAdmins',  'Manage Admins',   p.canManageAdmins)}
      ${permCheck('canDeleteBooks',   'Delete Books',    p.canDeleteBooks)}
      ${permCheck('canManageFolders', 'Manage Folders',  p.canManageFolders)}
      ${permCheck('canViewStats',     'View Stats',      p.canViewStats)}
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn btn-primary" style="flex:1;" onclick="savePermissions('${userId}')">Save</button>
        <button class="btn btn-ghost" onclick="document.getElementById('permModal').remove()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function permCheck(key, label, checked) {
  return `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
    <input type="checkbox" id="perm_${key}" ${checked ? 'checked' : ''}> <span>${label}</span>
  </label>`;
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
    showToast("Permissions Updated", "success");
    document.getElementById('permModal').remove();
    loadUsersPane();
  } catch(e) { alert(e.message); }
}

// ══════════════════════════════════════════════════════════════
// STATS, FOLDERS & LOGS
// ══════════════════════════════════════════════════════════════

async function loadStatsPane() {
  const el = document.getElementById('adminPane_stats');
  el.innerHTML = '<p class="muted">Loading statistics...</p>';
  try {
    const [uSnap, bSnap] = await Promise.all([db.collection('users').get(), db.collection('books').get()]);
    let totalBytes = 0;
    bSnap.docs.forEach(d => totalBytes += (d.data().fileSize || 0));
    const size = (totalBytes / (1024 * 1024)).toFixed(2) + ' MB';

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="stat-card"><strong>${uSnap.size}</strong><br>Users</div>
        <div class="stat-card"><strong>${bSnap.size}</strong><br>Books</div>
        <div class="stat-card" style="grid-column: span 2;"><strong>${size}</strong> Storage</div>
      </div>`;
  } catch(e) { el.innerHTML = "Error loading stats."; }
}

async function loadFoldersPane() {
  const el = document.getElementById('foldersList');
  el.innerHTML = '<p class="muted">Loading folders...</p>';
  try {
    const fSnap = await db.collection('folders').get();
    const bSnap = await db.collection('books').get();
    el.innerHTML = '';
    
    fSnap.forEach(fDoc => {
      const folder = fDoc.id;
      const count = bSnap.docs.filter(b => b.data().category === folder).length;
      const div = document.createElement('div');
      div.className = 'folder-manage-row';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid var(--border);">
          <span>📁 ${escapeHtml(folder)} (${count})</span>
          <button class="btn btn-danger btn-sm" onclick="deleteFolder('${folder}', ${count})">🗑</button>
        </div>`;
      el.appendChild(div);
    });
  } catch(e) { el.innerHTML = "Error loading folders."; }
}

async function deleteFolder(folder, count) {
  if (!confirm(`Delete ${folder} and its ${count} books?`)) return;
  try {
    const batch = db.batch();
    const books = await db.collection('books').where('category', '==', folder).get();
    books.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('folders').doc(folder));
    await batch.commit();
    showToast("Deleted successfully", "success");
    loadFoldersPane();
  } catch(e) { alert(e.message); }
}

async function logAction(message) {
  try { await db.collection('logs').add({ message, admin: currentUser.email, timestamp: firebase.firestore.FieldValue.serverTimestamp() }); } catch(e) {}
}

async function loadLogsPane() {
  const el = document.getElementById('adminPane_logs');
  el.innerHTML = '<p class="muted">Loading logs...</p>';
  try {
    const snap = await db.collection('logs').orderBy('timestamp', 'desc').limit(50).get();
    el.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      return `<div style="padding:8px;border-bottom:1px solid var(--border);font-size:0.75rem;">
        <span class="muted">${d.timestamp?.toDate().toLocaleString() || 'now'}</span><br>${escapeHtml(d.message)}
      </div>`;
    }).join('');
  } catch(e) { el.innerHTML = "Error loading logs."; }
}
