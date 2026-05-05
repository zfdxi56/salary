import os

def restore_auth_logic():
    file_path = r'f:\可\網頁開發\salary\app.js'
    
    # We need to find where to insert. Let's insert after global state.
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    insert_idx = -1
    for i, line in enumerate(lines):
        if 'let sheetHeadersCache = {};' in line:
            insert_idx = i + 1
            break
            
    if insert_idx == -1: insert_idx = 100 # Fallback
    
    auth_logic = """
// ============================================================
// 3. Google API / GIS 初始化與登入邏輯
// ============================================================
window.onload = function() {
  console.log('Window Loaded - Initializing GAPI/GIS');
  gapiLoaded();
  gisLoaded();
};

function gapiLoaded() {
  gapi.load('client', intializeGapiClient);
}

async function intializeGapiClient() {
  await gapi.client.init({
    apiKey: '', // 如果需要 apiKey 可填寫
    discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  });
  gapiInited = true;
  maybeEnableAuth();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // 後續動態設定
  });
  gisInited = true;
  maybeEnableAuth();
}

function maybeEnableAuth() {
  if (gapiInited && gisInited) {
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
      authBtn.style.display = 'inline-flex';
      authBtn.onclick = handleAuthClick;
    }
  }
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    // 儲存 Token
    const token = gapi.client.getToken();
    if (token) {
      // 獲取使用者資訊
      await fetchUserInfo();
      await initializeApp();
    }
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

async function fetchUserInfo() {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${gapi.client.getToken().access_token}` }
    });
    const info = await resp.json();
    currentUser = { email: info.email, name: info.name, picture: info.picture };
    console.log('Logged in as:', currentUser.email);
  } catch (err) {
    console.error('Fetch user info failed', err);
  }
}

async function initializeApp() {
  showLoader('載入系統資料...');
  try {
    // 隱藏登入畫面，顯示主工作區
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('workspace').style.display = 'block';
    
    // 更新 UI 使用者資訊
    const nameEl = document.getElementById('userNameDisplay');
    if (nameEl) nameEl.textContent = currentUser.name || currentUser.email.split('@')[0];
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'inline-flex';
    document.getElementById('refreshBtn').style.display = 'inline-flex';

    // 載入所有資料
    await fetchInitialData();
    
    // 預設進入收入分頁
    switchTab('revenue');
    
    showToast('系統初始化完成');
  } catch (err) {
    console.error('Init App Failed', err);
    showToast('初始化失敗：' + err.message, 'error');
  } finally {
    hideLoader();
  }
}

async function fetchInitialData() {
  await fetchSettings();
  await fetchIncome();
  await fetchExpense();
  await fetchCustomers();
  await fetchOrders();
  await fetchUsers(); // 檢查權限
  
  // 檢查是否為管理員
  const userRecord = usersData.find(u => u.Email === currentUser.email);
  isAdmin = userRecord && (userRecord.角色 === '管理員' || userRecord.角色 === 'admin');
  if (isAdmin) {
    document.getElementById('tab-admin').style.display = 'inline-flex';
    const badge = document.getElementById('userRoleBadge');
    if (badge) { badge.textContent = '管理員'; badge.style.display = 'inline-block'; }
  }
}

// 登出邏輯
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
"""
    
    lines.insert(insert_idx, auth_logic)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Auth logic restored in app.js")

if __name__ == "__main__":
    restore_auth_logic()
