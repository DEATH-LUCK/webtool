// ============================================================
// LIBRARY-PAGE.JS — Separate Library hub (not the Book Library)
// ============================================================
let libraryHubFolders = [];
let libraryHubItems = [];
let libraryHubCurrent = null;

const LIBRARY_DEFAULT_TREE = [
  { id:'Software', icon:'💻', children:[
    { id:'Windows', icon:'🪟', children:[{id:'Apps',icon:'📱'},{id:'Games',icon:'🎮'}] },
    { id:'Android', icon:'🤖', children:[{id:'Apps',icon:'📱'},{id:'Games',icon:'🎮'}] }
  ]},
  { id:'Entertainment', icon:'🎬', children:[{id:'Music',icon:'🎵'},{id:'Videos',icon:'🎬'}] },
  { id:'Archive', icon:'📦', children:[] }
];

function libraryFolderDocId(path) { return 'lib_' + path.map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g,'_')).join('__'); }
function libraryVirtualDefaults(){
  const out=[];
  const walk=(nodes,parent=null,path=[])=>nodes.forEach(n=>{const next=[...path,n.id],id=libraryFolderDocId(next);out.push({id,name:n.id,icon:n.icon||'📁',parent,scope:'library',path:next});walk(n.children||[],id,next);});
  walk(LIBRARY_DEFAULT_TREE); return out;
}
async function ensureLibraryDefaults() {
  const snap = await db.collection('folders').where('scope','==','library').get();
  const existing = new Set(snap.docs.map(d=>d.id));
  const batch = db.batch(); let writes = 0;
  const walk = (nodes,parent=null,path=[]) => nodes.forEach(n=>{
    const next=[...path,n.id],id=libraryFolderDocId(next);
    if(!existing.has(id)){batch.set(db.collection('folders').doc(id),{id,name:n.id,icon:n.icon||'📁',parent,scope:'library',path:next,createdAt:firebase.firestore.FieldValue.serverTimestamp()});writes++;}
    walk(n.children||[],id,next);
  });
  walk(LIBRARY_DEFAULT_TREE); if(writes) await batch.commit();
}

async function loadLibraryHub() {
  try {
    await ensureLibraryDefaults();
    const fSnap=await db.collection('folders').where('scope','==','library').get();
    libraryHubFolders=fSnap.docs.map(d=>({id:d.id,...d.data()}));
    const bSnap=await db.collection('books').where('libraryScope','==','library').get();
    libraryHubItems=bSnap.docs.map(d=>{const x=d.data(); return {id:d.id,title:x.title,author:x.author,category:x.category,fileType:x.fileType,fileSize:x.fileSize,coverUrl:x.coverUrl,uploadedAt:x.uploadedAt,libraryScope:x.libraryScope};});
  } catch(e) {
    console.error('Library hub load error:',e);
    // Keep the public Library navigable even if Firestore rules temporarily block writes/reads.
    libraryHubFolders=libraryVirtualDefaults();
    libraryHubItems=[];
    showToast('Library categories loaded locally. Admin changes need Firestore permission.','error');
  }
  renderLibraryHub();
}
function openLibraryHub(){
  if(typeof closeReader==='function') closeReader();
  const hub=document.getElementById('libraryHubPage'),app=document.getElementById('appPage'); if(!hub)return;
  if(app)app.style.display='none'; hub.style.display='block'; closeSidebarMobileSafe(); libraryHubCurrent=null; loadLibraryHub();
}
function closeLibraryHub(){const hub=document.getElementById('libraryHubPage'),app=document.getElementById('appPage');if(hub)hub.style.display='none';if(app)app.style.display='block';if(typeof loadBooks==='function')loadBooks();}
function closeSidebarMobileSafe(){try{if(typeof closeSidebarMobile==='function')closeSidebarMobile();}catch(e){}}
function libraryChildren(parent){return libraryHubFolders.filter(f=>(f.parent||null)===(parent||null)).sort((a,b)=>(a.name||a.id).localeCompare(b.name||b.id));}
function libraryFolder(id){return libraryHubFolders.find(f=>f.id===id);}
function libraryDescendants(id){const out=[],q=[id];while(q.length){const p=q.shift();libraryChildren(p).forEach(k=>{out.push(k.id);q.push(k.id);});}return out;}
function libraryItemCount(folderId){const ids=new Set([folderId,...libraryDescendants(folderId)]);return libraryHubItems.filter(x=>ids.has(x.category)).length;}
function librarySafe(text){return typeof escapeHtml==='function'?escapeHtml(String(text)):String(text).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function renderLibraryHub(){const root=document.getElementById('libraryHubRoot');if(!root)return;if(libraryHubCurrent){renderLibraryFolder(libraryHubCurrent);return;}const tops=libraryChildren(null);root.innerHTML=`<div class="library-hub-header"><div><div class="library-hub-kicker">📚 LIBRARY</div><h1>Library</h1><p>Software, entertainment and archived resources.</p></div></div><div class="library-hub-grid">${tops.map(libraryHubCard).join('')}</div>`;}
function libraryHubCard(f){const kids=libraryChildren(f.id);return `<button class="library-hub-card" onclick="openLibraryFolder('${f.id}')"><span class="library-hub-icon">${librarySafe(f.icon||'📁')}</span><span class="library-hub-card-title">${librarySafe(f.name||f.id)}</span><span class="library-hub-card-meta">${kids.length?kids.length+' categories · ':''}${libraryItemCount(f.id)} items</span></button>`;}
function openLibraryFolder(id){libraryHubCurrent=id;renderLibraryHub();}
function libraryItemUrl(item){return (typeof LIBRARY_PROXY_BASE!=='undefined'&&LIBRARY_PROXY_BASE)?`${LIBRARY_PROXY_BASE}?item=${encodeURIComponent(item.id)}`:'';}
function renderLibraryFolder(id){const root=document.getElementById('libraryHubRoot'),f=libraryFolder(id);if(!root||!f)return;const kids=libraryChildren(id),items=libraryHubItems.filter(x=>x.category===id),parent=f.parent?libraryFolder(f.parent):null;root.innerHTML=`<div class="library-hub-header"><button class="btn btn-ghost" onclick="${parent?`openLibraryFolder('${parent.id}')`:'renderLibraryHub()'}">← Back</button><div style="flex:1"><div class="library-hub-kicker">📚 LIBRARY</div><h1>${librarySafe(f.icon||'📁')} ${librarySafe(f.name||f.id)}</h1><p>${librarySafe(f.path?.join(' / ')||'')}</p></div></div><div class="library-hub-grid">${kids.map(libraryHubCard).join('')}</div>${items.length?`<div class="library-hub-items"><h2>Items</h2><div class="library-hub-item-list">${items.map(libraryItemCard).join('')}</div></div>`:'<div class="library-hub-empty">No items in this category yet.</div>'}`;}
function libraryItemCard(item){const title=librarySafe(item.title||'Untitled'),type=(item.fileType||'').toLowerCase(),canRead=['pdf','epub','txt'].includes(type),isAudio=['mp3','wav','ogg','m4a','aac','flac'].includes(type),isVideo=['mp4','webm','ogg','mov','m4v'].includes(type),url=librarySafe(libraryItemUrl(item)),safeItem=JSON.stringify(item).replace(/</g,'\\u003c');let media='';if(isAudio)media=`<div class="library-media"><audio controls preload="metadata" src="${url}"></audio></div>`;if(isVideo)media=`<div class="library-media library-video"><video controls preload="metadata" src="${url}"></video></div>`;return `<div class="library-hub-item library-item-${isAudio?'audio':isVideo?'video':'file'}"><div class="library-item-main"><div><strong>${title}</strong><span>${librarySafe(item.author||item.fileType||'')}</span></div>${media}</div><div class="library-hub-item-actions">${canRead?`<button class="btn btn-primary btn-sm" onclick='openLibraryItemReader(${safeItem})'>Open</button>`:''}<button class="btn btn-ghost btn-sm" onclick='downloadLibraryItem(${safeItem})'>⬇ Download</button></div></div>`;}
function openLibraryItemReader(item){if(typeof openReader==='function')openReader({...item,downloadUrl:libraryItemUrl(item),viewUrl:libraryItemUrl(item)});}
async function downloadLibraryItem(item){const url=libraryItemUrl(item);if(!url){showToast('Download link unavailable.','error');return;}try{const res=await fetch(url,{credentials:'omit'});if(!res.ok)throw new Error('Download request failed');const blob=await res.blob(),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download=item.title||'download';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);}catch(e){const a=document.createElement('a');a.href=url;a.download=item.title||'download';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();}}
