import os

def conservative_cleanup():
    file_path = r'f:\可\網頁開發\salary\app.js'
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    # Direct string replacements for common corruptions
    # We only replace patterns that are highly likely to be unique or safe
    replacements = {
        "?? Salary App.js Loaded": "Salary App.js Loaded",
        "使用??": "使用者",
        "市場?入": "市場收入",
        "客戶資?": "客戶資料",
        "客戶訂單?細": "客戶訂單明細",
        "權?不足": "權限不足",
        "無法進入管??面": "無法進入管理頁面",
        "??渲?複?式卡??": "渲染複合式卡片",
        "?後更??": "最後更新",
        "工人姓?": "工人姓名",
        "已支?": "已支付",
        "對帳?": "對帳狀態",
        "付款?": "付款狀態",
        "??: qty": "數量: qty",
        "?價: unitPrice": "單價: unitPrice",
        "總?: total": "總額: total",
        "??? lunch": "午餐費: lunch",
        "??: date": "日期: date",
        "主類別'": "主類別:",
        "次類別'": "次類別:",
        "建???": "建立時間",
        "?無紀??": "暫無紀錄",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Conservative cleanup completed")

if __name__ == "__main__":
    conservative_cleanup()
