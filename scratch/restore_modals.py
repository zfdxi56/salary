import os

def restore_modals_and_fab():
    file_path = r'f:\可\網頁開發\salary\app.js'
    
    missing_code = """
// ============================================================
// 5. FAB 與 Modal 控制邏輯
// ============================================================

// --- FAB 控制 ---
window.onload_fab = function() { 
  const fabMain = document.getElementById('fabMain');
  const fabMenu = document.getElementById('fabMenu');
  
  if (fabMain) {
    fabMain.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = fabMain.classList.contains('active');
      if (isActive) {
        fabMain.classList.remove('active');
        fabMenu.classList.remove('active');
      } else {
        fabMain.classList.add('active');
        fabMenu.classList.add('active');
      }
    });
  }

  // 點擊外面關閉 FAB 選單
  document.addEventListener('click', (e) => {
    if (fabMenu && fabMenu.classList.contains('active') && !e.target.closest('#fabContainer')) {
      fabMain.classList.remove('active');
      fabMenu.classList.remove('active');
    }
  });
};
// 立即執行綁定
setTimeout(window.onload_fab, 1000);

window.handleFabAction = function(type) {
  const fabMain = document.getElementById('fabMain');
  const fabMenu = document.getElementById('fabMenu');
  if (fabMain) fabMain.classList.remove('active');
  if (fabMenu) fabMenu.classList.remove('active');
  
  if (type === 'income') {
    openIncomeModal();
  } else if (type === 'expense') {
    openExpenseModal();
  }
};

// --- Modal 控制 ---
window.openIncomeModal = function() {
  const modal = document.getElementById('incomeModal');
  if (modal) modal.style.display = 'flex';
  
  // 隱藏 FAB
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'none';

  // 預設日期為今日
  const dateInput = document.getElementById('incomeDate');
  if (dateInput) {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${today.getFullYear()}-${mm}-${dd}`;
  }

  // 載入主類別
  const mainCatSelect = document.getElementById('incomeMainCat');
  if (mainCatSelect) {
    mainCatSelect.innerHTML = '<option value="">請選擇</option>';
    settings.incomeMainCats.forEach(cat => {
      mainCatSelect.innerHTML += `<option value="${cat.名稱}">${cat.名稱}</option>`;
    });
    
    // 綁定聯動事件
    mainCatSelect.onchange = () => {
      const selectedMainCat = mainCatSelect.value;
      
      // 如果是水蜜桃，自動帶入等級
      const gradesContainer = document.getElementById('incomeGradesContainer');
      if (gradesContainer) {
        gradesContainer.innerHTML = ''; // 清空現有
        if (selectedMainCat.includes('水蜜桃')) {
          const defaultGrades = ['2A', '3A', '4A', '5A', '6A'];
          defaultGrades.forEach(grade => {
            gradesContainer.innerHTML += `
              <div class="grade-row" style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" value="${grade}" placeholder="等級" class="grade-name" style="width:60px;" readonly>
                <input type="number" placeholder="箱數" class="grade-boxes" style="width:80px;">
                <input type="number" placeholder="總重" class="grade-weight" style="width:80px;">
                <button type="button" class="btn-icon-sm" style="color:var(--red);" onclick="this.parentElement.remove()">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            `;
          });
        } else {
           // 預設一筆空資料
           gradesContainer.innerHTML = `
              <div class="grade-row" style="display:flex; gap:10px; margin-bottom:10px;">
                <input type="text" placeholder="等級" class="grade-name" style="width:60px;">
                <input type="number" placeholder="箱數" class="grade-boxes" style="width:80px;">
                <input type="number" placeholder="總重" class="grade-weight" style="width:80px;">
                <button type="button" class="btn-icon-sm" style="color:var(--red);" onclick="this.parentElement.remove()">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            `;
        }
      }
    };
  }
};

window.closeIncomeModal = function() {
  const modal = document.getElementById('incomeModal');
  if (modal) modal.style.display = 'none';
  
  // 恢復 FAB
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'flex';
};

window.openExpenseModal = function() {
  const modal = document.getElementById('expenseModal');
  if (modal) modal.style.display = 'flex';
  
  // 隱藏 FAB
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'none';

  // 預設日期為今日
  const dateInput = document.getElementById('expenseDate');
  if (dateInput) {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${today.getFullYear()}-${mm}-${dd}`;
  }

  // 載入主類別
  const mainCatSelect = document.getElementById('expenseMainCat');
  if (mainCatSelect) {
    mainCatSelect.innerHTML = '<option value="">請選擇</option>';
    mainCatSelect.innerHTML += '<option value="工人薪資">工人薪資</option>';
    mainCatSelect.innerHTML += '<option value="資材成本">資材成本</option>';
    
    mainCatSelect.onchange = () => {
      const type = mainCatSelect.value;
      const workerFields = document.getElementById('expenseWorkerFields');
      const materialFields = document.getElementById('expenseMaterialFields');
      
      if (type === '工人薪資') {
        if(workerFields) workerFields.style.display = 'block';
        if(materialFields) materialFields.style.display = 'none';
        
        // 預設薪資 200, 預設時間 7:00-12:00, 13:00-16:00
        const wageInput = document.getElementById('workerWage');
        if (wageInput) wageInput.value = '200';
        
        const amIn = document.getElementById('timeAmIn');
        const amOut = document.getElementById('timeAmOut');
        const pmIn = document.getElementById('timePmIn');
        const pmOut = document.getElementById('timePmOut');
        
        if(amIn) amIn.value = '07:00';
        if(amOut) amOut.value = '12:00';
        if(pmIn) pmIn.value = '13:00';
        if(pmOut) pmOut.value = '16:00';
      } else {
        if(workerFields) workerFields.style.display = 'none';
        if(materialFields) materialFields.style.display = 'block';
      }
    };
  }
};

window.closeExpenseModal = function() {
  const modal = document.getElementById('expenseModal');
  if (modal) modal.style.display = 'none';
  
  // 恢復 FAB
  const fabWrap = document.getElementById('fabContainer');
  if (fabWrap) fabWrap.style.display = 'flex';
};

// 綁定取消按鈕
setTimeout(() => {
  const btnIn = document.getElementById('cancelIncomeBtn');
  const btnEx = document.getElementById('cancelExpenseBtn');
  if(btnIn && !btnIn.onclick) btnIn.onclick = closeIncomeModal;
  if(btnEx && !btnEx.onclick) btnEx.onclick = closeExpenseModal;
}, 1500);
"""
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(missing_code)
    print("Modals and FAB logic restored")

if __name__ == "__main__":
    restore_modals_and_fab()
