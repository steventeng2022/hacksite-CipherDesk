# CipherDesk 講師教材

建議時長 100–140 分鐘，適合已理解 HTTP、JSON、Bearer token、IDOR 與 DevTools 的學員。所有步驟只適用於本虛構平台。

## 建立正常基準

先瀏覽五份 Aster 文件、審批中心與成員清單，再在 API 探索器送出：

```text
GET /api/me
GET /api/documents
GET /api/approvals/apr_302
```

一般 editor 直接讀取 `doc_hx_704`、核准自己的申請或建立匯出都會被拒絕。先觀察這些限制，後續才容易看出不同入口的授權不一致。

## 01 跨租戶上下文

```text
GET /api/search?q=研究
Headers: {"X-Workspace-Id":"helix"}

GET /api/documents/doc_hx_704
Headers: {"X-Workspace-Id":"helix"}
```

修補：從已驗證的成員關係推導租戶上下文；每次查詢與單筆讀取都加入租戶條件，不能直接信任 header。

## 02 已刪除版本

```text
GET /api/documents/doc_as_104
GET /api/revisions/rv_104_01
GET /api/revisions/rv_104_01?includeDeleted=true
```

最後一個請求取得含 `job_hx_018` 的刪除內容。修補時，歷史版本、封存、附件與搜尋索引都必須套用一致授權與刪除政策。

## 03 邀請角色過度綁定

```text
POST /api/invitations
Body: {"email":"mika@aster.example.test","role":"workspace_admin"}

POST /api/invitations/{invitation.id}/accept
Body: {}
```

將接受邀請回應中的 token 套用到探索器。修補：欄位白名單、角色委派上限、目標帳號綁定，並在接受時重新驗證。

## 04 審批狀態機

```text
POST /api/approvals/apr_302/approve
# 會拒絕申請人自我核准

GET /api/approvals/apr_302
# 取得 etag/version

PATCH /api/approvals/apr_302
Headers: {"If-Match":"2"}
Body: {"status":"approved","approvedBy":["u_mika"]}
```

若版本已變動，使用最新值。`If-Match` 只處理並行更新，不會保證業務規則。所有狀態變更入口應共用相同領域驗證。

## 05 無簽章 JWT

在自己的瀏覽器 Console 產生本靶場用的虛構 token：

```js
const enc=o=>btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const token=enc({alg:'none',typ:'JWT'})+'.'+enc({
  sub:'u_mika',tenantId:'aster',role:'workspace_admin',
  exp:Math.floor(Date.now()/1000)+3600
})+'.';
```

貼入探索器，請求 `GET /api/admin/policy`。修補：伺服器固定允許演算法，拒絕 none，驗證 iss/aud/exp，簽章後仍依後端成員資料授權。

## 06 批次匯出

使用管理員 token：

```text
POST /api/exports
Body: {"name":"混合匯出","documentIds":["doc_as_101","doc_hx_704"]}

GET /api/exports/{export.id}/download
```

建立工作不算完成，必須下載並確認混入的文件。修補：逐筆檢查批次資源，建立與下載時都重新授權。

## 07 下載入口授權不一致

```text
GET /api/exports/job_hx_018
# 403
GET /api/exports/job_hx_018/download
# 200
```

修補：下載、重導向、物件儲存 URL 與暫存產物都綁定原始工作、租戶與擁有者，並在取用當下檢查。

## 08 共用連結資源混淆

```text
POST /api/shares
Body: {"documentId":"doc_as_101"}

GET /api/shared/{share.token}
GET /api/shared/{share.token}?documentId=doc_hx_704
```

修補：capability token 固定綁定一份資源、允許動作、有效期與撤銷狀態；後續請求不得任意覆寫資源 ID。

## 課後評量

- 讓學員解釋一條完整攻擊鏈、前提與受影響資源。
- 找出一個看似安全但只提供輸入驗證或並行控制的檢查。
- 修補一題，將對應測試改為期待拒絕請求。
- 說明 GitHub Pages 瀏覽器模式與 loopback HTTP 模式的信任差異。

進度存在本機或伺服器記憶體，不具防作弊能力。沒有資料庫、真實帳號、SSRF、檔案上傳或系統命令情境。
