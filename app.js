/* ===================== 得闲茶吧 · 经营工作台 ===================== */
/* 单页应用：本地自动保存 + Supabase 云端同步（可选） + PWA 离线 */

const LS_KEY = 'dexian_tea_bar_v2';
const SYNC_ROW_ID = 'shared-store';   // 所有设备共享同一份数据
const TABLE = 'tea_bar_sync';

let state = null;
let sb = null;          // supabase client
let sbChannel = null;
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
    sync:{url:'',key:'',auto:true},
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
function setConn(stateName, text){
  const b=document.getElementById('connBadge'), c=document.getElementById('connChip'), t=document.getElementById('connChipText');
  [b,c].forEach(el=>{ if(el) el.dataset.state=stateName; });
  if(t) t.textContent=text;
}

/* ---------- Supabase ---------- */
function ensureClient(){
  if(sb) return sb;
  const {url,key}=state.sync;
  if(!url||!key||!window.supabase) return null;
  try{ sb = window.supabase.createClient(url.trim(), key.trim()); return sb; }
  catch(e){ console.warn(e); return null; }
}
async function pushSync(){
  const client=ensureClient();
  if(!client){ setConn('local','未连接云端'); return; }
  setConn('syncing','同步中…');
  try{
    const payload=JSON.stringify(state);
    const {error}=await client.from(TABLE).upsert({id:SYNC_ROW_ID,payload,updated_at:new Date().toISOString()});
    if(error) throw error;
    setConn('connected','云端已连接');
  }catch(e){ console.warn(e); setConn('error','同步失败'); }
}
async function pullSync(force){
  const client=ensureClient();
  if(!client) return;
  try{
    const {data,error}=await client.from(TABLE).select('payload,updated_at').eq('id',SYNC_ROW_ID).maybeSingle();
    if(error) throw error;
    if(data&&data.payload){
      const incoming=JSON.parse(data.payload);
      // 简单末次写入优先
      state=Object.assign(seed(), incoming);
      ['expenses','income','products','pricing','marketing','tasks','upfront'].forEach(k=>{ if(!state[k]) state[k]=[]; });
      if(!state.sync) state.sync={url:'',key:'',auto:true};
      localStorage.setItem(LS_KEY,JSON.stringify(state));
      setConn('connected','云端已连接');
      renderAll();
    } else { setConn('connected','云端已连接'); }
  }catch(e){ console.warn(e); setConn('error','同步失败'); }
}
function subscribeRealtime(){
  const client=ensureClient(); if(!client||sbChannel) return;
  try{
    sbChannel=client.channel('tea_bar_sync_changes')
      .on('postgres_changes',{event:'*',schema:'public',table:TABLE,filter:`id=eq.${SYNC_ROW_ID}`},()=>{ pullSync(); })
      .subscribe();
  }catch(e){console.warn(e);}
}
function schedulePush(){
  if(state.sync.auto) pushSync();
}
async function initSync(){
  const {url,key}=state.sync;
  if(url&&key&&window.supabase){
    const client=ensureClient();
    if(client){
      setConn('syncing','连接中…');
      await pullSync();
      subscribeRealtime();
    }
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
    ${historyHtml(done,'支出已归档',e=>`${esc(e.name)} · ${esc(e.cat)}`,e=>e.amount,true)}
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
    ${historyHtml(done,'收入已入账',e=>esc(e.name),e=>e.amount,false)}
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
/* 历史折叠：按日期分组 */
function historyHtml(items,titleText,labelFn,amtFn,minus){
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
      </div>`).join('')}
    </div>`).join('');
  return `<div class="card"><div class="card-head"><div class="card-title"><i class="fa-regular fa-folder-open"></i>${titleText}</div></div>${body}</div>`;
}

/* ---------- 渲染：前期经费（按人） ---------- */
function renderUpfront(){
  let html=`<div class="card-head"><div class="card-title"><i class="fa-regular fa-hand-holding-dollar"></i>前期经费（按合伙人）</div>
    <button class="btn btn-primary" onclick="addPerson()"><i class="fa-solid fa-user-plus"></i>添加合伙人</button></div>`;
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
      <div class="card-head"><div class="card-title"><i class="fa-regular fa-cloud"></i>云端同步（Supabase）</div></div>
      <div class="field"><label>Supabase 项目 URL</label><input class="input" id="setUrl" value="${esc(s.url)}" placeholder="https://xxxx.supabase.co"></div>
      <div class="field"><label>Anon / Public Key</label><input class="input" id="setKey" value="${esc(s.key)}" placeholder="eyJhbGci..." type="password"></div>
      <div class="field"><label>共享数据 ID</label><input class="input" id="setRow" value="${SYNC_ROW_ID}" disabled></div>
      <div class="setting-row"><div><div style="font-weight:600">自动同步</div><div style="font-size:12px;color:var(--muted)">每次修改后自动推送到云端</div></div><div class="switch ${s.auto?'on':''}" id="autoSw" onclick="toggleAuto()"></div></div>
      <div class="modal-actions">
        <button class="btn btn-soft" onclick="saveSyncSettings()"><i class="fa-regular fa-floppy-disk"></i>保存并连接</button>
        <button class="btn btn-primary" onclick="manualPush()"><i class="fa-solid fa-arrow-up-from-bracket"></i>立即推送</button>
        <button class="btn btn-ghost" onclick="manualPull()"><i class="fa-solid fa-arrow-down"></i>拉取</button>
      </div>
      <div class="hint">连接状态以顶部/侧栏徽章显示：<b style="color:var(--success)">绿=已连接</b>、<b style="color:var(--danger)">红=未连接/失败</b>。多人/多设备填写<b>相同的 URL、Key、数据 ID</b> 即可共享同一份数据。</div>
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
function saveSyncSettings(){
  state.sync.url=document.getElementById('setUrl').value.trim();
  state.sync.key=document.getElementById('setKey').value.trim();
  sb=null;sbChannel=null;
  saveState();
  initSync();
  toast('已保存，正在连接…');
}
function manualPush(){saveState();toast('已推送到云端');}
function manualPull(){pullSync(true).then(()=>toast('已从云端拉取'));}

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
  loadState();
  renderAll();
  document.getElementById('nav').addEventListener('click',e=>{const a=e.target.closest('.nav-item');if(a)switchPage(a.dataset.page);});
  document.getElementById('hamburger').addEventListener('click',()=>{document.getElementById('sidebar').classList.add('open');document.getElementById('backdrop').classList.add('show');});
  document.getElementById('backdrop').addEventListener('click',()=>{document.getElementById('sidebar').classList.remove('open');document.getElementById('backdrop').classList.remove('show');});
  initSync();
  // PWA
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
document.addEventListener('DOMContentLoaded',init);
