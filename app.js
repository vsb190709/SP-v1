const DB_NAME="SPDB", STORE="records", SETTINGS="settings";
const FIXED_NAME="शिवगर्जना प्रतिष्ठान";
const FIXED_LOGO="./assets/sp-logo.jpeg";
let db, state={records:[],settings:{mandalName:FIXED_NAME,year:new Date().getFullYear(),contact:"",address:"",thankyou:"Thank you for your contribution.",waMessage:"🙏 Thank you for your contribution to {mandal}.\\nReceipt No: {receipt}\\nAmount: {amount}\\nPayment: {mode}\\nDate: {date}\\n\\n{thankyou}",qr:"",logo:FIXED_LOGO}}, deferredInstall=null;

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function makeId(){
  if(window.crypto && typeof crypto.randomUUID==="function") return crypto.randomUUID();
  return "id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
}

function cloudUser(){return window.firebaseAuth?.currentUser||null}
function cloudRecordRef(id){const u=cloudUser();return u?firebaseDb.collection("users").doc(u.uid).collection("records").doc(id):null}
function cloudSettingsRef(){const u=cloudUser();return u?firebaseDb.collection("users").doc(u.uid).collection("meta").doc("settings"):null}
async function cloudSaveRecord(r){
  const ref=cloudRecordRef(r.id); if(!ref) throw new Error("Not signed in");
  await ref.set(r);
}
async function cloudSaveSettings(){
  const ref=cloudSettingsRef(); if(!ref) throw new Error("Not signed in");
  const s={...state.settings};
  await ref.set(s,{merge:true});
}
async function cloudLoad(){
  const u=cloudUser(); if(!u) return;
  const snap=await firebaseDb.collection("users").doc(u.uid).collection("records").get();
  state.records=snap.docs.map(d=>d.data());
  const ss=await cloudSettingsRef().get();
  if(ss.exists) Object.assign(state.settings,ss.data());
  state.settings.mandalName=state.settings.mandalName||FIXED_NAME;
  state.settings.logo=state.settings.logo||FIXED_LOGO;
  state.settings.darkMode=state.settings.darkMode||"light";
  const local=await all(STORE); const localSettings=await all(SETTINGS);
  const known=new Set(state.records.map(r=>r.id));
  // Preserve local-only records created before cloud login, but upload them once.
  for(const r of local){
    if(!known.has(r.id)){
      try{await cloudSaveRecord(r);state.records.push(r)}catch(_){}
    }
  }
  for(const s of localSettings) state.settings[s.key]=state.settings[s.key] ?? s.value;
  state.settings.mandalName=state.settings.mandalName||FIXED_NAME;
  state.settings.logo=state.settings.logo||FIXED_LOGO;
  state.settings.darkMode=state.settings.darkMode||"light";
  await saveSettingsLocalOnly();
  renderSettings();applyTheme();renderAll();
}
async function saveSettingsLocalOnly(){
  for(const [key,value] of Object.entries(state.settings)) await put(SETTINGS,{key,value});
}
async function saveRecord(r){
  await put(STORE,r);
  if(cloudUser()) await cloudSaveRecord(r);
}
function friendlyAuthError(e){
  const m=e?.code||"";
  if(m.includes("invalid-credential")||m.includes("wrong-password")||m.includes("user-not-found")) return "Email or password is incorrect.";
  if(m.includes("too-many-requests")) return "Too many attempts. Try again later.";
  return e?.message||"Login failed.";
}
const money=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const today=()=>new Date().toISOString().slice(0,10);
function toast(t){const e=$("#toast");e.textContent=t;e.style.opacity=1;clearTimeout(window._toast);window._toast=setTimeout(()=>e.style.opacity=0,1800)}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"});if(!d.objectStoreNames.contains(SETTINGS))d.createObjectStore(SETTINGS,{keyPath:"key"})};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}
function all(store){return new Promise((res,rej)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
function put(store,obj){return new Promise((res,rej)=>{const q=db.transaction(store,"readwrite").objectStore(store).put(obj);q.onsuccess=()=>res();q.onerror=()=>rej(q.error)})}
function del(store,key){return new Promise((res,rej)=>{const q=db.transaction(store,"readwrite").objectStore(store).delete(key);q.onsuccess=()=>res();q.onerror=()=>rej(q.error)})}
function clearStore(store){return new Promise((res,rej)=>{const q=db.transaction(store,"readwrite").objectStore(store).clear();q.onsuccess=()=>res();q.onerror=()=>rej(q.error)})}
async function load(){
  state.records=await all(STORE);
  const s=await all(SETTINGS);s.forEach(x=>state.settings[x.key]=x.value);
  state.settings.mandalName=state.settings.mandalName||FIXED_NAME;
  state.settings.logo=state.settings.logo||FIXED_LOGO;
  renderSettings();applyTheme();renderAll();
  if(cloudUser()) await cloudLoad();
}
async function saveSettings(){
  await saveSettingsLocalOnly();
  if(cloudUser()) await cloudSaveSettings();
  renderSettings();
}
function receiptNo(){const year=String(state.settings.year||new Date().getFullYear()).slice(-2);const count=state.records.filter(x=>x.type==="income").length+1;return `GUV-${year}-${String(count).padStart(4,"0")}`}
function expenseNo(){const year=String(state.settings.year||new Date().getFullYear()).slice(-2);const count=state.records.filter(x=>x.type==="expense").length+1;return `EXP-${year}-${String(count).padStart(4,"0")}`}
function nav(page){$$(".page").forEach(x=>x.classList.toggle("active",x.id===page));$$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));window.scrollTo({top:0,behavior:"smooth"});if(page==="records")renderRecords()}
function totals(){let inc=0,exp=0,pInc=0,pExp=0,cash=0,upi=0,bank=0;state.records.forEach(r=>{if(r.type==="income"){inc+=r.amount;if(r.status==="Pending")pInc+=r.amount;if(r.status==="Received"){if(r.mode==="Cash")cash+=r.amount;if(r.mode==="UPI")upi+=r.amount;if(r.mode==="Bank")bank+=r.amount}}else{exp+=r.amount;if(r.status==="Pending")pExp+=r.amount;if(r.status==="Paid"){if(r.mode==="Cash")cash-=r.amount;if(r.mode==="UPI")upi-=r.amount;if(r.mode==="Bank")bank-=r.amount}}});return{inc,exp,pInc,pExp,cash,upi,bank,balance:inc-pInc-(exp-pExp),expected:inc-exp}}
function renderAll(){
  const pr=periodRows();
  const inc=pr.filter(r=>r.type==="income").reduce((a,r)=>a+r.amount,0);
  const exp=pr.filter(r=>r.type==="expense").reduce((a,r)=>a+r.amount,0);
  const received=pr.filter(r=>r.type==="income"&&r.status==="Received").reduce((a,r)=>a+r.amount,0);
  const paid=pr.filter(r=>r.type==="expense"&&r.status==="Paid").reduce((a,r)=>a+r.amount,0);
  const pendingIncome=pr.filter(r=>r.type==="income"&&r.status==="Pending").reduce((a,r)=>a+r.amount,0);
  const pendingExpense=pr.filter(r=>r.type==="expense"&&r.status==="Pending").reduce((a,r)=>a+r.amount,0);
  const balance=received-paid, expected=inc-exp;
  $("#mandalTitle").textContent=state.settings.mandalName;
  $("#balance").textContent=money(balance);
  $("#dashBalance").textContent=money(balance);
  $("#expected").textContent=`Expected ${money(expected)}`;
  $("#incomeTotal").textContent=money(inc);
  $("#incomePending").textContent=`${money(pendingIncome)} pending`;
  $("#expenseTotal").textContent=money(exp);
  $("#expensePending").textContent=`${money(pendingExpense)} pending`;
  const td=state.records.filter(r=>r.date===today());
  $("#todayIncome").textContent=money(td.filter(r=>r.type==="income"&&r.status==="Received").reduce((a,r)=>a+r.amount,0));
  $("#todayExpense").textContent=`Expenses ${money(td.filter(r=>r.type==="expense"&&r.status==="Paid").reduce((a,r)=>a+r.amount,0))}`;

  const modes=["Cash","UPI","Bank","Other"];
  let modeIncomeTotal=0;
  modes.forEach(mode=>{
    const mi=pr.filter(r=>r.type==="income"&&r.mode===mode&&r.status==="Received").reduce((a,r)=>a+r.amount,0);
    modeIncomeTotal+=mi;
    const el=$("#"+mode.toLowerCase()+"Total"); if(el) el.textContent=money(mi);
  });
  $("#modeIncomeTotal").textContent=money(modeIncomeTotal);

  $("#rReceived").textContent=money(received);
  $("#rPaid").textContent=money(paid);
  $("#rBalance").textContent=money(balance);
  $("#rPending").textContent=money(pendingIncome-pendingExpense);
  renderRecent();renderReports();renderDashboardExtras();
  if($("#incomeForm")){$("#incomeForm").date.value=today();$("#expenseForm").date.value=today()}
}
function renderRecent(){const a=[...state.records].sort((x,y)=>y.created-x.created).slice(0,6);$("#recentList").innerHTML=a.length?a.map(rowHTML).join(""):`<div class="empty">No transactions yet.<br>Add your first donation or expense.</div>`}
function rowHTML(r){const title=r.type==="income"?r.name:r.paidTo;return `<button class="row" type="button" data-id="${r.id}" style="text-align:left"><div class="rowMain"><div class="rowTitle">${esc(title)} <span class="pill">${r.type==="income"?"Donation":"Expense"}</span>${r.status!=="Received"&&r.status!=="Paid"?`<span class="pill pending">${esc(r.status)}</span>`:""}</div><div class="rowMeta">${esc(r.ref)} · ${r.date} · ${esc(r.mode)}</div></div><div class="amount ${r.type==="income"?"incomeAmt":"expenseAmt"}">${r.type==="income"?"+":"−"}${money(r.amount)}</div></button>`}

function periodRows(){
  // Dashboard is intentionally all-time. Today's figures are shown separately below.
  return state.records;
}
function renderDashboardExtras(){
  const rows=periodRows(), inc=rows.filter(r=>r.type==="income"&&r.status==="Received").reduce((a,r)=>a+r.amount,0), exp=rows.filter(r=>r.type==="expense"&&r.status==="Paid").reduce((a,r)=>a+r.amount,0);
  const target=Number(state.settings.target||0), pct=target?Math.min(100,Math.round(inc/target*100)):0;
  $("#targetValue").textContent=`${money(inc)} / ${money(target)}`; $("#targetLabel").textContent=target?`${pct}% of target`:"Set a target in Settings"; $("#targetProgress").style.width=pct+"%";
  const labels=["Income","Expense"], vals=[inc,exp], max=Math.max(...vals,1);
  $("#miniChart").innerHTML=vals.map((v,i)=>`<div class="chartBar ${i?"exp":""}"><b>${money(v)}</b><i style="height:${Math.max(3,Math.round(v/max*70))}px"></i><span>${labels[i]}</span></div>`).join("");
}
function renderRecords(){const q=$("#search").value.trim().toLowerCase(),type=$("#typeFilter").value,from=$("#fromDate").value,to=$("#toDate").value;let a=state.records.filter(r=>(type==="all"||r.type===type)&&(!from||r.date>=from)&&(!to||r.date<=to)&&(!q||JSON.stringify(r).toLowerCase().includes(q))).sort((x,y)=>y.created-x.created);$("#recordList").innerHTML=a.length?a.map(rowHTML).join(""):`<div class="empty">No matching records.</div>`}
function renderReports(){const t=totals();const modes=["Cash","UPI","Bank","Other"];$("#breakdown").innerHTML=modes.map(m=>{const i=state.records.filter(r=>r.type==="income"&&r.mode===m&&r.status==="Received").reduce((a,r)=>a+r.amount,0),e=state.records.filter(r=>r.type==="expense"&&r.mode===m&&r.status==="Paid").reduce((a,r)=>a+r.amount,0);return `<div class="barline"><span>${m}</span><b>${money(i-e)}</b></div>`}).join("");const cats={};state.records.filter(r=>r.type==="expense").forEach(r=>cats[r.category]=(cats[r.category]||0)+r.amount);$("#categories").innerHTML=Object.keys(cats).length?Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="barline"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join(""):`<div class="muted">No expenses yet.</div>`}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function receiptHTML(r){return `<div class="receipt"><div class="receiptTop"><div style="display:flex;align-items:center;gap:10px">${state.settings.logo?`<img src="${state.settings.logo}" alt="Mandal logo" style="width:48px;height:48px;object-fit:cover;border-radius:10px">`:""}<div><div class="eyebrow">${esc(state.settings.mandalName)}</div><h2>Donation Pawti</h2><div class="muted">${esc(state.settings.address||"")}</div></div></div><div class="receiptNo">${esc(r.ref)}</div></div><div class="receiptAmount">${money(r.amount)}</div><div class="receiptLine"><span>Donor</span><b>${esc(r.name)}</b></div><div class="receiptLine"><span>Mobile</span><b>${esc(r.mobile||"—")}</b></div><div class="receiptLine"><span>Date</span><b>${esc(displayDate(r.date))}</b></div><div class="receiptLine"><span>Payment</span><b>${esc(r.mode)}</b></div><div class="receiptLine"><span>Status</span><b>${esc(r.status)}</b></div>${r.note?`<div class="receiptLine"><span>Note</span><b>${esc(r.note)}</b></div>`:""}<p style="margin:18px 0 0;text-align:center">${esc(state.settings.thankyou||"Thank you for your contribution.")}</p></div><div class="modalActions"><button class="primary" id="waShare" type="button">🟢 Share on WhatsApp</button><button class="secondary" id="repeatDonation" type="button">↻ Repeat donor</button><button class="secondary" id="printReceipt" type="button">🖨 Print</button><button class="danger" id="deleteRecord" type="button">Delete</button><button class="secondary" id="closeReceipt" type="button">Done</button></div>`}
async function auditDelete(r, reason="Individual record deletion"){
  const u=cloudUser(); if(!u) return;
  await firebaseDb.collection("users").doc(u.uid).collection("auditLogs").add({
    action:"delete", scope:"record", recordId:r.id, type:r.type, ref:r.ref||"",
    name:r.name||r.paidTo||"", amount:Number(r.amount||0), originalDate:r.date||"",
    reason, deletedAt:firebase.firestore.FieldValue.serverTimestamp(),
    deletedByUid:u.uid, deletedByEmail:u.email||""
  });
}
async function deleteRecord(r){
  if(!confirm(`Delete ${r.ref||"this record"}? This cannot be undone.`)) return;
  try{
    await auditDelete(r);
    if(cloudUser()) await cloudRecordRef(r.id).delete();
    await del(STORE,r.id);
    state.records=state.records.filter(x=>x.id!==r.id);
    closeModal(); renderAll(); toast("Record deleted ✓");
  }catch(e){console.error(e);toast("Could not delete record.");}
}
function openReceipt(r){$("#modalContent").innerHTML=receiptHTML(r);$("#modal").classList.remove("hidden");$("#deleteRecord").onclick=()=>deleteRecord(r);$("#waShare").onclick=()=>shareWA(r);if($("#repeatDonation"))$("#repeatDonation").onclick=()=>{if(r.type!=="income")return;nav("income");$("#incomeForm").name.value=r.name||"";$("#incomeForm").mobile.value=r.mobile||"";$("#incomeForm").amount.value=r.amount||"";$("#incomeForm").mode.value=r.mode||"Cash";$("#incomeForm").status.value="Received";closeModal();toast("Donation form filled for this donor")};$("#printReceipt").onclick=()=>window.print();$("#closeReceipt").onclick=closeModal}
function closeModal(){$("#modal").classList.add("hidden")}
function displayDate(s){const m=String(s||"").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(s||"")}
function waTemplate(r){
  const template=state.settings.waMessage||"🙏 Thank you for your contribution to {mandal}.\n\n🧾 Receipt No: {receipt}\n👤 Donor: {name}\n💰 Amount: {amount}\n💳 Payment: {mode}\n📅 Date: {date}\n\n{thankyou}";
  return template.replaceAll("{mandal}",state.settings.mandalName||"Ganesh Utsav Mandal")
    .replaceAll("{receipt}",r.ref).replaceAll("{name}",r.name||"")
    .replaceAll("{amount}",money(r.amount)).replaceAll("{mode}",r.mode)
    .replaceAll("{date}",displayDate(r.date)).replaceAll("{status}",r.status)
    .replaceAll("{thankyou}",state.settings.thankyou||"Thank you for your contribution.");
}
function shareWA(r){
  const raw=(r.mobile||"").replace(/\D/g,"");
  if(!raw){toast("No mobile number was entered for this pawti.");return}
  let num=raw;if(num.length===10)num="91"+num;
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(waTemplate(r))}`,"_blank","noopener");
}
function formObj(form){return Object.fromEntries(new FormData(form).entries())}

function spConfirm(title, message){
  return new Promise(resolve=>{
    const old=document.getElementById("spConfirmModal"); if(old) old.remove();
    const el=document.createElement("div");
    el.id="spConfirmModal";
    el.innerHTML=`<div class="spcm-backdrop"><div class="spcm-card" role="dialog" aria-modal="true">
      <div class="spcm-title">${title}</div>
      <div class="spcm-message">${message.replace(/\n/g,"<br>")}</div>
      <div class="spcm-actions"><button type="button" class="spcm-cancel">Cancel</button><button type="button" class="spcm-ok">✓ Confirm & Save</button></div>
    </div></div>`;
    const style=document.createElement("style");
    style.textContent=`#spConfirmModal .spcm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:18px;z-index:99999}
#spConfirmModal .spcm-card{width:min(430px,100%);background:var(--card,#fff);color:var(--text,#111);border-radius:20px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.28)}
#spConfirmModal .spcm-title{font-size:20px;font-weight:800;margin-bottom:12px}
#spConfirmModal .spcm-message{font-size:15px;line-height:1.65;white-space:normal;word-break:break-word}
#spConfirmModal .spcm-actions{display:flex;gap:10px;margin-top:20px}
#spConfirmModal button{flex:1;border:0;border-radius:12px;padding:13px 10px;font-weight:700;font-size:14px;cursor:pointer}
#spConfirmModal .spcm-cancel{background:#e9e9e9;color:#222}
#spConfirmModal .spcm-ok{background:#111;color:#fff}
@media(prefers-color-scheme:dark){#spConfirmModal .spcm-cancel{background:#333;color:#fff}}`;
    el.appendChild(style); document.body.appendChild(el);
    const finish=v=>{el.remove(); resolve(v)};
    el.querySelector(".spcm-cancel").onclick=()=>finish(false);
    el.querySelector(".spcm-ok").onclick=()=>finish(true);
    el.querySelector(".spcm-backdrop").onclick=e=>{if(e.target===e.currentTarget) finish(false)};
  });
}

async function addIncome(e){
  e.preventDefault();
  const f=formObj(e.target),amt=Number(f.amount);
  if(!(amt>0)){toast("Enter a valid amount.");return}
  const mode=f.mode, status=f.status;
  const summary=`Confirm donation\\n\\nDonor: ${f.name.trim()}\\nAmount: ${money(amt)}\\nPayment: ${mode}\\nStatus: ${status}\\nDate: ${f.date}\\n\\nSave this donation?`;
  if(!(await spConfirm("Confirm donation", summary.replace(/\\n/g,"\n")))) return;
  const r={id:makeId(),type:"income",ref:receiptNo(),name:f.name.trim(),mobile:f.mobile.trim(),amount:amt,date:f.date,mode,status,note:f.note.trim(),created:Date.now()};
  try{
    await saveRecord(r); state.records.push(r);
    e.target.reset();$("#incomeForm").date.value=today();renderAll();openReceipt(r);
  }catch(err){console.error(err);toast("Could not save donation.");}
}
async function addExpense(e){
  e.preventDefault();
  const f=formObj(e.target),amt=Number(f.amount);
  if(!(amt>0)){toast("Enter a valid amount.");return}
  const summary=`Confirm expense\\n\\nPaid to: ${f.paidTo.trim()}\\nAmount: ${money(amt)}\\nPayment: ${f.mode}\\nStatus: ${f.status}\\nDate: ${f.date}\\nCategory: ${f.category}\\n\\nSave this expense?`;
  if(!(await spConfirm("Confirm expense", summary.replace(/\\n/g,"\n")))) return;
  const r={id:makeId(),type:"expense",ref:expenseNo(),paidTo:f.paidTo.trim(),amount:amt,date:f.date,category:f.category,mode:f.mode,status:f.status,note:f.note.trim(),created:Date.now()};
  try{
    await saveRecord(r); state.records.push(r);
    e.target.reset();$("#expenseForm").date.value=today();renderAll();toast("Expense saved ✓");
  }catch(err){console.error(err);toast("Could not save expense.");}
}
function csv(rows){const heads=["Type","Reference","Date","Name / Vendor","Mobile","Amount","Mode","Status","Category","Notes"];return [heads,...rows.map(r=>[r.type,r.ref,r.date,r.type==="income"?r.name:r.paidTo,r.mobile||"",r.amount,r.mode,r.status,r.category||"",r.note||""])].map(a=>a.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n")}
function download(text,name,type="text/csv"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
function exportRows(rows,label){if(!rows.length){toast("No records to export.");return}download(csv(rows),`sp-log-${label}.csv`);toast("Log downloaded")}
function renderSettings(){$("#settingsForm").mandalName.value=state.settings.mandalName||FIXED_NAME;$("#settingsForm").year.value=state.settings.year||"";$("#settingsForm").contact.value=state.settings.contact||"";$("#settingsForm").address.value=state.settings.address||"";$("#settingsForm").thankyou.value=state.settings.thankyou||"";$("#settingsForm").target.value=state.settings.target||0;$("#settingsForm").accent.value=state.settings.accent||"#7c3aed";if(state.settings.qr){$("#savedQr").classList.remove("hidden");$("#settingsQr").src=state.settings.qr}else $("#savedQr").classList.add("hidden");$("#mandalLogo").classList.remove("hidden");$("#mandalLogo").src=state.settings.logo||FIXED_LOGO;$("#settingsLogo").src=state.settings.logo||FIXED_LOGO;$("#settingsForm").waMessage.value=state.settings.waMessage||"";}
async function imageDataUrl(file,maxSide=500){return new Promise((resolve,reject)=>{const rd=new FileReader();rd.onload=()=>{const img=new Image();img.onload=()=>{const scale=Math.min(1,maxSide/Math.max(img.width,img.height));const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));const c=document.createElement("canvas");c.width=w;c.height=h;const ctx=c.getContext("2d");ctx.drawImage(img,0,0,w,h);let out=c.toDataURL("image/webp",0.92);if(!out.startsWith("data:image/webp"))out=c.toDataURL("image/png");if(out.length>450000)out=c.toDataURL("image/jpeg",0.82);if(out.length>450000){reject(new Error("QR image is too large. Choose a smaller image."));return}resolve(out)};img.onerror=()=>reject(new Error("Could not read image."));img.src=rd.result};rd.onerror=()=>reject(rd.error);rd.readAsDataURL(file)})}
async function saveSettingsForm(e){e.preventDefault();const f=formObj(e.target);Object.assign(state.settings,{mandalName:f.mandalName.trim()||FIXED_NAME,year:f.year.trim()||new Date().getFullYear(),contact:f.contact.trim(),address:f.address.trim(),thankyou:f.thankyou.trim()||"Thank you for your contribution.",target:Number(f.target||0),accent:f.accent||"#7c3aed",waMessage:f.waMessage.trim()||"🙏 Thank you for your contribution to {mandal}.\\nReceipt No: {receipt}\\nAmount: {amount}\\nPayment: {mode}\\nDate: {date}\\n\\n{thankyou}",logo:state.settings.logo||FIXED_LOGO});const logoFile=e.target.logo.files[0]; if(logoFile){
  if(!logoFile.type.startsWith("image/")){toast("Please choose an image for the logo.");return}
  try{state.settings.logo=await imageDataUrl(logoFile,700)}catch(err){toast(err.message||"Could not save logo.");return}
}
const file=e.target.qr.files[0];if(file){if(!file.type.startsWith("image/")){toast("Please choose an image for the QR.");return}try{state.settings.qr=await imageDataUrl(file)}catch(err){toast(err.message||"Could not save QR image.");return}}await saveSettings();e.target.qr.value="";e.target.logo.value="";toast((file||logoFile)?"Settings + images saved to cloud":"Settings saved")}
function applyTheme(){
  document.documentElement.classList.toggle("dark",state.settings.darkMode==="dark");
  document.documentElement.style.setProperty("--accent",state.settings.accent||"#7c3aed");
  const b=$("#themeToggle"); if(b) b.textContent=state.settings.darkMode==="dark"?"☀ Light":"☾ Dark";
}
async function toggleTheme(){
  state.settings.darkMode=state.settings.darkMode==="dark"?"light":"dark";
  await saveSettings(); applyTheme(); toast(state.settings.darkMode==="dark"?"Dark mode on":"Light mode on");
}

function makeBackup(){
  download(JSON.stringify({version:4,exportedAt:new Date().toISOString(),records:state.records,settings:state.settings},null,2),`sp-backup-${today()}.json`,"application/json");
  toast("Backup downloaded");
}
async function restoreBackup(file){
  try{
    const obj=JSON.parse(await file.text());
    if(!obj||!Array.isArray(obj.records)||!obj.settings) throw new Error("Invalid backup");
    if(!confirm(`Restore ${obj.records.length} records? Current records will be replaced.`)) return;
    state.records=obj.records; state.settings={...state.settings,...obj.settings};
    await clearStore(STORE); for(const r of state.records) await put(STORE,r);
    if(cloudUser()){const base=firebaseDb.collection("users").doc(cloudUser().uid).collection("records");const snap=await base.get();const batch=firebaseDb.batch();snap.docs.forEach(d=>batch.delete(d.ref));await batch.commit();for(const r of state.records) await cloudSaveRecord(r);}
    await saveSettings();
    renderSettings();applyTheme();renderAll();
    toast("Backup restored ✓");
  }catch(e){toast("Could not restore this backup.");}
}
function bind(){document.querySelectorAll("[data-amount]").forEach(b=>b.addEventListener("click",()=>{$("#incomeForm").amount.value=b.dataset.amount}));$("#backupData").onclick=makeBackup;$("#restoreData").onchange=e=>{if(e.target.files[0])restoreBackup(e.target.files[0]);e.target.value=""}; $("#themeToggle").onclick=toggleTheme; $$("[data-page]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.page)));$("#incomeForm").addEventListener("submit",addIncome);$("#expenseForm").addEventListener("submit",addExpense);["search","typeFilter","fromDate","toDate"].forEach(id=>$("#"+id).addEventListener("input",renderRecords));document.addEventListener("click",e=>{const row=e.target.closest(".row");if(row){const r=state.records.find(x=>x.id===row.dataset.id);if(r)openReceipt(r)}});$("#clearFilters").onclick=()=>{$("#search").value="";$("#typeFilter").value="all";$("#fromDate").value="";$("#toDate").value="";renderRecords()};$("#logoutBtn").onclick=async()=>{try{await firebaseAuth.signOut();toast("Logged out")}catch(e){toast("Could not log out")}};$("#closeModal").onclick=closeModal;$("#modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});$("#exportAll").onclick=()=>exportRows(state.records,"all");$("#exportToday").onclick=()=>exportRows(state.records.filter(r=>r.date===today()),today());$("#exportRange").onclick=()=>{const from=$("#fromDate").value,to=$("#toDate").value;exportRows(state.records.filter(r=>(!from||r.date>=from)&&(!to||r.date<=to)),"filtered")};$("#settingsForm").addEventListener("submit",saveSettingsForm);$("#removeQr").onclick=async()=>{state.settings.qr="";await saveSettings();toast("UPI QR removed")};$("#clearData").onclick=async()=>{
  const pass=prompt("Enter the delete-all password:");
  if(pass===null) return;
  if(pass!=="130926"){toast("Incorrect password.");return}
  if(!confirm("DELETE ALL records? This cannot be undone.")) return;
  try{
    const u=cloudUser();
    if(u){
      const base=firebaseDb.collection("users").doc(u.uid);
      const snap=await base.collection("records").get();
      const batch=firebaseDb.batch(); snap.docs.forEach(d=>batch.delete(d.ref)); await batch.commit();
      await base.collection("auditLogs").add({action:"delete",scope:"all_records",count:snap.size,deletedAt:firebase.firestore.FieldValue.serverTimestamp(),deletedByUid:u.uid,deletedByEmail:u.email||""});
    }
    await clearStore(STORE);state.records=[];renderAll();toast("All records cleared ✓");
  }catch(e){console.error(e);toast("Could not clear all records.");}
};$("#incomeForm").mode.addEventListener("change",()=>{
  const show=$("#incomeForm").mode.value==="UPI" && !!state.settings.qr;
  $("#upiPreview").classList.toggle("hidden",!show);
});
$("#showUpiQr").onclick=()=>{
  if(!state.settings.qr){toast("Upload the mandal UPI QR in Settings first.");return}
  $("#upiFullImage").src=state.settings.qr;
  $("#upiModal").classList.remove("hidden");
};
$("#closeUpi").onclick=()=>$("#upiModal").classList.add("hidden");
$("#upiNotReceived").onclick=()=>{
  $("#upiModal").classList.add("hidden");
  toast("Payment not marked as received.");
};
$("#upiReceived").onclick=()=>{
  $("#upiModal").classList.add("hidden");
  $("#incomeForm").status.value="Received";
  toast("Payment marked as received. Save the donation to generate pawti.");
};window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("#installBtn").classList.remove("hidden")});$("#installBtn").onclick=async()=>{if(deferredInstall){deferredInstall.prompt();deferredInstall=null;$("#installBtn").classList.add("hidden")}}}

(async()=>{
  try{
    await openDB();
    bind();
    if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=20260906-1",{scope:"./"}).catch(e=>console.warn("Service worker registration failed:",e));

    const loginForm=$("#loginForm");
    loginForm.addEventListener("submit",async e=>{
      e.preventDefault();
      const btn=loginForm.querySelector("button");
      btn.disabled=true; $("#loginError").textContent="";
      try{
        await firebaseAuth.signInWithEmailAndPassword($("#loginEmail").value.trim(),$("#loginPassword").value);
      }catch(err){$("#loginError").textContent=friendlyAuthError(err);}
      finally{btn.disabled=false;}
    });

    firebaseAuth.onAuthStateChanged(async user=>{
      if(user){
        $("#loginScreen").classList.add("hidden");
        $("#app").classList.remove("hidden");
        try{await load();}catch(e){console.error(e);toast("Could not load cloud data.");}
      }else{
        $("#app").classList.add("hidden");
        $("#loginScreen").classList.remove("hidden");
      }
    });
  }catch(e){console.error(e);toast("App could not start.");}
})();
