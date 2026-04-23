// ============================================================
// 果園收支記帳 — app.js
// Google Sheets 作為後端，三分頁：收入 / 支出 / 管理
// ============================================================

// ============================================================
// 1. 全域設定
// ============================================================
const SPREADSHEET_ID = '1rjVEG9x9ZJ6f3BSuC4CL_wYRATFvbGiZAGkwkzDP168';
const CLIENT_ID = '647415610600-eio0d6dqpu80j80gki4l9m5qfemmlkab.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email openid';

// 工作表名稱（全部使用繁體中文）
const SHEET = {
  USERS: '使用者',
  INCOME_CATS: '設定_品種',
  RETAIL_PRICE: '設定_對外販售金額',
  EXPENSE_CATS: '設定_支出類別',
  WORKERS: '設定_工人名單',
  UNITS: '設定_單位清單',
  MARKET_INCOME: '市場收入',
  EXPENSE: '支出',
  CUSTOMERS: '客戶資料',
  ORDERS: '客戶訂單明細',
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
let customersData = []; // 客戶資料
let ordersData = [];    // 訂單資料

// Settings 資料
let settings = {
  incomeMainCats: [],    // [{ 名稱, 次類別: [], 等級: [] }]
  retailPrices: [],      // [{ 品種, 次類別, 等級, 單位, 顆數, 售價 }]
  expenseMainCats: [],   // [{ 名稱, 類型, 次類別: [{名稱, 預設金額}] }]
  workers: [],           // [{ 姓名, 預設時薪, 預設日薪 }]
  units: [],             // [名稱]
};

// 篩選/排序狀態
const filterState = {
  income: { mainCat: null, subCat: null, sortOrder: 'desc', period: 'year' },
  expense: { mainCat: null, subCat: null, sortOrder: 'desc', period: 'year' },
  order: { mainCat: null, subCat: null, sortOrder: 'desc', period: 'year' },
  balance: { period: 'year' },
};

// --- 工具類變數與函式 (先行定義避免 ReferenceError) ---
let _loaderCount = 0;
function showLoader(msg = '處理中...') {
  _loaderCount++;
  const el = document.getElementById('loaderMsg');
  if (el) el.textContent = msg;
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = 'flex';
}
function hideLoader() {
  _loaderCount = Math.max(0, _loaderCount - 1);
  if (_loaderCount === 0) {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
  }
}

let _toastTimer;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = type === 'error' ? 'var(--red)' : 'var(--text)';
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

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
    gapi.client.setToken(resp);
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
    const cleanEmail = email.trim().toLowerCase();
    let userRow = usersData.find(u => u.email === cleanEmail);
    
    // 如果系統完全沒有使用者，或者是特定條件下的首位登入者
    if (usersData.length === 0 && !userRow) {
      console.log('系統初始登入：自動將首位使用者設為管理員');
      await addUserToSheet(email, 'admin');
      await fetchUsers(); // 重新讀取名單
      userRow = usersData.find(u => u.email === cleanEmail);
    }

    if (!userRow) {
      // 未登記的帳號 → 當一般使用者
      currentUser = { email, role: 'user' };
    } else {
      currentUser = { email, role: userRow.role };
    }
    isAdmin = currentUser.role === 'admin';

    // 更新 header
    const currentName = userRow?.nickname || (email ? email.split('@')[0] : '訪客');
    const roleDisplay = isAdmin ? '管理員' : '使用者';
    
    // 將別名整合進身分標籤，並隱藏原本重複的暱稱文字
    document.getElementById('userNameDisplay').style.display = 'none'; 
    document.getElementById('userRoleBadge').textContent = `${roleDisplay} · ${currentName}`;
    document.getElementById('userRoleBadge').className = `role-badge${isAdmin ? ' admin' : ''}`;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'inline-flex';

    if (email) {
      showToast(`歡迎回來 ${currentName}！系統識別身份：${roleDisplay}`, 'success');
    } else {
      showToast(`登入成功，但無法抓取 Email。請確認是否已勾選權限。`, 'warning');
    }

    if (isAdmin) {
      document.getElementById('tab-admin').style.display = 'flex';
    }

    document.getElementById('authSection').style.display = 'none';
    document.getElementById('workspace').style.display = 'block';

    switchTab('revenue');
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
      range: `${SHEET.INCOME_CATS}!A1:F1`,
      values: [['品種名稱', '備用', '品種次類別', '產季', '等級', '備註']]
    },
    {
      range: `${SHEET.RETAIL_PRICE}!A1:G1`,
      values: [['品種主類別', '品種次類別', '等級', '單位(箱/袋)', '顆數', '收費(已含運)', '備註']]
    },
    {
      range: `${SHEET.EXPENSE_CATS}!A1:E1`,
      values: [['主類別', '次類別', '類型', '預設金額', '備註']]
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
      range: `${SHEET.MARKET_INCOME}!A1:R1`,
      values: [['編號', '日期', '客戶類別', '客戶名稱', '品種主類別', '品種次類別', '等級資料', '總重(斤)', '箱數', '總價', '盤商價', '運費', '附註', '付款狀態', '對帳狀態', '建立時間', '最後更新', '附註2']]
    },
    {
      range: `${SHEET.EXPENSE}!A1:O1`,
      values: [['編號', '日期', '主類別', '次類別', '工人姓名', '計薪方式', '數量', '單位', '單價', '總額', '含午餐', '已支付', '附註', '建立時間', '最後更新']]
    },
    {
      range: `${SHEET.CUSTOMERS}!A1:G1`,
      values: [['客戶編號', '客戶姓名', '電話', '地址', '客戶來源', '客戶渠道', '介紹人']]
    },
    {
      range: `${SHEET.ORDERS}!A1:S1`,
      values: [['訂購品項', '品項類別', '訂單狀態', '下定日期', '到貨日期', '訂購等級', '訂單內容', '總價', '客戶編號', '寄件人', '寄件人電話', '收件人(客戶)', '收件人電話', '收件人地址', '需備註寄件人', '取貨方式', '付款狀態', '對帳狀態', '附註']]
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
      fetchCustomers(),
      fetchOrders()
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
      nickname: (r[0] || '').trim(),
      email: (r[1] || '').trim().toLowerCase(), 
      role: (r[2] || 'user').trim().toLowerCase(), 
    }));
  } catch (e) { usersData = []; }
}

async function fetchSettings() {
  try {
    const [resInc, resRetail, resExp, resWork, resUnit] = await Promise.all([
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.INCOME_CATS}!A2:F` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.RETAIL_PRICE}!A2:H` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.EXPENSE_CATS}!A2:E` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.WORKERS}!A2:C` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.UNITS}!A2:A` }),
    ]);

    settings = { incomeMainCats: [], retailPrices: [], expenseMainCats: [], workers: [], units: [] };

    // 品種
    (resInc.result.values || []).forEach(r => {
      const main = r[1], sub = r[2] || '', gradeStr = r[4] || '';
      if (!main) return;
      
      let cat = settings.incomeMainCats.find(c => c.名稱 === main);
      if (!cat) {
        cat = { 名稱: main, 次類別: [], 等級: [] };
        settings.incomeMainCats.push(cat);
      }
      if (sub && !cat.次類別.includes(sub)) cat.次類別.push(sub);
      
      // 解析逗號分隔的等級
      if (gradeStr) {
        gradeStr.split(/[,、]/).forEach(g => {
          const gn = g.trim();
          if (gn && !cat.等級.includes(gn)) cat.等級.push(gn);
        });
      }
    });

    // 對外販售金額
    (resRetail.result.values || []).forEach(r => {
      if (r[0]) {
        settings.retailPrices.push({
          品種主類別: r[0] || '',
          品種次類別: r[1] || '',
          等級: r[2] || '',
          單位: r[3] || '',
          販售內容: r[4] || '',
          定價: r[5] || '',
          售價: r[6] || '',
          備註: r[7] || ''
        });
      }
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
    if (settings.incomeMainCats.length === 0) settings.incomeMainCats = DEFAULT_INCOME_CATS.map(n => ({ 名稱: n, 次類別:[], 等級: GRADE_OPTIONS }));
    if (settings.expenseMainCats.length === 0) settings.expenseMainCats = DEFAULT_EXPENSE_CATS.map(c => ({ ...c }));
    if (settings.units.length === 0) settings.units = ['包', '罐', '箱', '件', '斤', '天', '小時'];
    
  } catch (e) {
    console.error('fetchSettings 失敗:', e);
    settings = {
      incomeMainCats: DEFAULT_INCOME_CATS.map(n => ({ 名稱: n, 次類別:[], 等級: GRADE_OPTIONS })),
      retailPrices: [],
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
      range: `${SHEET.MARKET_INCOME}!A2:R`,
    });
    incomeData = (res.result.values || []).map(r => ({
      id: r[0] || '',
      日期: r[1] || '',
      客戶類別: r[2] || '',
      客戶名稱: r[3] || '',
      主類別: r[4] || '',
      次類別: r[5] || '',
      等級資料: safeParseJSON(r[6], []),
      總重: r[7] || '',
      箱數: r[8] || '',
      總價: r[9] || '',
      盤商價: r[10] || '',
      運費: r[11] || '',
      附註: r[12] || '',
      付款狀態: r[13] || '未付款',
      對帳狀態: r[14] || '待對帳',
      價格確認: r[14] === 'OK',
      建立時間: r[15] || '',
      最後更新: r[16] || '',
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

async function fetchCustomers() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.CUSTOMERS}!A2:G`,
    });
    customersData = (res.result.values || []).map(r => ({
      客戶編號: r[0] || '',
      客戶姓名: r[1] || '',
      電話: r[2] || '',
      地址: r[3] || '',
      客戶來源: r[4] || '',
      客戶渠道: r[5] || '',
      介紹人: r[6] || '',
    }));
  } catch (e) { customersData = []; }
}

async function fetchOrders() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.ORDERS}!A2:S`,
    });
    ordersData = (res.result.values || []).map((r, index) => {
      let status = r[2] || '未指定';
      if (status === '不指定' || status === '未填') status = '未指定';
      return {
        id: `ORD_${index}_${Date.now()}`,
        訂購品項: r[0] || '',
        品項類別: r[1] || '',
        狀態: status,
        下定日期: r[3] || '',
        到貨日期: r[4] || '',
        訂購等級: r[5] || '',
        訂單內容: r[6] || '',
        總價: r[7] || '',
        客戶編號: r[8] || '',
        寄件人: r[9] || '',
        寄件人電話: r[10] || '',
        收件人: r[11] || '',
        收件人電話: r[12] || '',
        收件人地址: r[13] || '',
        需備註寄件人: r[14] === 'TRUE' || r[14] === 'Y' || r[14] === true,
        取貨方式: r[15] || '',
        付款狀態: r[16] || '未付款',
        對帳狀態: r[17] || '待對帳',
        附註: r[18] || '',
      };
    });
    ordersData.forEach((od, i) => od._localIdx = i + 2);
  } catch (e) { ordersData = []; }
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

// ============================================================
// 7. Tab 切換
// ============================================================
function switchTab(tab) {
  if (tab === 'admin' && !isAdmin) {
    showToast('權限不足，無法進入管理頁面', 'error');
    return;
  }
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-page').forEach(p => {
    const match = p.id === `page-${tab}`;
    p.classList.toggle('active', match);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// 子頁 Tab 切換（市場收入 / 客戶訂單）
document.querySelectorAll('.sub-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const subId = btn.dataset.subtab;
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === subId));
    document.querySelectorAll('.sub-tab-page').forEach(p => {
      const match = p.id === `subpage-${subId}`;
      p.classList.toggle('active', match);
    });
  });
});

// ============================================================
// 8. 渲染全部
// ============================================================
function renderAll() {
  renderRevenueSummary();
  renderIncomeChart();
  renderIncomeTable();
  renderIncomeFilterChips();

  renderExpenseChart();
  renderExpenseTable();
  renderExpenseFilterChips();

  renderBalancePage();
  renderOrderChart();
  renderOrderFilterChips();
  renderOrderTable();

  if (isAdmin) renderAdminPage();
}

// 收入總覽卡片（市場+訂單合計，依今年）
function renderRevenueSummary() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const marketThisYear = incomeData
    .filter(r => r.日期 && new Date(r.日期).getFullYear() === thisYear)
    .reduce((s, r) => s + (parseFloat(r.總價) || 0), 0);
  const orderThisYear = ordersData
    .filter(r => (r.下定日期 || r.到貨日期) && new Date(r.下定日期 || r.到貨日期).getFullYear() === thisYear)
    .reduce((s, r) => s + (parseFloat(r.總價) || 0), 0);
  const total = marketThisYear + orderThisYear;
  const el = document.getElementById('revenueTotalAmount');
  const mk = document.getElementById('revenueMarketTotal');
  const ok = document.getElementById('revenueOrderTotal');
  if (el) el.textContent = `$${total.toLocaleString()}`;
  if (mk) mk.textContent = `$${marketThisYear.toLocaleString()}`;
  if (ok) ok.textContent = `$${orderThisYear.toLocaleString()}`;
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

/* Helper: 取得語意化類別顏色 */
const CAT_COLORS = {
  '甜柿':   { color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  '水蜜桃': { color: '#ec4899', bg: '#fdf2f8', border: '#fbcfe8' },
  '橘子':   { color: '#84cc16', bg: '#f7fee7', border: '#d9f99d' },
  '固定成本': { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  '變動成本': { color: '#8b5cf6', bg: '#f3f0ff', border: '#ddd6fe' },
  '工人薪資': { color: '#8b5cf6', bg: '#f3f0ff', border: '#ddd6fe' }
};
const CAT_FALLBACK_PALETTE = ['#22c55e','#3b82f6','#a855f7','#f97316','#eab308','#ef4444','#06b6d4','#64748b'];

function getCategoryColor(name, fallbackIndex = 0) {
  if (CAT_COLORS[name]) return CAT_COLORS[name];
  const c = CAT_FALLBACK_PALETTE[fallbackIndex % CAT_FALLBACK_PALETTE.length];
  return { color: c, bg: '#f8fafc', border: '#e2e8f0' };
}



/** 建立「左滑」顯示編輯/刪除按鈕的邏輯 (適用於手機/觸控) */
function setupSwipeLogic(itemEl, editCb, delCb) {
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;
  const content = itemEl.querySelector('.record-item-content');
  const actionWidth = 140; // 應與 CSS 一致

  itemEl.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isSwiping = true;
    content.style.transition = 'none'; // 拖曳時不延遲
  }, { passive: true });

  itemEl.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    
    // 只允許向左滑 (負值)
    if (diff < 0) {
      const move = Math.max(diff, -actionWidth - 40); // 稍微多一點彈性
      content.style.transform = `translateX(${move}px)`;
    } else {
      content.style.transform = `translateX(0px)`;
    }
  }, { passive: true });

  itemEl.addEventListener('touchend', (e) => {
    isSwiping = false;
    content.style.transition = ''; // 恢復動畫
    const finalDiff = currentX - startX;

    if (finalDiff < -actionWidth / 2) {
      itemEl.classList.add('swiped');
      content.style.transform = `translateX(-${actionWidth}px)`;
    } else {
      itemEl.classList.remove('swiped');
      content.style.transform = `translateX(0px)`;
    }
  });

  // 對於非觸控裝置 (滑鼠)，可以點擊「...」或保持隱藏按鈕。
  // 這裡我們在 itemEl 內部加入隱藏的按鈕
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'record-item-actions-swipe';
  actionsWrap.innerHTML = `
    <button class="swipe-btn edit"><span class="material-symbols-outlined">edit</span>編輯</button>
    <button class="swipe-btn del"><span class="material-symbols-outlined">delete</span>刪除</button>
  `;
  actionsWrap.querySelector('.edit').onclick = (e) => { e.stopPropagation(); editCb(); itemEl.classList.remove('swiped'); content.style.transform = 'translateX(0)'; };
  actionsWrap.querySelector('.del').onclick  = (e) => { e.stopPropagation(); delCb(); itemEl.classList.remove('swiped'); content.style.transform = 'translateX(0)'; };
  
  itemEl.appendChild(actionsWrap);

  // 點擊 content 時若已展開則關閉
  content.addEventListener('click', (e) => {
    if (itemEl.classList.contains('swiped')) {
      e.stopPropagation();
      itemEl.classList.remove('swiped');
      content.style.transform = 'translateX(0)';
    }
  });
}

function getAmountClass(val) {
  return (parseFloat(val) === 0) ? ' amount-zero' : '';
}
let _incomePieInstance = null;
let _orderPieInstance = null;

function renderIncomeChart() {
  const period = filterState.income.period;
  const data = getFilteredByPeriod(incomeData, '日期', period);

  const catMap = {};
  settings.incomeMainCats.forEach((c, i) => {
    const clr = getCategoryColor(c.名稱, i);
    catMap[c.名稱] = { total: 0, count: 0, pending: 0, unpaidAmount: 0, ...clr };
  });

  let grandTotal = 0;
  data.forEach(r => {
    const key = r.主類別;
    if (!catMap[key]) {
      const clr = getCategoryColor(key, Object.keys(catMap).length);
      catMap[key] = { total: 0, count: 0, pending: 0, unpaidAmount: 0, ...clr };
    }
    const price = parseFloat(r.總價) || 0;
    catMap[key].total += price;
    catMap[key].count++;
    grandTotal += price;
    if (r.付款狀態 !== '已付款') {
      catMap[key].pending++;
      catMap[key].unpaidAmount += price;
    }
  });

  document.getElementById('incomeTotalSummary').textContent = `總計：$${grandTotal.toLocaleString()}`;

  const entries = Object.entries(catMap).filter(([, v]) => v.count > 0);

  // 圓餅圖
  const ctx = document.getElementById('incomePieChart');
  if (ctx) {
    if (_incomePieInstance) _incomePieInstance.destroy();
    if (entries.length > 0) {
      _incomePieInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: entries.map(([n]) => n),
          datasets: [{ data: entries.map(([, v]) => v.total), backgroundColor: entries.map(([n]) => catMap[n].color), borderWidth: 2, borderColor: 'white' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } } }
        }
      });
    }
  }

  // 右側方格
  const area = document.getElementById('incomeChartArea');
  if (!area) return;
  area.innerHTML = '';

  if (entries.length === 0) {
    area.innerHTML = '<p style="color:var(--text-xs);font-size:0.82rem;padding:0.5rem 0">該時段尚無紀錄</p>';
    return;
  }

  entries.sort((a, b) => b[1].total - a[1].total).forEach(([name, v]) => {
    const color = catMap[name]?.color || '#22c55e';
    const d = document.createElement('div');
    d.className = 'pie-legend-item';
    d.style.cursor = 'pointer';
    d.innerHTML = `
      <span class="pie-legend-dot" style="background:${color}"></span>
      <span class="pie-legend-name">${name}<span style="color:var(--text-muted);font-size:0.7rem;margin-left:4px">${v.count}筆${v.pending>0?`·⚠️${v.pending}未收`:''}</span></span>
      <span class="pie-legend-val">$${v.total.toLocaleString()}</span>`;
    d.onclick = () => {
      filterState.income.mainCat = filterState.income.mainCat === name ? null : name;
      filterState.income.subCat = null;
      renderIncomeFilterChips();
      renderIncomeTable();
    };
    area.appendChild(d);
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
  const palette = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#eab308', '#ef4444'];
  const catColorMap = {};
  settings.incomeMainCats.forEach((c, i) => { catColorMap[c.名稱] = palette[i % palette.length]; });

  settings.incomeMainCats.forEach(c => {
    const btn = document.createElement('button');
    const isActive = filterState.income.mainCat === c.名稱;
    const color = catColorMap[c.名稱];
    btn.className = `filter-chip${isActive ? ' active' : ''}`;
    if (isActive) btn.style.cssText = `background:${color};border-color:${color};color:white`;
    btn.textContent = c.名稱;
    btn.onclick = () => {
      if (filterState.income.mainCat === c.名稱) {
        filterState.income.mainCat = null;
        filterState.income.subCat = null;
      } else {
        filterState.income.mainCat = c.名稱;
        filterState.income.subCat = null;
      }
      renderIncomeFilterChips();
      renderIncomeTable();
    };
    container.appendChild(btn);
  });

  // 次類別 chips
  const subContainer = document.getElementById('incomeSubCatChips');
  if (!subContainer) return;
  subContainer.innerHTML = '';
  if (filterState.income.mainCat) {
    const cat = settings.incomeMainCats.find(c => c.名稱 === filterState.income.mainCat);
    const subs = (cat && cat.次類別) ? cat.次類別.filter(Boolean) : [];
    if (subs.length > 0) {
      subContainer.style.display = 'flex';
      const color = catColorMap[filterState.income.mainCat] || '#22c55e';
      subs.forEach(sub => {
        const btn = document.createElement('button');
        const isSubActive = filterState.income.subCat === sub;
        btn.className = `filter-chip${isSubActive ? ' active' : ''}`;
        btn.style.cssText = isSubActive
          ? `background:${color};border-color:${color};color:white`
          : `border-color:${color};color:${color}`;
        btn.textContent = sub;
        btn.onclick = () => {
          filterState.income.subCat = filterState.income.subCat === sub ? null : sub;
          renderIncomeFilterChips();
          renderIncomeTable();
        };
        subContainer.appendChild(btn);
      });
    } else {
      subContainer.style.display = 'none';
    }
  } else {
    subContainer.style.display = 'none';
  }
}

document.getElementById('incomeClearFilter').onclick = () => {
  filterState.income.mainCat = null;
  filterState.income.subCat = null;
  renderIncomeFilterChips();
  renderIncomeTable();
};

document.getElementById('incomeSortBtn').onclick = function() {
  filterState.income.sortOrder = filterState.income.sortOrder === 'desc' ? 'asc' : 'desc';
  this.title = filterState.income.sortOrder === 'desc' ? '日期新→舊' : '日期舊→新';
  renderIncomeTable();
};

document.getElementById('incomeCopyBtn').onclick = () => openCopyModal('income');

// --- 表格（折疊式卡片版） ---
function renderIncomeTable() {
  let data = [...incomeData];
  if (filterState.income.mainCat) data = data.filter(r => r.主類別 === filterState.income.mainCat);
  if (filterState.income.subCat) data = data.filter(r => r.次類別 === filterState.income.subCat);

  data.sort((a, b) => {
    const diff = new Date(a.日期) - new Date(b.日期);
    return filterState.income.sortOrder === 'desc' ? -diff : diff;
  });

  const container = document.getElementById('incomeRecordContainer');
  const empty = document.getElementById('incomeEmpty');
  if (!container) return;
  container.innerHTML = '';

  if (data.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const now = new Date();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  // 依主類別分區塊
  const mainCatSet = filterState.income.mainCat
    ? [filterState.income.mainCat]
    : [...new Set(settings.incomeMainCats.map(c => c.名稱))].filter(n => data.some(r => r.主類別 === n));

  const palette = ['#22c55e','#3b82f6','#a855f7','#f97316','#eab308','#ef4444'];
  const catColors = {};
  settings.incomeMainCats.forEach((c, i) => { catColors[c.名稱] = palette[i % palette.length]; });

  mainCatSet.forEach((catName, ci) => {
    const catData = data.filter(r => r.主類別 === catName);
    if (catData.length === 0) return;

    const catTotal = catData.reduce((s, r) => s + (parseFloat(r.總價) || 0), 0);
    const color = catColors[catName] || palette[ci % palette.length];

    // 主類別區塊
    const section = document.createElement('div');
    section.className = 'record-section';
    section.style.borderLeft = `4px solid ${color}`;

    const header = document.createElement('div');
    header.className = 'record-section-header';
    header.innerHTML = `
      <div class="record-section-left">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px"></span>
        ${catName}
        <span class="record-section-count">${catData.length}筆</span>
      </div>
      <div class="record-section-right">
        <span class="record-section-total">$${catTotal.toLocaleString()}</span>
        <span class="material-symbols-outlined record-section-arrow expanded">chevron_right</span>
      </div>`;

    const body = document.createElement('div');
    body.className = 'record-section-body expanded';

    header.onclick = () => {
      const arrow = header.querySelector('.record-section-arrow');
      const isExp = body.classList.toggle('expanded');
      arrow.classList.toggle('expanded', isExp);
    };

    // 依年-月-日期分組
    const yearMap = {};
    catData.forEach(r => {
      const yr = r.日期 ? r.日期.substring(0, 4) : '未知';
      const mo = r.日期 ? r.日期.substring(0, 7) : '未知';
      if (!yearMap[yr]) yearMap[yr] = {};
      if (!yearMap[yr][mo]) yearMap[yr][mo] = [];
      yearMap[yr][mo].push(r);
    });

    const sortedYears = Object.keys(yearMap).sort((a, b) => b.localeCompare(a));
    sortedYears.forEach(yr => {
      const yrDiv = document.createElement('div');

      const yrHeader = document.createElement('div');
      yrHeader.className = 'record-year-header';
      const yrTotal = Object.values(yearMap[yr]).flat().reduce((s, r) => s + (parseFloat(r.總價) || 0), 0);
      yrHeader.innerHTML = `<span>📅 ${yr} 年</span><span style="font-weight:600;color:var(--green-dark)">$${yrTotal.toLocaleString()}</span>`;

      const yrBody = document.createElement('div');
      yrBody.className = 'record-year-body expanded';

      yrHeader.onclick = () => {
        const isExp = yrBody.classList.toggle('expanded');
      };

      const sortedMonths = Object.keys(yearMap[yr]).sort((a, b) => b.localeCompare(a));
      sortedMonths.forEach(mo => {
        const moList = yearMap[yr][mo];
        const moDiv = document.createElement('div');

        const moHeader = document.createElement('div');
        moHeader.className = 'record-month-header';
        const moTotal = moList.reduce((s, r) => s + (parseFloat(r.總價) || 0), 0);
        moHeader.innerHTML = `<span>${mo.substring(5, 7)} 月 <span class="record-section-count">${moList.length}筆</span></span><span>$${moTotal.toLocaleString()}</span>`;

        const moBody = document.createElement('div');
        moBody.className = 'record-month-body expanded';

        moHeader.onclick = () => moBody.classList.toggle('expanded');

        moList.forEach(r => {
          const gradeArr = Array.isArray(r.等級資料) ? r.等級資料 : [];
          const gradeText = gradeArr.map(g => `${g.等級} ${g.斤數||''}斤${g.箱數 ? ' ' + g.箱數 + '箱' : ''}`).join(' / ') || '';
          const price = r.總價 ? `$${parseFloat(r.總價).toLocaleString()}` : '待確認';

          const payClass = r.付款狀態 === '已付款' ? 'paid' : 'unpaid';
          const reconClass = r.對帳狀態 === 'OK' ? 'ok-recon' : 'pending-recon';

          const item = document.createElement('div');
          item.className = 'record-item';
          const priceVal = parseFloat(r.總價) || 0;
          const amtClass = getAmountClass(priceVal);

          item.innerHTML = `
            <div class="record-item-content">
              <div class="record-item-date">${r.日期 ? r.日期.substring(5) : '-'}</div>
              <div class="record-item-main">
                <div class="record-item-name">${r.客戶名稱 || r.客戶類別 || catName}${r.附註 ? ` · ${r.附註}` : ''}</div>
                <div class="record-item-sub">${gradeText ? `等級：${gradeText}` : ''}${r.總重 ? ` | ${r.總重}斤` : ''}${r.箱數 ? `/${r.箱數}箱` : ''}</div>
                <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
                  <button class="btn-quick-toggle ${payClass}" onclick="toggleIncomePayment('${r.id}')">${r.付款狀態 === '已付款' ? '✓ 已付款' : '⚠ 未付款'}</button>
                  <button class="btn-quick-toggle ${reconClass}" onclick="toggleIncomeRecon('${r.id}')">${r.對帳狀態 === 'OK' ? '✓ OK' : '待對帳'}</button>
                </div>
              </div>
              <div class="record-item-right">
                <span class="record-item-amount ${amtClass}">${price}</span>
                ${r.盤商價 ? `<small style="color:var(--text-muted);font-size:0.68rem">盤 $${parseFloat(r.盤商價).toLocaleString()}</small>` : ''}
              </div>
            </div>`;
          
          setupSwipeLogic(item, () => openIncomeEdit(r.id), () => confirmDelete('income', r.id));
          moBody.appendChild(item);
        });

        moDiv.appendChild(moHeader);
        moDiv.appendChild(moBody);
        yrBody.appendChild(moDiv);
      });

      yrDiv.appendChild(yrHeader);
      yrDiv.appendChild(yrBody);
      body.appendChild(yrDiv);
    });

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
  });
}

// 收入付款狀態一鍵切換
window.toggleIncomePayment = async (id) => {
  const r = incomeData.find(x => x.id === id);
  if (!r) return;
  const newStatus = r.付款狀態 === '已付款' ? '未付款' : '已付款';
  const idx = incomeData.findIndex(x => x.id === id);
  const rowNum = idx + 2;
  showLoader('更新中...');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.MARKET_INCOME}!N${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newStatus]] }
    });
    r.付款狀態 = newStatus;
    renderIncomeTable();
    showToast(newStatus === '已付款' ? '✓ 已標記已付款' : '標記為未付款');
  } catch (e) { showToast('更新失敗：' + e.message, 'error'); }
  hideLoader();
};

// 收入對帳狀態一鍵切換
window.toggleIncomeRecon = async (id) => {
  const r = incomeData.find(x => x.id === id);
  if (!r) return;
  const newStatus = r.對帳狀態 === 'OK' ? '待對帳' : 'OK';
  const idx = incomeData.findIndex(x => x.id === id);
  const rowNum = idx + 2;
  showLoader('更新中...');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.MARKET_INCOME}!O${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newStatus]] }
    });
    r.對帳狀態 = newStatus;
    renderIncomeTable();
    showToast('對帳狀態已更新');
  } catch (e) { showToast('更新失敗：' + e.message, 'error'); }
  hideLoader();
};


function renderOrderChart() {
  const period = filterState.order.period;
  const data = getFilteredByPeriod(ordersData, '下定日期', period);

  const catMap = {};
  data.forEach((r, ri) => {
    const key = r.訂購品項;
    if (!catMap[key]) {
      const clr = getCategoryColor(key, Object.keys(catMap).length);
      catMap[key] = { total: 0, count: 0, pending: 0, unpaidAmount: 0, ...clr };
    }
    const price = parseFloat(r.總價) || 0;
    catMap[key].total += price;
    catMap[key].count++;
    if (r.付款狀態 !== '已付款') { catMap[key].pending++; catMap[key].unpaidAmount += price; }
  });

  let grandTotal = data.reduce((acc, r) => acc + (parseFloat(r.總價) || 0), 0);
  document.getElementById('orderTotalSummary').textContent = `總計：$${grandTotal.toLocaleString()}`;

  const entries = Object.entries(catMap).filter(([, v]) => v.count > 0);

  // 圓餅圖
  const ctx = document.getElementById('orderPieChart');
  if (ctx) {
    if (_orderPieInstance) _orderPieInstance.destroy();
    if (entries.length > 0) {
      _orderPieInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: entries.map(([n]) => n),
          datasets: [{ data: entries.map(([, v]) => v.total), backgroundColor: entries.map(([n]) => catMap[n].color), borderWidth: 2, borderColor: 'white' }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` $${c.parsed.toLocaleString()}` } } }
        }
      });
    }
  }

  // 右側圖例
  const area = document.getElementById('orderChartArea');
  if (!area) return;
  area.innerHTML = '';
  if (entries.length === 0) { area.innerHTML = '<p style="color:var(--text-xs);font-size:0.82rem;padding:0.5rem 0">該時段尚無訂單</p>'; return; }
  entries.sort((a, b) => b[1].total - a[1].total).forEach(([name, v]) => {
    const d = document.createElement('div');
    d.className = 'pie-legend-item';
    d.style.cursor = 'pointer';
    d.innerHTML = `
      <span class="pie-legend-dot" style="background:${v.color}"></span>
      <span class="pie-legend-name">${name}<span style="color:var(--text-muted);font-size:0.7rem;margin-left:4px">${v.count}筆${v.pending>0?`·⚠${v.pending}未付`:''}</span></span>
      <span class="pie-legend-val" style="color:${v.color}">$${v.total.toLocaleString()}</span>`;
    area.appendChild(d);
  });

  // 未出貨等級/數量摘要
  const unshipped = ordersData.filter(r => r.狀態 !== '已出貨');
  const unshippedSummary = document.getElementById('orderUnshippedSummary');
  if (unshippedSummary && unshipped.length > 0) {
    const gradeCount = {};
    unshipped.forEach(r => {
      const content = r.訂單內容 || '';
      const matches = content.matchAll(/([2-7]A)[：:]?\s*(\d+)/g);
      for (const m of matches) {
        if (!gradeCount[m[1]]) gradeCount[m[1]] = 0;
        gradeCount[m[1]] += parseInt(m[2]);
      }
    });
    const gradeHtml = Object.entries(gradeCount).sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([g, qty]) => `<span class="order-unshipped-item"><strong>${g}</strong>：${qty}</span>`).join('');
    unshippedSummary.innerHTML = `
      <div class="order-unshipped-title">⚠️ 未出貨 ${unshipped.length} 筆（依等級）</div>
      <div class="order-unshipped-grid">${gradeHtml || '（無等級資料）'}</div>`;
    unshippedSummary.style.display = '';
  } else if (unshippedSummary) { unshippedSummary.style.display = 'none'; }
}

function renderOrderFilterChips() {
  // 訂單篩選只有次類別（因主類別已改為區塊）
  const subContainer = document.getElementById('orderSubCatChips');
  if (!subContainer) return;
  subContainer.innerHTML = '';

  const varietyNames = settings.incomeMainCats.map(c => c.名稱).filter(n => ordersData.some(r => r.訂購品項 === n));
  const palette = ['#22c55e','#3b82f6','#a855f7','#f97316'];
  const catColors = {};
  settings.incomeMainCats.forEach((c, i) => { catColors[c.名稱] = palette[i % palette.length]; });

  // 收集所有出現的次類別
  const allSubs = [...new Set(ordersData.map(r => r.品項類別).filter(Boolean))];
  if (allSubs.length === 0) return;

  allSubs.forEach(sub => {
    const btn = document.createElement('button');
    const isActive = filterState.order.subCat === sub;
    btn.className = `filter-chip${isActive ? ' active' : ''}`;
    btn.textContent = sub;
    btn.onclick = () => {
      filterState.order.subCat = filterState.order.subCat === sub ? null : sub;
      renderOrderFilterChips();
      renderOrderTable();
    };
    subContainer.appendChild(btn);
  });
}

document.getElementById('orderClearFilter').onclick = () => {
  filterState.order.mainCat = null;
  filterState.order.subCat = null;
  renderOrderFilterChips();
  renderOrderTable();
};

document.querySelector('#orderChartCard').addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('#orderChartCard .period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterState.order.period = btn.dataset.period;
  renderOrderChart();
});

function renderOrderTable() {
  let data = [...ordersData];
  if (filterState.order.subCat) data = data.filter(r => r.品項類別 === filterState.order.subCat);

  const container = document.getElementById('orderRecordContainer');
  const empty = document.getElementById('orderEmpty');
  if (!container) return;
  container.innerHTML = '';

  if (data.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  // 依主類別（訂購品項）分區塊
  // 合併「設定中有的」與「實際資料有的」主類別，確保不遺漏
  const allPossibleCats = [...new Set([
    ...settings.incomeMainCats.map(c => c.名稱),
    ...data.map(r => r.訂購品項)
  ])].filter(n => data.some(r => r.訂購品項 === n));

  const mainCatSet = filterState.order.mainCat ? [filterState.order.mainCat] : allPossibleCats;

  mainCatSet.forEach((catName, ci) => {
    const catData = data.filter(r => r.訂購品項 === catName);
    if (catData.length === 0) return;
    
    const clr = getCategoryColor(catName, ci);
    const color = clr.color;

    const section = document.createElement('div');
    section.className = 'record-section';
    section.style.borderLeft = `4px solid ${color}`;

    const catTotal = catData.reduce((s, r) => s + (parseFloat(r.總價) || 0), 0);
    const header = document.createElement('div');
    header.className = 'record-section-header';
    header.innerHTML = `
      <div class="record-section-left">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px"></span>
        ${catName}
        <span class="record-section-count">${catData.length}筆</span>
      </div>
      <div class="record-section-right">
        <span class="record-section-total">$${catTotal.toLocaleString()}</span>
        <span class="material-symbols-outlined record-section-arrow expanded">chevron_right</span>
      </div>`;

    const body = document.createElement('div');
    body.className = 'record-section-body expanded';

    header.onclick = () => {
      const arrow = header.querySelector('.record-section-arrow');
      const isExp = body.classList.toggle('expanded');
      arrow.classList.toggle('expanded', isExp);
    };

    // 分「已出貨」和「未出貨」
    const shipped = catData.filter(r => r.狀態 === '已出貨');
    const unshipped = catData.filter(r => r.狀態 !== '已出貨');

    // --- 未出貨子區塊（預設展開）---
    if (unshipped.length > 0) {
      const unshipSection = buildOrderSubSection('未出貨', unshipped, true, false, color);
      body.appendChild(unshipSection);
    }

    // --- 已出貨子區塊（預設折疊）---
    if (shipped.length > 0) {
      const shipSection = buildOrderSubSection('已出貨', shipped, false, true, '#94a3b8');
      body.appendChild(shipSection);
    }

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
  });
}

function buildOrderSubSection(label, records, defaultExpanded, isShipped, color) {
  const wrap = document.createElement('div');
  wrap.className = 'record-subsection';

  const total = records.reduce((s, r) => s + (parseFloat(r.總價) || 0), 0);
  const h = document.createElement('div');
  h.className = 'record-subsection-header';
  h.innerHTML = `
    <span style="color:${isShipped?'var(--text-muted)':'var(--orange)'}">
      ${isShipped ? '📦 已出貨' : '⏳ 未出貨'}
      <span class="record-section-count">${records.length}筆</span>
    </span>
    <span style="font-weight:600">$${total.toLocaleString()}</span>`;

  const b = document.createElement('div');
  b.className = `record-subsection-body${defaultExpanded ? ' expanded' : ''}`;

  h.onclick = () => b.classList.toggle('expanded');

  if (isShipped) {
    // 已出貨：依年-月-日期，預設折疊
    const yearMap = {};
    records.forEach(r => {
      const dateKey = r.到貨日期 || r.下定日期 || '';
      const yr = dateKey.substring(0,4) || '未知';
      const mo = dateKey.substring(0,7) || '未知';
      if (!yearMap[yr]) yearMap[yr] = {};
      if (!yearMap[yr][mo]) yearMap[yr][mo] = [];
      yearMap[yr][mo].push(r);
    });
    Object.keys(yearMap).sort((a,b) => b.localeCompare(a)).forEach(yr => {
      const yrDiv = document.createElement('div');
      const yrH = document.createElement('div');
      yrH.className = 'record-year-header';
      const yrTotal = Object.values(yearMap[yr]).flat().reduce((s,r) => s+(parseFloat(r.總價)||0), 0);
      yrH.innerHTML = `<span>📅 ${yr} 年</span><span>$${yrTotal.toLocaleString()}</span>`;
      const yrB = document.createElement('div');
      yrB.className = 'record-year-body'; // 預設折疊
      yrH.onclick = () => yrB.classList.toggle('expanded');
      Object.keys(yearMap[yr]).sort((a,b) => b.localeCompare(a)).forEach(mo => {
        const moList = yearMap[yr][mo];
        const moDiv = document.createElement('div');
        const moH = document.createElement('div');
        moH.className = 'record-month-header';
        const moTotal = moList.reduce((s,r) => s+(parseFloat(r.總價)||0),0);
        moH.innerHTML = `<span>${mo.substring(5,7)} 月 <span class="record-section-count">${moList.length}筆</span></span><span>$${moTotal.toLocaleString()}</span>`;
        const moB = document.createElement('div');
        moB.className = 'record-month-body'; // 預設折疊
        moH.onclick = () => moB.classList.toggle('expanded');
        moList.forEach(r => moB.appendChild(buildOrderItem(r)));
        moDiv.appendChild(moH);
        moDiv.appendChild(moB);
        yrB.appendChild(moDiv);
      });
      yrDiv.appendChild(yrH);
      yrDiv.appendChild(yrB);
      b.appendChild(yrDiv);
    });
  } else {
    // 未出貨：先分「未指定」/「預定出貨」，再依年月
    const unspecified = records.filter(r => r.狀態 === '未指定');
    const scheduled = records.filter(r => r.狀態 === '預定出貨' || r.狀態 === '已指定');

    if (unspecified.length > 0) {
      const uH = document.createElement('div');
      uH.className = 'record-year-header';
      uH.innerHTML = `<span style="color:var(--text-muted)">📋 未指定出貨日期</span><span class="record-section-count">${unspecified.length}筆</span>`;
      const uB = document.createElement('div');
      uB.className = 'record-year-body expanded';
      uH.onclick = () => uB.classList.toggle('expanded');
      unspecified.sort((a,b) => new Date(b.下定日期||0) - new Date(a.下定日期||0)).forEach(r => uB.appendChild(buildOrderItem(r)));
      b.appendChild(uH);
      b.appendChild(uB);
    }
    if (scheduled.length > 0) {
      const sH = document.createElement('div');
      sH.className = 'record-year-header';
      sH.innerHTML = `<span style="color:var(--blue)">📅 預定出貨</span><span class="record-section-count">${scheduled.length}筆</span>`;
      const sB = document.createElement('div');
      sB.className = 'record-year-body expanded';
      sH.onclick = () => sB.classList.toggle('expanded');
      scheduled.sort((a,b) => new Date(a.到貨日期||a.下定日期||0) - new Date(b.到貨日期||b.下定日期||0)).forEach(r => sB.appendChild(buildOrderItem(r)));
      b.appendChild(sH);
      b.appendChild(sB);
    }
  }

  wrap.appendChild(h);
  wrap.appendChild(b);
  return wrap;
}

function buildOrderItem(r) {
  const payClass = r.付款狀態 === '已付款' ? 'paid' : 'unpaid';
  const reconClass = r.對帳狀態 === 'OK' ? 'ok-recon' : 'pending-recon';
  const isShipped = r.狀態 === '已出貨';
  const dateDisplay = r.到貨日期 ? `到 ${r.到貨日期.substring(5)}` : `訂 ${(r.下定日期||'').substring(5)}`;

  // 訂單狀態切換
  const statusToggle = !isShipped
    ? `<button class="btn-quick-toggle" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe" onclick="cycleOrderStatus('${r.id}')">${r.狀態}</button>`
    : `<span class="status-badge paid" style="font-size:0.68rem">已出貨</span>`;

  const item = document.createElement('div');
  item.className = 'record-item';
  const priceVal = parseFloat(r.總價 || 0);
  const amtClass = getAmountClass(priceVal);

  item.innerHTML = `
    <div class="record-item-content">
      <div class="record-item-date">${dateDisplay}</div>
      <div class="record-item-main">
        <div class="record-item-name">${r.寄件人 || '未知客戶'}${r.品項類別 ? ` · ${r.品項類別}` : ''}</div>
        <div class="record-item-sub">${r.訂購等級 || ''}${r.訂單內容 ? ` | ${r.訂單內容}` : ''}${r.取貨方式 ? ` | ${r.取貨方式}` : ''}</div>
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
          ${statusToggle}
          <button class="btn-quick-toggle ${payClass}" onclick="toggleOrderPayment('${r.id}')">${r.付款狀態 === '已付款' ? '✓ 已付款' : '⚠ 未付款'}</button>
          <button class="btn-quick-toggle ${reconClass}" onclick="toggleOrderRecon('${r.id}')">${r.對帳狀態 === 'OK' ? '✓ OK' : '待對帳'}</button>
        </div>
      </div>
      <div class="record-item-right">
        <span class="record-item-amount ${amtClass}">$${priceVal.toLocaleString()}</span>
      </div>
    </div>`;
  
  setupSwipeLogic(item, () => openOrderEdit(r.id), () => confirmDelete('order', r.id));
  return item;
}

window.cycleOrderStatus = async (id) => {
  const r = ordersData.find(o => o.id === id);
  if (!r) return;
  const cycle = ['未指定', '預定出貨', '已指定', '已出貨'];
  const idx = cycle.indexOf(r.狀態);
  const newStatus = cycle[(idx + 1) % cycle.length];
  await updateOrderStatus(id, newStatus);
};

window.toggleOrderPayment = async (id) => {
  const r = ordersData.find(x => x.id === id);
  if (!r) return;
  const newStatus = r.付款狀態 === '已付款' ? '未付款' : '已付款';
  const rowNum = r._localIdx;
  showLoader('更新中...');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${SHEET.ORDERS}!Q${rowNum}`,
      valueInputOption: 'USER_ENTERED', resource: { values: [[newStatus]] }
    });
    r.付款狀態 = newStatus;
    renderOrderTable();
    showToast(newStatus === '已付款' ? '✓ 已付款' : '⚠ 未付款');
  } catch (e) { showToast('更新失敗：' + e.message, 'error'); }
  hideLoader();
};

window.toggleOrderRecon = async (id) => {
  const r = ordersData.find(x => x.id === id);
  if (!r) return;
  if (r.付款狀態 !== '已付款') { showToast('請先確認付款狀態', 'warning'); return; }
  const newStatus = r.對帳狀態 === 'OK' ? '待對帳' : 'OK';
  const rowNum = r._localIdx;
  showLoader('更新中...');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${SHEET.ORDERS}!R${rowNum}`,
      valueInputOption: 'USER_ENTERED', resource: { values: [[newStatus]] }
    });
    r.對帳狀態 = newStatus;
    renderOrderTable();
    showToast('對帳狀態已更新');
  } catch (e) { showToast('更新失敗：' + e.message, 'error'); }
  hideLoader();
};

window.toggleTableGroup = function(groupId) {
  document.querySelectorAll(`.${groupId}`).forEach(el => {
    el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
  });
};

async function updateOrderStatus(orderId, newStatus) {
  const idx = ordersData.findIndex(o => o.id === orderId);
  if (idx === -1) return;
  ordersData[idx].狀態 = newStatus;
  renderOrderTable();
  const rowNum = ordersData[idx]._localIdx;
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.ORDERS}!C${rowNum}:C${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newStatus]] }
    });
    showToast('訂單狀態更新成功', 'success');
  } catch (e) {
    showToast('更新訂單狀態失敗', 'error');
  }
}


// ============================================================
// 10. 收入表單 Modal
// ============================================================
document.getElementById('openIncomeFormBtn').onclick = () => openIncomeModal();
document.getElementById('openOrderFormBtn').onclick = () => openOrderModal();
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

  // 新欄位回填
  if (document.getElementById('incomeCustomerType')) {
    document.getElementById('incomeCustomerType').value = isEdit ? (record.客戶類別 || '一般') : '一般';
  }
  if (document.getElementById('incomeCustomerName')) {
    document.getElementById('incomeCustomerName').value = isEdit ? (record.客戶名稱 || '') : '';
  }
  if (document.getElementById('incomePaymentStatus')) {
    document.getElementById('incomePaymentStatus').value = isEdit ? (record.付款狀態 || '未付款') : '未付款';
  }
  if (document.getElementById('incomeReconStatus')) {
    document.getElementById('incomeReconStatus').value = isEdit ? (record.對帳狀態 || '待對帳') : '待對帳';
  }

  // 填充主類別
  const sel = document.getElementById('incomeMainCat');
  sel.innerHTML = settings.incomeMainCats.map(c => `<option value="${c.名稱}">${c.名稱}</option>`).join('');
  sel.value = isEdit ? record.主類別 : settings.incomeMainCats[0]?.名稱;
  onIncomeMainCatChange();

  if (isEdit && record.次類別) {
    document.getElementById('incomeOtherNote').value = record.次類別;
  } else if (isEdit && record.其他備註) {
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
    document.getElementById('incomeCustomerType') ? document.getElementById('incomeCustomerType').value : '一般',
    document.getElementById('incomeCustomerName') ? document.getElementById('incomeCustomerName').value : '',
    mainCat,
    mainCat === '其他' ? document.getElementById('incomeOtherNote').value : (document.getElementById('incomeOtherNote').value || ''),
    JSON.stringify(gradeData),
    totalWeight || '',
    totalBoxes || '',
    document.getElementById('incomeTotalPrice').value,
    document.getElementById('incomeDealerPrice').value,
    document.getElementById('incomeShippingFee').value,
    document.getElementById('incomeNotes').value,
    document.getElementById('incomePaymentStatus') ? document.getElementById('incomePaymentStatus').value : '未付款',
    document.getElementById('incomeReconStatus') ? document.getElementById('incomeReconStatus').value : '待對帳',
    isEdit ? (incomeData.find(r => r.id === id)?.建立時間 || now()) : now(),
    now(),
    ''
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
        range: `${SHEET.MARKET_INCOME}!A${rowIdx}:R${rowIdx}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
    } else {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.MARKET_INCOME}!A:R`,
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
let _expensePieInstance = null;

function renderExpenseChart() {
  const period = filterState.expense.period;
  const data = getFilteredByPeriod(expenseData, '日期', period);

  let grandTotal = 0;
  data.forEach(r => grandTotal += calcExpenseTotal(r));
  document.getElementById('expenseTotalSummary').textContent = `總計：$${grandTotal.toLocaleString()}`;

  // 主類別統計
  const mainCatMap = {};
  data.forEach(r => {
    if (!mainCatMap[r.主類別]) {
      const clr = getCategoryColor(r.主類別, Object.keys(mainCatMap).length);
      mainCatMap[r.主類別] = { total: 0, count: 0, unpaid: 0, ...clr };
    }
    const amt = calcExpenseTotal(r);
    mainCatMap[r.主類別].total += amt;
    mainCatMap[r.主類別].count++;
    if (!r.已支付) mainCatMap[r.主類別].unpaid += amt;
  });

  const entries = Object.entries(mainCatMap).filter(([, v]) => v.count > 0);

  // 圓餅圖
  const ctx = document.getElementById('expensePieChart');
  if (ctx) {
    if (_expensePieInstance) _expensePieInstance.destroy();
    if (entries.length > 0) {
      _expensePieInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: entries.map(([n]) => n),
          datasets: [{ data: entries.map(([, v]) => v.total), backgroundColor: entries.map(([n]) => mainCatMap[n]?.color || '#64748b'), borderWidth: 2, borderColor: 'white' }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` $${c.parsed.toLocaleString()}` } } }
        }
      });
    }
  }

  // 圖例
  const legend = document.getElementById('expensePieLegend');
  if (legend) {
    legend.innerHTML = '';
    entries.sort((a,b) => b[1].total - a[1].total).forEach(([name, v]) => {
      const color = mainCatMap[name]?.color || '#64748b';
      const d = document.createElement('div');
      d.className = 'pie-legend-item';
      d.style.cursor = 'pointer';
      d.innerHTML = `
        <span class="pie-legend-dot" style="background:${color}"></span>
        <span class="pie-legend-name">${name}<span style="color:var(--text-muted);font-size:0.7rem;margin-left:4px">${v.count}筆${v.unpaid>0?`·⚠️未付`:''}</span></span>
        <span class="pie-legend-val" style="color:${color}">$${v.total.toLocaleString()}</span>`;
      d.onclick = () => {
        filterState.expense.mainCat = filterState.expense.mainCat === name ? null : name;
        filterState.expense.subCat = null;
        renderExpenseFilterChips();
        renderExpenseTable();
      };
      legend.appendChild(d);
    });
  }
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
  if (!container) return;
  container.innerHTML = '';
  if (!filterState.expense.mainCat) return;

  const subCats = settings.expenseMainCats.find(c => c.名稱 === filterState.expense.mainCat)?.次類別 || [];
  subCats.forEach(sub => {
    const btn = document.createElement('button');
    const isActive = filterState.expense.subCat === sub;
    btn.className = `filter-chip${isActive ? ' active' : ''}`;
    btn.textContent = sub;
    btn.onclick = () => {
      filterState.expense.subCat = filterState.expense.subCat === sub ? null : sub;
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

// --- 表格（折疊式卡片版） ---
function renderExpenseTable() {
  let data = [...expenseData];
  if (filterState.expense.mainCat) data = data.filter(r => r.主類別 === filterState.expense.mainCat);
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

  const container = document.getElementById('expenseRecordContainer');
  const empty = document.getElementById('expenseEmpty');
  if (!container) return;
  container.innerHTML = '';

  if (data.length === 0) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const palette = ['#ef4444','#f97316','#8b5cf6','#3b82f6','#06b6d4','#64748b'];
  const catColors = {};
  settings.expenseMainCats.forEach((c, i) => { catColors[c.名稱] = palette[i % palette.length]; });

  // 依主類別分區塊
  const mainCatSet = filterState.expense.mainCat
    ? [filterState.expense.mainCat]
    : [...new Set(settings.expenseMainCats.map(c => c.名稱))].filter(n => data.some(r => r.主類別 === n));

  mainCatSet.forEach((catName, ci) => {
    const catData = data.filter(r => r.主類別 === catName);
    if (catData.length === 0) return;
    const color = catColors[catName] || palette[ci % palette.length];
    const catTotal = catData.reduce((s, r) => s + calcExpenseTotal(r), 0);

    const section = document.createElement('div');
    section.className = 'record-section';
    section.style.borderLeft = `4px solid ${color}`;

    const header = document.createElement('div');
    header.className = 'record-section-header';
    header.innerHTML = `
      <div class="record-section-left">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px"></span>
        ${catName}
        <span class="record-section-count">${catData.length}筆</span>
      </div>
      <div class="record-section-right">
        <span class="record-section-total expense">$${catTotal.toLocaleString()}</span>
        <span class="material-symbols-outlined record-section-arrow expanded">chevron_right</span>
      </div>`;

    const body = document.createElement('div');
    body.className = 'record-section-body expanded';

    header.onclick = () => {
      const arrow = header.querySelector('.record-section-arrow');
      const isExp = body.classList.toggle('expanded');
      arrow.classList.toggle('expanded', isExp);
    };

    // 依年-月分組
    const yearMap = {};
    catData.forEach(r => {
      const yr = r.日期 ? r.日期.substring(0, 4) : '未知';
      const mo = r.日期 ? r.日期.substring(0, 7) : '未知';
      if (!yearMap[yr]) yearMap[yr] = {};
      if (!yearMap[yr][mo]) yearMap[yr][mo] = [];
      yearMap[yr][mo].push(r);
    });

    Object.keys(yearMap).sort((a, b) => b.localeCompare(a)).forEach(yr => {
      const yrH = document.createElement('div');
      yrH.className = 'record-year-header';
      const yrTotal = Object.values(yearMap[yr]).flat().reduce((s, r) => s + calcExpenseTotal(r), 0);
      yrH.innerHTML = `<span>📅 ${yr} 年</span><span style="font-weight:600;color:${color}">$${yrTotal.toLocaleString()}</span>`;
      const yrB = document.createElement('div');
      yrB.className = 'record-year-body expanded';
      yrH.onclick = () => yrB.classList.toggle('expanded');

      Object.keys(yearMap[yr]).sort((a, b) => b.localeCompare(a)).forEach(mo => {
        const moList = yearMap[yr][mo];
        const moH = document.createElement('div');
        moH.className = 'record-month-header';
        const moTotal = moList.reduce((s, r) => s + calcExpenseTotal(r), 0);
        moH.innerHTML = `<span>${mo.substring(5, 7)} 月 <span class="record-section-count">${moList.length}筆</span></span><span>$${moTotal.toLocaleString()}</span>`;
        const moB = document.createElement('div');
        moB.className = 'record-month-body expanded';
        moH.onclick = () => moB.classList.toggle('expanded');

        moList.forEach(r => {
          const total = calcExpenseTotal(r);
          const payClass = r.已支付 ? 'paid' : 'unpaid';

          const item = document.createElement('div');
          item.className = 'record-item';
          item.innerHTML = `
            <div class="record-item-content">
              <div class="record-item-date">${r.日期 ? r.日期.substring(5) : '-'}</div>
              <div class="record-item-main">
                <div class="record-item-name">${r.次類別 || catName}${r.工人姓名 ? ` · ${r.工人姓名}` : ''}</div>
                <div class="record-item-sub">${r.數量 ? r.數量 + (r.單位 || '') : ''}${r.單價 ? ` × $${parseFloat(r.單價).toLocaleString()}` : ''}${r.附註 ? ` | ${r.附註}` : ''}</div>
                <div style="margin-top:4px">
                  <button class="btn-quick-toggle ${payClass}" onclick="togglePaid('${r.id}')">${r.已支付 ? '✓ 已支付' : '⚠ 未支付'}</button>
                </div>
              </div>
              <div class="record-item-right">
                <span class="record-item-amount expense ${getAmountClass(total)}">$${total.toLocaleString()}</span>
              </div>
            </div>`;
          
          setupSwipeLogic(item, () => openExpenseEdit(r.id), () => confirmDelete('expense', r.id));
          moB.appendChild(item);
        });

        const moDiv = document.createElement('div');
        moDiv.appendChild(moH);
        moDiv.appendChild(moB);
        yrB.appendChild(moDiv);
      });

      body.appendChild(yrH);
      body.appendChild(yrB);
    });

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
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
// 12. 訂單表單 Modal & 邏輯
// ============================================================
document.getElementById('openOrderFormBtn').onclick = () => openOrderModal();
document.getElementById('closeOrderModal').onclick = closeOrderModal;
document.getElementById('cancelOrderBtn').onclick = closeOrderModal;

function openOrderModal(recordId = null) {
  document.getElementById('orderForm').reset();
  document.getElementById('orderRecordId').value = recordId || '';
  document.getElementById('orderModalTitle').textContent = recordId ? '編輯訂單' : '新增訂單';
  
  // 填充下拉
  const catSel = document.getElementById('orderMainCat');
  catSel.innerHTML = '<option value="">--請選擇--</option>';
  [...new Set(settings.retailPrices.map(r => r.品種主類別))].filter(Boolean).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    catSel.appendChild(opt);
  });
  
  // 填充客源 datalist
  const cDataList = document.getElementById('customerList');
  cDataList.innerHTML = '';
  // 客戶可以藉由寄件人匹配
  let uniqueSenders = [...new Set(customersData.map(c => c.客戶姓名 || c.寄件人))].filter(Boolean);
  uniqueSenders.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    cDataList.appendChild(opt);
  });

  if (recordId) {
    const r = ordersData.find(x => x.id === recordId);
    if(r) {
      document.getElementById('orderDate').value = r.下定日期;
      document.getElementById('orderArrivalDate').value = r.到貨日期;
      document.getElementById('orderMainCat').value = r.訂購品項;
      triggerOrderMainCatChange();
      document.getElementById('orderSubCat').value = r.品項類別;
      triggerOrderGradeChange(); 
      document.getElementById('orderGrade').value = r.訂購等級;
      const q = r.訂單內容.match(/\d+/);
      if(q) document.getElementById('orderQuantity').value = q[0];
      const u = r.訂單內容.replace(/[0-9]/g, '');
      if(u) document.getElementById('orderUnit').value = u;

      document.getElementById('orderSenderName').value = r.寄件人;
      document.getElementById('orderSenderPhone').value = r.寄件人電話;
      document.getElementById('orderReceiverName').value = r.收件人;
      document.getElementById('orderReceiverPhone').value = r.收件人電話;
      document.getElementById('orderReceiverAddress').value = r.收件人地址;
      document.getElementById('orderNeedSenderRemark').checked = r.需備註寄件人;
      document.getElementById('orderDeliveryType').value = r.取貨方式;
      if (document.getElementById('orderStatus')) document.getElementById('orderStatus').value = r.狀態;
      document.getElementById('orderTotalPrice').value = r.總價;
      if (document.getElementById('orderPaymentStatus')) document.getElementById('orderPaymentStatus').value = r.付款狀態 || '未付款';
      if (document.getElementById('orderReconStatus')) document.getElementById('orderReconStatus').value = r.對帳狀態 || '待對帳';
    }
  } else {
    document.getElementById('orderDate').value = today();
    if (document.getElementById('orderStatus')) document.getElementById('orderStatus').value = '未指定';
    if (document.getElementById('orderPaymentStatus')) document.getElementById('orderPaymentStatus').value = '未付款';
    if (document.getElementById('orderReconStatus')) document.getElementById('orderReconStatus').value = '待對帳';
  }
  
  document.getElementById('orderModal').style.display = 'flex';
}

function closeOrderModal() { document.getElementById('orderModal').style.display = 'none'; }

document.getElementById('orderMainCat').addEventListener('change', triggerOrderMainCatChange);
document.getElementById('orderSubCat').addEventListener('change', triggerOrderGradeChange);

function triggerOrderMainCatChange() {
  const main = document.getElementById('orderMainCat').value;
  const subSel = document.getElementById('orderSubCat');
  subSel.innerHTML = '<option value="">--請選擇--</option>';
  const subs = [...new Set(settings.retailPrices.filter(r => r.品種主類別 === main).map(r => r.品種次類別))].filter(Boolean);
  subs.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    subSel.appendChild(opt);
  });
  triggerOrderGradeChange();
}

function triggerOrderGradeChange() {
  const main = document.getElementById('orderMainCat').value;
  const sub = document.getElementById('orderSubCat').value;
  const gradeSel = document.getElementById('orderGrade');
  gradeSel.innerHTML = '<option value="">--無等級--</option>';
  
  const options = settings.retailPrices.filter(r => r.品種主類別 === main && (sub === '' || r.品種次類別 === sub));
  const grades = [...new Set(options.map(r => r.等級))].filter(Boolean);
  grades.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    gradeSel.appendChild(opt);
  });
  
  // 嘗試填入單位 (如果只有一種)
  const units = [...new Set(options.map(r => r.單位))].filter(Boolean);
  if(units.length === 1) document.getElementById('orderUnit').value = units[0];
  calculateOrderPrice();
}

['orderMainCat', 'orderSubCat', 'orderGrade', 'orderQuantity'].forEach(id => {
  document.getElementById(id).addEventListener('input', calculateOrderPrice);
});

function calculateOrderPrice() {
  const main = document.getElementById('orderMainCat').value;
  const sub = document.getElementById('orderSubCat').value;
  const grade = document.getElementById('orderGrade').value;
  const qtyStr = document.getElementById('orderQuantity').value;
  const qty = parseFloat(qtyStr);
  
  if(!main || !qty || isNaN(qty)) return;

  const match = settings.retailPrices.find(r => r.品種主類別 === main && r.品種次類別 === sub && r.等級 === grade);
  if (match && match.售價) {
    const unitPrice = parseFloat(match.售價);
    document.getElementById('orderTotalPrice').value = unitPrice * qty;
    if(match.單位) document.getElementById('orderUnit').value = match.單位;
    // 顯示販售內容提示（如果 input hint 存在）
    const hint = document.querySelector('#orderTotalPrice + .field-hint, #orderTotalPrice ~ .field-hint');
    if (!hint) {
      const h = document.createElement('small');
      h.className = 'field-hint price-hint';
      h.style.cssText = 'color:var(--green-dark);margin-top:2px;display:block';
      document.getElementById('orderTotalPrice').parentElement.appendChild(h);
    }
    const hintEl = document.querySelector('.price-hint');
    if (hintEl) hintEl.textContent = match.販售內容 ? `該等級內容：${match.販售內容}，單價 $${match.售價}/箱` : '';
  }
}

document.getElementById('orderSenderName').addEventListener('input', (e) => {
  const val = e.target.value.trim();
  const cus = customersData.find(c => c.寄件人 === val);
  if (cus) {
    document.getElementById('orderSenderPhone').value = cus.寄件人電話 || '';
  }
});

document.getElementById('orderSameAsSender').addEventListener('change', (e) => {
  if(e.target.checked) {
    document.getElementById('orderReceiverName').value = document.getElementById('orderSenderName').value;
    document.getElementById('orderReceiverPhone').value = document.getElementById('orderSenderPhone').value;
  }
});

// 黑貓到貨日防呆：不允許選擇禮拜日與禮拜一
document.getElementById('orderDeliveryType').addEventListener('change', (e) => {
  if (e.target.value === '黑貓宅配') {
    checkBlackCatDate();
  }
});
document.getElementById('orderArrivalDate').addEventListener('change', checkBlackCatDate);

function checkBlackCatDate() {
  const dt = document.getElementById('orderDeliveryType').value;
  const arr = document.getElementById('orderArrivalDate').value;
  if (dt === '黑貓宅配' && arr) {
    const d = new Date(arr).getDay();
    if (d === 0 || d === 1) {
      showToast('⚠️ 黑貓宅配於週日/週一無法配送到貨，請重新選擇到貨日！', 'warning');
      document.getElementById('orderArrivalDate').value = '';
    }
  }
}

// 儲存訂單
document.getElementById('orderForm').onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById('orderRecordId').value;
  const isEdit = !!id;

  const sender = document.getElementById('orderSenderName').value.trim();
  const receiver = document.getElementById('orderReceiverName').value.trim();
  
  const orderRow = [
    document.getElementById('orderMainCat').value,
    document.getElementById('orderSubCat').value,
    document.getElementById('orderStatus') ? document.getElementById('orderStatus').value : '未指定',
    document.getElementById('orderDate').value,
    document.getElementById('orderArrivalDate').value,
    document.getElementById('orderGrade').value,
    document.getElementById('orderQuantity').value + (document.getElementById('orderUnit').value || '箱'),
    document.getElementById('orderTotalPrice').value || '',
    isEdit ? (ordersData.find(x => x.id === id)?.客戶編號 || '') : '',
    sender,
    document.getElementById('orderSenderPhone').value,
    receiver,
    document.getElementById('orderReceiverPhone').value,
    document.getElementById('orderReceiverAddress').value,
    document.getElementById('orderNeedSenderRemark').checked ? 'TRUE' : 'FALSE',
    document.getElementById('orderDeliveryType').value,
    document.getElementById('orderPaymentStatus') ? document.getElementById('orderPaymentStatus').value : '未付款',
    document.getElementById('orderReconStatus') ? document.getElementById('orderReconStatus').value : '待對帳',
    ''
  ];

  showLoader(isEdit ? '更新中...' : '儲存中...');
  try {
    if (isEdit) {
      const idx = ordersData.findIndex(x => x.id === id);
      const rowNum = ordersData[idx]._localIdx;
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.ORDERS}!A${rowNum}:S${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [orderRow] }
      });
    } else {
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.ORDERS}!A:S`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [orderRow] }
      });
      
      // 自動新增客戶若不存在
      const cusExist = customersData.some(c => c.寄件人 === sender || c.客戶姓名 === sender);
      if (!cusExist) {
        const cusRow = [
          `CUS_${Date.now()}`, sender, document.getElementById('orderSenderPhone').value, '',
          '系統新增', '自動', ''
        ];
        await gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET.CUSTOMERS}!A:G`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [cusRow] }
        });
        showToast('已自動新增至客戶資料', 'success');
      }
    }

    await fetchCustomers();
    await fetchOrders();
    renderOrderTable();
    closeOrderModal();
    showToast('訂單已儲存', 'success');
  } catch (err) {
    console.error(err);
    showToast('儲存失敗', 'error');
  }
  hideLoader();
};

window.openOrderEdit = (id) => openOrderModal(id);

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
    const subs = (c.次類別 || []);
    if (subs.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.名稱}</strong></td>
        <td>—</td>
        <td><div class="table-actions">
          <button class="btn-table-del" onclick="deleteIncomeMainCat(${i})" title="刪除"><span class="material-symbols-outlined">delete</span></button>
        </div></td>`;
      tbody.appendChild(tr);
    } else {
      subs.forEach((sub, si) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${si === 0 ? `<strong>${c.名稱}</strong>` : ''}</td>
          <td><span class="badge-sub">${sub}</span></td>
          <td>${si === 0 ? `<div class="table-actions"><button class="btn-table-del" onclick="deleteIncomeMainCat(${i})" title="刪除"><span class="material-symbols-outlined">delete</span></button></div>` : ''}</td>`;
        tbody.appendChild(tr);
      });
    }
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
          ${si === 0 ? `<button class="btn-table-edit" onclick="editExpenseCat(${ci})" title="編輯主類別"><span class="material-symbols-outlined">edit</span></button>` : ''}
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
           <button class="btn-table-edit" onclick="editExpenseCat(${ci})" title="編輯主類別"><span class="material-symbols-outlined">edit</span></button>
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
        <button class="btn-table-edit" onclick="editWorker(${i})" title="編輯"><span class="material-symbols-outlined">edit</span></button>
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
      // 判斷是新增還是編輯, 簡單起見這裡採先更新 local array 再 rebuild
      const existing = settings.workers.find(w => w.姓名 === name);
      if (existing) {
        existing.預設時薪 = hourly;
        existing.預設日薪 = daily;
      } else {
        settings.workers.push({ 姓名: name, 預設時薪: hourly, 預設日薪: daily });
      }
      await rebuildAndSaveSettings('workers');
      renderWorkerListAdmin();
    } else if (type === 'incomeMainCat') {
      const name = document.getElementById('aim_name').value.trim();
      if (!name) { showToast('請填寫名稱', 'error'); hideLoader(); return; }
      const existing = settings.incomeMainCats.find(c => c.名稱 === name);
      if(!existing){
        settings.incomeMainCats.push({ 名稱: name, 次類別:[], 等級:[] });
        await rebuildAndSaveSettings('incomeCats');
      }
      renderIncomeMainCatAdmin();
      renderIncomeFilterChips();
    } else if (type === 'expenseMainCat') {
      const name = document.getElementById('aem_name').value.trim();
      const catType = document.getElementById('aem_type').value;
      const subText = document.getElementById('aem_sub').value;
      if (!name) { showToast('請填寫名稱', 'error'); hideLoader(); return; }
      
      const subs = subText.split('\n').map(s => s.trim()).filter(Boolean).map(s => ({ 名稱: s, 預設金額: '' }));
      
      const existing = settings.expenseMainCats.find(c => c.名稱 === name);
      if(existing) {
         existing.類型 = catType;
         existing.次類別 = subs; // 覆蓋次類別
      } else {
         settings.expenseMainCats.push({ 名稱: name, 類型: catType, 次類別: subs });
      }
      await rebuildAndSaveSettings('expenseCats');
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

window.editWorker = function(idx) {
  const w = settings.workers[idx];
  openAdminModal('worker', null, [
    { id: 'aw_name', label: '姓名 * (不可改名)', type: 'text' },
    { id: 'aw_hourly', label: '預設時薪', type: 'number', placeholder: '190' },
    { id: 'aw_daily', label: '預設日薪', type: 'number', placeholder: '1500' },
  ]);
  document.getElementById('aw_name').value = w.姓名;
  document.getElementById('aw_name').readOnly = true;
  document.getElementById('aw_hourly').value = w.預設時薪;
  document.getElementById('aw_daily').value = w.預設日薪;
};

window.editExpenseCat = function(idx) {
  const c = settings.expenseMainCats[idx];
  openAdminModal('expenseMainCat', null, [
    { id: 'aem_name', label: '主類別名稱 *', type: 'text' },
    { id: 'aem_type', label: '類型 *', type: 'select', options: [
      { val: 'material', label: '材料/農藥' },
      { val: 'worker', label: '工人薪資' },
      { val: 'meal', label: '伙食' },
    ]},
    { id: 'aem_sub', label: '次類別（每行一個）', type: 'textarea', placeholder: '骨粉\n海鳥糞' },
  ]);
  document.getElementById('aem_name').value = c.名稱;
  document.getElementById('aem_name').readOnly = true;
  document.getElementById('aem_type').value = c.類型;
  document.getElementById('aem_sub').value = c.次類別.map(s => s.名稱).join('\n');
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
    rebuildAndSaveSettings('workers');
    renderWorkerListAdmin();
  });
};
window.deleteIncomeMainCat = function(idx) {
  confirmAdminDelete(() => {
    settings.incomeMainCats.splice(idx, 1);
    rebuildAndSaveSettings('incomeCats');
    renderIncomeMainCatAdmin();
    renderIncomeFilterChips();
  });
};
window.deleteExpenseMainCat = function(catIdx) {
  confirmAdminDelete(() => {
    settings.expenseMainCats.splice(catIdx, 1);
    rebuildAndSaveSettings('expenseCats');
    renderExpenseMainCatAdmin();
    renderExpenseSubCatChips();
    renderExpenseTable();
  });
};
window.deleteExpenseSubCat = function(catIdx, subIdx) {
  confirmAdminDelete(() => {
    settings.expenseMainCats[catIdx].次類別.splice(subIdx, 1);
    rebuildAndSaveSettings('expenseCats');
    renderExpenseMainCatAdmin();
  });
};

// 系統初始化按鈕
document.getElementById('initSystemBtn').onclick = async () => {
  if (!confirm('將把預設類別與範例工人資料寫入試算表，是否確定？')) return;
  
  showLoader('系統初始化中...');
  try {
    await clearSheet(SHEET.INCOME_CATS);
    for (const name of DEFAULT_INCOME_CATS) {
      await appendToSheet(SHEET.INCOME_CATS, [name, '', '', '', '']);
    }
    
    await clearSheet(SHEET.EXPENSE_CATS);
    for (const c of DEFAULT_EXPENSE_CATS) {
      if(c.次類別.length === 0) {
        await appendToSheet(SHEET.EXPENSE_CATS, [c.名稱, '', c.類型, '']);
      } else {
        for (const sub of c.次類別) {
          await appendToSheet(SHEET.EXPENSE_CATS, [c.名稱, sub.名稱, c.類型, sub.預設金額]);
        }
      }
    }
    
    await clearSheet(SHEET.WORKERS);
    const demoWorkers = [
      { 姓名: '阿明', 預設時薪: '190', 預設日薪: '1500' },
      { 姓名: '小華', 預設時薪: '190', 預設日薪: '1500' }
    ];
    for (const w of demoWorkers) {
      await appendToSheet(SHEET.WORKERS, [w.姓名, w.預設時薪, w.預設日薪]);
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
      await clearSheet(SHEET.USERS);
      for (const u of usersData) {
        await appendToSheet(SHEET.USERS, [u.email, u.role, now()]);
      }
    } else if (target === 'workers') {
      await clearSheet(SHEET.WORKERS);
      for (const w of settings.workers) {
        await appendToSheet(SHEET.WORKERS, [w.姓名, w.預設時薪, w.預設日薪]);
      }
    } else if (target === 'incomeCats') {
      await clearSheet(SHEET.INCOME_CATS);
      for (const c of settings.incomeMainCats) {
        await appendToSheet(SHEET.INCOME_CATS, [c.名稱, '', (c.次類別||[]).join(','), '', (c.等級||[]).join(',')]);
      }
    } else if (target === 'expenseCats') {
      await clearSheet(SHEET.EXPENSE_CATS);
      for (const c of settings.expenseMainCats) {
        if(c.次類別.length === 0) {
           await appendToSheet(SHEET.EXPENSE_CATS, [c.名稱, '', c.類型, '']);
        } else {
           for (const sub of c.次類別) {
             await appendToSheet(SHEET.EXPENSE_CATS, [c.名稱, sub.名稱, c.類型, sub.預設金額]);
           }
        }
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

// --- 工具類結束 ---

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

// ============================================================
// 16. 結餘分頁邏輯
// ============================================================
let balanceChartInstance = null;
let currentBalancePeriod = 'all';

document.querySelectorAll('#page-balance .period-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('#page-balance .period-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentBalancePeriod = e.target.dataset.period;
    renderBalancePage();
  });
});

function renderBalancePage() {
  // 1. 取得過濾後的資料
  const incData = getFilteredByPeriod(incomeData, '日期', currentBalancePeriod);
  const expData = getFilteredByPeriod(expenseData, '日期', currentBalancePeriod);
  
  // 訂單也需要過濾
  let orderDataFiltered = [...ordersData];
  if (currentBalancePeriod !== 'all') {
    const now = new Date();
    orderDataFiltered = ordersData.filter(r => {
      const d = new Date(r.到貨日期 || r.下定日期 || 0);
      if (currentBalancePeriod === 'year') return d.getFullYear() === now.getFullYear();
      if (currentBalancePeriod === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      return true;
    });
  }

  // 2. 計算總和
  let marketIncome = 0;
  let marketUnpaid = 0;
  let actualKG = 0;
  incData.forEach(r => {
    marketIncome += (parseFloat(r.總價) || 0);
    if (r.付款狀態 !== '已付款') marketUnpaid += (parseFloat(r.總價) || 0);
    actualKG += (parseFloat(r.總重) || 0) * 0.6; // 假設總重是台斤 -> KG
  });
  
  // 訂單依狀態分組計算
  let salesIncome = 0;
  let salesByStatus = {}; // { '未指定': 金額, '預定出貨': 金額, '已出貨': 金額, ... }
  let salesUnpaid = 0;
  orderDataFiltered.forEach(r => {
    const price = parseFloat(r.總價) || 0;
    salesIncome += price;
    let status = r.狀態 || '未指定';
    if (status === '不指定') status = '未指定';
    if (!salesByStatus[status]) salesByStatus[status] = 0;
    salesByStatus[status] += price;
    if (r.付款狀態 !== '已付款') salesUnpaid += price;
  });

  const totalIncome = marketIncome + salesIncome;
  
  let totalExpense = 0;
  let bagCount = 0;
  let lossBagCount = 0;
  
  expData.forEach(r => {
    totalExpense += calcExpenseTotal(r);
    // 從支出項目提取套袋與損耗袋，這裡用次類別字串比對
    const subCat = r.次類別 || '';
    if (subCat.includes('套袋')) {
      bagCount += (parseFloat(r.數量) || 0);
    } else if (subCat.includes('損耗') && (subCat.includes('袋') || r.單位 === '袋' || r.主類別.includes('材料'))) {
      lossBagCount += (parseFloat(r.數量) || 0);
    }
  });

  const netBalance = totalIncome - totalExpense;

  // 更新訂單依狀態細項顯示
  const orderBreakdownEl = document.getElementById('balanceOrderBreakdown');
  if (orderBreakdownEl) {
    if (Object.keys(salesByStatus).length === 0) {
      orderBreakdownEl.innerHTML = '<small style="color:var(--text-muted)">無訂單</small>';
    } else {
      const statusOrder = ['已出貨', '預定出貨', '未指定'];
      const sorted = Object.entries(salesByStatus).sort((a, b) => {
        const ai = statusOrder.indexOf(a[0]);
        const bi = statusOrder.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      orderBreakdownEl.innerHTML = sorted.map(([status, amt]) =>
        `<div style="display:flex;justify-content:space-between;font-size:0.78rem;padding:2px 0;">
          <span style="color:var(--text-muted)">${status}</span>
          <span>$${amt.toLocaleString()}</span>
        </div>`
      ).join('');
    }
    if (salesUnpaid > 0) {
      orderBreakdownEl.innerHTML += `<div style="font-size:0.75rem;color:var(--orange);margin-top:4px">未付款 $${salesUnpaid.toLocaleString()}</div>`;
    }
  }

  // 3. 結餘與收入看板
  const netEl = document.getElementById('balanceNetAmount');
  if(netEl) {
    netEl.textContent = `$${netBalance.toLocaleString()}`;
    netEl.style.color = netBalance >= 0 ? 'var(--green-dark)' : 'var(--red)';
  }
  
  if(document.getElementById('balanceMarketIncome')) {
    document.getElementById('balanceMarketIncome').textContent = `$${marketIncome.toLocaleString()}`;
    document.getElementById('balanceSalesIncome').textContent = `$${salesIncome.toLocaleString()}`;
    document.getElementById('balanceTotalExpense').textContent = `$${totalExpense.toLocaleString()}`;
  } else {
    // 兼容舊版 ID
    if(document.getElementById('balanceTotalIncome')) document.getElementById('balanceTotalIncome').textContent = `$${totalIncome.toLocaleString()}`;
    if(document.getElementById('balanceTotalExpense')) document.getElementById('balanceTotalExpense').textContent = `$${totalExpense.toLocaleString()}`;
  }
  
  // 4. 生產與損耗看板計算 (假設一袋平均 0.35 kg)
  // 這些數值需要根據實際果園參數調整，此處設為預設預估
  const expectedKG = bagCount * 0.35; 
  const lossExpectedKG = lossBagCount * 0.35;
  const actualLossKG = Math.max(0, expectedKG - actualKG);
  const lossPercent = expectedKG > 0 ? ((actualLossKG / expectedKG) * 100).toFixed(1) + '%' : '0%';

  if(document.getElementById('balanceBagCount')) {
    document.getElementById('balanceBagCount').textContent = bagCount.toLocaleString();
    document.getElementById('balanceLossBagCount').textContent = lossBagCount.toLocaleString();
    document.getElementById('balanceExpectedKG').textContent = expectedKG.toFixed(1);
    document.getElementById('balanceActualKG').textContent = actualKG.toFixed(1);
    document.getElementById('balanceLossKG').textContent = actualLossKG.toFixed(1);
    document.getElementById('balanceLossPercent').textContent = lossPercent;
  }

  // 5. 繪製圓餅圖 (Chart.js)
  renderBalanceChart(totalIncome, totalExpense);

  // 6. 繪製各月收支明細
  renderBalanceMonthlyTable(incData, expData, orderDataFiltered);
}

function renderBalanceChart(income, expense) {
  const ctx = document.getElementById('balancePieChart');
  if (!ctx) return;

  if (balanceChartInstance) {
    balanceChartInstance.destroy();
  }

  // 若都為 0 則顯示灰底
  if (income === 0 && expense === 0) {
     balanceChartInstance = new Chart(ctx, {
       type: 'doughnut',
       data: {
         labels: ['無資料'],
         datasets: [{ data: [1], backgroundColor: ['#e2e8f0'], borderWidth: 0 }]
       },
       options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '75%' }
     });
     return;
  }

  balanceChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['收入', '支出'],
      datasets: [{
        data: [income, expense],
        backgroundColor: ['#22c55e', '#ef4444'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.label || '';
              if (label) { label += ': '; }
              if (context.parsed !== null) {
                label += '$' + context.parsed.toLocaleString();
              }
              return label;
            }
          }
        }
      }
    }
  });
}

function renderBalanceMonthlyTable(incData, expData, orderDataFiltered = []) {
  const tbody = document.getElementById('balanceMonthlyTableBody');
  if (!tbody) return;

  // 聚合到月份
  const monthlyMap = {};
  
  // 處理市場收入
  incData.forEach(r => {
    if(!r.日期) return;
    const month = r.日期.substring(0, 7); // YYYY-MM
    if(!monthlyMap[month]) monthlyMap[month] = { market: 0, sales: 0, expense: 0, orderCount: 0 };
    monthlyMap[month].market += (parseFloat(r.總價) || 0);
  });

  // 處理客戶銷售收入
  orderDataFiltered.forEach(r => {
    const d = r.到貨日期 || r.下定日期;
    if(!d) return;
    const month = d.substring(0, 7); // YYYY-MM
    if(!monthlyMap[month]) monthlyMap[month] = { market: 0, sales: 0, expense: 0, orderCount: 0 };
    monthlyMap[month].sales += (parseFloat(r.總價) || 0);
    monthlyMap[month].orderCount++;
  });

  // 處理支出
  expData.forEach(r => {
    if(!r.日期) return;
    const month = r.日期.substring(0, 7); // YYYY-MM
    if(!monthlyMap[month]) monthlyMap[month] = { market: 0, sales: 0, expense: 0, orderCount: 0 };
    monthlyMap[month].expense += calcExpenseTotal(r);
  });

  // 排序 (由新到舊)
  const months = Object.keys(monthlyMap).sort((a,b) => b.localeCompare(a));
  
  tbody.innerHTML = '';
  if (months.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">無資料</td></tr>';
    return;
  }

  months.forEach(m => {
    const stat = monthlyMap[m];
    const totalIncome = stat.market + stat.sales;
    const net = totalIncome - stat.expense;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${m}</strong></td>
      <td style="color:var(--green-dark);">$${stat.market.toLocaleString()}</td>
      <td style="color:var(--green-dark);">$${stat.sales.toLocaleString()}${stat.orderCount>0?` <small style="color:var(--text-muted);font-size:0.7rem">(${stat.orderCount}筆)</small>`:''}</td>
      <td style="color:var(--red);">$${stat.expense.toLocaleString()}</td>
      <td style="font-weight:bold; color:${net >= 0 ? 'var(--green-dark)' : 'var(--red)'};">$${net.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}
