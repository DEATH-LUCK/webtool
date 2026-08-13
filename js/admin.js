// ============================================================
// ADMIN.JS — Professional Admin Panel
// ============================================================

async function openAdminPanel() {
  if (currentRole !== 'admin') return;
  
  const info = document.getElementById('adminPanelUserInfo');
  if (info && currentUser) {
    info.textContent = currentUser.email + ' · ' + (currentRole || 'user');
  }
  document.getElementById('adminPanel').classList.add('open');
  showAdminTab('dash', document.querySelector('.admin-tab-btn'));
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

  if (tab === 'dash') loadDashboard();
  if (tab === 'users') loadUsersPane();
  if (tab === 'folders') loadFoldersPane();
  if (tab === 'logs') loadLogsPane();
  if (tab === 'settings') loadSettingsPane();
}

// 📊 DASHBOARD
async function loadDashboard() {
  const el = document.getElementById('adminPane_dash');
  el.innerHTML = '<div class="empty-admin"><div class="spinner"></div><p>Calculating stats...</p></div>'; // Show spinner
  
  try {
    const [uSnap, bSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('books').get()
    ]);
    
    const users = uSnap.docs.map(d => d.data());
    const pending = users.filter(u => u.status === 'pending').length;
    const banned = users.filter(u => u.status === 'banned').length;
    
    el.innerHTML = `
      <div class="dash-stats-grid">
        <div class="dash-stat-card">
          <div class="dash-stat-value">${uSnap.size}</div>
          <div class="dash-stat-label">Total Users</div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-value">${bSnap.size}</div>
          <div class="dash-stat-label">Total Books</div>
        </div>
        <div class="dash-stat-card" style="border-color:var(--amber);">
          <div class="dash-stat-value">${pending}</div>
          <div class="dash-stat-label">Pending Approval</div>
        </div>
        <div class="dash-stat-card" style="border-color:var(--red);">
          <div class="dash-stat-value">${banned}</div>
          <div class="dash-stat-label">Banned</div>
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty-admin"><p style="color:var(--red);">Error loading dashboard: ${e.message}</p></div>`;
  }
}

// 👥 USER MANAGEMENT
async function loadUsersPane() {
  const list = document.getElementById('usersList');
  const search = document.getElementById('adminUserSearch')?.value.toLowerCase() || '';
  list.innerHTML = '<div class="empty-admin"><div class="spinner"></div><p>Loading users...</p></div>'; // Show spinner
  
  try {
    const snap = await db.collection('users').get();
    list.innerHTML = '';
    
    let count = 0;
    snap.docs.forEach(doc => {
      const u = doc.data();
      if (search && !u.email.toLowerCase().includes(search)) return;
      
      count++;
      const row = document.createElement('div');
      const status = u.status || 'approved';
      const role = u.role || 'user';
      
      row.className = `user-row ${status === 'pending' ? 'pending' : ''} ${status === 'banned' ? 'banned' : ''}`;
      if (doc.id === currentUser.uid) row.classList.add('current-user');
      
      let actions = '';
      if (doc.id === currentUser.uid) {
        actions = `<span class="you-badge">You</span>`;
      } else {
        if (status === 'pending') {
          actions = `<button class="btn btn-primary btn-sm" onclick="updateUserStatus('${doc.id}', 'approved')">Approve</button>
                     <button class="btn btn-ghost btn-sm" onclick="deleteUser('${doc.id}')">Reject</button>`;
        } else {
          // Ban/Unban button (only Superadmin can ban/unban)
          if (isSuperAdmin) {
            const banBtn = status === 'banned' 
              ? `<button class="btn btn-primary btn-sm" onclick="updateUserStatus('${doc.id}', 'approved')">Unban</button>`
              : `<button class="btn btn-danger btn-sm" onclick="updateUserStatus('${doc.id}', 'banned')">Ban</button>`;
            actions += banBtn;
          }
          
          // Promote/Demote button (only Superadmin can change roles)
          if (isSuperAdmin) {
            actions += `<button class="btn btn-ghost btn-sm" onclick="toggleAdminRole('${doc.id}', '${role}')">
                          ${role === 'admin' ? 'Demote' : 'Make Admin'}
                        </button>`;
          }
          
          // Delete button (only Superadmin can delete)
          if (isSuperAdmin) {
            actions += `<button class="btn btn-danger btn-sm" onclick="deleteUser('${doc.id}')">🗑</button>`;
          }
          
          if (!actions) actions = `<span class="muted" style="font-size:0.72rem;">No Permission</span>`;
        }
      }
      
      row.innerHTML = `
        <div class="user-info">
          <div class="user-email">${escapeHtml(u.email)}</div>
          <div class="user-badge muted">${escapeHtml(role.toUpperCase())} • ${escapeHtml(status.toUpperCase())}</div>
        </div>
        <div class="user-actions-container">${actions}</div>
      `;
      list.appendChild(row);
    });
    
    if (count === 0) {
      list.innerHTML = '<div class="empty-admin"><p class="muted">No other users found.</p></div>';
    }
  } catch (e) {
    list.innerHTML = `<div class="empty-admin"><p style="color:var(--red);">Error: ${e.message}</p></div>`;
  }
}

async function updateUserStatus(uid, status) {
  try {
    if (status === 'banned' && !isSuperAdmin) { showToast('Only Superadmin can ban users.', 'error'); return; }
    const targetDoc = await db.collection('users').doc(uid).get();
    const email = targetDoc.data()?.email || uid;
    await db.collection('users').doc(uid).update({ status });
    await logAction(`${status.toUpperCase()} user: ${email}`);
    showToast(`User ${status} successfully`, 'success');
    loadUsersPane();
    loadDashboard();
  } catch (e) {
    showToast(`Error updating user status: ${e.message}`, 'error');
  }
}

async function toggleAdminRole(uid, currentRole) {
  try {
    if (!isSuperAdmin) { showToast('Only Superadmin can change admin roles.', 'error'); return; }
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await db.collection('users').doc(uid).update({ role: newRole });
    const targetDoc = await db.collection('users').doc(uid).get();
    await logAction(`ROLE CHANGE: ${targetDoc.data()?.email || uid} to ${newRole.toUpperCase()}`);
    showToast(`Role updated to ${newRole}`, 'success');
    loadUsersPane();
  } catch (e) {
    showToast(`Error toggling admin role: ${e.message}`, 'error');
  }
}

async function deleteUser(uid) {
  try {
    if (!isSuperAdmin) { showToast('Only Superadmin can delete users.', 'error'); return; }
    const targetDoc = await db.collection('users').doc(uid).get();
    const email = targetDoc.data()?.email || uid;
    if (!await showConfirm('Delete User', `Are you sure you want to delete user ${email}? This cannot be undone.`)) return;
    await db.collection('users').doc(uid).delete();
    await logAction(`REMOVED USER: ${email}`);
    showToast('User removed.', 'success');
    loadUsersPane();
  } catch (e) {
    showToast(`Error deleting user: ${e.message}`, 'error');
  }
}

// ✏️ EDIT SECTION (Upload, Select/Bulk mode, Category management)
async function loadFoldersPane() {
  const el = document.getElementById('adminPane_folders');
  el.innerHTML = '<div class="empty-admin"><div class="spinner"></div><p>Loading...</p></div>'; // Show spinner
  
  try {
    const [bSnap, fSnap] = await Promise.all([
      db.collection('books').get(),
      db.collection('folders').get()
    ]);
    const allBooksData = bSnap.docs.map(d => d.data());
    allFolders = fSnap.docs.map(d => ({ id: d.id, parent: d.data().parent || null })); // keep cache fresh

    let html = `
      <div class="admin-section" style="margin-bottom:16px;">
        <h4 style="margin-bottom:10px;">Content Tools</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="closeAdminPanel(); openUploadModal();">⬆ Upload Book</button>
          <button class="btn btn-ghost btn-sm" id="bulkToggleBtn" onclick="toggleBulkMode()">
            <i class="bx bx-checkbox" id="bulkToggleIcon" style="vertical-align:middle;"></i>
            <span id="bulkToggleLabel">Select / Edit Mode</span>
          </button>
        </div>
        <p class="muted" style="font-size:.72rem;margin-top:8px;">Select / Edit Mode adds checkboxes and per-item Edit/Delete/Download controls on book cards in the Library — close this panel after enabling it to use them.</p>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h4 style="margin:0;">Manage Categories</h4>
        <button class="btn btn-primary btn-sm" onclick="openCategoryModal()">➕ New Category</button>
      </div>
    `;
    const tops = getTopLevelFolders();
    if (tops.length === 0) {
      html += '<p class="muted">No categories created yet. Click "New Category" to add one — e.g. Books, Software, Music &amp; Videos.</p>';
    }

    tops.forEach(f => {
      const children = getChildFolders(f.id);
      const idsInGroup = [f.id, ...children.map(c => c.id)];
      const totalCount = allBooksData.filter(b => idsInGroup.includes(b.category)).length;
      const isGeneral = f.id === 'General';
      const safeId = f.id.replace(/'/g, "\\'");
      html += `
        <div class="folder-card">
          <div class="folder-card-header">
            <div class="folder-card-left">
              <span class="folder-card-icon">📁</span>
              <div class="folder-card-meta">
                <span class="folder-card-name">${escapeHtml(f.id)}</span>
                <span class="folder-card-count">${totalCount} items${children.length ? ' · ' + children.length + ' sub-categories' : ''}</span>
              </div>
            </div>
            <div class="folder-card-actions">
              ${isGeneral ? '' : `
                <button class="btn btn-ghost btn-sm" onclick="openCategoryModal('${safeId}')">➕ Sub</button>
                <button class="btn btn-ghost btn-sm" onclick="renameCategoryAdmin('${safeId}')">✏ Rename</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCategoryAdmin('${safeId}')">🗑</button>
              `}
            </div>
          </div>
          ${children.length ? `<div class="folder-card-children">` + children.map(c => {
            const cCount = allBooksData.filter(b => b.category === c.id).length;
            const cSafe = c.id.replace(/'/g, "\\'");
            return `
              <div class="folder-subrow">
                <span class="folder-subrow-name">↳ ${escapeHtml(c.id)}</span>
                <span class="folder-card-count">${cCount} items</span>
                <div class="folder-card-actions">
                  <button class="btn btn-ghost btn-sm" onclick="renameCategoryAdmin('${cSafe}')">✏</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteCategoryAdmin('${cSafe}')">🗑</button>
                </div>
              </div>`;
          }).join('') + `</div>` : ''}
        </div>
      `;
    });
    el.innerHTML = html;

    // Sync the Select/Edit Mode button's visual state with the current bulk mode
    const label = document.getElementById('bulkToggleLabel');
    const icon  = document.getElementById('bulkToggleIcon');
    const btn   = document.getElementById('bulkToggleBtn');
    if (label) label.textContent = bulkMode ? 'Exit Select / Edit Mode' : 'Select / Edit Mode';
    if (icon)  icon.className    = bulkMode ? 'bx bx-x' : 'bx bx-checkbox';
    if (btn)   btn.classList.toggle('active-bulk', bulkMode);
  } catch (e) {
    el.innerHTML = `<div class="empty-admin"><p style="color:var(--red);">Error: ${e.message}</p></div>`;
  }
}

// ── Category create/rename/delete (2-level: category → sub-category) ──
function openCategoryModal(prefillParent) {
  document.getElementById('categoryModalName').value = '';
  const parentSel = document.getElementById('categoryModalParent');
  parentSel.innerHTML = '<option value="">— Top Level —</option>';
  getTopLevelFolders().forEach(f => {
    if (f.id === 'General') return;
    const opt = document.createElement('option');
    opt.value = f.id; opt.textContent = f.id;
    parentSel.appendChild(opt);
  });
  if (prefillParent) {
    parentSel.value = prefillParent;
    parentSel.disabled = true;
    document.getElementById('categoryModalTitle').textContent = `New Sub-category under "${prefillParent}"`;
  } else {
    parentSel.disabled = false;
    document.getElementById('categoryModalTitle').textContent = 'New Category';
  }
  document.getElementById('categoryModalOverlay').classList.add('open');
}
function closeCategoryModal() {
  document.getElementById('categoryModalOverlay').classList.remove('open');
}
async function saveCategoryModal() {
  const name = document.getElementById('categoryModalName').value.trim();
  const parent = document.getElementById('categoryModalParent').value || null;
  if (!name) { showToast('Enter a name.', 'error'); return; }
  if (name === 'General') { showToast('"General" is reserved.', 'error'); return; }
  try {
    await db.collection('folders').doc(name).set({
      name, parent, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await logAction(`CATEGORY CREATED: ${name}${parent ? ' (under ' + parent + ')' : ''}`);
    showToast(`📁 "${name}" created!`, 'success');
    closeCategoryModal();
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function renameCategoryAdmin(oldName) {
  const newName = await showPrompt("Rename Category", "Enter new name...", oldName);
  if (!newName || newName.trim() === oldName) return;
  const trimmedNew = newName.trim();
  try {
    const folderDoc = allFolders.find(f => f.id === oldName);
    const parent = folderDoc ? folderDoc.parent : null;
    const children = getChildFolders(oldName); // only relevant if oldName is a top-level category

    const batch = db.batch();
    batch.set(db.collection('folders').doc(trimmedNew), {
      name: trimmedNew, parent: parent || null, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.delete(db.collection('folders').doc(oldName));
    children.forEach(c => batch.update(db.collection('folders').doc(c.id), { parent: trimmedNew }));

    const booksSnap = await db.collection('books').where('category', '==', oldName).get();
    booksSnap.forEach(doc => batch.update(doc.ref, { category: trimmedNew }));

    await batch.commit();
    await logAction(`CATEGORY RENAMED: ${oldName} → ${trimmedNew}`);
    showToast(`Renamed to "${trimmedNew}".`, 'success');
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

async function deleteCategoryAdmin(name) {
  const children = getChildFolders(name);
  const msg = children.length > 0
    ? `Delete "${name}" and its ${children.length} sub-categor${children.length > 1 ? 'ies' : 'y'}? All items inside will be moved to "General".`
    : `Delete "${name}"? Its items will be moved to "General".`;
  if (!await showConfirm("Delete Category", msg)) return;
  try {
    const batch = db.batch();
    batch.delete(db.collection('folders').doc(name));
    children.forEach(c => batch.delete(db.collection('folders').doc(c.id)));

    const idsToClear = [name, ...children.map(c => c.id)];
    for (const catId of idsToClear) {
      const booksSnap = await db.collection('books').where('category', '==', catId).get();
      booksSnap.forEach(doc => batch.update(doc.ref, { category: 'General' }));
    }

    await batch.commit();
    await logAction(`CATEGORY DELETED: ${name}${children.length ? ' (+ ' + children.length + ' sub)' : ''}`);
    showToast('Category deleted.', 'success');
    await loadBooks();
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// 📜 LOGS
async function loadLogsPane() {
  const el = document.getElementById('adminPane_logs');
  el.innerHTML = '<div class="empty-admin"><div class="spinner"></div><p>Fetching logs...</p></div>'; // Show spinner
  
  try {
    if (!isSuperAdmin) { el.innerHTML = '<div class="empty-admin"><p class="muted">🔒 Superadmin access required to view logs.</p></div>'; return; }
    const snap = await db.collection('logs').orderBy('timestamp', 'desc').limit(20).get();
    
    el.innerHTML = '<h4>Recent Activity</h4>';
    if (snap.empty) {
      el.innerHTML += '<p class="muted">No activity logged yet.</p>';
      return;
    }

    snap.docs.forEach(doc => {
      const l = doc.data();
      const time = l.timestamp ? l.timestamp.toDate().toLocaleString() : 'Recent';
      el.innerHTML += `
        <div class="activity-item">
          <div class="activity-info">
            <div class="activity-desc">${escapeHtml(l.message)}</div>
            <div class="activity-meta">${escapeHtml(time)} • ${escapeHtml(l.adminEmail)}</div>
          </div>
        </div>
      `;
    });
  } catch (e) {
    el.innerHTML = `<div class="empty-admin">
      <p style="color:var(--red)">Error: ${e.message}</p>
      <p class="muted" style="font-size:0.7rem;margin-top:10px;">Note: Firestore logs collection might need a composite index for 'timestamp desc'. Check console for link.</p>
    </div>`;
    console.error(e);
  }
}

// ⚙️ SETTINGS
async function loadSettingsPane() {
  const el = document.getElementById('adminPane_settings');
  if (!isSuperAdmin) { el.innerHTML = '<div class="empty-admin"><p class="muted">🔒 Superadmin access required to view settings.</p></div>'; return; }

  el.innerHTML = '<div class="empty-admin"><div class="spinner"></div><p>Loading settings...</p></div>';

  try {
    await loadAppSettings(); // refresh cached appSettings from Firestore

    el.innerHTML = `
      <div class="admin-section">
        <h4>System Settings</h4>

        <label class="settings-toggle">
          <input type="checkbox" id="settingMaintenanceMode" ${appSettings.maintenanceMode ? 'checked' : ''}>
          <span>🚧 Maintenance Mode — blocks sign-in for everyone except admins</span>
        </label>

        <label class="settings-toggle">
          <input type="checkbox" id="settingRegistrationOpen" ${appSettings.registrationOpen ? 'checked' : ''}>
          <span>📝 Allow New Sign-ups</span>
        </label>

        <label class="settings-toggle">
          <input type="checkbox" id="settingAutoApprove" ${appSettings.autoApproveSignups ? 'checked' : ''}>
          <span>✅ Auto-Approve New Sign-ups (skip manual approval)</span>
        </label>

        <button class="btn btn-primary" style="margin-top:14px;" onclick="saveAppSettings()">Save Changes</button>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty-admin"><p style="color:var(--red);">Error loading settings: ${e.message}</p></div>`;
  }
}

async function saveAppSettings() {
  if (!isSuperAdmin) { showToast('Only Superadmin can change settings.', 'error'); return; }
  const maintenanceMode    = document.getElementById('settingMaintenanceMode').checked;
  const registrationOpen   = document.getElementById('settingRegistrationOpen').checked;
  const autoApproveSignups = document.getElementById('settingAutoApprove').checked;

  try {
    await db.collection('settings').doc('app').set({
      maintenanceMode,
      registrationOpen,
      autoApproveSignups,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser?.email || 'unknown'
    }, { merge: true });

    appSettings.maintenanceMode    = maintenanceMode;
    appSettings.registrationOpen   = registrationOpen;
    appSettings.autoApproveSignups = autoApproveSignups;

    await logAction(`SETTINGS UPDATED: maintenance=${maintenanceMode}, registrationOpen=${registrationOpen}, autoApprove=${autoApproveSignups}`);
    showToast('Settings saved', 'success');
  } catch (e) {
    showToast(`Error saving settings: ${e.message}`, 'error');
  }
}

async function logAction(message) {
  try {
    await db.collection('logs').add({
      message,
      adminEmail: currentUser?.email || 'unknown',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      adminId: currentUser.uid
    });
  } catch(e) {}
}
