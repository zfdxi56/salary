// ============================================================
console.log('?? Salary App.js Loaded - v' + new Date().getTime());
// ============================================================
// Google Sheets 雿敺垢嚗???嚗??/ ?臬 / 蝞∠?
// ============================================================

// ============================================================
// 1. ?典?閮剖?
// ============================================================
const SPREADSHEET_ID = '1rjVEG9x9ZJ6f3BSuC4CL_wYRATFvbGiZAGkwkzDP168';
const CLIENT_ID = '647415610600-eio0d6dqpu80j80gki4l9m5qfemmlkab.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email openid';

// 撌乩?銵典?蝔梧??券雿輻蝜?銝剜?嚗?
const SHEET = {
  USERS: '雿輻??,
  INCOME_CATS: '閮剖?_?車',
  RETAIL_PRICE: '閮剖?_撠?鞎拙蝑?',
  EXPENSE_CATS: '閮剖?_?臬憿',
  WORKERS: '閮剖?_撌乩犖?',
  UNITS: '閮剖?_?桐?皜',
  MARKET_INCOME: '撣?嗅',
  EXPENSE_SALARY: '?臬_?芾?',
  EXPENSE_COST: '?臬_?',
  EXPENSE: '?臬', // 靽???隞仿?砌?
  CUSTOMERS: '摰Ｘ鞈?',
  ORDERS: '摰Ｘ閮?敦',
  SETTINGS: '閮剖?',
  RETAIL_ORDERS: '?嗅閮'
};

// ============================================================
// 2. ?典????
// ============================================================
// --- ?”撖阡??????---
let _expensePieInstance = null;
let _incomePieInstance = null; 
let _balanceChartInstance = null;
let _loaderCount = 0;
let _toastTimer = null;
let currentBalancePeriod = 'all'; // 蝯???蝭拚?望?
let balanceChartInstance = null;  // 蝯????”撖阡?

let gapiInited = false;
let gisInited = false;
let tokenClient;

let currentUser = null;  // { email, role: 'admin'|'user' }
let isAdmin = false;

let incomeData = [];   // ?嗅蝝??
let expenseData = [];  // ?臬蝝??
let usersData = [];    // 雿輻????
let customersData = []; // 摰Ｘ鞈?
let ordersData = [];    // 閮鞈?
let sheetHeadersCache = {}; // 敹怠?閰衣?銵函洵銝??憿?

// ============================================================
// Google API / GIS ?????餃?摩
// ============================================================

function gapiLoaded() {
  gapi.load('client', intializeGapiClient);
}

async function intializeGapiClient() {
  try {
    await gapi.client.init({
      discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    });
    gapiInited = true;
    maybeEnableAuth();
  } catch (err) {
    console.error('GAPI Init Failed', err);
  }
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
 
// [???餃?摩撌脩宏?歹?蝯曹?雿輻 afterLogin 瘚?]
???
  
  // 瑼Ｘ?臬?箇恣?
  const userRecord = usersData.find(u => (u.email || '').toLowerCase() === currentUser.email.toLowerCase());
  isAdmin = userRecord && (userRecord.role === '蝞∠??? || userRecord.role === 'admin');
  if (isAdmin) {
    const tabAdmin = document.getElementById('tab-admin');
    if (tabAdmin) tabAdmin.style.display = 'flex';
    const badge = document.getElementById('userRoleBadge');
    if (badge) { badge.textContent = '蝞∠???; badge.style.display = 'inline-block'; }
  }
}

// ?餃?摩
window.handleLogout = function() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    location.reload();
  }
};
document.getElementById('logoutBtn').onclick = handleLogout;
document.getElementById('refreshBtn').onclick = () => location.reload();

// Settings 鞈?
let settings = {
  incomeMainCats: [],    // [{ ?迂, 甈⊿??? [], 蝑?: [] }]
  retailPrices: [],      // [{ ?車, 甈⊿??? 蝑?, ?桐?, 憿, ?桀 }]
  expenseMainCats: [],   // [{ ?迂, 憿?, 甈⊿??? [{?迂, ?身??}] }]
  workers: [],           // [{ 憪?, ?身?, ?身?亥 }]
  units: [],             // [?迂]
};

// 蝭拚/?????
const filterState = {
  income: { mainCat: null, subCat: null, sortOrder: 'desc', period: 'year', isEditMode: false },
  expense: { type: 'worker', mainCat: null, subCat: null, sortOrder: 'desc', period: 'year', isEditMode: false },
  order: { mainCat: null, subCat: null, sortOrder: 'desc', period: 'year', isEditMode: false },
  balance: { period: 'year' },
  composite: { period: 'year' } // ?啣?銴??∠??祟?貊???
};

// --- 撌亙憿??貉??賢? (??摰儔?踹? ReferenceError) ---
function showLoader(msg = '??銝?..') {
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

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  // 靘? type 鞈虫? class嚗???CSS 霈?
  el.className = `toast ${type === 'error' ? 'toast-error' : 'toast-success'}`;
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// --- ??甈?撠? (Dynamic Field Mapping) ---
// ?ㄐ撠岫蝞”甈??迂(銝剜?)??撠 JS 皞?撖怠?惇?折??
const fieldMap = {
  // ?嗅/?
  '蝺刻?': 'id',
  '?交?': '?交?',
  '摰Ｘ憿': '摰Ｘ憿',
  '摰Ｘ?迂': '摰Ｘ?迂',
  '?車銝駁???: '銝駁???,
  '?車甈⊿???: '甈⊿???,
  '蝑?鞈?': '蝑?鞈?',
  '蝮賡?(??': '蝮賡?',
  '蝞望': '蝞望',
  '蝮賢': '蝮賢',
  '?文???: '?文???,
  '?祥': '?祥',
  '隞狡???: '隞狡???,
  '撠董???: '撠董???,
  
  // ?臬撠 (?怨鞈??)
  '銝駁???: '銝駁???,
  '甈⊿???: '甈⊿???,
  '撌乩犖憪?': '撌乩犖憪?',
  '閮?孵?': '閮?孵?',
  '銝?-銝??': '銝?銝',
  '銝?-隡??': '銝?隡',
  '銝?-銝??': '銝?銝',
  '銝?-銝??': '銝?銝',
  '?/憭拇': '?憭拇',
  '?/?亥??': '?桀',
  '?怠?擗?: '?怠?擗?,
  '?賊?': '?賊?',
  '?桐?': '?桐?',
  '?桀': '?桀',
  '蝮賡?': '蝮賡?',
  '?臬?臭?': '撌脫隞?,
  '?臭??交?': '?臭??交?',

  '?酉': '?酉',
  '撱箇???': '撱箇???',
  '?敺??: '?敺??,
  '閫': 'role',
  'Email': 'email'
};

/**
 * ??撠??賢?
 * @param {string} sheetName ?格?撌乩?銵典?蝔?
 * @param {object} dataObj 皞?撖怠???隞?(Key ??fieldMap ??value)
 * @returns {Array} ??憟賜?鞈????
 */
function syncHeadersAndPrepareData(sheetName, dataObj) {
  const headers = sheetHeadersCache[sheetName];
  if (!headers || headers.length === 0) {
    console.warn(`?曆???${sheetName} ???剖翰???航?潛??航炊????箇征????);
    return [];
  }
  const rowData = [];
  headers.forEach((header) => {
    const dataKey = fieldMap[header];
    if (dataKey && dataObj.hasOwnProperty(dataKey)) {
      rowData.push(dataObj[dataKey] !== undefined && dataObj[dataKey] !== null ? dataObj[dataKey] : '');
    } else {
      rowData.push(''); // ?曆??啣????澆?憛怎征
    }
  });
  return rowData;
}

// ============================================================
// 3. ?身鞈?嚗撌乩?銵函鞈??蝙?剁?
// ============================================================
const DEFAULT_INCOME_CATS = ['?', '瘞渲?獢?, '璈?', '?嗡?'];

const DEFAULT_EXPENSE_CATS = [
  {
    ?迂: '撌乩犖?芾?', 憿?: 'worker',
    甈⊿??? [
      { ?迂: '?方?', ?身??: '' },
      { ?迂: '??', ?身??: '' },
      { ?迂: '憟?', ?身??: '' },
      { ?迂: '?嗆?', ?身??: '' },
      { ?迂: '?芣?', ?身??: '' },
      { ?迂: '?瑟偌', ?身??: '' },
      { ?迂: '?踵?', ?身??: '' },
    ]
  },
  {
    ?迂: '?交?', 憿?: 'material',
    甈⊿??? [
      { ?迂: '撉函?', ?身??: '' },
      { ?迂: '瘚琿野蝟?, ?身??: '' },
      { ?迂: '?', ?身??: '' },
      { ?迂: '鞊?', ?身??: '' },
      { ?迂: '?血??喟', ?身??: '' },
      { ?迂: '銴??交?', ?身??: '' },
      { ?迂: '???交?', ?身??: '' },
      { ?迂: '撠輻?', ?身??: '' },
    ]
  },
  {
    ?迂: '颲脰', 憿?: 'material',
    甈⊿??? [
      { ?迂: '????(B.t.)', ?身??: '' },
      { ?迂: '?行?瘝?, ?身??: '' },
      { ?迂: '?萇??, ?身??: '' },
      { ?迂: '?喟蝖怎ㄩ??', ?身??: '' },
      { ?迂: '鈭ㄦ??, ?身??: '' },
    ]
  },
  {
    ?迂: '????', 憿?: 'material',
    甈⊿??? [
      { ?迂: '瘞湔?蝝拳', ?身??: '' },
      { ?迂: '瘜⊥?蝬脣?', ?身??: '' },
      { ?迂: '憛??扯?', ?身??: '' },
      { ?迂: '撠拳?葆', ?身??: '' },
      { ?迂: '?祆?璅惜鞎潛?', ?身??: '' },
    ]
  },
  {
    ?迂: '隡??臬', 憿?: 'meal',
    甈⊿??? [
      { ?迂: '蝢?踹夾', ?身??: '' },
      { ?迂: '??', ?身??: '' },
      { ?迂: '皞芣?', ?身??: '' },
      { ?迂: '??, ?身??: '' },
      { ?迂: '撘???, ?身??: '' },
    ]
  },
];

const GRADE_OPTIONS = ['2A', '3A', '4A', '5A', '6A', '7A'];

// ============================================================
// 4. Google API ????
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
    
    const token = gapi.client.getToken();
    if (token) {
      afterLogin();
    }
  }
}

/**
 * ?鈭箏?瑕?嚗?砍?啣?憿舐內皜祈岫??嚗??敺?GAPI 頛
 */
function initDeveloperShortcuts() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // 蝣箔? auth-card 摮銝?瘝???
    const checkCard = setInterval(() => {
      const card = document.querySelector('.auth-card');
      if (card) {
        clearInterval(checkCard);
        if (!document.getElementById('devLoginBtn')) {
          const devBtn = document.createElement('button');
          devBtn.id = 'devLoginBtn';
          devBtn.className = 'btn';
          devBtn.style.marginTop = '1.5rem';
          devBtn.style.backgroundColor = '#6366f1';
          devBtn.style.color = 'white';
          devBtn.style.padding = '0.8rem 1.5rem';
          devBtn.style.borderRadius = '12px';
          devBtn.style.fontWeight = 'bold';
          devBtn.style.cursor = 'pointer';
          devBtn.style.border = 'none';
          devBtn.style.display = 'inline-flex';
          devBtn.style.alignItems = 'center';
          devBtn.style.gap = '8px';
          devBtn.innerHTML = '<span class="material-symbols-outlined">science</span> ?鈭箏皜祈岫?餃 (Mock)';
          devBtn.onclick = handleMockLogin;
          card.appendChild(devBtn);
        }
      }
    }, 100);
  }
}
initDeveloperShortcuts();

/**
 * 璅⊥?餃瘚?嚗?潭葫閰?UI ??頛?
 */
async function handleMockLogin() {
  showLoader('甇??脣皜祈岫璅∪?...');
  console.warn('?? 瘜冽?嚗???潮??潭葫閰行芋撘?鞈?撠???甇亥 Google Sheets');
  
  // 璅⊥ GAPI 銵
  if (typeof gapi === 'undefined') window.gapi = { client: {} };
  if (!gapi.client) gapi.client = {};
  
  if (!gapi.client.sheets) {
    gapi.client.sheets = {
      spreadsheets: {
        values: {
          get: async () => ({ result: { values: [] } }),
          append: async () => ({ result: {} }),
          update: async () => ({ result: {} })
        }
      }
    };
  }

  // 閮剖?皜祈岫頨怠?
  currentUser = { email: 'test@example.com', role: 'admin' };
  isAdmin = true;
  
  // ???撣??(敺?DEFAULT 銝剔匱??
  settings.incomeMainCats = DEFAULT_INCOME_CATS.map(n => ({ ?迂: n, 甈⊿??? [], 蝑?: GRADE_OPTIONS }));
  settings.expenseMainCats = DEFAULT_EXPENSE_CATS.map(c => ({ ...c }));
  settings.units = ['??, '蝵?, '蝞?, '隞?, '??, '憭?, '撠?'];
  settings.workers = [
    { 憪?: '?踹?隡?, ?身?: '200', ?身?亥: '1600' },
    { 憪?: '撠?', ?身?: '190', ?身?亥: '1500' }
  ];
  customersData = [
    { 摰Ｘ蝺刻?: 'C001', 摰Ｘ憪?: '??憪?, ?餉店: '0912-345678', ?啣?: '?唬葉撣?..', 摰Ｘ靘?: '隞晶' },
    { 摰Ｘ蝺刻?: 'C002', 摰Ｘ憪?: '????, ?餉店: '0921-888777', ?啣?: '?啣?撣?..', 摰Ｘ靘?: 'FB' }
  ];
  ordersData = []; // ??閮剔蝛綽?靘?蝥葫閰行憓
  
  // ?湔 UI
  document.getElementById('userRoleBadge').textContent = `皜祈岫蝞∠???繚 Antigravity`;
  document.getElementById('userRoleBadge').className = `role-badge admin`;
  document.getElementById('userInfo').style.display = 'flex';
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  document.getElementById('tab-admin').style.display = 'flex';
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('workspace').style.display = 'block';
  const fabC = document.getElementById('fabContainer');
  if (fabC) fabC.style.display = 'flex';
  initFAB();
  initAllEventListeners();

  switchTab('revenue');
  try { renderAll(); } catch (e) { console.error('renderAll error:', e); }
  
  showToast('撌脤脣皜祈岫璅∪? (Mock Mode)', 'success');
  _loaderCount = 0;
  hideLoader();
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
  showLoader('?餃銝?..');
  try {
    // ???餃??email
    const tokenInfo = gapi.client.getToken();
    // ?? tokeninfo endpoint ?? email
    const res = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${tokenInfo.access_token}`);
    const info = await res.json();
    const email = info.email || '';

    // 蝣箔?撌乩?銵典??剁??活雿輻?芸?撱箇?嚗?
    await ensureSheetsExist();
    await fetchAllData();

    // 蝣箄?雿輻????
    const cleanEmail = email.trim().toLowerCase();
    let userRow = usersData.find(u => u.email === cleanEmail);
    
    // 憒?蝟餌絞摰瘝?雿輻????孵?璇辣銝?擐??餃??
    if (usersData.length === 0 && !userRow) {
      console.log('蝟餌絞???餃嚗??擐?雿輻?身?箇恣?');
      await addUserToSheet(email, 'admin');
      await fetchUsers(); // ?霈????
      userRow = usersData.find(u => u.email === cleanEmail);
    }

    if (!userRow) {
      // ?芰閮?撣唾? ???嗡??砌蝙?刻?
      currentUser = { email, role: 'user' };
    } else {
      currentUser = { email, role: userRow.role };
    }
    isAdmin = (currentUser.role === 'admin' || currentUser.role === '蝞∠???);

    // ?湔 header
    const currentName = userRow?.nickname || (email ? email.split('@')[0] : '閮芸恥');
    const roleDisplay = isAdmin ? '蝞∠??? : '雿輻??;
    
    // 撠??脰澈??蝐歹?銝阡???祇?銴??梁迂??
    document.getElementById('userNameDisplay').style.display = 'none'; 
    document.getElementById('userRoleBadge').textContent = `${roleDisplay} 繚 ${currentName}`;
    document.getElementById('userRoleBadge').className = `role-badge${isAdmin ? ' admin' : ''}`;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'inline-flex';

    if (email) {
      showToast(`甇∟??? ${currentName}嚗頂蝯梯??亥澈隞踝?${roleDisplay}`, 'success');
    } else {
      showToast(`?餃??嚗??⊥??? Email??蝣箄??臬撌脣?豢??, 'warning');
    }

    if (isAdmin) {
      document.getElementById('tab-admin').style.display = 'flex';
    }

    document.getElementById('authSection').style.display = 'none';
    document.getElementById('workspace').style.display = 'block';
    const fabCont = document.getElementById('fabContainer');
    if (fabCont) fabCont.style.display = 'flex';
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.style.display = 'inline-flex';
    initAllEventListeners();

    switchTab('revenue');
    renderAll();
  } catch (e) {
    console.error(e);
    showToast('?餃憭望?嚗??岫', 'error');
  }
  hideLoader();
}

/**
 * ?? Token ????UI ?內
 */
function showTokenRefreshPrompt() {
  const btn = document.getElementById('tokenRefreshBtn');
  if (btn) {
    btn.style.display = 'flex';
    btn.onclick = () => {
      tokenClient.requestAccessToken({ prompt: 'consent' });
      btn.style.display = 'none';
    };
  } else {
    showToast('?餃?暹?嚗???餃', 'error');
  }
}

/**
 * 摰撠???Append (?? 401 ?航炊銝阡?暺?閰?
 */
async function safeSheetsAppend(requestBody) {
  try {
    return await gapi.client.sheets.spreadsheets.values.append(requestBody);
  } catch (err) {
    if (err.status === 401) {
      console.warn('Token ?暹?嚗?閰阡?暺??..');
      return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp) => {
          if (resp.error) {
            showTokenRefreshPrompt();
            reject(resp);
            return;
          }
          gapi.client.setToken(resp);
          // ?岫
          try {
            const retryRes = await gapi.client.sheets.spreadsheets.values.append(requestBody);
            resolve(retryRes);
          } catch (retryErr) {
            reject(retryErr);
          }
        };
        tokenClient.requestAccessToken({ prompt: '' });
      });
    }
    throw err;
  }
}

/**
 * 摰撠???Update (?? 401 ?航炊銝阡?暺?閰?
 */
async function safeSheetsUpdate(requestBody) {
  try {
    return await gapi.client.sheets.spreadsheets.values.update(requestBody);
  } catch (err) {
    if (err.status === 401) {
      console.warn('Token ?暹?嚗?閰阡?暺??..');
      return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp) => {
          if (resp.error) {
            showTokenRefreshPrompt();
            reject(resp);
            return;
          }
          gapi.client.setToken(resp);
          // ?岫
          try {
            const retryRes = await gapi.client.sheets.spreadsheets.values.update(requestBody);
            resolve(retryRes);
          } catch (retryErr) {
            reject(retryErr);
          }
        };
        tokenClient.requestAccessToken({ prompt: '' });
      });
    }
    throw err;
  }
}

/**
 * 撠蝙?刻??亥岫蝞”
 */
async function addUserToSheet(email, role) {
  try {
    const defaultNickname = email.split('@')[0];
    const row = [defaultNickname, email, role, now()];
    await safeSheetsAppend({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.USERS}!A:D`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });
  } catch (e) {
    console.error('addUserToSheet 憭望?:', e);
  }
}

/**
 * ??????撌乩?銵?
 */
async function appendToSheet(sheetName, row) {
  await safeSheetsAppend({
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

// ??渡???
document.getElementById('refreshBtn').onclick = () => {
  window.location.reload();
};

// ============================================================
// 5. Google Sheets 撌乩?銵典遣蝡??活雿輻嚗?
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
      // 撖怠璅???
      await initSheetHeaders();
    }
  } catch (e) {
    console.error('ensureSheetsExist 憭望?:', e);
  }
}

async function initSheetHeaders() {
  const ranges = [
    {
      range: `${SHEET.INCOME_CATS}!A1:F1`,
      values: [['?車?迂', '?', '?車甈⊿???, '?Ｗ迤', '蝑?', '?酉']]
    },
    {
      range: `${SHEET.RETAIL_PRICE}!A1:G1`,
      values: [['?車銝駁???, '?車甈⊿???, '蝑?', '?桐?(蝞?鋡?', '憿', '?嗉祥(撌脣??', '?酉']]
    },
    {
      range: `${SHEET.EXPENSE_CATS}!A1:E1`,
      values: [['銝駁???, '甈⊿???, '憿?', '?身??', '?酉']]
    },
    {
      range: `${SHEET.WORKERS}!A1:C1`,
      values: [['憪?', '?身?', '?身?亥']]
    },
    {
      range: `${SHEET.UNITS}!A1:A1`,
      values: [['?桐??迂']]
    },
    {
      range: `${SHEET.MARKET_INCOME}!A1:R1`,
      values: [['蝺刻?', '?交?', '摰Ｘ憿', '摰Ｘ?迂', '?車銝駁???, '?車甈⊿???, '蝑?鞈?', '蝮賡?(??', '蝞望', '蝮賢', '?文???, '?祥', '?酉', '隞狡???, '撠董???, '撱箇???', '?敺??, '?酉2']]
    },
    {
      range: `${SHEET.EXPENSE_SALARY}!A1:S1`,
      values: [['蝺刻?', '?交?', '銝駁???, '甈⊿???, '撌乩犖憪?', '閮?孵?', '銝?-銝??', '銝?-隡??', '銝?-銝??', '銝?-銝??', '?/憭拇', '?/?亥??', '?怠?擗?, '蝮賡?', '?臬?臭?', '?臭??交?', '?酉', '撱箇???', '?敺??]]
    },
    {
      range: `${SHEET.EXPENSE_COST}!A1:L1`,
      values: [['蝺刻?', '?交?', '銝駁???, '甈⊿???, '?賊?', '?桀', '蝮賡?', '?臬?臭?', '?臭??交?', '?酉', '撱箇???', '?敺??]]
    },
    {
      range: `${SHEET.EXPENSE}!A1:O1`,
      values: [['蝺刻?', '?交?', '銝駁???, '甈⊿???, '撌乩犖憪?', '閮?孵?', '?賊?', '?桐?', '?桀', '蝮賡?', '?怠?擗?, '撌脫隞?, '?酉', '撱箇???', '?敺??]]
    },
    {
      range: `${SHEET.CUSTOMERS}!A1:G1`,
      values: [['摰Ｘ蝺刻?', '摰Ｘ憪?', '?餉店', '?啣?', '摰Ｘ靘?', '摰Ｘ皜?', '隞晶鈭?]]
    },
    {
      range: `${SHEET.ORDERS}!A1:S1`,
      values: [['閮頃??', '??憿', '閮???, '銝??交?', '?啗疏?交?', '閮頃蝑?', '閮?批捆', '蝮賢', '摰Ｘ蝺刻?', '撖辣鈭?, '撖辣鈭粹閰?, '?嗡辣鈭?摰Ｘ)', '?嗡辣鈭粹閰?, '?嗡辣鈭箏?', '??酉撖辣鈭?, '?疏?孵?', '隞狡???, '撠董???, '?酉']]
    },
    {
      range: `${SHEET.USERS}!A1:D1`,
      values: [['?亦迂', 'Email', '閫', '?湔??']]
    },
  ];
  for (const r of ranges) {
    await safeSheetsUpdate({
      spreadsheetId: SPREADSHEET_ID,
      range: r.range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: r.values }
    });
  }
}

// ============================================================
// 6. 鞈?霈??
// ============================================================
async function fetchAllData() {
  try {
    await fetchHeadersCache(); // ?翰????
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
    showToast('霈???仃??, 'error');
  }
}

async function fetchHeadersCache() {
  try {
    const ranges = [
      `${SHEET.MARKET_INCOME}!1:1`,
      `${SHEET.EXPENSE_SALARY}!1:1`,
      `${SHEET.EXPENSE_COST}!1:1`
    ];
    const res = await gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: SPREADSHEET_ID,
      ranges: ranges
    });
    
    if (res.result.valueRanges) {
      res.result.valueRanges.forEach(vr => {
        const sheetName = vr.range.split('!')[0].replace(/'/g, ''); // 蝘駁?航?撘?
        const values = vr.values ? vr.values[0] : [];
        sheetHeadersCache[sheetName] = values;
      });
      console.log('Sheet headers cached:', sheetHeadersCache);
    }
  } catch (e) {
    console.error('fetchHeadersCache 憭望?:', e);
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

    // ?車
    (resInc.result.values || []).forEach(r => {
      const main = r[1], sub = r[2] || '', gradeStr = r[4] || '';
      if (!main) return;
      
      let cat = settings.incomeMainCats.find(c => c.?迂 === main);
      if (!cat) {
        cat = { ?迂: main, 甈⊿??? [], 蝑?: [] };
        settings.incomeMainCats.push(cat);
      }
      if (sub && !cat.甈⊿???includes(sub)) cat.甈⊿???push(sub);
      
      // 閫????????蝝?
      if (gradeStr) {
        gradeStr.split(/[,?/).forEach(g => {
          const gn = g.trim();
          if (gn && !cat.蝑?.includes(gn)) cat.蝑?.push(gn);
        });
      }
    });

    // 撠?鞎拙??
    (resRetail.result.values || []).forEach(r => {
      if (r[0]) {
        settings.retailPrices.push({
          ?車銝駁??? r[0] || '',
          ?車甈⊿??? r[1] || '',
          蝑?: r[2] || '',
          ?桐?: r[3] || '',
          鞎拙?批捆: r[4] || '',
          摰: r[5] || '',
          ?桀: r[6] || '',
          ?酉: r[7] || ''
        });
      }
    });

    // ?臬憿
    (resExp.result.values || []).forEach(r => {
      const main = r[0], sub = r[1], rawType = r[2] || 'material', amt = r[3] || '';
      // ?舀銝剜?憿?璅惜???
      let type = rawType;
      if (rawType === '?極') type = 'worker';
      if (rawType === '?') type = 'material';
      if (rawType === '?') type = 'meal';
      
      let cat = settings.expenseMainCats.find(c => c.?迂 === main);
      if (!cat) {
        cat = { ?迂: main, 憿?: type, 甈⊿??? [] };
        settings.expenseMainCats.push(cat);
      }
      if (sub) cat.甈⊿???push({ ?迂: sub, ?身??: amt });
    });
    // 撌乩犖
    (resWork.result.values || []).forEach(r => {
      if (r[0]) settings.workers.push({ 憪?: r[0], ?身?: r[1] || '190', ?身?亥: r[2] || '1500' });
    });
    // ?桐?
    (resUnit.result.values || []).forEach(r => {
      if (r[0]) settings.units.push(r[0]);
    });

    // ?身?澆???
    if (settings.incomeMainCats.length === 0) settings.incomeMainCats = DEFAULT_INCOME_CATS.map(n => ({ ?迂: n, 甈⊿???[], 蝑?: GRADE_OPTIONS }));
    if (settings.expenseMainCats.length === 0) settings.expenseMainCats = DEFAULT_EXPENSE_CATS.map(c => ({ ...c }));
    if (settings.units.length === 0) settings.units = ['??, '蝵?, '蝞?, '隞?, '??, '憭?, '撠?'];
    
  } catch (e) {
    console.error('fetchSettings 憭望?:', e);
    settings = {
      incomeMainCats: DEFAULT_INCOME_CATS.map(n => ({ ?迂: n, 甈⊿???[], 蝑?: GRADE_OPTIONS })),
      retailPrices: [],
      expenseMainCats: DEFAULT_EXPENSE_CATS.map(c => ({ ...c })),
      workers: [],
      units: ['??, '蝵?, '蝞?, '隞?, '??, '憭?, '撠?'],
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
      ?交?: r[1] || '',
      摰Ｘ憿: r[2] || '',
      摰Ｘ?迂: r[3] || '',
      銝駁??? r[4] || '',
      甈⊿??? r[5] || '',
      蝑?鞈?: safeParseJSON(r[6], []),
      蝮賡?: r[7] || '',
      蝞望: r[8] || '',
      蝮賢: r[9] || '',
      ?文??? r[10] || '',
      ?祥: r[11] || '',
      ?酉: r[12] || '',
      隞狡??? r[13] || '?芯?甈?,
      撠董??? r[14] || '敺?撣?,
      ?寞蝣箄?: r[14] === 'OK',
      撱箇???: r[15] || '',
      ?敺?? r[16] || '',
    }));
  } catch (e) { incomeData = []; }
}

async function fetchExpense() {
  try {
    const [resSalary, resCost] = await Promise.all([
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.EXPENSE_SALARY}!A2:S` }),
      gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET.EXPENSE_COST}!A2:L` }),
    ]);

    const salaryItems = (resSalary.result.values || []).map(r => ({
      id: r[0] || '',
      ?交?: r[1] || '',
      銝駁??? r[2] || '',
      甈⊿??? r[3] || '',
      撌乩犖憪?: r[4] || '',
      閮?孵?: r[5] || '',
      銝?銝: r[6] || '',
      銝?隡: r[7] || '',
      銝?銝: r[8] || '',
      銝?銝: r[9] || '',
      ?賊?: r[10] || '',
      ?桀: r[11] || '',
      ?怠?擗? r[12] === 'TRUE' || r[12] === true,
      蝮賡?: r[13] || '',
      撌脫隞? r[14] === 'TRUE' || r[14] === true,
      ?臭??交?: r[15] || '',
      ?酉: r[16] || '',
      撱箇???: r[17] || '',
      ?敺?? r[18] || '',
      _sourceSheet: SHEET.EXPENSE_SALARY
    }));

    const costItems = (resCost.result.values || []).map(r => ({
      id: r[0] || '',
      ?交?: r[1] || '',
      銝駁??? r[2] || '',
      甈⊿??? r[3] || '',
      ?賊?: r[4] || '',
      ?桀: r[5] || '',
      蝮賡?: r[6] || '',
      撌脫隞? r[7] === 'TRUE' || r[7] === true,
      ?臭??交?: r[8] || '',
      ?酉: r[9] || '',
      撱箇???: r[10] || '',
      ?敺?? r[11] || '',
      _sourceSheet: SHEET.EXPENSE_COST
    }));

    // ?蔥鞈?隞亦雁??葡??頛?
    expenseData = [...salaryItems, ...costItems];
  } catch (e) { 
    console.error('fetchExpense 憭望?:', e);
    expenseData = []; 
  }
}

async function fetchCustomers() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.CUSTOMERS}!A2:G`,
    });
    customersData = (res.result.values || []).map(r => ({
      摰Ｘ蝺刻?: r[0] || '',
      摰Ｘ憪?: r[1] || '',
      ?餉店: r[2] || '',
      ?啣?: r[3] || '',
      摰Ｘ靘?: r[4] || '',
      摰Ｘ皜?: r[5] || '',
      隞晶鈭? r[6] || '',
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
      let status = r[2] || '?芣?摰?;
      if (status === '銝?摰? || status === '?芸‵') status = '?芣?摰?;
      return {
        id: `ORD_${index}_${Date.now()}`,
        閮頃??: r[0] || '',
        ??憿: r[1] || '',
        ??? status,
        銝??交?: r[3] || '',
        ?啗疏?交?: r[4] || '',
        閮頃蝑?: r[5] || '',
        閮?批捆: r[6] || '',
        蝮賢: r[7] || '',
        摰Ｘ蝺刻?: r[8] || '',
        撖辣鈭? r[9] || '',
        撖辣鈭粹閰? r[10] || '',
        ?嗡辣鈭? r[11] || '',
        ?嗡辣鈭粹閰? r[12] || '',
        ?嗡辣鈭箏?: r[13] || '',
        ??酉撖辣鈭? r[14] === 'TRUE' || r[14] === 'Y' || r[14] === true,
        ?疏?孵?: r[15] || '',
        隞狡??? r[16] || '?芯?甈?,
        撠董??? r[17] || '敺?撣?,
        ?酉: r[18] || '',
      };
    });
    ordersData.forEach((od, i) => od._localIdx = i + 2);
  } catch (e) { ordersData = []; }
}

function getFilteredByPeriod(data, field, period) {
  if (period === 'all') return data;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  return data.filter(r => {
    const val = r[field];
    if (!val) return false;
    const d = new Date(val);
    if (isNaN(d.getTime())) return false;
    
    if (period === 'year') return d.getFullYear() === currentYear;
    if (period === 'month') return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    return true;
  });
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str) || fallback; } catch { return fallback; }
}

// ============================================================
// 7. Tab ??
// ============================================================
function switchTab(tab) {
  if (tab === 'admin' && !isAdmin) {
    showToast('甈?銝雲嚗瘜脣蝞∠??', 'error');
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

// 摮? Tab ??嚗??湔??/ 摰Ｘ閮嚗?
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
// 8. 皜脫??券
// ============================================================
function renderAll() {
  renderCompositeIncomeCard(); // ?芸?皜脫?銴?撘??
  
  renderRevenueSummary();
  renderIncomeTable();
  renderIncomeFilterChips();

  renderExpenseChart();
  renderExpenseTable();
  renderExpenseFilterChips();
  initExpenseSubTabs(); // ????箏?????

  renderBalancePage();
  renderOrderFilterChips();
  renderOrderTable();

  if (isAdmin) renderAdminPage();
  setupEditModeToggle();
}

// ============================================================
// 8b. FAB ?豢筑??????
// ============================================================
function initFAB() {
  const fabMain = document.getElementById('fabMain');
  const fabMenu = document.getElementById('fabMenu');
  if (!fabMain || !fabMenu) return;

  if (fabMain._init) return;
  fabMain._init = true;

  fabMain.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = fabMenu.classList.contains('open');
    if (isOpen) {
      fabMenu.classList.remove('open');
      fabMain.classList.remove('open'); // ? CSS ?其??? + ?? class
    } else {
      fabMenu.classList.add('open');
      fabMain.classList.add('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!fabMain.contains(e.target) && !fabMenu.contains(e.target)) {
      fabMenu.classList.remove('open');
      fabMain.classList.remove('open');
    }
  });
}

function handleFabAction(type) {
  const fabMenu = document.getElementById('fabMenu');
  const fabMain = document.getElementById('fabMain');
  if (fabMenu) fabMenu.classList.remove('open');
  if (fabMain) fabMain.classList.remove('open');

  if (type === 'income') {
    switchTab('revenue');
    // ?身??撣?嗅嚗odal ?批??
    setTimeout(() => openIncomeModal(), 100);
  } else if (type === 'expense') {
    switchTab('expense');
    // ?寞??桀???箏????????”?殷?Modal ?批??
    const isCosts = filterState.expense.type === 'material';
    setTimeout(() => openExpenseModal(null, isCosts ? 'material' : 'worker'), 100);
  }
}

// ============================================================
// 9. 銴?撘絞閮?(??敺敹?
// ============================================================

function renderCompositeIncomeCard() {
  const period = filterState.composite.period;
  
  // 1. 閮???
  const marketRows = getFilteredByPeriod(incomeData, '?交?', period);
  const orderRows = getFilteredByPeriod(ordersData, '銝??交?', period); // 閮隞亙恥皞?銝?

  const marketTotal = marketRows.reduce((s, r) => s + (parseFloat(r.蝮賢) || 0), 0);
  const orderTotal = orderRows.reduce((s, r) => s + (parseFloat(r.蝮賢) || 0), 0);
  const grandTotal = marketTotal + orderTotal;

  // 2. ?湔?詨??脣漲璇?
  const elTotal = document.getElementById('revenueTotalAmount');
  if (elTotal) elTotal.textContent = `$${grandTotal.toLocaleString()}`;

  const barMarket = document.getElementById('barMarket');
  const barOrder = document.getElementById('barOrder');
  const valMarket = document.getElementById('barMarketVal');
  const valOrder = document.getElementById('barOrderVal');

  const marketPercent = grandTotal > 0 ? (marketTotal / grandTotal * 100) : 50;
  const orderPercent = grandTotal > 0 ? (orderTotal / grandTotal * 100) : 50;

  if (barMarket) barMarket.style.width = `${marketPercent}%`;
  if (barOrder) barOrder.style.width = `${orderPercent}%`;

  if (valMarket) valMarket.textContent = `$${marketTotal.toLocaleString()} (${Math.round(marketPercent)}%)`;
  if (valOrder) valOrder.textContent = `$${orderTotal.toLocaleString()} (${Math.round(orderPercent)}%)`;

  // 3. 皜脫?撌血?敦 (??蝔桀?蝯?
  renderCompositeDetails(marketRows, orderRows);
  
  // 4. 皜脫??芸鞎刻郎??
  renderUnshippedAlerts();
}

function renderCompositeDetails(mRows, oRows) {
  const leftEl = document.getElementById('marketSummaryDetails');
  const rightEl = document.getElementById('orderSummaryDetails');
  if (!leftEl || !rightEl) return;

  // ???賢?
  const groupByCat = (rows, field) => {
    const map = {};
    rows.forEach(r => {
      const cat = r[field] || '?嗡?';
      map[cat] = (map[cat] || 0) + (parseFloat(r.蝮賢) || 0);
    });
    return map;
  };

  const marketMap = groupByCat(mRows, '銝駁???);
  const orderMap = groupByCat(oRows, '閮頃??');

  const buildHtml = (map) => {
    const entries = Object.entries(map).sort((a,b) => b[1] - a[1]);
    if (entries.length === 0) return '<div class="detail-item"><span class="detail-name">?怎?豢?</span></div>';
    return entries.map(([name, val]) => `
      <div class="detail-item">
        <span class="detail-name">${name}</span>
        <span class="detail-amount">$${val.toLocaleString()}</span>
      </div>
    `).join('');
  };

  leftEl.innerHTML = buildHtml(marketMap);
  rightEl.innerHTML = buildHtml(orderMap);
}

function renderUnshippedAlerts() {
  const container = document.getElementById('unshippedAlertContainer');
  if (!container) return;

  // 蝭拚?芸鞎刻???
  const pendingOrders = ordersData.filter(o => o.???!== '撌脣鞎? && o.???!== '?芣?摰?);
  if (pendingOrders.length === 0) {
    container.style.display = 'none';
    return;
  }

  // ???? + 蝑? ?蜇
  const aggregate = {}; // { "?": { "6A": 10, ... } }
  pendingOrders.forEach(o => {
    const item = o.閮頃?? || '?嗡?';
    const gradeData = safeParseJSON(o.閮頃蝑?, {}); 
    // 閮鳴???閮??鞈潛?蝝?賣 JSON 摮葡嚗?鈭?賣?湔摮葡
    // ?寞??暹?隞?Ⅳ嚗??桀摰寞銴?蝯?

    if (!aggregate[item]) aggregate[item] = {};
    
    // 閫??閮?抒?蝑????
    // ?身閮?敦?澆??綽?[{grade: "6A", qty: 2}, ...]
    const details = safeParseJSON(o.閮?批捆, []);
    details.forEach(d => {
      const g = d.grade || '?芸‵';
      const q = parseFloat(d.qty) || 0;
      aggregate[item][g] = (aggregate[item][g] || 0) + q;
    });
  });

  const emojiMap = { '?': '??', '璈?': '??', '瘞渲?獢?: '??' };
  let htmlArray = [];

  for (const [item, grades] of Object.entries(aggregate)) {
    const emoji = emojiMap[item] || '?';
    const gradeStr = Object.entries(grades)
      .map(([g, q]) => `${g}-${q}蝞常)
      .join('??);
    if (gradeStr) {
      htmlArray.push(`<div class="alert-item">${emoji}(${item}?芸鞎?嚗?{gradeStr}</div>`);
    }
  }

  if (htmlArray.length > 0) {
    container.innerHTML = htmlArray.join('');
    container.style.display = 'block';
  }
}

// ============================================================
// 9b. 銴?撘?箇絞閮?
// ============================================================

function renderCompositeExpenseCard() {
  const period = filterState.expense.period;
  const data = getFilteredByPeriod(expenseData, '?交?', period);

  // 1. 閮???
  const salaryRows = data.filter(r => {
    const cat = settings.expenseMainCats.find(c => c.?迂 === r.銝駁???;
    return cat?.憿? === 'worker';
  });
  const costRows = data.filter(r => {
    const cat = settings.expenseMainCats.find(c => c.?迂 === r.銝駁???;
    return cat?.憿? !== 'worker';
  });

  const salaryTotal = salaryRows.reduce((s, r) => s + calcExpenseTotal(r), 0);
  const costTotal = costRows.reduce((s, r) => s + calcExpenseTotal(r), 0);
  const grandTotal = salaryTotal + costTotal;

  // 2. ?湔?詨??脣漲璇?
  const elTotal = document.getElementById('expenseTotalAmount');
  if (elTotal) elTotal.textContent = `$${grandTotal.toLocaleString()}`;

  const barSalary = document.getElementById('barSalary');
  const barCost = document.getElementById('barCost');
  const valSalary = document.getElementById('barSalaryVal');
  const valCost = document.getElementById('barCostVal');

  const salaryPercent = grandTotal > 0 ? (salaryTotal / grandTotal * 100) : 50;
  const costPercent = grandTotal > 0 ? (costTotal / grandTotal * 100) : 50;

  if (barSalary) barSalary.style.width = `${salaryPercent}%`;
  if (barCost) barCost.style.width = `${costPercent}%`;

  if (valSalary) valSalary.textContent = `$${salaryTotal.toLocaleString()} (${Math.round(salaryPercent)}%)`;
  if (valCost) valCost.textContent = `$${costTotal.toLocaleString()} (${Math.round(costPercent)}%)`;

  // 3. 皜脫??敦
  renderExpenseSummaryDetails(salaryRows, costRows);
}

function renderExpenseSummaryDetails(sRows, cRows) {
  const leftEl = document.getElementById('salarySummaryDetails');
  const rightEl = document.getElementById('costSummaryDetails');
  if (!leftEl || !rightEl) return;

  const groupByCat = (rows) => {
    const map = {};
    rows.forEach(r => {
      const cat = r.銝駁???|| '?嗡?';
      map[cat] = (map[cat] || 0) + calcExpenseTotal(r);
    });
    return map;
  };

  const salaryMap = groupByCat(sRows);
  const costMap = groupByCat(cRows);

  const buildHtml = (map) => {
    const entries = Object.entries(map).sort((a,b) => b[1] - a[1]);
    if (entries.length === 0) return '<div class="detail-item"><span class="detail-name">?怎?豢?</span></div>';
    return entries.map(([name, val]) => `
      <div class="detail-item">
        <span class="detail-name">${name}</span>
        <span class="detail-amount">$${val.toLocaleString()}</span>
      </div>
    `).join('');
  };

  leftEl.innerHTML = buildHtml(salaryMap);
  rightEl.innerHTML = buildHtml(costMap);
}

function initExpenseSubTabs() {
  const salaryBtn = document.getElementById('stab-salary');
  const costsBtn = document.getElementById('stab-costs');
  if (!salaryBtn || !costsBtn) return;

  const setSubTab = (type) => {
    filterState.expense.type = type === 'salary' ? 'worker' : 'material';
    filterState.expense.mainCat = null;
    filterState.expense.subCat = null;
    
    // UI ??
    document.getElementById('subpage-salary').style.display = type === 'salary' ? 'block' : 'none';
    document.getElementById('subpage-costs').style.display = type === 'costs' ? 'block' : 'none';
    
    salaryBtn.classList.toggle('active', type === 'salary');
    costsBtn.classList.toggle('active', type === 'costs');
    
    renderExpenseFilterChips();
    renderExpenseTable();
  };

  salaryBtn.onclick = () => setSubTab('salary');
  costsBtn.onclick = () => setSubTab('costs');
}

// ============================================================
// 10. 敹急?撌亙
// ============================================================

function setFormDateToday(id) {
  const el = document.getElementById(id);
  if (el) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    el.value = `${y}-${m}-${d}`;
    // 憒?????摩嚗?閮?芸??蕪嚗??航孛??change 鈭辣
    el.dispatchEvent(new Event('change'));
  }
}

/** 銴ˊ蝝?蜓?脣暺?*/
function duplicateRecord(type, data) {
  if (type === 'income') {
    openIncomeForm(null); // 隞乓憓芋撘?憛?
    setTimeout(() => {
      // ?寞? data ?‵
      if (document.getElementById('incomeMainCat')) {
        document.getElementById('incomeMainCat').value = data.銝駁???|| '';
        document.getElementById('incomeMainCat').dispatchEvent(new Event('change'));
      }
      setTimeout(() => {
         if (document.getElementById('incomeSubCat')) document.getElementById('incomeSubCat').value = data.甈⊿???|| '';
         if (document.getElementById('incomeCustomerName')) document.getElementById('incomeCustomerName').value = data.摰Ｘ?迂 || '';
         if (document.getElementById('incomeNotes')) document.getElementById('incomeNotes').value = data.?酉 || '';
         if (document.getElementById('incomeTotalPrice')) document.getElementById('incomeTotalPrice').value = data.蝮賢 || '';
         
         // 蝑??‵ (銴?蝯?)
         if (Array.isArray(data.蝑?鞈?) && data.蝑?鞈?.length > 0) {
           const container = document.getElementById('gradeRowsContainer');
           container.innerHTML = '';
           data.蝑?鞈?.forEach(g => {
             addGradeRow(g.蝑?, g.?斗, g.蝞望);
           });
         }
         showToast('撌脰?鋆質??潸??批捆嚗?瑼Ｘ敺摮?, 'success');
      }, 50);
    }, 100);
  } else if (type === 'order') {
    openOrderForm(null);
    setTimeout(() => {
      if (document.getElementById('orderMainCat')) {
        document.getElementById('orderMainCat').value = data.閮頃?? || '';
        document.getElementById('orderMainCat').dispatchEvent(new Event('change'));
      }
      setTimeout(() => {
        if (document.getElementById('orderSubCat')) document.getElementById('orderSubCat').value = data.??憿 || '';
        if (document.getElementById('orderDeliveryType')) document.getElementById('orderDeliveryType').value = data.?疏?孵? || '';
        if (document.getElementById('orderTotalPrice')) document.getElementById('orderTotalPrice').value = data.蝮賢 || '';
        if (document.getElementById('orderStatus')) document.getElementById('orderStatus').value = data.???|| '?芣?摰?;
        // 摰Ｘ鞈?
        if (document.getElementById('orderSenderName')) document.getElementById('orderSenderName').value = data.撖辣鈭?|| '';
        if (document.getElementById('orderSenderPhone')) document.getElementById('orderSenderPhone').value = data.撖辣鈭粹閰?|| '';
        if (document.getElementById('orderReceiverName')) document.getElementById('orderReceiverName').value = data.?嗡辣鈭?|| '';
        if (document.getElementById('orderReceiverPhone')) document.getElementById('orderReceiverPhone').value = data.?嗡辣鈭粹閰?|| '';
        if (document.getElementById('orderReceiverAddress')) document.getElementById('orderReceiverAddress').value = data.?嗡辣鈭箏? || '';
        
        // 蝑?摰孵
        const details = safeParseJSON(data.閮?批捆, []);
        const container = document.getElementById('orderGradeContainer');
        if (container && details.length > 0) {
          // 閮銵典??蝝葡?虜?舀??MainCat ??change ?芸??????ㄐ?閬移蝣箸??
          // ... ?仿?頛??? DOM ??嚗?蝷箇?嗆炎??
        }
        showToast('閮銴ˊ??', 'success');
      }, 50);
    }, 100);
  } else if (type === 'expense') {
    openExpenseModal(null);
    setTimeout(() => {
      if (document.getElementById('expenseMainCat')) {
        document.getElementById('expenseMainCat').value = data.銝駁???|| '';
        document.getElementById('expenseMainCat').dispatchEvent(new Event('change'));
      }
      setTimeout(() => {
        if (document.getElementById('expenseSubCat')) document.getElementById('expenseSubCat').value = data.甈⊿???|| '';
        if (document.getElementById('expenseQty')) document.getElementById('expenseQty').value = data.?賊? || '';
        if (document.getElementById('expenseUnitPrice')) document.getElementById('expenseUnitPrice').value = data.?桀 || '';
        if (document.getElementById('expenseTotalPrice')) document.getElementById('expenseTotalPrice').value = data.蝮賡? || '';
        if (document.getElementById('expenseUnit')) document.getElementById('expenseUnit').value = data.?桐? || '';
        if (document.getElementById('expenseNotes')) document.getElementById('expenseNotes').value = data.?酉 || '';
        showToast('?臬銴ˊ??', 'success');
      }, 50);
    }, 100);
  }
}

// ============================================================
// 10. 敹急?撌亙
// ============================================================

// ?嗅蝮質汗?∠?嚗???閮??嚗?隞僑嚗?
function renderRevenueSummary() {
  // 靽格迤?梯??????甇方???啗???璅惜??(憒?)
}

// ============================================================
// 12. ?嗅??
// ============================================================

/* Helper: ??憿?內 */
function getCategoryIcon(name) {
  const icons = {
    '?': 'nutrition',
    '瘞渲?獢?: 'sound_detection_dog_barking', // ?冽?摮?瘥??內???
    '璈?': 'lens_blur',
    '撌乩犖?芾?': 'engineering',
    '?極': 'engineering',
    '?交?': 'eco',
    '?': 'inventory_2',
    '颲脰': 'pest_control',
    '????': 'package_2',
    '?': 'receipt_long',
    '?': 'local_grocery_store',
    '隞?臬?閮?: 'more_horiz',
    '?嗡?': 'more_horiz'
  };
  // 璅∠??寥??內
  const match = Object.keys(icons).find(k => name.includes(k));
  return icons[match] || 'nest_multi_room';
}

/* Helper: ??隤????仿???*/
const CAT_COLORS = {
  '?':   { color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
  '瘞渲?獢?: { color: '#ec4899', bg: '#fdf2f8', border: '#fbcfe8' },
  '璈?':   { color: '#84cc16', bg: '#f7fee7', border: '#d9f99d' },
  '?箏??': { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  '霈??': { color: '#8b5cf6', bg: '#f3f0ff', border: '#ddd6fe' },
  '撌乩犖?芾?': { color: '#8b5cf6', bg: '#f3f0ff', border: '#ddd6fe' }
};
const CAT_FALLBACK_PALETTE = ['#22c55e','#3b82f6','#a855f7','#f97316','#eab308','#ef4444','#06b6d4','#64748b'];

function getCategoryColor(name, fallbackIndex = 0) {
  if (CAT_COLORS[name]) return CAT_COLORS[name];
  const c = CAT_FALLBACK_PALETTE[fallbackIndex % CAT_FALLBACK_PALETTE.length];
  return { color: c, bg: '#f8fafc', border: '#e2e8f0' };
}

/** 撱箇??椰皛＊蝷箇楊頛??芷????頛?(?拍?潭?璈?閫豢) */
function setupSwipeLogic(itemEl, editCb, delCb) {
  let startX = 0;
  let currentX = 0;
  let isSwiping = false;
  const content = itemEl.querySelector('.record-item-content');
  const actionWidth = 210; // 銝???

  itemEl.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isSwiping = true;
    content.style.transition = 'none'; // ???撱園
  }, { passive: true });

  itemEl.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    
    // ?芸?閮勗?撌行? (鞎?
    if (diff < 0) {
      const move = Math.max(diff, -actionWidth - 40); // 蝔凝憭?暺???
      content.style.transform = `translateX(${move}px)`;
    } else {
      content.style.transform = `translateX(0px)`;
    }
  }, { passive: true });

  itemEl.addEventListener('touchend', (e) => {
    isSwiping = false;
    content.style.transition = ''; // ?Ｗ儔?
    const finalDiff = currentX - startX;

    if (finalDiff < -actionWidth / 2) {
      itemEl.classList.add('swiped');
      content.style.transform = `translateX(-${actionWidth}px)`;
    } else {
      itemEl.classList.remove('swiped');
      content.style.transform = `translateX(0px)`;
    }
  });

  // 撠?孛?扯?蝵?(皛?)嚗隞仿???..??靽??梯?????
  // ?ㄐ? itemEl ?折??梯?????
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'record-item-actions-swipe';
  actionsWrap.innerHTML = `
    <button class="swipe-btn copy"><span class="material-symbols-outlined">content_copy</span>銴ˊ</button>
    <button class="swipe-btn edit"><span class="material-symbols-outlined">edit</span>蝺刻摩</button>
    <button class="swipe-btn del"><span class="material-symbols-outlined">delete</span>?芷</button>
  `;
  actionsWrap.querySelector('.copy').onclick = (e) => { 
    e.stopPropagation(); 
    // ??閬??type嚗ㄐ?臭誑敺?itemEl ?惇?扳???賣?脣?
    // ?箔???改?霈?itemEl ?葆??喳?游??
    const type = itemEl.dataset.type;
    const dataId = itemEl.dataset.id;
    if (type && dataId) {
      const data = (type === 'income' ? incomeData : (type === 'order' ? ordersData : expenseData)).find(x => x.id === dataId);
      duplicateRecord(type, data);
    }
    itemEl.classList.remove('swiped'); 
    content.style.transform = 'translateX(0)'; 
  };
  actionsWrap.querySelector('.edit').onclick = (e) => { e.stopPropagation(); editCb(); itemEl.classList.remove('swiped'); content.style.transform = 'translateX(0)'; };
  actionsWrap.querySelector('.del').onclick  = (e) => { e.stopPropagation(); delCb(); itemEl.classList.remove('swiped'); content.style.transform = 'translateX(0)'; };
  
  itemEl.appendChild(actionsWrap);

  // 暺? content ?撌脣?????
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
let _orderPieInstance = null;

function renderIncomeChart() {
  const period = filterState.income.period;
  const data = getFilteredByPeriod(incomeData, '?交?', period);

  const catMap = {};
  settings.incomeMainCats.forEach((c, i) => {
    const clr = getCategoryColor(c.?迂, i);
    catMap[c.?迂] = { total: 0, count: 0, pending: 0, unpaidAmount: 0, ...clr };
  });

  let grandTotal = 0;
  data.forEach(r => {
    const key = r.銝駁???
    if (!catMap[key]) {
      const clr = getCategoryColor(key, Object.keys(catMap).length);
      catMap[key] = { total: 0, count: 0, pending: 0, unpaidAmount: 0, ...clr };
    }
    const price = parseFloat(r.蝮賢) || 0;
    catMap[key].total += price;
    catMap[key].count++;
    grandTotal += price;
    if (r.隞狡???!== '撌脖?甈?) {
      catMap[key].pending++;
      catMap[key].unpaidAmount += price;
    }
  });

  document.getElementById('incomeTotalSummary').textContent = `蝮質?嚗?${grandTotal.toLocaleString()}`;

  const entries = Object.entries(catMap).filter(([, v]) => v.count > 0);

  // ????
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

  // ?喳?寞
  const area = document.getElementById('incomeChartArea');
  if (!area) return;
  area.innerHTML = '';

  if (entries.length === 0) {
    area.innerHTML = '<p style="color:var(--text-xs);font-size:0.82rem;padding:0.5rem 0">閰脫?畾萄??∠???/p>';
    return;
  }

  entries.sort((a, b) => b[1].total - a[1].total).forEach(([name, v]) => {
    const color = catMap[name]?.color || '#22c55e';
    const d = document.createElement('div');
    d.className = 'pie-legend-item';
    d.style.cursor = 'pointer';
    d.innerHTML = `
      <span class="pie-legend-dot" style="background:${color}"></span>
      <span class="pie-legend-name">${name}<span style="color:var(--text-muted);font-size:0.7rem;margin-left:4px">${v.count}蝑?{v.pending>0?`繚??${v.pending}?芣`:''}</span></span>
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

// ?????? ???嗅
document.querySelector('#incomeChartCard')?.addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('#incomeChartCard .period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterState.income.period = btn.dataset.period;
  renderIncomeChart();
});


// --- 蝭拚 chips ---
function renderIncomeFilterChips() {
  const mainContainer = document.getElementById('incomeMainCatChips');
  const subContainer = document.getElementById('incomeSubCatChips');
  if (!mainContainer || !subContainer) return;
  
  mainContainer.innerHTML = '';
  subContainer.innerHTML = '';

  const mainCats = settings.incomeMainCats.map(c => c.?迂).filter(n => incomeData.some(r => r.銝駁???=== n));
  if (!filterState.income.mainCat && mainCats.length > 0) {
    filterState.income.mainCat = mainCats[0];
  }

  mainCats.forEach(cat => {
    const btn = document.createElement('button');
    const isActive = filterState.income.mainCat === cat;
    btn.className = `filter-chip${isActive ? ' active' : ''}`;
    btn.textContent = cat;
    btn.onclick = () => {
      filterState.income.mainCat = cat;
      filterState.income.subCat = null;
      renderIncomeFilterChips();
      renderIncomeTable();
    };
    mainContainer.appendChild(btn);
  });

  if (filterState.income.mainCat) {
    const cat = settings.incomeMainCats.find(c => c.?迂 === filterState.income.mainCat);
    const subs = (cat && cat.甈⊿??? ? cat.甈⊿???filter(Boolean) : [];
    if (subs.length > 0) {
      subContainer.style.display = 'flex';
      subs.forEach(sub => {
        const btn = document.createElement('button');
        const isSubActive = filterState.income.subCat === sub;
        btn.className = `filter-chip${isSubActive ? ' active' : ''}`;
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
  this.title = filterState.income.sortOrder === 'desc' ? '?交??售??? : '?交?????;
  renderIncomeTable();
};

document.getElementById('incomeCopyBtn').onclick = () => openCopyModal('income');

// --- 銵冽嚗????∠??? ---
function renderIncomeTable() {
  let data = [...incomeData];
  if (filterState.income.mainCat) data = data.filter(r => r.銝駁???=== filterState.income.mainCat);
  if (filterState.income.subCat) data = data.filter(r => r.摰Ｘ憿 === filterState.income.subCat);

  data.sort((a, b) => {
    const diff = new Date(a.?交?) - new Date(b.?交?);
    return filterState.income.sortOrder === 'desc' ? -diff : diff;
  });

  const container = document.getElementById('incomeRecordContainer');
  const empty = document.getElementById('incomeEmpty');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('horizontal-scroll-row');

  if (data.length === 0) { 
    container.classList.remove('horizontal-scroll-row');
    empty.style.display = 'block'; 
    return; 
  }
  empty.style.display = 'none';

  const mainCatSet = filterState.income.mainCat
    ? [filterState.income.mainCat]
    : [...new Set(settings.incomeMainCats.map(c => c.?迂))].filter(n => data.some(r => r.銝駁???=== n));

  mainCatSet.forEach((catName, ci) => {
    const catData = data.filter(r => r.銝駁???=== catName);
    if (catData.length === 0) return;

    const catTotal = catData.reduce((s, r) => s + (parseFloat(r.蝮賢) || 0), 0);
    const clr = getCategoryColor(catName, ci);
    const color = clr.color;

    // 銝駁??亙?憛?
    const section = document.createElement('div');
    section.className = 'record-section';
    section.style.backgroundColor = clr.bg;

    const header = document.createElement('div');
    header.className = 'record-section-header';
    header.innerHTML = `
      <div class="record-section-left">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px"></span>
        ${catName}
        <span class="record-section-count">${catData.length}蝑?/span>
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

    // 靘僑-???交???
    const yearMap = {};
    catData.forEach(r => {
      const yr = r.?交? ? r.?交?.substring(0, 4) : '?芰';
      const mo = r.?交? ? r.?交?.substring(0, 7) : '?芰';
      if (!yearMap[yr]) yearMap[yr] = {};
      if (!yearMap[yr][mo]) yearMap[yr][mo] = [];
      yearMap[yr][mo].push(r);
    });

    const sortedYears = Object.keys(yearMap).sort((a, b) => b.localeCompare(a));
    sortedYears.forEach(yr => {
      const yrDiv = document.createElement('div');

      const yrHeader = document.createElement('div');
      yrHeader.className = 'record-year-header';
      const yrTotal = Object.values(yearMap[yr]).flat().reduce((s, r) => s + (parseFloat(r.蝮賢) || 0), 0);
      yrHeader.innerHTML = `<span>?? ${yr} 撟?/span><span style="font-weight:600;color:var(--green-dark)">$${yrTotal.toLocaleString()}</span>`;

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
        const moTotal = moList.reduce((s, r) => s + (parseFloat(r.蝮賢) || 0), 0);
        moHeader.innerHTML = `<span>${mo.substring(5, 7)} ??<span class="record-section-count">${moList.length}蝑?/span></span><span>$${moTotal.toLocaleString()}</span>`;

        const moBody = document.createElement('div');
        moBody.className = 'record-month-body expanded';

        moHeader.onclick = () => moBody.classList.toggle('expanded');

        moList.forEach(r => {
          const gradeArr = Array.isArray(r.蝑?鞈?) ? r.蝑?鞈? : [];
          const gradeText = gradeArr.map(g => `${g.蝑?} ${g.?斗||''}??{g.蝞望 ? ' ' + g.蝞望 + '蝞? : ''}`).join(' / ') || '';
          const price = r.蝮賢 ? `$${parseFloat(r.蝮賢).toLocaleString()}` : '敺Ⅱ隤?;

          const payClass = r.隞狡???=== '撌脖?甈? ? 'paid' : 'unpaid';
          const reconClass = r.撠董???=== 'OK' ? 'ok-recon' : 'pending-recon';

          const item = document.createElement('div');
          item.className = 'record-item';
          item.dataset.type = 'income';
          item.dataset.id = r.id;
          const priceVal = parseFloat(r.蝮賢) || 0;
          const amtClass = getAmountClass(priceVal);

          item.innerHTML = `
            <div class="record-item-content">
              <div class="record-item-date">${r.?交? ? r.?交?.substring(5) : '-'}</div>
              <div class="record-item-main">
                <div class="record-item-name">${r.摰Ｘ?迂 || r.摰Ｘ憿 || catName}${r.?酉 ? ` 繚 ${r.?酉}` : ''}</div>
                <div class="record-item-sub">${gradeText ? `蝑?嚗?{gradeText}` : ''}${r.蝮賡? ? ` | ${r.蝮賡?}?亡 : ''}${r.蝞望 ? `/${r.蝞望}蝞常 : ''}</div>
                <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
                  <button class="btn-quick-toggle ${payClass}" onclick="toggleIncomePayment('${r.id}')">${r.隞狡???=== '撌脖?甈? ? '??撌脖?甈? : '???芯?甈?}</button>
                  <button class="btn-quick-toggle ${reconClass}" onclick="toggleIncomeRecon('${r.id}')">${r.撠董???=== 'OK' ? '??OK' : '敺?撣?}</button>
                </div>
              </div>
              <div class="record-item-right">
                <span class="record-item-amount ${amtClass}">${price}</span>
                ${r.?文???? `<small style="color:var(--text-muted);font-size:0.68rem">??$${parseFloat(r.?文???.toLocaleString()}</small>` : ''}
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

// ?嗅隞狡????萄???
window.toggleIncomePayment = async (id) => {
  const r = incomeData.find(x => x.id === id);
  if (!r) return;
  const newStatus = r.隞狡???=== '撌脖?甈? ? '?芯?甈? : '撌脖?甈?;
  const idx = incomeData.findIndex(x => x.id === id);
  const rowNum = idx + 2;
  showLoader('?湔銝?..');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.MARKET_INCOME}!N${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newStatus]] }
    });
    r.隞狡???= newStatus;
    renderIncomeTable();
    showToast(newStatus === '撌脖?甈? ? '??撌脫?閮歇隞狡' : '璅??箸隞狡');
  } catch (e) { showToast('?湔憭望?嚗? + e.message, 'error'); }
  hideLoader();
};

// ?嗅撠董????萄???
window.toggleIncomeRecon = async (id) => {
  const r = incomeData.find(x => x.id === id);
  if (!r) return;
  const newStatus = r.撠董???=== 'OK' ? '敺?撣? : 'OK';
  const idx = incomeData.findIndex(x => x.id === id);
  const rowNum = idx + 2;
  showLoader('?湔銝?..');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.MARKET_INCOME}!O${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newStatus]] }
    });
    r.撠董???= newStatus;
    renderIncomeTable();
    showToast('撠董??歇?湔');
  } catch (e) { showToast('?湔憭望?嚗? + e.message, 'error'); }
  hideLoader();
};


function renderOrderChart() {
  const period = filterState.order.period;
  const data = getFilteredByPeriod(ordersData, '銝??交?', period);

  const catMap = {};
  data.forEach((r, ri) => {
    const key = r.閮頃??;
    if (!catMap[key]) {
      const clr = getCategoryColor(key, Object.keys(catMap).length);
      catMap[key] = { total: 0, count: 0, pending: 0, unpaidAmount: 0, ...clr };
    }
    const price = parseFloat(r.蝮賢) || 0;
    catMap[key].total += price;
    catMap[key].count++;
    if (r.隞狡???!== '撌脖?甈?) { catMap[key].pending++; catMap[key].unpaidAmount += price; }
  });

  let grandTotal = data.reduce((acc, r) => acc + (parseFloat(r.蝮賢) || 0), 0);
  document.getElementById('orderTotalSummary').textContent = `蝮質?嚗?${grandTotal.toLocaleString()}`;

  const entries = Object.entries(catMap).filter(([, v]) => v.count > 0);

  // ????
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

  // ?喳??
  const area = document.getElementById('orderChartArea');
  if (!area) return;
  area.innerHTML = '';
  if (entries.length === 0) { area.innerHTML = '<p style="color:var(--text-xs);font-size:0.82rem;padding:0.5rem 0">閰脫?畾萄??∟???/p>'; return; }
  entries.sort((a, b) => b[1].total - a[1].total).forEach(([name, v]) => {
    const d = document.createElement('div');
    d.className = 'pie-legend-item';
    d.style.cursor = 'pointer';
    d.innerHTML = `
      <span class="pie-legend-dot" style="background:${v.color}"></span>
      <span class="pie-legend-name">${name}<span style="color:var(--text-muted);font-size:0.7rem;margin-left:4px">${v.count}蝑?{v.pending>0?`繚??{v.pending}?芯?`:''}</span></span>
      <span class="pie-legend-val" style="color:${v.color}">$${v.total.toLocaleString()}</span>`;
    area.appendChild(d);
  });

  // ?芸鞎函?蝝??賊???
  const unshipped = ordersData.filter(r => r.???!== '撌脣鞎?);
  const unshippedSummary = document.getElementById('orderUnshippedSummary');
  if (unshippedSummary && unshipped.length > 0) {
    const gradeCount = {};
    unshipped.forEach(r => {
      const content = r.閮?批捆 || '';
      const matches = content.matchAll(/([2-7]A)[嚗?]?\s*(\d+)/g);
      for (const m of matches) {
        if (!gradeCount[m[1]]) gradeCount[m[1]] = 0;
        gradeCount[m[1]] += parseInt(m[2]);
      }
    });
    const gradeHtml = Object.entries(gradeCount).sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([g, qty]) => `<span class="order-unshipped-item"><strong>${g}</strong>嚗?{qty}</span>`).join('');
    unshippedSummary.innerHTML = `
      <div class="order-unshipped-title">?? ?芸鞎?${unshipped.length} 蝑?靘?蝝?</div>
      <div class="order-unshipped-grid">${gradeHtml || '嚗蝑?鞈?嚗?}</div>`;
    unshippedSummary.style.display = '';
  } else if (unshippedSummary) { unshippedSummary.style.display = 'none'; }
}

function renderOrderFilterChips() {
  const mainContainer = document.getElementById('orderMainCatChips');
  const subContainer = document.getElementById('orderSubCatChips');
  if (!mainContainer || !subContainer) return;
  mainContainer.innerHTML = '';
  subContainer.innerHTML = '';

  // 敺?瞈暸??????葉??銝駁???
  const periodData = getFilteredByPeriod(ordersData, '銝??交?', filterState.order.period);
  const allMain = [...new Set(periodData.map(r => (r.閮頃?? || '').trim()).filter(Boolean))];

  // ?詨??摩嚗銝駁??亦蝛箔??????身?貊洵銝??
  if (!filterState.order.mainCat && allMain.length > 0) {
    filterState.order.mainCat = allMain[0];
  }

  allMain.forEach(cat => {
    const btn = document.createElement('button');
    const isActive = filterState.order.mainCat === cat;
    btn.className = `filter-chip${isActive ? ' active' : ''}`;
    btn.textContent = cat;
    btn.onclick = () => {
      filterState.order.mainCat = cat;
      filterState.order.subCat = null;
      renderOrderFilterChips();
      renderOrderTable();
    };
    mainContainer.appendChild(btn);
  });

  // 2. 甈⊿???
  if (filterState.order.mainCat) {
    const relOrders = periodData.filter(r => (r.閮頃?? || '').trim() === filterState.order.mainCat);
    const allSubs = [...new Set(relOrders.map(r => (r.??憿 || '').trim()).filter(Boolean))];
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
}

document.getElementById('orderClearFilter').onclick = () => {
  filterState.order.mainCat = null;
  filterState.order.subCat = null;
  renderOrderFilterChips();
  renderOrderTable();
};

document.querySelector('#orderChartCard')?.addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('#orderChartCard .period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterState.order.period = btn.dataset.period;
  renderOrderChart();
});

function renderOrderTable() {
  let data = getFilteredByPeriod(ordersData, '銝??交?', filterState.order.period);
  
  if (filterState.order.mainCat) data = data.filter(r => (r.閮頃?? || '').trim() === filterState.order.mainCat);
  if (filterState.order.subCat) data = data.filter(r => (r.??憿 || '').trim() === filterState.order.subCat);

  const container = document.getElementById('orderRecordContainer');
  const empty = document.getElementById('orderEmpty');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('horizontal-scroll-row');

  if (data.length === 0) {
    container.classList.remove('horizontal-scroll-row');
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // 靘蜓憿嚗?鞈澆?????憛?
  // ?蔥?身摰葉?????祕?????蜓憿嚗Ⅱ靽??箸?
  const allPossibleCats = [...new Set([
    ...settings.incomeMainCats.map(c => c.?迂),
    ...data.map(r => r.閮頃??)
  ])].filter(n => data.some(r => r.閮頃?? === n));

  const mainCatSet = filterState.order.mainCat ? [filterState.order.mainCat] : allPossibleCats;

  mainCatSet.forEach((catName, ci) => {
    const catData = data.filter(r => r.閮頃?? === catName);
    if (catData.length === 0) return;
    
    const clr = getCategoryColor(catName, ci);
    const color = clr.color;

    const section = document.createElement('div');
    section.className = 'record-section';
    section.style.backgroundColor = clr.bg;

    const catTotal = catData.reduce((s, r) => s + (parseFloat(r.蝮賢) || 0), 0);
    const header = document.createElement('div');
    header.className = 'record-section-header';
    header.innerHTML = `
      <div class="record-section-left">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px"></span>
        ${catName}
        <span class="record-section-count">${catData.length}蝑?/span>
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

    // ?歇?箄疏????箄疏??
    const shipped = catData.filter(r => r.???=== '撌脣鞎?);
    const unshipped = catData.filter(r => r.???!== '撌脣鞎?);

    // --- ?芸鞎典??憛??身撅?嚗?--
    if (unshipped.length > 0) {
      const unshipSection = buildOrderSubSection('?芸鞎?, unshipped, true, false, color);
      body.appendChild(unshipSection);
    }

    // --- 撌脣鞎典??憛??身??嚗?--
    if (shipped.length > 0) {
      const shipSection = buildOrderSubSection('撌脣鞎?, shipped, false, true, '#94a3b8');
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

  const total = records.reduce((s, r) => s + (parseFloat(r.蝮賢) || 0), 0);
  const h = document.createElement('div');
  h.className = 'record-subsection-header';
  h.innerHTML = `
    <span style="color:${isShipped?'var(--text-muted)':'var(--orange)'}">
      ${isShipped ? '? 撌脣鞎? : '???芸鞎?}
      <span class="record-section-count">${records.length}蝑?/span>
    </span>
    <span style="font-weight:600">$${total.toLocaleString()}</span>`;

  const b = document.createElement('div');
  b.className = `record-subsection-body${defaultExpanded ? ' expanded' : ''}`;

  h.onclick = () => b.classList.toggle('expanded');

  if (isShipped) {
    // 撌脣鞎剁?靘僑-???交?嚗?閮剜???
    const yearMap = {};
    records.forEach(r => {
      const dateKey = r.?啗疏?交? || r.銝??交? || '';
      const yr = dateKey.substring(0,4) || '?芰';
      const mo = dateKey.substring(0,7) || '?芰';
      if (!yearMap[yr]) yearMap[yr] = {};
      if (!yearMap[yr][mo]) yearMap[yr][mo] = [];
      yearMap[yr][mo].push(r);
    });
    Object.keys(yearMap).sort((a,b) => b.localeCompare(a)).forEach(yr => {
      const yrDiv = document.createElement('div');
      const yrH = document.createElement('div');
      yrH.className = 'record-year-header';
      const yrTotal = Object.values(yearMap[yr]).flat().reduce((s,r) => s+(parseFloat(r.蝮賢)||0), 0);
      yrH.innerHTML = `<span>?? ${yr} 撟?/span><span>$${yrTotal.toLocaleString()}</span>`;
      const yrB = document.createElement('div');
      yrB.className = 'record-year-body'; // ?身??
      yrH.onclick = () => yrB.classList.toggle('expanded');
      Object.keys(yearMap[yr]).sort((a,b) => b.localeCompare(a)).forEach(mo => {
        const moList = yearMap[yr][mo];
        const moDiv = document.createElement('div');
        const moH = document.createElement('div');
        moH.className = 'record-month-header';
        const moTotal = moList.reduce((s,r) => s+(parseFloat(r.蝮賢)||0),0);
        moH.innerHTML = `<span>${mo.substring(5,7)} ??<span class="record-section-count">${moList.length}蝑?/span></span><span>$${moTotal.toLocaleString()}</span>`;
        const moB = document.createElement('div');
        moB.className = 'record-month-body'; // ?身??
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
    // ?芸鞎剁??????????摰鞎具???撟湔?
    const unspecified = records.filter(r => r.???=== '?芣?摰?);
    const scheduled = records.filter(r => r.???=== '???箄疏' || r.???=== '撌脫?摰?);

    if (unspecified.length > 0) {
      const uH = document.createElement('div');
      uH.className = 'record-year-header';
      uH.innerHTML = `<span style="color:var(--text-muted)">?? ?芣?摰鞎冽??/span><span class="record-section-count">${unspecified.length}蝑?/span>`;
      const uB = document.createElement('div');
      uB.className = 'record-year-body expanded';
      uH.onclick = () => uB.classList.toggle('expanded');
      unspecified.sort((a,b) => new Date(b.銝??交?||0) - new Date(a.銝??交?||0)).forEach(r => uB.appendChild(buildOrderItem(r)));
      b.appendChild(uH);
      b.appendChild(uB);
    }
    if (scheduled.length > 0) {
      const sH = document.createElement('div');
      sH.className = 'record-year-header';
      sH.innerHTML = `<span style="color:var(--blue)">?? ???箄疏</span><span class="record-section-count">${scheduled.length}蝑?/span>`;
      const sB = document.createElement('div');
      sB.className = 'record-year-body expanded';
      sH.onclick = () => sB.classList.toggle('expanded');
      scheduled.sort((a,b) => new Date(a.?啗疏?交?||a.銝??交?||0) - new Date(b.?啗疏?交?||b.銝??交?||0)).forEach(r => sB.appendChild(buildOrderItem(r)));
      b.appendChild(sH);
      b.appendChild(sB);
    }
  }

  wrap.appendChild(h);
  wrap.appendChild(b);
  return wrap;
}

function buildOrderItem(r) {
  const payClass = r.隞狡???=== '撌脖?甈? ? 'paid' : 'unpaid';
  const reconClass = r.撠董???=== 'OK' ? 'ok-recon' : 'pending-recon';
  const isShipped = r.???=== '撌脣鞎?;

  // ?澆???＊蝷綽??交??啗疏?交??＊蝷箝 MM-DD???血?憿舐內?? MM-DD??
  const formatDate = (dateStr, prefix) => {
    if (!dateStr) return '';
    const clean = dateStr.trim();
    if (clean.length > 5) return `${prefix} ${clean.substring(5)}`;
    return `${prefix} ${clean}`;
  };
  const dateDisplay = r.???=== '?芣?摰? 
    ? formatDate(r.銝??交?, '閮?) 
    : (r.?啗疏?交? ? formatDate(r.?啗疏?交?, '??) : formatDate(r.銝??交?, '閮?));

  // 閮?????
  const statusToggle = !isShipped
    ? `<button class="btn-quick-toggle" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe" onclick="cycleOrderStatus('${r.id}')">${r.??</button>`
    : `<span class="status-badge paid" style="font-size:0.68rem">撌脣鞎?/span>`;

  const item = document.createElement('div');
  item.className = 'record-item';
  item.dataset.type = 'order';
  item.dataset.id = r.id;
  const priceVal = parseFloat(r.蝮賢 || 0);
  const amtClass = getAmountClass(priceVal);

  item.innerHTML = `
    <div class="record-item-content">
      <div class="record-item-date">${dateDisplay}</div>
      <div class="record-item-main">
        <div class="record-item-name">${r.撖辣鈭?|| '?芰摰Ｘ'}${r.??憿 ? ` 繚 ${r.??憿}` : ''}</div>
        <div class="record-item-sub">${r.閮頃蝑? || ''}${r.閮?批捆 ? ` | ${r.閮?批捆}` : ''}${r.?疏?孵? ? ` | ${r.?疏?孵?}` : ''}</div>
        <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
          ${statusToggle}
          <button class="btn-quick-toggle ${payClass}" onclick="toggleOrderPayment('${r.id}')">${r.隞狡???=== '撌脖?甈? ? '??撌脖?甈? : '???芯?甈?}</button>
          <button class="btn-quick-toggle ${reconClass}" onclick="toggleOrderRecon('${r.id}')">${r.撠董???=== 'OK' ? '??OK' : '敺?撣?}</button>
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
  const cycle = ['?芣?摰?, '???箄疏', '撌脫?摰?, '撌脣鞎?];
  const idx = cycle.indexOf(r.???;
  const newStatus = cycle[(idx + 1) % cycle.length];
  await updateOrderStatus(id, newStatus);
};

window.toggleOrderPayment = async (id) => {
  const r = ordersData.find(x => x.id === id);
  if (!r) return;
  const newStatus = r.隞狡???=== '撌脖?甈? ? '?芯?甈? : '撌脖?甈?;
  const rowNum = r._localIdx;
  showLoader('?湔銝?..');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${SHEET.ORDERS}!Q${rowNum}`,
      valueInputOption: 'USER_ENTERED', resource: { values: [[newStatus]] }
    });
    r.隞狡???= newStatus;
    renderOrderTable();
    showToast(newStatus === '撌脖?甈? ? '??撌脖?甈? : '???芯?甈?);
  } catch (e) { showToast('?湔憭望?嚗? + e.message, 'error'); }
  hideLoader();
};

window.toggleOrderRecon = async (id) => {
  const r = ordersData.find(x => x.id === id);
  if (!r) return;
  if (r.隞狡???!== '撌脖?甈?) { showToast('隢?蝣箄?隞狡???, 'warning'); return; }
  const newStatus = r.撠董???=== 'OK' ? '敺?撣? : 'OK';
  const rowNum = r._localIdx;
  showLoader('?湔銝?..');
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID, range: `${SHEET.ORDERS}!R${rowNum}`,
      valueInputOption: 'USER_ENTERED', resource: { values: [[newStatus]] }
    });
    r.撠董???= newStatus;
    renderOrderTable();
    showToast('撠董??歇?湔');
  } catch (e) { showToast('?湔憭望?嚗? + e.message, 'error'); }
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
  ordersData[idx].???= newStatus;
  renderOrderTable();
  const rowNum = ordersData[idx]._localIdx;
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET.ORDERS}!C${rowNum}:C${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newStatus]] }
    });
    showToast('閮???唳???, 'success');
  } catch (e) {
    showToast('?湔閮??仃??, 'error');
  }
}

function setupEditModeToggle() {
  const configs = [
    { btnId: 'incomeEditModeBtn', containerId: 'incomeRecordContainer', state: filterState.income },
    { btnId: 'orderEditModeBtn', containerId: 'orderRecordContainer', state: filterState.order },
    { btnId: 'expenseEditModeBtn', containerId: 'expenseRecordContainer', state: filterState.expense },
  ];

  configs.forEach(cfg => {
    const btn = document.getElementById(cfg.btnId);
    const container = document.getElementById(cfg.containerId);
    if (!btn || !container) return;

    // ??????
    if (cfg.state.isEditMode) {
      container.classList.add('edit-mode-active');
      btn.classList.add('active');
    }

    btn.onclick = () => {
      cfg.state.isEditMode = !cfg.state.isEditMode;
      const isActive = cfg.state.isEditMode;
      container.classList.toggle('edit-mode-active', isActive);
      btn.classList.toggle('active', isActive);
      showToast(isActive ? '蝞∠?璅∪?嚗歇??' : '蝞∠?璅∪?嚗歇??');
    };
  });
}

// ============================================================
// 10. ?嗅銵典 Modal
// ============================================================
// ============================================================
// 11. ?嗅銵典 Modal
// ============================================================

function openIncomeModal(record = null) {
  document.getElementById('fabContainer') ? (document.getElementById('fabContainer').style.display = 'none') : null;
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'none';

  const isEdit = !!record;
  const titleEl = document.getElementById('incomeModalTitle');
  if (titleEl) titleEl.textContent = isEdit ? '蝺刻摩撣?嗅' : '撣?嗅';
  
  const modal = document.getElementById('incomeModal');
  if (modal) modal.style.display = 'flex';
  
  // ?蔭????
  const toggle = document.querySelector('input[name="incomeTypeToggle"][value="income"]');
  if (toggle) toggle.checked = true;

  const idEl = document.getElementById('incomeRecordId');
  if (idEl) idEl.value = isEdit ? record.id : '';
  
  const dateEl = document.getElementById('incomeDate');
  if (dateEl) dateEl.value = isEdit ? record.?交? : today();
  
  const noteEl = document.getElementById('incomeNotes');
  if (noteEl) noteEl.value = isEdit ? record.?酉 : '';
  
  const priceEl = document.getElementById('incomeTotalPrice');
  if (priceEl) priceEl.value = isEdit ? record.蝮賢 : '';
  
  const dealerEl = document.getElementById('incomeDealerPrice');
  if (dealerEl) dealerEl.value = isEdit ? record.?文???: '';
  
  const shipEl = document.getElementById('incomeShippingFee');
  if (shipEl) shipEl.value = isEdit ? record.?祥 : '';

  // ?唳?雿?憛?(靘? HTML 撖行?瘙箏??臬摮?)
  const custTypeEl = document.getElementById('incomeCustomerType');
  if (custTypeEl) custTypeEl.value = isEdit ? (record.摰Ｘ憿 || '銝??) : '銝??;
  
  const custNameEl = document.getElementById('incomeCustomerName');
  if (custNameEl) custNameEl.value = isEdit ? (record.摰Ｘ?迂 || '') : '';
  
  const payStatusEl = document.getElementById('incomePaymentStatus');
  if (payStatusEl) payStatusEl.value = isEdit ? (record.隞狡???|| '?芯?甈?) : '?芯?甈?;
  
  const reconStatusEl = document.getElementById('incomeReconStatus');
  if (reconStatusEl) reconStatusEl.value = isEdit ? (record.撠董???|| '敺?撣?) : '敺?撣?;

  // 憛怠?銝駁???
  const sel = document.getElementById('incomeMainCat');
  if (sel) {
    sel.innerHTML = settings.incomeMainCats.map(c => `<option value="${c.?迂}">${c.?迂}</option>`).join('');
    sel.value = isEdit ? record.銝駁???: (settings.incomeMainCats[0]?.?迂 || '');
    onIncomeMainCatChange();
  }

  const otherNoteEl = document.getElementById('incomeOtherNote');
  if (otherNoteEl && isEdit) {
    otherNoteEl.value = record.甈⊿???|| record.?嗡??酉 || '';
  }

  // 憛怠?蝑???
  const container = document.getElementById('gradeRowsContainer');
  if (container) {
    container.innerHTML = '';
    let grades = [];
    if (isEdit && Array.isArray(record.蝑?鞈?) && record.蝑?鞈?.length > 0) {
      grades = record.蝑?鞈?;
    } else {
      const mainCat = sel.value || '';
      if (mainCat.includes('瘞渲?獢?)) {
        grades = [
          { 蝑?: '2A', ?斗: '', 蝞望: '' },
          { 蝑?: '3A', ?斗: '', 蝞望: '' },
          { 蝑?: '4A', ?斗: '', 蝞望: '' },
          { 蝑?: '5A', ?斗: '', 蝞望: '' },
          { 蝑?: '6A', ?斗: '', 蝞望: '' }
        ];
      } else {
        grades = [{ 蝑?: '3A', ?斗: '', 蝞望: '' }];
      }
    }
    grades.forEach(g => addGradeRow(g));
  }

  if (modal) modal.style.display = 'flex';
}

function openIncomeEdit(id) {
  const r = incomeData.find(x => x.id === id);
  if (r) openIncomeModal(r);
}
window.openIncomeEdit = openIncomeEdit;

// ??憛怠?寞??modal嚗翰?瑞楊頛荔?
window.openFillPriceModal = function(id) {
  const r = incomeData.find(x => x.id === id);
  if (r) openIncomeModal(r);
};

function closeIncomeModal() {
  const modal = document.getElementById('incomeModal');
  if (modal) modal.style.display = 'none';
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'flex';
  const form = document.getElementById('incomeForm');
  if (form) form.reset();
  const otherWrap = document.getElementById('incomeOtherNoteWrap');
  if (otherWrap) otherWrap.style.display = 'none';
  const customWrap = document.getElementById('incomeCustomCatWrap');
  if (customWrap) customWrap.style.display = 'none';
}

document.getElementById('incomeMainCat').addEventListener('change', onIncomeMainCatChange);
function onIncomeMainCatChange() {
  const val = document.getElementById('incomeMainCat').value;
  const isOther = val === '?嗡?';
  const isAddNew = val === 'ADD_NEW';
  let w1 = document.getElementById('incomeOtherNoteWrap'); if(w1) w1.style.display = isOther ? 'flex' : 'none';
  let w2 = document.getElementById('incomeCustomCatWrap'); if(w2) w2.style.display = isAddNew ? 'flex' : 'none';
}

document.getElementById('addGradeRowBtn').onclick = () => addGradeRow();

function addGradeRow(data = null) {
  const container = document.getElementById('gradeRowsContainer');
  const row = document.createElement('div');
  row.className = 'grade-row';
  row.innerHTML = `
    <select class="grade-sel">
      ${GRADE_OPTIONS.map(g => `<option value="${g}" ${data?.蝑? === g ? 'selected' : ''}>${g}</option>`).join('')}
    </select>
    <input type="number" class="grade-jin" placeholder="?斗" min="0" step="0.1" value="${data?.?斗 || ''}">
    <input type="number" class="grade-box" placeholder="蝞望" min="0" step="1" value="${data?.蝞望 || ''}">
    <button type="button" class="btn-icon-sm" onclick="this.parentElement.remove()" title="蝘駁">
      <span class="material-symbols-outlined">close</span>
    </button>`;
  container.appendChild(row);
}

document.getElementById('incomeForm').onsubmit = async (e) => {
  e.preventDefault();
  const submitType = e.submitter ? e.submitter.value : 'close';
  const btns = document.querySelectorAll('#incomeForm button[type="submit"]');
  
  const totalPrice = document.getElementById('incomeTotalPrice').value;
  if (totalPrice && parseFloat(totalPrice) < 0) {
    showToast('??銝撠 0', 'error');
    return;
  }

  btns.forEach(b => b.disabled = true);

  const id = document.getElementById('incomeRecordId').value;
  const isEdit = !!id;

  // ?園?蝑?鞈?
  const gradeRows = document.querySelectorAll('#gradeRowsContainer .grade-row');
  const gradeData = [];
  let totalWeight = 0;
  let totalBoxes = 0;
  gradeRows.forEach(row => {
    const grade = row.querySelector('.grade-sel').value;
    const jin = parseFloat(row.querySelector('.grade-jin').value) || 0;
    const box = parseInt(row.querySelector('.grade-box').value) || 0;
    if (jin > 0 || box > 0) {
      gradeData.push({ 蝑?: grade, ?斗: jin, 蝞望: box });
      totalWeight += jin;
      totalBoxes += box;
    }
  });

  let mainCat = document.getElementById('incomeMainCat').value;
  let isNewCat = false;
  if (mainCat === 'ADD_NEW') {
    mainCat = document.getElementById('incomeCustomCat').value.trim();
    if (!mainCat) { 
      showToast('隢撓?交?車?迂', 'error'); 
      btns.forEach(b => b.disabled = false);
      return; 
    }
    isNewCat = true;
  }

  const dataObj = {
    id: id || generateId(),
    ?交?: document.getElementById('incomeDate').value,
    摰Ｘ憿: document.getElementById('incomeCustomerType') ? document.getElementById('incomeCustomerType').value : '銝??,
    摰Ｘ?迂: document.getElementById('incomeCustomerName') ? document.getElementById('incomeCustomerName').value : '',
    銝駁??? mainCat,
    甈⊿??? mainCat === '?嗡?' ? document.getElementById('incomeOtherNote').value : (document.getElementById('incomeOtherNote').value || ''),
    蝑?鞈?: JSON.stringify(gradeData),
    蝮賡?: totalWeight || '',
    蝞望: totalBoxes || '',
    蝮賢: totalPrice,
    ?文??? document.getElementById('incomeDealerPrice').value,
    ?祥: document.getElementById('incomeShippingFee').value,
    ?酉: document.getElementById('incomeNotes').value,
    隞狡??? document.getElementById('incomePaymentStatus') ? document.getElementById('incomePaymentStatus').value : '?芯?甈?,
    撠董??? document.getElementById('incomeReconStatus') ? document.getElementById('incomeReconStatus').value : '敺?撣?,
    撱箇???: isEdit ? (incomeData.find(r => r.id === id)?.撱箇??? || now()) : now(),
    ?敺?? now()
  };

  const rowData = syncHeadersAndPrepareData(SHEET.MARKET_INCOME, dataObj);

  showLoader(isEdit ? '?湔銝?..' : '?脣?銝?..');
  try {
    if (isNewCat) {
      await appendToSheet(SHEET.SETTINGS, ['?嗅銝駁???, mainCat, '', '', '']);
      await fetchSettings();
    }
    if (isEdit) {
      const rowIdx = incomeData.findIndex(r => r.id === id) + 2;
      await safeSheetsUpdate({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.MARKET_INCOME}!A${rowIdx}:R${rowIdx}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
    } else {
      await safeSheetsAppend({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET.MARKET_INCOME}!A:R`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
    }
    await fetchIncome();
    renderIncomeChart();
    renderIncomeTable();
    
    showToast(isEdit ? '???湔??' : '???嗅撌脰???);
    
    if (submitType === 'addNext') {
      const currentDate = document.getElementById('incomeDate').value;
      const currentMainCat = document.getElementById('incomeMainCat').value;
      document.getElementById('incomeForm').reset();
      document.getElementById('incomeRecordId').value = '';
      document.getElementById('incomeDate').value = currentDate;
      document.getElementById('incomeMainCat').value = currentMainCat;
      // ?蔭甈⊿??亥?摰Ｘ
      const subCatWrap = document.getElementById('incomeSubCatWrap');
      if (subCatWrap) subCatWrap.style.display = 'none';
      document.getElementById('gradeRowsContainer').innerHTML = '';
      // 閫貊 mainCat change 隞仿??啣‵??蝝?
      document.getElementById('incomeMainCat').dispatchEvent(new Event('change'));
      document.getElementById('incomeTotalPrice').focus();
    } else {
      closeIncomeModal();
    }
  } catch (err) {
    console.error(err);
    showToast('?脣?憭望?嚗? + err.message, 'error');
  } finally {
    btns.forEach(b => b.disabled = false);
    hideLoader();
  }
};

// ============================================================
// 11. ?臬??
// ============================================================

// --- ?” ---
// _expensePieInstance 撌脣?惜摰儔

function renderExpenseChart() {
  renderCompositeExpenseCard();
}


// ???? ???臬
document.querySelector('#expenseChartCard')?.addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('#expenseChartCard .period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterState.expense.period = btn.dataset.period;
  renderExpenseChart();
});

function calcExpenseTotal(r) {
  let total = (parseFloat(r.?賊?) || 0) * (parseFloat(r.?桀) || 0);
  if (r.?怠?擗? total += 100;
  if (r.蝮賡? && parseFloat(r.蝮賡?)) return parseFloat(r.蝮賡?);
  return total;
}

// 撌乩犖?敦?Ｘ
window.showWorkerDetail = function(name) {
  const panel = document.getElementById('workerDetailPanel');
  document.getElementById('workerDetailName').textContent = `?????${name} ?鞈?蝝躬;
  panel.style.display = 'block';

  const records = expenseData.filter(r => r.撌乩犖憪? === name);
  const content = document.getElementById('workerDetailContent');

  if (records.length === 0) {
    content.innerHTML = '<p style="padding:1rem;color:var(--text-muted)">?怎蝝??/p>';
    return;
  }

  const sorted = [...records].sort((a, b) => new Date(b.?交?) - new Date(a.?交?));
  let html = `<div class="table-wrap" style="margin:0;border:none;border-radius:0;box-shadow:none">
    <table class="records-table">
      <thead><tr><th>?交?</th><th>撌乩??</th><th>閮</th><th>??</th><th>??</th><th>撌脖?</th></tr></thead>
      <tbody>`;
  sorted.forEach(r => {
    const amt = calcExpenseTotal(r);
    const wageInfo = r.閮?孵? === 'hourly'
      ? `${r.?賊?}h ? $${r.?桀}`
      : `${r.?賊?}憭?? $${r.?桀}`;
    html += `<tr>
      <td>${r.?交?}</td>
      <td>${r.甈⊿???|| '-'}</td>
      <td style="font-size:0.75rem;color:var(--text-muted)">${wageInfo}</td>
      <td class="td-amount expense">$${amt.toLocaleString()}</td>
      <td>${r.?怠?擗?? '?? : ''}</td>
      <td>
        <button class="btn-toggle-paid" onclick="togglePaid('${r.id}')" title="${r.撌脫隞?? '暺璅??芯?' : '暺璅?撌脖?'}">
          <span class="status-badge ${r.撌脫隞?? 'paid' : 'unpaid'}">${r.撌脫隞?? '??撌脖?' : '?芯?'}</span>
        </button>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';

  const totalPaid = sorted.filter(r => r.撌脫隞?.reduce((s, r) => s + calcExpenseTotal(r), 0);
  const totalUnpaid = sorted.filter(r => !r.撌脫隞?.reduce((s, r) => s + calcExpenseTotal(r), 0);
  html += `<div style="padding:0.75rem 1rem;font-size:0.85rem;display:flex;gap:1rem;background:#f8fafc;border-top:1px solid var(--border)">
    <span>撌脖?嚗?strong style="color:var(--green-dark)">$${totalPaid.toLocaleString()}</strong></span>
    <span>?芯?嚗?strong style="color:var(--yellow)">$${totalUnpaid.toLocaleString()}</strong></span>
  </div>`;

  content.innerHTML = html;
};

document.getElementById('closeWorkerDetail').onclick = () => {
  document.getElementById('workerDetailPanel').style.display = 'none';
};

// ??撌脖????
window.togglePaid = async function(id) {
  const r = expenseData.find(x => x.id === id);
  if (!r) return;
  const newVal = !r.撌脫隞?
  const targetSheet = r._sourceSheet || SHEET.EXPENSE;
  
  // ?曉銵?
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${targetSheet}!A:A`
  });
  const ids = (res.result.values || []).map(row => row[0]);
  const rowIdx = ids.indexOf(id) + 1;

  if (rowIdx <= 0) {
    showToast('?曆??啁????⊥??湔???, 'error');
    return;
  }

  // ??撠?撌乩?銵函?甈?蝝Ｗ? (撌脫隞?雿?
  let col = '';
  if (targetSheet === SHEET.EXPENSE_SALARY) col = 'O'; // 15th col
  else if (targetSheet === SHEET.EXPENSE_COST) col = 'H'; // 8th col
  else col = 'K'; // ??

  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${targetSheet}!${col}${rowIdx}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newVal ? 'TRUE' : 'FALSE']] }
    });
    r.撌脫隞?= newVal;
    renderExpenseChart();
    renderExpenseTable();
    // ?皜脫?撌乩犖?敦
    if (r.撌乩犖憪?) showWorkerDetail(r.撌乩犖憪?);
    showToast(newVal ? '??撌脫?閮撌脫隞? : '撌脫?閮?芣隞?);
  } catch (e) {
    showToast('?湔憭望?', 'error');
  }
};

// --- 蝭拚 chips ---
function renderExpenseFilterChips() {
  const isSalaryTab = filterState.expense.type === 'worker';
  const container = document.getElementById(isSalaryTab ? 'salaryMainCatChips' : 'costMainCatChips');
  if (!container) return;
  container.innerHTML = '';

  const relMainCats = settings.expenseMainCats.filter(c => {
    if (isSalaryTab) return c.憿? === 'worker';
    return c.憿? !== 'worker';
  });

  relMainCats.forEach(cat => {
    const btn = document.createElement('button');
    const isActive = filterState.expense.mainCat === cat.?迂;
    btn.className = `filter-chip${isActive ? ' active' : ''}`;
    btn.textContent = cat.?迂;
    btn.onclick = () => {
      filterState.expense.mainCat = filterState.expense.mainCat === cat.?迂 ? null : cat.?迂;
      filterState.expense.subCat = null;
      renderExpenseFilterChips();
      renderExpenseTable();
    };
    container.appendChild(btn);
  });
}

document.getElementById('salaryClearFilter').onclick = () => {
  filterState.expense.mainCat = null;
  filterState.expense.subCat = null;
  renderExpenseFilterChips();
  renderExpenseTable();
};

document.getElementById('costClearFilter').onclick = () => {
  filterState.expense.mainCat = null;
  filterState.expense.subCat = null;
  renderExpenseFilterChips();
  renderExpenseTable();
};

document.getElementById('salarySortBtn').onclick = function() {
  filterState.expense.sortOrder = filterState.expense.sortOrder === 'desc' ? 'asc' : 'desc';
  renderExpenseTable();
};

document.getElementById('costSortBtn').onclick = function() {
  filterState.expense.sortOrder = filterState.expense.sortOrder === 'desc' ? 'asc' : 'desc';
  renderExpenseTable();
};

const expenseCopyBtn = document.getElementById('expenseCopyBtn');
if (expenseCopyBtn) expenseCopyBtn.onclick = () => openCopyModal('expense');

// --- 銵冽嚗????∠??? ---
function renderExpenseTable() {
  const isSalaryTab = filterState.expense.type === 'worker';
  let data = [...expenseData];
  
  // ??瞈暸???
  data = data.filter(r => {
    const cat = settings.expenseMainCats.find(c => c.?迂 === r.銝駁???;
    if (!cat) return false;
    if (isSalaryTab) return cat.憿? === 'worker';
    return cat.憿? !== 'worker';
  });

  // ??瞈曆蜓憿?活憿
  if (filterState.expense.mainCat) data = data.filter(r => r.銝駁???=== filterState.expense.mainCat);
  if (filterState.expense.subCat) {
    data = data.filter(r => {
      const subs = (r.甈⊿???|| '').split(',').map(s => s.trim());
      return subs.includes(filterState.expense.subCat);
    });
  }
  data.sort((a, b) => {
    const diff = new Date(a.?交?) - new Date(b.?交?);
    return filterState.expense.sortOrder === 'desc' ? -diff : diff;
  });

  const container = document.getElementById(isSalaryTab ? 'salaryRecordContainer' : 'costRecordContainer');
  const empty = document.getElementById(isSalaryTab ? 'salaryEmpty' : 'costEmpty');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('horizontal-scroll-row');

  if (data.length === 0) {
    container.classList.remove('horizontal-scroll-row');
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // 靘蜓憿??憛?
  const relMainCats = settings.expenseMainCats.filter(c => {
    if (isSalaryTab) return c.憿? === 'worker';
    return c.憿? !== 'worker';
  });

  const mainCatSet = filterState.expense.mainCat
    ? [filterState.expense.mainCat]
    : relMainCats.map(c => c.?迂).filter(n => data.some(r => r.銝駁???=== n));

  mainCatSet.forEach((catName, ci) => {
    const catData = data.filter(r => r.銝駁???=== catName);
    if (catData.length === 0) return;
    
    const clr = getCategoryColor(catName, ci);
    const color = clr.color;
    const catTotal = catData.reduce((s, r) => s + calcExpenseTotal(r), 0);

    const section = document.createElement('div');
    section.className = 'record-section';
    section.style.backgroundColor = clr.bg;

    const header = document.createElement('div');
    header.className = 'record-section-header';
    header.innerHTML = `
      <div class="record-section-left">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:2px"></span>
        ${catName}
        <span class="record-section-count">${catData.length}蝑?/span>
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

    // 靘僑-??蝯?
    const yearMap = {};
    catData.forEach(r => {
      const yr = r.?交? ? r.?交?.substring(0, 4) : '?芰';
      const mo = r.?交? ? r.?交?.substring(0, 7) : '?芰';
      if (!yearMap[yr]) yearMap[yr] = {};
      if (!yearMap[yr][mo]) yearMap[yr][mo] = [];
      yearMap[yr][mo].push(r);
    });

    Object.keys(yearMap).sort((a, b) => b.localeCompare(a)).forEach(yr => {
      const yrH = document.createElement('div');
      yrH.className = 'record-year-header';
      const yrTotal = Object.values(yearMap[yr]).flat().reduce((s, r) => s + calcExpenseTotal(r), 0);
      yrH.innerHTML = `<span>?? ${yr} 撟?/span><span style="font-weight:600;color:${color}">$${yrTotal.toLocaleString()}</span>`;
      const yrB = document.createElement('div');
      yrB.className = 'record-year-body expanded';
      yrH.onclick = () => yrB.classList.toggle('expanded');

      Object.keys(yearMap[yr]).sort((a, b) => b.localeCompare(a)).forEach(mo => {
        const moList = yearMap[yr][mo];
        const moH = document.createElement('div');
        moH.className = 'record-month-header';
        const moTotal = moList.reduce((s, r) => s + calcExpenseTotal(r), 0);
        moH.innerHTML = `<span>${mo.substring(5, 7)} ??<span class="record-section-count">${moList.length}蝑?/span></span><span>$${moTotal.toLocaleString()}</span>`;
        const moB = document.createElement('div');
        moB.className = 'record-month-body expanded';
        moH.onclick = () => moB.classList.toggle('expanded');

        moList.forEach(r => {
          const total = calcExpenseTotal(r);
          const payClass = r.撌脫隞?? 'paid' : 'unpaid';

          const item = document.createElement('div');
          item.className = 'record-item';
          item.dataset.type = 'expense';
          item.dataset.id = r.id;
          item.innerHTML = `
            <div class="record-item-content">
              <div class="record-item-date">${r.?交? ? r.?交?.substring(5) : '-'}</div>
              <div class="record-item-main">
                <div class="record-item-name">${r.甈⊿???|| catName}${r.撌乩犖憪? ? ` 繚 ${r.撌乩犖憪?}` : ''}</div>
                <div class="record-item-sub">${r.?賊? ? r.?賊? + (r.?桐? || '') : ''}${r.?桀 ? ` ? $${parseFloat(r.?桀).toLocaleString()}` : ''}${r.?酉 ? ` | ${r.?酉}` : ''}</div>
                <div style="margin-top:4px">
                  <button class="btn-quick-toggle ${payClass}" onclick="togglePaid('${r.id}')">${r.撌脫隞?? '??撌脫隞? : '???芣隞?}</button>
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
// 12. ?臬銵典 Modal
// ============================================================
// ============================================================
// 12. ?臬銵典 Modal
// ============================================================
function openExpenseModal(record = null, defaultType = null) {
  document.getElementById('fabContainer') ? (document.getElementById('fabContainer').style.display = 'none') : null;
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'none';
  const isEdit = !!record;
  document.getElementById('expenseModalTitle').textContent = isEdit ? '蝺刻摩?臬蝝?? : '?臬蝝??;
  document.getElementById('expenseRecordId').value = isEdit ? record.id : '';
  
  // ?郊???函???
  const typeVal = defaultType === 'material' ? 'cost' : 'salary';
  const toggle = document.querySelector(`input[name="expenseTypeToggle"][value="${typeVal}"]`);
  if (toggle) toggle.checked = true;
  document.getElementById('expenseDate').value = isEdit ? record.?交? : today();
  document.getElementById('expenseNotes').value = isEdit ? record.?酉 : '';
  document.getElementById('expenseIsPaid').checked = isEdit ? record.撌脫隞?: false;
  document.getElementById('includeLunch').checked = isEdit ? record.?怠?擗?: false;
  document.getElementById('expenseUnit').value = isEdit ? (record.?桐? || '') : '';
  
  // ?唳?雿??? (?身 7:00-12:00, 13:00-16:00)
  document.getElementById('salaryMorningStart').value = isEdit ? (record.銝?銝 || '') : '07:00';
  document.getElementById('salaryMorningEnd').value = isEdit ? (record.銝?隡 || '') : '12:00';
  document.getElementById('salaryAfternoonStart').value = isEdit ? (record.銝?銝 || '') : '13:00';
  document.getElementById('salaryAfternoonEnd').value = isEdit ? (record.銝?銝 || '') : '16:00';
  
  // ?唳?雿??臭??交?
  const paidDateEl = document.getElementById('expensePaidDate');
  if (paidDateEl) paidDateEl.value = isEdit ? (record.?臭??交? || '') : '';
  
  // ?湔?桐?銝??詨
  const unitList = document.getElementById('unitOptions');
  if (unitList) {
    unitList.innerHTML = settings.units.map(u => `<option value="${u}">`).join('');
  }

  // 銝駁??仿??
  const mainSel = document.getElementById('expenseMainCat');
  const availableCats = settings.expenseMainCats.filter(c => {
    if (defaultType === 'worker' || record?.閮?孵?) return c.憿? === 'worker';
    if (defaultType === 'material') return c.憿? !== 'worker';
    return true;
  });
  
  mainSel.innerHTML = availableCats.map(c => `<option value="${c.?迂}">${c.?迂}</option>`).join('');
  mainSel.value = isEdit ? record.銝駁???: availableCats[0]?.?迂;

  onExpenseMainCatChange(record);

  document.getElementById('expenseModal').style.display = 'flex';
}

function openExpenseEdit(id) {
  const r = expenseData.find(x => x.id === id);
  if (r) openExpenseModal(r);
}
window.openExpenseEdit = openExpenseEdit;

function closeExpenseModal() {
  const modal = document.getElementById('expenseModal');
  if (modal) modal.style.display = 'none';
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'flex';
  const form = document.getElementById('expenseForm');
  if (form) form.reset();
  const workerWrap = document.getElementById('expenseCustomWorkerWrap');
  if (workerWrap) workerWrap.style.display = 'none';
  const subWrap = document.getElementById('expenseCustomSubCatWrap');
  if (subWrap) subWrap.style.display = 'none';
}

document.getElementById('expenseMainCat').addEventListener('change', () => onExpenseMainCatChange());

// ??閮?蝮賡?
['expenseQty', 'expenseUnitPrice', 'expenseTotalPrice'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', (e) => updateExpenseTotal(e.target.id));
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
    // ?身?望???桀蝞蜇憿?
    const unitPrice = parseFloat(unitPriceInput.value) || 0;
    const total = Math.round(qty * unitPrice + lunch);
    totalPriceInput.value = total;
  }
}

function onExpenseMainCatChange(editRecord = null) {
  const mainVal = document.getElementById('expenseMainCat').value;
  const cat = settings.expenseMainCats.find(c => c.?迂 === mainVal);
  const catType = cat?.憿? || 'material';
  const isWorker = catType === 'worker';

  // 憿舐內/?梯?撌乩犖撠甈?
  document.getElementById('workerNameWrap').style.display = isWorker ? 'flex' : 'none';
  document.getElementById('wageTypeWrap').style.display = isWorker ? 'block' : 'none';
  document.getElementById('workerSubCatWrap').style.display = isWorker ? 'block' : 'none';
  document.getElementById('generalSubCatWrap').style.display = isWorker ? 'none' : 'flex';
  document.getElementById('lunchAllowanceWrap').style.display = isWorker ? 'flex' : 'none';
  document.getElementById('expenseUnitWrap').style.display = isWorker ? 'none' : 'flex';
  document.getElementById('salaryTimeFields').style.display = isWorker ? 'block' : 'none'; // 憿舐內??甈?
  document.getElementById('expensePaidDateWrap').style.display = 'flex'; // ?臭??交?銝?湧＊蝷?
  document.getElementById('expenseBulkInputWrap').style.display = 'none'; // ??憿???梯??寞活頛詨
  document.getElementById('quantityPriceRow').style.display = 'grid';
  document.getElementById('priceDetailRow').style.display = 'grid';

  if (isWorker) {
    // 撌乩犖銝?
    const wSel = document.getElementById('expenseWorker');
    wSel.innerHTML = '<option value="">-- 隢??--</option>' +
                     '<option value="ADD_NEW">+ ?啣?撌乩犖...</option>' +
                     settings.workers.map(w => `<option value="${w.憪?}">${w.憪?}</option>`).join('');
    wSel.value = editRecord ? editRecord.撌乩犖憪? : '';
    onExpenseWorkerChange();

    // 閮?孵?
    const wageType = editRecord?.閮?孵? || 'hourly';
    document.querySelector(`input[name="wageType"][value="${wageType}"]`).checked = true;

    // 璅惜??閮剖?
    document.getElementById('expenseQtyLabel').textContent = wageType === 'hourly' ? '? *' : '憭拇 *';
    document.getElementById('expenseUnitLabel').textContent = wageType === 'hourly' ? '? *' : '?亥 *';

    if (editRecord) {
      document.getElementById('expenseQty').value = editRecord.?賊?;
      document.getElementById('expenseUnitPrice').value = editRecord.?桀;
    } else {
      // ?身撣嗅
      const defaultWorker = settings.workers[0];
      if (wageType === 'hourly') {
        document.getElementById('expenseQty').value = '8';
        document.getElementById('expenseUnitPrice').value = defaultWorker?.?身? || '190';
      } else {
        document.getElementById('expenseQty').value = '1';
        document.getElementById('expenseUnitPrice').value = defaultWorker?.?身?亥 || '1500';
      }
    }

    // 撌乩?? chips
    const chipsContainer = document.getElementById('workerSubCatChips');
    chipsContainer.innerHTML = '';
    const selectedSubs = editRecord ? (editRecord.甈⊿???|| '').split(',').map(s => s.trim()) : [];
    (cat?.甈⊿???|| []).forEach(sub => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip${selectedSubs.includes(sub.?迂) ? ' active' : ''}`;
      chip.textContent = sub.?迂;
      chip.onclick = () => chip.classList.toggle('active');
      chipsContainer.appendChild(chip);
    });
  } else {
    // 銝?祇??伐?甈⊿??乩???
    const subSel = document.getElementById('expenseSubCat');
    subSel.innerHTML = '<option value="">-- 隢???舫嚗?-</option>' +
      '<option value="ADD_NEW">+ ?啣?甇日??仿???..</option>' +
      '<option value="ADD_NEW_BULK">+ ???寞活頛詨憭?...</option>' +
      (cat?.甈⊿???|| []).map(s => `<option value="${s.?迂}" ${editRecord?.甈⊿???=== s.?迂 ? 'selected' : ''}>${s.?迂}${s.?身?? ? ` - $${s.?身??}` : ''}</option>`).join('');

    // 璅惜
    document.getElementById('expenseQtyLabel').textContent = '?賊? *';
    document.getElementById('expenseUnitLabel').textContent = '?桀 *';

    if (editRecord) {
      document.getElementById('expenseQty').value = editRecord.?賊?;
      document.getElementById('expenseUnitPrice').value = editRecord.?桀;
    } else {
      // 撣嗅?身??
      document.getElementById('expenseQty').value = '1';
      document.getElementById('expenseUnitPrice').value = '';
      subSel.addEventListener('change', () => {
        const selected = cat?.甈⊿???find(s => s.?迂 === subSel.value);
        if (selected?.?身??) {
          document.getElementById('expenseUnitPrice').value = selected.?身??;
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
  
  // ?寞活頛詨?????桀???桃??啣???靽?
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

// 閮?孵???
document.querySelectorAll('input[name="wageType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mainVal = document.getElementById('expenseMainCat').value;
    const cat = settings.expenseMainCats.find(c => c.?迂 === mainVal);
    const wageType = document.querySelector('input[name="wageType"]:checked').value;
    document.getElementById('expenseQtyLabel').textContent = wageType === 'hourly' ? '? *' : '憭拇 *';
    document.getElementById('expenseUnitLabel').textContent = wageType === 'hourly' ? '? *' : '?亥 *';

    // 撌乩犖?身??
    const workerSel = document.getElementById('expenseWorker');
    const workerName = workerSel.value;
    const worker = settings.workers.find(w => w.憪? === workerName);

    if (wageType === 'hourly') {
      document.getElementById('expenseQty').value = '8';
      document.getElementById('expenseUnitPrice').value = worker?.?身? || '200';
    } else {
      document.getElementById('expenseQty').value = '1';
      document.getElementById('expenseUnitPrice').value = worker?.?身?亥 || '1500';
    }
    updateExpenseTotal();
  });
});

// 撌乩犖?豢???圈?閮剛鞈?
document.getElementById('expenseWorker').addEventListener('change', () => {
  const workerName = document.getElementById('expenseWorker').value;
  if (workerName === 'ADD_NEW') return;
  const worker = settings.workers.find(w => w.憪? === workerName);
  if (!worker) return;
  const wageType = document.querySelector('input[name="wageType"]:checked').value;
  if (wageType === 'hourly') {
    document.getElementById('expenseUnitPrice').value = worker.?身? || '200';
  } else {
    document.getElementById('expenseUnitPrice').value = worker.?身?亥 || '1500';
  }
  updateExpenseTotal();
});

document.getElementById('expenseForm').onsubmit = async (e) => {
  e.preventDefault();
  const submitType = e.submitter ? e.submitter.value : 'close';
  const btns = document.querySelectorAll('#expenseForm button[type="submit"]');

  const qty = document.getElementById('expenseQty').value;
  if (qty && parseFloat(qty) <= 0) {
    showToast('?賊?敹?憭扳 0', 'error');
    return;
  }

  btns.forEach(b => b.disabled = true);

  const id = document.getElementById('expenseRecordId').value;
  const date = document.getElementById('expenseDate').value;
  const isEdit = !!id;
  const mainVal = document.getElementById('expenseMainCat').value;
  const cat = settings.expenseMainCats.find(c => c.?迂 === mainVal);
  const isWorker = cat?.憿? === 'worker';
  const subCatVal = document.getElementById('expenseSubCat').value;
  const isBulk = !isWorker && subCatVal === 'ADD_NEW_BULK';

  let recordsToSave = [];

  if (isBulk) {
    const bulkText = document.getElementById('expenseBulkInput').value;
    recordsToSave = parseBulkInput(bulkText).map(item => ({
      ...item,
      ?交?: date,
      銝駁??? mainVal,
      閮?孵?: '',
      ?怠?擗? false,
      撌脫隞? document.getElementById('expenseIsPaid').checked,
      ?臭??交?: document.getElementById('expensePaidDate').value,
      ?酉: document.getElementById('expenseNotes').value,
      _sourceSheet: SHEET.EXPENSE_COST
    }));
    if (recordsToSave.length === 0) {
      showToast('隢撓?交????寞活?批捆', 'error');
      btns.forEach(b => b.disabled = false);
      return;
    }
  } else {
    // ?桃?璅∪?
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
        if (!workerName) { 
          showToast('隢撓?亙???, 'error'); 
          btns.forEach(b => b.disabled = false);
          return; 
        }
        isNewWorker = true;
      }
    } else {
      subCat = subCatVal;
      if (subCat === 'ADD_NEW') {
        subCat = document.getElementById('expenseCustomSubCat').value.trim();
        if (!subCat) { 
          showToast('隢撓?交活憿??迂', 'error'); 
          btns.forEach(b => b.disabled = false);
          return; 
        }
        isNewSubCat = true;
      }
    }

    const unit = document.getElementById('expenseUnit').value.trim();
    if (unit && !settings.units.includes(unit)) isNewUnit = true;

    const wageType = isWorker ? document.querySelector('input[name="wageType"]:checked').value : '';
    const unitPrice = document.getElementById('expenseUnitPrice').value;
    const total = document.getElementById('expenseTotalPrice').value;
    const lunch = isWorker && document.getElementById('includeLunch').checked;

    recordsToSave.push({
      id: id || generateId(),
      ?交?: date,
      銝駁??? mainVal,
      甈⊿??? subCat,
      撌乩犖憪?: workerName,
      閮?孵?: wageType,
      ?賊?: qty,
      ?桐?: unit,
      ?桀: unitPrice,
      蝮賡?: total,
      ?怠?擗? lunch ? 'TRUE' : 'FALSE',
      撌脫隞? document.getElementById('expenseIsPaid').checked ? 'TRUE' : 'FALSE',
      ?臭??交?: document.getElementById('expensePaidDate').value,
      ?酉: document.getElementById('expenseNotes').value,
      銝?銝: document.getElementById('salaryMorningStart').value,
      銝?隡: document.getElementById('salaryMorningEnd').value,
      銝?銝: document.getElementById('salaryAfternoonStart').value,
      銝?銝: document.getElementById('salaryAfternoonEnd').value,
      撱箇???: isEdit ? (expenseData.find(x => x.id === id)?.撱箇??? || now()) : now(),
      ?敺?? now(),
      isNewWorker,
      isNewSubCat,
      isNewUnit,
      _sourceSheet: isWorker ? SHEET.EXPENSE_SALARY : SHEET.EXPENSE_COST
    });
  }

  showLoader(isEdit ? '?湔銝?..' : '?脣?銝?..');
  try {
    for (const r of recordsToSave) {
      // ???圈???(Settings)
      if (r.isNewWorker) {
        await appendToSheet(SHEET.WORKERS, [r.撌乩犖憪?, '190', '1500']);
      }
      if (r.isNewSubCat) {
        await appendToSheet(SHEET.EXPENSE_CATS, [r.銝駁??? r.甈⊿??? 'material', '']);
      }
      if (r.isNewUnit) {
        await appendToSheet(SHEET.UNITS, [r.?桐?]);
      }
      // 憒??憓?Settings ???啗???
      if (r.isNewWorker || r.isNewSubCat || r.isNewUnit) await fetchSettings();

      let targetSheet = r._sourceSheet;
      // 雿輻??甈?撠?靘???
      let rowData = syncHeadersAndPrepareData(targetSheet, r);

      if (isEdit) {
        const res = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${targetSheet}!A:A`
        });
        const ids = (res.result.values || []).map(row => row[0]);
        const rowIdx = ids.indexOf(id) + 1; // sheets ??1-based
        
        if (rowIdx > 0) {
          await safeSheetsUpdate({
            spreadsheetId: SPREADSHEET_ID,
            range: `${targetSheet}!A${rowIdx}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
          });
        } else {
          showToast('?曆??啣?憪????航撌脫蝘?, 'warning');
        }
      } else {
        await safeSheetsAppend({
          spreadsheetId: SPREADSHEET_ID,
          range: `${targetSheet}!A:A`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [rowData] }
        });
      }
    }

    await fetchExpense();
    renderExpenseChart();
    renderExpenseTable();
    
    showToast(isEdit ? '???湔??' : `??撌脰???${recordsToSave.length} 蝑??害);
    
    if (submitType === 'addNext') {
      const currentDate = document.getElementById('expenseDate').value;
      const currentMainCat = document.getElementById('expenseMainCat').value;
      document.getElementById('expenseForm').reset();
      document.getElementById('expenseRecordId').value = '';
      document.getElementById('expenseDate').value = currentDate;
      document.getElementById('expenseMainCat').value = currentMainCat;
      // ?蔭???隞園＊蝷箸?雿?
      ['workerNameWrap','expenseCustomWorkerWrap','wageTypeWrap','workerSubCatWrap',
       'generalSubCatWrap','expenseCustomSubCatWrap','expenseBulkInputWrap',
       'salaryTimeFields','expensePaidDateWrap','lunchAllowanceWrap'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      // 閫貊 change ?遣 UI
      document.getElementById('expenseMainCat').dispatchEvent(new Event('change'));
      setTimeout(() => {
        const workerSel = document.getElementById('expenseWorker');
        if (workerSel && workerSel.offsetParent !== null) {
            workerSel.focus();
        } else {
            document.getElementById('expenseQty').focus();
        }
      }, 50);
    } else {
      closeExpenseModal();
    }
  } catch (err) {
    console.error(err);
    showToast('?脣?憭望?嚗頂蝯梁?隤歹?隢?閰?, 'error');
  } finally {
    btns.forEach(b => b.disabled = false);
    hideLoader();
  }
};

/**
 * 閫???寞活頛詨
 * ?澆?嚗????賊? ?桐? $?桀 / =蝮賡?
 */
function parseBulkInput(text) {
  if (!text) return [];
  // ???????
  const lines = text.split(/[?n]/).map(l => l.trim()).filter(l => l);
  const result = [];
  
  lines.forEach(line => {
    // ?澆? 1嚗????賊? ?桐? $?桀   ??隞亙?寡?蝞蜇憿?
    // ?澆? 2嚗????賊? ?桐? =蝮賡?   ??隞亦蜇憿??典??
    // ?澆? 3嚗????賊? ?桐? ?詨?    ???身閬?桀
    const match = line.match(/^(.+?)\s+([\d.]+)\s*(\S+)\s+[$=]?\s*([\d.]+)$/);
    if (!match) return;

    const name = match[1].trim();
    const qty = parseFloat(match[2]);
    const unit = match[3].trim();
    const rawPriceStr = line.slice(match[0].lastIndexOf(match[3]) + match[3].length).trim();
    const isTotal = rawPriceStr.startsWith('=');
    const priceVal = parseFloat(match[4]);
    
    if (!name || isNaN(qty) || qty <= 0 || isNaN(priceVal)) return;

    let unitPrice, total;
    if (isTotal) {
      total = priceVal;
      unitPrice = qty > 0 ? Math.round(total / qty) : 0;
    } else {
      unitPrice = priceVal;
      total = Math.round(qty * unitPrice);
    }
    
    result.push({
      id: generateId(),
      甈⊿??? name,
      撌乩犖憪?: '',
      ?賊?: qty,
      ?桐?: unit,
      ?桀: unitPrice,
      蝮賡?: total,
    });
  });
  return result;
}

// ============================================================
// 13. ?芷蝣箄?
// ============================================================
let _pendingDelete = null;

window.confirmDelete = function(type, id) {
  _pendingDelete = { type, id };
  document.getElementById('confirmMsg').textContent =
    type === 'income' ? '蝣箏?閬?日??嗅蝝??嚗? : '蝣箏?閬?日??臬蝝??嚗?;
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
  let targetSheet = '';
  let dataArr = [];

  if (type === 'income') {
    targetSheet = SHEET.MARKET_INCOME;
    dataArr = incomeData;
  } else {
    const r = expenseData.find(x => x.id === id);
    targetSheet = r?._sourceSheet || SHEET.EXPENSE;
    dataArr = expenseData;
  }

  // ?曉銵?
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${targetSheet}!A:A`
  });
  const ids = (res.result.values || []).map(row => row[0]);
  const rowIdx = ids.indexOf(id) + 1;

  if (rowIdx <= 0) {
    showToast('?曆??啁????⊥??芷', 'error');
    return;
  }

  showLoader('?芷銝?..');
  try {
    const ss = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = ss.result.sheets.find(s => s.properties.title === targetSheet);
    if (!sheet) throw new Error('?曆??啣極雿”');
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
    showToast('???芷??');
  } catch (err) {
    showToast('?芷憭望?嚗? + err.message, 'error');
  }
  hideLoader();
}

// ============================================================
// 12. 閮銵典 Modal & ?摩
// ============================================================
// ============================================================
// 13. 閮???摩?”??
// ============================================================

function openOrderModal(recordId = null) {
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'none';
  document.getElementById('orderForm').reset();
  document.getElementById('orderRecordId').value = recordId || '';
  document.getElementById('orderModalTitle').textContent = recordId ? '蝺刻摩摰Ｘ閮' : '摰Ｘ閮';
  document.getElementById('orderModal').style.display = 'flex';

  // ?郊???函???
  const toggle = document.querySelector('input[name="orderTypeToggle"][value="order"]');
  if (toggle) toggle.checked = true;
  
  // 憛怠?銝?
  const catSel = document.getElementById('orderMainCat');
  catSel.innerHTML = '<option value="">--隢??-</option>';
  [...new Set(settings.retailPrices.map(r => r.?車銝駁???)].filter(Boolean).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    catSel.appendChild(opt);
  });
  
  // 憛怠?摰Ｘ? datalist
  const cDataList = document.getElementById('customerList');
  if (cDataList) {
    cDataList.innerHTML = '';
    // 摰Ｘ?臭誑?撖辣鈭箏??
    let uniqueSenders = [...new Set(customersData.map(c => c.摰Ｘ憪? || c.撖辣鈭?)].filter(Boolean);
    uniqueSenders.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      cDataList.appendChild(opt);
    });
  }

  if (recordId) {
    const r = ordersData.find(x => x.id === recordId);
    if(r) {
      document.getElementById('orderDate').value = r.銝??交?;
      document.getElementById('orderArrivalDate').value = r.?啗疏?交?;
      document.getElementById('orderMainCat').value = r.閮頃??;
      triggerOrderMainCatChange();
      document.getElementById('orderSubCat').value = r.??憿;
      triggerOrderGradeChange(); 
      document.getElementById('orderGrade').value = r.閮頃蝑?;
      const q = r.閮?批捆.match(/\d+/);
      if(q) document.getElementById('orderQuantity').value = q[0];
      const u = r.閮?批捆.replace(/[0-9]/g, '');
      if(u) document.getElementById('orderUnit').value = u;

      document.getElementById('orderSenderName').value = r.撖辣鈭?
      document.getElementById('orderSenderPhone').value = r.撖辣鈭粹閰?
      document.getElementById('orderReceiverName').value = r.?嗡辣鈭?
      document.getElementById('orderReceiverPhone').value = r.?嗡辣鈭粹閰?
      document.getElementById('orderReceiverAddress').value = r.?嗡辣鈭箏?;
      document.getElementById('orderNeedSenderRemark').checked = r.??酉撖辣鈭?
      document.getElementById('orderDeliveryType').value = r.?疏?孵?;
      if (document.getElementById('orderStatus')) document.getElementById('orderStatus').value = r.???
      document.getElementById('orderTotalPrice').value = r.蝮賢;
      if (document.getElementById('orderPaymentStatus')) document.getElementById('orderPaymentStatus').value = r.隞狡???|| '?芯?甈?;
      if (document.getElementById('orderReconStatus')) document.getElementById('orderReconStatus').value = r.撠董???|| '敺?撣?;
    }
  } else {
    document.getElementById('orderDate').value = today();
    if (document.getElementById('orderStatus')) document.getElementById('orderStatus').value = '?芣?摰?;
    if (document.getElementById('orderPaymentStatus')) document.getElementById('orderPaymentStatus').value = '?芯?甈?;
    if (document.getElementById('orderReconStatus')) document.getElementById('orderReconStatus').value = '敺?撣?;
  }
  
  document.getElementById('orderModal').style.display = 'flex';
}

function closeOrderModal() {
  document.getElementById('orderModal').style.display = 'none';
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'flex';
}

document.getElementById('orderMainCat').addEventListener('change', triggerOrderMainCatChange);
document.getElementById('orderSubCat').addEventListener('change', triggerOrderGradeChange);

function triggerOrderMainCatChange() {
  const main = document.getElementById('orderMainCat').value;
  const subSel = document.getElementById('orderSubCat');
  subSel.innerHTML = '<option value="">--隢??-</option>';
  const subs = [...new Set(settings.retailPrices.filter(r => r.?車銝駁???=== main).map(r => r.?車甈⊿???)].filter(Boolean);
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
  gradeSel.innerHTML = '<option value="">--?∠?蝝?-</option>';
  
  const options = settings.retailPrices.filter(r => r.?車銝駁???=== main && (sub === '' || r.?車甈⊿???=== sub));
  const grades = [...new Set(options.map(r => r.蝑?))].filter(Boolean);
  grades.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    gradeSel.appendChild(opt);
  });
  
  // ?岫憛怠?桐? (憒??芣?銝蝔?
  const units = [...new Set(options.map(r => r.?桐?))].filter(Boolean);
  if(units.length === 1) document.getElementById('orderUnit').value = units[0];
  calculateOrderPrice();
}

['orderMainCat', 'orderSubCat', 'orderGrade', 'orderQuantity'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calculateOrderPrice);
});

function calculateOrderPrice() {
  const main = document.getElementById('orderMainCat').value;
  const sub = document.getElementById('orderSubCat').value;
  const grade = document.getElementById('orderGrade').value;
  const qtyStr = document.getElementById('orderQuantity').value;
  const qty = parseFloat(qtyStr);
  
  if(!main || !qty || isNaN(qty)) return;

  const match = settings.retailPrices.find(r => r.?車銝駁???=== main && r.?車甈⊿???=== sub && r.蝑? === grade);
  if (match && match.?桀) {
    const unitPrice = parseFloat(match.?桀);
    document.getElementById('orderTotalPrice').value = unitPrice * qty;
    if(match.?桐?) document.getElementById('orderUnit').value = match.?桐?;
    // 憿舐內鞎拙?批捆?內嚗???input hint 摮嚗?
    const hint = document.querySelector('#orderTotalPrice + .field-hint, #orderTotalPrice ~ .field-hint');
    if (!hint) {
      const h = document.createElement('small');
      h.className = 'field-hint price-hint';
      h.style.cssText = 'color:var(--green-dark);margin-top:2px;display:block';
      document.getElementById('orderTotalPrice').parentElement.appendChild(h);
    }
    const hintEl = document.querySelector('.price-hint');
    if (hintEl) hintEl.textContent = match.鞎拙?批捆 ? `閰脩?蝝摰對?${match.鞎拙?批捆}嚗??$${match.?桀}/蝞常 : '';
  }
}

let osn = document.getElementById('orderSenderName'); if(osn) osn.addEventListener('input', (e) => {
  const val = e.target.value.trim();
  const cus = customersData.find(c => c.撖辣鈭?=== val);
  if (cus) {
    document.getElementById('orderSenderPhone').value = cus.撖辣鈭粹閰?|| '';
  }
});

let osas = document.getElementById('orderSameAsSender'); if(osas) osas.addEventListener('change', (e) => {
  if(e.target.checked) {
    document.getElementById('orderReceiverName').value = document.getElementById('orderSenderName').value;
    document.getElementById('orderReceiverPhone').value = document.getElementById('orderSenderPhone').value;
  }
});

// 暺??啗疏?仿??銝?閮梢?旨??旨??
let odt = document.getElementById('orderDeliveryType'); if(odt) odt.addEventListener('change', (e) => {
  if (e.target.value === '暺?摰?') {
    checkBlackCatDate();
  }
});
document.getElementById('orderArrivalDate')?.addEventListener('change', checkBlackCatDate);

function checkBlackCatDate() {
  const dt = document.getElementById('orderDeliveryType').value;
  const arr = document.getElementById('orderArrivalDate').value;
  if (dt === '暺?摰?' && arr) {
    const d = new Date(arr).getDay();
    if (d === 0 || d === 1) {
      showToast('?? 暺?摰??潮望/?曹??⊥??鞎剁?隢??圈?鞎冽嚗?, 'warning');
      document.getElementById('orderArrivalDate').value = '';
    }
  }
}

// ?脣?閮
document.getElementById('orderForm').onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById('orderRecordId').value;
  const isEdit = !!id;

  const sender = document.getElementById('orderSenderName').value.trim();
  const receiver = document.getElementById('orderReceiverName').value.trim();
  
  const orderRow = [
    document.getElementById('orderMainCat').value,
    document.getElementById('orderSubCat').value,
    document.getElementById('orderStatus') ? document.getElementById('orderStatus').value : '?芣?摰?,
    document.getElementById('orderDate').value,
    document.getElementById('orderArrivalDate').value,
    document.getElementById('orderGrade').value,
    document.getElementById('orderQuantity').value + (document.getElementById('orderUnit').value || '蝞?),
    document.getElementById('orderTotalPrice').value || '',
    isEdit ? (ordersData.find(x => x.id === id)?.摰Ｘ蝺刻? || '') : '',
    sender,
    document.getElementById('orderSenderPhone').value,
    receiver,
    document.getElementById('orderReceiverPhone').value,
    document.getElementById('orderReceiverAddress').value,
    document.getElementById('orderNeedSenderRemark').checked ? 'TRUE' : 'FALSE',
    document.getElementById('orderDeliveryType').value,
    document.getElementById('orderPaymentStatus') ? document.getElementById('orderPaymentStatus').value : '?芯?甈?,
    document.getElementById('orderReconStatus') ? document.getElementById('orderReconStatus').value : '敺?撣?,
    ''
  ];

  showLoader(isEdit ? '?湔銝?..' : '?脣?銝?..');
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
      
      // ?芸??啣?摰Ｘ?乩?摮
      const cusExist = customersData.some(c => c.撖辣鈭?=== sender || c.摰Ｘ憪? === sender);
      if (!cusExist) {
        const cusRow = [
          `CUS_${Date.now()}`, sender, document.getElementById('orderSenderPhone').value, '',
          '蝟餌絞?啣?', '?芸?', ''
        ];
        await gapi.client.sheets.spreadsheets.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET.CUSTOMERS}!A:G`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [cusRow] }
        });
        showToast('撌脰?憓摰Ｘ鞈?', 'success');
      }
    }

    await fetchCustomers();
    await fetchOrders();
    renderOrderTable();
    closeOrderModal();
    showToast('閮撌脣摮?, 'success');
  } catch (err) {
    console.error(err);
    showToast('?脣?憭望?', 'error');
  }
  hideLoader();
};

window.openOrderEdit = (id) => openOrderModal(id);

// ============================================================
// 14. 銴ˊ?敦 Modal
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
  document.getElementById(id)?.addEventListener('change', generateCopyText);
});

function generateCopyText() {
  const from = document.getElementById('copyDateFrom').value;
  const to = document.getElementById('copyDateTo').value;
  if (!from || !to) return;

  const data = _copyType === 'income' ? incomeData : expenseData;
  const filtered = data.filter(r => r.?交? >= from && r.?交? <= to);

  if (filtered.length === 0) {
    document.getElementById('copyPreview').value = '甇斗??蝝??;
    return;
  }

  filtered.sort((a, b) => new Date(a.?交?) - new Date(b.?交?));

  let text = '';
  if (_copyType === 'income') {
    text = `?? ?嗅?敦 ${from} ~ ${to}\n${'?'.repeat(30)}\n`;
    let total = 0;
    filtered.forEach(r => {
      const gradeText = (r.蝑?鞈? || []).map(g => `${g.蝑?} ${g.?斗}??{g.蝞望 ? ' ' + g.蝞望 + '蝞? : ''}`).join(' / ');
      text += `\n?? ${r.?交?}\n`;
      text += `  ?車嚗?{r.銝駁??囚${r.?嗡??酉 ? `嚗?{r.?嗡??酉}嚗 : ''}\n`;
      if (gradeText) text += `  蝑?嚗?{gradeText}\n`;
      if (r.蝮賢) {
        const p = parseFloat(r.蝮賢);
        text += `  蝮賢嚗?${p.toLocaleString()}\n`;
        total += p;
      } else {
        text += `  蝮賢嚗?蝣箄?\n`;
      }
      if (r.?酉) text += `  ?酉嚗?{r.?酉}\n`;
    });
    text += `\n${'?'.repeat(30)}\n? ??嚗?${total.toLocaleString()}`;
  } else {
    text = `?? ?臬?敦 ${from} ~ ${to}\n${'?'.repeat(30)}\n`;
    let total = 0;
    filtered.forEach(r => {
      const amt = calcExpenseTotal(r);
      total += amt;
      text += `\n?? ${r.?交?}\n`;
      text += `  憿嚗?{r.銝駁??囚${r.甈⊿???? ` ??${r.甈⊿??囚` : ''}\n`;
      if (r.撌乩犖憪?) text += `  撌乩犖嚗?{r.撌乩犖憪?}\n`;
      const wageInfo = r.閮?孵? === 'hourly'
        ? `${r.?賊?}??? $${r.?桀}`
        : r.閮?孵? === 'daily'
        ? `${r.?賊?}憭?? $${r.?桀}`
        : `${r.?賊?} ? $${r.?桀}`;
      text += `  閮?嚗?{wageInfo}${r.?怠?擗?? ' + ??$100' : ''}\n`;
      text += `  ??嚗?${amt.toLocaleString()} ${r.撌脫隞?? '?歇隞? : '?隞?}\n`;
      if (r.?酉) text += `  ?酉嚗?{r.?酉}\n`;
    });
    text += `\n${'?'.repeat(30)}\n? ??嚗?${total.toLocaleString()}`;
  }

  document.getElementById('copyPreview').value = text;
}

document.getElementById('doCopyBtn').onclick = () => {
  const text = document.getElementById('copyPreview').value;
  navigator.clipboard.writeText(text).then(() => {
    showToast('??撌脰?鋆賢?芾票蝪?);
    document.getElementById('copyModal').style.display = 'none';
  }).catch(() => {
    showToast('銴ˊ憭望?嚗????詨???', 'error');
  });
};

// ============================================================
// 15. 蝞∠??
// ============================================================
function renderAdminDashboard() {
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
      <td><span class="status-badge ${u.role === 'admin' ? 'paid' : 'pending'}">${u.role === 'admin' ? '蝞∠??? : '雿輻??}</span></td>
      <td><div class="table-actions">
        <button class="btn-table-del admin-action" onclick="deleteUser(${i})" title="?芷"><span class="material-symbols-outlined">delete</span></button>
      </div></td>`;
    tbody.appendChild(tr);
  });
}

function renderIncomeMainCatAdmin() {
  const tbody = document.getElementById('incomeMainCatBody');
  tbody.innerHTML = '';
  settings.incomeMainCats.forEach((c, i) => {
    const subs = (c.甈⊿???|| []);
    if (subs.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.?迂}</strong></td>
        <td>??/td>
        <td><div class="table-actions">
          <button class="btn-table-del admin-action" onclick="deleteIncomeMainCat(${i})" title="?芷"><span class="material-symbols-outlined">delete</span></button>
        </div></td>`;
      tbody.appendChild(tr);
    } else {
      subs.forEach((sub, si) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${si === 0 ? `<strong>${c.?迂}</strong>` : ''}</td>
          <td><span class="badge-sub">${sub}</span></td>
          <td>${si === 0 ? `<div class="table-actions"><button class="btn-table-del admin-action" onclick="deleteIncomeMainCat(${i})" title="?芷"><span class="material-symbols-outlined">delete</span></button></div>` : ''}</td>`;
        tbody.appendChild(tr);
      });
    }
  });
}

function renderExpenseMainCatAdmin() {
  const tbody = document.getElementById('expenseMainCatBody');
  tbody.innerHTML = '';
  settings.expenseMainCats.forEach((c, ci) => {
    const typeLabel = c.憿? === 'worker' ? '撌乩犖' : c.憿? === 'meal' ? '隡?' : '??';
    c.甈⊿???forEach((sub, si) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${si === 0 ? `<strong>${c.?迂}</strong>` : ''}</td>
        <td>${si === 0 ? `<span class="status-badge pending">${typeLabel}</span>` : ''}</td>
        <td>${sub.?迂}</td>
        <td>${sub.?身?? ? `$${sub.?身??}` : '??}</td>
        <td><div class="table-actions">
          ${si === 0 ? `<button class="btn-table-edit admin-action" onclick="editExpenseCat(${ci})" title="蝺刻摩銝駁???><span class="material-symbols-outlined">edit</span></button>` : ''}
          <button class="btn-table-del admin-action" onclick="deleteExpenseSubCat(${ci},${si})" title="?芷甈⊿???><span class="material-symbols-outlined">delete</span></button>
        </div></td>`;
      tbody.appendChild(tr);
    });
    if (c.甈⊿???length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${c.?迂}</strong></td>
        <td><span class="status-badge pending">${typeLabel}</span></td>
        <td>??/td><td>??/td>
        <td><div class="table-actions">
           <button class="btn-table-edit admin-action" onclick="editExpenseCat(${ci})" title="蝺刻摩銝駁???><span class="material-symbols-outlined">edit</span></button>
          <button class="btn-table-del admin-action" onclick="deleteExpenseMainCat(${ci})" title="?芷銝駁???><span class="material-symbols-outlined">delete</span></button>
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
      <td><strong>${w.憪?}</strong></td>
      <td>$${w.?身? || 190}</td>
      <td>$${w.?身?亥 || 1500}</td>
      <td><div class="table-actions">
        <button class="btn-table-edit admin-action" onclick="editWorker(${i})" title="蝺刻摩"><span class="material-symbols-outlined">edit</span></button>
        <button class="btn-table-del admin-action" onclick="deleteWorker(${i})" title="?芷"><span class="material-symbols-outlined">delete</span></button>
      </div></td>`;
    tbody.appendChild(tr);
  });
}

// 蝞∠??憓???
document.getElementById('addUserBtn').onclick = () => {
  openAdminModal('user', null, [
    { id: 'au_email', label: 'Google Email *', type: 'email' },
    { id: 'au_role', label: '閫 *', type: 'select', options: [{ val: 'user', label: '雿輻?? }, { val: 'admin', label: '蝞∠??? }] },
  ]);
};

document.getElementById('addWorkerBtn').onclick = () => {
  openAdminModal('worker', null, [
    { id: 'aw_name', label: '憪? *', type: 'text' },
    { id: 'aw_hourly', label: '?身?', type: 'number', placeholder: '190' },
    { id: 'aw_daily', label: '?身?亥', type: 'number', placeholder: '1500' },
  ]);
};

document.getElementById('addIncomeMainCatBtn').onclick = () => {
  openAdminModal('incomeMainCat', null, [
    { id: 'aim_name', label: '憿?迂 *', type: 'text' },
  ]);
};

document.getElementById('addExpenseMainCatBtn').onclick = () => {
  openAdminModal('expenseMainCat', null, [
    { id: 'aem_name', label: '銝駁??亙?蝔?*', type: 'text' },
    { id: 'aem_type', label: '憿? *', type: 'select', options: [
      { val: 'material', label: '??/颲脰' },
      { val: 'worker', label: '撌乩犖?芾?' },
      { val: 'meal', label: '隡?' },
    ]},
    { id: 'aem_sub', label: '甈⊿??伐?瘥?銝??', type: 'textarea', placeholder: '撉函?\n瘚琿野蝟? },
  ]);
};

function openAdminModal(type, data, fields) {
  document.getElementById('adminEditType').value = type;
  const titleMap = {
    user: '?啣?雿輻??,
    worker: '?啣?撌乩犖',
    incomeMainCat: '?啣??嗅憿',
    expenseMainCat: '?啣??臬憿',
  };
  document.getElementById('adminModalTitle').textContent = titleMap[type] || '?啣?';
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
  showLoader('?脣?銝?..');
  try {
    if (type === 'user') {
      const email = document.getElementById('au_email').value.trim();
      const role = document.getElementById('au_role').value;
      if (!email) { showToast('隢‵撖?Email', 'error'); hideLoader(); return; }
      await appendToSheet(SHEET.USERS, [email, role, now()]);
      usersData.push({ email, role });
      renderUserListAdmin();
    } else if (type === 'worker') {
      const name = document.getElementById('aw_name').value.trim();
      const hourly = document.getElementById('aw_hourly').value || '190';
      const daily = document.getElementById('aw_daily').value || '1500';
      if (!name) { showToast('隢‵撖怠???, 'error'); hideLoader(); return; }
      // ?斗?舀憓??舐楊頛? 蝪∪韏瑁??ㄐ?∪??湔 local array ??rebuild
      const existing = settings.workers.find(w => w.憪? === name);
      if (existing) {
        existing.?身? = hourly;
        existing.?身?亥 = daily;
      } else {
        settings.workers.push({ 憪?: name, ?身?: hourly, ?身?亥: daily });
      }
      await rebuildAndSaveSettings('workers');
      renderWorkerListAdmin();
    } else if (type === 'incomeMainCat') {
      const name = document.getElementById('aim_name').value.trim();
      if (!name) { showToast('隢‵撖怠?蝔?, 'error'); hideLoader(); return; }
      const existing = settings.incomeMainCats.find(c => c.?迂 === name);
      if(!existing){
        settings.incomeMainCats.push({ ?迂: name, 甈⊿???[], 蝑?:[] });
        await rebuildAndSaveSettings('incomeCats');
      }
      renderIncomeMainCatAdmin();
      renderIncomeFilterChips();
    } else if (type === 'expenseMainCat') {
      const name = document.getElementById('aem_name').value.trim();
      const catType = document.getElementById('aem_type').value;
      const subText = document.getElementById('aem_sub').value;
      if (!name) { showToast('隢‵撖怠?蝔?, 'error'); hideLoader(); return; }
      
      const subs = subText.split('\n').map(s => s.trim()).filter(Boolean).map(s => ({ ?迂: s, ?身??: '' }));
      
      const existing = settings.expenseMainCats.find(c => c.?迂 === name);
      if(existing) {
         existing.憿? = catType;
         existing.甈⊿???= subs; // 閬?甈⊿???
      } else {
         settings.expenseMainCats.push({ ?迂: name, 憿?: catType, 甈⊿??? subs });
      }
      await rebuildAndSaveSettings('expenseCats');
      renderExpenseMainCatAdmin();
      renderExpenseFilterChips();
    }
    document.getElementById('adminModal').style.display = 'none';
    showToast('???脣???');
  } catch (err) {
    showToast('?脣?憭望?嚗? + err.message, 'error');
  }
  hideLoader();
};

window.editWorker = function(idx) {
  const w = settings.workers[idx];
  openAdminModal('worker', null, [
    { id: 'aw_name', label: '憪? * (銝?孵?)', type: 'text' },
    { id: 'aw_hourly', label: '?身?', type: 'number', placeholder: '190' },
    { id: 'aw_daily', label: '?身?亥', type: 'number', placeholder: '1500' },
  ]);
  document.getElementById('aw_name').value = w.憪?;
  document.getElementById('aw_name').readOnly = true;
  document.getElementById('aw_hourly').value = w.?身?;
  document.getElementById('aw_daily').value = w.?身?亥;
};

window.editExpenseCat = function(idx) {
  const c = settings.expenseMainCats[idx];
  openAdminModal('expenseMainCat', null, [
    { id: 'aem_name', label: '銝駁??亙?蝔?*', type: 'text' },
    { id: 'aem_type', label: '憿? *', type: 'select', options: [
      { val: 'material', label: '??/颲脰' },
      { val: 'worker', label: '撌乩犖?芾?' },
      { val: 'meal', label: '隡?' },
    ]},
    { id: 'aem_sub', label: '甈⊿??伐?瘥?銝??', type: 'textarea', placeholder: '撉函?\n瘚琿野蝟? },
  ]);
  document.getElementById('aem_name').value = c.?迂;
  document.getElementById('aem_name').readOnly = true;
  document.getElementById('aem_type').value = c.憿?;
  document.getElementById('aem_sub').value = c.甈⊿???map(s => s.?迂).join('\n');
};

// 蝞∠????
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
    settings.expenseMainCats[catIdx].甈⊿???splice(subIdx, 1);
    rebuildAndSaveSettings('expenseCats');
    renderExpenseMainCatAdmin();
  });
};

// 蝟餌絞??????
let isb = document.getElementById('initSystemBtn'); if(isb) isb.onclick = async () => {
  if (!confirm('撠??身憿??靘極鈭箄??神?亥岫蝞”嚗?衣Ⅱ摰?')) return;
  
  showLoader('蝟餌絞???葉...');
  try {
    await clearSheet(SHEET.INCOME_CATS);
    for (const name of DEFAULT_INCOME_CATS) {
      await appendToSheet(SHEET.INCOME_CATS, [name, '', '', '', '']);
    }
    
    await clearSheet(SHEET.EXPENSE_CATS);
    for (const c of DEFAULT_EXPENSE_CATS) {
      if(c.甈⊿???length === 0) {
        await appendToSheet(SHEET.EXPENSE_CATS, [c.?迂, '', c.憿?, '']);
      } else {
        for (const sub of c.甈⊿??? {
          await appendToSheet(SHEET.EXPENSE_CATS, [c.?迂, sub.?迂, c.憿?, sub.?身??]);
        }
      }
    }
    
    await clearSheet(SHEET.WORKERS);
    const demoWorkers = [
      { 憪?: '?踵?', ?身?: '190', ?身?亥: '1500' },
      { 憪?: '撠', ?身?: '190', ?身?亥: '1500' }
    ];
    for (const w of demoWorkers) {
      await appendToSheet(SHEET.WORKERS, [w.憪?, w.?身?, w.?身?亥]);
    }
    
    showToast('????????甇??頛鞈?...');
    await fetchSettings();
    renderAll();
  } catch (e) {
    console.error(e);
    showToast('???仃??, 'error');
  }
  hideLoader();
};

function confirmAdminDelete(cb) {
  if (confirm('蝣箏??芷嚗?)) cb();
}

async function rebuildAndSaveSettings(target) {
  showLoader('?湔閮剖?...');
  try {
    if (target === 'users') {
      await clearSheet(SHEET.USERS);
      for (const u of usersData) {
        await appendToSheet(SHEET.USERS, [u.email, u.role, now()]);
      }
    } else if (target === 'workers') {
      await clearSheet(SHEET.WORKERS);
      for (const w of settings.workers) {
        await appendToSheet(SHEET.WORKERS, [w.憪?, w.?身?, w.?身?亥]);
      }
    } else if (target === 'incomeCats') {
      await clearSheet(SHEET.INCOME_CATS);
      for (const c of settings.incomeMainCats) {
        await appendToSheet(SHEET.INCOME_CATS, [c.?迂, '', (c.甈⊿??四|[]).join(','), '', (c.蝑?||[]).join(',')]);
      }
    } else if (target === 'expenseCats') {
      await clearSheet(SHEET.EXPENSE_CATS);
      for (const c of settings.expenseMainCats) {
        if(c.甈⊿???length === 0) {
           await appendToSheet(SHEET.EXPENSE_CATS, [c.?迂, '', c.憿?, '']);
        } else {
           for (const sub of c.甈⊿??? {
             await appendToSheet(SHEET.EXPENSE_CATS, [c.?迂, sub.?迂, c.憿?, sub.?身??]);
           }
        }
      }
    }
  } catch (e) {
    showToast('閮剖??湔憭望?', 'error');
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
// 16. 撌亙?賢?
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

// --- 撌亙憿???---

// Modal 暺??券???
['incomeModal', 'expenseModal', 'copyModal', 'confirmModal', 'adminModal'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', function(e) {
    if (e.target === this) this.style.display = 'none';
  });
});

// ============================================================
// 15. 甇瑕鞈??臬 (2025)
// ============================================================
const HISTORICAL_DATA_2025 = {
  "expenses": [
    {"?交?":"2024-11-01","銝駁???:"隞?臬?閮?,"甈⊿???:"樴?330??,"撌乩犖憪?":"","?賊?":"330","?桐?":"??,"?桀":"200","蝮賡?":"66000","撌脫隞?:true},
    {"?交?":"2024-11-20","銝駁???:"?交?","甈⊿???:"銝??賜??踵?璈330??,"撌乩犖憪?":"","?賊?":"32","?桐?":"??,"?桀":"150","蝮賡?":"4800","撌脫隞?:true},
    {"?交?":"2024-12-06","銝駁???:"颲脰","甈⊿???:"8K?湧??27蝻?,"撌乩犖憪?":"","?賊?":"33","?桐?":"??,"?桀":"150","蝮賡?":"4950","撌脫隞?:true},
    {"?交?":"2024-12-07","銝駁???:"颲脰","甈⊿???:"8K?湧??13蝻?,"撌乩犖憪?":"","?賊?":"10","?桐?":"??,"?桀":"150","蝮賡?":"1500","撌脫隞?:true},
    {"?交?":"2025-01-08","銝駁???:"隞?臬?閮?,"甈⊿???:"?質??,"撌乩犖憪?":"","?賊?":"2","?桐?":"??,"?桀":"1250","蝮賡?":"2500","撌脫隞?:true},
    {"?交?":"2025-01-08","銝駁???:"隞?臬?閮?,"甈⊿???:"憭抒?蝎?,"撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"4200","蝮賡?":"4200","撌脫隞?:true},
    {"?交?":"2024-12-01","銝駁???:"?交?","甈⊿???:"?交?頠?潮?∴?隢芣??怠鞎餌","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"4000","蝮賡?":"4000","撌脫隞?:true},
    {"?交?":"2025-02-14","銝駁???:"撌乩犖?芾?","甈⊿???:"?踵?","撌乩犖憪?":"?嗡?撌乩犖","?賊?":"9","?桐?":"??,"?桀":"150","蝮賡?":"1350","撌脫隞?:true},
    {"?交?":"2025-02-15","銝駁???:"撌乩犖?芾?","甈⊿???:"?踵?","撌乩犖憪?":"?嗡?撌乩犖","?賊?":"6","?桐?":"??,"?桀":"150","蝮賡?":"900","撌脫隞?:true},
    {"?交?":"2025-02-20","銝駁???:"?交?","甈⊿???:"?質","撌乩犖憪?":"","?賊?":"35","?桐?":"??,"?桀":"550","蝮賡?":"19250","撌脫隞?:true},
    {"?交?":"2025-02-22","銝駁???:"撌乩犖?芾?","甈⊿???:"?踵?","撌乩犖憪?":"?嗡?撌乩犖","?賊?":"8","?桐?":"??,"?桀":"150","蝮賡?":"1200","撌脫隞?:true},
    {"?交?":"2025-02-24","銝駁???:"????","甈⊿???:"?賡蝺??渡雯??","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"130","蝮賡?":"130","撌脫隞?:true},
    {"?交?":"2025-02-24","銝駁???:"????","甈⊿???:"?葆(?渡雯??","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"140","蝮賡?":"140","撌脫隞?:true},
    {"?交?":"2025-02-24","銝駁???:"????","甈⊿???:"?◢?萇?(?渡雯??","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"75","蝮賡?":"75","撌脫隞?:true},
    {"?交?":"2025-02-24","銝駁???:"隞?臬?閮?,"甈⊿???:"92瘙賣硃","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"600","蝮賡?":"600","撌脫隞?:true},
    {"?交?":"2025-02-24","銝駁???:"撌乩犖?芾?","甈⊿???:"?踵?","撌乩犖憪?":"?嗡?撌乩犖","?賊?":"18","?桐?":"??,"?桀":"150","蝮賡?":"2700","撌脫隞?:true},
    {"?交?":"2025-02-25","銝駁???:"撌乩犖?芾?","甈⊿???:"?踵?","撌乩犖憪?":"?嗡?撌乩犖","?賊?":"8","?桐?":"??,"?桀":"150","蝮賡?":"1200","撌脫隞?:true},
    {"?交?":"2025-03-11","銝駁???:"颲脰","甈⊿???:"(?皜?32蝻?擐祆???,"撌乩犖憪?":"","?賊?":"5","?桐?":"??,"?桀":"380","蝮賡?":"1900","撌脫隞?:true},
    {"?交?":"2025-03-11","銝駁???:"隞?臬?閮?,"甈⊿???:"摰擐16","撌乩犖憪?":"","?賊?":"16","?桐?":"??,"?桀":"60","蝮賡?":"960","撌脫隞?:true},
    {"?交?":"2025-03-11","銝駁???:"隞?臬?閮?,"甈⊿???:"蝖怎ㄩ蝎?撌湔憭?","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"2500","蝮賡?":"2500","撌脫隞?:true},
    {"?交?":"2025-03-11","銝駁???:"颲脰","甈⊿???:"?曉???,"撌乩犖憪?":"","?賊?":"3","?桐?":"??,"?桀":"300","蝮賡?":"900","?瑚?":true,"撌脫隞?:true},
    {"?交?":"2025-03-11","銝駁???:"隞?臬?閮?,"甈⊿???:"?曉?株","撌乩犖憪?":"","?賊?":"4","?桐?":"??,"?桀":"700","蝮賡?":"2800","撌脫隞?:true},
    {"?交?":"2025-03-11","銝駁???:"隞?臬?閮?,"甈⊿???:"鈭ㄦ??,"撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"12000","蝮賡?":"12000","撌脫隞?:true},
    {"?交?":"2025-03-11","銝駁???:"隞?臬?閮?,"甈⊿???:"敺桅???","撌乩犖憪?":"","?賊?":"2","?桐?":"??,"?桀":"6000","蝮賡?":"12000","撌脫隞?:true},
    {"?交?":"2025-03-14","銝駁???:"?交?","甈⊿???:"銝??,"撌乩犖憪?":"","?賊?":"8","?桐?":"??,"?桀":"150","蝮賡?":"1200","撌脫隞?:true},
    {"?交?":"2025-04-01","銝駁???:"隞?臬?閮?,"甈⊿???:"?脫?撖?,"撌乩犖憪?":"","?賊?":"2","?桐?":"??,"?桀":"800","蝮賡?":"1600","撌脫隞?:true},
    {"?交?":"2025-04-01","銝駁???:"颲脰","甈⊿???:"敺???,"撌乩犖憪?":"","?賊?":"2","?桐?":"??,"?桀":"600","蝮賡?":"1200","撌脫隞?:true},
    {"?交?":"2025-04-01","銝駁???:"隞?臬?閮?,"甈⊿???:"憭批?蝎?,"撌乩犖憪?":"","?賊?":"4","?桐?":"??,"?桀":"280","蝮賡?":"1120","撌脫隞?:true},
    {"?交?":"2025-04-01","銝駁???:"隞?臬?閮?,"甈⊿???:"憭抒?蝎?,"撌乩犖憪?":"","?賊?":"6","?桐?":"??,"?桀":"450","蝮賡?":"2700","撌脫隞?:true},
    {"?交?":"2025-02-01","銝駁???:"隞?臬?閮?,"甈⊿???:"?輻儔?方?","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"20000","蝮賡?":"20000","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"?輻儔?方?","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"20000","蝮賡?":"20000","撌脫隞?:true},
    {"?交?":"2025-04-24","銝駁???:"?","甈⊿???:"?輻儔?瑟偌","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"8000","蝮賡?":"8000","撌脫隞?:true},
    {"?交?":"2025-01-01","銝駁???:"隞?臬?閮?,"甈⊿???:"56200+49000","撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"105200","蝮賡?":"105200","撌脫隞?:true},
    {"?交?":"2025-04-17","銝駁???:"隞?臬?閮?,"甈⊿???:"擃ㄦ?","撌乩犖憪?":"","?賊?":"45","?桐?":"??,"?桀":"700","蝮賡?":"31500","撌脫隞?:true},
    {"?交?":"2025-04-17","銝駁???:"隞?臬?閮?,"甈⊿???:"???","撌乩犖憪?":"","?賊?":"60","?桐?":"??,"?桀":"650","蝮賡?":"39000","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"靽∠?(??)","撌乩犖憪?":"","?賊?":"12","?桐?":"??,"?桀":"380","蝮賡?":"4560","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"?脣???,"撌乩犖憪?":"","?賊?":"2","?桐?":"??,"?桀":"450","蝮賡?":"900","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"鞈賣?撖?憭批?)","撌乩犖憪?":"","?賊?":"4","?桐?":"??,"?桀":"400","蝮賡?":"1600","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"颲脰","甈⊿???:"擐祆???,"撌乩犖憪?":"","?賊?":"4","?桐?":"??,"?桀":"400","蝮賡?":"1600","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"靽∠?(?亦)","撌乩犖憪?":"","?賊?":"12","?桐?":"??,"?桀":"250","蝮賡?":"3000","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"颲脰","甈⊿???:"敺???,"撌乩犖憪?":"","?賊?":"2","?桐?":"??,"?桀":"600","蝮賡?":"1200","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"鞈賡?撖??亦)","撌乩犖憪?":"","?賊?":"4","?桐?":"??,"?桀":"650","蝮賡?":"2600","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"?踹毀銝?,"撌乩犖憪?":"","?賊?":"2","?桐?":"??,"?桀":"400","蝮賡?":"800","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"敺隢?,"撌乩犖憪?":"","?賊?":"4","?桐?":"??,"?桀":"450","蝮賡?":"1800","撌脫隞?:true},
    {"?交?":"2025-05-01","銝駁???:"隞?臬?閮?,"甈⊿???:"憭抒?蝎?,"撌乩犖憪?":"","?賊?":"1","?桐?":"??,"?桀":"4200","蝮賡?":"4200","撌脫隞?:true},
    {"?交?":"2025-06-09","銝駁???:"隞?臬?閮?,"甈⊿???:"銝????,"撌乩犖憪?":"","?賊?":"4","?桐?":"??,"?桀":"700","蝮賡?":"2800","撌脫隞?:true}
  ],
  "income": [
    {"?交?":"2025-09-26","銝駁???:"?","?嗡??酉":"撣?都憭扳???,"蝮賡?":"136","蝞望":"12","蝮賢":"13404","?寞蝣箄?":true},
    {"?交?":"2025-09-27","銝駁???:"?","?嗡??酉":"撣?都憭扳???,"蝮賡?":"160","蝞望":"15","蝮賢":"16392","?寞蝣箄?":true},
    {"?交?":"2025-09-30","銝駁???:"?","?嗡??酉":"撣?都憭扳???,"蝮賡?":"420","蝞望":"35","蝮賢":"43286","?寞蝣箄?":true},
    {"?交?":"2025-10-03","銝駁???:"?","?嗡??酉":"撣?都憭扳???,"蝮賡?":"349","蝞望":"29","蝮賢":"40640","?寞蝣箄?":true},
    {"?交?":"2025-10-04","銝駁???:"?","?嗡??酉":"撣?都憭扳???,"蝮賡?":"494","蝞望":"41","蝮賢":"53370","?寞蝣箄?":true},
    {"?交?":"2025-10-09","銝駁???:"?","?嗡??酉":"撣?都憭扳???,"蝮賡?":"558","蝞望":"46","蝮賢":"50703","?寞蝣箄?":true}
  ]
};

async function importHistoricalData2025() {
  if (!confirm('蝣箏?閬??2025 撟游漲甇瑕鞈??????憓?蝑??閰衣?銵其葉??)) return;
  
  showLoader('?臬銝?..');
  try {
    const expRows = HISTORICAL_DATA_2025.expenses.map(r => {
      const id = 'H2025-' + Math.random().toString(36).substr(2, 6);
      return [id, r.?交?, r.銝駁??? r.甈⊿??? r.撌乩犖憪?, 'hourly', r.?賊?, r.?桐?, r.?桀, r.蝮賡?, 'FALSE', r.撌脫隞?'TRUE':'FALSE', '2025 ?臬', now(), now()];
    });
    
    const incRows = HISTORICAL_DATA_2025.income.map(r => {
      const id = 'H2025I-' + Math.random().toString(36).substr(2, 6);
      return [id, r.?交?, r.銝駁??? r.?嗡??酉, '{}', r.蝮賡?, r.蝞望, r.蝮賢, '0', '0', '', r.?寞蝣箄??'TRUE':'FALSE', now(), now()];
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
    showToast('??甇瑕鞈??臬摰?');
  } catch (err) {
    console.error(err);
    showToast('?臬憭望?嚗? + err.message, 'error');
  }
  hideLoader();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('import2025Btn')?.addEventListener('click', importHistoricalData2025);
  }, 2000);
});

// ============================================================
// 16. 蝯????摩
// ============================================================
balanceChartInstance = null; // 撌脣?典??摰??
currentBalancePeriod = 'all'; // 撌脣?典??摰??

document.querySelectorAll('#page-balance .period-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('#page-balance .period-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentBalancePeriod = e.target.dataset.period;
    renderBalancePage();
  });
});

function renderBalancePage() {
  // 1. ???蕪敺?鞈?
  const incData = getFilteredByPeriod(incomeData, '?交?', currentBalancePeriod);
  const expData = getFilteredByPeriod(expenseData, '?交?', currentBalancePeriod);
  
  // 閮銋?閬?瞈?
  let orderDataFiltered = [...ordersData];
  if (currentBalancePeriod !== 'all') {
    const now = new Date();
    orderDataFiltered = ordersData.filter(r => {
      const d = new Date(r.?啗疏?交? || r.銝??交? || 0);
      if (currentBalancePeriod === 'year') return d.getFullYear() === now.getFullYear();
      if (currentBalancePeriod === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      return true;
    });
  }

  // 2. 閮?蝮賢?
  let marketIncome = 0;
  let marketUnpaid = 0;
  let actualKG = 0;
  incData.forEach(r => {
    marketIncome += (parseFloat(r.蝮賢) || 0);
    if (r.隞狡???!== '撌脖?甈?) marketUnpaid += (parseFloat(r.蝮賢) || 0);
    actualKG += (parseFloat(r.蝮賡?) || 0) * 0.6; // ?身蝮賡??臬??-> KG
  });
  
  // 閮靘???蝯?蝞?
  let salesIncome = 0;
  let salesByStatus = {}; // { '?芣?摰?: ??, '???箄疏': ??, '撌脣鞎?: ??, ... }
  let salesUnpaid = 0;
  orderDataFiltered.forEach(r => {
    const price = parseFloat(r.蝮賢) || 0;
    salesIncome += price;
    let status = r.???|| '?芣?摰?;
    if (status === '銝?摰?) status = '?芣?摰?;
    if (!salesByStatus[status]) salesByStatus[status] = 0;
    salesByStatus[status] += price;
    if (r.隞狡???!== '撌脖?甈?) salesUnpaid += price;
  });

  const totalIncome = marketIncome + salesIncome;
  
  let totalExpense = 0;
  let bagCount = 0;
  let lossBagCount = 0;
  
  expData.forEach(r => {
    totalExpense += calcExpenseTotal(r);
    // 敺?粹??格???鋡???嚗ㄐ?冽活憿摮葡瘥?
    const subCat = r.甈⊿???|| '';
    if (subCat.includes('憟?')) {
      bagCount += (parseFloat(r.?賊?) || 0);
    } else if (subCat.includes('??) && (subCat.includes('鋡?) || r.?桐? === '鋡? || r.銝駁???includes('??'))) {
      lossBagCount += (parseFloat(r.?賊?) || 0);
    }
  });

  const netBalance = totalIncome - totalExpense;

  // ?湔閮靘??敦?＊蝷?
  const orderBreakdownEl = document.getElementById('balanceOrderBreakdown');
  if (orderBreakdownEl) {
    if (Object.keys(salesByStatus).length === 0) {
      orderBreakdownEl.innerHTML = '<small style="color:var(--text-muted)">?∟???/small>';
    } else {
      const statusOrder = ['撌脣鞎?, '???箄疏', '?芣?摰?];
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
      orderBreakdownEl.innerHTML += `<div style="font-size:0.75rem;color:var(--orange);margin-top:4px">?芯?甈?$${salesUnpaid.toLocaleString()}</div>`;
    }
  }

  // 3. 蝯???亦???
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
    // ?澆捆?? ID
    if(document.getElementById('balanceTotalIncome')) document.getElementById('balanceTotalIncome').textContent = `$${totalIncome.toLocaleString()}`;
    if(document.getElementById('balanceTotalExpense')) document.getElementById('balanceTotalExpense').textContent = `$${totalExpense.toLocaleString()}`;
  }
  
  // 4. ??????輯?蝞?(?身銝鋡像??0.35 kg)
  // ???詨潮?閬?祕?????貉矽?湛?甇方?閮剔?身?摯
  const expectedKG = bagCount * 0.35; 
  const lossExpectedKG = lossBagCount * 0.35;
  const actualLossKG = Math.max(0, expectedKG - actualKG);
  const lossPercent = expectedKG > 0 ? ((actualLossKG / expectedKG) * 100).toFixed(1) + '%' : '0%';

  if(document.getElementById('balanceBagCount')) {
    document.getElementById('balanceBagCount').textContent = bagCount.toLocaleString();
    const lossBagEl = document.getElementById('balanceLossBagCount');
    if (lossBagEl) lossBagEl.textContent = lossBagCount.toLocaleString();
    const expKgEl = document.getElementById('balanceExpectedKG');
    if (expKgEl) expKgEl.textContent = expectedKG.toFixed(1);
    const actKgEl = document.getElementById('balanceActualKG');
    if (actKgEl) actKgEl.textContent = actualKG.toFixed(1);
    const lossKgEl = document.getElementById('balanceLossKG');
    if (lossKgEl) lossKgEl.textContent = actualLossKG.toFixed(1);
    const lossPerEl = document.getElementById('balanceLossPercent');
    if (lossPerEl) lossPerEl.textContent = lossPercent;
  }

  // 5. 蝜芾ˊ????(Chart.js)
  renderBalanceChart(totalIncome, totalExpense);

  // 6. 蝜芾ˊ???嗆?敦
  renderBalanceMonthlyTable(incData, expData, orderDataFiltered);
}

function renderBalanceChart(income, expense) {
  const ctx = document.getElementById('balancePieChart');
  if (!ctx) return;

  if (balanceChartInstance) {
    balanceChartInstance.destroy();
  }

  // ?仿??0 ?＊蝷箇摨?
  if (income === 0 && expense === 0) {
     balanceChartInstance = new Chart(ctx, {
       type: 'doughnut',
       data: {
         labels: ['?∟???],
         datasets: [{ data: [1], backgroundColor: ['#e2e8f0'], borderWidth: 0 }]
       },
       options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '75%' }
     });
     return;
  }

  balanceChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['?嗅', '?臬'],
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

  // ???唳?隞?
  const monthlyMap = {};
  
  // ??撣?嗅
  incData.forEach(r => {
    if(!r.?交?) return;
    const month = r.?交?.substring(0, 7); // YYYY-MM
    if(!monthlyMap[month]) monthlyMap[month] = { market: 0, sales: 0, expense: 0, orderCount: 0 };
    monthlyMap[month].market += (parseFloat(r.蝮賢) || 0);
  });

  // ??摰Ｘ?瑕?嗅
  orderDataFiltered.forEach(r => {
    const d = r.?啗疏?交? || r.銝??交?;
    if(!d) return;
    const month = d.substring(0, 7); // YYYY-MM
    if(!monthlyMap[month]) monthlyMap[month] = { market: 0, sales: 0, expense: 0, orderCount: 0 };
    monthlyMap[month].sales += (parseFloat(r.蝮賢) || 0);
    monthlyMap[month].orderCount++;
  });

  // ???臬
  expData.forEach(r => {
    if(!r.?交?) return;
    const month = r.?交?.substring(0, 7); // YYYY-MM
    if(!monthlyMap[month]) monthlyMap[month] = { market: 0, sales: 0, expense: 0, orderCount: 0 };
    monthlyMap[month].expense += calcExpenseTotal(r);
  });

  // ?? (?望?啗?)
  const months = Object.keys(monthlyMap).sort((a,b) => b.localeCompare(a));
  
  tbody.innerHTML = '';
  if (months.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">?∟???/td></tr>';
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
      <td style="color:var(--green-dark);">$${stat.sales.toLocaleString()}${stat.orderCount>0?` <small style="color:var(--text-muted);font-size:0.7rem">(${stat.orderCount}蝑?</small>`:''}</td>
      <td style="color:var(--red);">$${stat.expense.toLocaleString()}</td>
      <td style="font-weight:bold; color:${net >= 0 ? 'var(--green-dark)' : 'var(--red)'};">$${net.toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('closeOrderModal')?.addEventListener('click', closeOrderModal);
  document.getElementById('cancelOrderBtn')?.addEventListener('click', closeOrderModal);

  // 5. ?嗡? Modal (蝞∠???鋆賡?閬賜?)
  document.getElementById('closeAdminModal')?.addEventListener('click', () => {
    document.getElementById('adminModal').style.display = 'none';
  });
  document.getElementById('cancelCopyBtn')?.addEventListener('click', () => {
    document.getElementById('copyModal').style.display = 'none';
  });
}

// ?函?亙????Ｚ??亙????瑁?
// ?桀???afterLogin ?扯矽??

// --- 鋆蝻箏仃??隞嗥?賢 ---
document.getElementById('cancelIncomeBtn')?.addEventListener('click', closeIncomeModal);
document.getElementById('cancelExpenseBtn')?.addEventListener('click', closeExpenseModal);
document.getElementById('confirmCancel')?.addEventListener('click', () => {
  const modal = document.getElementById('confirmModal');
  if (modal) modal.style.display = 'none';
});

// ============================================================
// 15. ?寥????摩 (銝?萄?撣?蝯?)
// ============================================================
let multiSelectMode = { active: false, type: null };
let selectedIds = new Set();

window.toggleMultiSelect = function(type) {
  if (multiSelectMode.active && multiSelectMode.type === type) {
    cancelMultiSelect();
    return;
  }
  
  multiSelectMode.active = true;
  multiSelectMode.type = type;
  selectedIds.clear();
  
  // 憿舐內?寥?撌亙??
  const bar = document.getElementById('bulkActionBar');
  if (bar) bar.classList.add('active');
  updateBulkCount();
  
  // ?冽??????桐?瘛餃? Checkbox ????見撘?
  document.querySelectorAll('.record-item').forEach(item => {
    if (item.dataset.type === type || (type === 'salary' && item.dataset.type === 'expense')) {
      item.classList.add('multi-select-ready');
      item.onclick = (e) => {
        if (multiSelectMode.active) {
          e.preventDefault();
          e.stopPropagation();
          const id = item.dataset.id;
          if (selectedIds.has(id)) {
            selectedIds.delete(id);
            item.classList.remove('selected');
          } else {
            selectedIds.add(id);
            item.classList.add('selected');
          }
          updateBulkCount();
        }
      };
    }
  });
};

window.cancelMultiSelect = function() {
  multiSelectMode.active = false;
  multiSelectMode.type = null;
  selectedIds.clear();
  
  const bar = document.getElementById('bulkActionBar');
  if (bar) bar.classList.remove('active');
  
  document.querySelectorAll('.record-item').forEach(item => {
    item.classList.remove('multi-select-ready', 'selected');
    // ?Ｗ儔??暺? (憒???
    item.onclick = null; 
  });
  
  // ?皜脫?銵冽隞交敺拙?憪?隞?
  if (currentTab === 'revenue') renderIncomeTable();
  if (currentTab === 'expense') renderExpenseTable();
};

function updateBulkCount() {
  const countEl = document.getElementById('bulkCount');
  if (countEl) countEl.textContent = selectedIds.size;
}

window.handleBulkSettle = async function() {
  if (selectedIds.size === 0) {
    showToast('隢??豢?閬????', 'warning');
    return;
  }
  
  const type = multiSelectMode.type;
  const idsToUpdate = Array.from(selectedIds);
  
  showLoader('?寞活?湔銝?..');
  try {
    // ?寞?憿?瘙箏??湔?芸?雿?
    let field = '';
    let newValue = '';
    let targetSheet = '';
    
    if (type === 'income') {
      field = '撠董???;
      newValue = 'OK';
      targetSheet = SHEET.MARKET_INCOME;
    } else if (type === 'order') {
      field = '撠董???;
      newValue = 'OK';
      targetSheet = SHEET.ORDERS;
    } else if (type === 'salary') {
      field = '撌脫隞?;
      newValue = 'TRUE';
      targetSheet = SHEET.EXPENSE_SALARY;
    } else if (type === 'cost') {
      field = '撌脫隞?;
      newValue = 'TRUE';
      targetSheet = SHEET.EXPENSE_COST;
    }

    // ?澆敺垢?寞活?湔 (?身敺垢??updateRecords)
    // ?ㄐ雿輻敺芰隤輻雿??嚗???憭批遣霅唳?典?蝡?batchUpdate
    for (const id of idsToUpdate) {
      await updateRecordInSheet(targetSheet, id, field, newValue);
    }
    
    showToast(`??撌脫?????${idsToUpdate.length} 蝑??害);
    cancelMultiSelect();
    
    // ?頛?豢?
    if (type === 'income' || type === 'order') await fetchIncome();
    if (type === 'salary' || type === 'cost') await fetchExpense();
    
    renderIncomeTable();
    renderExpenseTable();
    renderIncomeChart();
    renderExpenseChart();
  } catch (err) {
    console.error(err);
    showToast('?寞活??憭望?', 'error');
  } finally {
    hideLoader();
  }
};

async function updateRecordInSheet(sheetName, id, field, value) {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A:A`
  });
  const ids = (res.result.values || []).map(row => row[0]);
  const rowIdx = ids.indexOf(id) + 1;
  if (rowIdx <= 0) return;

  // ?寞? sheetName ??field 瘙箏? Column
  let col = 'A';
  if (sheetName === SHEET.MARKET_INCOME) {
    if (field === '撠董???) col = 'P'; // ?身 P 甈?
  } else if (sheetName === SHEET.EXPENSE_SALARY) {
    if (field === '撌脫隞?) col = 'O'; 
  } else if (sheetName === SHEET.EXPENSE_COST) {
    if (field === '撌脫隞?) col = 'H';
  }
  
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${col}${rowIdx}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[value]] }
  });
}

// ============================================================
// 16. 蝞∠??蝺刻摩璅∪??抒恣
// ============================================================
let adminEditMode = false;

window.toggleAdminEdit = function(btn) {
  adminEditMode = !adminEditMode;
  
  // ???內憿?摰?
  if (btn) {
    btn.classList.toggle('active', adminEditMode);
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = adminEditMode ? 'edit_off' : 'edit_note';
    }
  }

  // ?批??恣????憿舐內
  document.querySelectorAll('.admin-action, .btn-table-edit, .btn-table-del, .btn-row-edit, .btn-row-delete').forEach(el => {
    el.style.display = adminEditMode ? 'inline-flex' : 'none';
  });

  showToast(adminEditMode ? '撌脤??恣?楊頛舀芋撘? : '撌脤??恣?楊頛舀芋撘?, 'info');
};

// 蝣箔?皜脫?銵冽?蝺刻摩璅∪?
// (??典???renderAdminXXX ?賣銝剖??亙? adminEditMode ??瘀?
//  ?? CSS ?湔?批嚗ㄐ撱箄降?? CSS 憿?游??



// [皜?摰?] 

