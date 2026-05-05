import sys

def replace_lines(file_path, start_line, end_line, new_content):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    # Lines are 1-indexed in my request, so adjust to 0-indexed
    start_idx = start_line - 1
    end_idx = end_line # end_line is inclusive in some contexts, but here we'll assume it's the index to stop before
    
    # We need to find the actual start and end markers to be safe
    # Or just trust the line count if we just read it.
    # Let's find 'const SHEET = {' and the closing '};'
    
    actual_start = -1
    actual_end = -1
    for i, line in enumerate(lines):
        if 'const SHEET = {' in line:
            actual_start = i
        if actual_start != -1 and '};' in line and i > actual_start:
            actual_end = i
            break
            
    if actual_start != -1 and actual_end != -1:
        new_lines = lines[:actual_start] + [new_content + '\n'] + lines[actual_end+1:]
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f"Replaced lines from {actual_start+1} to {actual_end+1}")
    else:
        print("Markers not found")

new_sheet = """const SHEET = {
  USERS: '使用者',
  INCOME_CATS: '設定_類別',
  RETAIL_PRICE: '設定_零售價格數據',
  EXPENSE_CATS: '設定_支出費率',
  WORKERS: '設定_工人名單',
  UNITS: '設定_單位清單',
  MARKET_INCOME: '市場收入',
  EXPENSE_SALARY: '支出_工人',
  EXPENSE_COST: '支出_雜費',
  EXPENSE: '支出',
  CUSTOMERS: '客戶名單',
  ORDERS: '客戶訂單明細',
  SETTINGS: '設定',
  RETAIL_ORDERS: '零售訂單'
};"""

if __name__ == "__main__":
    replace_lines(r'f:\可\網頁開發\salary\app.js', 29, 59, new_sheet)
