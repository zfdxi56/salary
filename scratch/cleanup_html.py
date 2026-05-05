import os

def cleanup_html():
    file_path = r'f:\可\網頁開發\salary\index.html'
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()

    replacements = {
        "確??除": "確認刪除",
        "確??除": "確認刪除", # duplicate in some cases
        ">??<": ">取消<",
        "複製?細": "複製明細",
        "????範?": "日期區間範圍",
        "複製?剪貼簿": "複製到剪貼簿",
        "???..": "載入中...",
        "已選??": "已選取",
        "筆???": "筆紀錄",
        "一???對帳": "一鍵結清/對帳",
        "??????": "批量操作工具欄"
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("HTML cleanup completed")

if __name__ == "__main__":
    cleanup_html()
