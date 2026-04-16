// ==========================================
// 1. 系統設定參數 (請在此處填寫您的專案資訊)
// ==========================================
const SPREADSHEET_ID = '1rjVEG9x9ZJ6f3BSuC4CL_wYRATFvbGiZAGkwkzDP168'; // 從試算表網址列複製，例如 /d/ 這個_1234567890_後面/ 
const CLIENT_ID = '647415610600-eio0d6dqpu80j80gki4l9m5qfemmlkab.apps.googleusercontent.com'; // Google Cloud Platform 中取得
const API_KEY = '[ENCRYPTION_KEY]'; // Google Cloud Platform 中取得

// 限制抓取的範圍
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// ==========================================
// 全域狀態管理
// ==========================================
let tokenClient;
let gapiInited = false;
let gisInited = false;
let isAdmin = false;

// 資料暫存
let recordsData = [];
let settingsData = {
  Workers: [],
  MainCategories: [],
  SubCategories: []
};

// ==========================================
// 2. Google API 初始化與身分驗證
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 當畫面載入完畢，等待外部 script 載入 gapi 與 google.accounts
});

// 當 gapi 載入完成時由 index.html 的 async 觸發 (或者輪詢)
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;
  maybeEnableButtons();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // defined later
  });
  gisInited = true;
  maybeEnableButtons();
}

// 實作簡易的等待與輪詢檢查機制
const checkInterval = setInterval(() => {
  if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
    clearInterval(checkInterval);
    gapiLoaded();
    gisLoaded();
  }
}, 100);

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    document.getElementById('authBtn').style.display = 'inline-flex';
    document.getElementById('authBtn').onclick = handleAuthClick;
  }
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    // 登入成功，顯示主畫面並開始抓取資料
    document.getElementById('authBtn').style.display = 'none';
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('workspace').style.display = 'block';
    document.getElementById('switchRoleBtn').style.display = 'inline-flex';

    // 預設當天日期
    document.getElementById('workDate').valueAsDate = new Date();
    document.getElementById('copyDate').valueAsDate = new Date();

    await fetchAllData();
  };

  if (gapi.client.getToken() === null) {
    // 提示使用者登入
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    // 已經有 token 則直接跳過此步驟
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

// ==========================================
// 3. 資料讀寫與商業邏輯
// ==========================================

function showLoader(msg = '處理中...') {
  document.getElementById('loaderMsg').textContent = msg;
  document.getElementById('loader').style.display = 'flex';
}
function hideLoader() { document.getElementById('loader').style.display = 'none'; }
function generateUUID() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

async function fetchAllData() {
  showLoader('正在同步試算表...');
  try {
    // 1. 抓取 Settings
    const resSettings = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A2:B',
    });

    // 整理 Settings
    const rowsS = resSettings.result.values;
    settingsData = { Workers: [], MainCategories: [], SubCategories: [] };
    if (rowsS && rowsS.length > 0) {
      rowsS.forEach(row => {
        const type = row[0];
        const val = row[1];
        if (type === 'Worker') settingsData.Workers.push(val);
        if (type === 'MainCategory') settingsData.MainCategories.push(val);
        if (type === 'SubCategory') settingsData.SubCategories.push(val);
      });
    }
    populateSelects();

    // 2. 抓取 Records
    const resRecords = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Records!A2:I',
    });

    recordsData = [];
    const rowsR = resRecords.result.values;
    if (rowsR && rowsR.length > 0) {
      rowsR.forEach(row => {
        recordsData.push({
          id: row[0],
          date: row[1],
          worker: row[2],
          mainCat: row[3],
          subCat: row[4],
          hours: row[5],
          rate: row[6],
          notes: row[7],
          timestamp: row[8]
        });
      });
    }
    renderRecords();

  } catch (err) {
    console.error(err);
    alert('讀取失敗，請確認試算表 ID 與工作表名稱是否正確且已授權！');
  }
  hideLoader();
}

function populateSelects() {
  // Workers Datalist
  const workerList = document.getElementById('workerList');
  workerList.innerHTML = '';
  settingsData.Workers.forEach(w => {
    workerList.innerHTML += `<option value="${w}">`;
  });

  // Main Category
  const mainCat = document.getElementById('mainCategory');
  mainCat.innerHTML = '';
  settingsData.MainCategories.forEach(c => {
    mainCat.innerHTML += `<option value="${c}">${c}</option>`;
  });
  if (settingsData.MainCategories.length === 0) mainCat.innerHTML = `<option value="工人">工人</option>`;

  // Sub Category
  const subCat = document.getElementById('subCategory');
  subCat.innerHTML = '';
  settingsData.SubCategories.forEach(c => {
    subCat.innerHTML += `<option value="${c}">${c}</option>`;
  });
}

// 綁定儲存按鈕
document.getElementById('recordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = generateUUID();
  const date = document.getElementById('workDate').value;
  const worker = document.getElementById('workerName').value;
  const mainCat = document.getElementById('mainCategory').value;
  const subCat = document.getElementById('subCategory').value;
  const hours = document.getElementById('workHours').value;
  const rate = document.getElementById('hourlyRate').value;
  const notes = document.getElementById('notes').value;
  const timestamp = new Date().toISOString();

  const appendData = [id, date, worker, mainCat, subCat, hours, rate, notes, timestamp];

  showLoader('儲存中...');
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Records!A:I',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [appendData] }
    });

    // 為了反應快速，手動更新暫存並渲染
    recordsData.push({
      id, date, worker, mainCat, subCat, hours, rate, notes, timestamp
    });

    document.getElementById('notes').value = '';
    renderRecords();
    alert('儲存成功！');
  } catch (err) {
    console.error(err);
    alert('發生錯誤。');
  }
  hideLoader();
});

// 管理者介面切換
document.getElementById('switchRoleBtn').addEventListener('click', () => {
  if (!isAdmin) {
    const pwd = prompt('請輸入管理員密碼：');
    if (pwd === 'admin123') {
      isAdmin = true;
      document.getElementById('adminSection').style.display = 'block';
      document.getElementById('currentRoleBadge').className = 'role-badge admin';
      document.getElementById('currentRoleBadge').textContent = '管理員模式';
      alert('已切換為管理員');
    } else {
      alert('密碼錯誤！');
    }
  } else {
    isAdmin = false;
    document.getElementById('adminSection').style.display = 'none';
    document.getElementById('currentRoleBadge').className = 'role-badge';
    document.getElementById('currentRoleBadge').textContent = '使用者模式';
    alert('已切換回使用者');
  }
});

// 重置表單
document.getElementById('resetFormBtn').addEventListener('click', () => {
  document.getElementById('recordForm').reset();
  document.getElementById('workDate').valueAsDate = new Date();
});

// 重新載入
document.getElementById('refreshBtn').addEventListener('click', fetchAllData);

// 渲染近期紀錄清單 (以日期降冪排列顯示最後 20 筆)
function renderRecords() {
  const list = document.getElementById('recordsList');
  list.innerHTML = '';

  if (recordsData.length === 0) {
    list.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">inbox</span><p>暫無紀錄</p></div>';
    return;
  }

  // 排序 : 新 -> 舊
  const sorted = [...recordsData].sort((a, b) => new Date(b.date) - new Date(a.date));
  const recent = sorted.slice(0, 20); // 只顯示最近

  recent.forEach(r => {
    const total = (parseFloat(r.hours) * parseFloat(r.rate)).toLocaleString();
    const div = document.createElement('div');
    div.className = 'record-card';
    div.innerHTML = `
      <div class="record-main" style="align-items:center;">
        <div>
          <strong style="fontSize:1.1rem; color:var(--text-main);">${r.worker}</strong>
          <span class="text-sm" style="color:var(--text-muted); margin-left:8px;">${r.date}</span>
          <br>
          <span class="badge category">${r.mainCat} - ${r.subCat}</span>
          ${r.notes ? `<span class="badge" style="background:#fef08a;">${r.notes}</span>` : ''}
        </div>
        <div style="text-align:right;">
          <strong style="font-size:1.2rem;">$${total}</strong>
          <br>
          <span class="text-sm" style="color:var(--text-muted);">${r.hours} <small>時/天</small> x $${r.rate}</span>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}

// 管理員：新增設定
window.addSetting = async function (type, inputId) {
  const val = document.getElementById(inputId).value.trim();
  if (!val) return;

  showLoader('更新設定...');
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A:B',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[type, val]] }
    });

    // 更新本地
    if (type === 'Worker') settingsData.Workers.push(val);
    if (type === 'MainCategory') settingsData.MainCategories.push(val);
    if (type === 'SubCategory') settingsData.SubCategories.push(val);

    populateSelects();
    document.getElementById(inputId).value = '';
    alert('選項新增成功！');
  } catch (err) {
    console.error(err);
    alert('選項新增失敗！');
  }
  hideLoader();
};

// ==========================================
// 4. LINE 複製小幫手
// ==========================================
document.getElementById('copyToLineBtn').addEventListener('click', () => {
  const cDate = document.getElementById('copyDate').value;
  if (!cDate) return alert('請選擇日期');

  const daily = recordsData.filter(r => r.date === cDate);
  if (daily.length === 0) return alert('該日期沒有任何紀錄。');

  let text = `📅 【工資明細】 ${cDate}\n`;
  let sum = 0;

  daily.forEach(r => {
    let sub = parseFloat(r.hours) * parseFloat(r.rate);
    sum += sub;
    text += `\n🧑‍🌾 ${r.worker} (${r.subCat})`;
    if (r.notes) text += ` [${r.notes}]`;
    text += `\n└ ${r.hours} x ${r.rate} = $${sub.toLocaleString()}`;
  });

  text += `\n\n💵 今日總發出：$${sum.toLocaleString()}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('✅ 已複製到剪貼簿，可以直接去 LINE 貼上了！');
  }).catch(err => {
    alert('自動複製失敗，已將明細產生於下方，請手動複製。');
    const ta = document.getElementById('copyPreview');
    ta.hidden = false;
    ta.value = text;
  });
});
