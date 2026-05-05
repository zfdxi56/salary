import os

def fix_sheet_object():
    file_path = r'f:\可\網頁開發\salary\app.js'
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()

    start_idx = -1
    end_idx = -1
    for i, line in enumerate(lines):
        if 'const SHEET = {' in line:
            start_idx = i
        if start_idx != -1 and '};' in line and i > start_idx:
            end_idx = i
            break

    if start_idx != -1 and end_idx != -1:
        new_sheet = [
            "const SHEET = {\n",
            "  USERS: '使用者',\n",
            "  INCOME_CATS: '設定_品種',\n",
            "  RETAIL_PRICE: '設定_對外販售等級',\n",
            "  EXPENSE_CATS: '設定_支出類別',\n",
            "  WORKERS: '設定_工人名單',\n",
            "  UNITS: '設定_單位清單',\n",
            "  MARKET_INCOME: '市場收入',\n",
            "  EXPENSE_SALARY: '支出_薪資',\n",
            "  EXPENSE_COST: '支出_成本',\n",
            "  EXPENSE: '支出', // 保留舊名以防萬一\n",
            "  CUSTOMERS: '客戶資料',\n",
            "  ORDERS: '客戶訂單明細',\n",
            "  SETTINGS: '設定',\n",
            "  RETAIL_ORDERS: '零售訂單'\n",
            "};\n"
        ]
        lines = lines[:start_idx] + new_sheet + lines[end_idx+1:]
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print("SHEET object fixed")
    else:
        print("SHEET object not found")

if __name__ == "__main__":
    fix_sheet_object()
