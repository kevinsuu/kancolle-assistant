# <img src="./packages/shell/browser/ui/assets/icons/logo.png" alt="KanColle Assistant 圖示" width="48"> kancolle-assistant

[English](./README.md) · **繁體中文** · [简体中文](./README.zh-CN.md) ·
[日本語](./README.ja.md)

KanColle Assistant 是一款專為遊玩《艦隊 Collection》設計的精簡分頁式瀏覽器，整合
KC3Kai 與 KCCacheProxy 支援。

本專案是原作者 planetarian 的 [damecon-browser](https://github.com/planetarian/damecon-browser) 修改分支。<br>
Damecon 原專案以 Samuel Maddock 的 [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell) 為基礎。

## 版本狀態

| 應用程式版本 | README 更新日期 |
| ------------ | --------------- |
| `v1.0.9`     | `2026-08-29`    |

- **下載版本：** 安裝程式與可攜式壓縮檔可從
  [GitHub Releases](https://github.com/kevinsuu/kancolle-assistant/releases)下載。
- **單一版本的變更：** [最新版本更新日誌](https://github.com/kevinsuu/kancolle-assistant/releases/latest)
  會保存每個 tag 之間自動產生的更新內容。
- **目前累積能力：** [功能狀態](#功能狀態)分別列出目前支援、未來可能加入與不在規劃內的項目。
- **功能技術細節：** 下方專案功能重點會連結至對應文件。

### v1.0.9 更新重點（相較 v1.0.8）

- 普通海域推薦修正四組先前誤判為重複的巴哈配置：3-3 北方海域警備輕巡編成、3-4
  高速空母洗地、依現行隨機起點建模的 3-5 速吸／山汐丸編成，以及鎖定四艘任務指定艦的
  5-3 季任三川編成。審查後的目錄目前包含 162 組配置，其中 34 組直接來自巴哈圖文攻略。

### v1.0.8 更新重點（相較 v1.0.7）

- 普通海域推薦新增行飛巴哈圖文攻略中 1-4 至 6-5 的 30 組不重複配置，以及兩組經審查的
  4-1 KCWiki 替代方案。每筆配置各自保存來源，未完整建模的出擊條件保留人工警示，不會為了
  舊圖文配置而放寬現行路線或裝備限制；3-4 空母練等路線亦修正為 A-C-E-G-J-P。
- 專案新增 `kancolle-stage` 專案 skill，用於匯入後續攻略網址與配置圖片；流程會比對重複、
  驗證現行關卡條件，並在來源或圖片無法可靠讀取時明確向使用者提問。

### v1.0.7 更新重點（相較 v1.0.6）

- 擴充功能測試執行器現在直接宣告命令列解析器依賴，讓乾淨的 Windows release 建置能執行完整的 Electron 擴充功能測試套件。

### v1.0.6 更新重點（相較 v1.0.5）

- 普通海域推薦改為只在使用者選擇附來源的攻略樣板後即時計算；讀取大型 KC3 帳號時仍維持戰略室回應，並以攻略優先的結果與有界診斷取代隱藏的全海域預載。
- 艦隊求解器改用各海域獨立規則模組，加強高速＋與空母艦載機分配、完整持有裝備驗證，以及 KC3 戰鬥公式重排，讓合法方案與失敗原因更清楚。
- 遠征規劃改以正規化每小時效率比較完整艦隊組合，支援最佳化、至少收支平衡與忽略資源，納入收取間隔及補給成本，並提供可選用的最佳化除錯報告。
- 資源中心新增 1、5、30 分鐘活動區間、可強制重新整理的快照重用，以及更清楚的取得、消耗、來源與庫存歷史顯示。
- 啟動時不再把遊戲放大超過原生比例；預設瀏覽器介面改用中性色，且本機打包缺少 KCCacheProxy 快取時會明確警告而不直接失敗。

### v1.0.5 更新重點（相較 v1.0.4）

- 4-5 自動推薦現在會驗證混合對陸配置：不重複的帳號持有三式彈、KC3 判定的空母對陸攻擊機、輕巡驅逐最短路線、高速＋欄位衝突及明確的失敗原因。
- 所有普通海域推薦現在會以 KC3 現行完整配裝公式，依艦娘別／組合加成、改修、適重命中，以及水上、對潛或對陸有效火力重新排序；4-5 高速＋戰艦空母也拆成兩種完整驗證比例，不再需要手動確認。
- 艦隊推薦會沿用已同步的 KC3 快照及相同的完成計算，直到使用者明確重新同步；地圖與路線控制也不再等待首次帳號資料擷取。
- 一般裝備槽現在一定產生完整合法配裝，理想裝備不足時改用艦種安全的次佳相容裝備；2-5 北路與 5-5 南路也會驗證不同艦娘各自攜帶的運輸桶數量。
- 2-1 現在會以 KC3 現行水上戰鬥機與相關裝備分類套用至所有關卡，並新增空母進王替代編成、E 點固定高速建造材回收路線，以及涵蓋 37 張普通海域主要路線的產生驗證。
- 自動 Top 3 現在會在整張地圖沒有完整驗證替代路線時，自動改比可計算但帶警告的路線；7-4 等地圖不再只是為了產生配隊就要求先手選路線。
- KC3 每日改修頁面現在預設啟用原生的可改修裝備篩選；使用者仍可切回完整清單。

### 本專案功能重點

相較原版，目前原始碼新增或優化了以下功能：

1. **[帳號存取最佳化](./docs/dmm-local-login-storage.md)** — 經使用者確認後，可用作業系統安全儲存機制加密保存 DMM 登入資料；另提供信任之外部轉送代理的全流量模式與地區錯誤提示。
2. **[自適應遊戲畫面](./docs/display-auto-fit.md)** — 啟動遊戲時依 KC3 實際內容調整面板寬度，再以螢幕剩餘空間自動調整視窗與艦これ畫布；之後拉伸視窗時會盡可能完整顯示遊戲，且不鎖定視窗寬高比。
3. **[普通海域艦隊推薦](./docs/fleet-recommender.md)** — 在 KC3 戰略室為 1-1 至 7-5（含 5-6）選擇附來源的攻略樣板後，即時計算最多三組帳號持有艦隊；不會自動變更遊戲狀態。
4. **[遠征推薦](./docs/expedition-resource-planner.md)** — 戰略室獨立的**遠征推薦**頁面會顯示目前資源，並依正規化每小時效率後的四資源與水桶權重、已勾選遠征、成功與大發設定及第 2～4 艦隊狀態，推薦一組最佳配對；不會改動原有遠征評分頁面，也不會自動派遣。
5. **[資源中心與收支摘要](./docs/resource-ledger-summary.md)** — 新增 KC3 戰略室**資源中心**儀表板，可依今日、昨日或最近 24 小時查看目前資源、取得、消耗、淨變化、每小時收支、來源分類與消耗品。
6. **[KC3 開發者工具整合](./docs/kc3-devtools.md)** — 開啟遊戲開發者工具時，優先排列並選取 KC3 的 `KanColle` 面板，減少每次手動切換。
7. **[戰略室釘選連結](./docs/strategy-room-recent-tabs.md)** — 可將最多五個戰略室頁籤釘選至 `常用連結`；一般導覽不會改變順序，第六個釘選會取代最下方連結。
8. **[每日改修篩選](./docs/daily-improvement-filter.md)** — KC3 每日改修頁面預設套用原生的可改修裝備篩選一次，並新增只包含當日可改修裝備類別的橫向篩選；原生切換按鈕仍可查看完整清單。

這些新增的戰略室介面會跟隨 KC3 選擇的語系，支援英文、繁體中文、簡體中文與日文。

## ⚠️ 注意事項

#### KanColle Assistant 不適合做為一般用途瀏覽器。

KanColle Assistant 只為一個目的設計：遊玩《艦隊 Collection》。

KanColle Assistant 以 Electron 建置，缺少主流瀏覽器所具備的許多安全功能。本專案仍可能
存在尚未發現的問題與技術限制。

#### 若使用 KanColle Assistant 處理任何敏感資訊，風險須由使用者自行承擔。

## 使用方式

### 使用 Release 版本

前往 [Releases 頁面](https://github.com/kevinsuu/kancolle-assistant/releases/latest)，下載以下
其中一種檔案：

安裝程式：`kancolle-assistant-*.Setup.exe`

- 下載後直接執行即可安裝。
- 安裝版支援 KanColle Assistant 自動更新，也是最簡單的使用方式。

或下載壓縮檔：`kancolle-assistant-*.zip`

- 將檔案解壓縮至空白資料夾，再執行其中的 `kancolle-assistant.exe`。
- 可保留指定版本，但不支援自動更新。

### 使用 `yarn` 從原始碼啟動

```bash
# 取得原始碼
git clone --recurse-submodules https://github.com/kevinsuu/kancolle-assistant
cd kancolle-assistant

# 安裝並啟動瀏覽器
yarn
yarn start
```

### 🔌 安裝擴充功能

放在 `./extensions` 內的未封裝擴充功能會自動載入。

- 同時支援 Manifest V2 與 V3 擴充功能。
- 因部分擴充功能 API 尚未支援，某些外掛可能無法完整運作或完全無法執行。

Release 版本會預先附帶幾個常用外掛。若不需要，可以直接刪除 `extensions` 資料夾內對應的外掛。

### ⚙️ 設定

第一次啟動時會自動開啟設定頁面。

KanColle Assistant 會開始下載最新版 KC3Kai；完成後會開啟 KC3 起始頁面。

隨時都可以點擊視窗左上角的應用程式圖示，重新進入 KanColle Assistant 設定頁面。

### KC3Kai 更新設定

設定頁面的 KC3Kai 區段可以選擇 KC3 的更新方式。

共有三種更新頻道：`release`、`master` 與 `develop`。

- 建議使用最穩定的 `release` 頻道。
- `master` 與 `develop` 包含開發中的程式碼，可能不穩定。
  - 第一次使用這兩個頻道時，下載可能需要數分鐘。
- 不同頻道會分開儲存，並使用各自獨立的設定檔。
  - 可以隨時切換頻道，已下載的頻道不需要重複下載。
  - 切換時會自動卸載舊頻道的擴充功能並載入新頻道。
  - 如需移除某個頻道，刪除 `./extensions` 內對應的 `kc3kai-*` 資料夾即可。

### Proxy 設定

KanColle Assistant 已完整整合 KCCacheProxy，不再需要 ProxySwitchy 之類的擴充功能。

可在設定頁面的 `Proxy` 區段設定 KCCP 主機與連接埠。

勾選 `Enabled` 後，艦これ流量會依所選模式導向 Proxy；取消勾選則停用。

`KCCP internal` 與 `KCCP external` 只代理艦これ遊戲伺服器流量，不會改變 DMM 登入與地區檢查所看到的公開 IP。若要使用經授權的 HTTP/HTTPS 外部轉送代理處理所有瀏覽器流量，請選擇 `all-external`，輸入主機與轉送代理連接埠後啟用。KanColle Assistant 會重新套用 Proxy、關閉既有連線，並重試被導向 DMM 地區限制錯誤頁面的分頁。

KanColle Assistant 不會內建或搜尋公開 Proxy。請勿透過不受信任的 Proxy 傳送 DMM 登入資料。若目前網路地區原本就受支援但仍出現地區限制頁面，請停用非預期的 VPN、Proxy 或 Private Relay 後重試。

## 功能狀態

### ✨ 畫面展示

資源中心可彙整目前資源與近期取得、消耗及淨變化：

![KC3 戰略室資源中心儀表板。](./screenshots/resource-center.png)

遠征推薦會顯示目前資源，並為可用艦隊安排最佳遠征：

![KC3 戰略室遠征推薦頁面。](./screenshots/expedition-recommendation.png)

關卡推薦會依帳號持有的艦娘與裝備，提供普通海域編成建議：

![KC3 戰略室關卡推薦頁面。](./screenshots/map-recommendation.png)

### 🚀 目前功能

- [x] 安裝程式與應用程式於啟動、開啟遊戲及每六小時自動檢查更新
- [x] KC3Kai 整合
- [x] KC3 自動更新
- [x] 同時支援穩定版與開發版 KC3
- [x] 可設定 KC3 更新排程（每日／每週／總是／永不）
- [x] 自動開啟 KC3 起始頁面、開發者工具與戰略室
- [x] 開啟遊戲開發者工具時優先排列並選取 KC3 `KanColle` 面板
- [x] 完整整合 KCCacheProxy 與 Proxy 用戶端
- [x] 經授權之外部 Proxy 全流量模式與 DMM 地區錯誤提示
- [x] [預設與自訂瀏覽器色彩、亮色／暗色主題，以及可上傳替換的設定頁圖示](./docs/theme-personalization.md)
- [x] Manifest V3 擴充功能支援
- [x] Chrome 線上應用程式商店擴充功能支援
- [x] 新分頁提供常用第三方艦これ資源連結
- [x] 可設定新分頁行為
  - 可選擇 KC3 啟動頁面、DMM 遊戲頁面或戰略室
- [x] 多視窗支援
- [x] 使用 `Custom` 頻道管理自訂 KC3 資料夾
- [x] 常用鍵盤快捷鍵（F12、Ctrl+T、Ctrl+F4、Ctrl+Tab、Ctrl+D 等）
- [x] 依網站隱藏網址列並支援萬用字元
- [x] 常用滑鼠操作（中鍵關閉分頁、拖曳分頁、Ctrl+滾輪等）
- [x] 頁面搜尋（Ctrl+F）
- [x] 使用作業系統加密的 DMM 專用本機登入資料保管庫
- [x] 可自由拉伸視窗的艦これ遊戲畫布持續自適應
- [x] 1-1 至 7-5 普通海域的帳號艦隊推薦，採用附來源的攻略網驗證編成骨架，戰略室需選擇附來源的參考攻略配置、不再提供空白自動路線，並包含完整一般裝備槽、2-1 空母替代編成與高速建造材路線、KC3 現行水戰／航空機／砲彈分類、2-5／5-5 運輸桶分歧、高速＋裝備、補強增設欄位、夜戰空母配置、來源一致的 3-5 上路、潛艇、Nelson Touch、固定與隨機下路配置、4-5 高速＋夜母、夜母小船、Nelson Touch 與繞路配置及混合對陸配置的制空優先彈性空母配裝、5-5 特殊砲擊配對、站位與陣形提示，以及 KC3 完整配裝加成與目標別有效火力重排
- [x] 含艦隊配對與權重設定的遠征推薦
- [x] KC3 固定近期區間資源收支摘要
- [x] KC3 戰略室最多五個固定排序的釘選連結
- [x] KC3 每日改修頁面預設啟用可改修裝備篩選，並只列出當日可改修的裝備類別

### 🤞 未來可能加入

- [ ] 安裝 KC3 更新前詢問
- [ ] 滑鼠停留連結時顯示網址提示
- [ ] 擴充功能管理（啟用／停用／解除安裝）
- [ ] `.CRX` 擴充功能載入器
- [ ] 支援更多常用 [`chrome.*` 擴充功能 API](https://developer.chrome.com/extensions/devguide)
- [ ] 遵循擴充功能 manifest 權限
  - 再次提醒：這不是安全的一般用途瀏覽器

### ❌ 不在規劃內

- 可分離式分頁
- Chrome／Edge 等一般用途瀏覽器的進階功能
  - 包含一般用途密碼管理器及其他安全功能
- 任何形式的 AI 整合（歡迎自行實作）

## 授權

GPL-3

本儲存庫是原作者 planetarian 的 [damecon-browser](https://github.com/planetarian/damecon-browser) 修改分支。<br>
Damecon 原專案以 Samuel Maddock 的 [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell) 專案為基礎。

以下保留原始專案聲明的翻譯；正式授權仍以專案授權檔與原始英文聲明為準：

> 如需將 electron-browser-shell 用於專有軟體，請[聯絡 Samuel Maddock](mailto:sam@samuelmaddock.com?subject=electron-browser-shell%20license)，或依適當級別在 GitHub [贊助 Samuel Maddock](https://github.com/sponsors/samuelmaddock/)，以取得[專有用途授權](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md)。這些貢獻能讓專案維護與開發更加永續，也能表達對相關工作的支持。

### 貢獻者授權協議

提交 Pull Request 即表示您授予 electron-browser-shell 的擁有者與使用者一份永久、全球性、非專屬、免授權費且不可撤銷的著作權授權，允許重製、製作衍生作品、公開展示、公開演出、再授權與散布您的貢獻及其衍生作品。

damecon-browser 與 electron-browser-shell 專案的擁有者亦有權重新授權所貢獻的原始碼及其衍生作品。
