# CipherDesk · Advanced Security Education Lab

以企業文件協作平台為主題的繁體中文資安教學網站。包含工作總覽、文件資料庫、歷史版本、成員邀請、審批、背景匯出、共用連結、活動紀錄與 API 探索器。

**線上版：https://steventeng2022.github.io/hacksite-CipherDesk/**

本專案刻意保留授權與流程漏洞，全部組織、人物、文件、權杖及金額都是虛構。與 [NOVA 購物平台入門實驗室](https://steventeng2022.github.io/hacksite-shop/) 相比，這裡更著重在跨端點推理、資源生命週期與多步驟攻擊鏈。無真實雲端帳號、外部 API、寄信或付款。

## 兩種執行模式

| | GitHub Pages 線上版 | 本機 HTTP 靶場 |
|---|---|---|
| 服務邏輯 | 瀏覽器內 JavaScript 引擎 | Node.js HTTP 伺服器 |
| 資料 | 自己瀏覽器的 localStorage | 單一伺服器程序的記憶體 |
| 操作方式 | 內建 API 探索器 | API 探索器、curl、Burp、Network |
| 真正 HTTP API | 沒有 | 有，僅綁定 127.0.0.1 |
| JWT 簽章金鑰 | 公開、固定的 DEMO-ONLY 值 | 每次啟動／重設隨機產生，不透過 HTTP 提供 |
| 教學資料原始碼 | 所有靜態資源均公開 | HTTP 不提供 engine.mjs、fixtures.mjs |

線上模式並非後端安全隔離，所有虛構「機密文件」都能從 bundle 找到。它適合自學與課堂示範，不能當防作弊考核，也不能用外部掃描器直接掃出 API 漏洞。本機模式才會真的送出 HTTP API 請求；仍是無資料庫、可丟棄的教學服務。

## 快速開始

Node.js **22 或以上**。

```sh
npm ci --ignore-scripts
npm run dev
# 瀏覽器模式：http://127.0.0.1:4174/hacksite-CipherDesk/
```

要操作真正的 HTTP API：

```sh
npm run lab:api
# http://127.0.0.1:4180/hacksite-CipherDesk/
```

開啟時會自動取得虛構的 Mika / Aster / editor 示範身分，不需要真實帳密。從「安全研究室」查看任務，或先完整操作正常流程。頁面上的執行模式標籤可區分線上沙盒與本機 HTTP 服務。

## 八個進階任務

| 任務 | 主題 | 重點 |
|---|---|---|
| 01 工作空間的另一面 | 跨租戶授權 | 搜尋找 ID → 偽造上下文 → 讀取他租戶文件 |
| 02 刪掉的，不代表消失 | 歷史版本授權 | 從 revisionRefs 找到已刪除版本與遺留 job ID |
| 03 一封給自己的升級邀請 | Mass assignment | 邀請角色注入 → 接受邀請 → 取得新權杖 |
| 04 不需要第二位審核者 | 狀態機／職責分離 | 管理更新繞過正常核准規則與人數限制 |
| 05 沒有簽章的通行證 | JWT 演算法降級 | 保留有效聲明、改 alg:none → 存取管理 API |
| 06 混進匯出包的第二份文件 | 批次資源授權 | 混合文件陣列 → 建立工作 → 下載真正的內容 |
| 07 有上鎖的門，沒上鎖的出口 | 產物下載授權 | 從歷史版本取得 job ID → 比較明細與下載端點 |
| 08 一把鑰匙，開了另一扇門 | 能力型連結綁定 | 建立合法 share → 覆寫資源 → 取得另一份文件 |

每題提供三層線索、完整重現步驟與修補方向。建議先走 `01 → 03 → 04/06` 與 `02 → 07`，再研究 JWT 與共用連結。建議順序並非硬性關卡；可從其他有效路徑完成任務。總點數 1,850。

## curl：開始一個 HTTP 教學工作階段

```sh
curl -s -X POST http://127.0.0.1:4180/hacksite-CipherDesk/api/demo/session \
  -H 'Content-Type: application/json' -d '{}'
```

回應格式為 `{ "status": 200, "body": { "user": {}, "token": "..." }, "proof": [] }`。將 `body.token` 用於 Bearer header：

```sh
curl -s http://127.0.0.1:4180/hacksite-CipherDesk/api/me \
  -H 'Authorization: Bearer YOUR_DEMO_TOKEN'
```

API 探索器只顯示回應的 `body`，並另外顯示 HTTP status 與任務完成通知。HTTP 服務本身會回傳正確的 HTTP status code，而不是一律回 200。取得邀請接受後的新 token 時，請點擊「套用回應中的新權杖」，後續請求才會使用新角色。

## 重設、進度與範圍

安全研究室可匯出 JSON 學習紀錄，並重設 CipherDesk 的狀態；不會清除 NOVA 的資料。線上只使用 `cipherdesk_state`、`cipherdesk_connection` 兩個本機鍵。HTTP 模式的重設會重建記憶體資料與簽章金鑰；重啟服務也會清空資料。單一 HTTP 程序由連到它的所有分頁共享狀態，課堂分組請各自啟動獨立程序或使用不同 PORT。

HTTP 只接受 loopback Host，拒絕跨來源請求，沒有外部網路呼叫、作業系統命令、檔案上傳或真實憑證。不要將刻意脆弱的 HTTP 服務公開到網際網路或連接正式資料。原始碼適合研究及修補練習，不應直接用於正式企業服務。

## 測試與部署

```sh
npm test
npm run build
```

測試涵蓋八個完整攻擊流程、正常限制、JWT 驗證、狀態隔離、真正 HTTP adapter 與介面 DOM 流程。DOM 測試無法取代瀏覽器排版及相容性檢查。

GitHub Actions 會執行測試與靜態建置，從儲存庫預設分支將 `dist/` 部署至 GitHub Pages。HTTP 伺服器不會部署到 Pages。網站不使用第三方字型、追蹤碼或執行時套件；happy-dom 只用於開發測試。

講師用逐步解答與討論題：[TEACHING.md](TEACHING.md)。

```text
public/app.mjs          UI、路由、API 探索器與模式切換
public/catalog.mjs      題目、提示與共用展示資料
public/engine.mjs       刻意脆弱的教學服務邏輯
public/fixtures.mjs     虛構租戶、文件、版本與審批資料
scripts/server.mjs     loopback HTTP adapter 與靜態預覽
tests/                 服務、HTTP 與 DOM 整合測試
```
