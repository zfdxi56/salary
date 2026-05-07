# 果園收支管理系統：開發計畫與技術手冊 (2024.05.07 版)

## 1. 系統願景
本系統旨在為果園開發一套具備現代化 UI、高效數據統計與 Google Sheets 同步功能的移動端優先 Web App。透過視覺化的統計卡片與靈活的篩選機制，協助管理員快速掌握收支細節。

---

## 2. 核心功能頁面與近期更新

### ✅ 已完成項目 (Recently Completed)
- **訂單渲染修正 (Order Detail Rendering)**：解決了訂單紀錄在 UI 上無法正確顯示的問題，確保 `ordersData` 與 DOM 元素的對齊。
- **數據同步穩定化 (Data Sync Stability)**：修正了 `fetchHeadersCache` 的無效工作表引用，並落實了日期篩選邏輯（預設顯示最近一年數據）。
- **權限與佈局優化**：實現了基於角色的權限控管，管理員按鈕僅在編輯模式下顯示，並修正了移動端導航欄與 FAB 的顯示邏輯。
- **複合式收入儀表板 (Composite Income Card)**：整合市場收入與客戶訂單，支援品種比例的堆疊條形圖。

### 🧹 程式碼重組與優化 (Current Focus)
目前 `app.js` 檔案過於龐大（超過 5000 行），包含許多未被使用的舊版 UI 邏輯及重複定義的函式，導致後續維護與除錯困難。本次更新將進行大規模瘦身：
1. **移除失效的圖表渲染函式**：清除 `renderIncomeChart`、`renderExpenseChart`、`renderRevenueSummary` 等對應舊版圓餅圖的無用程式碼。
2. **清理重複定義的 API 初始化邏輯**：移除重複的 `gapiLoaded`、`gisLoaded`、`maybeEnableAuth` 宣告。
3. **刪除覆蓋正常邏輯的簡化版函式**：移除檔案底部 (Line 5100+) 重複宣告的 `fetchSettings`、`fetchIncome` 等資料讀取邏輯，保留並使用上方已具備完整容錯與欄位對齊功能的穩定版本。
4. **移除重複的共用函式**：移除多餘的 `appendToSheet` 宣告，統一使用具備 Token 更新重試機制的 `safeSheetsAppend` 封裝。

---

## 3. 技術規格與數據架構

### 🏗️ 系統架構
- **前端**：Vanilla JS + CSS3 (Glassmorphism 風格) + HTML5。
- **後端**：Google Sheets API (v4)。
- **認證**：Google OAuth 2.0 (Identity Service)。

### 📁 資料儲存結構 (Google Sheets)
- **USERS**：儲存 Email 與角色 (Admin/User)。
- **SETTINGS**：系統預設與自定義類別、工人清單、販售定價。
- **MARKET_INCOME**：市場批發紀錄。
- **EXPENSE_SALARY / EXPENSE_COST**：詳細支出分類。
- **ORDERS**：客戶訂單明細。

---

## 4. UI/UX 設計規範
- **Stat Cards**：統一使用卡片式總覽，具備 `border-top` 品種色條。
- **Dynamic Design**：
  - 🍎 甜柿：綠色系 (`#22c55e`)
  - 🍑 水蜜桃：藍色系 (`#3b82f6`)
  - 🍊 橘子：紫色系 (`#a855f7`)
  - ⚠️ 支出：紅色系 (`#ef4444`)
- **FAB**：右下角懸浮按鈕，提供快速新增入口。

---

## 5. 驗證與測試項目
1. **跨裝置測試**：確保 iOS/Android 瀏覽器下的 FAB 不會遮擋內容。
2. **數據準確性**：驗證 Google Sheets 寫入操作後的 UI 即時更新。
3. **離線處理**：測試在無網路環境下的錯誤提示與數據保護。

---

## 6. 後續計畫 (Roadmap)
- [ ] 實作 PWA 離線支援。
- [ ] 強化統計頁面的年度對比功能。
- [ ] 增加系統操作日誌紀錄。
