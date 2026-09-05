# 架構修正：本地驗證紀錄

日期：2026-09-05。分支：`refactor/local-architecture-hardening`。
工作目錄：`/tmp/kancolle-architecture-hardening`。原工作區另有進行中的功能修改，因此使用
獨立 worktree。沒有推送、遠端 PR、tag、release 或 app 版本變更。

## 修正範圍

- 艦隊、遠征、資源統計依操作分離 worker；有界排隊、等待／執行期限、故障恢復、60 秒
  閒置回收及可追查的生命週期日誌。待執行工作不隨另一個操作失敗。
- session／extension 共用版本化快照；跨視窗通知、交錯刷新及遲到結果防護、卸載清理。
- proxy 狀態移入服務實例，啟停序列化、單一重試 timer、取消初始化、限制等待時間。
  設定讀取與 mod 更新檢查分離；更新檢查共用進行中工作、三小時間隔、十秒期限與關閉取消。
- 推薦計算服務與 IPC 分離；純任務排名移到 recommendation-core；proxy session 設定抽離。
- WebUI 具名 IPC、雙端輸入驗證、僅資料事件回呼、unsubscribe 與診斷測試。
- 圖片拆分／框線與 ZIP 解壓縮移到專用 worker；快取 metadata 維持主程序所有權，匯入序列化。
  維護 worker 不載入 proxy、config 或 cacher 的 upstream runtime。
- Windows shell CI 步驟、ASAR smoke test、合成效能測試、worker RSS 量測與模組邊界測試。

## 驗證方法與結果

正式結果以可正常啟動子程序的本地環境為準。一般 sandbox 曾回報 `spawnSync EPERM`，
因此已重新取得本地建置／測試權限並執行。shell runner 現在也會將子程序啟動錯誤視為失敗。
worktree 初次缺少 workspace 專屬 node_modules，誤用了 Forge 6；補齊既有依賴後，正式
Forge 7 打包成功，沒有修改依賴版本或 lockfile。

| 檢查                                    | 結果                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| 舊版 worker／IPC 的兩個永久回歸案例     | 2 項如預期失敗：跨操作逾時、多視窗刷新                   |
| 新版 shell 回歸                         | 114 通過、0 失敗                                         |
| recommendation-core 回歸                | 109 通過、0 失敗                                         |
| Electron extensions 回歸                | runner 回報 62 通過、0 失敗；TAP 包含 64 個編號          |
| core TypeScript 檢查／declaration build | 通過                                                     |
| Linux x64 Forge package                 | 通過；未包含可選的 minimum-cache.zip                     |
| 正式 ASAR runtime smoke                 | 通過：成功／失敗回應、圖片拆分、ZIP 與 sandboxed preload |
| 格式與 diff 檢查                        | 通過                                                     |

ASAR smoke 使用相同版本 Electron 25.9.8、隱藏視窗及獨立 userData，測試封裝後的兩種
worker 成功／失敗回應、ZIP metadata、圖片拆分、sandboxed preload 的具名 IPC 與解除訂閱。
它測試正式 ASAR 產物，不代表已完整登入 KC3 或驗證真實遊戲網路代理。

## 效能量測

`packages/shell/script/benchmark-maintenance.js` 使用 1024 × 1024 合成 PNG、64 個區塊與
16 MiB ZIP entry。主程序與 worker 執行相同 codec 操作；暖機後各跑五次，輸出 SHA-256
必須一致。使用一毫秒取樣記錄 event-loop p95／max、總耗時與 RSS。結果應在沒有同時
進行建置或其他重工作的環境下採樣；這是合成測試，不能外推為所有遊戲場景的加速比例。

無並行建置時的五次平均值（毫秒）：

| 工作          | 執行位置 | 總耗時 | event-loop p95 | event-loop max |
| ------------- | -------- | -----: | -------------: | -------------: |
| 圖片框線      | 主程序   | 132.88 |          29.82 |          98.99 |
| 圖片框線      | worker   | 143.32 |           1.22 |           1.52 |
| 16 MiB 解壓縮 | 主程序   |  50.44 |           1.65 |          51.50 |
| 16 MiB 解壓縮 | worker   |  56.30 |           1.20 |           1.47 |

輸出雜湊一致。主程序的停頓降低，但總工作時間增加，不能宣稱吞吐量也提升。
維護 worker 暖機後的 RSS 增量約 11.65 MiB。推薦 worker 的同一程序總 RSS 在
0／1／2／3 個 worker 時分別約 44.23／66.39／83.54／100.82 MiB；由一個改為三個
worker 在這個環境增加約 34.43 MiB。它們延遲建立，60 秒閒置後回收。

原始數據：[維護工作量測](validation/architecture-maintenance-2026-09-05.json)、
[推薦 worker 記憶體](validation/architecture-worker-memory-2026-09-05.json)。

另以 `script/measure-worker-memory.js` 記錄 0–3 個已載入推薦 worker
的 RSS；它不執行帳號求解，僅量測分離 worker 的啟動成本。圖片／解壓縮負載後的 RSS
還包含暫存 Buffer 與 GC 時機，不能直接當成 worker 本身的固定成本。

## 本地重現

```sh
yarn test:shell
yarn test:recommendation
yarn --cwd packages/recommendation-core typecheck
yarn test:extensions
yarn --cwd packages/shell package
node packages/shell/script/benchmark-maintenance.js
node packages/shell/script/measure-worker-memory.js
```

Linux 圖形環境的 ASAR smoke：

```sh
env -u ELECTRON_RUN_AS_NODE \
  KANCOLLE_SMOKE_ASAR="$PWD/packages/shell/out/kancolle-assistant-linux-x64/resources/app.asar" \
  node_modules/electron/dist/electron packages/shell/script/smoke-packaged-runtime.js --no-sandbox
```

`--no-sandbox` 僅用於此本地測試啟動環境；測試 BrowserWindow 的 preload 仍設定 `sandbox: true`。

## 尚未驗證與保留邊界

- 本地沒有 Windows runtime，Windows CI 設定已補齊但未執行，也未觸發遠端 CI。
- 未使用真實登入的 KC3 帳號；實際遊戲的跨視窗手動操作及網路代理啟停待該環境驗證。
- 網路 proxy、快取驗證、外部 mod 轉換、prepatch 仍透過主程序 facade。它們共用 upstream
  可變狀態，整體程序遷移須另做串流／快取一致性量測；本次不宣稱它們已背景化。
- 快取匯入已序列化 shell 匯入工作，但並非全域交易鎖；與外部工具或 upstream 遊戲下載的
  完整交易協調仍在原有 facade 邊界內。大型快取匯入不應被當成已驗證的全域原子操作。
- 未打包最低遊戲快取檔 `minimum-cache.zip`，屬原本允許省略的非發行打包路徑。

## 合併至本地 main 的整合驗證

使用者完成初步手動測試並同意合併後，將 `9fcdd7c` 整合至本地 `main`（原為
`cf1a518`）。本次在主工作目錄 `/home/sjs47311/kancolle-assistant` 執行；保留
v1.0.15 版本，不推送遠端。先前未提交的工作仍保存在具名 stash 中。

推薦 IPC 的衝突依新的服務邊界整合：將 main 的 18 套精算候選、先制對潛角色檢查、
完整配裝排名與回退去重移入 `recommendation-calculation.js`。共用快照保留
`generation`、`consumerCount` 與成功／失敗／被取代的診斷；交錯刷新回歸案例依
架構分支契約檢查 `SNAPSHOT_SUPERSEDED`，並確認後續讀取使用最新快照。

合併後重新執行的檢查：shell 122 項、recommendation-core 121 項皆通過；extensions
runner 回報 62 通過、0 失敗（TAP 包含 64 個編號）。核心型別檢查、完整 `yarn build`
（Linux 打包）及封裝後 ASAR smoke 通過。這次未重新量測
效能，前述效能數據仍是架構分支的原始量測。
