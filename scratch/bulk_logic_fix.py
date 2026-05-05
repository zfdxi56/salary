import os

def bulk_logic_fix():
    file_path = r'f:\可\網頁開發\salary\app.js'
    
    logic = """
// ============================================================
// 15. 批量操作邏輯 (一鍵對帳/結清)
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
  
  // 顯示批量工具列
  const bar = document.getElementById('bulkActionBar');
  if (bar) bar.classList.add('active');
  updateBulkCount();
  
  // 在所有紀錄項目上添加 Checkbox 或點擊選取樣式
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
    // 恢復原始點擊 (如果有)
    item.onclick = null; 
  });
  
  // 重新渲染表格以恢復原始事件
  if (currentTab === 'revenue') renderIncomeTable();
  if (currentTab === 'expense') renderExpenseTable();
};

function updateBulkCount() {
  const countEl = document.getElementById('bulkCount');
  if (countEl) countEl.textContent = selectedIds.size;
}

window.handleBulkSettle = async function() {
  if (selectedIds.size === 0) {
    showToast('請先選擇要處理的項目', 'warning');
    return;
  }
  
  const type = multiSelectMode.type;
  const idsToUpdate = Array.from(selectedIds);
  
  showLoader('批次更新中...');
  try {
    // 根據類型決定更新哪個欄位
    let field = '';
    let newValue = '';
    let targetSheet = '';
    
    if (type === 'income') {
      field = '對帳狀態';
      newValue = 'OK';
      targetSheet = SHEET.MARKET_INCOME;
    } else if (type === 'order') {
      field = '對帳狀態';
      newValue = 'OK';
      targetSheet = SHEET.ORDERS;
    } else if (type === 'salary') {
      field = '已支付';
      newValue = 'TRUE';
      targetSheet = SHEET.EXPENSE_SALARY;
    } else if (type === 'cost') {
      field = '已支付';
      newValue = 'TRUE';
      targetSheet = SHEET.EXPENSE_COST;
    }

    // 呼叫後端批次更新 (假設後端有 updateRecords)
    // 這裡使用循環調用作為備案，如果量大建議改用後端 batchUpdate
    for (const id of idsToUpdate) {
      await updateRecordInSheet(targetSheet, id, field, newValue);
    }
    
    showToast(`✓ 已成功處理 ${idsToUpdate.length} 筆項目`);
    cancelMultiSelect();
    
    // 重新載入數據
    if (type === 'income' || type === 'order') await fetchIncome();
    if (type === 'salary' || type === 'cost') await fetchExpense();
    
    renderIncomeTable();
    renderExpenseTable();
    renderIncomeChart();
    renderExpenseChart();
  } catch (err) {
    console.error(err);
    showToast('批次處理失敗', 'error');
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

  // 根據 sheetName 和 field 決定 Column
  let col = 'A';
  if (sheetName === SHEET.MARKET_INCOME) {
    if (field === '對帳狀態') col = 'P'; // 假設 P 欄
  } else if (sheetName === SHEET.EXPENSE_SALARY) {
    if (field === '已支付') col = 'O'; 
  } else if (sheetName === SHEET.EXPENSE_COST) {
    if (field === '已支付') col = 'H';
  }
  
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${col}${rowIdx}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [[value]] }
  });
}
"""
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(logic)
    print("Bulk logic appended to app.js")

if __name__ == "__main__":
    bulk_logic_fix()
