// ============================================================
// ADMIN.JS v3 — Dashboard, Access Control, Activity Log,
//               User Invite, App Settings, Export/Backup
// ============================================================

function openAdminPanel() {
  if (currentRole !== 'admin') return;
  document.getElementById('adminPanel').classList.add('open');
  _showAdminTab('dashboard');
}
function closeAdminPanel() {
  document.getElementById('adminPanel').classList.remove('open');
}
function showAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="adminPane_"]').forEach(p => p.style.display = 'none');
  document.getElementById('adminPane_' + tab).style.display = 'block';
  if (btn) btn.classList.add('active');
  _loadTab(tab);
}
function _showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="adminPane_"]').forEach(p => p.style.display = 'none');
  document.getElementById('adminPane_' + tab).style.display = 'block';
  const b = document.querySelector('.admin-tab-btn[data-tab="' + tab + '"]');
  if (b) b.classList.add('active');
  _loadTab(tab);
}
function _loadTab(tab) {
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'users')     loadUsersPane();
  if (tab === 'folders')   loadFoldersPane();
  if (tab === 'activity')  loadActivityLog();
  if (tab === 'settings')  loadSettings();
}

/* ════════════════════ 1. DASHBOARD ════════════════════ */
async function loadDashboard() {
  const el = document.getElementById('dashboardContent');
  el.innerHTML = '<p class="muted" style="padding:16px 0">Loading…</p>';
  try {
    const [bSnap, uSnap, fSnap] = await Promise.all([
      db.collection('books').get(),
      db.collection('users').get(),
      db.collection('folders').get()
    ]);
    const books   = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const users   = uSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalSz = books.reduce((s, b) => s + (b.fileSize || 0), 0);
    const admins  = users.filter(u => u.role === 'admin').length;
    const pdfs    = books.filter(b => b.fileType === 'pdf').length;
    const epubs   = books.filter(b => b.fileType === 'epub').length;
    const others  = books.length - pdfs - epubs;

    el.innerHTML = '';

    // Stat cards
    const statsGrid = document.createElement('div');
    statsGrid.className = 'dash-stats-grid';
    [
      { icon: '📚', val: books.length,        lbl: 'Total Books',  sub: pdfs + ' PDF · ' + epubs + ' EPUB' },
      { icon: '👥', val: users.length,         lbl: 'Total Users',  sub: admins + ' admin' + (admins !== 1 ? 's' : '') },
      { icon: '📁', val: fSnap.size,           lbl: 'Folders',      sub: 'categories' },
      { icon: '💾', val: formatSize(totalSz),  lbl: 'Storage Used', sub: 'Cloudinary approx.' },
    ].forEach(s => {
      const c = document.createElement('div');
      c.className = 'dash-stat-card';
      c.innerHTML = '<div class="dash-stat-icon">' + s.icon + '</div>'
        + '<div class="dash-stat-value">' + s.val + '</div>'
        + '<div class="dash-stat-label">' + s.lbl + '</div>'
        + '<div class="dash-stat-sub">' + s.sub + '</div>';
      statsGrid.appendChild(c);
    });
    el.appendChild(statsGrid);

    // File type bar
    if (books.length) {
      const sec = document.createElement('div');
      sec.className = 'dash-section';
      sec.innerHTML = '<div class="dash-section-title">File Breakdown</div>'
        + '<div class="dash-type-bar">'
        + '<div class="dash-type-seg seg-pdf"   style="width:' + (pdfs/books.length*100).toFixed(1)   + '%" title="PDF ' + pdfs   + '"></div>'
        + '<div class="dash-type-seg seg-epub"  style="width:' + (epubs/books.length*100).toFixed(1)  + '%" title="EPUB ' + epubs  + '"></div>'
        + '<div class="dash-type-seg seg-other" style="width:' + (others/books.length*100).toFixed(1) + '%" title="Other ' + others + '"></div>'
        + '</div>'
        + '<div class="dash-type-legend">'
        + '<span class="leg-dot seg-pdf"></span>PDF (' + pdfs + ')&nbsp;&nbsp;'
        + '<span class="leg-dot seg-epub"></span>EPUB (' + epubs + ')&nbsp;&nbsp;'
        + '<span class="leg-dot seg-other"></span>Other (' + others + ')'
        + '</div>';
      el.appendChild(sec);
    }

    // Recent uploads
    const recent = books
      .filter(b => b.uploadedAt)
      .sort((a, b) => (b.uploadedAt.seconds || 0) - (a.uploadedAt.seconds || 0))
      .slice(0, 6);
    if (recent.length) {
      const sec = document.createElement('div');
      sec.className = 'dash-section';
      sec.innerHTML = '<div class="dash-section-title">Recent Uploads</div>';
      const list = document.createElement('div');
      list.className = 'dash-recent-list';
      recent.forEach(b => {
        const dt = b.uploadedAt?.toDate
          ? b.uploadedAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
        const row = document.createElement('div');
        row.className = 'dash-recent-item';
        row.innerHTML = '<span class="dash-recent-icon">' + _icon(b.fileType) + '</span>'
          + '<div class="dash-recent-info">'
          + '<span class="dash-recent-title">' + escapeHtml(b.title) + '</span>'
          + '<span class="dash-recent-meta">' + escapeHtml(b.category || 'General') + ' · ' + dt + '</span>'
          + '</div>'
          + '<span class="dash-recent-size">' + formatSize(b.fileSize || 0) + '</span>';
        list.appendChild(row);
      });
      sec.appendChild(list);
      el.appendChild(sec);
    }
  } catch(e) { el.innerHTML = '<p class="error-msg">Error: ' + e.message + '</p>'; }
}

/* ════════════════════ 2. USERS ════════════════════ */
async function loadUsersPane() {
  const el = document.getElementById('usersList');
  el.innerHTML = '<p class="muted" style="padding:12px 0">Loading…</p>';
  try {
    const [uSnap, fSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('folders').get()
    ]);
    const folders = fSnap.docs.map(d => d.id).sort();
    const countEl = document.getElementById('userCountBadge');
    if (countEl) countEl.textContent = uSnap.size;
    if (uSnap.empty) { el.innerHTML = '<p class="muted">No users found.</p>'; return; }
    el.innerHTML = '';

    const docs = uSnap.docs.slice().sort((a, b) => {
      const diff = (a.data().role === 'admin' ? 0 : 1) - (b.data().role === 'admin' ? 0 : 1);
      if (diff) return diff;
      return (a.data().email || a.id).localeCompare(b.data().email || b.id);
    });

    docs.forEach(doc => {
      const data  = doc.data();
      const isAdm = data.role === 'admin';
      const email = data.email || doc.id;
      const isSelf = doc.id === currentUser.uid || doc.id === currentUser.email;
      const acc   = data.folderAccess || null;

      const row = document.createElement('div');
      row.className = 'user-row';

      const av = document.createElement('div');
      av.className = 'user-avatar' + (isAdm ? ' user-avatar-admin' : '');
      av.textContent = email[0].toUpperCase();

      const info = document.createElement('div');
      info.className = 'user-info';
      const emailEl = document.createElement('div');
      emailEl.className = 'user-email'; emailEl.textContent = email;
      const bEl = document.createElement('div');
      bEl.className = 'user-role-badge ' + (isAdm ? 'role-admin' : 'role-user');
      bEl.textContent = isAdm ? '⬟ Admin' : '○ User';
      if (!isAdm && acc) {
        const ab = document.createElement('span');
        ab.className = 'access-restricted-badge';
        ab.textContent = ' 🔒 ' + acc.length + ' folder' + (acc.length !== 1 ? 's' : '');
        bEl.appendChild(ab);
      }
      info.appendChild(emailEl); info.appendChild(bEl);

      const acts = document.createElement('div');
      acts.className = 'user-actions';

      if (isSelf) {
        const yb = document.createElement('span');
        yb.className = 'you-badge'; yb.textContent = 'You';
        acts.appendChild(yb);
      } else {
        const rb = document.createElement('button');
        rb.className = 'btn btn-sm ' + (isAdm ? 'btn-ghost' : 'btn-amber-outline');
        rb.textContent = isAdm ? '↓ User' : '↑ Admin';
        rb.onclick = () => toggleRole(doc.id, isAdm);

        const ab2 = document.createElement('button');
        ab2.className = 'btn btn-sm btn-ghost'; ab2.innerHTML = '🔒'; ab2.title = 'Folder access';
        ab2.onclick = () => openAccessControl(doc.id, email, acc, folders, row);

        const db2 = document.createElement('button');
        db2.className = 'btn btn-sm btn-danger'; db2.innerHTML = '✕'; db2.title = 'Delete user';
        db2.onclick = () => deleteUser(doc.id, email, isAdm);

        acts.appendChild(rb);
        if (!isAdm) acts.appendChild(ab2);
        acts.appendChild(db2);
      }

      const accPanel = document.createElement('div');
      accPanel.className = 'access-panel';
      accPanel.id = 'acc_' + doc.id.replace(/[^a-z0-9]/gi, '_');
      accPanel.style.display = 'none';

      row.appendChild(av); row.appendChild(info);
      row.appendChild(acts); row.appendChild(accPanel);
      el.appendChild(row);
    });
  } catch(e) { el.innerHTML = '<p class="error-msg">Error: ' + e.message + '</p>'; }
}

function openAccessControl(userId, email, currentAccess, folders, row) {
  const panelId = 'acc_' + userId.replace(/[^a-z0-9]/gi, '_');
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

  panel.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'access-panel-title';
  title.innerHTML = '🔒 Folder Access — <strong>' + escapeHtml(email) + '</strong>';

  const allLbl = document.createElement('label');
  allLbl.className = 'access-all-toggle';
  const allCb = document.createElement('input');
  allCb.type = 'checkbox'; allCb.checked = !currentAccess;
  const cbs = [];
  allCb.onchange = () => cbs.forEach(c => {
    c.disabled = allCb.checked;
    c.parentElement.style.opacity = allCb.checked ? '.4' : '1';
  });
  allLbl.appendChild(allCb);
  allLbl.appendChild(document.createTextNode(' Full access (all folders)'));

  const grid = document.createElement('div');
  grid.className = 'access-folder-grid';
  folders.forEach(f => {
    const lbl = document.createElement('label');
    lbl.className = 'access-folder-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = f;
    cb.checked = !currentAccess || currentAccess.includes(f);
    cb.disabled = !currentAccess;
    if (!currentAccess) lbl.style.opacity = '.4';
    cbs.push(cb);
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + f));
    grid.appendChild(lbl);
  });

  if (!folders.length) {
    grid.innerHTML = '<p class="muted" style="font-size:.78rem">No folders exist yet.</p>';
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm'; saveBtn.textContent = 'Save';
  saveBtn.onclick = async () => {
    const full = allCb.checked;
    const sel  = full ? null : cbs.filter(c => c.checked).map(c => c.value);
    try {
      await db.collection('users').doc(userId).update({
        folderAccess: full ? firebase.firestore.FieldValue.delete() : (sel || [])
      });
      showToast('Access updated for ' + email, 'success');
      logActivity('access_updated', { targetUser: email, folders: sel || 'all' });
      panel.style.display = 'none';
      loadUsersPane();
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
  };
  const canBtn = document.createElement('button');
  canBtn.className = 'btn btn-ghost btn-sm'; canBtn.textContent = 'Cancel';
  canBtn.onclick = () => { panel.style.display = 'none'; };

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:10px;';
  btnRow.appendChild(saveBtn); btnRow.appendChild(canBtn);

  panel.appendChild(title); panel.appendChild(allLbl);
  panel.appendChild(grid); panel.appendChild(btnRow);
  panel.style.display = 'block';
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function toggleRole(userId, isAdm) {
  try {
    await db.collection('users').doc(userId).update({ role: isAdm ? 'user' : 'admin' });
    showToast(isAdm ? 'Changed to User' : 'Changed to Admin', 'success');
    logActivity('role_changed', { targetUser: userId, newRole: isAdm ? 'user' : 'admin' });
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
async function deleteUser(userId, email, isAdm) {
  if (isAdm) { showToast('Demote to User first.', 'error'); return; }
  if (!confirm('Delete "' + email + '"?\nBooks will remain.')) return;
  try {
    await db.collection('users').doc(userId).delete();
    showToast('User removed.', 'success');
    logActivity('user_deleted', { targetUser: email });
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
async function addAdmin() {
  const input = document.getElementById('adminEmailInput');
  const email = input.value.trim();
  if (!email) { showToast('Enter an email.', 'error'); return; }
  try {
    const snap = await db.collection('users').get();
    let found = false;
    for (const doc of snap.docs) {
      if (doc.id === email || doc.data().email === email) {
        await db.collection('users').doc(doc.id).update({ role: 'admin' });
        found = true; break;
      }
    }
    if (!found) await db.collection('users').doc(email).set({ role: 'admin', email }, { merge: true });
    showToast(email + ' is now an admin!', 'success');
    logActivity('admin_added', { targetUser: email });
    input.value = '';
    loadUsersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// User Invite
async function sendInvite() {
  const input = document.getElementById('inviteEmailInput');
  const email = input.value.trim();
  if (!email) { showToast('Enter an email.', 'error'); return; }
  try {
    await db.collection('invites').doc(email).set({
      invitedBy: currentUser.email, email,
      invitedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });
    showToast('Invite recorded for ' + email, 'success');
    logActivity('user_invited', { targetUser: email });
    input.value = '';
    loadInvitesList();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
async function loadInvitesList() {
  const el = document.getElementById('invitesList');
  if (!el) return;
  try {
    const snap = await db.collection('invites').orderBy('invitedAt', 'desc').get();
    if (snap.empty) { el.innerHTML = '<p class="muted" style="font-size:.78rem;margin-top:8px;">No invites yet.</p>'; return; }
    el.innerHTML = '';
    snap.docs.slice(0, 6).forEach(doc => {
      const d = doc.data();
      const item = document.createElement('div');
      item.className = 'invite-item';
      item.innerHTML = '<span class="invite-email">' + escapeHtml(d.email) + '</span>'
        + '<span class="invite-status status-' + d.status + '">' + d.status + '</span>'
        + '<button class="btn btn-sm btn-ghost" onclick="deleteInvite(\'' + escapeHtml(d.email) + '\')">✕</button>';
      el.appendChild(item);
    });
  } catch(e) {}
}
async function deleteInvite(email) {
  try { await db.collection('invites').doc(email).delete(); loadInvitesList(); } catch(e) {}
}
function filterUsers(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('#usersList .user-row').forEach(row => {
    const t = (row.querySelector('.user-email')?.textContent || '').toLowerCase();
    row.style.display = (!q || t.includes(q)) ? '' : 'none';
  });
}

/* ════════════════════ 3. FOLDERS ════════════════════ */
async function loadFoldersPane() {
  const el = document.getElementById('foldersList');
  el.innerHTML = '<p class="muted" style="padding:12px 0">Loading…</p>';
  try {
    const [bSnap, fSnap] = await Promise.all([db.collection('books').get(), db.collection('folders').get()]);
    const fm = {};
    fSnap.docs.forEach(d => { if (!fm[d.id]) fm[d.id] = []; });
    bSnap.docs.forEach(d => {
      const data = d.data(), cat = data.category || 'General';
      if (!fm[cat]) fm[cat] = [];
      fm[cat].push({ id: d.id, title: data.title || 'Untitled', author: data.author || '' });
    });
    const names = Object.keys(fm).sort();
    el.innerHTML = '';
    const ce = document.getElementById('folderCountBadge');
    if (ce) ce.textContent = names.length;
    if (!names.length) { el.innerHTML = '<div class="empty-admin"><div class="empty-admin-icon">📂</div><p>No folders yet.</p></div>'; return; }

    names.forEach(fn => {
      const books = fm[fn], sid = 'fp_' + Math.random().toString(36).slice(2,8);
      const card  = document.createElement('div'); card.className = 'folder-card';

      const hdr = document.createElement('div'); hdr.className = 'folder-card-header';
      const left = document.createElement('div'); left.className = 'folder-card-left'; left.style.cursor = 'pointer';
      left.onclick = () => toggleFolderCard(sid);
      left.innerHTML = '<div class="folder-card-icon">📁</div>'
        + '<div class="folder-card-meta"><span class="folder-card-name">' + escapeHtml(fn) + '</span>'
        + '<span class="folder-card-count">' + books.length + ' book' + (books.length !== 1 ? 's' : '') + '</span></div>'
        + '<span class="folder-chevron" id="chev_' + sid + '">›</span>';

      const ha = document.createElement('div'); ha.className = 'folder-header-actions';
      const rnBtn = document.createElement('button'); rnBtn.className = 'btn btn-sm btn-ghost'; rnBtn.textContent = '✏ Rename';
      rnBtn.onclick = e => { e.stopPropagation(); startRenameFolder(fn, card); };
      const dlBtn = document.createElement('button'); dlBtn.className = 'btn btn-sm btn-danger'; dlBtn.textContent = '✕ Delete';
      dlBtn.onclick = e => { e.stopPropagation(); deleteFolder(fn, books.length); };
      ha.appendChild(rnBtn); ha.appendChild(dlBtn); hdr.appendChild(left); hdr.appendChild(ha);

      const rnRow = document.createElement('div'); rnRow.className = 'folder-rename-row'; rnRow.style.display = 'none';
      const rnIn = document.createElement('input'); rnIn.type='text'; rnIn.className='folder-rename-input'; rnIn.value=fn;
      const rnSv = document.createElement('button'); rnSv.className='btn btn-primary btn-sm'; rnSv.textContent='Save';
      rnSv.onclick = () => renameFolder(fn, rnIn.value.trim(), sid);
      const rnCn = document.createElement('button'); rnCn.className='btn btn-ghost btn-sm'; rnCn.textContent='Cancel';
      rnCn.onclick = () => { rnRow.style.display='none'; };
      rnRow.appendChild(rnIn); rnRow.appendChild(rnSv); rnRow.appendChild(rnCn);

      const body = document.createElement('div'); body.className='folder-card-body'; body.id=sid; body.style.display='none';
      if (!books.length) {
        body.innerHTML = '<p class="folder-empty-msg">This folder is empty.</p>';
      } else {
        books.forEach(b => {
          const br = document.createElement('div'); br.className = 'folder-book-entry';
          const bi = document.createElement('div'); bi.className='folder-book-info';
          bi.innerHTML = '<span class="folder-book-name">' + escapeHtml(b.title) + '</span>'
            + (b.author ? '<span class="folder-book-author">' + escapeHtml(b.author) + '</span>' : '');
          const ba = document.createElement('div'); ba.className='folder-book-actions';
          const ms = document.createElement('select'); ms.className='move-select';
          const dopt = document.createElement('option'); dopt.value=''; dopt.textContent='Move to…'; ms.appendChild(dopt);
          names.filter(f => f !== fn).forEach(f => { const o=document.createElement('option'); o.value=f; o.textContent=f; ms.appendChild(o); });
          ms.onchange = function() { if (this.value) moveBook(b.id, this.value, this); };
          const dbk = document.createElement('button'); dbk.className='btn btn-sm btn-danger'; dbk.innerHTML='🗑'; dbk.title='Delete book';
          dbk.onclick = () => {
            if (confirm('Delete "' + b.title + '"?')) {
              db.collection('books').doc(b.id).delete().then(() => {
                allBooks = allBooks.filter(ab => ab.id !== b.id); renderBooks();
                showToast('"' + b.title + '" deleted.', 'success');
                logActivity('book_deleted', { title: b.title }); loadFoldersPane();
              }).catch(err => showToast(err.message, 'error'));
            }
          };
          ba.appendChild(ms); ba.appendChild(dbk); br.appendChild(bi); br.appendChild(ba); body.appendChild(br);
        });
      }
      card.appendChild(hdr); card.appendChild(rnRow); card.appendChild(body); el.appendChild(card);
    });
  } catch(e) { el.innerHTML = '<p class="error-msg">Error: ' + e.message + '</p>'; }
}
function toggleFolderCard(id) {
  const b = document.getElementById(id), c = document.getElementById('chev_' + id);
  if (!b) return;
  const open = b.style.display !== 'none';
  b.style.display = open ? 'none' : 'block';
  if (c) c.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
}
function startRenameFolder(fn, card) {
  const row = card.querySelector('.folder-rename-row');
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  if (row.style.display === 'flex') row.querySelector('input').focus();
}
async function renameFolder(oldName, newName, sid) {
  if (!newName || newName === oldName) { showToast('Enter a different name.', 'error'); return; }
  try {
    await db.collection('folders').doc(newName).set({ name: newName, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    const snap = await db.collection('books').where('category', '==', oldName).get();
    const batch = db.batch(); snap.docs.forEach(d => batch.update(d.ref, { category: newName })); await batch.commit();
    await db.collection('folders').doc(oldName).delete().catch(() => {});
    showToast('"' + oldName + '" renamed to "' + newName + '"', 'success');
    logActivity('folder_renamed', { from: oldName, to: newName });
    await loadBooks(); await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
async function createFolder() {
  const input = document.getElementById('adminNewFolderInput');
  const name  = input?.value.trim();
  if (!name) { showToast('Enter a folder name.', 'error'); return; }
  try {
    await db.collection('folders').doc(name).set({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast('📁 "' + name + '" created!', 'success');
    logActivity('folder_created', { name }); input.value = '';
    await loadBooks(); await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
async function moveBook(bookId, newFolder, sel) {
  if (!newFolder) return;
  try {
    await db.collection('books').doc(bookId).update({ category: newFolder });
    showToast('Moved to "' + newFolder + '"', 'success'); if (sel) sel.value = '';
    await loadBooks(); await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}
async function deleteFolder(folder, count) {
  if (!confirm(count > 0 ? 'Delete "' + folder + '" and its ' + count + ' book(s)?' : 'Delete empty "' + folder + '"?')) return;
  try {
    if (count > 0) {
      const snap = await db.collection('books').where('category', '==', folder).get();
      const batch = db.batch(); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
      allBooks = allBooks.filter(b => b.category !== folder); renderBooks();
    }
    await db.collection('folders').doc(folder).delete().catch(() => {});
    showToast('"' + folder + '" deleted.', 'success');
    logActivity('folder_deleted', { name: folder, booksDeleted: count });
    await loadFoldersPane();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ════════════════════ 4. ACTIVITY LOG ════════════════════ */
async function logActivity(action, details) {
  try {
    await db.collection('activity').add({
      action, details,
      performedBy: currentUser?.email || currentUser?.uid || 'unknown',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) {}
}
async function loadActivityLog() {
  const el = document.getElementById('activityList');
  el.innerHTML = '<p class="muted" style="padding:12px 0">Loading…</p>';
  try {
    const snap = await db.collection('activity').orderBy('timestamp', 'desc').limit(50).get();
    if (snap.empty) { el.innerHTML = '<div class="empty-admin"><div class="empty-admin-icon">📋</div><p>No activity yet.</p></div>'; return; }
    el.innerHTML = '';
    snap.docs.forEach(doc => {
      const d = doc.data();
      const time = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
      const item = document.createElement('div'); item.className = 'activity-item';
      item.innerHTML = '<div class="activity-icon">' + _actIcon(d.action) + '</div>'
        + '<div class="activity-info">'
        + '<div class="activity-desc">' + _actDesc(d.action, d.details) + '</div>'
        + '<div class="activity-meta">' + escapeHtml(d.performedBy) + ' · ' + time + '</div>'
        + '</div>';
      el.appendChild(item);
    });
  } catch(e) {
    el.innerHTML = (e.message.includes('index') || e.message.includes('requires'))
      ? '<div class="activity-index-msg">⚠️ Requires a Firestore composite index on <code>activity</code> (timestamp desc).<br><small>Firebase console will auto-suggest it on first run.</small></div>'
      : '<p class="error-msg">Error: ' + e.message + '</p>';
  }
}
function _actIcon(a) {
  return { book_deleted:'🗑', folder_created:'📁', folder_deleted:'🗑', folder_renamed:'✏', role_changed:'👤',
    admin_added:'⬆', user_deleted:'✕', user_invited:'📧', access_updated:'🔒',
    book_uploaded:'📤', settings_updated:'⚙', bulk_deleted:'🗑' }[a] || '•';
}
function _actDesc(action, d) {
  if (!d) return escapeHtml(action);
  const m = {
    book_deleted:     '"' + escapeHtml(d.title||'') + '" deleted',
    folder_created:   'Folder "' + escapeHtml(d.name||'') + '" created',
    folder_deleted:   'Folder "' + escapeHtml(d.name||'') + '" deleted (' + (d.booksDeleted||0) + ' books)',
    folder_renamed:   '"' + escapeHtml(d.from||'') + '" → "' + escapeHtml(d.to||'') + '"',
    role_changed:     escapeHtml(d.targetUser||'') + ' made ' + escapeHtml(d.newRole||''),
    admin_added:      escapeHtml(d.targetUser||'') + ' made admin',
    user_deleted:     '"' + escapeHtml(d.targetUser||'') + '" removed',
    user_invited:     'Invite to "' + escapeHtml(d.targetUser||'') + '"',
    access_updated:   'Access updated for "' + escapeHtml(d.targetUser||'') + '"',
    book_uploaded:    '"' + escapeHtml(d.title||'') + '" uploaded',
    settings_updated: 'App settings saved',
    bulk_deleted:     (d.count||0) + ' books bulk deleted',
  };
  return m[action] || escapeHtml(action);
}
async function clearActivityLog() {
  if (!confirm('Clear all activity logs?')) return;
  try {
    const snap = await db.collection('activity').get();
    const batch = db.batch(); snap.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
    showToast('Log cleared.', 'success'); loadActivityLog();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ════════════════════ 5. APP SETTINGS ════════════════════ */
async function loadSettings() {
  try {
    const doc = await db.collection('settings').doc('app').get();
    const s = doc.exists ? doc.data() : {};
    document.getElementById('settingAppName').value        = s.appName        || 'My Library';
    document.getElementById('settingAppSubtitle').value    = s.appSubtitle    || 'Your personal digital collection';
    document.getElementById('settingMaxUploadMB').value    = s.maxUploadMB    || 50;
    document.getElementById('settingAllowSignup').checked  = s.allowSignup  !== false;
    document.getElementById('settingAllowDownload').checked = s.allowDownload !== false;
  } catch(e) {}
}
async function saveSettings() {
  const data = {
    appName:       document.getElementById('settingAppName').value.trim() || 'My Library',
    appSubtitle:   document.getElementById('settingAppSubtitle').value.trim(),
    maxUploadMB:   parseInt(document.getElementById('settingMaxUploadMB').value) || 50,
    allowSignup:   document.getElementById('settingAllowSignup').checked,
    allowDownload: document.getElementById('settingAllowDownload').checked,
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy:     currentUser?.email
  };
  try {
    await db.collection('settings').doc('app').set(data, { merge: true });
    document.title = data.appName;
    document.querySelectorAll('.nav-logo').forEach(el => {
      el.childNodes.forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' ' + data.appName; });
    });
    showToast('Settings saved!', 'success');
    logActivity('settings_updated', {});
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

/* ════════════════════ 6. EXPORT / BACKUP ════════════════════ */
async function exportData(format) {
  const btn = document.getElementById('exportBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Exporting…'; }
  try {
    const [bSnap, uSnap, fSnap] = await Promise.all([
      db.collection('books').get(), db.collection('users').get(), db.collection('folders').get()
    ]);
    const books = bSnap.docs.map(d => {
      const data = d.data();
      return { id: d.id, title: data.title||'', author: data.author||'', category: data.category||'',
        fileType: data.fileType||'', fileSize: data.fileSize||0, downloadUrl: data.downloadUrl||'',
        uploadedBy: data.uploadedBy||'', uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate().toISOString() : '' };
    });
    const users   = uSnap.docs.map(d => ({ id: d.id, email: d.data().email||d.id, role: d.data().role||'user' }));
    const folders = fSnap.docs.map(d => d.id);

    if (format === 'json') {
      _dl('library-backup.json', JSON.stringify({ books, users, folders, exportedAt: new Date().toISOString() }, null, 2), 'application/json');
    } else {
      const hdr = 'ID,Title,Author,Category,FileType,FileSize,UploadedAt,DownloadURL';
      const rows = books.map(b => [b.id,b.title,b.author,b.category,b.fileType,b.fileSize,b.uploadedAt,b.downloadUrl]
        .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','));
      _dl('library-books.csv', [hdr, ...rows].join('\n'), 'text/csv');
    }
    showToast('Export downloaded!', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Export'; } }
}
function _dl(name, content, mime) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([content], { type: mime })), download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ════════════════════ HELPERS ════════════════════ */
function _icon(t) { return { pdf:'📕', epub:'📗', txt:'📄', doc:'📝', docx:'📝' }[t] || '📁'; }
function formatSize(b) {
  if (!b || b < 1024) return (b||0) + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
