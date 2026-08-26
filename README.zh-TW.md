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
| `v1.0.3`     | `2026-08-26`    |

- **下載版本：** 安裝程式與可攜式壓縮檔可從
  [GitHub Releases](https://github.com/kevinsuu/kancolle-assistant/releases)下載。
- **單一版本的變更：** [最新版本更新日誌](https://github.com/kevinsuu/kancolle-assistant/releases/latest)
  會保存每個 tag 之間自動產生的更新內容。
- **目前累積能力：** [功能狀態](#功能狀態)分別列出目前支援、未來可能加入與不在規劃內的項目。
- **功能技術細節：** 下方專案功能重點會連結至對應文件。

### v1.0.3 更新重點（相較 v1.0.2）

- 普通海域艦隊推薦改用攻略驗證編成骨架，自動選擇只採用固定進王路線，並驗證先制對潛門檻及填入相容的補強增設裝備。
- 遠征推薦可調整資源與水桶權重，規劃前會重新同步 KC3 資源、依收取間隔計算，並區分目前執行中的任務與下一次派遣建議。
- Shell runtime 會快取設定讀取、批次保存視窗尺寸、安全管理分頁視圖，並隔離 KCCacheProxy 與擴充功能 host 的生命週期。
- 開啟遊戲時也會檢查應用程式更新；DevTools 分割版面處理與各平台封裝圖示亦更穩定。

### v1.0.2 更新重點（相較 v1.0.1）

- Release tag 不再重複啟動一般 CI；推薦核心測試改用明確的跨平台路徑，讓 Windows release
  驗證能找到所有測試檔案。

### v1.0.1 更新重點（相較 v1.0.0）

- 拉伸視窗時會重新調整遊戲畫布，且不會鎖定視窗寬高比。
- 艦隊推薦會驗證帳號持有的高速＋與夜戰空母配裝、依改速後戰力排序，並為雷巡建立合理配裝。
- 推薦生成與戰略室導覽會重用帳號及裝備索引、取得足夠合法方案後提早停止，並避免重複掃描整頁。
- 普通海域與遠征判定更新包含 EO 路線、低速艦隊帶路、巡洋艦水戰配裝與水桶收益優先級。

### 本專案功能重點

相較原版，目前原始碼新增或優化了以下功能：

1. **[帳號存取最佳化](./docs/dmm-local-login-storage.md)** — 經使用者確認後，可用作業系統安全儲存機制加密保存 DMM 登入資料；另提供信任之外部轉送代理的全流量模式與地區錯誤提示。
2. **[自適應遊戲畫面](./docs/display-auto-fit.md)** — 啟動遊戲時依 KC3 實際內容調整面板寬度，再以螢幕剩餘空間自動調整視窗與艦これ畫布；之後拉伸視窗時會盡可能完整顯示遊戲，且不鎖定視窗寬高比。
3. **[普通海域艦隊推薦](./docs/fleet-recommender.md)** — 在 KC3 戰略室依目前帳號持有的艦娘與裝備，為 1-1 至 7-5（含 5-6）提供最多三組建議；不會自動變更遊戲狀態。
4. **[遠征推薦](./docs/expedition-resource-planner.md)** — 戰略室獨立的**遠征推薦**頁面會顯示目前資源，並依可調整的四資源與水桶權重、已勾選遠征、成功與大發設定及第 2～4 艦隊狀態，推薦一組最佳配對；不會改動原有遠征評分頁面，也不會自動派遣。
5. **[資源中心與收支摘要](./docs/resource-ledger-summary.md)** — 新增 KC3 戰略室**資源中心**儀表板，可依今日、昨日或最近 24 小時查看目前資源、取得、消耗、淨變化、每小時收支、來源分類與消耗品。
6. **[KC3 開發者工具整合](./docs/kc3-devtools.md)** — 開啟遊戲開發者工具時，優先排列並選取 KC3 的 `KanColle` 面板，減少每次手動切換。
7. **[戰略室釘選連結](./docs/strategy-room-recent-tabs.md)** — 可將最多五個戰略室頁籤釘選至 `常用連結`；一般導覽不會改變順序，第六個釘選會取代最下方連結。

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
- [x] 1-1 至 7-5 普通海域的帳號艦隊推薦，採用附來源的攻略網驗證編成骨架，自動模式只選固定進王路線，並包含已驗證的高速＋裝備、補強增設欄位與夜戰空母配置
- [x] 含艦隊配對與權重設定的遠征推薦
- [x] KC3 固定近期區間資源收支摘要
- [x] KC3 戰略室最多五個固定排序的釘選連結

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
