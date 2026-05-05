import os

def repair_app_js():
    file_path = r'f:\可\網頁開發\salary\app.js'
    if not os.path.exists(file_path):
        print("File not found")
        return

    with open(file_path, 'rb') as f:
        content = f.read()

    # Define common corrupted patterns and their fixes
    # We use byte strings to avoid encoding issues during replacement
    replacements = [
        # Common UI strings
        (b'\xc5\xaa\xe2\x94\xa4\xe4\xb8\x8d\xe8\xb6\xb3\xef\xbc\x8c\xe7\x84\xa1\xe6\xb3\x95\xe9\x80\xb2\xe5\x85\xa5\xe7\xae\xa1\xe2\x94\xa4\xe2\x94\xa4\xe9\x9d\xa2', "權限不足，無法進入管理頁面".encode('utf-8')),
        (b'\xe7\xa2\xba\xe2\x94\xa4\xe8\xa6\x81\xe5\x83\xaa\xe2\x94\xa4\xe9\x80\x99\xe2\x94\xa4\xe2\x94\xa4\xe5\x85\xa5\xe7\xb4\x80\xe2\x94\xa4\xe2\x94\xa4\xe2\x94\xa4', "確定要刪除這筆收入紀錄嗎？".encode('utf-8')),
        
        # Property names (using broad matches or common corruption markers)
        (b'\xe5\xb7\xa5\xe4\xba\xba\xe5\xa7\x93\xef\xbf\xbd', "工人姓名".encode('utf-8')),
        (b'\xef\xbf\xbd\xef\xbf\xbd\xef\xbf\xbd\xef\xbf\xbd: qty', "數量: qty".encode('utf-8')),
        (b'\xef\xbf\xbd\xef\xbf\xbd\xef\xbf\xbd\xef\xbf\xbd: unit', "單位: unit".encode('utf-8')),
        (b'\xef\xbf\xbd\xef\xbf\xbd\xe5\x83\xb9: unitPrice', "單價: unitPrice".encode('utf-8')),
        (b'\xe7\xb8\xbd\xef\xbf\xbd\xef\xbf\xbd: total', "總額: total".encode('utf-8')),
        
        # Others
        (b'\xef\xbf\xbd\xef\xbf\xbd\xe5\xa4\xb1\xef\xbf\xbd\xef\xbf\xbd', "操作失敗".encode('utf-8')),
    ]

    # Since I don't have the exact byte sequences for all corruptions, 
    # let's try a safer approach for the specific lines identified in previous turns.
    
    # We will read it as text with 'ignore' or 'replace' to find the patterns, 
    # but the user said "Chinese font issue", usually it's UTF-8 interpreted as something else or just destroyed.
    
    # Let's try to replace the known broken blocks as whole strings if possible.
    
    text = content.decode('utf-8', errors='replace')
    
    # Target 1: 3213-3220
    target1 = 'result.push({\n      id: generateId(),\n      次類別: name,\n      工人姓?: \'\',\n      ??: qty,\n      ??: unit,\n      ?價: unitPrice,\n      總?: total,\n    });'
    repair1 = 'result.push({\n      id: generateId(),\n      次類別: name,\n      工人姓名: \'\',\n      數量: qty,\n      單位: unit,\n      單價: unitPrice,\n      總額: total,\n    });'
    
    # Target 2: 3230-3235
    target2 = 'window.confirmDelete = function(type, id) {\n  _pendingDelete = { type, id };\n  document.getElementById(\'confirmMsg\').textContent =\n    type === \'income\' ? \'確?要刪?這??入紀??? : \'確?要刪?這??出紀???;\n  document.getElementById(\'confirmModal\').style.display = \'flex\';\n};'
    repair2 = 'window.confirmDelete = function(type, id) {\n  _pendingDelete = { type, id };\n  document.getElementById(\'confirmMsg\').textContent =\n    type === \'income\' ? \'確定要刪除這筆收入紀錄嗎？\' : \'確定要刪除這筆支出紀錄嗎？\';\n  document.getElementById(\'confirmModal\').style.display = \'flex\';\n};'

    text = text.replace(target1, repair1)
    text = text.replace(target2, repair2)
    
    # Also fix general corrupted tabs and icons
    text = text.replace('權?不足，無法進入管?面', '權限不足，無法進入管理頁面')
    text = text.replace('子? Tab ??（??收??/ 客戶訂單?', '子分頁切換')
    text = text.replace('// ??渲?複?式卡??', '// 渲染複合式收入卡片')
    text = text.replace('// ??後核?', '// 之後核對')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Repair completed")

if __name__ == "__main__":
    repair_app_js()
