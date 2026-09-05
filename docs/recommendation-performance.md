# 關卡推薦效能架構與驗收

目標是讓切換海域重用既有資料，並消除重複同步及重複計算。首次同步、新攻略搜尋、KC3 精算仍有成本；不保證任意庫存、所有攻略變體都在固定秒數內完成，也不以降低硬條件或刪減配裝選擇換取速度。

## 共用流程

1. **帳號快照**：讀取 KC3 艦娘、裝備、相容性與計算規則。自動同步和按「產生推薦」共用進行中的擷取，同一帳號也跨戰略室分頁共用。失敗不快取，可以重試。
2. **同步世代**：按「重新同步」會更新世代並清除各分頁的快照與推薦快取。較早開始、較晚完成的同步不能覆蓋新資料；舊世代的推薦也不能寫回新快取。
3. **核心搜尋**：在既有 worker 中，只搜尋使用者選定的海域／攻略／目標。配裝沿用輕量候選排序、制空重用及入選後建立狀態的加速。仍保留最多 24 種配裝計畫及 18 套 KC3 精算候選。
4. **KC3 精算與結果重用**：由 KC3 檢查完整配裝並排序，同艦隊的裝備替代案精算後才合併。相同快照／攻略／目標的進行中請求與完成結果可以共用。切到尚未算過的攻略仍須搜尋；沒有預先在背景計算所有關卡。

KC3 依賴戰略室的物件、主資料與現行公式，因此目前同步與精算仍在該 renderer。不能直接把它們丟到 Node worker，或以本地複製公式取代。若後續量測顯示此處仍慢，下一階段應先設計可序列化的計算輸入與相容性驗證，再決定是否拆出專用計算環境；這部分尚未實作。

## 這次同步優化

- Fast+ 模式探測直接呼叫 `equipmentTotalStats('soku', true, true, true)`。目前 KC3 的 `statsBonusOnShip('sp')` 會先算十種能力；現在每次只取速度。舊介面回退仍保留，並記錄使用次數。
- 先制對潛的門檻二分搜尋，每種測試配裝只複製一次艦娘；每次更換對潛數值都重置計算快取。最後仍由 KC3 驗證推薦的完整配裝。
- 約 8 ms 的批次工作之間使用 `scheduler.postTask`，不支援時使用 `MessageChannel` 並關閉連接埠；兩者都沒有才回退至 timer。避免把每次讓出 renderer 的工作都排成容易受背景分頁節流影響的計時器。
- 檢查同步耗時時，分開看真正運算和讓出 renderer 後的等待時間，而非只看「正在規劃艦隊」。

## 4-3 實際帳號驗收

1. 重啟 `yarn start`，開戰略室「關卡推薦」。初次同步尚未完成時選 **4-3 → 攻略網・対地空母**（`4-3-guide-cv2-ca2-dd2`）並產生推薦。這兩個入口應共用一次同步。
2. 配置比對：空母 2、重巡 2、驅逐 2；確認持有裝備不重複、制空至少 165，以及對陸等攻略硬條件通過。具體裝備仍由庫存及 KC3 相容性決定。
3. 同步完成後改選 4-4、7-1、4-5。只切海域／攻略不應重新擷取全部帳號資料。再次選回已算過的相同攻略／目標，應取用完成結果。
4. 在另一個戰略室分頁按「重新同步」，再回原分頁產生推薦；使用的新快照時間應一致。同步進行中暫時切到其他分頁再切回，確認仍能完成。
5. 遊戲庫存或配裝有變動時仍須重新同步，不能把「快」建立在沿用過期資料上。

日誌判讀：

| 事件／欄位                                          | 用途                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `recommendation.slow.activePhase`                   | `account-snapshot` 是同步；`solver-and-combat` 才是搜尋及精算                                         |
| `recommendation.account-snapshot-phase`             | renderer 的 `managers-loaded`、`ships-completed`、`equipment-completed`，各階段僅一筆                 |
| `recommendation.account-snapshot-completed`         | `managerLoadMs`、`shipCaptureMs`、`equipmentCaptureMs`、`yieldWaitMs`、`yieldCount`、`yieldStrategy`  |
| 同上                                                | `speedStatDirectCount`／`speedStatFallbackCount`、`openingAswCloneCount`／`openingAswEvaluationCount` |
| `recommendation.account-snapshot-request-completed` | `generation`、`consumerCount`、`outcome`；共用同步時消費者數可大於 1                                  |
| `recommendation.account-snapshot-failed`            | 擷取失敗原因與耗時，避免錯把失敗當作還在計算                                                          |
| `recommendation.completed`                          | `solverElapsedMs` 與 `exactCombatElapsedMs`；配裝候選及硬門檻診斷仍保留                               |
| `recommendation.request-slow-completed`             | 含同步的 `accountElapsedMs`、整體 `totalElapsedMs`                                                    |

貼出的 4-3 日誌只有 `activePhase: account-snapshot`，且在完成前中止。它能定位當時慢在同步，但不足以判定整段的確切耗時，亦不能據此歸因於 GPU 警告。

## 全海域核心量測

```sh
yarn build:recommendation
RECOMMENDATION_BENCHMARK=1 node --test-name-pattern='every normal map can build its primary balanced route' packages/recommendation-core/test/recommendation.test.js
```

此命令使用既有假想庫存（144 艘／800 件），逐一驗證 **37 個一般海域的主要 balanced 攻略**，候選上限使用 UI 的 18。輸出每條攻略耗時、中位數、P95 與最慢攻略；不設機器相關的時間斷言。

本次單輪核心量測：37 案成功，中位數約 **0.33 秒**、P95 約 **0.75 秒**、最慢約 **0.76 秒**。另測使用者指定的 `4-3-guide-cv2-ca2-dd2` 約 **0.37 秒**。這些數字不包含同步、IPC、KC3 精算及畫面更新，不代表所有攻略變體或實際帳號的端到端速度。

後續效能驗收應以實際帳號分階段量測：同一快照至少重複三次，比較首次計算與結果快取；不要把 37 個主要攻略的平均時間當成所有情況的即時保證。
