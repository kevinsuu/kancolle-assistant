# 系統架構修正與驗證計畫

建立日期：2026-09-05。執行分支：`refactor/local-architecture-hardening`。

本文件保留原始計畫與執行狀態；實際完成範圍及量測見 [驗證紀錄](architecture-hardening-validation.md)。工作限於本機：不 push、不開遠端 PR、不建立
release 或 tag、不更動 app 版本。每一階段完成後更新本文件的狀態、驗證結果與限制。

## 範圍與基準

保留 recommendation-core、KC3 adapter、主程序 facade、背景 worker 及 runtime config
的既有邊界。先處理可重現的正確性與生命週期問題，再調整責任分配與效能隔離。

前次檢查已確認：

- 一個推薦請求逾時會終止共用 worker，連帶拒絕其他操作的待處理請求。
- A、B 視窗先取得快照 1；A 強制同步成快照 2 後，B 仍可取得快照 1。
- KCCacheProxy 重啟檢查會自行排定下一個 timer，`dispose` 只停止代理。
- Windows CI 有建置與 recommendation／extension 測試，但沒有 shell 測試。
- `yarn test:shell` 在目前 Linux / Node 24.14.0 環境執行成功；不代表 Windows、
  真實 KC3 或打包後 runtime 已驗證。

上述前兩項曾以臨時模擬依賴重現，實作時應先轉成永久行為回歸測試。
圖片、壓縮與快取操作的主程序延遲尚無基準數據，不預先宣稱效能提升。

## 執行順序與交付

| 階段 | 工作                             | 依賴    | 狀態                                                            |
| ---- | -------------------------------- | ------- | --------------------------------------------------------------- |
| 0    | 基準、永久重現案例與本地分支     | 無      | 完成；舊版兩個回歸案例如預期失敗                                |
| 1    | worker 排程及故障隔離            | 0       | 完成；含佇列、清理與記憶體量測                                  |
| 2    | 共用快照版本及競態防護           | 0       | 完成；含跨視窗、交錯刷新與卸載測試                              |
| 3    | KCCacheProxy 狀態與生命週期      | 0       | 完成；含延後設定切換、取消與期限測試                            |
| 4    | 業務服務抽離及 IPC 契約          | 1、2、3 | 完成此次分層與具名 IPC；未全面改寫 main.js                      |
| 5    | 主程序效能基準與重工作隔離       | 3、4    | 完成圖片與 ZIP 隔離及量測；共享 proxy 狀態的其餘工作保留 facade |
| 6    | 整合、打包、跨平台測試入口與文件 | 1–5     | Linux 已通過；Windows 與真實 KC3 未驗證                         |

每階段以可單獨檢查的 diff 為單位，不混入格式化全庫、依賴大版本升級或遊戲公式變更。
若建立 commit，僅在本地使用 Conventional Commit 標題；不執行遠端寫入。

## 1. Worker 排程及故障隔離

主要檔案：`recommendation-worker-service.js`、`recommendation-worker.js`、
`main-bootstrap.js` 及 worker service 測試。

- 以操作類型建立有界且延遲啟動的執行通道，艦隊、遠征、資源統計互不因逾時而失敗。
  優先採每種操作最多一個 worker，並量測額外記憶體成本。
- 每通道限制等待佇列；等待期限與開始執行後的期限分開計算。佇列滿時回傳穩定錯誤碼。
- worker 發生錯誤或逾時時，只使正在執行的工作失敗；同通道尚未執行的工作依明確策略
  在新 worker 上繼續。不得自動重送已開始且可能有副作用的工作。
- dispose 拒絕新請求、清理所有 timer／pending，結束所有 worker；忽略舊 worker 的遲到結果。
- 日誌加入 operation、requestId、queueDepth、queueWaitMs、executionMs、受影響請求數、
  outcome、reasonCode；終止失敗不能靜默吞掉。

驗收：三種操作併發，其中一種逾時，另外兩種成功；排隊不消耗執行期限；佇列滿、worker
建立失敗、postMessage 失敗、exit、重新建立、dispose、遲到訊息皆有行為斷言。
成功與失敗路徑均驗證關鍵診斷欄位，測試不依賴昂貴的真實求解。

## 2. 共用快照版本及競態防護

主要檔案：`recommendation-ipc.js`、`strategy-room-ui.js`、`channels.js`、快取服務及測試。

- 將快照與推薦快取抽成服務，以目前 KC3 session／extension 身分與單調遞增版本識別。
- 任一視窗重新同步成功後，所有視窗的後續請求使用新版本；通知已開啟視窗，使摘要與
  畫面結果失效。保留明確的手動同步語意，不改為每次推薦重新抽取帳號資料。
- 同版本、同條件的抽取／計算共用進行中的 Promise，避免重複工作。
- 以 generation 檢查處理交錯同步與遲到結果；舊工作不能寫入新版本快取，也不能覆蓋
  renderer 的新結果。同步失敗需明確回報，不能將舊資料冒充新同步成功。
- extension reload、sender 銷毀、訂閱解除與快取容量上限有明確清理規則。
- 日誌記錄版本、命中／失效原因、受影響視窗數與耗時，不記錄完整帳號資料。

驗收：A 刷新後 B 讀到新版本；兩次刷新逆序完成仍保留最新版本；刷新前的推薦延遲完成
不污染新快取；相同條件只計算一次；同步失敗、頁面關閉、extension reload 均正確處理。

## 3. KCCacheProxy 狀態與生命週期

主要檔案：`kccp-integration.js`、`main-bootstrap.js`、`main.js` 及新增生命週期測試。

- 將 proxy、busy counter、retry flag、timer、初始化狀態與錯誤去重集合移入服務實例。
  核心 runtime 透過依賴注入使用 proxy factory、排程器、logger 與設定介面。
- 每個實例最多一條檢查迴圈；dispose 取消排程並禁止進行中的檢查排定新 timer。
- 啟停採序列化狀態轉移，處理快速切換 enable、重複 start／stop／dispose，以及 init
  尚未完成時關閉的情境。proxy close／等待 busy 必須有明確期限與錯誤結果。
- 主程序 shutdown 正確等待或受期限控制地完成清理，不留下無人處理的 rejected Promise。
- 設定讀取與遠端 mod 更新檢查分離；網路請求有期限，避免 busy 狀態被外部請求長時間占用。
- 維持唯一 upstream facade；狀態轉移、啟停失敗、重試、清理失敗都有有界結構化日誌。

驗收：fake clock 推進後，dispose 的服務不會重啟；重複註冊不增加 timer；兩個服務狀態
互不干擾；啟動失敗可重試；快速切換後符合最後設定；proxy 不回應仍能結束清理。

## 4. 業務服務抽離及 IPC 契約

主要檔案：`main.js`、`main-bootstrap.js`、`recommendation-ipc.js`、`preload-ipc.js`、
`browser/ui/*`、任務排名模組及 `recommendation-core/src/index.ts`。

- 將推薦協調、精算後篩選／排名、快照快取與 IPC handler 分開；handler 僅驗證來源、
  驗證參數、呼叫服務並轉換回應。
- 將純任務排名／協同規則移入 recommendation-core；KC3 全域讀取留在 shell adapter。
  以既有 fixture 驗證排序、分組、reason codes、回退結果一致。
- 主程序依服務責任抽離網路／proxy 設定與更新排程，透過 bootstrap 組裝並清理。
  以依賴方向與可測試性驗收，不以檔案行數作為完成標準。
- 建立可共享的 IPC 請求／回應契約與執行期驗證；未知操作、非法 payload 與非法來源拒絕。
- preload 改為具名操作與受限事件訂閱。事件回呼僅收到資料，回傳 unsubscribe；同步遷移
  settings、webui、search、common 等呼叫端，保留其既有 payload 語意。
- 擴充模組邊界測試，確保 core 不依賴 Electron／DOM／shell，worker 不直接匯入 proxy internals。

驗收：原有排名與 UI 行為測試保持通過；非法 IPC 輸入不觸發服務；重複訂閱／卸載後
listener 數回到基準；主程序與服務可用注入依賴測試；設定、搜尋與最近分頁事件正常。

## 5. 主程序效能基準與重工作隔離

主要檔案：`kccacheproxy-api.js`、`kccp-integration.js`、工作程序入口、webpack 配置及本地量測腳本。

- 使用固定的合成圖片／壓縮檔／快取資料，記錄操作時間、主程序 event-loop delay
  p95／max、IPC 心跳延遲、RSS、資料量及 runtime 版本。先暖機，再各跑至少五次。
- 優先將無須 Electron UI 的圖片、壓縮、快取工作搬出主程序。維持現有 facade 的
  對外方法，將 progress、result、error 明確序列化；不能直接跨程序傳 callback 或 Electron 物件。
- 先確認 upstream module 的初始化、副作用、設定與 logger 相依，將工作用模組與 UI 相依分開。
  worker／子程序的 upstream 存取必須透過明確允許的專用邊界。
- 同一快取目錄的修改作業序列化；設定版本、進度頻率、取消、逾時、失敗清理有明確規則。
- proxy 網路 runtime 整體遷移列為量測後決策：若仍是主程序主要負載，再遷移並驗證串流、
  憑證與啟停相容性。未執行的部分保留為後續工作，不宣稱已完成。

驗收：固定 fixture 的輸出內容一致；代表性負載的主程序延遲下降，完整記錄前後數據；
空閒負載與額外程序 RSS 一併列出。若結果無改善或成本過高，記錄並修正方案，不能只以
「已移到背景」作為效能通過依據。背景程序 crash 不得使 shell 結束。

## 6. 整合驗證與交付條件

依變更範圍執行以下檢查，結果記錄命令、環境、成功／失敗與限制：

1. 各階段 focused tests：先確認缺陷案例在修正前失敗，修正後成功。
2. `yarn test:recommendation`、`yarn test:shell` 及 core typecheck。
3. `yarn build`：驗證 workspace 與 Electron Forge 的正式 worker／preload 打包路徑。
4. `yarn test:extensions`：在可用的圖形環境執行，必要時使用虛擬顯示。
5. 打包後 smoke test：使用隔離 userData、合成資料及測試服務，驗證啟動、worker 回應、
   preload 具名 API、訂閱解除、背景工作錯誤與 app 關閉。不能以編譯成功取代 runtime 驗證。
6. 有真實 KC3 環境時手動驗證兩視窗同步、推薦／遠征／統計併發、設定切換與關閉 app。
   未具備登入環境時標為未驗證，不使用或修改真實帳號資料作為自動測試 fixture。
7. 補齊 Windows shell 測試的 CI 設定與可在本地執行的入口；本次不推送、不觸發遠端 CI。
   若本地沒有 Windows runtime，明確記錄 Windows 尚未執行，不能以 Linux 成功代替。
8. 檢查 `git diff --check`、變更檔案範圍、submodule 狀態、殘留 timer／listener 與診斷資料。

變更可見行為時同步更新 `docs/shell-runtime-architecture.md`、`docs/fleet-recommender.md`，
以及受影響的遠征、資源統計或任務文件。只有能力新增、移除或實質改變才更新四種語言
README 的 Current 清單；不新增 changelog、不改版本與 release highlights。

每階段交付包括：程式差異、回歸測試、必要文件、測試結果。最終報告逐項列出完成、
延後與環境阻擋事項；不得把尚未執行的跨平台／真實遊戲驗證標成通過。

## 執行紀錄

- 2026-09-05：建立本地分支與計畫；尚未開始修改 runtime。

- 2026-09-05：因原工作區另有功能修改，改在 `/tmp/kancolle-architecture-hardening` 的獨立
  worktree 執行同一架構分支。實作、測試與量測結果見驗證紀錄；沒有遠端寫入。
- 隔離取捨：本次搬移圖片與 ZIP 的 CPU 工作；快取 metadata 留在主程序，未複製 upstream
  proxy/config/cacher 全域狀態到 worker。完整網路 proxy、prepatch 與 mod 轉換遷移需要
  後續串流／交易一致性驗證，維持原 facade，避免把局部背景化宣稱為全面程序隔離。
