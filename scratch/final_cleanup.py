import re
import os

def final_cleanup():
    file_path = r'f:\可\網頁開發\salary\app.js'
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    # Define a list of common corruptions found in app.js
    rep_map = {
        r'\?': '日期',
        r'主類別\'': '主類別:',
        r'次類別\'': '次類別:',
        r'\?\?': '數量',
        r'\?價': '單價',
        r'總\?': '總額',
        r'使用\?\?': '使用者',
        r'設\?_': '設定_',
        r'市場\?入': '市場收入',
        r'客戶\?單': '客戶訂單',
        r'零售\?單': '零售訂單',
        r'建\?\?\?\?': '建立時間',
        r'\?後更\?\?': '最後更新',
        r'付款\?': '付款狀態',
        r'對帳\?': '對帳狀態',
        r'已支\?': '已支付',
        r'工人姓\?': '工人姓名',
        r'計薪\?': '計薪方式',
        r'午餐費\?': '午餐費',
        r'\?日\?': '結算日期',
        r'待??': '待對帳',
        r'已??': '已結清',
        r'\?無紀\?\?': '暫無紀錄',
        r'\?資\?': '等級資訊',
        r'等\?': '等級',
        r'箱數\?': '箱數',
        r'總重\?': '總重',
        r'寄件\?': '寄件人',
        r'收件\?': '收件人',
        r'下\?\?': '下單時間',
        r'出貨\?': '出貨時間',
        r'\?費': '運費',
        r'\?註': '備註',
        r'\???': '單位',
        r'主類別 :': '主類別:',
        r'次類別 :': '次類別:',
    }

    # Perform replacements
    for pattern, replacement in rep_map.items():
        text = re.sub(pattern, replacement, text)

    # Specific fixes for malformed code lines found during inspection
    text = text.replace("r.總價 ? $ : '待確認'", "r.總價 ? '$' + r.總價 : '待確認'")
    text = text.replace("showToast('權?不足", "showToast('權限不足")
    text = text.replace("無法進入管??面", "無法進入管理頁面")
    text = text.replace("??渲?複?式卡??", "渲染複合式卡片")
    
    # Fix broken colons in objects
    text = re.sub(r'([a-zA-Z\u4e00-\u9fa5]+)\'\s*([a-zA-Z\d_]+)', r'\1: \2', text)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Final cleanup completed")

if __name__ == "__main__":
    final_cleanup()
