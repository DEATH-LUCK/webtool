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
          <div class="user-email">${u.email}</div>
          <div class="user-badge muted">${role.toUpperCase()} • ${status.toUpperCase()}</div>
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
    if (!confirm(`Are you sure you want to delete user ${email}?`)) return;
    await db.collection('users').doc(uid).delete();
    await logAction(`REMOVED USER: ${email}`);
    showToast('User removed.', 'success');
    loadUsersPane();
  } catch (e) {
    showToast(`Error deleting user: ${e.message}`, 'error');
  }
}

// 📁 FOLDER MANAGER
async function loadFoldersPane() {
  const el = document.getElementById('adminPane_folders');
  el.innerHTML = '<div class="empty-admin"><div class="spinner"></div><p>Loading archives...</p></div>'; // Show spinner
  
  try {
    const [bSnap, fSnap] = await Promise.all([
      db.collection('books').get(),
      db.collection('folders').get()
    ]);
    const allBooksData = bSnap.docs.map(d => d.data());

    let html = '<h4>Manage Archives</h4>';
    if (fSnap.empty) {
      html += '<p class="muted">No custom archives created yet.</p>';
    }
    
    fSnap.docs.forEach(doc => {
      const count = allBooksData.filter(b => b.category === doc.id).length;
      html += `
        <div class="folder-card">
          <div class="folder-card-header">
            <div class="folder-card-left">
              <span class="folder-card-icon">📁</span>
              <div class="folder-card-meta">
                <span class="folder-card-name">${doc.id}</span>
                <span class="folder-card-count">${count} books</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="empty-admin"><p style="color:var(--red);">Error: ${e.message}</p></div>`;
  }
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
            <div class="activity-desc">${l.message}</div>
            <div class="activity-meta">${time} • ${l.adminEmail}</div>
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
function loadSettingsPane() {
  const el = document.getElementById('adminPane_settings');
  if (!isSuperAdmin) { el.innerHTML = '<div class="empty-admin"><p class="muted">🔒 Superadmin access required to view settings.</p></div>'; return; }
  el.innerHTML = `
    <div class="admin-section">
      <h4>System Settings</h4>
      <p class="muted">Maintenance mode and registration controls coming soon.</p>
      <button class="btn btn-primary" onclick="showToast('Settings saved', 'success')">Save Changes</button>
    </div>
  `;
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
