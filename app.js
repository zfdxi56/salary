// ============================================================
// 果園收支記帳 — app.js
// Google Sheets 作為後端，三分頁：收入 / 支出 / 管理
// ============================================================

// ============================================================
// 1. 全域設定
// ============================================================
const SPREADSHEET_ID = '1rjVEG9x9ZJ6f3BSuC4CL_wYRATFvbGiZAGkwkzDP168';
const CLIENT_ID = '647415610600-eio0d6dqpu80j80gki4l9m5qfemmlkab.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// 工作表名稱（全部使用繁體中文）
const SHEET = {
  USERS: '使用者',
  INCOME_CATS: '設定_品種',
  EXPENSE_CATS: '設定_支出類別',
  WORKERS: '設定_工人名單',
  UNITS: '設定_單位清單',
  INCOME: '收入',
  EXPENSE: '支出',
};

// ============================================================
// 2. 全域狀態
// ============================================================
let gapiInited = false;
let gisInited = false;
let tokenClient;

let currentUser = null;  // { email, role: 'admin'|'user' }
let isAdmin = false;

let incomeData = [];   // 收入紀錄
let expenseData = [];  // 支出紀錄
let usersData = [];    // 使用者清單

// Settings 資料
let settings = {
  incomeMainCats: [],    // [{ 名稱 }]
  expenseMainCats: [],   // [{ 名稱, 類型, 次類別: [{名稱, 預設金額}] }]
  workers: [],           // [{ 姓名, 預設時薪, 預設日薪 }]
  units: [],             // [名稱]
};

// 篩選/排序狀態
const filterState = {
  income: { mainCat: null, sortOrder: 'desc', period: 'all' },
  expense: { mainCat: null, subCat: null, sortOrder: 'desc', period: 'all' },
};

// ============================================================
// 3. 預設資料（若工作表無資料時使用）
// ============================================================
const DEFAULT_INCOME_CATS = ['甜柿', '水蜜桃', '橘子', '其他'];

const DEFAULT_EXPENSE_CATS = [
  {
    名稱: '工人薪資', 類型: 'worker',
    次類別: [
      { 名稱: '除草', 預設金額: '' },
      { 名稱: '疏果', 預設金額: '' },
      { 名稱: '套袋', 預設金額: '' },
      { 名稱: '收果', 預設金額: '' },
      { 名稱: '剪枝', 預設金額: '' },
      { 名稱: '斷水', 預設金額: '' },
      { 名稱: '撿枝', 預設金額: '' },
    ]
  },
  {
    名稱: '肥料', 類型: 'material',
    次類別: [
      { 名稱: '骨粉', 預設金額: '' },
      { 名稱: '海鳥糞', 預設金額: '' },
      { 名稱: '堆肥', 預設金額: '' },
      { 名稱: '豆粕', 預設金額: '' },
      { 名稱: '苦土石灰', 預設金額: '' },
      { 名稱: '複合肥料', 預設金額: '' },
      { 名稱: '有機肥料', 預設金額: '' },
      { 名稱: '尿素', 預設金額: '' },
    ]
  },
  {
    名稱: '農藥', 類型: 'material',
    次類別: [
      { 名稱: '蘇力菌 (B.t.)', 預設金額: '' },
      { 名稱: '苦楝油', 預設金額: '' },
      { 名稱: '葵無露', 預設金額: '' },
      { 名稱: '石灰硫磺合劑', 預設金額: '' },
      { 名稱: '亞磷酸', 預設金額: '' },
    ]
  },
  {
    名稱: '包裝材料', 類型: 'material',
    次類別: [
      { 名稱: '水果紙箱', 預設金額: '' },
      { 名稱: '泡棉網套', 預設金額: '' },
      { 名稱: '塑膠內袋', 預設金額: '' },
      { 名稱: '封箱膠帶', 預設金額: '' },
      { 名稱: '蔬果標籤貼紙', 預設金額: '' },
    ]
  },
  {
    名稱: '伙食支出', 類型: 'meal',
    次類別: [
      { 名稱: '美華阿姨', 預設金額: '' },
      { 名稱: '燕子', 預設金額: '' },
      { 名稱: '溪明', 預設金額: '' },
      { 名稱: '可', 預設金額: '' },
      { 名稱: '弟&雪', 預設金額: '' },
    ]
  },
];

const GRADE_OPTIONS = ['2A', '3A', '4A', '5A', '6A', '7A'];

// ============================================================
// 4. Google API 初始化
// ============================================================
function gapiLoaded() {
  gapi.load('client', async () => {
    gapi.client.load('sheets', 'v4', () => {
      gapiInited = true;
      maybeEnableAuth();
    });
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
  gisInited = true;
  maybeEnableAuth();
}

const _checkInterval = setInterval(() => {
  if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
    clearInterval(_checkInterval);
    gapiLoaded();
    gisLoaded();
  }
}, 100);

function maybeEnableAuth() {
  if (gapiInited && gisInited) {
    document.getElementById('authBtn').style.display = 'inline-flex';
    document.getElementById('authBtn').onclick = handleLogin;
    
    // 嘗試自動檢查是否已授權
    const token = gapi.client.getToken();
    if (token) {
      afterLogin();
    }
  }
}

function handleLogin() {
  tokenClient.callback = async (resp) => {
    if (resp.error) throw resp;
    await afterLogin();
  };
  const token = gapi.client.getToken();
  tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
}

async function afterLogin() {
  showLoader('登入中...');
  try {
    // 取得登入者 email
    const tokenInfo = gapi.client.getToken();
    // 透過 tokeninfo endpoint 取得 email
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${tokenInfo.access_token}`);
    const info = await res.json();
    const email = info.email || '';

    // 確保工作表存在（初次使用自動建立）
    await ensureSheetsExist();
    await fetchAllData();

    // 確認使用者角色
    let userRow = usersData.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    // 如果系統完全沒有使用者，或者是特定條件下的首位登入者
    if (usersData.length === 0 && !userRow) {
      console.log('系統初始登入：自動將首位使用者設為管理員');
      await addUserToSheet(email, 'admin');
      await fetchUsers(); // 重新讀取名單
      userRow = usersData.find(u => u.email.toLowerCase() === email.toLowerCase());
    }

    if (!userRow) {
      // 未登記的帳號 → 當一般使用者
      currentUser = { email, role: 'user' };
    } else {
      currentUser = { email, role: userRow.role };
    }
    isAdmin = currentUser.role === 'admin';

    // 更新 header
    const currentName = userRow?.nickname || email.split('@')[0];
    document.getElementById('userNameDisplay').textContent = currentName;
    document.getElementById('userRoleBadge').textContent = isAdmin ? '管理員' : '使用者';
    document.getElementById('userRoleBadge').className = `role-badge${isAdmin ? ' admin' : ''}`;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'inline-flex';

    if (isAdmin) {
      document.getElementById('tab-admin').style.display = 'flex';
    }

    document.getElementById('authSection').style.display = 'none';
    document.getElementById('workspace').style.display = 'block';

    switchTab('income');
    renderAll();
  } catch (e) {
    console.error(e);
    showToast('登入失敗，請重試', 'error');
  }
  hideLoader();
}

/**
 * 將使用者加入試算表
 */
async function addUserToSheet(email, role) {
  try {
    const defaultNickname = email.split('@')[0];
    const row = [defaultNickname, email, role, now()];
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.USERS}!A:D`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });
  } catch (e) {
    console.error('addUserToSheet 失敗:', e);
  }
}

/**
 * 通用的附加資料到工作表
 */
async function appendToSheet(sheetName, row) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:E`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [row] }
  });
}

document.getElementById('logoutBtn').onclick = () => {
  google.accounts.oauth2.revoke(gapi.client.getToken()?.access_token, () => {});
  gapi.client.setToken(null);
  currentUser = null;
  isAdmin = false;
  document.getElementById('workspace').style.display = 'none';
  document.getElementById('authSection').style.display = 'flex';
  document.getElementById('userNameDisplay').style.display = 'none';
  document.getElementById('userRoleBadge').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('tab-admin').style.display = 'none';
};

// ============================================================
// 5. Google Sheets 工作表建立（初次使用）
// ============================================================
async function ensureSheetsExist() {
  try {
    const ss = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existingTitles = ss.result.sheets.map(s => s.properties.title);
    const needed = Object.values(SHEET).filter(t => !existingTitles.includes(t));
    if (needed.length > 0) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
          requests: needed.map(title => ({
            addSheet: { properties: { title } }
          }))
        }
      });
      // 寫入標題列
      await initSheetHeaders();
    }
  } catch (e) {
    console.error('ensureSheetsExist 失敗:', e);
  }
}

async function initSheetHeaders() {
  const ranges = [
    {
      range: `${SHEET.INCOME_CATS}!A1:B1`,
      values: [['品種名稱', '備用']]
    },
    {
      range: `${SHEET.EXPENSE_CATS}!A1:D1`,
      values: [['主類別', '次類別', '類型', '預設金額']]
    },
    {
      range: `${SHEET.WORKERS}!A1:C1`,
      values: [['姓名', '預設時薪', '預設日薪']]
    },
    {
      range: `${SHEET.UNITS}!A1:A1`,
      values: [['單位名稱']]
    },
    {
      range: `${SHEET.INCOME}!A1:N1`,
      values: [['編號', '日期', '主類別', '其他備註', '等級資料(JSON)', '總重(斤)', '箱數', '總價', '盤商價', '運費', '附註', '價格已確認', '建立時間', '最後更新']]
    },
    {
      range: `${SHEET.EXPENSE}!A1:O1`,
      values: [['編號', '日期', '主類別', '次類別', '工人姓名', '計薪方式', '數量', '單位', '單價', '總額', '含午餐', '已支付', '附註', '建立時間', '最後更新']]
    },
    {
      range: `${SHEET.USERS}!A1:D1`,
      values: [['別稱', 'Email', '角色', '更新時間']]
    },
  ];
  for (const r of ranges) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: r.range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: r.values }
    });
  }
}

// ============================================================
// 6. 資料讀取
// ============================================================
async function fetchAllData() {
  try {
    await Promise.all([
      fetchUsers(),
      fetchSettings(),
      fetchIncome(),
      fetchExpense(),
    ]);
  } catch (e) {
    console.error(e);
    showToast('讀取資料失敗', 'error');
  }
}

async function fetchUsers() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.USERS}!A2:D`,
    });
    usersData = (res.result.values || []).map(r => ({
      nickname: r[0] || '',
      email: r[1] || '', 
      role: r[2] || 'user', 
    }));
  } catch (e) { usersData = []; }
}

async function fetchSettings() {
  try {
    const [resInc, resExp, resWork, resUnit] = await Promise.all([
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.INCOME_CATS}!A2:B` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.EXPENSE_CATS}!A2:D` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.WORKERS}!A2:C` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.UNITS}!A2:A` }),
    ]);

    settings = { incomeMainCats: [], expenseMainCats: [], workers: [], units: [] };

    // 品種
    (resInc.result.values || []).forEach(r => {
      if (r[0]) settings.incomeMainCats.push({ 名稱: r[0] });
    });
    // 支出類別
    (resExp.result.values || []).forEach(r => {
      const main = r[0], sub = r[1], rawType = r[2] || 'material', amt = r[3] || '';
      // 支援中文類型標籤連動
      let type = rawType;
      if (rawType === '勞工') type = 'worker';
      if (rawType === '成本') type = 'material';
      if (rawType === '開銷') type = 'meal';
      
      let cat = settings.expenseMainCats.find(c => c.名稱 === main);
      if (!cat) {
        cat = { 名稱: main, 類型: type, 次類別: [] };
        settings.expenseMainCats.push(cat);
      }
      if (sub) cat.次類別.push({ 名稱: sub, 預設金額: amt });
    });
    // 工人
    (resWork.result.values || []).forEach(r => {
      if (r[0]) settings.workers.push({ 姓名: r[0], 預設時薪: r[1] || '190', 預設日薪: r[2] || '1500' });
    });
    // 單位
    (resUnit.result.values || []).forEach(r => {
      if (r[0]) settings.units.push(r[0]);
    });

    // 預設值備援
    if (settings.incomeMainCats.length === 0) settings.incomeMainCats = DEFAULT_INCOME_CATS.map(n => ({ 名稱: n }));
    if (settings.expenseMainCats.length === 0) settings.expenseMainCats = DEFAULT_EXPENSE_CATS.map(c => ({ ...c }));
    if (settings.units.length === 0) settings.units = ['包', '罐', '箱', '件', '斤', '天', '小時'];
    
  } catch (e) {
    console.error('fetchSettings 失敗:', e);
    settings = {
      incomeMainCats: DEFAULT_INCOME_CATS.map(n => ({ 名稱: n })),
      expenseMainCats: DEFAULT_EXPENSE_CATS.map(c => ({ ...c })),
      workers: [],
      units: ['包', '罐', '箱', '件', '斤', '天', '小時'],
    };
  }
}

async function fetchIncome() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.INCOME}!A2:N`,
    });
    incomeData = (res.result.values || []).map(r => ({
      id: r[0] || '',
      日期: r[1] || '',
      主類別: r[2] || '',
      其他備註: r[3] || '',
      等級資料: safeParseJSON(r[4], []),
      總重: r[5] || '',
      箱數: r[6] || '',
      總價: r[7] || '',
      盤商價: r[8] || '',
      運費: r[9] || '',
      附註: r[10] || '',
      價格確認: r[11] === 'TRUE' || r[11] === true,
      建立時間: r[12] || '',
    }));
  } catch (e) { incomeData = []; }
}

async function fetchExpense() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.EXPENSE}!A2:O`,
    });
    expenseData = (res.result.values || []).map(r => ({
      id: r[0] || '',
      日期: r[1] || '',
      主類別: r[2] || '',
      次類別: r[3] || '',
      工人姓名: r[4] || '',
      計薪方式: r[5] || '',
      數量: r[6] || '',
      單位: r[7] || '',
      單價: r[8] || '',
      總額: r[9] || '',
      含午餐: r[10] === 'TRUE' || r[10] === true,
      已支付: r[11] === 'TRUE' || r[11] === true,
      附註: r[12] || '',
      建立時間: r[13] || '',
    }));
  } catch (e) { expenseData = []; }
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

// ============================================================
// 7. Tab 切換
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-page').forEach(p => {
    const match = p.id === `page-${tab}`;
    p.classList.toggle('active', match);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ============================================================
// 8. 渲染全部
// ============================================================
function renderAll() {
  renderIncomeChart();
  renderIncomeTable();
  renderIncomeFilterChips();

  renderExpenseChart();
  renderExpenseTable();
  renderExpenseFilterChips();

  if (isAdmin) {
    renderAdminPage();
    // 如果已有資料，隱藏初始化區塊
    const hasData = settings.incomeMainCats.length > DEFAULT_INCOME_CATS.length || 
                    settings.workers.length > 0 ||
                    settings.expenseMainCats.some(c => !DEFAULT_EXPENSE_CATS.map(dc => dc.名稱).includes(c.名稱));
    
    // 簡單判斷：如果 settings 工作表已有內容（除了預設那幾個），就隱藏
    const initCard = document.getElementById('systemInitCard');
    if (initCard) {
      // 只要 settings.workers 有人，或者 income/expense 類別被改動過（這邊簡單檢查 workers 即可，因為預設 workers 是空的）
      if (settings.workers.length > 0) {
        initCard.style.display = 'none';
      }
    }
  }
}

// ============================================================
// 9. 收入分頁
// ============================================================

// --- 圖表 ---
function getFilteredByPeriod(data, field, period) {
  if (period === 'all') return data;
  const now = new Date();
  return data.filter(r => {
    const d = new Date(r[field]);
    if (period === 'year') return d.getFullYear() === now.getFullYear();
    if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  });
}


/* Helper: 取得類別圖示 */
function getCategoryIcon(name) {
  const icons = {
    '甜柿': 'nutrition',
    '水蜜桃': 'sound_detection_dog_barking', // 用桃子類比的圖示或通用的
    '橘子': 'lens_blur',
    '工人薪資': 'engineering',
    '勞工': 'engineering',
    '肥料': 'eco',
    '成本': 'inventory_2',
    '農藥': 'pest_control',
    '包裝材料': 'package_2',
    '開銷': 'receipt_long',
    '菜錢': 'local_grocery_store',
    '什支備註': 'more_horiz',
    '其他': 'more_horiz'
  };
  // 模糊匹配圖示
  const match = Object.keys(icons).find(k => name.includes(k));
  return icons[match] || 'nest_multi_room';
}

function renderIncomeChart() {
  const period = filterState.income.period;
  const data = getFilteredByPeriod(incomeData, '日期', period);

  const catMap = {};
  settings.incomeMainCats.forEach(c => catMap[c.名稱] = { total: 0, count: 0, pending: 0 });

  let grandTotal = 0;
  data.forEach(r => {
    const key = r.主類別;
    if (!catMap[key]) catMap[key] = { total: 0, count: 0, pending: 0 };
    const price = parseFloat(r.總價) || 0;
    catMap[key].total += price;
    catMap[key].count++;
    grandTotal += price;
    if (!r.價格確認) catMap[key].pending++;
  });

  // 更新總額摘要
  document.getElementById('incomeTotalSummary').textContent = `總計：$${grandTotal.toLocaleString()}`;

  const bars = Object.entries(catMap).filter(([, v]) => v.count > 0);
  const maxVal = Math.max(...bars.map(([, v]) => v.total), 1);
  const colors = ['bar-green', 'bar-blue', 'bar-purple', 'bar-orange', 'bar-yellow', 'bar-red'];

  const area = document.getElementById('incomeChartArea');
  area.innerHTML = '';

  if (bars.length === 0) {
    area.innerHTML = '<p style="color:var(--text-xs); font-size:0.82rem; padding: 1rem 0;">該時段尚無紀錄</p>';
    return;
  }

  bars.sort((a, b) => b[1].total - a[1].total).forEach(([name, v], i) => {
    const pct = maxVal > 0 ? (v.total / maxVal * 100) : 0;
    const row = document.createElement('div');
    row.className = 'chart-row';
    const icon = getCategoryIcon(name);
    
    row.innerHTML = `
      <div class="chart-label-row">
        <span class="chart-label-name">
          <span class="material-symbols-outlined">${icon}</span>
          ${name}
          <small style="opacity:0.6; font-weight:normal; margin-left:4px">(${v.count} 筆)</small>
        </span>
        <span class="chart-label-val">
          <strong>$${v.total.toLocaleString()}</strong>
          ${v.pending > 0 ? `<span class="unpaid-tag">待核 ${v.pending}</span>` : ''}
        </span>
      </div>
      <div class="chart-bar-bg">
        <div class="chart-bar-fill ${colors[i % colors.length]}" style="width:0%" data-pct="${pct}"></div>
      </div>`;
    area.appendChild(row);
  });

  requestAnimationFrame(() => {
    area.querySelectorAll('.chart-bar-fill').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
  });
}

// 期間切換按鈕 — 收入
document.querySelector('#incomeChartCard').addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('#incomeChartCard .period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterState.income.period = btn.dataset.period;
  renderIncomeChart();
});

// --- 篩選 chips ---
function renderIncomeFilterChips() {
  const container = document.getElementById('incomeMainCatChips');
  container.innerHTML = '';
  settings.incomeMainCats.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `filter-chip${filterState.income.mainCat === c.名稱 ? ' active' : ''}`;
    btn.textContent = c.名稱;
    btn.onclick = () => {
      filterState.income.mainCat = filterState.income.mainCat === c.名稱 ? null : c.名稱;
      renderIncomeFilterChips();
      renderIncomeTable();
    };
    container.appendChild(btn);
  });
}

document.getElementById('incomeClearFilter').onclick = () => {
  filterState.income.mainCat = null;
  renderIncomeFilterChips();
  renderIncomeTable();
};

document.getElementById('incomeSortBtn').onclick = function() {
  filterState.income.sortOrder = filterState.income.sortOrder === 'desc' ? 'asc' : 'desc';
  this.title = filterState.income.sortOrder === 'desc' ? '日期新→舊' : '日期舊→新';
  renderIncomeTable();
};

document.getElementById('incomeCopyBtn').onclick = () => openCopyModal('income');

// --- 表格 ---
function renderIncomeTable() {
  let data = [...incomeData];
  if (filterState.income.mainCat) {
    data = data.filter(r => r.主類別 === filterState.income.mainCat);
  }
  data.sort((a, b) => {
    const diff = new Date(a.日期) - new Date(b.日期);
    return filterState.income.sortOrder === 'desc' ? -diff : diff;
  });

  const tbody = document.getElementById('incomeTableBody');
  tbody.innerHTML = '';
  const empty = document.getElementById('incomeEmpty');

  if (data.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  data.forEach(r => {
    // 等級資料摘要
    const gradeArr = Array.isArray(r.等級資料) ? r.等級資料 : [];
    const gradeText = gradeArr.map(g => `${g.等級} ${g.斤數}斤${g.箱數 ? ' ' + g.箱數 + '箱' : ''}`).join(' / ') || '-';

    const confirmed = r.價格確認;
    const statusHtml = confirmed
      ? `<span class="status-badge confirmed">✓ 確認</span>`
      : `<span class="status-badge pending">待確認</span>`;

    const priceCell = r.總價
      ? `<span class="td-amount income">$${parseFloat(r.總價).toLocaleString()}</span>`
      : `<button class="btn-fill-price" onclick="openFillPriceModal('${r.id}')">+ 填入</button>`;

    const actionHtml = isAdmin
      ? `<div class="table-actions">
          <button class="btn-table-edit" onclick="openIncomeEdit('${r.id}')" title="編輯"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-table-del" onclick="confirmDelete('income','${r.id}')" title="刪除"><span class="material-symbols-outlined">delete</span></button>
        </div>`
      : `<div class="table-actions">
          <button class="btn-table-edit" onclick="openIncomeEdit('${r.id}')" title="編輯"><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-table-del" onclick="confirmDelete('income','${r.id}')" title="刪除"><span class="material-symbols-outlined">delete</span></button>
        </div>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.日期}</td>
      <td><span class="badge-main">${r.主類別}</span>${r.其他備註 ? `<br><small style="color:var(--text-muted)">${r.其他備註}</small>` : ''}</td>
      <td style="font-size:0.78rem">${gradeText}</td>
      <td>${r.總重 ? r.總重 + '斤' : '-'}${r.箱數 ? ' / ' + r.箱數 + '箱' : ''}</td>
      <td>${priceCell}</td>
      <td>${r.盤商價 ? `$${parseFloat(r.盤商價).toLocaleString()}` : '-'}</td>
      <td>${r.運費 ? `$${parseFloat(r.運費).toLocaleString()}` : '-'}</td>
      <td>${statusHtml}</td>
      <td>${actionHtml}</td>`;
    tbody.appendChild(tr);
  });
}

// ============================================================
// 10. 收入表單 Modal
// ============================================================
document.getElementById('openIncomeFormBtn').onclick = () => openIncomeModal();
document.getElementById('closeIncomeModal').onclick = closeIncomeModal;
document.getElementById('cancelIncomeBtn').onclick = closeIncomeModal;

function openIncomeModal(record = null) {
  const isEdit = !!record;
  document.getElementById('incomeModalTitle').textContent = isEdit ? '編輯收入' : '新增收入';
  document.getElementById('incomeRecordId').value = isEdit ? record.id : '';
  document.getElementById('incomeDate').value = isEdit ? record.日期 : today();
  document.getElementById('incomeNotes').value = isEdit ? record.附註 : '';
  document.getElementById('incomeTotalPrice').value = isEdit ? record.總價 : '';
  document.getElementById('incomeDealerPrice').value = isEdit ? record.盤商價 : '';
  document.getElementById('incomeShippingFee').value = isEdit ? record.運費 : '';

  // 填充主類別
  const sel = document.getElementById('incomeMainCat');
  sel.innerHTML = settings.incomeMainCats.map(c => `<option value="${c.名稱}">${c.名稱}</option>`).join('');
  sel.value = isEdit ? record.主類別 : settings.incomeMainCats[0]?.名稱;
  onIncomeMainCatChange();

  if (isEdit && record.其他備註) {
    document.getElementById('incomeOtherNote').value = record.其他備註;
  }

  // 填充等級列
  const container = document.getElementById('gradeRowsContainer');
  container.innerHTML = '';
  const grades = isEdit && Array.isArray(record.等級資料) && record.等級資料.length > 0
    ? record.等級資料
    : [{ 等級: '3A', 斤數: '', 箱數: '' }];
  grades.forEach(g => addGradeRow(g));

  document.getElementById('incomeModal').style.display = 'flex';
}

function openIncomeEdit(id) {
  const r = incomeData.find(x => x.id === id);
  if (r) openIncomeModal(r);
}
window.openIncomeEdit = openIncomeEdit;

// 打開填入價格的 modal（快捷編輯）
window.openFillPriceModal = function(id) {
  const r = incomeData.find(x => x.id === id);
  if (r) openIncomeModal(r);
};

function closeIncomeModal() {
  document.getElementById('incomeModal').style.display = 'none';
  document.getElementById('incomeForm').reset();
  document.getElementById('incomeOtherNoteWrap').style.display = 'none';
  document.getElementById('incomeCustomCatWrap').style.display = 'none';
}

document.getElementById('incomeMainCat').addEventListener('change', onIncomeMainCatChange);
function onIncomeMainCatChange() {
  const val = document.getElementById('incomeMainCat').value;
  const isOther = val === '其他';
  const isAddNew = val === 'ADD_NEW';
  document.getElementById('incomeOtherNoteWrap').style.display = isOther ? 'flex' : 'none';
  document.getElementById('incomeCustomCatWrap').style.display = isAddNew ? 'flex' : 'none';
}

document.getElementById('addGradeRowBtn').onclick = () => addGradeRow();

function addGradeRow(data = null) {
  const container = document.getElementById('gradeRowsContainer');
  const row = document.createElement('div');
  row.className = 'grade-row';
  row.innerHTML = `
    <select class="grade-sel">
      ${GRADE_OPTIONS.map(g => `<option value="${g}" ${data?.等級 === g ? 'selected' : ''}>${g}</option>`).join('')}
    </select>
    <input type="number" class="grade-jin" placeholder="斤數" min="0" step="0.1" value="${data?.斤數 || ''}">
    <input type="number" class="grade-box" placeholder="箱數" min="0" step="1" value="${data?.箱數 || ''}">
    <button type="button" class="btn-icon-sm" onclick="this.parentElement.remove()" title="移除">
      <span class="material-symbols-outlined">close</span>
    </button>`;
  container.appendChild(row);
}

document.getElementById('incomeForm').onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById('incomeRecordId').value;
  const isEdit = !!id;

  // 收集等級資料
  const gradeRows = document.querySelectorAll('#gradeRowsContainer .grade-row');
  const gradeData = [];
  let totalWeight = 0;
  let totalBoxes = 0;
  gradeRows.forEach(row => {
    const grade = row.querySelector('.grade-sel').value;
    const jin = parseFloat(row.querySelector('.grade-jin').value) || 0;
    const box = parseInt(row.querySelector('.grade-box').value) || 0;
    if (jin > 0 || box > 0) {
      gradeData.push({ 等級: grade, 斤數: jin, 箱數: box });
      totalWeight += jin;
      totalBoxes += box;
    }
  });

  let mainCat = document.getElementById('incomeMainCat').value;
  let isNewCat = false;
  if (mainCat === 'ADD_NEW') {
    mainCat = document.getElementById('incomeCustomCat').value.trim();
    if (!mainCat) { showToast('請輸入新品種名稱', 'error'); return; }
    isNewCat = true;
  }

  const rowData = [
    id || generateId(),
    document.getElementById('incomeDate').value,
    mainCat,
    mainCat === '其他' ? document.getElementById('incomeOtherNote').value : '',
    JSON.stringify(gradeData),
    totalWeight || '',
    totalBoxes || '',
    document.getElementById('incomeTotalPrice').value,
    document.getElementById('incomeDealerPrice').value,
    document.getElementById('incomeShippingFee').value,
    document.getElementById('incomeNotes').value,
    document.getElementById('incomeTotalPrice').value ? 'TRUE' : 'FALSE',
    isEdit ? (incomeData.find(r => r.id === id)?.建立時間 || now()) : now(),
    now(),
  ];

  showLoader(isEdit ? '更新中...' : '儲存中...');
  try {
    if (isNewCat) {
      await appendToSheet(SHEET.SETTINGS, ['收入主類別', mainCat, '', '', '']);
      await fetchSettings();
    }
    if (isEdit) {
      const rowIdx = incomeData.findIndex(r => r.id === id) + 2;
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.INCOME}!A${rowIdx}:N${rowIdx}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
    } else {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.INCOME}!A:N`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
    }
    await fetchIncome();
    renderIncomeChart();
    renderIncomeTable();
    closeIncomeModal();
    showToast(isEdit ? '✓ 更新成功' : '✓ 收入已記錄');
  } catch (err) {
    console.error(err);
    showToast('儲存失敗：' + err.message, 'error');
  }
  hideLoader();
};

// ============================================================
// 11. 支出分頁
// ============================================================

// --- 圖表 ---
function renderExpenseChart() {
  const period = filterState.expense.period;
  const data = getFilteredByPeriod(expenseData, '日期', period);

  const area = document.getElementById('expenseChartArea');
  area.innerHTML = '';

  let grandTotal = 0;
  data.forEach(r => grandTotal += calcExpenseTotal(r));
  document.getElementById('expenseTotalSummary').textContent = `總計：$${grandTotal.toLocaleString()}`;

  // 先看有沒有工人薪資
  const workerCat = settings.expenseMainCats.find(c => c.類型 === 'worker');
  const workerCatName = workerCat?.名稱 || '工人薪資';

  // 工人薪資：依人名統計
  const workerExpenses = data.filter(r => r.主類別 === workerCatName);
  const workerMap = {};
  workerExpenses.forEach(r => {
    const name = r.工人姓名 || '未知';
    if (!workerMap[name]) workerMap[name] = { paid: 0, unpaid: 0, count: 0 };
    const amt = calcExpenseTotal(r);
    if (r.已支付) workerMap[name].paid += amt;
    else workerMap[name].unpaid += amt;
    workerMap[name].count++;
  });

  // 其他主類別
  const otherCats = settings.expenseMainCats.filter(c => c.類型 !== 'worker');
  const catMap = {};
  otherCats.forEach(c => catMap[c.名稱] = { total: 0, count: 0 });
  data.filter(r => r.主類別 !== workerCatName).forEach(r => {
    if (!catMap[r.主類別]) catMap[r.主類別] = { total: 0, count: 0 };
    catMap[r.主類別].total += calcExpenseTotal(r);
    catMap[r.主類別].count++;
  });

  // 工人薪資區塊
  if (Object.keys(workerMap).length > 0) {
    const workerHeader = document.createElement('div');
    workerHeader.style.cssText = 'font-size:0.75rem; font-weight:700; color:var(--text-muted); margin: 0 0 4px 4px;';
    workerHeader.innerHTML = `<span class="material-symbols-outlined" style="font-size:1rem; vertical-align:middle">engineering</span> ${workerCatName} (點選姓名看明細)`;
    area.appendChild(workerHeader);

    const maxWorker = Math.max(...Object.values(workerMap).map(v => v.paid + v.unpaid), 1);
    Object.entries(workerMap).sort((a,b) => (b[1].paid+b[1].unpaid) - (a[1].paid+a[1].unpaid)).forEach(([name, v], i) => {
      const total = v.paid + v.unpaid;
      const pct = (total / maxWorker * 100);
      const row = document.createElement('div');
      row.className = 'chart-row';
      row.innerHTML = `
        <div class="chart-label-row">
          <span class="chart-label-name" onclick="showWorkerDetail('${name}')">
            <span class="material-symbols-outlined">person</span> ${name}
            <small style="opacity:0.6; font-weight:normal; margin-left:4px">(${v.count} 筆)</small>
          </span>
          <span class="chart-label-val">
            <strong>$${total.toLocaleString()}</strong>
            ${v.unpaid > 0 ? `<span class="unpaid-tag">欠 $${v.unpaid.toLocaleString()}</span>` : ''}
            ${v.paid > 0 ? `<span class="paid-tag">已付</span>` : ''}
          </span>
        </div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill bar-yellow" style="width:0%" data-pct="${pct}"></div>
        </div>`;
      area.appendChild(row);
    });
  }

  // 其他類別
  const otherEntries = Object.entries(catMap).filter(([, v]) => v.count > 0);
  if (otherEntries.length > 0) {
    if (area.children.length > 0) {
      const divider = document.createElement('div');
      divider.style.height = '1px';
      divider.style.background = 'var(--border)';
      divider.style.margin = '4px 0';
      area.appendChild(divider);
    }
    
    const otherHeader = document.createElement('div');
    otherHeader.style.cssText = 'font-size:0.75rem; font-weight:700; color:var(--text-muted); margin: 4px 0 4px 4px;';
    otherHeader.innerHTML = `<span class="material-symbols-outlined" style="font-size:1rem; vertical-align:middle">category</span> 經營支出`;
    area.appendChild(otherHeader);

    const maxOther = Math.max(...otherEntries.map(([, v]) => v.total), 1);
    otherEntries.sort((a, b) => b[1].total - a[1].total).forEach(([name, v], i) => {
      const pct = (v.total / maxOther * 100);
      const row = document.createElement('div');
      row.className = 'chart-row';
      const icon = getCategoryIcon(name);
      
      row.innerHTML = `
        <div class="chart-label-row">
          <span class="chart-label-name">
            <span class="material-symbols-outlined">${icon}</span> ${name}
            <small style="opacity:0.6; font-weight:normal; margin-left:4px">(${v.count} 筆)</small>
          </span>
          <span class="chart-label-val"><strong>$${v.total.toLocaleString()}</strong></span>
        </div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill bar-orange" style="width:0%" data-pct="${pct}"></div>
        </div>`;
      area.appendChild(row);
    });
  }

  if (area.children.length === 0) {
    area.innerHTML = '<p style="color:var(--text-xs); font-size:0.82rem; padding: 1rem 0;">該時段尚無紀錄</p>';
  }

  requestAnimationFrame(() => {
    area.querySelectorAll('.chart-bar-fill').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
  });
}

// 期間切換 — 支出
document.querySelector('#expenseChartCard').addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('#expenseChartCard .period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterState.expense.period = btn.dataset.period;
  renderExpenseChart();
});

function calcExpenseTotal(r) {
  let total = (parseFloat(r.數量) || 0) * (parseFloat(r.單價) || 0);
  if (r.含午餐) total += 100;
  if (r.總額 && parseFloat(r.總額)) return parseFloat(r.總額);
  return total;
}

// 工人明細面板
window.showWorkerDetail = function(name) {
  const panel = document.getElementById('workerDetailPanel');
  document.getElementById('workerDetailName').textContent = `🧑‍🌾 ${name} 的薪資明細`;
  panel.style.display = 'block';

  const records = expenseData.filter(r => r.工人姓名 === name);
  const content = document.getElementById('workerDetailContent');

  if (records.length === 0) {
    content.innerHTML = '<p style="padding:1rem;color:var(--text-muted)">暫無紀錄</p>';
    return;
  }

  const sorted = [...records].sort((a, b) => new Date(b.日期) - new Date(a.日期));
  let html = `<div class="table-wrap" style="margin:0;border:none;border-radius:0;box-shadow:none">
    <table class="records-table">
      <thead><tr><th>日期</th><th>工作項目</th><th>計薪</th><th>金額</th><th>午餐</th><th>已付</th></tr></thead>
      <tbody>`;
  sorted.forEach(r => {
    const amt = calcExpenseTotal(r);
    const wageInfo = r.計薪方式 === 'hourly'
      ? `${r.數量}h × $${r.單價}`
      : `${r.數量}天 × $${r.單價}`;
    html += `<tr>
      <td>${r.日期}</td>
      <td>${r.次類別 || '-'}</td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${wageInfo}</td>
      <td class="td-amount expense">$${amt.toLocaleString()}</td>
      <td>${r.含午餐 ? '✓' : ''}</td>
      <td>
        <button class="btn-toggle-paid" onclick="togglePaid('${r.id}')" title="${r.已支付 ? '點選標記未付' : '點選標記已付'}">
          <span class="status-badge ${r.已支付 ? 'paid' : 'unpaid'}">${r.已支付 ? '✓ 已付' : '未付'}</span>
        </button>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  const totalPaid = sorted.filter(r => r.已支付).reduce((s, r) => s + calcExpenseTotal(r), 0);
  const totalUnpaid = sorted.filter(r => !r.已支付).reduce((s, r) => s + calcExpenseTotal(r), 0);
  html += `<div style="padding:0.75rem 1rem;font-size:0.85rem;display:flex;gap:1rem;background:#f8fafc;border-top:1px solid var(--border)">
    <span>已付：<strong style="color:var(--green-dark)">$${totalPaid.toLocaleString()}</strong></span>
    <span>未付：<strong style="color:var(--yellow)">$${totalUnpaid.toLocaleString()}</strong></span>
  </div>`;

  content.innerHTML = html;
};

document.getElementById('closeWorkerDetail').onclick = () => {
  document.getElementById('workerDetailPanel').style.display = 'none';
};

// 切換已付狀態
window.togglePaid = async function(id) {
  const r = expenseData.find(x => x.id === id);
  if (!r) return;
  const newVal = !r.已支付;
  const rowIdx = expenseData.findIndex(x => x.id === id) + 2;
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.EXPENSE}!K${rowIdx}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newVal ? 'TRUE' : 'FALSE']] }
    });
    r.已支付 = newVal;
    renderExpenseChart();
    renderExpenseTable();
    // 重新渲染工人明細
    if (r.工人姓名) showWorkerDetail(r.工人姓名);
    showToast(newVal ? '✓ 已標記為已支付' : '已標記為未支付');
  } catch (e) {
    showToast('更新失敗', 'error');
  }
};

// --- 篩選 chips ---
function renderExpenseFilterChips() {
  const container = document.getElementById('expenseMainCatChips');
  container.innerHTML = '';
  settings.expenseMainCats.forEach(c => {
    const btn = document.createElement('button');
    btn.className = `filter-chip${filterState.expense.mainCat === c.名稱 ? ' active' : ''}`;
    btn.textContent = c.名稱;
    btn.onclick = () => {
      filterState.expense.mainCat = filterState.expense.mainCat === c.名稱 ? null : c.名稱;
      filterState.expense.subCat = null;
      renderExpenseFilterChips();
      renderExpenseSubCatChips();
      renderExpenseTable();
    };
    container.appendChild(btn);
  });
  renderExpenseSubCatChips();
}

function renderExpenseSubCatChips() {
  const container = document.getElementById('expenseSubCatChips');
  container.innerHTML = '';
  if (!filterState.expense.mainCat) {
    container.style.display = 'none';
    return;
  }
  const cat = settings.expenseMainCats.find(c => c.名稱 === filterState.expense.mainCat);
  if (!cat || cat.次類別.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  cat.次類別.forEach(sub => {
    const btn = document.createElement('button');
    btn.className = `filter-chip${filterState.expense.subCat === sub.名稱 ? ' active' : ''}`;
    btn.textContent = sub.名稱;
    btn.onclick = () => {
      filterState.expense.subCat = filterState.expense.subCat === sub.名稱 ? null : sub.名稱;
      renderExpenseSubCatChips();
      renderExpenseTable();
    };
    container.appendChild(btn);
  });
}

document.getElementById('expenseClearFilter').onclick = () => {
  filterState.expense.mainCat = null;
  filterState.expense.subCat = null;
  renderExpenseFilterChips();
  renderExpenseTable();
};

document.getElementById('expenseSortBtn').onclick = function() {
  filterState.expense.sortOrder = filterState.expense.sortOrder === 'desc' ? 'asc' : 'desc';
  renderExpenseTable();
};

document.getElementById('expenseCopyBtn').onclick = () => openCopyModal('expense');

// --- 表格 ---
function renderExpenseTable() {
  let data = [...expenseData];
  if (filterState.expense.mainCat) {
    data = data.filter(r => r.主類別 === filterState.expense.mainCat);
  }
  if (filterState.expense.subCat) {
    data = data.filter(r => {
      const subs = (r.次類別 || '').split(',').map(s => s.trim());
      return subs.includes(filterState.expense.subCat);
    });
  }
  data.sort((a, b) => {
    const diff = new Date(a.日期) - new Date(b.日期);
    return filterState.expense.sortOrder === 'desc' ? -diff : diff;
  });

  const tbody = document.getElementById('expenseTableBody');
  tbody.innerHTML = '';
  const empty = document.getElementById('expenseEmpty');

  if (data.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

    data.forEach(r => {
      const total = calcExpenseTotal(r);
      const paidHtml = `
        <button class="btn-toggle-paid" onclick="togglePaid('${r.id}')" title="${r.已支付 ? '已付' : '未付'}">
          <span class="status-badge ${r.已支付 ? 'paid' : 'unpaid'}">${r.已支付 ? '✓ 已付' : '未付'}</span>
        </button>`;

      const actionHtml = `<div class="table-actions">
        <button class="btn-table-edit" onclick="openExpenseEdit('${r.id}')" title="編輯"><span class="material-symbols-outlined">edit</span></button>
        <button class="btn-table-del" onclick="confirmDelete('expense','${r.id}')" title="刪除"><span class="material-symbols-outlined">delete</span></button>
      </div>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.日期}</td>
        <td><span class="badge-main">${r.主類別}</span></td>
        <td style="font-size:0.78rem"><span class="badge-sub">${r.次類別 || '-'}</span></td>
        <td>${r.工人姓名 ? `<span class="badge-worker">${r.工人姓名}</span>` : '-'}</td>
        <td>${r.數量 ? r.數量 + '<small style="color:var(--text-muted);margin-left:2px">' + (r.單位 || (r.計薪方式 === 'hourly' ? 'h' : r.計薪方式 === 'daily' ? '天' : '')) + '</small>' : '-'}</td>
        <td>$${parseFloat(r.單價 || 0).toLocaleString()}</td>
        <td class="td-amount expense">$${total.toLocaleString()}</td>
        <td>${paidHtml}</td>
        <td style="font-size:0.78rem;color:var(--text-muted)">${r.附註 || '-'}</td>
        <td>${actionHtml}</td>`;
      tbody.appendChild(tr);
    });
}

// ============================================================
// 12. 支出表單 Modal
// ============================================================
document.getElementById('openExpenseFormBtn').onclick = () => openExpenseModal();
document.getElementById('closeExpenseModal').onclick = closeExpenseModal;
document.getElementById('cancelExpenseBtn').onclick = closeExpenseModal;

function openExpenseModal(record = null) {
  const isEdit = !!record;
  document.getElementById('expenseModalTitle').textContent = isEdit ? '編輯支出' : '新增支出';
  document.getElementById('expenseRecordId').value = isEdit ? record.id : '';
  document.getElementById('expenseDate').value = isEdit ? record.日期 : today();
  document.getElementById('expenseNotes').value = isEdit ? record.附註 : '';
  document.getElementById('expenseIsPaid').checked = isEdit ? record.已支付 : false;
  document.getElementById('includeLunch').checked = isEdit ? record.含午餐 : false;
  document.getElementById('expenseUnit').value = isEdit ? (record.單位 || '') : '';
  
  // 更新單位下拉選單
  const unitList = document.getElementById('unitOptions');
  if (unitList) {
    unitList.innerHTML = settings.units.map(u => `<option value="${u}">`).join('');
  }

  // 主類別選單
  const mainSel = document.getElementById('expenseMainCat');
  mainSel.innerHTML = settings.expenseMainCats.map(c => `<option value="${c.名稱}">${c.名稱}</option>`).join('');
  mainSel.value = isEdit ? record.主類別 : settings.expenseMainCats[0]?.名稱;

  onExpenseMainCatChange(record);

  document.getElementById('expenseModal').style.display = 'flex';
}

function openExpenseEdit(id) {
  const r = expenseData.find(x => x.id === id);
  if (r) openExpenseModal(r);
}
window.openExpenseEdit = openExpenseEdit;

function closeExpenseModal() {
  document.getElementById('expenseModal').style.display = 'none';
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseCustomWorkerWrap').style.display = 'none';
  document.getElementById('expenseCustomSubCatWrap').style.display = 'none';
}

document.getElementById('expenseMainCat').addEventListener('change', () => onExpenseMainCatChange());

// 動態計算總額
['expenseQty', 'expenseUnitPrice', 'expenseTotalPrice'].forEach(id => {
  document.getElementById(id).addEventListener('input', (e) => updateExpenseTotal(e.target.id));
});
document.getElementById('includeLunch').addEventListener('change', () => updateExpenseTotal('includeLunch'));

function updateExpenseTotal(sourceId) {
  const qty = parseFloat(document.getElementById('expenseQty').value) || 0;
  const unitPriceInput = document.getElementById('expenseUnitPrice');
  const totalPriceInput = document.getElementById('expenseTotalPrice');
  const lunch = document.getElementById('includeLunch').checked ? 100 : 0;

  if (sourceId === 'expenseTotalPrice') {
    const total = parseFloat(totalPriceInput.value) || 0;
    if (qty > 0) {
      unitPriceInput.value = Math.round((total - lunch) / qty);
    }
  } else {
    // 預設由數量/單價算總額
    const unitPrice = parseFloat(unitPriceInput.value) || 0;
    const total = Math.round(qty * unitPrice + lunch);
    totalPriceInput.value = total;
  }
}

function onExpenseMainCatChange(editRecord = null) {
  const mainVal = document.getElementById('expenseMainCat').value;
  const cat = settings.expenseMainCats.find(c => c.名稱 === mainVal);
  const catType = cat?.類型 || 'material';
  const isWorker = catType === 'worker';

  // 顯示/隱藏工人專用欄位
  document.getElementById('workerNameWrap').style.display = isWorker ? 'flex' : 'none';
  document.getElementById('wageTypeWrap').style.display = isWorker ? 'block' : 'none';
  document.getElementById('workerSubCatWrap').style.display = isWorker ? 'block' : 'none';
  document.getElementById('generalSubCatWrap').style.display = isWorker ? 'none' : 'flex';
  document.getElementById('lunchAllowanceWrap').style.display = isWorker ? 'flex' : 'none';
  document.getElementById('expenseUnitWrap').style.display = isWorker ? 'none' : 'flex';
  document.getElementById('expenseBulkInputWrap').style.display = 'none'; // 切換類別時先隱藏批次輸入
  document.getElementById('quantityPriceRow').style.display = 'grid';
  document.getElementById('priceDetailRow').style.display = 'grid';

  if (isWorker) {
    // 工人下拉
    const wSel = document.getElementById('expenseWorker');
    wSel.innerHTML = '<option value="">-- 請選擇 --</option>' +
                     '<option value="ADD_NEW">+ 新增工人...</option>' +
                     settings.workers.map(w => `<option value="${w.姓名}">${w.姓名}</option>`).join('');
    wSel.value = editRecord ? editRecord.工人姓名 : '';
    onExpenseWorkerChange();

    // 計薪方式
    const wageType = editRecord?.計薪方式 || 'hourly';
    document.querySelector(`input[name="wageType"][value="${wageType}"]`).checked = true;

    // 標籤、預設值
    document.getElementById('expenseQtyLabel').textContent = wageType === 'hourly' ? '時數 *' : '天數 *';
    document.getElementById('expenseUnitLabel').textContent = wageType === 'hourly' ? '時薪 *' : '日薪 *';

    if (editRecord) {
      document.getElementById('expenseQty').value = editRecord.數量;
      document.getElementById('expenseUnitPrice').value = editRecord.單價;
    } else {
      // 預設帶入
      const defaultWorker = settings.workers[0];
      if (wageType === 'hourly') {
        document.getElementById('expenseQty').value = '8';
        document.getElementById('expenseUnitPrice').value = defaultWorker?.預設時薪 || '190';
      } else {
        document.getElementById('expenseQty').value = '1';
        document.getElementById('expenseUnitPrice').value = defaultWorker?.預設日薪 || '1500';
      }
    }

    // 工作項目 chips
    const chipsContainer = document.getElementById('workerSubCatChips');
    chipsContainer.innerHTML = '';
    const selectedSubs = editRecord ? (editRecord.次類別 || '').split(',').map(s => s.trim()) : [];
    (cat?.次類別 || []).forEach(sub => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip${selectedSubs.includes(sub.名稱) ? ' active' : ''}`;
      chip.textContent = sub.名稱;
      chip.onclick = () => chip.classList.toggle('active');
      chipsContainer.appendChild(chip);
    });
  } else {
    // 一般類別：次類別下拉
    const subSel = document.getElementById('expenseSubCat');
    subSel.innerHTML = '<option value="">-- 請選擇（可選）--</option>' +
      '<option value="ADD_NEW">+ 新增此類別項目...</option>' +
      '<option value="ADD_NEW_BULK">+ 手動批次輸入多項...</option>' +
      (cat?.次類別 || []).map(s => `<option value="${s.名稱}" ${editRecord?.次類別 === s.名稱 ? 'selected' : ''}>${s.名稱}${s.預設金額 ? ` - $${s.預設金額}` : ''}</option>`).join('');

    // 標籤
    document.getElementById('expenseQtyLabel').textContent = '數量 *';
    document.getElementById('expenseUnitLabel').textContent = '單價 *';

    if (editRecord) {
      document.getElementById('expenseQty').value = editRecord.數量;
      document.getElementById('expenseUnitPrice').value = editRecord.單價;
    } else {
      // 帶入預設金額
      document.getElementById('expenseQty').value = '1';
      document.getElementById('expenseUnitPrice').value = '';
      subSel.addEventListener('change', () => {
        const selected = cat?.次類別.find(s => s.名稱 === subSel.value);
        if (selected?.預設金額) {
          document.getElementById('expenseUnitPrice').value = selected.預設金額;
          updateExpenseTotal();
        }
      }, { once: true });
    }
  }

  updateExpenseTotal();
}

function onExpenseWorkerChange() {
  const val = document.getElementById('expenseWorker').value;
  document.getElementById('expenseCustomWorkerWrap').style.display = (val === 'ADD_NEW') ? 'flex' : 'none';
}
document.getElementById('expenseWorker').addEventListener('change', onExpenseWorkerChange);
document.getElementById('expenseSubCat').addEventListener('change', onExpenseSubCatChange);

function onExpenseSubCatChange() {
  const sel = document.getElementById('expenseSubCat');
  const val = sel.value;
  const isBulk = val === 'ADD_NEW_BULK';
  const isNew = val === 'ADD_NEW';
  
  document.getElementById('expenseBulkInputWrap').style.display = isBulk ? 'block' : 'none';
  document.getElementById('expenseCustomSubCatWrap').style.display = isNew ? 'flex' : 'none';
  
  // 批次輸入時隱藏數量/單價列，單筆新增時則保留
  const hideDetails = isBulk;
  document.getElementById('quantityPriceRow').style.display = hideDetails ? 'none' : 'grid';
  document.getElementById('priceDetailRow').style.display = hideDetails ? 'none' : 'grid';
  
  if (isBulk) {
    document.getElementById('expenseQty').required = false;
    document.getElementById('expenseUnitPrice').required = false;
    document.getElementById('expenseTotalPrice').required = false;
  } else {
    document.getElementById('expenseQty').required = true;
    document.getElementById('expenseUnitPrice').required = true;
    document.getElementById('expenseTotalPrice').required = true;
  }
}

// 計薪方式切換
document.querySelectorAll('input[name="wageType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mainVal = document.getElementById('expenseMainCat').value;
    const cat = settings.expenseMainCats.find(c => c.名稱 === mainVal);
    const wageType = document.querySelector('input[name="wageType"]:checked').value;
    document.getElementById('expenseQtyLabel').textContent = wageType === 'hourly' ? '時數 *' : '天數 *';
    document.getElementById('expenseUnitLabel').textContent = wageType === 'hourly' ? '時薪 *' : '日薪 *';

    // 工人預設值
    const workerSel = document.getElementById('expenseWorker');
    const workerName = workerSel.value;
    const worker = settings.workers.find(w => w.姓名 === workerName);

    if (wageType === 'hourly') {
      document.getElementById('expenseQty').value = '8';
      document.getElementById('expenseUnitPrice').value = worker?.預設時薪 || '190';
    } else {
      document.getElementById('expenseQty').value = '1';
      document.getElementById('expenseUnitPrice').value = worker?.預設日薪 || '1500';
    }
    updateExpenseTotal();
  });
});

// 工人選擇時更新預設薪資
document.getElementById('expenseWorker').addEventListener('change', () => {
  const workerName = document.getElementById('expenseWorker').value;
  if (workerName === 'ADD_NEW') return;
  const worker = settings.workers.find(w => w.姓名 === workerName);
  if (!worker) return;
  const wageType = document.querySelector('input[name="wageType"]:checked').value;
  if (wageType === 'hourly') {
    document.getElementById('expenseUnitPrice').value = worker.預設時薪 || '190';
  } else {
    document.getElementById('expenseUnitPrice').value = worker.預設日薪 || '1500';
  }
  updateExpenseTotal();
});

document.getElementById('expenseForm').onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById('expenseRecordId').value;
  const date = document.getElementById('expenseDate').value;
  const isEdit = !!id;
  const mainVal = document.getElementById('expenseMainCat').value;
  const cat = settings.expenseMainCats.find(c => c.名稱 === mainVal);
  const isWorker = cat?.類型 === 'worker';
  const subCatVal = document.getElementById('expenseSubCat').value;
  const isBulk = !isWorker && subCatVal === 'ADD_NEW_BULK';

  let recordsToSave = [];

  if (isBulk) {
    const bulkText = document.getElementById('expenseBulkInput').value;
    recordsToSave = parseBulkInput(bulkText).map(item => ({
      ...item,
      日期: date,
      主類別: mainVal,
      計薪方式: '',
      含午餐: false,
      已支付: document.getElementById('expenseIsPaid').checked,
      附註: document.getElementById('expenseNotes').value,
    }));
    if (recordsToSave.length === 0) {
      showToast('請輸入有效的批次內容', 'error');
      return;
    }
  } else {
    // 單筆模式
    let subCat = '';
    let workerName = '';
    let isNewWorker = false;
    let isNewSubCat = false;
    let isNewUnit = false;

    if (isWorker) {
      const activeChips = document.querySelectorAll('#workerSubCatChips .chip.active');
      subCat = Array.from(activeChips).map(c => c.textContent).join(', ');
      workerName = document.getElementById('expenseWorker').value;
      if (workerName === 'ADD_NEW') {
        workerName = document.getElementById('expenseCustomWorker').value.trim();
        if (!workerName) { showToast('請輸入姓名', 'error'); return; }
        isNewWorker = true;
      }
    } else {
      subCat = subCatVal;
      if (subCat === 'ADD_NEW') {
        subCat = document.getElementById('expenseCustomSubCat').value.trim();
        if (!subCat) { showToast('請輸入次類別項目名稱', 'error'); return; }
        isNewSubCat = true;
      }
    }

    const unit = document.getElementById('expenseUnit').value.trim();
    if (unit && !settings.units.includes(unit)) isNewUnit = true;

    const wageType = isWorker ? document.querySelector('input[name="wageType"]:checked').value : '';
    const qty = document.getElementById('expenseQty').value;
    const unitPrice = document.getElementById('expenseUnitPrice').value;
    const total = document.getElementById('expenseTotalPrice').value;
    const lunch = isWorker && document.getElementById('includeLunch').checked;

    recordsToSave.push({
      id: id || generateId(),
      日期: date,
      主類別: mainVal,
      次類別: subCat,
      工人姓名: workerName,
      計薪方式: wageType,
      數量: qty,
      單位: unit,
      單價: unitPrice,
      總額: total,
      含午餐: lunch,
      已支付: document.getElementById('expenseIsPaid').checked,
      附註: document.getElementById('expenseNotes').value,
      isNewWorker,
      isNewSubCat,
      isNewUnit
    });
  }

  showLoader(isEdit ? '更新中...' : '儲存中...');
  try {
    for (const r of recordsToSave) {
      // 處理新項目 (Settings)
      if (r.isNewWorker) {
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID, range: `${SHEET.WORKERS}!A:C`,
          valueInputOption: 'USER_ENTERED', resource: { values: [[r.工人姓名, '190', '1500']] }
        });
      }
      if (r.isNewSubCat) {
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID, range: `${SHEET.EXPENSE_CATS}!A:D`,
          valueInputOption: 'USER_ENTERED', resource: { values: [[r.主類別, r.次類別, 'material', '']] }
        });
      }
      if (r.isNewUnit) {
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID, range: `${SHEET.UNITS}!A:A`,
          valueInputOption: 'USER_ENTERED', resource: { values: [[r.單位]] }
        });
      }
      // 如果有新增 Settings 則重新讀取
      if (r.isNewWorker || r.isNewSubCat || r.isNewUnit) await fetchSettings();

      const rowData = [
        r.id || generateId(), r.日期, r.主類別, r.次類別, r.工人姓名, r.計薪方式,
        r.數量, r.單位, r.單價, r.總額, r.含午餐 ? 'TRUE' : 'FALSE',
        r.已支付 ? 'TRUE' : 'FALSE', r.附註,
        isEdit ? (expenseData.find(x => x.id === id)?.建立時間 || now()) : now(),
        now()
      ];

      if (isEdit) {
        const rowIdx = expenseData.findIndex(x => x.id === id) + 2;
        await gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID, range: `${SHEET.EXPENSE}!A${rowIdx}:O${rowIdx}`,
          valueInputOption: 'USER_ENTERED', resource: { values: [rowData] }
        });
      } else {
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID, range: `${SHEET.EXPENSE}!A:O`,
          valueInputOption: 'USER_ENTERED', resource: { values: [rowData] }
        });
      }
    }

    await fetchExpense();
    renderExpenseChart();
    renderExpenseTable();
    closeExpenseModal();
    showToast(isEdit ? '✓ 更新成功' : `✓ 已記錄 ${recordsToSave.length} 筆項目`);
  } catch (err) {
    console.error(err);
    showToast('儲存失敗：系統發生錯誤，請重試', 'error');
  }
  hideLoader();
};

/**
 * 解析批次輸入
 * 格式：項目 數量 單位 $單價 / =總額
 */
function parseBulkInput(text) {
  if (!text) return [];
  // 先依「、」或換行分割
  const lines = text.split(/[、\n]/).map(l => l.trim()).filter(l => l);
  const result = [];
  
  lines.forEach(line => {
    // 正則：(項目) (數量) (單位) (價格標誌) (數字)
    // 範例：農藥A 1包 $500
    // 範例：農藥B 2包 =400
    const match = line.match(/^(.+?)\s+([\d.]+)\s*(\S+?)\s+([$=])?\s*(\d+)$/);
    if (match) {
      const name = match[1];
      const qty = parseFloat(match[2]);
      const unit = match[3];
      const type = match[4]; // '$' or '='
      const priceVal = parseFloat(match[5]);
      
      let unitPrice = 0;
      let total = 0;
      
      if (type === '=') {
        total = priceVal;
        unitPrice = Math.round(total / qty);
      } else {
        // 預設為單價 (含 $ 或無標誌)
        unitPrice = priceVal;
        total = Math.round(qty * unitPrice);
      }
      
      result.push({
        id: generateId(),
        次類別: name,
        工人姓名: '',
        數量: qty,
        單位: unit,
        單價: unitPrice,
        總額: total,
      });
    }
  });
  return result;
}

// ============================================================
// 13. 刪除確認
// ============================================================
let _pendingDelete = null;

window.confirmDelete = function(type, id) {
  _pendingDelete = { type, id };
  document.getElementById('confirmMsg').textContent =
    type === 'income' ? '確定要刪除這筆收入紀錄嗎？' : '確定要刪除這筆支出紀錄嗎？';
  document.getElementById('confirmModal').style.display = 'flex';
};

document.getElementById('confirmCancel').onclick = () => {
  _pendingDelete = null;
  document.getElementById('confirmModal').style.display = 'none';
};

document.getElementById('confirmOk').onclick = async () => {
  if (!_pendingDelete) return;
  const { type, id } = _pendingDelete;
  document.getElementById('confirmModal').style.display = 'none';
  await deleteRecord(type, id);
  _pendingDelete = null;
};

async function deleteRecord(type, id) {
  const sheetName = type === 'income' ? SHEET.INCOME : SHEET.EXPENSE;
  const dataArr = type === 'income' ? incomeData : expenseData;
  const rowIdx = dataArr.findIndex(r => r.id === id) + 2;

  showLoader('刪除中...');
  try {
    const ss = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = ss.result.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) throw new Error('找不到工作表');
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIdx - 1,
              endIndex: rowIdx,
            }
          }
        }]
      }
    });
    if (type === 'income') {
      incomeData = incomeData.filter(r => r.id !== id);
      renderIncomeChart();
      renderIncomeTable();
    } else {
      expenseData = expenseData.filter(r => r.id !== id);
      renderExpenseChart();
      renderExpenseTable();
    }
    showToast('✓ 刪除成功');
  } catch (err) {
    showToast('刪除失敗：' + err.message, 'error');
  }
  hideLoader();
}

// ============================================================
// 14. 複製明細 Modal
// ============================================================
let _copyType = 'expense';

document.getElementById('closeCopyModal').onclick = () => document.getElementById('copyModal').style.display = 'none';
document.getElementById('cancelCopyBtn').onclick = () => document.getElementById('copyModal').style.display = 'none';

function openCopyModal(type) {
  _copyType = type;
  document.getElementById('copyDateFrom').value = firstDayOfMonth();
  document.getElementById('copyDateTo').value = today();
  document.getElementById('copyPreview').value = '';
  document.getElementById('copyModal').style.display = 'flex';
  generateCopyText();
}

['copyDateFrom', 'copyDateTo'].forEach(id => {
  document.getElementById(id).addEventListener('change', generateCopyText);
});

function generateCopyText() {
  const from = document.getElementById('copyDateFrom').value;
  const to = document.getElementById('copyDateTo').value;
  if (!from || !to) return;

  const data = _copyType === 'income' ? incomeData : expenseData;
  const filtered = data.filter(r => r.日期 >= from && r.日期 <= to);

  if (filtered.length === 0) {
    document.getElementById('copyPreview').value = '此期間無紀錄。';
    return;
  }

  filtered.sort((a, b) => new Date(a.日期) - new Date(b.日期));

  let text = '';
  if (_copyType === 'income') {
    text = `📊 收入明細 ${from} ~ ${to}\n${'─'.repeat(30)}\n`;
    let total = 0;
    filtered.forEach(r => {
      const gradeText = (r.等級資料 || []).map(g => `${g.等級} ${g.斤數}斤${g.箱數 ? ' ' + g.箱數 + '箱' : ''}`).join(' / ');
      text += `\n📅 ${r.日期}\n`;
      text += `  品種：${r.主類別}${r.其他備註 ? `（${r.其他備註}）` : ''}\n`;
      if (gradeText) text += `  等級：${gradeText}\n`;
      if (r.總價) {
        const p = parseFloat(r.總價);
        text += `  總價：$${p.toLocaleString()}\n`;
        total += p;
      } else {
        text += `  總價：待確認\n`;
      }
      if (r.附註) text += `  備註：${r.附註}\n`;
    });
    text += `\n${'─'.repeat(30)}\n💵 合計：$${total.toLocaleString()}`;
  } else {
    text = `📊 支出明細 ${from} ~ ${to}\n${'─'.repeat(30)}\n`;
    let total = 0;
    filtered.forEach(r => {
      const amt = calcExpenseTotal(r);
      total += amt;
      text += `\n📅 ${r.日期}\n`;
      text += `  類別：${r.主類別}${r.次類別 ? ` › ${r.次類別}` : ''}\n`;
      if (r.工人姓名) text += `  工人：${r.工人姓名}\n`;
      const wageInfo = r.計薪方式 === 'hourly'
        ? `${r.數量}時 × $${r.單價}`
        : r.計薪方式 === 'daily'
        ? `${r.數量}天 × $${r.單價}`
        : `${r.數量} × $${r.單價}`;
      text += `  計算：${wageInfo}${r.含午餐 ? ' + 午餐$100' : ''}\n`;
      text += `  金額：$${amt.toLocaleString()} ${r.已支付 ? '✓已付' : '⚠未付'}\n`;
      if (r.附註) text += `  備註：${r.附註}\n`;
    });
    text += `\n${'─'.repeat(30)}\n💸 合計：$${total.toLocaleString()}`;
  }

  document.getElementById('copyPreview').value = text;
}

document.getElementById('doCopyBtn').onclick = () => {
  const text = document.getElementById('copyPreview').value;
  navigator.clipboard.writeText(text).then(() => {
    showToast('✓ 已複製到剪貼簿');
    document.getElementById('copyModal').style.display = 'none';
  }).catch(() => {
    showToast('複製失敗，請手動選取文字', 'error');
  });
};

// ============================================================
// 15. 管理頁面
// ============================================================
function renderAdminPage() {
  renderUserListAdmin();
  renderIncomeMainCatAdmin();
  renderExpenseMainCatAdmin();
  renderWorkerListAdmin();
}

function renderUserListAdmin() {
  const tbody = document.getElementById('userListBody');
  tbody.innerHTML = '';
  usersData.forEach((u, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.email}</td>
      <td><span class="status-badge ${u.role === 'admin' ? 'paid' : 'pending'}">${u.role === 'admin' ? '管理員' : '使用者'}</span></td>
      <td><div class="table-actions">
        <button class="btn-table-del" onclick="deleteUser(${i})" title="刪除"><span class="material-symbols-outlined">delete</span></button>
      </div></td>`;
    tbody.appendChild(tr);
  });
}

function renderIncomeMainCatAdmin() {
  const tbody = document.getElementById('incomeMainCatBody');
  tbody.innerHTML = '';
  settings.incomeMainCats.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.名稱}</strong></td>
      <td>—</td>
      <td><div class="table-actions">
        <button class="btn-table-del" onclick="deleteIncomeMainCat(${i})" title="刪除"><span class="material-symbols-outlined">delete</span></button>
      </div></td>`;
    tbody.appendChild(tr);
  });
}

function renderExpenseMainCatAdmin() {
  const tbody = document.getElementById('expenseMainCatBody');
  tbody.innerHTML = '';
  settings.expenseMainCats.forEach((c, ci) => {
    const typeLabel = c.類型 === 'worker' ? '工人' : c.類型 === 'meal' ? '伙食' : '材料';
    c.次類別.forEach((sub, si) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${si === 0 ? `<strong>${c.名稱}</strong>` : ''}</td>
        <td>${si === 0 ? `<span class="status-badge pending">${typeLabel}</span>` : ''}</td>
        <td>${sub.名稱}</td>
        <td>${sub.預設金額 ? `$${sub.預設金額}` : '—'}</td>
        <td><div class="table-actions">
          <button class="btn-table-del" onclick="deleteExpenseSubCat(${ci},${si})" title="刪除次類別"><span class="material-symbols-outlined">delete</span></button>
        </div></td>`;
      tbody.appendChild(tr);
    });
    if (c.次類別.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.名稱}</strong></td>
        <td><span class="status-badge pending">${typeLabel}</span></td>
        <td>—</td><td>—</td>
        <td><div class="table-actions">
          <button class="btn-table-del" onclick="deleteExpenseMainCat(${ci})" title="刪除主類別"><span class="material-symbols-outlined">delete</span></button>
        </div></td>`;
      tbody.appendChild(tr);
    }
  });
}

function renderWorkerListAdmin() {
  const tbody = document.getElementById('workerListBody');
  tbody.innerHTML = '';
  settings.workers.forEach((w, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.姓名}</strong></td>
      <td>$${w.預設時薪 || 190}</td>
      <td>$${w.預設日薪 || 1500}</td>
      <td><div class="table-actions">
        <button class="btn-table-del" onclick="deleteWorker(${i})" title="刪除"><span class="material-symbols-outlined">delete</span></button>
      </div></td>`;
    tbody.appendChild(tr);
  });
}

// 管理頁新增按鈕
document.getElementById('addUserBtn').onclick = () => {
  openAdminModal('user', null, [
    { id: 'au_email', label: 'Google Email *', type: 'email' },
    { id: 'au_role', label: '角色 *', type: 'select', options: [{ val: 'user', label: '使用者' }, { val: 'admin', label: '管理員' }] },
  ]);
};

document.getElementById('addWorkerBtn').onclick = () => {
  openAdminModal('worker', null, [
    { id: 'aw_name', label: '姓名 *', type: 'text' },
    { id: 'aw_hourly', label: '預設時薪', type: 'number', placeholder: '190' },
    { id: 'aw_daily', label: '預設日薪', type: 'number', placeholder: '1500' },
  ]);
};

document.getElementById('addIncomeMainCatBtn').onclick = () => {
  openAdminModal('incomeMainCat', null, [
    { id: 'aim_name', label: '類別名稱 *', type: 'text' },
  ]);
};

document.getElementById('addExpenseMainCatBtn').onclick = () => {
  openAdminModal('expenseMainCat', null, [
    { id: 'aem_name', label: '主類別名稱 *', type: 'text' },
    { id: 'aem_type', label: '類型 *', type: 'select', options: [
      { val: 'material', label: '材料/農藥' },
      { val: 'worker', label: '工人薪資' },
      { val: 'meal', label: '伙食' },
    ]},
    { id: 'aem_sub', label: '次類別（每行一個）', type: 'textarea', placeholder: '骨粉\n海鳥糞' },
  ]);
};

function openAdminModal(type, data, fields) {
  document.getElementById('adminEditType').value = type;
  const titleMap = {
    user: '新增使用者',
    worker: '新增工人',
    incomeMainCat: '新增收入類別',
    expenseMainCat: '新增支出類別',
  };
  document.getElementById('adminModalTitle').textContent = titleMap[type] || '新增';
  const container = document.getElementById('adminFormFields');
  container.innerHTML = '';
  fields.forEach(f => {
    const wrap = document.createElement('div');
    wrap.className = 'input-wrap';
    if (f.type === 'select') {
      wrap.innerHTML = `<label>${f.label}</label>
        <select id="${f.id}">${f.options.map(o => `<option value="${o.val}">${o.label}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      wrap.innerHTML = `<label>${f.label}</label>
        <textarea id="${f.id}" rows="4" placeholder="${f.placeholder || ''}" style="resize:vertical"></textarea>`;
    } else {
      wrap.innerHTML = `<label>${f.label}</label>
        <input type="${f.type}" id="${f.id}" placeholder="${f.placeholder || ''}">`;
    }
    container.appendChild(wrap);
  });
  document.getElementById('adminModal').style.display = 'flex';
}

document.getElementById('closeAdminModal').onclick = () => document.getElementById('adminModal').style.display = 'none';
document.getElementById('cancelAdminBtn').onclick = () => document.getElementById('adminModal').style.display = 'none';

document.getElementById('adminForm').onsubmit = async (e) => {
  e.preventDefault();
  const type = document.getElementById('adminEditType').value;
  showLoader('儲存中...');
  try {
    if (type === 'user') {
      const email = document.getElementById('au_email').value.trim();
      const role = document.getElementById('au_role').value;
      if (!email) { showToast('請填寫 Email', 'error'); hideLoader(); return; }
      await appendToSheet(SHEET.USERS, [email, role, now()]);
      usersData.push({ email, role });
      renderUserListAdmin();
    } else if (type === 'worker') {
      const name = document.getElementById('aw_name').value.trim();
      const hourly = document.getElementById('aw_hourly').value || '190';
      const daily = document.getElementById('aw_daily').value || '1500';
      if (!name) { showToast('請填寫姓名', 'error'); hideLoader(); return; }
      await appendToSheet(SHEET.SETTINGS, ['工人', name, '', hourly, daily]);
      settings.workers.push({ 姓名: name, 預設時薪: hourly, 預設日薪: daily });
      renderWorkerListAdmin();
    } else if (type === 'incomeMainCat') {
      const name = document.getElementById('aim_name').value.trim();
      if (!name) { showToast('請填寫名稱', 'error'); hideLoader(); return; }
      await appendToSheet(SHEET.SETTINGS, ['收入主類別', name, '', '', '']);
      settings.incomeMainCats.push({ 名稱: name });
      renderIncomeMainCatAdmin();
      renderIncomeFilterChips();
    } else if (type === 'expenseMainCat') {
      const name = document.getElementById('aem_name').value.trim();
      const catType = document.getElementById('aem_type').value;
      const subText = document.getElementById('aem_sub').value;
      if (!name) { showToast('請填寫名稱', 'error'); hideLoader(); return; }
      await appendToSheet(SHEET.SETTINGS, ['支出主類別', name, '', '', catType]);
      const subs = subText.split('\n').map(s => s.trim()).filter(Boolean);
      const subObjs = [];
      for (const sub of subs) {
        await appendToSheet(SHEET.SETTINGS, ['支出次類別', sub, name, '', '']);
        subObjs.push({ 名稱: sub, 預設金額: '' });
      }
      settings.expenseMainCats.push({ 名稱: name, 類型: catType, 次類別: subObjs });
      renderExpenseMainCatAdmin();
      renderExpenseFilterChips();
    }
    document.getElementById('adminModal').style.display = 'none';
    showToast('✓ 儲存成功');
  } catch (err) {
    showToast('儲存失敗：' + err.message, 'error');
  }
  hideLoader();
};

// 管理頁刪除
window.deleteUser = function(idx) {
  confirmAdminDelete(() => {
    usersData.splice(idx, 1);
    rebuildAndSaveSettings('users');
    renderUserListAdmin();
  });
};
window.deleteWorker = function(idx) {
  confirmAdminDelete(() => {
    settings.workers.splice(idx, 1);
    rebuildAndSaveSettings('settings');
    renderWorkerListAdmin();
  });
};
window.deleteIncomeMainCat = function(idx) {
  confirmAdminDelete(() => {
    settings.incomeMainCats.splice(idx, 1);
    rebuildAndSaveSettings('settings');
    renderIncomeMainCatAdmin();
    renderIncomeFilterChips();
  });
};
window.deleteExpenseMainCat = function(catIdx) {
  confirmAdminDelete(() => {
    settings.expenseMainCats.splice(catIdx, 1);
    rebuildAndSaveSettings('settings');
    renderExpenseMainCatAdmin();
    renderExpenseSubCatChips();
    renderExpenseTable();
  });
};
window.deleteExpenseSubCat = function(catIdx, subIdx) {
  confirmAdminDelete(() => {
    settings.expenseMainCats[catIdx].次類別.splice(subIdx, 1);
    rebuildAndSaveSettings('settings');
    renderExpenseMainCatAdmin();
  });
};

// 系統初始化按鈕
document.getElementById('initSystemBtn').onclick = async () => {
  if (!confirm('將把預設類別與範例工人資料寫入試算表，是否確定？')) return;
  
  showLoader('系統初始化中...');
  try {
    // 1. 清空 settings 
    await clearSheet(SHEET.SETTINGS);
    
    // 2. 寫入收入主類別
    for (const name of DEFAULT_INCOME_CATS) {
      await appendToSheet(SHEET.SETTINGS, ['收入主類別', name, '', '', '']);
    }
    
    // 3. 寫入支出類別
    for (const c of DEFAULT_EXPENSE_CATS) {
      await appendToSheet(SHEET.SETTINGS, ['支出主類別', c.名稱, '', '', c.類型]);
      for (const sub of c.次類別) {
        await appendToSheet(SHEET.SETTINGS, ['支出次類別', sub.名稱, c.名稱, sub.預設金額, '']);
      }
    }
    
    // 4. 寫入範例工人
    const demoWorkers = [
      { 姓名: '阿明', 預設時薪: '190', 預設日薪: '1500' },
      { 姓名: '小華', 預設時薪: '190', 預設日薪: '1500' }
    ];
    for (const w of demoWorkers) {
      await appendToSheet(SHEET.SETTINGS, ['工人', w.姓名, '', w.預設時薪, w.預設日薪]);
    }
    
    showToast('✓ 初始化完成，正在重新載入資料...');
    await fetchSettings();
    renderAll();
    
  } catch (e) {
    console.error(e);
    showToast('初始化失敗', 'error');
  }
  hideLoader();
};

function confirmAdminDelete(cb) {
  if (confirm('確定刪除？')) cb();
}

async function rebuildAndSaveSettings(target) {
  showLoader('更新設定...');
  try {
    if (target === 'users') {
      // 清空並重寫使用者工作表
      await clearSheet(SHEET.USERS);
      for (const u of usersData) {
        await appendToSheet(SHEET.USERS, [u.email, u.role, now()]);
      }
    } else {
      // 清空並重寫設定工作表
      await clearSheet(SHEET.SETTINGS);
      for (const c of settings.incomeMainCats) {
        await appendToSheet(SHEET.SETTINGS, ['收入主類別', c.名稱, '', '', '']);
      }
      for (const c of settings.expenseMainCats) {
        await appendToSheet(SHEET.SETTINGS, ['支出主類別', c.名稱, '', '', c.類型]);
        for (const sub of c.次類別) {
          await appendToSheet(SHEET.SETTINGS, ['支出次類別', sub.名稱, c.名稱, sub.預設金額, '']);
        }
      }
      for (const w of settings.workers) {
        await appendToSheet(SHEET.SETTINGS, ['工人', w.姓名, '', w.預設時薪, w.預設日薪]);
      }
    }
  } catch (e) {
    showToast('設定更新失敗', 'error');
  }
  hideLoader();
}

async function clearSheet(sheetName) {
  await gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:Z`,
  });
}

async function appendToSheet(sheetName, rowArr) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [rowArr] }
  });
}

// ============================================================
// 16. 工具函式
// ============================================================
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}
function today() {
  return new Date().toISOString().split('T')[0];
}
function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function now() {
  return new Date().toISOString();
}

let _loaderCount = 0;
function showLoader(msg = '處理中...') {
  _loaderCount++;
  document.getElementById('loaderMsg').textContent = msg;
  document.getElementById('loader').style.display = 'flex';
}
function hideLoader() {
  _loaderCount = Math.max(0, _loaderCount - 1);
  if (_loaderCount === 0) document.getElementById('loader').style.display = 'none';
}

let _toastTimer;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = type === 'error' ? 'var(--red)' : 'var(--text)';
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// Modal 點外部關閉
['incomeModal', 'expenseModal', 'copyModal', 'confirmModal', 'adminModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });
});

// ============================================================
// 15. 歷史資料匯入 (2025)
// ============================================================
const HISTORICAL_DATA_2025 = {
  "expenses": [
    {"日期":"2024-11-01","主類別":"什支備註","次類別":"龍虎330包","工人姓名":"","數量":"330","單位":"項","單價":"200","總額":"66000","已支付":true},
    {"日期":"2024-11-20","主類別":"肥料","次類別":"上午施甜柿有機肥330包","工人姓名":"","數量":"32","單位":"項","單價":"150","總額":"4800","已支付":true},
    {"日期":"2024-12-06","主類別":"農藥","次類別":"8K噴除草劑27缸","工人姓名":"","數量":"33","單位":"項","單價":"150","總額":"4950","已支付":true},
    {"日期":"2024-12-07","主類別":"農藥","次類別":"8K噴除草劑13缸","工人姓名":"","數量":"10","單位":"項","單價":"150","總額":"1500","已支付":true},
    {"日期":"2025-01-08","主類別":"什支備註","次類別":"矽藻土","工人姓名":"","數量":"2","單位":"項","單價":"1250","總額":"2500","已支付":true},
    {"日期":"2025-01-08","主類別":"什支備註","次類別":"大生粉","工人姓名":"","數量":"1","單位":"項","單價":"4200","總額":"4200","已支付":true},
    {"日期":"2024-12-01","主類別":"肥料","次類別":"肥料車困於陡坡，請怪手脫困費用","工人姓名":"","數量":"1","單位":"項","單價":"4000","總額":"4000","已支付":true},
    {"日期":"2025-02-14","主類別":"工人薪資","次類別":"撿枝","工人姓名":"其他工人","數量":"9","單位":"項","單價":"150","總額":"1350","已支付":true},
    {"日期":"2025-02-15","主類別":"工人薪資","次類別":"撿枝","工人姓名":"其他工人","數量":"6","單位":"項","單價":"150","總額":"900","已支付":true},
    {"日期":"2025-02-20","主類別":"肥料","次類別":"白肥","工人姓名":"","數量":"35","單位":"項","單價":"550","總額":"19250","已支付":true},
    {"日期":"2025-02-22","主類別":"工人薪資","次類別":"撿枝","工人姓名":"其他工人","數量":"8","單位":"項","單價":"150","總額":"1200","已支付":true},
    {"日期":"2025-02-24","主類別":"包裝材料","次類別":"白鐵線(猴網電)","工人姓名":"","數量":"1","單位":"項","單價":"130","總額":"130","已支付":true},
    {"日期":"2025-02-24","主類別":"包裝材料","次類別":"束帶(猴網電)","工人姓名":"","數量":"1","單位":"項","單價":"140","總額":"140","已支付":true},
    {"日期":"2025-02-24","主類別":"包裝材料","次類別":"包梨鐵線(猴網電)","工人姓名":"","數量":"1","單位":"項","單價":"75","總額":"75","已支付":true},
    {"日期":"2025-02-24","主類別":"什支備註","次類別":"92汽油","工人姓名":"","數量":"1","單位":"項","單價":"600","總額":"600","已支付":true},
    {"日期":"2025-02-24","主類別":"工人薪資","次類別":"撿枝","工人姓名":"其他工人","數量":"18","單位":"項","單價":"150","總額":"2700","已支付":true},
    {"日期":"2025-02-25","主類別":"工人薪資","次類別":"撿枝","工人姓名":"其他工人","數量":"8","單位":"項","單價":"150","總額":"1200","已支付":true},
    {"日期":"2025-03-11","主類別":"農藥","次類別":"(甜柿清園32缸)馬拉松","工人姓名":"","數量":"5","單位":"項","單價":"380","總額":"1900","已支付":true},
    {"日期":"2025-03-11","主類別":"什支備註","次類別":"安息香酸16","工人姓名":"","數量":"16","單位":"項","單價":"60","總額":"960","已支付":true},
    {"日期":"2025-03-11","主類別":"什支備註","次類別":"硫磺粉(巴斯夫)","工人姓名":"","數量":"1","單位":"項","單價":"2500","總額":"2500","已支付":true},
    {"日期":"2025-03-11","主類別":"農藥","次類別":"百克敏","工人姓名":"","數量":"3","單位":"項","單價":"300","總額":"900","職位":true,"已支付":true},
    {"日期":"2025-03-11","主類別":"什支備註","次類別":"百利普芬","工人姓名":"","數量":"4","單位":"項","單價":"700","總額":"2800","已支付":true},
    {"日期":"2025-03-11","主類別":"什支備註","次類別":"亞磷酸","工人姓名":"","數量":"1","單位":"項","單價":"12000","總額":"12000","已支付":true},
    {"日期":"2025-03-11","主類別":"什支備註","次類別":"微量元素","工人姓名":"","數量":"2","單位":"項","單價":"6000","總額":"12000","已支付":true},
    {"日期":"2025-03-14","主類別":"肥料","次類別":"下白肥","工人姓名":"","數量":"8","單位":"項","單價":"150","總額":"1200","已支付":true},
    {"日期":"2025-04-01","主類別":"什支備註","次類別":"撲滅寧","工人姓名":"","數量":"2","單位":"項","單價":"800","總額":"1600","已支付":true},
    {"日期":"2025-04-01","主類別":"農藥","次類別":"待克利","工人姓名":"","數量":"2","單位":"項","單價":"600","總額":"1200","已支付":true},
    {"日期":"2025-04-01","主類別":"什支備註","次類別":"大喜精","工人姓名":"","數量":"4","單位":"項","單價":"280","總額":"1120","已支付":true},
    {"日期":"2025-04-01","主類別":"什支備註","次類別":"大生粉","工人姓名":"","數量":"6","單位":"項","單價":"450","總額":"2700","已支付":true},
    {"日期":"2025-02-01","主類別":"什支備註","次類別":"阿義除草","工人姓名":"","數量":"1","單位":"項","單價":"20000","總額":"20000","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"阿義除草","工人姓名":"","數量":"1","單位":"項","單價":"20000","總額":"20000","已支付":true},
    {"日期":"2025-04-24","主類別":"菜錢","次類別":"阿義斷水","工人姓名":"","數量":"1","單位":"項","單價":"8000","總額":"8000","已支付":true},
    {"日期":"2025-01-01","主類別":"什支備註","次類別":"56200+49000","工人姓名":"","數量":"1","單位":"項","單價":"105200","總額":"105200","已支付":true},
    {"日期":"2025-04-17","主類別":"什支備註","次類別":"高磷鉀","工人姓名":"","數量":"45","單位":"項","單價":"700","總額":"31500","已支付":true},
    {"日期":"2025-04-17","主類別":"什支備註","次類別":"甜蜜鉀","工人姓名":"","數量":"60","單位":"項","單價":"650","總額":"39000","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"信生(道理)","工人姓名":"","數量":"12","單位":"項","單價":"380","總額":"4560","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"撲克拉","工人姓名":"","數量":"2","單位":"項","單價":"450","總額":"900","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"賽洛寧(大勝)","工人姓名":"","數量":"4","單位":"項","單價":"400","總額":"1600","已支付":true},
    {"日期":"2025-05-01","主類別":"農藥","次類別":"馬拉松","工人姓名":"","數量":"4","單位":"項","單價":"400","總額":"1600","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"信生(日產)","工人姓名":"","數量":"12","單位":"項","單價":"250","總額":"3000","已支付":true},
    {"日期":"2025-05-01","主類別":"農藥","次類別":"待克利","工人姓名":"","數量":"2","單位":"項","單價":"600","總額":"1200","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"賽速洛寧(日產)","工人姓名":"","數量":"4","單位":"項","單價":"650","總額":"2600","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"阿巴丁","工人姓名":"","數量":"2","單位":"項","單價":"400","總額":"800","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"得芬諾","工人姓名":"","數量":"4","單位":"項","單價":"450","總額":"1800","已支付":true},
    {"日期":"2025-05-01","主類別":"什支備註","次類別":"大生粉","工人姓名":"","數量":"1","單位":"項","單價":"4200","總額":"4200","已支付":true},
    {"日期":"2025-06-09","主類別":"什支備註","次類別":"丁基加保扶","工人姓名":"","數量":"4","單位":"項","單價":"700","總額":"2800","已支付":true}
  ],
  "income": [
    {"日期":"2025-09-26","主類別":"甜柿","其他備註":"市場拍賣大數據匯入","總重":"136","箱數":"12","總價":"13404","價格確認":true},
    {"日期":"2025-09-27","主類別":"甜柿","其他備註":"市場拍賣大數據匯入","總重":"160","箱數":"15","總價":"16392","價格確認":true},
    {"日期":"2025-09-30","主類別":"甜柿","其他備註":"市場拍賣大數據匯入","總重":"420","箱數":"35","總價":"43286","價格確認":true},
    {"日期":"2025-10-03","主類別":"甜柿","其他備註":"市場拍賣大數據匯入","總重":"349","箱數":"29","總價":"40640","價格確認":true},
    {"日期":"2025-10-04","主類別":"甜柿","其他備註":"市場拍賣大數據匯入","總重":"494","箱數":"41","總價":"53370","價格確認":true},
    {"日期":"2025-10-09","主類別":"甜柿","其他備註":"市場拍賣大數據匯入","總重":"558","箱數":"46","總價":"50703","價格確認":true}
  ]
};

async function importHistoricalData2025() {
  if (!confirm('確定要匯入 2025 年度歷史資料嗎？這將會新增多筆紀錄到試算表中。')) return;
  
  showLoader('匯入中...');
  try {
    const expRows = HISTORICAL_DATA_2025.expenses.map(r => {
      const id = 'H2025-' + Math.random().toString(36).substr(2, 6);
      return [id, r.日期, r.主類別, r.次類別, r.工人姓名, 'hourly', r.數量, r.單位, r.單價, r.總額, 'FALSE', r.已支付?'TRUE':'FALSE', '2025 匯入', now(), now()];
    });
    
    const incRows = HISTORICAL_DATA_2025.income.map(r => {
      const id = 'H2025I-' + Math.random().toString(36).substr(2, 6);
      return [id, r.日期, r.主類別, r.其他備註, '{}', r.總重, r.箱數, r.總價, '0', '0', '', r.價格確認?'TRUE':'FALSE', now(), now()];
    });

    if (expRows.length > 0) {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.EXPENSE}!A:O`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: expRows }
      });
    }
    
    if (incRows.length > 0) {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.INCOME}!A:N`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: incRows }
      });
    }

    await fetchAllData();
    renderAll();
    showToast('✓ 歷史資料匯入完成');
  } catch (err) {
    console.error(err);
    showToast('匯入失敗：' + err.message, 'error');
  }
  hideLoader();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('import2025Btn')?.addEventListener('click', importHistoricalData2025);
  }, 2000);
});
