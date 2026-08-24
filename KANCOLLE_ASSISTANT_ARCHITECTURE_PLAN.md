# KanColle Assistant — Architecture & Implementation Plan

- 文件版本：v1.0
- 日期：2026-08-24
- 專案定位：全新的 KanColle 專用 Desktop Assistant
- 技術基底：Electron + React + TypeScript
- 主要整合：KanColle Web Game + KC3Kai + Recommendation Engine
- Repo 策略：新 Repo，不直接以 Damecon 作為長期產品基底
- Damecon 定位：Reference / Research Implementation
- MVP 第一個推薦關卡：5-5
- 主要平台：Windows / macOS
- 核心原則：Security Boundary、Strong Typing、Modular Architecture、Deterministic Recommendation

## 1. 專案目標

KanColle Assistant 是一個專門為《艦隊Collection》設計的 Desktop Client。

它不是一般用途瀏覽器，也不嘗試成為 Chrome / Edge / Firefox 的替代品。

主要目的：

1. 在 Desktop App 中直接遊玩 KanColle。
2. 整合 KC3Kai。
3. 提供 KC3 Strategy Room。
4. 從 KC3 取得帳號內艦娘與裝備資料。
5. 根據玩家實際持有艦娘與裝備進行艦隊推薦。
6. 根據關卡提供配隊、配裝、制空、索敵、對潛等分析。
7. 未來支援一般海域、活動海域、任務、配裝比較等功能。

核心產品價值：

> 不是告訴玩家「理論上這張圖要怎麼打」，而是根據玩家目前帳號，直接推薦「你現在應該用哪些船、裝哪些裝備」。

## 2. High-Level Architecture

```text
KanColle Assistant
│
├─ Electron Main
│
├─ Local React UI
│   ├─ Dashboard
│   ├─ Fleet Recommendation
│   ├─ Equipment Recommendation
│   └─ Map Information
│
├─ KanColle WebContentsView
│
├─ KC3 Strategy Room
│
└─ Recommendation Worker
```

完整架構：

```text
┌──────────────────────────────────────────────┐
│             KanColle Assistant               │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │          Local React UI                │  │
│  │                                        │  │
│  │ Dashboard                              │  │
│  │ Fleet Recommendation                   │  │
│  │ Equipment Recommendation               │  │
│  │ Map Information                        │  │
│  │ Settings                               │  │
│  └─────────────────┬──────────────────────┘  │
│                    │ Typed IPC                │
│  ┌─────────────────▼──────────────────────┐  │
│  │             Electron Main              │  │
│  │ Session Manager                        │  │
│  │ KC3 Extension Manager                  │  │
│  │ WebContents Manager                    │  │
│  │ IPC Router                             │  │
│  │ Security Policy                        │  │
│  └─────────────┬───────────────┬──────────┘  │
│                │               │             │
│       ┌────────▼──────┐ ┌─────▼─────────┐   │
│       │ KanColle View │ │ KC3 Strategy  │   │
│       │ sandboxed     │ │ Room          │   │
│       └───────────────┘ └─────┬─────────┘   │
│                               │             │
│                        KC3 Account Data      │
│                               │             │
│                     ┌─────────▼──────────┐  │
│                     │ KC3 Bridge         │  │
│                     └─────────┬──────────┘  │
│                               │             │
│                        AccountSnapshot       │
│                               │             │
│                     ┌─────────▼──────────┐  │
│                     │ Recommendation     │  │
│                     │ Worker             │  │
│                     │ Route Rules        │  │
│                     │ Fleet Solver       │  │
│                     │ Gear Solver        │  │
│                     │ Metrics            │  │
│                     │ Evaluator          │  │
│                     └────────────────────┘  │
└──────────────────────────────────────────────┘
```

## 3. Repo Strategy

正式產品使用全新 Repo：

```text
kancolle-assistant
```

Damecon：

```text
planetarian/damecon-browser
```

只作為：

- KC3 extension loading 研究
- Electron session 研究
- Strategy Room lifecycle 研究
- KCCacheProxy 整合參考
- DMM / KanColle navigation 參考

不要直接把整個 Damecon 架構作為產品基底。

## 4. 為什麼新 Repo

1. 原 Damecon 有歷史包袱。
2. 原架構偏 general-purpose browser shell。
3. 本專案不需要地址列、一般網站導航、bookmark 等能力。
4. 大型重構後與 upstream 差異會越來越大。
5. 持續 merge upstream 會變成 conflict 負擔。
6. 新 Repo 可以重新定義 security boundary。
7. Recommendation 是本產品核心，不只是外掛 feature。
8. 可以做到 packages modularization。
9. recommendation-core 未來可脫離 Electron 使用。

## 5. Recommended Monorepo Structure

```text
kancolle-assistant/
├─ apps/
│  └─ desktop/
│     ├─ src/
│     │  ├─ main/
│     │  │  ├─ app.ts
│     │  │  ├─ window/
│     │  │  ├─ session/
│     │  │  ├─ kc3/
│     │  │  ├─ ipc/
│     │  │  ├─ security/
│     │  │  └─ worker/
│     │  ├─ preload/
│     │  │  └─ index.ts
│     │  └─ renderer/
│     │     ├─ app/
│     │     ├─ pages/
│     │     ├─ features/
│     │     ├─ components/
│     │     └─ stores/
│     └─ package.json
├─ packages/
│  ├─ domain/
│  ├─ kc3-bridge/
│  ├─ recommendation-core/
│  ├─ map-rules/
│  ├─ ipc-contracts/
│  └─ shared/
├─ fixtures/
├─ docs/
├─ scripts/
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## 6. 技術選型

- Desktop：Electron
- UI：React + Vite
- Language：TypeScript
- Package Manager：pnpm
- Validation：Zod
- State：Zustand / TanStack Query 視需求選擇
- IPC：Strongly Typed Contracts
- Recommendation：Pure TypeScript
- Worker：Node Worker Thread
- Tests：Vitest + React Testing Library + Playwright + fast-check

## 7. Electron 定位

Electron 只負責：

```text
Chromium Host
+
Desktop Shell
+
KC3 Extension Environment
```

不要把它當 general-purpose browser。

不實作：

- 地址列
- 任意網站瀏覽
- bookmark
- 一般 tabs
- Chrome Web Store
- 一般下載管理器
- 無限制 extension 安裝

## 8. Electron Main Responsibilities

Main Process 只負責：

- App lifecycle
- Main window
- KanColle WebContentsView
- KC3 Strategy Room
- Dedicated Electron session
- KC3 extension lifecycle
- IPC routing
- Permission policy
- Navigation policy
- Worker lifecycle
- Local settings
- Secure persistence

Main 不負責：

- Fleet Solver
- Gear Solver
- Map scoring
- React UI logic

## 9. Renderer Responsibilities

Local React UI 負責：

- Dashboard
- KC3 sync status
- Map selection
- Recommendation parameters
- Recommendation result
- Equipment comparison
- Map information
- Settings
- Error handling

Renderer 不直接：

- 讀 filesystem
- 使用 Node API
- 直接讀 KC3 localStorage
- 任意執行 Electron Main code

## 10. KanColle WebContentsView

遊戲固定使用 WebContentsView。

```ts
const view = new WebContentsView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  },
})
```

原則：

```text
Remote Content != Trusted Renderer
```

KanColle 頁面不應獲得 Node 權限。

## 11. Navigation Allowlist

不提供一般網址列。

```ts
const ALLOWED_HOSTS = new Set([
  'www.dmm.com',
  'games.dmm.com',
  // 依實際 KanColle domain 補充
])
```

所有：

- will-navigate
- window.open
- redirects
- popup

都必須經過 policy。

外部連結交給系統瀏覽器。

## 12. Session Strategy

使用專門 session：

```text
persist:kancolle
```

用途：

- DMM Login
- KanColle
- KC3Kai
- KC3 Strategy Room

不要共用 defaultSession。

## 13. KC3 Extension Manager

```ts
interface KC3ExtensionManager {
  initialize(): Promise<void>
  install(): Promise<void>
  update(): Promise<void>
  load(): Promise<void>
  getVersion(): Promise<string | null>
}
```

MVP：

```text
下載 KC3 release
↓
解壓
↓
session.extensions.loadExtension()
```

## 14. KC3 Strategy Room

KC3 Strategy Room 是 secondary tool view。

產品主 UI 是 KanColle Assistant。

KC3 定位：

```text
Data Provider
+
Existing Strategy Tool
```

不是產品本身。

## 15. KC3 Bridge

目標：

```text
KC3 Runtime
↓
Normalized AccountSnapshot
```

禁止 Solver 直接依賴：

- KC3ShipManager
- KC3GearManager
- KC3 globals
- localStorage schema

Bridge：

```ts
export interface KC3Bridge {
  getAccountSnapshot(): Promise<AccountSnapshot>
  getCapabilities(): Promise<KC3Capabilities>
  refresh(): Promise<void>
}
```

優先順序：

```text
1. KC3 Strategy Room webContents context
2. Fixed injected bridge
3. KC3 extension storage
4. Own KanColle API interception
```

MVP 不先重做 API interception。

## 16. AccountSnapshot

```ts
export interface AccountSnapshot {
  readonly generatedAt: string
  readonly ships: readonly OwnedShip[]
  readonly equipment: readonly OwnedEquipment[]
  readonly currentFleets?: readonly CurrentFleet[]

  readonly metadata: {
    readonly source: 'kc3'
    readonly schemaVersion: number
  }
}
```

## 17. Strongly Typed IDs

```ts
type Brand<T, N extends string> = T & { readonly __brand: N }

export type ShipInstanceId = Brand<number, 'ShipInstanceId'>

export type ShipMasterId = Brand<number, 'ShipMasterId'>

export type EquipmentInstanceId = Brand<number, 'EquipmentInstanceId'>

export type EquipmentMasterId = Brand<number, 'EquipmentMasterId'>
```

raw KC3 input 使用 `unknown`，不要使用大量 `any`。

## 18. Recommendation Core

Recommendation Core 不得 import：

- Electron
- React
- DOM
- KC3 globals

必須維持 Pure TypeScript。

Pipeline：

```text
AccountSnapshot
↓
Map Rule
↓
Route Candidate
↓
Fleet Candidate
↓
Gear Assignment
↓
Metrics
↓
Hard Constraint Validation
↓
Score
↓
Top-N
↓
Explainability
```

核心元件：

- RouteRuleEngine
- FleetSolver
- GearSolver
- ConstraintEngine
- MetricsCalculator
- Evaluator
- RecommendationExplainer

## 19. Recommendation Worker

Solver 放 Worker Thread。

原因：

- Fleet Beam Search
- Gear combinatorial search
- 避免 block Renderer
- 避免 block Main Process

API：

```ts
interface RecommendationWorkerAPI {
  recommend(request: RecommendFleetRequest): Promise<RecommendFleetResult>

  cancel(jobId: string): Promise<void>
}
```

## 20. FleetSolver

目的：

```text
從玩家實際持有艦娘中
搜尋合法且高分的艦隊
```

建議：

```text
Role Candidate Filtering
+
Constraint Pruning
+
Beam Search
```

## 21. GearSolver

目的：

```text
將玩家實際持有的 Equipment Instance
進行全域分配
```

Critical Invariant：

```text
同一個 EquipmentInstanceId
不得被分配兩次
```

禁止：

```text
Ship A 先配最佳
→ 剩下給 B
→ 剩下給 C
```

MVP：

```text
Backtracking
+
Branch and Bound
+
Candidate Pruning
```

## 22. Map Rule Engine

結構：

```text
packages/map-rules/
├─ normal/
│  ├─ 1-1.ts
│  ├─ ...
│  └─ 5-5.ts
└─ event/
```

規則可分：

- Hard Constraints
- Soft Objectives
- Calculated Constraints
- Route Metadata

第一版只做 5-5。

## 23. UI Navigation

建議：

```text
Dashboard
Game
Fleet Recommendation
Equipment Recommendation
Map Information
KC3 Strategy Room
Settings
```

## 24. Dashboard

顯示：

```text
KC3
✓ Connected

Ships
248

Equipment
1384

Last Sync
11:30

Current Map
5-5
```

## 25. Fleet Recommendation Page

```text
Map
[5-5]

Route
[Auto]

Objective
[Boss Clear]

Advanced
[ ] Preserve current fleet equipment
[ ] Avoid specific ships
[ ] Minimize resource cost

[Generate]
```

結果至少顯示：

- Top 3 fleet
- Exact ship
- Level
- Exact equipment
- Improvement
- Proficiency
- Route
- Air power
- LOS
- Opening ASW
- Night battle
- Estimated cost
- Reasons
- Warnings

## 26. Equipment Recommendation

未來可獨立：

```text
Ship
雪風改二

Purpose
Night Cut-In
```

輸出玩家帳號可實際組成的最佳配置。

## 27. Map Information

提供：

- Route
- Nodes
- Air requirement
- LOS requirement
- Enemy composition
- Recommended formation
- Map notes

MVP：

```text
5-5
```

## 28. IPC Design

建立：

```text
packages/ipc-contracts
```

```ts
export interface DesktopAPI {
  account: {
    refresh(): Promise<AccountSnapshot>
    status(): Promise<AccountStatus>
  }

  recommendation: {
    run(request: RecommendFleetRequest): Promise<RecommendFleetResult>

    cancel(jobId: string): Promise<void>
  }

  kc3: {
    status(): Promise<KC3Status>
    openStrategyRoom(): Promise<void>
  }
}
```

preload 只 expose `DesktopAPI`。

禁止 expose：

- fs
- path
- child_process
- raw ipcRenderer
- generic electron API

## 29. Security Principles

必須：

- `nodeIntegration = false`
- `contextIsolation = true`
- `sandbox = true`
- navigation allowlist
- window creation deny by default
- permissions deny by default
- typed IPC
- validate IPC sender
- no generic eval
- no arbitrary shell execution
- CSP
- current Electron version

預設拒絕：

- camera
- microphone
- geolocation
- notifications
- MIDI
- serial
- Bluetooth
- USB

## 30. Privacy

AccountSnapshot 不保存：

- DMM password
- Session cookie raw dump
- Token
- Payment info
- 不必要的 Account ID

只保留推薦所需：

- Ships
- Equipment
- Relevant fleet state

## 31. Testing

使用：

```text
Vitest
React Testing Library
Playwright
fast-check
```

Unit：

- parser
- canEquip
- air power
- LOS
- constraints
- score
- gear uniqueness

Property：

- 推薦 ship 一定存在帳號
- 推薦 equipment 一定存在帳號
- ShipInstanceId 不重複
- EquipmentInstanceId 不重複
- Hard Constraints 全部通過

E2E：

- Launch Desktop
- Mock KC3 data
- Select 5-5
- Generate recommendation
- Cancel job
- Switch objective

CI 不登入真實 DMM。

## 32. Fixture Strategy

```text
fixtures/
├─ account-small.json
├─ account-midgame.json
└─ account-endgame.json
```

用途：

- Agent 開發
- Regression
- Performance
- Reproduce bug

## 33. Phase 0 — Damecon / KC3 Research

目標：

```text
證明 KC3 Integration 可行
```

Tasks：

1. Clone Damecon。
2. 跑起 Damecon。
3. 確認 KC3 extension load。
4. 確認 Strategy Room lifecycle。
5. 找到 ships data。
6. 找到 equipment data。
7. 確認 improvement。
8. 確認 proficiency。
9. 確認 instance/master ID。
10. 匯出 anonymized fixture。
11. 記錄 DMM/KanColle session 行為。
12. 記錄 KC3 更新方式。

Deliverables：

```text
docs/research/damecon.md
docs/research/kc3-runtime.md
docs/research/kc3-data-schema.md
fixtures/account-real-anonymized.json
```

## 34. Phase 1 — Desktop Skeleton

完成：

- Electron
- React
- Vite
- pnpm workspace
- secure preload
- typed IPC
- dedicated persistent session
- Game WebContentsView

Acceptance：

```text
Launch App
↓
Open DMM/KanColle
↓
Login
↓
Play Game
```

且：

```text
nodeIntegration = false
sandbox = true
```

## 35. Phase 2 — KC3 Integration

完成：

- KC3 downloader
- KC3 loader
- KC3 status
- Strategy Room
- KC3 bridge

Acceptance：

```text
KC3 Connected
Ships 248
Equipment 1384
```

## 36. Phase 3 — Recommendation Core

先不接完整 UI。

完成：

- Domain
- 5-5 Map Rule
- Constraint Engine
- Fleet Solver
- Gear Solver
- Metrics
- Evaluator

Acceptance：

```text
fixture
+
5-5 Boss Clear
↓
合法 Top 3
```

## 37. Phase 4 — Recommendation Worker

完成：

- job ID
- progress
- cancel
- timeout
- structured result

## 38. Phase 5 — Recommendation UI

完成：

- map selector
- objective
- loading state
- recommendation cards
- metrics
- reason
- warning
- no solution

## 39. Phase 6 — Normal Maps

擴展：

```text
1-1 ~ 7-5
```

## 40. Phase 7 — Advanced Features

- Equipment movement plan
- Preserve current fleet
- Ship exclusion
- Equipment reservation
- Map comparison
- Export deck
- Recommendation history

## 41. Phase 8 — Event Support

新增：

```text
EventRuleEngine
```

支援：

- Difficulty
- Ship tag
- Historical bonus
- Map phases
- Unlock conditions
- Debuff
- Combined Fleet
- Land Base

## 42. MVP Scope

第一版：

```text
KanColle Desktop Client
+
KC3 Integration
+
KC3 Strategy Room
+
Account Sync
+
5-5 Fleet Recommendation
+
5-5 Equipment Recommendation
```

## 43. MVP Non-Goals

不做：

- General browser
- Arbitrary tabs
- Bookmark
- General download manager
- Chrome Web Store
- Unrelated extensions
- Auto sortie
- Auto equip
- Macro
- Bot
- Auto battle

產品邊界：

```text
Read
Analyze
Recommend
```

不是：

```text
Play Automatically
```

## 44. Suggested PR Sequence

```text
PR 1  chore: initialize monorepo
PR 2  feat(desktop): secure Electron shell
PR 3  feat(game): add KanColle WebContentsView
PR 4  feat(kc3): add KC3 extension manager
PR 5  feat(kc3): add account bridge
PR 6  feat(domain): add account domain
PR 7  feat(rules): add 5-5 map rules
PR 8  feat(solver): add fleet solver
PR 9  feat(solver): add equipment solver
PR 10 feat(worker): run recommendation in worker
PR 11 feat(ui): add recommendation page
```

## 45. Agent Work Rules

Agent 必須遵守：

1. 不在 React Component 寫遊戲公式。
2. 不在 Main Process 寫 Solver。
3. Solver 不 import Electron。
4. Solver 不直接依賴 KC3 global。
5. raw KC3 data 使用 `unknown`。
6. IPC input 全部 validation。
7. 不 expose generic `ipcRenderer`。
8. 不允許 arbitrary navigation。
9. 不實作自動遊戲。
10. 所有公式需要 tests。
11. 所有 map rule 需要 source metadata。
12. 不猜艦娘規則。
13. 不使用 LLM 作 authoritative Solver。
14. Hard Constraint 與 Score 分離。
15. Equipment Instance 不可重複。

## 46. Security Review Checklist

Release 前：

- [ ] Electron current stable
- [ ] nodeIntegration disabled
- [ ] contextIsolation enabled
- [ ] sandbox enabled
- [ ] CSP enabled
- [ ] allowlist reviewed
- [ ] permission policy reviewed
- [ ] external links reviewed
- [ ] IPC sender validation
- [ ] no generic eval
- [ ] no generic shell command
- [ ] preload surface minimal
- [ ] no credential logs
- [ ] dependency audit

## 47. License Strategy

新 Repo 不代表自動與 Damecon 授權切割。

如果大量 copy Damecon implementation，仍需考慮 GPL derivative work。

推薦方式：

```text
研究 Behavior
↓
整理 Requirement
↓
自行 Implementation
```

如果直接重用 GPL code，就保留 GPL obligations。

研究來源：

```text
Damecon Browser
https://github.com/planetarian/damecon-browser

KC3Kai
https://github.com/KC3Kai/KC3Kai

KanColle Browser
https://github.com/shichiria/kancolle-browser
```

## 48. ADR

### ADR-001

```text
Decision:
Create a new repository.

Decision:
Use Damecon only as reference/research.

Decision:
Use Electron as Chromium host, not browser.

Decision:
Do not implement general-purpose browser features.
```

### ADR-002

```text
Decision:
KanColle remote content is sandboxed.

Decision:
Local React UI is trusted application UI.

Decision:
KC3 bridge is a narrow data interface.

Decision:
Remote pages never receive Node API.
```

### ADR-003

```text
Decision:
Recommendation Core is framework independent.

Decision:
Recommendation Core is pure TypeScript.

Decision:
Solver runs in Worker.

Decision:
LLM is not used to produce authoritative fleet assignments.
```

### ADR-004

```text
Decision:
KC3 is the initial account-data provider.

Decision:
AccountSnapshot is the anti-corruption layer.

Decision:
Future data providers may replace KC3 without changing Solver.
```

## 49. Recommended Development Order

```text
1. Research Damecon / KC3
2. New Repo
3. Secure Electron Shell
4. Game View
5. KC3 Extension
6. KC3 Account Bridge
7. AccountSnapshot
8. 5-5 Rules
9. FleetSolver
10. GearSolver
11. Metrics
12. Worker
13. UI
14. 1-1 ~ 7-5
15. Event Maps
```

## 50. Agent Starting Prompt

```text
Read this specification completely before modifying code.

The project is a new Electron + React + TypeScript desktop client named
KanColle Assistant.

Do not build a general-purpose browser.

Your first objective is Phase 0/1:
1. establish the monorepo,
2. build a secure Electron shell,
3. create a dedicated persist:kancolle session,
4. load KanColle in a sandboxed WebContentsView,
5. create a minimal typed preload/IPC boundary.

Do not implement FleetSolver or recommendation screens until the
Electron security boundary and KC3 integration strategy are established.

Follow the module boundaries and security rules in this specification.

When uncertain about KanColle/KC3 behavior, research and document the
assumption instead of guessing.

After each task, report:
- Changed
- Tests
- Assumptions
- Known limitations
- Next
```

## 51. Final Principle

整體專案：

```text
安全邊界
>
資料正確
>
推薦合法
>
可維護
>
效能
>
UI 美觀
```

推薦系統：

```text
合法
>
玩家實際持有
>
可實際配裝
>
穩定
>
高分
```

如果找不到合法編成：

```text
告訴玩家缺什麼
```

不要產生不存在或不合法的配置。
