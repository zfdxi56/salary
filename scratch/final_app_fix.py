import os

def final_app_js_fix():
    file_path = r'f:\可\網頁開發\salary\app.js'
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Add listeners at the end of the file or in init function
    # Let's find the end of the file or a good place
    
    new_listeners = [
        "\n// --- 補全缺失的事件監聽器 ---\n",
        "document.getElementById('cancelIncomeBtn')?.addEventListener('click', closeIncomeModal);\n",
        "document.getElementById('cancelExpenseBtn')?.addEventListener('click', closeExpenseModal);\n",
        "document.getElementById('confirmCancel')?.addEventListener('click', () => {\n",
        "  const modal = document.getElementById('confirmModal');\n",
        "  if (modal) modal.style.display = 'none';\n",
        "});\n"
    ]

    # Ensure openIncomeModal/openExpenseModal hide FAB
    for i, line in enumerate(lines):
        if 'function openIncomeModal' in line:
            # Check if next few lines have fabContainer hide
            found = False
            for j in range(i, i+10):
                if 'fabContainer' in lines[j] and 'none' in lines[j]:
                    found = True; break
            if not found:
                lines.insert(i+1, "  document.getElementById('fabContainer') ? (document.getElementById('fabContainer').style.display = 'none') : null;\n")
        
        if 'function openExpenseModal' in line:
            found = False
            for j in range(i, i+10):
                if 'fabContainer' in lines[j] and 'none' in lines[j]:
                    found = True; break
            if not found:
                lines.insert(i+1, "  document.getElementById('fabContainer') ? (document.getElementById('fabContainer').style.display = 'none') : null;\n")

    lines.extend(new_listeners)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Final app.js fix applied")

if __name__ == "__main__":
    final_app_js_fix()
