const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');

// 修復 2228 行: record.主類別:: (settings.incomeMainCats[0]?.?稱 || '');
content = content.replace(/record\.主類別::\s*\(settings\.incomeMainCats\[0\]\?\..稱\s*\|\|\s*''\)/, "record.主類別 : (settings.incomeMainCats[0]?.名稱 || '')");

// 修復 2234 行: record.次類別:|| record.???註 || '';
content = content.replace(/record\.次類別:\|\|\s*record\..+註\s*\|\|\s*''/, "record.次類別 || record.備註 || ''");

// 修復 3043 行: showToast('請輸?次類別:目?稱', 'error')
content = content.replace(/showToast\('請輸.次類別.目.稱', 'error'\)/, "showToast('請輸入次類別項目名稱', 'error')");

// 修復 3178-3180 行註釋
content = content.replace(/\/\*\*\s+\*\s+.+次類別[\s\S]+?\*\//, "/**\n * 解析批量次類別\n * 格式：品名 數量 單位 $單價 / =總額\n */");

// 修復 60-62 行註釋
content = content.replace(/\/\/ \[{ .稱, 次類別: \[\], 等.: \[\] }\]/, "// [{ 名稱, 次類別: [], 等級: [] }]");
content = content.replace(/\/\/ \[{ .種, 次類別: 等., .+顆數, .價 }\]/, "// [{ 品種, 次類別: 等級, 數量, 顆數, 總價 }]");
content = content.replace(/\/\/ \[{ .稱, 類., 次類別: \[{.+}\] }\]/, "// [{ 名稱, 類型, 次類別: [{名稱, 預設費率}] }]");

// 修正屬性存取器的遺留問題
content = content.replace(/次類別'/g, "次類別:");
content = content.replace(/主類別'/g, "主類別:");

fs.writeFileSync('app.js', content, 'utf8');
console.log('Final flexible repair complete.');
