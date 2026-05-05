import re
import os

def fuzzy_repair():
    file_path = r'f:\可\網頁開發\salary\app.js'
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    # Repair target 1: Bulk input result.push block
    # Match from 'result.push' to 'return result;' allowing for any characters in between
    pattern1 = r'result\.push\(\{\s*id: generateId\(\),\s*次類別: name,[\s\S]+?\}\);\s*\}\);\s*return result;'
    repair1 = '''result.push({
      id: generateId(),
      次類別: name,
      工人姓名: '',
      數量: qty,
      單位: unit,
      單價: unitPrice,
      總額: total,
    });
  });
  return result;'''
    
    # Repair target 2: confirmDelete textContent
    pattern2 = r'document\.getElementById\(\'confirmMsg\'\)\.textContent =\s+type === \'income\' \? [^:]+ : [^;]+;'
    repair2 = "document.getElementById('confirmMsg').textContent = type === 'income' ? '確定要刪除這筆收入紀錄嗎？' : '確定要刪除這筆支出紀錄嗎？';"

    # Repair target 3: common corrupted property names in loop or object
    text = re.sub(pattern1, repair1, text)
    text = re.sub(pattern2, repair2, text)
    
    # Repair target 4: specifically for 3120 area (Expense submit)
    text = text.replace("??? lunch ? 'TRUE' : 'FALSE'", "午餐費: lunch ? 'TRUE' : 'FALSE'")
    text = text.replace("?後更?? now()", "最後更新: now()")
    text = text.replace("主類別' mainVal", "主類別: mainVal")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Fuzzy repair completed")

if __name__ == "__main__":
    fuzzy_repair()
