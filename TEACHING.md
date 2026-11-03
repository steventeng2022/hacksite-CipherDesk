# CipherDesk 講師教材

建議時長 100–140 分鐘，適合已理解 HTTP、JSON、Bearer token、IDOR 與 DevTools 的學員。所有步驟只針對此虛構平台。不要以進度分數代替理解與修補能力評量。

## 第一階段：建立正常行為基準（15 分鐘）

1. 以預設 Mika / Aster / editor 身分瀏覽五份文件。
2. 開啟「資料移轉與整合交接」、「團隊協作與交付準則」。
3. 查看自己的審批申請；申請人無法在正常介面核准自己。
4. 嘗試建立匯出，觀察管理權限需求。
5. 在 API 探索器依序送出 `/api/me`、`/api/documents`、`/api/approvals/apr_302`。

討論：身分、租戶上下文、成員角色、資源擁有者與流程狀態有什麼不同？哪些值可以來自用戶端，哪些必須由服務驗證？

## 01 租戶上下文信任（15 分鐘）

正常 `GET /api/documents/doc_hx_704` 回 403。交接與準則文件揭露 `X-Workspace-Id`、`aster` 與 `helix`。

```text
GET /api/search?q=研究
Headers: {"X-Workspace-Id":"helix"}

GET /api/documents/doc_hx_704
Headers: {"X-Workspace-Id":"helix"}
```

搜尋取得 ID，單筆讀取完成證據。服務把 caller 控制的工作空間 header 當作租戶授權依據。

修補討論：若使用者真的有多個租戶成員資格，如何安全允許切換？應在 request context 檢查 membership，再將已驗證的租戶條件下推至每次資料操作。

## 02 已刪除版本（10 分鐘）

```text
GET /api/documents/doc_as_104
GET /api/revisions/rv_104_01
GET /api/revisions/rv_104_01?includeDeleted=true
```

比較 `revisionRefs` 與有效歷史清單；第二個請求回 410，第三個卻取得已刪除內容，包含 `job_hx_018`。

修補討論：soft delete 是否只是 UI 狀態？備份、搜尋索引、快取、版本與附件的授權與刪除應如何同步？

## 03 邀請角色過度綁定（15 分鐘）

先透過成員頁建立普通邀請，比較 UI 中只有 viewer/editor 的選項與實際 JSON 欄位。

```text
POST /api/invitations
Body: {"email":"mika@aster.example.test","role":"workspace_admin"}

POST /api/invitations/{剛取得的 invitation.id}/accept
Body: {}
```

點擊 **套用回應中的新權杖**，再 `GET /api/me`。這次是成員資料真的改成管理員，而不只是改前端顯示。

修補討論：欄位白名單、角色委派上限、邀請目標綁定與接受時重新驗證。僅隱藏 UI 選項不足以授權。

## 04 審批狀態機（15 分鐘）

在管理員角色下比較正常核准與管理更新入口。

```text
POST /api/approvals/apr_302/approve
Body: {}
# 仍拒絕自己核准。

GET /api/approvals/apr_302
# 取得最新 etag / version，初始值為 2。

PATCH /api/approvals/apr_302
Headers: {"If-Match":"2"}
Body: {"status":"approved","approvedBy":["u_mika"]}
```

若發生 409，讀取最新 version 再重試，不能直接忽略並行控制。成功後開啟審批中心，確認狀態已核准但人數只有 1/2。

修補討論：If-Match 保護的是並行更新，不是業務合法性。所有狀態變更應經過同一個領域服務，不能讓管理 PATCH 繞過職責分離。

## 05 JWT 演算法降級（15 分鐘）

這個練習不需要知道 HMAC 金鑰。保留有效 `sub`、`tenantId`、`exp`，建立無簽章 JWT：

```js
const enc = o => btoa(JSON.stringify(o))
  .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = enc({alg:'none',typ:'JWT'}) + '.' + enc({
  sub:'u_mika', tenantId:'aster', role:'workspace_admin',
  exp:Math.floor(Date.now()/1000)+3600
}) + '.';
console.log(token); // 僅為本靶場生成的虛構權杖。
```

貼到 API 探索器權杖欄位，請求 `GET /api/admin/policy`。注意最後的 `.` 與空簽章不可省略。

修補討論：由伺服器設定允許的演算法、拒絕 none、檢查 iss/aud/exp；即使簽章正確，也要依伺服器資料做即時授權。本機 HTTP 的簽章金鑰是隨機且不對外提供；線上瀏覽器版無法真正保密任何金鑰。

## 06 批次匯出只檢查第一筆（15 分鐘）

使用由邀請或其他有效路徑取得的管理權限：

```text
POST /api/exports
Body: {"name":"課堂混合匯出","documentIds":["doc_as_101","doc_hx_704"]}

GET /api/exports/{回傳的 export.id}/download
```

建立工作本身不算完成，必須下載看到混合租戶內容。試著對調 documentIds 順序，觀察第一份是 Helix 時回 403。

修補討論：bulk API、批次匯入、圖形關聯與壓縮包都必須逐筆授權；工作建立後權限可能變更，下載時也要重新檢查。

## 07 工作明細與下載入口不一致（10 分鐘）

用一般 Aster 身分、從任務 02 取得的工作 ID：

```text
GET /api/exports/job_hx_018
# 403
GET /api/exports/job_hx_018/download
# 200，含 Helix 的兩份虛構文件。
```

修補討論：授權不能只存在工作明細入口。物件儲存 URL、CDN、下載重導向與長效預簽 URL 也都要納入資源生命週期。

## 08 共用連結沒有綁回資源（15 分鐘）

```text
POST /api/shares
Body: {"documentId":"doc_as_101"}

GET /api/shared/{回傳的 share.token}
GET /api/shared/{同一個 share.token}?documentId=doc_hx_704
```

第一個公開檢視回 Aster 文件，第二個回 Helix 文件。此端點不需要 Authorization，測試時可將權杖欄位清空。

修補討論：能力型連結不只是「有一個隨機 token」。它應固定綁定一份資源、動作範圍與到期時間，並支援撤銷。

## 結業與修補作業

- 匯出學習紀錄，讓學員解釋其中一條完整攻擊鏈與必要前提。
- 找出一個看似授權但實際僅是輸入驗證／並行控制的檢查。
- 修補一個漏洞，再修改對應測試，使它期待拒絕請求而不是漏洞成功。
- 說明線上靜態模式與本機真正 HTTP 模式的差異。
- 在研究室重設；HTTP 重設會輪替簽章金鑰，舊簽章權杖隨之失效。

沒有資料庫、真正帳號、SSRF、檔案上傳或系統命令情境。此專案不評估那些攻擊面。
