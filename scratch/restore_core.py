import os

def restore_missing_functions():
    file_path = r'f:\可\網頁開發\salary\app.js'
    
    missing_code = """
// ============================================================
// 4. 通用導航與資料獲取
// ============================================================
window.switchTab = function(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  
  const page = document.getElementById('page-' + tabName);
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (page) page.classList.add('active');
  if (btn) btn.classList.add('active');
  
  if (tabName === 'revenue') { renderIncomeChart(); renderIncomeTable(); }
  if (tabName === 'expense') { renderExpenseChart(); renderExpenseTable(); }
  if (tabName === 'balance') { renderBalancePage(); }
  if (tabName === 'admin') { renderAdminDashboard(); }
};
let currentTab = 'revenue';

async function fetchSettings() {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET.SETTINGS}!A:E`
  });
  const rows = res.result.values || [];
  // 解析 settings... (簡化版)
  settings.incomeMainCats = [];
  rows.forEach(r => {
    if (r[0] === '收入主類別') settings.incomeMainCats.push({ 名稱: r[1], 次類別: [], 等級: [] });
  });
}

async function fetchIncome() {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET.MARKET_INCOME}!A:R`
  });
  const rows = res.result.values || [];
  const headers = rows[0];
  incomeData = rows.slice(1).map(r => {
    let obj = {};
    headers.forEach((h, i) => { obj[fieldMap[h] || h] = r[i]; });
    // 特殊處理等級資料
    try { obj.等級資料 = JSON.parse(obj.等級資料 || '[]'); } catch(e) { obj.等級資料 = []; }
    return obj;
  });
}

async function fetchExpense() {
  const resSalary = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET.EXPENSE_SALARY}!A:O`
  });
  const resCost = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET.EXPENSE_COST}!A:H`
  });
  
  const salaryRows = resSalary.result.values || [];
  const salaryHeaders = salaryRows[0];
  const salaryData = salaryRows.slice(1).map(r => {
    let obj = { _sourceSheet: SHEET.EXPENSE_SALARY };
    salaryHeaders.forEach((h, i) => { obj[fieldMap[h] || h] = r[i]; });
    return obj;
  });

  const costRows = resCost.result.values || [];
  const costHeaders = costRows[0];
  const costData = costRows.slice(1).map(r => {
    let obj = { _sourceSheet: SHEET.EXPENSE_COST };
    costHeaders.forEach((h, i) => { obj[fieldMap[h] || h] = r[i]; });
    return obj;
  });

  expenseData = [...salaryData, ...costData];
}

async function fetchCustomers() {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET.CUSTOMERS}!A:E`
  });
  const rows = res.result.values || [];
  const headers = rows[0];
  customersData = rows.slice(1).map(r => {
    let obj = {};
    headers.forEach((h, i) => { obj[fieldMap[h] || h] = r[i]; });
    return obj;
  });
}

async function fetchOrders() {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET.ORDERS}!A:R`
  });
  const rows = res.result.values || [];
  const headers = rows[0];
  ordersData = rows.slice(1).map(r => {
    let obj = {};
    headers.forEach((h, i) => { obj[fieldMap[h] || h] = r[i]; });
    try { obj.等級資料 = JSON.parse(obj.等級資料 || '[]'); } catch(e) { obj.等級資料 = []; }
    return obj;
  });
}

async function fetchUsers() {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET.USERS}!A:C`
  });
  const rows = res.result.values || [];
  const headers = rows[0];
  usersData = rows.slice(1).map(r => {
    let obj = {};
    headers.forEach((h, i) => { obj[fieldMap[h] || h] = r[i]; });
    return obj;
  });
}

// 綁定 Tab 點擊事件
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});
"""
    # Append after fieldMap
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(missing_code)
    print("Missing core functions restored")

if __name__ == "__main__":
    restore_missing_functions()
