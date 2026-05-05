import os

def admin_edit_fix():
    file_path = r'f:\可\網頁開發\salary\app.js'
    
    logic = """
// ============================================================
// 16. 管理頁面編輯模式控管
// ============================================================
let adminEditMode = false;

window.toggleAdminEdit = function(btn) {
  adminEditMode = !adminEditMode;
  
  // 切換圖示顏色或內容
  if (btn) {
    btn.classList.toggle('active', adminEditMode);
    const icon = btn.querySelector('.material-symbols-outlined');
    if (icon) {
      icon.textContent = adminEditMode ? 'edit_off' : 'edit_note';
    }
  }

  // 控制所有管理按鈕的顯示
  document.querySelectorAll('.admin-action, .btn-row-edit, .btn-row-delete').forEach(el => {
    el.style.display = adminEditMode ? 'inline-flex' : 'none';
  });

  showToast(adminEditMode ? '已開啟管理編輯模式' : '已關閉管理編輯模式', 'info');
};

// 確保渲染表格時考慮編輯模式
// (需在各個 renderAdminXXX 函數中加入對 adminEditMode 的判斷，
//  或者透過 CSS 直接控制，這裡建議透過 CSS 類別更優雅)
"""
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(logic)
    print("Admin edit logic appended to app.js")

    # Add CSS support for admin edit mode
    css_path = r'f:\可\網頁開發\salary\style.css'
    with open(css_path, 'a', encoding='utf-8') as f:
        f.write("""
/* 管理頁面編輯模式隱藏 */
.admin-action, .btn-row-edit, .btn-row-delete {
  display: none;
}
.btn-edit-toggle.active {
  background: var(--red-light);
  color: var(--red);
  border-color: var(--red);
}
""")
    print("Admin edit CSS appended to style.css")

if __name__ == "__main__":
    admin_edit_fix()
