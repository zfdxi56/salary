// ==========================================
// 1. 系統設定參數 (請在此處填寫您的專案資訊)
// ==========================================
const SPREADSHEET_ID = '1rjVEG9x9ZJ6f3BSuC4CL_wYRATFvbGiZAGkwkzDP168'; // 從試算表網址列複製，例如 /d/ 這個_1234567890_後面/ 
const CLIENT_ID = '647415610600-eio0d6dqpu80j80gki4l9m5qfemmlkab.apps.googleusercontent.com'; // Google Cloud Platform 中取得
// const API_KEY = ''; // 已移除，改以 OAuth 登入驗證取代

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

const PREDEFINED_CATEGORIES = {
  '工人薪資': ['檢枝', '除草', '疏果', '剪枝', '套袋', '包裝', '採收'],
  '肥料': ['骨粉', '海鳥糞', '堆肥', '豆粕', '苦土石灰', '蘇力菌 (B.t.)', '苦楝油', '葵無露', '石灰硫磺合劑', '亞磷酸'],
  '包裝材料': ['水果紙箱', '泡棉網套 (舒果網)', '塑膠內袋', '封箱膠帶', '蔬果標籤貼紙']
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
  try {
    // 使用 load 來載入 API，這樣就不會強制要求 apiKey
    gapi.client.load('sheets', 'v4', () => {
      gapiInited = true;
      maybeEnableButtons();
    });
  } catch (error) {
    console.error('Google API 初始化失敗:', error);
    alert('Google API 初始化失敗，請檢查主控台。');
  }
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
    renderSettingsAdmin(); // 更新管理員介面的選單列表

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
  
  // Combine predefined and settings main categories
  const allMainCats = new Set([...Object.keys(PREDEFINED_CATEGORIES), ...settingsData.MainCategories]);
  allMainCats.forEach(c => {
    mainCat.innerHTML += `<option value="${c}">${c}</option>`;
  });
  
  if (allMainCats.size === 0) mainCat.innerHTML = `<option value="工人薪資">工人薪資</option>`;

  // Update Sub Categories when Main Category changes
  mainCat.addEventListener('change', updateSubCategoriesAndUI);
  
  // Initial UI trigger
  updateSubCategoriesAndUI();
}

function updateSubCategoriesAndUI() {
  const mainCatVal = document.getElementById('mainCategory').value;
  const subCat = document.getElementById('subCategory');
  const hoursLabel = document.getElementById('hoursLabel');
  const rateLabel = document.getElementById('rateLabel');
  subCat.innerHTML = '';

  // Get subs for current main, combine with custom from settings
  let subs = PREDEFINED_CATEGORIES[mainCatVal] || [];
  const allSubs = new Set([...subs, ...settingsData.SubCategories]);
  
  allSubs.forEach(c => {
    subCat.innerHTML += `<option value="${c}">${c}</option>`;
  });

  // UI Toggles
  const workerWrap = document.getElementById('workerNameWrap');
  const workerInput = document.getElementById('workerName');
  const lunchWrap = document.getElementById('lunchCheckWrap');
  const includeLunch = document.getElementById('includeLunch');

  if (mainCatVal === '工人薪資') {
    workerWrap.style.display = 'block';
    workerInput.required = true;
    lunchWrap.style.display = 'flex';
    hoursLabel.innerText = '時數/天數 *';
    rateLabel.innerText = '時薪/日薪 *';
  } else {
    workerWrap.style.display = 'none';
    workerInput.required = false;
    workerInput.value = ''; // clear value
    lunchWrap.style.display = 'none';
    includeLunch.checked = false;
    hoursLabel.innerText = '數量 *';
    rateLabel.innerText = '單價 *';
  }
}

// 綁定儲存按鈕
document.getElementById('recordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const existingId = document.getElementById('recordId').value;
  const id = existingId || generateUUID();
  const date = document.getElementById('workDate').value;
  let worker = document.getElementById('workerName').value || '-';
  const mainCat = document.getElementById('mainCategory').value;
  const subCat = document.getElementById('subCategory').value;
  const hours = document.getElementById('workHours').value;
  const rate = document.getElementById('hourlyRate').value;
  let notes = document.getElementById('notes').value;
  
  const includeLunch = document.getElementById('includeLunch').checked;
  // 如果備註中已經有 [含午餐$100]，先移除它以免重疊
  notes = notes.replace(/\[含午餐\$100\]\s*/g, '');
  if (includeLunch && mainCat === '工人薪資') {
    notes = notes ? `[含午餐$100] ${notes}` : '[含午餐$100]';
  }
  
  const timestamp = new Date().toISOString();
  const rowData = [id, date, worker, mainCat, subCat, hours, rate, notes, timestamp];

  showLoader(existingId ? '更新中...' : '儲存中...');
  try {
    if (existingId) {
      // 編輯模式：找到該筆紀錄在試算表中的位置
      // 注意：這裡假設 Records!A:I 的順序沒有變動
      const rowIndex = recordsData.findIndex(r => r.id === existingId) + 2; // +2 因為從 A2 開始且 1-indexed
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Records!A${rowIndex}:I${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
      // 更新本地資料
      const idx = recordsData.findIndex(r => r.id === existingId);
      recordsData[idx] = { id, date, worker, mainCat, subCat, hours, rate, notes, timestamp };
    } else {
      // 新增模式
      await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Records!A:I',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [rowData] }
      });
      recordsData.push({ id, date, worker, mainCat, subCat, hours, rate, notes, timestamp });
    }

    resetForm();
    renderRecords();
    alert(existingId ? '更新成功！' : '儲存成功！');
  } catch (err) {
    console.error(err);
    alert('發生錯誤：' + err.message);
  }
  hideLoader();
});

function resetForm() {
  document.getElementById('recordForm').reset();
  document.getElementById('recordId').value = '';
  document.getElementById('saveBtn').innerText = '儲存紀錄';
  document.getElementById('workDate').valueAsDate = new Date();
  updateSubCategoriesAndUI();
}

window.editRecord = function(id) {
  const r = recordsData.find(item => item.id === id);
  if (!r) return;

  document.getElementById('recordId').value = r.id;
  document.getElementById('workDate').value = r.date;
  document.getElementById('mainCategory').value = r.mainCat;
  updateSubCategoriesAndUI(); // 先更新連動選單
  document.getElementById('subCategory').value = r.subCat;
  document.getElementById('workerName').value = r.worker === '-' ? '' : r.worker;
  document.getElementById('workHours').value = r.hours;
  document.getElementById('hourlyRate').value = r.rate;
  
  // 檢查備註中是否有午餐標記
  if (r.notes && r.notes.includes('[含午餐$100]')) {
    document.getElementById('includeLunch').checked = true;
    document.getElementById('notes').value = r.notes.replace(/\[含午餐\$100\]\s*/g, '');
  } else {
    document.getElementById('includeLunch').checked = false;
    document.getElementById('notes').value = r.notes || '';
  }

  document.getElementById('saveBtn').innerText = '更新紀錄';
  document.getElementById('formSection').scrollIntoView({ behavior: 'smooth' });
};

window.deleteRecord = async function(id) {
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;

  const rowIndex = recordsData.findIndex(r => r.id === id) + 2;
  showLoader('刪除中...');
  try {
    // 取得 Records 工作表的 sheetId
    const ss = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = ss.result.sheets.find(s => s.properties.title === 'Records');
    const sheetId = sheet ? sheet.properties.sheetId : null;

    // Google Sheets API 刪除行需要使用 batchUpdate
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });
    // 更新本地資料
    recordsData = recordsData.filter(r => r.id !== id);
    renderRecords();
    alert('刪除成功！');
  } catch (err) {
    console.error(err);
    alert('刪除失敗，請檢查權限。');
  }
  hideLoader();
};

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
document.getElementById('resetFormBtn').addEventListener('click', resetForm);

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
    let rawTotal = parseFloat(r.hours) * parseFloat(r.rate);
    let isLunch = r.notes && r.notes.includes('[含午餐$100]');
    if (isLunch) rawTotal += 100;
    const total = rawTotal.toLocaleString();
    const div = document.createElement('div');
    div.className = 'record-card';
    div.innerHTML = `
      <div class="record-main" style="align-items:center;">
        <div>
          <strong style="fontSize:1.1rem; color:var(--text-main);">${r.worker !== '-' ? r.worker : r.mainCat}</strong>
          <span class="text-sm" style="color:var(--text-muted); margin-left:8px;">${r.date}</span>
          <br>
          <span class="badge category">${r.mainCat} - ${r.subCat}</span>
          ${r.notes ? `<span class="badge" style="background:#fef08a;">${r.notes}</span>` : ''}
        </div>
        <div style="text-align:right;">
          <strong style="font-size:1.2rem;">$${total}</strong>
          <br>
          <span class="text-sm" style="color:var(--text-muted);">${r.hours} <small>單位</small> x $${r.rate}</span>
        </div>
      </div>
      <div class="record-actions" style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end; border-top:1px solid #eee; padding-top:8px;">
        <button class="btn btn-icon btn-sm" onclick="editRecord('${r.id}')" title="編輯"><span class="material-symbols-outlined" style="font-size:18px;">edit</span></button>
        <button class="btn btn-icon btn-sm text-danger" onclick="deleteRecord('${r.id}')" title="刪除"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
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
    renderSettingsAdmin();
    document.getElementById(inputId).value = '';
    alert('選項新增成功！');
  } catch (err) {
    console.error(err);
    alert('選項新增失敗！');
  }
  hideLoader();
};

function renderSettingsAdmin() {
  const renderList = (id, list, type) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    list.forEach(val => {
      const div = document.createElement('div');
      div.style = 'display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #eee;';
      div.innerHTML = `
        <span>${val}</span>
        <button class="btn btn-icon btn-sm text-danger" onclick="deleteSetting('${type}', '${val}')">
          <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
        </button>
      `;
      el.appendChild(div);
    });
  };

  renderList('workerListAdmin', settingsData.Workers, 'Worker');
  renderList('mainCatListAdmin', settingsData.MainCategories, 'MainCategory');
  renderList('subCatListAdmin', settingsData.SubCategories, 'SubCategory');
}

window.deleteSetting = async function(type, value) {
  if (!confirm(`確定要刪除「${value}」嗎？`)) return;

  // 1. 找到該設定在 Settings!A:B 的哪一行
  // 先重新抓取 Settings 確保行號正確 (或在本地算，但為了安全重新抓取一次並比對)
  showLoader('刪除設定中...');
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Settings!A:B',
    });
    const rows = res.result.values;
    let rowIndex = -1;
    if (rows) {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === type && rows[i][1] === value) {
          rowIndex = i + 1; // 1-indexed
          break;
        }
      }
    }

    if (rowIndex === -1) throw new Error('找不到該設定。');

    // 2. 取得 Settings 工作表的 sheetId
    const ss = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheet = ss.result.sheets.find(s => s.properties.title === 'Settings');
    const sheetId = sheet ? sheet.properties.sheetId : null;

    // 3. 刪除該行
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex - 1,
              endIndex: rowIndex
            }
          }
        }]
      }
    });

    // 4. 更新本地狀態
    if (type === 'Worker') settingsData.Workers = settingsData.Workers.filter(v => v !== value);
    if (type === 'MainCategory') settingsData.MainCategories = settingsData.MainCategories.filter(v => v !== value);
    if (type === 'SubCategory') settingsData.SubCategories = settingsData.SubCategories.filter(v => v !== value);

    populateSelects();
    renderSettingsAdmin();
    alert('刪除成功！');
  } catch (err) {
    console.error(err);
    alert('刪除失敗：' + err.message);
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
    let lunchText = '';
    let isLunch = r.notes && r.notes.includes('[含午餐$100]');
    if (isLunch) {
       sub += 100;
       lunchText = ' (+午餐100)';
    }
    sum += sub;
    const workerDisplay = r.worker !== '-' ? `🧑‍🌾 ${r.worker}` : `📦 ${r.mainCat}`;
    text += `\n${workerDisplay} (${r.subCat})`;
    if (r.notes) text += ` [${r.notes}]`;
    text += `\n└ ${r.hours} x ${r.rate}${lunchText} = $${sub.toLocaleString()}`;
  });

  text += `\n\n💵 今日總花費：$${sum.toLocaleString()}`;

  navigator.clipboard.writeText(text).then(() => {
    alert('✅ 已複製到剪貼簿，可以直接去 LINE 貼上了！');
  }).catch(err => {
    alert('自動複製失敗，已將明細產生於下方，請手動複製。');
    const ta = document.getElementById('copyPreview');
    ta.hidden = false;
    ta.value = text;
  });
});
