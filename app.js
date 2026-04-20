// ============================================================
// 果園收支記帳 — app.js
// Google Sheets 作為後端，三分頁：收入 / 支出 / 管理
// ============================================================

// ============================================================
// 測試資料生成
// ============================================================
window.generateTestData = async function() {
  if (!confirm('將建置 3 筆收入與 3 筆支出測試資料，是否繼續？')) return;
  showLoader('建置測試資料中...');
  try {
    const todayStr = today();
    
    // 收入測試資料
    const incomeRows = [
      [generateId(), todayStr, '甜柿', '示範資料', JSON.stringify([{等級:'5A',斤數:120,箱數:12}]), '120', '12', '7200', '60', '0', '自動生成測試', 'TRUE', now(), now()],
      [generateId(), todayStr, '水蜜桃', '示範資料', JSON.stringify([{等級:'3A',斤數:45,箱數:5}]), '45', '5', '4500', '100', '150', '自動生成測試', 'FALSE', now(), now()],
      [generateId(), todayStr, '橘子', '示範資料', JSON.stringify([{等級:'4A',斤數:200,箱數:20}]), '200', '20', '6000', '30', '400', '自動生成測試', 'TRUE', now(), now()],
    ];

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.INCOME}!A:N`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: incomeRows }
    });

    // 支出測試資料
    const expenseRows = [
      [generateId(), todayStr, '工人薪資', '除草', '小張', 'hourly', '8', '200', '1600', 'FALSE', 'TRUE', '測試工時', now(), now()],
      [generateId(), todayStr, '肥料', '骨粉', '', '', '10', '450', '4500', 'FALSE', 'TRUE', '測試採買', now(), now()],
      [generateId(), todayStr, '工人薪資', '疏果', '阿明', 'daily', '1', '1500', '1600', 'TRUE', 'FALSE', '測試日薪(含補貼)', now(), now()],
    ];

    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.EXPENSE}!A:N`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: expenseRows }
    });

    await fetchIncome();
    await fetchExpense();
    renderAll();
    showToast('✓ 測試資料建置完成');
  } catch (e) {
    console.error(e);
    showToast('建置失敗', 'error');
  }
  hideLoader();
};

// ============================================================
// 1. 全域設定
// ============================================================
const SPREADSHEET_ID = '1rjVEG9x9ZJ6f3BSuC4CL_wYRATFvbGiZAGkwkzDP168';
const CLIENT_ID = '647415610600-eio0d6dqpu80j80gki4l9m5qfemmlkab.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// 工作表名稱（全部使用繁體中文）
const SHEET = {
  USERS: '使用者',
  SETTINGS: '設定',
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
  incomeMainCats: [],    // [{ id, 名稱 }]
  expenseMainCats: [],   // [{ id, 名稱, 類型: 'worker'|'material'|'meal', 次類別: [{id, 名稱, 預設金額}] }]
  workers: [],           // [{ id, 姓名, 預設時薪, 預設日薪 }]
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
    document.getElementById('userNameDisplay').style.display = 'inline';
    document.getElementById('userRoleBadge').textContent = isAdmin ? '管理員' : '使用者';
    document.getElementById('userRoleBadge').className = `role-badge${isAdmin ? ' admin' : ''}`;
    document.getElementById('userRoleBadge').style.display = 'inline';
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
      range: `${SHEET.USERS}!A1:D1`,
      values: [['別稱', 'Email', '角色', '更新時間']]
    },
    {
      range: `${SHEET.SETTINGS}!A1:E1`,
      values: [['類型', '名稱', '父類別', '預設金額', '備用']]
    },
    {
      range: `${SHEET.INCOME}!A1:N1`,
      values: [['編號', '日期', '主類別', '其他備註', '等級資料(JSON)', '總重(斤)', '箱數', '總價', '盤商價', '運費', '附註', '價格已確認', '建立時間', '最後更新']]
    },
    {
      range: `${SHEET.EXPENSE}!A1:N1`,
      values: [['編號', '日期', '主類別', '次類別', '工人姓名', '計薪方式', '數量', '單價', '總額', '含午餐', '已支付', '附註', '建立時間', '最後更新']]
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
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.SETTINGS}!A2:E`,
    });
    const rows = res.result.values || [];

    settings = { incomeMainCats: [], expenseMainCats: [], workers: [] };

    rows.forEach(r => {
      const type = r[0] || '';
      const name = r[1] || '';
      const parent = r[2] || '';
      const defaultAmt = r[3] || '';

      if (type === '收入主類別') {
        settings.incomeMainCats.push({ 名稱: name });
      } else if (type === '支出主類別') {
        settings.expenseMainCats.push({ 名稱: name, 類型: r[4] || 'material', 次類別: [] });
      } else if (type === '支出次類別') {
        const parent_cat = settings.expenseMainCats.find(c => c.名稱 === parent);
        if (parent_cat) {
          parent_cat.次類別.push({ 名稱: name, 預設金額: defaultAmt });
        }
      } else if (type === '工人') {
        settings.workers.push({ 姓名: name, 預設時薪: r[3] || '190', 預設日薪: r[4] || '1500' });
      }
    });

    // 如果設定全空，使用預設值
    if (settings.incomeMainCats.length === 0) {
      settings.incomeMainCats = DEFAULT_INCOME_CATS.map(n => ({ 名稱: n }));
    }
    if (settings.expenseMainCats.length === 0) {
      settings.expenseMainCats = DEFAULT_EXPENSE_CATS.map(c => ({ ...c }));
    }
  } catch (e) {
    settings = {
      incomeMainCats: DEFAULT_INCOME_CATS.map(n => ({ 名稱: n })),
      expenseMainCats: DEFAULT_EXPENSE_CATS.map(c => ({ ...c })),
      workers: [],
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
      range: `${SHEET.EXPENSE}!A2:N`,
    });
    expenseData = (res.result.values || []).map(r => ({
      id: r[0] || '',
      日期: r[1] || '',
      主類別: r[2] || '',
      次類別: r[3] || '',
      工人姓名: r[4] || '',
      計薪方式: r[5] || '',
      數量: r[6] || '',
      單價: r[7] || '',
      總額: r[8] || '',
      含午餐: r[9] === 'TRUE' || r[9] === true,
      已支付: r[10] === 'TRUE' || r[10] === true,
      附註: r[11] || '',
      建立時間: r[12] || '',
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

function renderIncomeChart() {
  const period = filterState.income.period;
  const data = getFilteredByPeriod(incomeData, '日期', period);

  const catMap = {};
  settings.incomeMainCats.forEach(c => catMap[c.名稱] = { total: 0, count: 0, pending: 0 });

  data.forEach(r => {
    const key = r.主類別;
    if (!catMap[key]) catMap[key] = { total: 0, count: 0, pending: 0 };
    const price = parseFloat(r.總價) || 0;
    catMap[key].total += price;
    catMap[key].count++;
    if (!r.價格確認) catMap[key].pending++;
  });

  const bars = Object.entries(catMap).filter(([, v]) => v.count > 0);
  const maxVal = Math.max(...bars.map(([, v]) => v.total), 1);
  const colors = ['bar-green', 'bar-yellow', 'bar-orange', 'bar-blue', 'bar-purple', 'bar-red'];

  const area = document.getElementById('incomeChartArea');
  area.innerHTML = '';

  if (bars.length === 0) {
    area.innerHTML = '<p style="color:var(--text-xs); font-size:0.82rem;">尚無資料</p>';
    return;
  }

  bars.sort((a, b) => b[1].total - a[1].total).forEach(([name, v], i) => {
    const pct = maxVal > 0 ? (v.total / maxVal * 100) : 0;
    const row = document.createElement('div');
    row.className = 'chart-row';
    row.innerHTML = `
      <div class="chart-label-row">
        <span class="chart-label-name">${name}</span>
        <span class="chart-label-val">
          $${v.total.toLocaleString()}
          ${v.pending > 0 ? `<span class="unpaid-tag">待確認 ${v.pending} 筆</span>` : ''}
        </span>
      </div>
      <div class="chart-bar-bg">
        <div class="chart-bar-fill ${colors[i % colors.length]}" style="width:0%" data-pct="${pct}"></div>
      </div>`;
    area.appendChild(row);
  });

  // 觸發動畫
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

  // 先看有無工人薪資
  const workerCat = settings.expenseMainCats.find(c => c.類型 === 'worker');
  const workerCatName = workerCat?.名稱 || '工人薪資';

  // 工人薪資：依人名統計
  const workerExpenses = data.filter(r => r.主類別 === workerCatName);
  const workerMap = {};
  workerExpenses.forEach(r => {
    const name = r.工人姓名 || '未知';
    if (!workerMap[name]) workerMap[name] = { paid: 0, unpaid: 0 };
    const amt = calcExpenseTotal(r);
    if (r.已支付) workerMap[name].paid += amt;
    else workerMap[name].unpaid += amt;
  });

  // 其他主類別
  const otherCats = settings.expenseMainCats.filter(c => c.類型 !== 'worker');
  const catMap = {};
  otherCats.forEach(c => catMap[c.名稱] = 0);
  data.filter(r => r.主類別 !== workerCatName).forEach(r => {
    if (!catMap[r.主類別]) catMap[r.主類別] = 0;
    catMap[r.主類別] += calcExpenseTotal(r);
  });

  const colorsBW = ['bar-green', 'bar-blue', 'bar-orange', 'bar-purple', 'bar-yellow', 'bar-red'];

  // 工人薪資區塊
  if (Object.keys(workerMap).length > 0) {
    const workerHeader = document.createElement('div');
    workerHeader.style.cssText = 'font-size:0.78rem;font-weight:600;color:var(--text-muted);margin-bottom:4px;';
    workerHeader.textContent = `👷 ${workerCatName}（點選姓名查看明細）`;
    area.appendChild(workerHeader);

    const allAmt = Object.values(workerMap).reduce((s, v) => s + v.paid + v.unpaid, 0);
    Object.entries(workerMap).forEach(([name, v], i) => {
      const total = v.paid + v.unpaid;
      const pct = allAmt > 0 ? (total / allAmt * 100) : 0;
      const row = document.createElement('div');
      row.className = 'chart-row';
      row.innerHTML = `
        <div class="chart-label-row">
          <span class="chart-label-name" onclick="showWorkerDetail('${name}')">${name}</span>
          <span class="chart-label-val">
            $${total.toLocaleString()}
            ${v.paid > 0 ? `<span class="paid-tag">已付 $${v.paid.toLocaleString()}</span>` : ''}
            ${v.unpaid > 0 ? `<span class="unpaid-tag">未付 $${v.unpaid.toLocaleString()}</span>` : ''}
          </span>
        </div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill ${colorsBW[i % colorsBW.length]}" style="width:0%" data-pct="${pct}"></div>
        </div>`;
      area.appendChild(row);
    });
  }

  // 其他類別
  const otherEntries = Object.entries(catMap).filter(([, v]) => v > 0);
  if (otherEntries.length > 0) {
    const otherHeader = document.createElement('div');
    otherHeader.style.cssText = 'font-size:0.78rem;font-weight:600;color:var(--text-muted);margin:8px 0 4px;';
    otherHeader.textContent = '📦 其他支出';
    area.appendChild(otherHeader);

    const maxOther = Math.max(...otherEntries.map(([, v]) => v), 1);
    otherEntries.sort((a, b) => b[1] - a[1]).forEach(([name, val], i) => {
      const pct = (val / maxOther * 100);
      const row = document.createElement('div');
      row.className = 'chart-row';
      row.innerHTML = `
        <div class="chart-label-row">
          <span class="chart-label-name">${name}</span>
          <span class="chart-label-val">$${val.toLocaleString()}</span>
        </div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill bar-orange" style="width:0%" data-pct="${pct}"></div>
        </div>`;
      area.appendChild(row);
    });
  }

  if (area.children.length === 0) {
    area.innerHTML = '<p style="color:var(--text-xs); font-size:0.82rem;">尚無資料</p>';
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
      <td>${r.數量 ? r.數量 + (r.計薪方式 === 'hourly' ? 'h' : r.計薪方式 === 'daily' ? '天' : '') : '-'}</td>
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
['expenseQty', 'expenseUnitPrice'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateExpenseTotal);
});
document.getElementById('includeLunch').addEventListener('change', updateExpenseTotal);

function updateExpenseTotal() {
  const qty = parseFloat(document.getElementById('expenseQty').value) || 0;
  const unit = parseFloat(document.getElementById('expenseUnitPrice').value) || 0;
  const lunch = document.getElementById('includeLunch').checked ? 100 : 0;
  const total = qty * unit + lunch;
  document.getElementById('expenseTotalAmt').textContent = `$${total.toLocaleString()}`;
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
function onExpenseSubCatChange() {
  const val = document.getElementById('expenseSubCat').value;
  document.getElementById('expenseCustomSubCatWrap').style.display = (val === 'ADD_NEW') ? 'flex' : 'none';
}
document.getElementById('expenseWorker').addEventListener('change', onExpenseWorkerChange);
document.getElementById('expenseSubCat').addEventListener('change', onExpenseSubCatChange);

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
  const isEdit = !!id;
  const mainVal = document.getElementById('expenseMainCat').value;
  const cat = settings.expenseMainCats.find(c => c.名稱 === mainVal);
  const isWorker = cat?.類型 === 'worker';

  let subCat = '';
  if (isWorker) {
    const activeChips = document.querySelectorAll('#workerSubCatChips .chip.active');
    subCat = Array.from(activeChips).map(c => c.textContent).join(', ');
  } else {
    subCat = document.getElementById('expenseSubCat').value;
  }

  const wageType = isWorker ? document.querySelector('input[name="wageType"]:checked').value : '';
  const qty = document.getElementById('expenseQty').value;
  const unitPrice = document.getElementById('expenseUnitPrice').value;
  const lunch = isWorker && document.getElementById('includeLunch').checked;
  let total = (parseFloat(qty) || 0) * (parseFloat(unitPrice) || 0) + (lunch ? 100 : 0);

  const rowData = [
    id || generateId(),
    document.getElementById('expenseDate').value,
    mainVal,
    subCat,
    isWorker ? document.getElementById('expenseWorker').value : '',
    wageType,
    qty,
    unitPrice,
    total,
    lunch ? 'TRUE' : 'FALSE',
    document.getElementById('expenseIsPaid').checked ? 'TRUE' : 'FALSE',
    document.getElementById('expenseNotes').value,
    isEdit ? (expenseData.find(r => r.id === id)?.建立時間 || now()) : now(),
    now(),
  ];

  showLoader(isEdit ? '更新中...' : '儲存中...');
  try {
    if (isNewWorker) {
      await appendToSheet(SHEET.SETTINGS, ['工人', worker, '', '190', '1500']); 
    }
    if (isNewSubCat) {
      await appendToSheet(SHEET.SETTINGS, ['支出次類別', subCat, mainCatName, '', '']);
    }
    if (isNewWorker || isNewSubCat) {
      await fetchSettings();
    }
    if (isEdit) {
      const rowIdx = expenseData.findIndex(r => r.id === id) + 2;
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.EXPENSE}!A${rowIdx}:N${rowIdx}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
    } else {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.EXPENSE}!A:N`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
    }
    await fetchExpense();
    renderExpenseChart();
    renderExpenseTable();
    closeExpenseModal();
    showToast(isEdit ? '✓ 更新成功' : '✓ 支出已記錄');
  } catch (err) {
    console.error(err);
    showToast('儲存失敗：' + err.message, 'error');
  }
  hideLoader();
};

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
