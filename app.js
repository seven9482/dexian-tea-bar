/* ===================== 得闲茶吧 · 经营工作台 ===================== */
/* 单页应用：本地自动保存 + JSONBin 云端同步（可选） + PWA 离线 */

const LS_KEY = 'dexian_tea_bar_v2';
const JSONBIN_API = 'https://api.jsonbin.io/v3';

let state = null;
let saveTimer = null;

/* ---------- 种子数据 ---------- */
function seed(){
  const today = new Date().toISOString().slice(0,10);
  return {
    expenses:[
      {id:uid(),name:'店面首个租金',cat:'租金',amount:3500,date:today,done:false},
      {id:uid(),name:'茶叶采购',cat:'原料',amount:680,date:today,done:false},
      {id:uid(),name:'水电费',cat:'运营',amount:240,date:today,done:true},
    ],
    income:[
      {id:uid(),name:'堂食营收',amount:1280,date:today,done:false},
      {id:uid(),name:'外卖订单',amount:560,date:today,done:false},
    ],
    products:[
      {id:uid(),name:'招牌奶茶',cat:'奶茶',price:18,cost:6},
      {id:uid(),name:'桂花乌龙',cat:'纯茶',price:15,cost:4},
    ],
    pricing:[
      {id:uid(),name:'招牌奶茶',cost:6,current:18,suggested:22,reason:'竞品均价20-25'},
      {id:uid(),name:'桂花乌龙',cost:4,current:15,suggested:18,reason:'提升毛利'},
    ],
    marketing:[
      {id:uid(),name:'小红书探店笔记',icon:'fa-book-open',desc:'每周2篇种草',status:'进行中'},
      {id:uid(),name:'门口易拉宝',icon:'fa-rectangle-ad',desc:'开业活动展示',status:'已就绪'},
    ],
    tasks:[
      {id:uid(),title:'办理食品经营许可证',date:today,done:true},
      {id:uid(),title:'完成美团入驻',date:today,done:false},
    ],
    upfront:[
      {id:uid(),person:'我',items:[
        {id:uid(),name:'制冰机',qty:1,amount:1200},
        {id:uid(),name:'茶叶首批',qty:5,amount:680},
      ]},
      {id:uid(),person:'弟妹',items:[
        {id:uid(),name:'收银设备',qty:1,amount:850},
      ]},
    ],
    sync:{binId:'',key:'',auto:true},
  };
}

/* ---------- 工具 ---------- */
function uid(){return Math.random().toString(36).slice(2,10);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(n){return '¥'+(Number(n)||0).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2});}
function today(){return new Date().toISOString().slice(0,10);}
function fmtDate(d){return d?d.slice(5).replace('-','/') : '';}

/* ---------- 持久化 ---------- */
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){ state = Object.assign(seed(), JSON.parse(raw)); }
    else { state = seed(); }
  }catch(e){ state = seed(); }
  // 字段兜底
  ['expenses','income','products','pricing','marketing','tasks','upfront'].forEach(k=>{ if(!state[k]) state[k]=[]; });
  if(!state.sync) state.sync={url:'',key:'',auto:true};
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  schedulePush();
}
function scheduleSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveState,300); }

/* ---------- 连接状态标识 ---------- */
let lastSyncError = '';
/* 同步日志（最多保留30条） */
let syncLog = [];
function addSyncLog(action, ok, detail){
  const now=new Date();
  const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
  syncLog.unshift({time:t,action,ok,detail});
  if(syncLog.length>30) syncLog.pop();
  renderSyncLog();
}
function renderSyncLog(){
  const el=document.getElementById('syncLogBox');
  if(!el) return;
  if(!syncLog.length){ el.innerHTML=''; return; }
  el.innerHTML='<div style="margin-top:10px"><div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px">📋 同步日志</div>'+
    syncLog.map(l=>`<div style="font-size:11.5px;padding:3px 8px;border-radius:6px;margin-bottom:2px;background:${l.ok?'#f0fdf4':'#fef2f2'};color:${l.ok?'#166534':'#991b1b'};word-break:break-all">${l.time} ${l.action} ${l.ok?'✅':'❌'} ${esc(l.detail)}</div>`).join('')+'</div>';
}
function setConn(stateName, text){
  const b=document.getElementById('connBadge'), c=document.getElementById('connChip'), t=document.getElementById('connChipText');
  [b,c].forEach(el=>{ if(el) el.dataset.state=stateName; });
  if(t) t.textContent=text;
  // 在设置页显示详细错误
  const el=document.getElementById('syncErrorBox');
  if(el){ el.innerHTML = stateName==='error'?`<div style="color:var(--danger);font-size:13px;padding:8px 12px;background:#fef2f2;border-radius:10px;margin-top:8px;word-break:break-all">❌ ${esc(text)}<br><span style="color:var(--muted);font-size:12px">${esc(lastSyncError)}</span></div>`:''; }
}

/* ---------- JSONBin 云端同步 ---------- */
function cleanKey(k){
  // 极度严格清理：只保留可打印ASCII（不含空格以外的控制字符）
  let s='';
  for(let i=0;i<(k||'').length;i++){
    const c=k.charCodeAt(i);
    if(c>=32&&c<=126) s+=k[i]; // 仅保留 !~ 范围
  }
  return s.trim();
}
function safeHeaders(key){
  const k=cleanKey(key);
  // 调试：显示清理后的key信息
  console.log('[Key清理] 原始长度:'+(key||'').length+' → 清理后:'+k.length+' 首尾:'+k.substring(0,5)+'...'+k.slice(-5));
  const h=new Headers();
  h.append('Content-Type','application/json');
  h.append('X-Bin-Meta','false');
  h.append('X-Master-Key',k);
  return h;
}
async function pushSync(){
  const binId=state.sync?.binId;
  if(!binId){ setConn('local','未连接云端'); addSyncLog('推送',false,'未配置Bin ID'); return; }
  setConn('syncing','同步中…');
  try{
    const body=JSON.stringify(state);
    const res=await fetch(JSONBIN_API+'/b/'+binId,{
      method:'PUT',
      headers:safeHeaders(state.sync?.key),
      body:body
    });
    if(!res.ok){
      const txt=await res.text().catch(()=>'');
      const msg='HTTP '+res.status+': '+txt.substring(0,200);
      throw new Error(msg);
    }
    setConn('connected','云端已连接');
    addSyncLog('推送',true,`数据大小 ${body.length} 字符`);
    // 验证：立即回读云端，确认数据真的存进去了
    try{
      const v=await fetch(JSONBIN_API+'/b/'+binId+'/latest',{method:'GET',headers:safeHeaders(state.sync?.key)});
      const vt=await v.text().catch(()=>'');
      addSyncLog('云端回读', true, '前80字: '+vt.substring(0,80));
    }catch(e){ addSyncLog('云端回读',false,'回读失败:'+e.message.slice(0,50)); }
  }catch(e){
    lastSyncError='推送: '+e.message;
    console.warn('[推送失败]',lastSyncError);
    setConn('error','同步失败');
    addSyncLog('推送',false,e.message.slice(0,100));
  }
}
async function pullSync(force){
  const binId=state.sync?.binId;
  if(!binId) return;
  try{
    const res=await fetch(JSONBIN_API+'/b/'+binId+'/latest',{
      method:'GET',
      headers:safeHeaders(state.sync?.key)
    });
    if(!res.ok){
      if(res.status===404&&!force) return; // 首次使用，还没创建
      const txt=await res.text().catch(()=>'');
      const msg='HTTP '+res.status+': '+txt.substring(0,200);
      throw new Error(msg);
    }
    const rawText=await res.text().catch(()=>'');
    let json=null;
    try{json=JSON.parse(rawText);}catch(e){}
    // 兼容 JSONBin 两种返回格式：
    //   默认包裹成 { record: {...} }；若带 X-Bin-Meta:false 则直接是数据对象
    const data=(json&&typeof json.record==='object')?json.record:json;
    // 诊断：显示原始返回内容（前120字）
    addSyncLog('诊断', true, 'GET返回: '+rawText.substring(0,120));
    if(data&&typeof data==='object'){
      const before=JSON.stringify(state);
      state=mergeState(data);
      localStorage.setItem(LS_KEY,JSON.stringify(state));
      setConn('connected','云端已连接');
      if(JSON.stringify(state)!==before) renderAll(); // 仅数据变化时才重渲染，避免打断输入
      addSyncLog('拉取',true,`合并完成，upfront=${state.upfront.length}人`);
    } else { setConn('connected','云端已连接（空数据）'); addSyncLog('拉取',true,'云端为空'); }
  }catch(e){
    lastSyncError='拉取: '+e.message;
    console.warn('[拉取失败]',lastSyncError);
    setConn('error','同步失败');
    addSyncLog('拉取',false,e.message.slice(0,100));
  }
}
function schedulePush(){
  if(state.sync?.auto) pushSync();
}
/* 合并：保留两端数据（按 id 取并集，冲突时云端优先），避免互相覆盖 */
function mergeState(server){
  const merged=Object.assign(seed(), server);
  ['expenses','income','products','pricing','marketing','tasks','upfront'].forEach(k=>{
    const loc=Array.isArray(state[k])?state[k]:[];
    const srv=Array.isArray(server[k])?server[k]:[];
    const map=new Map();
    loc.forEach(x=>{ if(x&&x.id!=null) map.set(x.id,x); });
    srv.forEach(x=>{ if(x&&x.id!=null) map.set(x.id,x); });
    merged[k]=[...map.values()];
  });
  // 若云端同步配置缺少 key（不该发生），保留本地已配置好的 key，避免拉取后断连
  if(!merged.sync||!merged.sync.key) merged.sync=state.sync||{binId:'',key:'',auto:true};
  return merged;
}
async function initSync(){
  const {binId,key}=state.sync||{};
  if(binId&&key){
    setConn('syncing','连接中…');
    await pullSync(true);
  } else {
    setConn('local','未连接云端');
  }
}

/* ---------- 渲染：总览 ---------- */
function renderOverview(){
  const inc=state.income.reduce((s,x)=>s+(+x.amount||0),0);
  const exp=state.expenses.reduce((s,x)=>s+(+x.amount||0),0);
  const net=inc-exp;
  const margin= inc>0 ? (net/inc*100) : 0;
  document.getElementById('page-overview').innerHTML=`
    <div class="stat-grid">
      <div class="stat accent"><div class="label">总收入</div><div class="value">${money(inc)}</div></div>
      <div class="stat"><div class="label">总支出</div><div class="value">${money(exp)}</div></div>
      <div class="stat"><div class="label">净利润</div><div class="value">${money(net)}</div></div>
      <div class="stat accent"><div class="label">毛利率</div><div class="value">${margin.toFixed(1)}<small>%</small></div></div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title"><i class="fa-regular fa-clock"></i>今日待办（${state.tasks.filter(t=>!t.done).length}）</div></div>
      ${state.tasks.filter(t=>!t.done).map(t=>`<div class="row"><div class="ic"><i class="fa-regular fa-circle-check"></i></div><div class="main-col"><div class="title">${esc(t.title)}</div><div class="sub">${fmtDate(t.date)}</div></div><span class="tag tag-muted">待完成</span></div>`).join('')||'<div class="empty">今天没有待办啦 🍵</div>'}
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title"><i class="fa-regular fa-hand-holding-dollar"></i>前期经费合计</div><div class="amt plus">${money(upfrontTotal())}</div></div>
      <div class="sub" style="color:var(--muted)">由 ${state.upfront.length} 位合伙人共同投入，详见「前期经费」。</div>
    </div>`;
}
function upfrontTotal(){return state.upfront.reduce((s,p)=>s+p.items.reduce((a,i)=>a+(+i.amount||0),0),0);}

/* ---------- 渲染：支出 ---------- */
function renderExpenses(){
  const active=state.expenses.filter(e=>!e.done);
  const done=state.expenses.filter(e=>e.done);
  document.getElementById('page-expenses').innerHTML=`
    <div class="card-head"><div class="card-title"><i class="fa-regular fa-credit-card"></i>支出管理</div>
      <button class="btn btn-primary" onclick="openExpenseModal()"><i class="fa-solid fa-plus"></i>记一笔</button></div>
    <div class="card">
      <div class="list">
        ${active.map(e=>rowHtml({ic:'fa-arrow-up',title:e.name,sub:`${esc(e.cat)} · ${fmtDate(e.date)}`,amt:e.amount,minus:true,onEdit:`openExpenseModal('${e.id}')`,onDel:`delExpense('${e.id}')`,extra:`<button class='icon-btn' title='标记完成' onclick='completeExpense("${e.id}")'><i class='fa-regular fa-circle-check'></i></button>`})).join('')||'<div class="empty">还没有支出记录</div>'}
      </div>
    </div>
    ${historyHtml(done,'支出已归档',e=>`${esc(e.name)} · ${esc(e.cat)}`,e=>e.amount,true,'delExpense')}
  `;
}

/* ---------- 渲染：收入 ---------- */
function renderIncome(){
  const active=state.income.filter(e=>!e.done);
  const done=state.income.filter(e=>e.done);
  document.getElementById('page-income').innerHTML=`
    <div class="card-head"><div class="card-title"><i class="fa-regular fa-sack-dollar"></i>收入管理</div>
      <button class="btn btn-primary" onclick="openIncomeModal()"><i class="fa-solid fa-plus"></i>记一笔</button></div>
    <div class="card">
      <div class="list">
        ${active.map(e=>rowHtml({ic:'fa-arrow-down',title:e.name,sub:fmtDate(e.date),amt:e.amount,minus:false,onEdit:`openIncomeModal('${e.id}')`,onDel:`delIncome('${e.id}')`,extra:`<button class='icon-btn' title='标记完成' onclick='completeIncome("${e.id}")'><i class='fa-regular fa-circle-check'></i></button>`})).join('')||'<div class="empty">还没有收入记录</div>'}
      </div>
    </div>
    ${historyHtml(done,'收入已入账',e=>esc(e.name),e=>e.amount,false,'delIncome')}
  `;
}

/* ---------- 通用行 ---------- */
function rowHtml(o){
  return `<div class="row">
    <div class="ic"><i class="fa-solid ${o.ic}"></i></div>
    <div class="main-col"><div class="title">${esc(o.title)}</div><div class="sub">${esc(o.sub||'')}</div></div>
    <div class="amt ${o.minus?'minus':'plus'}">${o.minus?'−':'+'}${money(o.amt)}</div>
    <div class="ops">${o.extra||''}<button class="icon-btn" onclick="${o.onEdit}"><i class="fa-regular fa-pen"></i></button><button class="icon-btn del" onclick="${o.onDel}"><i class="fa-regular fa-trash-can"></i></button></div>
  </div>`;
}
/* 历史折叠：按日期分组，支持删除 */
function historyHtml(items,titleText,labelFn,amtFn,minus,delFn){
  if(!items.length) return '';
  const groups={};
  items.forEach(it=>{const d=it.date||'未知'; (groups[d]=groups[d]||[]).push(it);});
  const dates=Object.keys(groups).sort().reverse();
  const body=dates.map(d=>`
    <div class="history-date" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('hidden')">
      <div class="hd-ic"><i class="fa-solid fa-chevron-down"></i></div>
      <div class="hd-label">${fmtDate(d)}</div>
      <div class="hd-count">${groups[d].length} 项 · ${money(groups[d].reduce((s,x)=>s+amtFn(x),0))}</div>
    </div>
    <div class="history-body">
      ${groups[d].map(it=>`<div class="row" style="opacity:.92">
        <div class="ic" style="background:var(--bg)"><i class="fa-solid ${minus?'fa-arrow-up':'fa-arrow-down'}"></i></div>
        <div class="main-col"><div class="title">${labelFn(it)}</div></div>
        <div class="amt ${minus?'minus':'plus'}">${minus?'−':'+'}${money(amtFn(it))}</div>
        ${delFn?`<button class="icon-btn del" onclick="${delFn('${it.id}')}" title="删除此条归档"><i class="fa-regular fa-trash-can"></i></button>`:''}
      </div>`).join('')}
    </div>`).join('');
  return `<div class="card"><div class="card-head"><div class="card-title"><i class="fa-regular fa-folder-open"></i>${titleText}</div></div>${body}</div>`;
}

/* ---------- 渲染：前期经费（按人） ---------- */
function renderUpfront(){
  let html=`<div class="card-head"><div class="card-title"><i class="fa-regular fa-hand-holding-dollar"></i>前期经费（按合伙人）</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="addPerson()"><i class="fa-solid fa-user-plus"></i>添加合伙人</button>
      <button class="btn btn-success" onclick="saveState();toast('✅ 已保存');pushSync()" style="font-weight:700"><i class="fa-solid fa-floppy-disk"></i>💾 保存并同步</button>
    </div></div>`;
  if(!state.upfront.length){ html+='<div class="empty">还没有记录，点右上角添加合伙人</div>'; }
  state.upfront.forEach(p=>{
    const total=p.items.reduce((s,i)=>s+(+i.amount||0),0);
    html+=`<div class="person-card">
      <div class="person-head">
        <div class="person-name"><div class="av">${esc(p.person.slice(0,1))}</div>${esc(p.person)}</div>
        <div style="display:flex;align-items:center;gap:8px"><span class="person-total">${money(total)}</span>
          <button class="icon-btn del" onclick="delPerson('${p.id}')"><i class="fa-regular fa-trash-can"></i></button></div>
      </div>
      ${p.items.map(it=>`
        <div class="item-line">
          <input class="input" value="${esc(it.name)}" placeholder="物品名称" onchange="updItem('${p.id}','${it.id}','name',this.value)">
          <input class="input" type="number" value="${esc(it.qty)}" placeholder="数量" onchange="updItem('${p.id}','${it.id}','qty',this.value)">
          <input class="input" type="number" value="${esc(it.amount)}" placeholder="金额" onchange="updItem('${p.id}','${it.id}','amount',this.value)">
          <button class="icon-btn del" onclick="delItem('${p.id}','${it.id}')"><i class="fa-regular fa-trash-can"></i></button>
        </div>`).join('')}
      <button class="btn btn-soft btn-block" style="margin-top:6px" onclick="addItem('${p.id}')"><i class="fa-solid fa-plus"></i>添加投入物品</button>
    </div>`;
  });
  html+=`<div class="card" style="background:var(--primary-bg)"><div class="card-head" style="margin:0"><div class="card-title"><i class="fa-solid fa-calculator"></i>合计投入</div><div class="amt plus" style="font-size:20px">${money(upfrontTotal())}</div></div></div>`;
  document.getElementById('page-upfront').innerHTML=html;
}

/* ---------- 渲染：产品/定价/推广 列表 ---------- */
function renderProducts(){
  document.getElementById('page-products').innerHTML=`
    <div class="card-head"><div class="card-title"><i class="fa-regular fa-box"></i>产品管理</div>
      <button class="btn btn-primary" onclick="openProductModal()"><i class="fa-solid fa-plus"></i>新增产品</button></div>
    <div class="card"><div class="list">
      ${state.products.map(p=>{const m=p.cost>0?((p.price-p.cost)/p.price*100):0;const mc=m>=65?'tag-success':m>=50?'tag-warning':'tag-info';return `<div class="row">
        <div class="ic"><i class="fa-solid fa-mug-hot"></i></div>
        <div class="main-col"><div class="title">${esc(p.name)}</div><div class="sub">${esc(p.cat)} · 售价 ${money(p.price)} · 成本 ${money(p.cost)}</div></div>
        <span class="tag ${mc}">毛利 ${m.toFixed(0)}%</span>
        <button class="icon-btn" onclick="openProductModal('${p.id}')"><i class="fa-regular fa-pen"></i></button>
        <button class="icon-btn del" onclick="delProduct('${p.id}')"><i class="fa-regular fa-trash-can"></i></button>
      </div>`;}).join('')||'<div class="empty">暂无产品</div>'}
    </div></div>`;
}
function renderPricing(){
  document.getElementById('page-pricing').innerHTML=`
    <div class="card-head"><div class="card-title"><i class="fa-regular fa-tags"></i>定价策略</div>
      <button class="btn btn-primary" onclick="openPricingModal()"><i class="fa-solid fa-plus"></i>新增</button></div>
    <div class="card"><div class="list">
      ${state.pricing.map(p=>{const cur_m=p.cost>0?((p.current-p.cost)/p.current*100):0;return `<div class="row">
        <div class="ic"><i class="fa-solid fa-tag"></i></div>
        <div class="main-col"><div class="title">${esc(p.name)}</div><div class="sub">成本 ${money(p.cost)} · 当前 ${money(p.current)} · 建议 ${money(p.suggested)}</div><div class="sub">${esc(p.reason)}</div></div>
        <span class="tag ${cur_m>=60?'tag-success':'tag-warning'}">当前毛利 ${cur_m.toFixed(0)}%</span>
        <button class="icon-btn" onclick="openPricingModal('${p.id}')"><i class="fa-regular fa-pen"></i></button>
        <button class="icon-btn del" onclick="delPricing('${p.id}')"><i class="fa-regular fa-trash-can"></i></button>
      </div>`;}).join('')||'<div class="empty">暂无定价</div>'}
    </div></div>`;
}
function renderMarketing(){
  const icons=['fa-book-open','fa-rectangle-ad','fa-bullhorn','fa-qrcode','fa-gift','fa-camera'];
  document.getElementById('page-marketing').innerHTML=`
    <div class="card-head"><div class="card-title"><i class="fa-regular fa-bullhorn"></i>推广准备</div>
      <button class="btn btn-primary" onclick="openMarketingModal()"><i class="fa-solid fa-plus"></i>新增</button></div>
    <div class="card"><div class="list">
      ${state.marketing.map(m=>{const st=m.status==='进行中'?'tag-info':m.status==='待审核'?'tag-warning':'tag-success';return `<div class="row">
        <div class="ic"><i class="fa-solid ${esc(m.icon||'fa-bullhorn')}"></i></div>
        <div class="main-col"><div class="title">${esc(m.title)}</div><div class="sub">${esc(m.desc)}</div></div>
        <span class="tag ${st}">${esc(m.status)}</span>
        <button class="icon-btn" onclick="openMarketingModal('${m.id}')"><i class="fa-regular fa-pen"></i></button>
        <button class="icon-btn del" onclick="delMarketing('${m.id}')"><i class="fa-regular fa-trash-can"></i></button>
      </div>`;}).join('')||'<div class="empty">暂无推广项</div>'}
    </div></div>`;
}

/* ---------- 设置 ---------- */
function renderSettings(){
  const s=state.sync;
  document.getElementById('page-settings').innerHTML=`
    <div class="card">
      <div class="card-head"><div class="card-title"><i class="fa-regular fa-cloud"></i>云端同步（JSONBin）</div></div>
      <div class="card-sub" style="font-size:12px;color:var(--muted);padding:0 4px 8px">📱 多设备同步：在已连上的设备点「复制我的配置串」，把生成的那一串通过微信发给另一台设备，在下面「粘贴配置串」里粘贴即可，不用手动填两个框。</div>
      <div style="font-size:13px;padding:6px 10px;background:#f3f7f8;border-radius:10px;margin-bottom:10px">当前仓库 Bin ID：<b id="curBin" style="color:var(--primary)">${esc(s.binId||'（未设置）')}</b>　状态：<b id="curStatus">${esc(s.binId&&s.key?'已配置':'未配置')}</b></div>
      <div class="field"><label>① 粘贴对方发来的配置串（一键同步）</label><input class="input" id="cfgStr" placeholder="粘贴 bin=...&key=... 这一整串"><button class="btn btn-primary" style="margin-top:8px" onclick="importConfigString()"><i class="fa-solid fa-link"></i>粘贴并连接</button></div>
      <div class="field"><label>② 或手动填写</label></div>
      <div class="field"><label>Bin ID</label><input class="input" id="setBinId" value="${esc(s.binId||'')}" placeholder="留空则自动创建新Bin"></div>
      <div class="field"><label>Access Key（API Key）</label><input class="input" id="setKey" value="${esc(s.key)}" placeholder="从 jsonbin.io 复制的 API Key" type="password"></div>
      <div class="setting-row"><div><div style="font-weight:600">自动同步</div><div style="font-size:12px;color:var(--muted)">每次修改后自动推送到云端</div></div><div class="switch ${s.auto?'on':''}" id="autoSw" onclick="toggleAuto()"></div></div>
      <div class="modal-actions">
        <button class="btn btn-soft" onclick="saveSyncSettings()"><i class="fa-regular fa-floppy-disk"></i>保存并连接</button>
        <button class="btn btn-primary" onclick="testConnection()"><i class="fa-solid fa-plug"></i>🔍 测试连接</button>
        <button class="btn btn-primary" onclick="manualPush()"><i class="fa-solid fa-arrow-up-from-bracket"></i>立即推送</button>
        <button class="btn btn-ghost" onclick="manualPull()"><i class="fa-solid fa-arrow-down"></i>拉取</button>
        <button class="btn btn-warning" onclick="forcePullFromCloud()" style="font-weight:700;color:#fff;background:linear-gradient(135deg,#f59e0b,#ef4444)"><i class="fa-solid fa-cloud-arrow-down"></i>🔥 强制覆盖拉取（推荐）</button>
      </div>
      <div class="modal-actions" style="margin-top:8px">
        <button class="btn btn-danger" onclick="forceBidirectionalSync()" style="font-weight:700"><i class="fa-solid fa-rotate"></i>🔄 强制双向同步（推荐）</button>
      </div>
      <div class="modal-actions" style="margin-top:8px">
        <button class="btn btn-soft" onclick="copyConfigString()"><i class="fa-solid fa-copy"></i>📋 复制我的配置串</button>
        <button class="btn btn-soft" onclick="shareConfig()"><i class="fa-solid fa-qrcode"></i>📱 生成分享码（扫码同步）</button>
      </div>
      <div id="syncErrorBox"></div>
      <div id="syncLogBox"></div>
      <div class="hint">连接状态以顶部/侧栏徽章显示：<b style="color:var(--success)">绿=已连接</b>、<b style="color:var(--danger)">红=未连接/失败</b>。<br><br>🔄 <b>推荐操作：</b>任一端改完数据后，点「<b>强制双向同步</b>」→ 推本地+拉云端+合并+再推 → 两端立刻一致。<br><br>📋 <b>获取步骤：</b><br>① 打开 <a href="https://jsonbin.io" target="_blank">jsonbin.io</a>，注册/登录<br>② 点右上角头像 → <b>API Keys</b> → 创建一个 Key 并复制<br>③ Bin ID 留空点「保存并连接」会自动创建<br><br>💡 多人/多设备填写<b>相同的 Bin ID 和 Access Key</b> 即可共享数据。</div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title"><i class="fa-regular fa-database"></i>数据</div></div>
      <div class="modal-actions">
        <button class="btn btn-soft" onclick="exportData()"><i class="fa-solid fa-file-export"></i>导出备份</button>
        <button class="btn btn-soft" onclick="importData()"><i class="fa-solid fa-file-import"></i>导入备份</button>
        <button class="btn btn-danger" onclick="resetData()"><i class="fa-regular fa-trash-can"></i>清空重来</button>
      </div>
      <div class="hint">所有数据默认保存在本机浏览器，关闭再打开不会丢失。开启云端同步后，多设备自动保持一致。</div>
    </div>`;
  renderSyncLog();
}

/* ---------- 渲染全部 ---------- */
function renderAll(){
  renderOverview();renderExpenses();renderIncome();renderUpfront();
  renderProducts();renderPricing();renderMarketing();renderSettings();
}

/* ---------- 导航 ---------- */
const PAGE_TITLES={overview:'总览',expenses:'支出管理',income:'收入管理',upfront:'前期经费',products:'产品管理',pricing:'定价策略',marketing:'推广准备',settings:'设置'};
function switchPage(p){
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===p));
  document.querySelectorAll('.page').forEach(s=>s.classList.toggle('active',s.id==='page-'+p));
  document.getElementById('pageTitle').textContent=PAGE_TITLES[p]||'';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show');
  if(p==='overview') renderOverview();
  if(p==='upfront') renderUpfront();
}

/* ---------- 模态框 ---------- */
function openModal(html){
  const root=document.getElementById('modalRoot');
  root.innerHTML=`<div class="modal-back" onclick="closeModal()"></div><div class="modal">${html}</div>`;
  root.classList.add('show');
}
function closeModal(){const r=document.getElementById('modalRoot');r.classList.remove('show');r.innerHTML='';}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}

/* ---------- 支出 CRUD ---------- */
function openExpenseModal(id){
  const e=id?state.expenses.find(x=>x.id===id):null;
  openModal(`<h3><i class="fa-regular fa-credit-card"></i>${e?'编辑支出':'记一笔支出'}</h3>
    <div class="field"><label>项目</label><input class="input" id="exName" value="${esc(e?e.name:'')}" placeholder="如 茶叶采购"></div>
    <div class="two-col"><div class="field"><label>分类</label><input class="input" id="exCat" value="${esc(e?e.cat:'')}" placeholder="原料/租金/运营"></div>
    <div class="field"><label>金额</label><input class="input" id="exAmt" type="number" value="${esc(e?e.amount:'')}"></div></div>
    <div class="field"><label>记账日期</label><input class="input" id="exDate" type="date" value="${esc(e?e.date:today())}"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveExpense('${id||''}')">保存</button></div>`);
}
function saveExpense(id){
  const name=document.getElementById('exName').value.trim();
  const amount=+document.getElementById('exAmt').value||0;
  if(!name){toast('请填写项目');return;}
  if(id){const e=state.expenses.find(x=>x.id===id);Object.assign(e,{name,cat:document.getElementById('exCat').value.trim(),amount,date:document.getElementById('exDate').value});}
  else state.expenses.push({id:uid(),name,cat:document.getElementById('exCat').value.trim(),amount,date:document.getElementById('exDate').value,done:false});
  saveState();renderExpenses();renderOverview();closeModal();toast('已保存');
}
function delExpense(id){state.expenses=state.expenses.filter(x=>x.id!==id);saveState();renderExpenses();renderOverview();toast('已删除');}
function completeExpense(id){const e=state.expenses.find(x=>x.id===id);if(e){e.done=true;saveState();renderExpenses();renderOverview();toast('已归档');}}

/* ---------- 收入 CRUD ---------- */
function openIncomeModal(id){
  const e=id?state.income.find(x=>x.id===id):null;
  openModal(`<h3><i class="fa-regular fa-sack-dollar"></i>${e?'编辑收入':'记一笔收入'}</h3>
    <div class="field"><label>来源</label><input class="input" id="inName" value="${esc(e?e.name:'')}" placeholder="如 堂食营收"></div>
    <div class="two-col"><div class="field"><label>金额</label><input class="input" id="inAmt" type="number" value="${esc(e?e.amount:'')}"></div>
    <div class="field"><label>记账日期</label><input class="input" id="inDate" type="date" value="${esc(e?e.date:today())}"></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveIncome('${id||''}')">保存</button></div>`);
}
function saveIncome(id){
  const name=document.getElementById('inName').value.trim();
  const amount=+document.getElementById('inAmt').value||0;
  if(!name){toast('请填写来源');return;}
  if(id){const e=state.income.find(x=>x.id===id);Object.assign(e,{name,amount,date:document.getElementById('inDate').value});}
  else state.income.push({id:uid(),name,amount,date:document.getElementById('inDate').value,done:false});
  saveState();renderIncome();renderOverview();closeModal();toast('已保存');
}
function delIncome(id){state.income=state.income.filter(x=>x.id!==id);saveState();renderIncome();renderOverview();toast('已删除');}
function completeIncome(id){const e=state.income.find(x=>x.id===id);if(e){e.done=true;saveState();renderIncome();renderOverview();toast('已入账');}}

/* ---------- 产品 CRUD ---------- */
function openProductModal(id){
  const p=id?state.products.find(x=>x.id===id):null;
  openModal(`<h3><i class="fa-regular fa-box"></i>${p?'编辑产品':'新增产品'}</h3>
    <div class="field"><label>名称</label><input class="input" id="pName" value="${esc(p?p.name:'')}"></div>
    <div class="field"><label>分类</label><input class="input" id="pCat" value="${esc(p?p.cat:'')}" placeholder="奶茶/纯茶/小食"></div>
    <div class="two-col"><div class="field"><label>售价</label><input class="input" id="pPrice" type="number" value="${esc(p?p.price:'')}"></div>
    <div class="field"><label>成本</label><input class="input" id="pCost" type="number" value="${esc(p?p.cost:'')}"></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveProduct('${id||''}')">保存</button></div>`);
}
function saveProduct(id){
  const name=document.getElementById('pName').value.trim();
  if(!name){toast('请填写名称');return;}
  const o={name,cat:document.getElementById('pCat').value.trim(),price:+document.getElementById('pPrice').value||0,cost:+document.getElementById('pCost').value||0};
  if(id){Object.assign(state.products.find(x=>x.id===id),o);}else state.products.push({id:uid(),...o});
  saveState();renderProducts();closeModal();toast('已保存');
}
function delProduct(id){state.products=state.products.filter(x=>x.id!==id);saveState();renderProducts();toast('已删除');}

/* ---------- 定价 CRUD ---------- */
function openPricingModal(id){
  const p=id?state.pricing.find(x=>x.id===id):null;
  openModal(`<h3><i class="fa-regular fa-tags"></i>${p?'编辑定价':'新增定价'}</h3>
    <div class="field"><label>产品</label><input class="input" id="prName" value="${esc(p?p.name:'')}"></div>
    <div class="two-col"><div class="field"><label>成本</label><input class="input" id="prCost" type="number" value="${esc(p?p.cost:'')}"></div>
    <div class="field"><label>当前售价</label><input class="input" id="prCur" type="number" value="${esc(p?p.current:'')}"></div></div>
    <div class="field"><label>建议售价</label><input class="input" id="prSug" type="number" value="${esc(p?p.suggested:'')}"></div>
    <div class="field"><label>备注</label><input class="input" id="prReason" value="${esc(p?p.reason:'')}" placeholder="定价理由"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="savePricing('${id||''}')">保存</button></div>`);
}
function savePricing(id){
  const name=document.getElementById('prName').value.trim();
  if(!name){toast('请填写产品');return;}
  const o={name,cost:+document.getElementById('prCost').value||0,current:+document.getElementById('prCur').value||0,suggested:+document.getElementById('prSug').value||0,reason:document.getElementById('prReason').value.trim()};
  if(id){Object.assign(state.pricing.find(x=>x.id===id),o);}else state.pricing.push({id:uid(),...o});
  saveState();renderPricing();closeModal();toast('已保存');
}
function delPricing(id){state.pricing=state.pricing.filter(x=>x.id!==id);saveState();renderPricing();toast('已删除');}

/* ---------- 推广 CRUD ---------- */
function openMarketingModal(id){
  const m=id?state.marketing.find(x=>x.id===id):null;
  const opts=[['fa-book-open','笔记'],['fa-rectangle-ad','海报'],['fa-bullhorn','地推'],['fa-qrcode','二维码'],['fa-gift','活动'],['fa-camera','拍照']];
  openModal(`<h3><i class="fa-regular fa-bullhorn"></i>${m?'编辑推广':'新增推广'}</h3>
    <div class="field"><label>标题</label><input class="input" id="mTitle" value="${esc(m?m.title:'')}"></div>
    <div class="field"><label>说明</label><input class="input" id="mDesc" value="${esc(m?m.desc:'')}"></div>
    <div class="two-col"><div class="field"><label>图标</label><select class="select" id="mIcon">${opts.map(o=>`<option value="${o[0]}" ${m&&m.icon===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></div>
    <div class="field"><label>状态</label><select class="select" id="mStatus"><option ${m&&m.status==='进行中'?'selected':''}>进行中</option><option ${m&&m.status==='待审核'?'selected':''}>待审核</option><option ${m&&m.status==='已就绪'?'selected':''}>已就绪</option><option ${m&&m.status==='已完成'?'selected':''}>已完成</option></select></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveMarketing('${id||''}')">保存</button></div>`);
}
function saveMarketing(id){
  const title=document.getElementById('mTitle').value.trim();
  if(!title){toast('请填写标题');return;}
  const o={title,desc:document.getElementById('mDesc').value.trim(),icon:document.getElementById('mIcon').value,status:document.getElementById('mStatus').value};
  if(id){Object.assign(state.marketing.find(x=>x.id===id),o);}else state.marketing.push({id:uid(),...o});
  saveState();renderMarketing();closeModal();toast('已保存');
}
function delMarketing(id){state.marketing=state.marketing.filter(x=>x.id!==id);saveState();renderMarketing();toast('已删除');}

/* ---------- 前期经费（按人） ---------- */
function addPerson(){const name=prompt('合伙人名字：','');if(!name)return;state.upfront.push({id:uid(),person:name.trim(),items:[]});saveState();renderUpfront();renderOverview();}
function delPerson(pid){state.upfront=state.upfront.filter(p=>p.id!==pid);saveState();renderUpfront();renderOverview();}
function addItem(pid){const p=state.upfront.find(x=>x.id===pid);p.items.push({id:uid(),name:'',qty:1,amount:0});saveState();renderUpfront();renderOverview();}
function delItem(pid,iid){const p=state.upfront.find(x=>x.id===pid);p.items=p.items.filter(i=>i.id!==iid);saveState();renderUpfront();renderOverview();}
function updItem(pid,iid,field,val){const p=state.upfront.find(x=>x.id===pid);const it=p.items.find(i=>i.id===iid);if(it){it[field]=field==='name'?val:(+val||0);}saveState();renderOverview();}

/* ---------- 同步设置 ---------- */
function toggleAuto(){state.sync.auto=!state.sync.auto;saveState();renderSettings();}
/* 用当前 Key 在 JSONBin 创建一个新 Bin，返回新 Bin ID */
async function createBin(key){
  const cr=await fetch(JSONBIN_API+'/b',{method:'POST',headers:safeHeaders(key),body:JSON.stringify(state)});
  let respBody='';
  try{respBody=await cr.text();}catch(e){respBody='(无法读取)';}
  if(!cr.ok) throw new Error('创建Bin失败 HTTP '+cr.status+': '+respBody.substring(0,300));
  let cj;
  try{cj=JSON.parse(respBody);}catch(e){throw new Error('返回格式错误: '+respBody.substring(0,200));}
  const id=cj.metadata?.id;
  if(!id) throw new Error('创建成功但未返回 Bin ID');
  return id;
}
async function saveSyncSettings(){
  const key=cleanKey(document.getElementById('setKey').value);
  if(!key){toast('请先填写 Access Key');return;}
  let binId=document.getElementById('setBinId').value.trim();
  setConn('syncing','正在连接…');
  try{
    if(!binId){ setConn('syncing','正在创建新仓库…'); binId=await createBin(key); toast('已创建新仓库'); }
    state.sync.binId=binId;
    state.sync.key=key;
    state.sync.url=''; // 清除旧的Supabase URL
    saveState();
    lastSyncError='';
    const sb=document.getElementById('syncErrorBox'); if(sb) sb.innerHTML='';
    await initSync();
    renderSettings();
    toast('已保存并连接');
  }catch(e){
    lastSyncError=e.message||String(e);
    setConn('error','连接失败');
    toast('连接失败：'+lastSyncError.slice(0,60));
  }
}
async function testConnection(){
  let binId=document.getElementById('setBinId')?.value?.trim()||state.sync?.binId||'';
  let rawKey=document.getElementById('setKey')?.value||'';
  const key=cleanKey(rawKey);
  if(!key){toast('请先填写 Access Key');return;}
  // 更新输入框为清理后的值
  document.getElementById('setKey').value=key;
  lastSyncError='';document.getElementById('syncErrorBox').innerHTML='';
  setConn('syncing','测试中…');
  try{
    if(!binId){
      setConn('syncing','正在创建 Bin…');
      binId=await createBin(key);
      document.getElementById('setBinId').value=binId;
      state.sync.binId=binId;
      state.sync.key=key;
      saveState();
    }
    const r=await fetch(JSONBIN_API+'/b/'+binId+'/latest',{
      method:'GET',
      headers:safeHeaders(key)
    });
    if(!r.ok){const t=await r.text().catch(()=>'');throw new Error('读取失败 HTTP '+r.status+': '+t.substring(0,300));}
    setConn('connected','云端已连接 ✅');
    renderSettings();
    toast('连接成功！');
  }catch(e){
    lastSyncError=e.message||String(e);
    console.warn('[测试连接失败]',lastSyncError);
    setConn('error','连接失败');
  }
}
async function manualPush(){saveState();await pushSync();toast('推送完成，请查看上方日志');}
async function manualPull(){await pullSync(true);toast('拉取完成，请查看上方日志');}
/* 🔥 强制覆盖拉取：直接用云端数据完全替换本地（不合并），100%确保和云端一致 */
async function forcePullFromCloud(){
  const binId=state.sync?.binId;
  const key=state.sync?.key;
  if(!binId||!key){toast('未配置云端');return;}
  setConn('syncing','正在从云端强制拉取…');
  addSyncLog('强制覆盖',false,'开始…');
  try{
    const res=await fetch(JSONBIN_API+'/b/'+binId+'/latest',{
      method:'GET',headers:safeHeaders(key)
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const rawText=await res.text();
    addSyncLog('强制覆盖',true,'GET '+rawText.length+'字符');
    let json=null;
    try{json=JSON.parse(rawText);}catch(e){}
    const data=(json&&typeof json.record==='object')?json.record:json;
    if(data&&typeof data==='object'){
      // 保留本地的sync配置（防止云端没有key导致断连）
      const mySync=state.sync;
      state=data;
      state.sync=mySync; // 恢复本地同步配置
      localStorage.setItem(LS_KEY,JSON.stringify(state));
      setConn('connected','云端已连接');
      renderAll();
      addSyncLog('强制覆盖',true,'✅ 已替换本地数据！upfront='+state.upfront.length+'人, 合计¥'+upfrontTotal());
      toast('✅ 已从云端覆盖！数据已更新');
    } else { throw new Error('云端返回空数据'); }
  }catch(e){
    addSyncLog('强制覆盖',false,e.message.slice(0,100));
    toast('❌ 失败：'+e.message.slice(0,50));
    setConn('error','拉取失败');
  }
}
/* 强制双向同步：先推本地→拉云端合并→再推合并结果（加延迟避免限流） */
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function forceBidirectionalSync(){
  if(!state.sync?.binId||!state.sync?.key){toast('未配置云端');return;}
  setConn('syncing','双向同步中…');
  addSyncLog('双向同步',false,'开始…');
  try{
    // 1. 推送本地数据
    await pushSync();
    await sleep(800); // 避免触发 JSONBin 限流(403)
    // 2. 拉取云端数据并合并
    await pullSync(true);
    await sleep(800);
    // 3. 再把合并后的结果推上去（确保两端一致）
    await pushSync();
    setConn('connected','云端已连接');
    addSyncLog('双向同步',true,'完成！两端数据已统一');
    toast('✅ 双向同步完成！');
  }catch(e){
    addSyncLog('双向同步',false,e.message.slice(0,100));
    toast('❌ 同步失败：'+e.message.slice(0,50));
  }
}

/* ---------- 数据维护 ---------- */
function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='得闲茶吧备份.json';a.click();
}
function importData(){
  const inp=document.createElement('input');inp.type='file';inp.accept='application/json';
  inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{state=Object.assign(seed(),JSON.parse(r.result));saveState();renderAll();toast('导入成功');}catch(e){toast('文件格式错误');}};r.readAsText(f);};
  inp.click();
}
function resetData(){if(confirm('确定清空所有数据并恢复示例？')){state=seed();saveState();renderAll();toast('已重置');}}

/* ---------- 初始化 ---------- */
function init(){
  // 全局错误捕获：任何报错都显示在屏幕上，避免"静默卡死"
  window.onerror=function(msg,src,line,col){
    const box=document.getElementById('errBox');
    if(box){ box.style.display='block'; box.textContent='⚠️ 页面运行出错：'+msg+' (行'+line+')'; }
    return false;
  };
  // 先把所有点击监听绑上（即使后面渲染出错，页面照样能点）
  document.getElementById('nav').addEventListener('click',e=>{const a=e.target.closest('.nav-item');if(a)switchPage(a.dataset.page);});
  document.getElementById('hamburger').addEventListener('click',()=>{document.getElementById('sidebar').classList.add('open');document.getElementById('backdrop').classList.add('show');});
  document.getElementById('backdrop').addEventListener('click',()=>{document.getElementById('sidebar').classList.remove('open');document.getElementById('backdrop').classList.remove('show');});
  loadState();
  // 从 URL 参数自动应用云端配置（分享链接场景）
  try{
    const params=new URLSearchParams(location.search);
    const ub=params.get('bin'), uk=params.get('key');
    if(ub&&uk&&window.history){
      state.sync.binId=cleanKey(ub);
      state.sync.key=cleanKey(uk);
      saveState();
      location.replace(location.pathname); // 清除URL参数
      return;
    }
  }catch(e){console.warn('[URL配置]',e);}
  try{ renderAll(); }catch(e){ console.error('[渲染失败]',e); const box=document.getElementById('errBox'); if(box){box.style.display='block';box.textContent='⚠️ 渲染出错：'+e.message;} }
  initSync();
  // 自动拉取云端最新数据（多设备近实时同步）
  setInterval(()=>{
    // 正在设置页编辑配置时跳过，避免重渲染清空输入框
    if(document.getElementById('page-settings')?.classList.contains('active')) return;
    if(state.sync?.binId && state.sync?.key){ pullSync(false); }
  }, 15000);
  // PWA
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}

/* ---------- 分享配置（生成二维码） ---------- */
function shareConfig(){
  const {binId,key}=state.sync||{};
  if(!binId||!key){toast('请先连接云端再分享');return;}
  const url=location.origin+location.pathname+'?bin='+encodeURIComponent(binId)+'&key='+encodeURIComponent(key);
  const modalHtml=`
    <div class="card-head"><div class="card-title"><i class="fa-solid fa-qrcode"></i>扫码同步配置</div></div>
    <p style="font-size:13px;color:var(--muted)">用另一台手机/电脑扫描下方二维码，打开后会自动连到同一个云端仓库：</p>
    <div id="qrBox" style="display:flex;justify-content:center;padding:16px;background:#fff;border-radius:14px;margin:12px 0"></div>
    <div class="field"><label>或复制此链接发送</label><input class="input" id="shareUrl" value="${esc(url)}" readonly onclick="this.select()"></div>
    <div class="modal-actions"><button class="btn btn-primary" onclick="copyShareUrl()"><i class="fa-regular fa-copy"></i>复制链接</button><button class="btn btn-ghost" onclick="closeModal()">关闭</button></div>`;
  openModal(modalHtml);
  setTimeout(()=>{
    const box=document.getElementById('qrBox');
    if(box&&window.QRCode){ new QRCode(box,{text:url,width:200,height:200}); }
    else if(box){ box.innerHTML='<div style="color:var(--danger);font-size:13px">二维码库加载失败，请直接复制上方链接</div>'; }
  },50);
}
function copyShareUrl(){const i=document.getElementById('shareUrl');if(i){i.select();document.execCommand('copy');toast('链接已复制');}}
function copyConfigString(){
  const {binId,key}=state.sync||{};
  if(!binId||!key){toast('请先连接云端再复制');return;}
  const str='bin='+binId+'&key='+key;
  const i=document.createElement('input');i.value=str;document.body.appendChild(i);i.select();
  try{document.execCommand('copy');toast('配置串已复制，发给另一台设备即可');}catch(e){}
  document.body.removeChild(i);
}
function importConfigString(){
  const raw=document.getElementById('cfgStr')?.value?.trim()||'';
  if(!raw){toast('请先粘贴配置串');return;}
  let binId='',key='';
  // 支持两种格式：bin=xxx&key=yyy  或  完整URL ?bin=xxx&key=yyy
  try{
    let q=raw;
    if(raw.includes('?')) q=raw.split('?')[1];
    if(raw.includes('://')){ const u=new URL(raw); q=u.search.slice(1); }
    const p=new URLSearchParams(q);
    binId=cleanKey(p.get('bin')||'');
    key=cleanKey(p.get('key')||'');
  }catch(e){}
  if(!binId||!key){toast('配置串格式不对，请确认粘贴完整');return;}
  document.getElementById('setBinId').value=binId;
  document.getElementById('setKey').value=key;
  state.sync.binId=binId;
  state.sync.key=key;
  saveState();
  initSync();
  renderSettings(); // 刷新显示，让“当前仓库 Bin ID”立即更新
  toast('已导入并连接，正在拉取数据…');
}
document.addEventListener('DOMContentLoaded',init);
