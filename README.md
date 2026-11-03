# CipherDesk · Advanced Security Education Lab

擬真的繁體中文企業文件協作平台，包含文件資料庫、歷史版本、成員邀請、審批、背景匯出、共用連結、活動紀錄與 API 探索器。

線上網站：<https://steventeng2022.github.io/hacksite-CipherDesk/>

本專案刻意保留授權與流程漏洞。所有組織、人物、Email、文件、權杖與金額都是虛構資料；沒有真實雲端帳號、寄信、付款或外部 API。請勿將刻意脆弱的 HTTP 服務公開到網際網路或接上正式資料。

## 兩種教學模式

- GitHub Pages：漏洞引擎在瀏覽器內執行，適合自學與示範。所有靜態資料都能被檢視，不能作為防作弊考核，也不能用外部掃描器直接掃出 API 漏洞。
- 本機 HTTP 靶場：相同漏洞邏輯由 Node.js loopback 服務執行，可搭配 curl、Burp 或瀏覽器 Network。只綁定 `127.0.0.1`，拒絕跨來源請求，資料只存在程序記憶體。

## 執行

需要 Node.js 22 或以上。

```sh
npm ci --ignore-scripts
npm run dev
# http://127.0.0.1:4174/hacksite-CipherDesk/

npm run lab:api
# http://127.0.0.1:4180/hacksite-CipherDesk/
```

開啟後會自動取得虛構的 Mika / Aster / editor 身分。線上與本機介面都提供 API 探索器、分層提示、完整重現步驟、修補方向、進度匯出與狀態重設。

## 八個進階任務

1. 跨租戶上下文：從搜尋取得 ID，偽造工作空間 header，讀取另一租戶受限文件。
2. 已刪除歷史版本：從 revisionRefs 找到被隱藏版本與遺留工作 ID。
3. 邀請角色過度綁定：對自己建立管理員邀請，接受後取得新權杖。
4. 審批狀態機繞過：以管理更新跳過申請人限制與兩人核准規則。
5. JWT `alg:none`：建立無簽章權杖，存取管理政策 API。
6. 批次匯出授權：以 Aster 文件開頭，混入 Helix 文件並下載內容。
7. 背景工作下載：工作明細拒絕，但下載端點洩漏另一租戶產物。
8. 共用連結資源混淆：合法 share token 被用來讀取另一份文件。

建議路徑為 `01 → 03 → 04/06` 與 `02 → 07`；05、08 可獨立探索。任務順序不是硬性關卡，其他有效路徑也可能成立。

## HTTP API 起點

```sh
curl -s -X POST http://127.0.0.1:4180/hacksite-CipherDesk/api/demo/session \
  -H 'Content-Type: application/json' -d '{}'
```

將回應中的 `body.token` 放入 `Authorization: Bearer ...`。接受邀請會回傳新 token；後續請求須使用新 token。HTTP 重設會重建資料與隨機簽章金鑰，使舊簽章 token 失效。

## 驗證與部署

```sh
npm test
npm run build
```

測試涵蓋八條攻擊鏈、正常授權限制、JWT 驗證、狀態隔離、真正 HTTP adapter 與介面流程。GitHub Actions 會測試、建置並將 `dist/` 部署到 Pages；本機 HTTP 伺服器不會部署。

逐步教材與討論題請看 [TEACHING.md](TEACHING.md)。
