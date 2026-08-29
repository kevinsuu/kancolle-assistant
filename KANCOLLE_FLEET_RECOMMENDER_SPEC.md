# KanColle Account-Aware Fleet & Equipment Recommender

## 艦娘帳號感知式關卡配隊／配裝推薦系統規格書

- 文件版本：v1.0
- 日期：2026-08-22
- 文件用途：提供 Coding Agent / AI Agent 作為需求、架構、實作與驗收依據
- 目標平台：優先整合至 `planetarian/damecon-browser`
- 主要資料來源：KC3Kai Strategy Room / KC3Kai local account state
- MVP 驗證關卡：通常海域 5-5
- MVP 主要語言：TypeScript
- 狀態：Implementation Ready，部分 KC3 bridge 細節需在 Phase 0 實際驗證

---

# 1. 專案摘要

本專案目標是在現有 `damecon-browser + KC3Kai` 環境中加入「帳號感知式艦隊推薦」功能。

使用者不需要手動輸入自己擁有哪些艦娘、裝備或裝備改修程度。系統應自動從 KC3Kai 已同步的帳號資料中取得：

- 艦娘清單
- 艦娘改造狀態
- 艦娘等級
- 艦娘能力值
- 艦娘裝備槽與搭載數
- 增設槽狀態
- 艦娘活動標籤（若可取得）
- 帳號內全部裝備
- 每件裝備的唯一 instance ID
- 裝備改修星數
- 艦載機熟練度
- 當前已裝備／未裝備狀態

接著使用者只需要選擇：

1. 關卡
2. 攻略目的
3. 可選的偏好條件

系統即可自動根據使用者「實際持有」的艦娘與裝備，產生數組合法且可實際執行的推薦編成。

最終系統回答的不是：

> 5-5 建議用大和、武藏、矢矧。

而是：

> 依照目前帳號，建議使用「大和改二重 Lv.132 / 武藏改二 Lv.143 / 矢矧改二乙 Lv.121 / ...」，並將帳號內實際存在的特定裝備 instance 分配到每艘船。

推薦系統必須同時考慮：

- 路線導航條件
- 艦種限制
- 高速／高速+條件
- 索敵值
- 制空值
- 裝備可裝備性
- 裝備 instance 不可重複分配
- 艦娘特殊能力
- 艦種／艦娘裝備 bonus
- 夜戰能力
- 對潛能力
- 道中生存
- 王點輸出
- 資源消耗
- 使用者指定偏好

核心功能定位：

> 「根據我的帳號，目前要打這張圖時，實際應該派誰、裝什麼？」

---

# 2. 專案目標

## 2.1 Primary Goal

建立一套 deterministic、可測試、可擴充的艦娘艦隊與裝備推薦引擎。

輸入：

```text
AccountSnapshot
+ Map
+ Route / Objective
+ User Preferences
```

輸出：

```text
Top-N Fleet Recommendations
+ Exact Owned Equipment Assignment
+ Route
+ Calculated Metrics
+ Reasoning / Warnings
```

---

## 2.2 MVP Goal

第一版只需要完整支援：

```text
通常海域 5-5
```

但架構必須可以直接擴展至：

```text
1-1 ~ 7-5
```

5-5 被選作 MVP 是因為它足以驗證多數核心問題：

- 多種可選路線
- 艦種導航條件
- 高速條件
- 索敵條件
- 制空需求
- 戰艦／空母配置
- 特殊攻擊
- 夜戰
- 高價值裝備競爭
- 生存與資源消耗取捨

如果 5-5 Vertical Slice 可以正確處理，之後通常海域擴充主要應是資料與規則新增，而不是重寫架構。

---

# 3. 非目標

MVP 不實作以下功能。

## 3.1 不自動操作遊戲

禁止：

- 自動出擊
- 自動點擊
- 自動換裝
- 自動補給
- 自動遠征
- 自動戰鬥
- 自動選陣型

系統僅提供：

```text
Read
Analyze
Recommend
```

不得提供：

```text
Automate Gameplay
```

---

## 3.2 不直接做 LLM Fleet Solver

Fleet/Gear Recommendation 核心不可依賴 LLM。

原因：

- LLM 無法保證 Constraint Satisfaction
- 容易產生不存在裝備
- 容易重複使用同一件裝備
- 無法保證導航合法
- 結果難以 regression test
- token/cost 沒必要

LLM 未來最多只能用於：

- 將規則說明轉為自然語言
- 解釋推薦原因
- 解析攻略文章成候選規則
- 提供 UI 說明

但：

```text
Hard Constraints
Fleet Selection
Gear Assignment
Score Calculation
```

必須由 deterministic engine 完成。

---

## 3.3 MVP 不支援活動海域

活動海域先不納入 MVP。

原因：

- 難度：甲／乙／丙／丁
- 貼條
- 史實艦倍卡
- 解謎
- 削甲
- 聯合艦隊
- 陸航
- 活動期間敵編成變動
- 社群驗證資料持續更新

活動海域應在 Phase 4 之後另行設計。

---

# 4. 已研究的現有專案

## 4.1 damecon-browser

Repository:

```text
https://github.com/planetarian/damecon-browser
```

定位：

```text
A minimal browser designed for playing Kantai Collection via KC3Kai
```

已具備：

- Electron browser shell
- KC3Kai 整合
- KC3Kai 自動下載／更新
- release / master / develop channel
- Strategy Room 自動開啟
- KCCacheProxy 整合
- Browser tabs
- Extension loading
- Windows installer / updater

因此本專案不應重新實作：

- 艦娘專用 Browser
- KC3 安裝
- KC3 Account Sync
- Kancolle Network Capture

優先方案：

```text
Fork / Extend damecon-browser
```

新增：

```text
Recommendation Feature
```

---

## 4.2 KC3Kai

Repository:

```text
https://github.com/KC3Kai/KC3Kai
```

KC3Kai 已負責大量艦娘資料管理與公式。

推薦系統應盡可能重用 KC3 已經解析過的：

- Ship state
- Equipment state
- Master data
- Equipment metadata
- Ship metadata
- 部分公式與 bonus 判斷

不要重新建立另一套 API interception layer，除非 KC3 Bridge 實驗證明無法可靠取得所需資料。

---

## 4.3 shichiria/kancolle-browser

Repository:

```text
https://github.com/shichiria/kancolle-browser
```

技術：

```text
Tauri v2
React
TypeScript
Rust
```

已實作：

- 艦娘一覽
- 裝備一覽
- 遠征 checker
- 任務 checker
- 戰鬥 log
- 通常海域 1-1 ~ 7-5 推薦編成 checker

重要參考檔案：

```text
src-tauri/data/map_recommendations.json
```

相關 command：

```text
get_map_recommendations
check_map_recommendation_cmd
```

本專案可研究其：

```text
Map Recommendation Schema
Route Rule Representation
Constraint Representation
```

但不可假設其 recommendation 已等同於我們需要的完整 Solver。

本系統需要處理的是：

```text
Map Rules
→ Account Ships
→ Account Equipment
→ Global Assignment
→ Best Actual Fleet
```

而不是：

```text
Map
→ Static Suggested Ship Types
```

---

# 5. License / Source Policy

## 5.1 damecon-browser

License：

```text
GPL-3
```

如果本專案直接 fork / modify / distribute `damecon-browser`，Agent 不得把它當成閉源 MIT/BSD project 處理。

任何正式發布前必須重新確認：

- derivative work 義務
- distribution requirement
- source distribution
- third-party dependency license

---

## 5.2 KC3Kai

KC3Kai repository license：

```text
MIT
```

可研究／重用符合 MIT 條款的程式碼，但需保留必要 attribution / license。

---

## 5.3 kancolle-browser

License：

```text
MIT
```

允許參考或在符合 MIT 規範下重用部分結構。

但建議：

```text
優先學習 schema / architecture
而不是大量 copy implementation
```

Agent 每次直接移植程式碼時，必須在 PR 中註明來源。

---

# 6. 整體系統架構

推薦架構：

```text
┌─────────────────────────────────────────────┐
│               damecon-browser               │
│                                             │
│ ┌───────────────┐       ┌────────────────┐  │
│ │   KanColle    │       │     KC3Kai     │  │
│ │   Game Tab    │       │ Strategy Room  │  │
│ └───────────────┘       └───────┬────────┘  │
│                                 │           │
│                           KC3 Account State │
│                                 │           │
│                         ┌───────▼────────┐  │
│                         │   KC3 Bridge   │  │
│                         └───────┬────────┘  │
│                                 │           │
│                     Normalized Account DTO │
│                                 │           │
│                    ┌────────────▼─────────┐ │
│                    │ Recommendation Core │ │
│                    │                      │ │
│                    │ RouteRuleEngine      │ │
│                    │ FleetSolver          │ │
│                    │ GearSolver           │ │
│                    │ CombatMetrics        │ │
│                    │ Evaluator            │ │
│                    └────────────┬─────────┘ │
│                                 │           │
│                       Recommendation[]     │
│                                 │           │
│                  ┌──────────────▼────────┐ │
│                  │ Recommendation UI     │ │
│                  └───────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

# 7. 模組邊界

建議 repository 內加入：

```text
packages/
  recommendation-core/
  recommendation-ui/
  kc3-bridge/
```

或若現有 Damecon monorepo 結構不適合，等價建立：

```text
src/
  features/
    recommendation/
```

推薦 logical structure：

```text
recommendation/
├── application/
│   ├── recommend-fleet.ts
│   ├── sync-account.ts
│   └── get-map-options.ts
│
├── domain/
│   ├── account/
│   ├── ship/
│   ├── equipment/
│   ├── fleet/
│   ├── map/
│   ├── route/
│   ├── combat/
│   └── recommendation/
│
├── infrastructure/
│   ├── kc3/
│   │   ├── kc3-bridge.ts
│   │   ├── kc3-adapter.ts
│   │   └── kc3-types.ts
│   │
│   └── rule-data/
│       ├── map-rule-loader.ts
│       └── map-rule-validator.ts
│
├── rules/
│   ├── normal/
│   │   ├── 5-5.ts
│   │   └── ...
│   └── common/
│
├── solver/
│   ├── candidate-generator.ts
│   ├── fleet-solver.ts
│   ├── equipment-solver.ts
│   ├── constraint-engine.ts
│   ├── beam-search.ts
│   └── evaluator.ts
│
├── metrics/
│   ├── air-power.ts
│   ├── los.ts
│   ├── asw.ts
│   ├── night-battle.ts
│   └── resource-cost.ts
│
├── presentation/
│   ├── recommendation-page.tsx
│   └── components/
│
└── tests/
```

---

# 8. Dependency Rule

核心要求：

```text
Solver 不得直接依賴 KC3 global object
```

禁止：

```ts
function solveFleet() {
  const ships = KC3ShipManager.list
}
```

必須：

```ts
const snapshot = kc3Adapter.getAccountSnapshot()

const recommendations = recommendFleet({
  snapshot,
  mapId,
  objective,
})
```

理由：

- 可以 unit test
- 可以 fixture replay
- KC3 schema 改變只影響 Adapter
- Future API source 可以替換
- Solver 可獨立 benchmark
- 避免大量 implicit global dependency

---

# 9. KC3 Bridge

## 9.1 職責

`KC3Bridge` 唯一責任：

> 從當前 Damecon 內的 KC3 context 取得原始帳號資料。

不負責：

- Fleet Solver
- Gear Solver
- Score
- Route
- UI

---

## 9.2 Bridge 必須取得的資料

最低：

```ts
interface RawKC3AccountData {
  ships: unknown
  gears: unknown
  masterShips?: unknown
  masterGears?: unknown
  fleets?: unknown
}
```

---

## 9.3 Bridge 實作優先順序

Phase 0 必須依序驗證：

### Option A — Strategy Room webContents executeJavaScript

如果 Damecon 可以取得 Strategy Room tab 的 `webContents`：

```ts
webContents.executeJavaScript(`
  (() => {
    // Access data inside KC3 extension origin
  })()
`)
```

優先使用此方法。

優點：

- 不需要另外 extension permission
- 同 origin context
- 不重新攔 API
- 直接取得 KC3 已建立 state

---

### Option B — Preload Bridge

如果 Option A 不可靠：

```text
KC3 Strategy Room
→ preload / injected bridge
→ IPC
→ Damecon main process
```

API：

```ts
interface KC3BridgeAPI {
  getAccountSnapshot(): Promise<RawKC3AccountData>
}
```

---

### Option C — Read KC3 storage

只有確認 Electron profile storage schema 穩定時使用。

不要在 Phase 0 一開始直接 hardcode Chromium storage file。

---

### Option D — Own API capture

最後 fallback 才考慮。

不建議 MVP 使用。

---

## 9.4 Bridge Security Boundary

Bridge 只允許讀取特定 whitelist：

```text
ships
gears
masterShips
masterGears
fleets
```

禁止：

```text
arbitrary JS execution from renderer input
```

例如禁止：

```ts
ipc.handle('kc3-eval', (_, code: string) => {
  return webContents.executeJavaScript(code)
})
```

應使用固定 command：

```ts
ipc.handle("kc3:get-account-snapshot", ...)
```

---

# 10. Normalized Domain Model

## 10.1 AccountSnapshot

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

---

# 11. OwnedShip

```ts
export type ShipInstanceId = number
export type ShipMasterId = number
export type EquipmentInstanceId = number
export type EquipmentMasterId = number

export interface OwnedShip {
  readonly id: ShipInstanceId
  readonly masterId: ShipMasterId

  readonly name: string

  readonly level: number

  readonly shipType: ShipType

  readonly speed: ShipSpeed

  readonly stats: ShipStats

  readonly slotSizes: readonly number[]

  readonly equippedItemIds: readonly (EquipmentInstanceId | null)[]

  readonly expansionSlotItemId: EquipmentInstanceId | null

  readonly expansionSlotUnlocked: boolean

  readonly locked: boolean

  readonly morale?: number

  readonly eventTag?: number | null
}
```

---

## 11.1 ShipStats

```ts
export interface ShipStats {
  readonly hp: number
  readonly firepower: number
  readonly torpedo: number
  readonly antiAir: number
  readonly armor: number
  readonly evasion: number
  readonly asw: number
  readonly los: number
  readonly luck: number
}
```

---

# 12. OwnedEquipment

```ts
export interface OwnedEquipment {
  readonly id: EquipmentInstanceId

  readonly masterId: EquipmentMasterId

  readonly name: string

  readonly type: EquipmentType

  readonly improvement: number

  readonly proficiency: number

  readonly locked: boolean

  readonly currentlyEquippedBy: ShipInstanceId | null
}
```

重要：

```text
Equipment Instance ID != Equipment Master ID
```

例如使用者可能有：

```text
五連装酸素魚雷 #1001 ★+10
五連装酸素魚雷 #1002 ★+6
五連装酸素魚雷 #1003 ★0
```

Solver 必須視為三個不同 resource。

---

# 13. Ship Master Data

```ts
export interface ShipMaster {
  readonly id: ShipMasterId

  readonly name: string

  readonly type: ShipType

  readonly classId?: number

  readonly speed: ShipSpeed

  readonly equipmentSlots: number

  readonly slotSizes: readonly number[]

  readonly equipableTypes: readonly EquipmentType[]

  readonly specialCapabilities: readonly ShipCapability[]
}
```

不要將 master data 與 owned data 混合。

---

# 14. Equipment Master Data

```ts
export interface EquipmentMaster {
  readonly id: EquipmentMasterId

  readonly name: string

  readonly type: EquipmentType

  readonly stats: EquipmentStats

  readonly tags: readonly EquipmentTag[]
}
```

---

# 15. Map Domain

```ts
export type MapId =
  | "1-1"
  | "1-2"
  | "1-3"
  | ...
  | "5-5"
  | ...
  | "7-5";
```

如果 TS union 維護成本過高，可改 branded string：

```ts
export type MapId = string & {
  readonly __brand: 'MapId'
}
```

---

# 16. RouteTemplate

```ts
export interface RouteTemplate {
  readonly id: string

  readonly mapId: MapId

  readonly name: string

  readonly nodes: readonly string[]

  readonly fleetConstraints: readonly FleetConstraint[]

  readonly calculatedConstraints: readonly CalculatedConstraint[]

  readonly objectiveWeights?: Partial<Record<ScoreDimension, number>>

  readonly metadata: {
    readonly source: string
    readonly confidence: 'verified' | 'community' | 'experimental'
    readonly lastVerified?: string
  }
}
```

---

# 17. Hard Constraint Model

所有「不符合就不能推薦」的條件使用 Hard Constraint。

例如：

```ts
export type FleetConstraint =
  | ShipCountConstraint
  | ShipTypeCountConstraint
  | SpeedConstraint
  | SpecificShipConstraint
  | ForbiddenShipTypeConstraint
  | CombinedConstraint
```

---

## 17.1 Ship Count

```ts
export interface ShipCountConstraint {
  readonly kind: 'ship-count'

  readonly min?: number
  readonly max?: number
  readonly exact?: number
}
```

---

## 17.2 Ship Type Count

```ts
export interface ShipTypeCountConstraint {
  readonly kind: 'ship-type-count'

  readonly shipTypes: readonly ShipType[]

  readonly min?: number
  readonly max?: number
  readonly exact?: number
}
```

---

## 17.3 Speed

```ts
export interface SpeedConstraint {
  readonly kind: 'speed'

  readonly minimum: 'slow' | 'fast' | 'fast+' | 'fastest'
}
```

注意：

```text
艦隊高速+
```

可能依賴裝備。

因此不能只在 FleetSolver 判斷。

某些 speed constraint 必須延遲到：

```text
GearSolver
```

完成後重新驗證。

---

# 18. Calculated Constraints

```ts
export type CalculatedConstraint =
  | LosConstraint
  | AirPowerConstraint
  | SpeedFinalConstraint
  | AswConstraint
```

---

## 18.1 LOS

```ts
export interface LosConstraint {
  readonly kind: 'los'

  readonly formula: '33'

  readonly coefficient: number

  readonly minimum: number
}
```

---

## 18.2 Air Power

```ts
export interface AirPowerConstraint {
  readonly kind: 'air-power'

  readonly minimum: number

  readonly recommended?: number
}
```

---

# 19. Soft Objectives

合法艦隊之間使用 Score 排序。

```ts
export type ScoreDimension =
  | 'bossDamage'
  | 'survival'
  | 'airPowerMargin'
  | 'nightBattle'
  | 'openingAsw'
  | 'resourceCost'
  | 'equipmentOpportunityCost'
  | 'routeReliability'
```

---

# 20. Objective Presets

MVP 提供：

```ts
export type RecommendationObjective = 'balanced' | 'boss-clear' | 'low-cost'
```

未來：

```text
farm
quest
leveling
sparkle
event-clear
```

---

## 20.1 Balanced

範例權重：

```ts
{
  bossDamage: 0.25,
  survival: 0.25,
  airPowerMargin: 0.15,
  nightBattle: 0.10,
  openingAsw: 0.05,
  resourceCost: 0.10,
  equipmentOpportunityCost: 0.05,
  routeReliability: 0.05,
}
```

實際數值必須由 test / gameplay feedback 調整。

不要把這組數字視為最終遊戲公式。

---

# 21. Recommendation Input

```ts
export interface RecommendFleetInput {
  readonly mapId: MapId

  readonly routeId?: string

  readonly objective: RecommendationObjective

  readonly account: AccountSnapshot

  readonly preferences?: RecommendationPreferences
}
```

---

# 22. Recommendation Preferences

```ts
export interface RecommendationPreferences {
  readonly excludedShipIds?: readonly ShipInstanceId[]

  readonly requiredShipIds?: readonly ShipInstanceId[]

  readonly reservedEquipmentIds?: readonly EquipmentInstanceId[]

  readonly preserveEventTaggedShips?: boolean

  readonly maxResourceCostLevel?: 'low' | 'medium' | 'any'

  readonly favorLevelingShips?: boolean
}
```

---

# 23. Recommendation Output

```ts
export interface FleetRecommendation {
  readonly id: string

  readonly mapId: MapId

  readonly route: RouteTemplate

  readonly ships: readonly RecommendedShipBuild[]

  readonly metrics: FleetMetrics

  readonly score: RecommendationScore

  readonly reasons: readonly RecommendationReason[]

  readonly warnings: readonly RecommendationWarning[]
}
```

---

# 24. RecommendedShipBuild

```ts
export interface RecommendedShipBuild {
  readonly ship: OwnedShip

  readonly role: FleetRole

  readonly equipment: readonly (OwnedEquipment | null)[]

  readonly expansionSlot: OwnedEquipment | null

  readonly metrics: ShipBuildMetrics
}
```

---

# 25. FleetMetrics

```ts
export interface FleetMetrics {
  readonly airPower: number

  readonly los33: number

  readonly openingAswCount: number

  readonly estimatedFuelCost: number

  readonly estimatedAmmoCost: number

  readonly estimatedBauxiteCost?: number

  readonly nightCutInCandidates: number

  readonly finalSpeedClass: ShipSpeed

  readonly constraintResults: readonly ConstraintCheckResult[]
}
```

---

# 26. Explainability

推薦系統不能只輸出：

```text
score = 83.52
```

必須提供 human-readable reasons。

例如：

```ts
{
  code: "AIR_SUPERIORITY_MARGIN",
  severity: "positive",
  message:
    "制空值 428，高於此方案建議值 391，保留 37 點餘裕。",
}
```

例如：

```ts
{
  code: "LOW_LOS_MARGIN",
  severity: "warning",
  message:
    "索敵值僅高於最低需求 1.8，裝備或艦娘狀態變更可能造成歪航。",
}
```

例如：

```ts
{
  code: "EQUIPMENT_CONFLICT",
  severity: "warning",
  message:
    "此方案使用目前第一艦隊中的 +10 高射裝置。",
}
```

---

# 27. Solver Pipeline

推薦 Pipeline：

```text
1. Load Route Templates
2. Filter unavailable routes
3. Build Fleet Roles
4. Generate Ship Candidates per Role
5. Fleet Beam Search
6. Preliminary Fleet Score
7. Generate Equipment Requirements
8. Global Equipment Assignment
9. Recalculate final metrics
10. Validate all hard constraints
11. Final Score
12. Deduplicate near-identical solutions
13. Return Top N
```

---

# 28. 為什麼不能暴力排列

假設帳號有：

```text
250 ships
```

選 6 艘：

```text
C(250, 6)
```

已遠超適合直接 brute force 的範圍。

而每艘再有多個裝備槽：

```text
6 ships
× 3~5 slots
× hundreds equipment
```

組合數會爆炸。

因此必須：

```text
Constraint Pruning
Role Candidate Filtering
Beam Search
Branch & Bound
```

---

# 29. Fleet Role

RouteTemplate 不應只寫：

```text
2 BB + 2 CV + 2 DD
```

可以加入 Role：

```ts
export type FleetRole =
  | 'main-battleship'
  | 'carrier-air-superiority'
  | 'carrier-damage'
  | 'night-cut-in'
  | 'anti-submarine'
  | 'utility-cruiser'
  | 'route-required'
  | 'support'
```

例如：

```ts
{
  role: "night-cut-in",
  allowedShipTypes: ["DD", "CL"],
  count: 1,
}
```

---

# 30. Candidate Generation

每個 Role 先選 Top-K candidate。

例如：

```text
Night CI Role
```

帳號可能有 80 DD。

但 Candidate Generator 最終只保留：

```text
Top 15
```

Ranking 可以使用：

- luck
- torpedo
- night battle stat
- level
- HP
- evasion
- equipment compatibility
- special bonus
- remodel state

---

# 31. Candidate Score

```ts
interface ShipCandidateScore {
  readonly roleFit: number
  readonly survivability: number
  readonly offense: number
  readonly equipmentCompatibility: number
  readonly opportunityCost: number
}
```

注意：

這只是：

```text
preliminary candidate score
```

不是 Final Fleet Score。

---

# 32. Fleet Beam Search

Pseudo code：

```ts
let states: FleetState[] = [createEmptyFleetState()]

for (const role of roles) {
  const nextStates: FleetState[] = []

  for (const state of states) {
    for (const candidate of candidatesFor(role)) {
      if (!canAddShip(state, candidate)) {
        continue
      }

      const next = addShip(state, candidate)

      if (violatesEarlyConstraints(next)) {
        continue
      }

      nextStates.push(next)
    }
  }

  states = takeTopK(nextStates, FLEET_BEAM_WIDTH)
}
```

MVP default：

```text
FLEET_BEAM_WIDTH = 200
```

可透過 benchmark 調整。

---

# 33. Early Constraint Pruning

加入艦娘時立即排除：

- 重複 ShipInstanceId
- 艦種 max 已超過
- 禁止艦種
- required ship 已無法滿足
- speed 完全不可能滿足
- slot role 不可能完成

這可大量降低搜尋空間。

---

# 34. Equipment Solver

Gear Solver 是核心。

禁止：

```text
Ship A 配完
↓
剩下裝備給 Ship B
↓
剩下給 Ship C
```

這是 local greedy，很容易產生次佳解。

例如：

```text
唯一一顆高改修夜偵
```

可能：

```text
A 艦使用提升 3 分
B 艦使用提升 12 分
```

若先處理 A，整艦隊結果會變差。

---

# 35. Equipment Resource Model

每個：

```text
OwnedEquipment.id
```

是一個唯一 resource。

Invariant：

```ts
assignedEquipmentIds.size === totalAssignedEquipmentCount
```

不得：

```text
同一個 instance
出現在兩艘船
```

---

# 36. Equipment Slot Requirement

每個 Ship Role 可生成 slot requirement：

```ts
export interface EquipmentRequirement {
  readonly slotIndex: number | 'expansion'

  readonly acceptedTypes: readonly EquipmentType[]

  readonly preferredTags?: readonly EquipmentTag[]

  readonly required: boolean

  readonly score: (equipment: OwnedEquipment, context: EquipmentScoreContext) => number
}
```

---

# 37. Equipment Compatibility

必須有：

```ts
canEquip(
  ship: OwnedShip,
  equipment: OwnedEquipment,
  slotIndex: number | "expansion",
): boolean
```

此函式必須考慮：

- 艦種
- 特定艦限定
- slot 類型
- 補強增設
- 裝備特殊限制

如果 KC3 已有可靠判定，優先包裝 KC3。

不得在不同模組各自 hardcode。

---

# 38. Equipment Candidate Pruning

每個 slot 不要搜尋全部裝備。

例如：

```text
Carrier Fighter Slot
```

流程：

```text
Account Equipment
↓
canEquip
↓
Fighter-compatible
↓
Sort by local utility
↓
Top 12
```

MVP：

```text
MAX_GEAR_CANDIDATES_PER_SLOT = 12
```

---

# 39. Equipment Assignment Algorithm

MVP 建議：

```text
Backtracking
+ Branch and Bound
+ Candidate pruning
```

或：

```text
Beam Search
```

先不需要導入 OR-Tools。

---

# 40. Gear Solver State

```ts
interface EquipmentSearchState {
  readonly assignments: ReadonlyMap<SlotKey, EquipmentInstanceId>

  readonly usedEquipmentIds: ReadonlySet<EquipmentInstanceId>

  readonly partialScore: number

  readonly optimisticUpperBound: number
}
```

如果：

```text
optimisticUpperBound < currentBestScore
```

直接 prune。

---

# 41. Future Solver Upgrade

如果未來：

```text
活動海域
聯合艦隊
陸航
支援艦隊
```

搜尋量過大，可評估：

- Integer Linear Programming
- CP-SAT
- OR-Tools
- WebAssembly Solver

但不是 MVP 前置需求。

---

# 42. Combat Metrics Layer

所有計算集中：

```text
metrics/
```

不要把公式散落在 React component 或 Solver。

---

# 43. Air Power

API：

```ts
calculateFleetAirPower(
  builds: readonly RecommendedShipBuild[],
): number;
```

必須考慮：

- plane AA
- slot size
- proficiency
- relevant equipment bonus
- ship bonus if applicable

若 KC3 有可靠既有公式：

```text
Adapter / Calculator Wrapper
```

優先。

---

# 44. LOS

API：

```ts
calculateLos33(
  fleet: readonly RecommendedShipBuild[],
  coefficient: number,
): number;
```

必須 regression test。

---

# 45. ASW

API：

```ts
canOpeningASW(
  build: RecommendedShipBuild,
): boolean;
```

不得只用：

```text
ASW >= 100
```

因為實際規則可能依：

- 艦種
- 裝備
- 特殊能力

---

# 46. Night Battle

第一版不需要完整模擬每個戰鬥 RNG。

但至少計算：

```text
night battle potential
cut-in eligibility
luck
torpedo/firepower
equipment combination
```

---

# 47. Full Battle Simulation

MVP：

```text
NO
```

先做：

```text
heuristic evaluator
```

之後如果需要，可以整合：

```text
Monte Carlo battle simulator
```

但不要讓 battle simulator 阻塞 MVP。

---

# 48. Evaluator

輸入：

```ts
interface EvaluateFleetInput {
  readonly builds: readonly RecommendedShipBuild[]

  readonly route: RouteTemplate

  readonly objective: RecommendationObjective
}
```

輸出：

```ts
interface RecommendationScore {
  readonly total: number

  readonly dimensions: {
    readonly bossDamage: number
    readonly survival: number
    readonly airPowerMargin: number
    readonly nightBattle: number
    readonly openingAsw: number
    readonly resourceCost: number
    readonly equipmentOpportunityCost: number
    readonly routeReliability: number
  }
}
```

Dimension 建議 normalize：

```text
0 ~ 100
```

Final：

```ts
total =
  Σ dimensionScore * weight;
```

---

# 49. Hard Constraint Rule

任何 hard constraint failure：

```ts
return {
  valid: false,
}
```

不要使用：

```text
-1000 score
```

來模擬 hard constraint。

原因：

某些其他 bonus 分數可能意外抵銷。

合法性與排名必須分離。

---

# 50. Map Rule Data

建議 static data：

```text
rules/
normal/
```

可以 TS：

```text
5-5.ts
```

也可以 JSON + Schema Validation。

建議：

```text
JSON/YAML data
+
TypeScript evaluator
```

對單純 declarative rule 使用 JSON。

需要 dynamic logic 時：

```text
TypeScript predicate
```

---

# 51. Rule Schema Validation

所有外部／靜態 rule 啟動時使用：

```text
Zod
```

或同等 schema validator。

例如：

```ts
const RouteTemplateSchema = z.object({
  id: z.string(),
  mapId: z.string(),
  nodes: z.array(z.string()),
  fleetConstraints: z.array(FleetConstraintSchema),
})
```

Invalid rule：

```text
Fail Fast
```

開發環境直接 error。

---

# 52. 5-5 Vertical Slice

Phase 1 唯一要求：

```text
5-5
```

UI：

```text
Map:
[ 5-5 ▼ ]

Objective:
[ Balanced ]
[ Boss Clear ]
[ Low Cost ]

[ Generate Recommendations ]
```

---

# 53. 5-5 Output

至少輸出 Top 3。

```text
1. 穩定度優先
2. 火力優先
3. 低消耗
```

但如果只有 1 組合法：

```text
只輸出 1 組
```

禁止為了 Top 3 產生非法方案。

---

# 54. Recommendation Card

範例：

```text
方案 A
總分 86.4

路線
B → K → P → S

艦隊
────────────────────

大和改二重 Lv.132
角色：主力戰艦

Slot 1
51cm連装砲 ★+6

Slot 2
46cm三連装砲改 ★+10

Slot 3
零式水上偵察機11型乙(熟練)

Slot 4
一式徹甲弾改 ★+6

增設
新型高温高圧缶

────────────────────

...

制空
428

建議值
391

Margin
+37

索敵33式
82.4

最低
80

夜戰 CI
2 ships

估計燃料消耗
xxx

估計彈藥
xxx
```

---

# 55. Recommendation Comparison UI

三組方案可以比較：

```text
Metric          A       B       C
------------------------------------
Score           86      82      78
Air Power       428     401     390
LOS             82.4    85.1    81.0
Boss Damage     91      95      80
Survival        90      78      82
Resource Cost   High    High    Mid
```

---

# 56. Account Sync UI

頁面應顯示：

```text
KC3 Account Data

艦娘：248
裝備：1,384

Last Sync:
2026-08-22 12:32

[ Refresh ]
```

如果 Bridge 尚未成功：

```text
尚未取得 KC3 帳號資料。
請確認 KC3 Strategy Room 已成功載入。
```

---

# 57. Empty / Error State

必須處理：

- KC3 尚未開啟
- KC3 尚未取得 port data
- ships empty
- gears empty
- schema parse error
- invalid master ID
- recommendation 無合法解
- 裝備不足
- route data missing

例如：

```text
目前帳號無法組成符合 5-5「高速+」方案的艦隊。

缺少：
- 可讓艦隊達成高速+的裝備組合
```

比：

```text
No solution
```

好。

---

# 58. No Solution Analysis

如果 Solver 沒解：

```ts
interface NoSolutionResult {
  readonly reasons: readonly UnsatisfiedRequirement[]
}
```

例如：

```text
Missing 1 DD candidate
Air power max = 312, required = 350
LOS max = 76.2, required = 80
```

這是重要產品功能。

---

# 59. Current Equipment Handling

預設：

```text
允許重新分配帳號全部裝備
```

因為 recommendation 的目的是：

```text
最佳配裝
```

但 UI 應顯示：

```text
此推薦需要移動 11 件裝備
```

未來可以加入：

```text
Minimize equipment movement
```

objective。

---

# 60. Equipment Opportunity Cost

目前不對「已裝在現役艦隊」的裝備加入額外 penalty。

推薦目標是依照帳號完整持有裝備池找最佳配裝；每件裝備仍以 instance ID 分配，不可重複使用。
如果推薦使用已裝在其他艦娘身上的裝備，UI 可以提示需要搬動的件數，但系統不自動換裝。

---

# 61. Equipment Bonus Evaluation

每件裝備都有 master stats、改修、熟練度與 instance ID。推薦器先產生合法候選，再由 KC3
對完整配裝複算艦娘別／組合裝備加成、改修、適重命中與目標別有效火力，用於最終排序。

---

# 62. Event Tag Future Compatibility

Domain model 現在就保留：

```ts
eventTag?: number | null;
```

MVP 5-5 不使用。

避免未來活動海域重構 OwnedShip。

---

# 63. Data Freshness

AccountSnapshot 必須有：

```ts
generatedAt
```

如果資料距現在超過一定時間：

```text
warning
```

不應 silent 使用 stale snapshot。

---

# 64. Snapshot Persistence

MVP 可先只 memory。

建議 Phase 2：

```text
last-account-snapshot.json
```

用途：

- debug
- regression
- offline Solver testing
- reproducible issue report

但必須注意使用者帳號資料隱私。

---

# 65. Privacy

Snapshot 不應包含：

- DMM credential
- session cookie
- token
- user password
- unnecessary account identity

只保存推薦需要的：

```text
ships
equipment
relevant game state
```

---

# 66. Telemetry

MVP：

```text
不需要 remote telemetry
```

如果未來加入：

```text
opt-in only
```

不得上傳完整帳號 inventory。

---

# 67. Performance Requirement

一般帳號：

```text
Ships: <= 500
Equipment: <= 3000
```

MVP 5-5 recommendation：

目標：

```text
< 2 seconds
```

可接受：

```text
< 5 seconds
```

如果 > 5 秒：

- 需要 profiling
- 增加 pruning
- 調整 beam width
- 使用 worker thread

---

# 68. UI Thread

Solver 不應阻塞 Electron renderer。

如果 benchmark > 100ms：

優先：

```text
Worker Thread
Web Worker
Node Worker
```

視 Damecon architecture 選擇。

---

# 69. Cancellation

推薦執行要支援取消：

```ts
interface RecommendationJob {
  cancel(): void
}
```

使用者切換：

```text
5-5
→ 3-5
```

時舊 job 不應覆蓋新結果。

---

# 70. Determinism

相同：

```text
AccountSnapshot
MapRules
Preferences
SolverVersion
```

必須產生相同推薦排序。

不要使用 uncontrolled random。

如果未來 Monte Carlo：

```text
explicit RNG seed
```

---

# 71. Caching

可以 cache：

```text
ship role score
equipment compatibility
equipment local score
master data lookup
```

key 必須基於 immutable IDs。

---

# 72. Master Data Index

建立：

```ts
interface MasterDataIndex {
  readonly ships: ReadonlyMap<ShipMasterId, ShipMaster>

  readonly equipment: ReadonlyMap<EquipmentMasterId, EquipmentMaster>
}
```

避免 Solver 反覆 `.find()`。

---

# 73. Account Index

```ts
interface AccountIndex {
  readonly shipsById: ReadonlyMap<ShipInstanceId, OwnedShip>

  readonly equipmentById: ReadonlyMap<EquipmentInstanceId, OwnedEquipment>

  readonly equipmentByType: ReadonlyMap<EquipmentType, readonly OwnedEquipment[]>
}
```

---

# 74. Testing Strategy

至少四層：

```text
Unit
Rule
Solver Fixture
Integration
```

---

# 75. Unit Tests

測試：

```text
canEquip
air power
LOS
candidate score
constraint evaluator
equipment unique assignment
```

---

# 76. Constraint Tests

例如：

```ts
it("rejects fleet with too many battleships", ...)
```

```ts
it("accepts exact route fleet requirements", ...)
```

```ts
it("rejects final fleet if speed+ is not reached after gearing", ...)
```

---

# 77. Equipment Uniqueness Test

必須有：

```ts
it(
  "never assigns the same equipment instance twice",
  () => {
    const result = solve(...);

    const ids = getAssignedEquipmentIds(
      result,
    );

    expect(new Set(ids).size)
      .toBe(ids.length);
  },
);
```

這是 Critical Invariant。

---

# 78. Fixture Tests

建立 anonymized fixtures：

```text
fixtures/
  account-small.json
  account-midgame.json
  account-endgame.json
```

---

# 79. Fixture: Small Account

目的：

```text
裝備不足時正確 No Solution
```

---

# 80. Fixture: Midgame

目的：

```text
有多種可行解
但沒有全套頂裝
```

確認推薦能 fallback。

---

# 81. Fixture: Endgame

目的：

```text
大量艦娘
大量高改修裝備
```

benchmark 搜尋效能。

---

# 82. Snapshot Import for Debug

開發版加入：

```text
Load Snapshot Fixture
```

使 Agent 不需要真的登入艦娘帳號即可開發 Solver。

這個功能非常重要。

---

# 83. Golden Tests

特定 fixture：

```text
account-midgame
+ 5-5
+ boss-clear
```

輸出可以 snapshot：

```text
top candidate ship IDs
constraint status
score dimensions
```

不要 snapshot 所有 UI HTML。

---

# 84. Regression Tests

任何：

```text
Map Rule Change
Formula Change
Solver Change
```

不能造成：

```text
illegal fleet
duplicate equipment
NaN score
negative impossible metric
```

---

# 85. Property Tests

如果有 fast-check：

```text
任意 account inventory
```

Invariant：

```text
推薦裝備一定存在帳號
推薦艦娘一定存在帳號
同一艘船不重複
同一件裝備不重複
所有 hard constraints 通過
```

非常適合 Solver。

---

# 86. Observability / Debug

Development Mode 可以輸出：

```text
Candidates generated: 142
Fleet states explored: 4,812
Fleet states pruned: 31,042

Gear states explored: 25,302
Gear states pruned: 182,113

Total:
823ms
```

Production UI 不顯示。

---

# 87. Solver Debug Explain

推薦結果保留 debug trace：

```ts
interface SolverDebugInfo {
  readonly fleetCandidatesGenerated: number

  readonly fleetStatesExplored: number

  readonly gearStatesExplored: number

  readonly elapsedMs: number
}
```

只在：

```text
development
```

或 advanced toggle 顯示。

---

# 88. Recommended Reason Codes

不要只保存中文 string。

使用：

```ts
type RecommendationReasonCode =
  | 'HIGH_AIR_MARGIN'
  | 'HIGH_LOS_MARGIN'
  | 'SPECIAL_ATTACK_AVAILABLE'
  | 'STRONG_NIGHT_CI'
  | 'LOW_RESOURCE_COST'
  | 'HIGH_SURVIVABILITY'
```

UI 再 translation。

---

# 89. Localization

Domain 不放中文。

例如：

```ts
{
  code: "HIGH_AIR_MARGIN",
  params: {
    airPower: 428,
    required: 391,
  },
}
```

UI：

```text
制空值 428，高於建議值 391。
```

---

# 90. Route Rule Source Metadata

每個 Route：

```ts
metadata: {
  source: 'kancolle-browser-derived' | 'wiki' | 'manual'

  confidence: 'verified' | 'community' | 'experimental'

  lastVerified: '2026-08-22'
}
```

原因：

艦娘規則可能更新。

---

# 91. Rule Update Workflow

未來新增通常海域：

```text
Research
↓
Add RouteTemplate
↓
Fixture
↓
Rule Tests
↓
Solver Regression
↓
UI Enable
```

---

# 92. External Rule Import

可以開發：

```text
scripts/import-map-recommendations.ts
```

將 external schema：

```text
map_recommendations.json
```

轉為 internal schema。

不要 runtime 直接依賴外部 repository 檔案格式。

---

# 93. Internal Rule Format Must Be Stable

外部：

```text
schema A
```

未來改了，不應破壞 Solver。

流程：

```text
External Data
↓
Importer
↓
Internal RouteTemplate
↓
Solver
```

---

# 94. UI Information Architecture

Recommendation Page：

```text
┌───────────────────────────────┐
│ 艦隊推薦                      │
├───────────────────────────────┤
│ Account                       │
│ Ships 248 / Equipment 1384    │
│                               │
│ Map                           │
│ [5-5 ▼]                       │
│                               │
│ Objective                     │
│ [Balanced ▼]                  │
│                               │
│ Advanced                      │
│ [ ] 保留第一艦隊裝備          │
│ [ ] 排除活動貼條艦            │
│                               │
│ [產生推薦]                    │
├───────────────────────────────┤
│ Recommendation A              │
│ Recommendation B              │
│ Recommendation C              │
└───────────────────────────────┘
```

---

# 95. UX Requirement

推薦結果需要讓玩家快速回答：

```text
我要換哪些船？
我要裝哪些裝備？
路線是什麼？
制空夠嗎？
索敵夠嗎？
為什麼推薦這組？
```

不需要一開始顯示 Solver 細節。

---

# 96. Equipment Movement UX

未來很有價值：

```text
換裝清單
```

例如：

```text
1. 從 赤城改二 移除 烈風改二 #3211
2. 裝到 加賀改二戊 Slot 3
3. 從 第一艦隊 矢矧 移除 水雷見張員 #8912
4. 裝到 雪風改二 增設槽
```

MVP 可先不做自動 sequence optimizer。

但 data model 要保留 instance ID。

---

# 97. Do Not Auto Equip

即使未來能操作 DOM，也不在這個專案初期做。

只輸出：

```text
Equipment Plan
```

---

# 98. API Layer

Renderer 只呼叫 Application API：

```ts
interface RecommendationService {
  syncAccount(): Promise<AccountSnapshot>

  recommendFleet(input: RecommendFleetRequest): Promise<RecommendFleetResult>
}
```

UI 不直接 import Solver internals。

---

# 99. RecommendFleetResult

```ts
export type RecommendFleetResult =
  | {
      readonly status: 'success'

      readonly recommendations: readonly FleetRecommendation[]
    }
  | {
      readonly status: 'no-solution'

      readonly analysis: NoSolutionResult
    }
  | {
      readonly status: 'error'

      readonly error: RecommendationError
    }
```

---

# 100. Error Type

```ts
export type RecommendationError =
  | {
      code: 'KC3_UNAVAILABLE'
    }
  | {
      code: 'KC3_SCHEMA_INVALID'
    }
  | {
      code: 'RULE_NOT_FOUND'
    }
  | {
      code: 'SOLVER_FAILED'
      cause?: unknown
    }
```

---

# 101. Logging

使用 structured logging：

```ts
logger.info('recommendation.completed', {
  mapId,
  objective,
  elapsedMs,
  candidateCount,
})
```

禁止 log：

```text
cookie
credentials
DMM session
```

---

# 102. Phase 0 — Technical Spike

目標：

> 證明 Damecon 可以可靠讀取 KC3 帳號資料。

Agent 必須完成：

- clone / run Damecon
- 找到 KC3 Strategy Room BrowserView / webContents lifecycle
- 證明能取得 KC3 ships
- 證明能取得 KC3 gears
- 證明 masterId / instanceId 不混淆
- 證明改修值可取得
- 證明熟練度可取得
- 建立 normalized DTO
- 輸出 anonymized fixture

Deliverable：

```text
docs/kc3-bridge-spike.md
```

以及：

```text
fixtures/account-sample.json
```

---

# 103. Phase 0 Acceptance Criteria

必須可以在 dev console：

```ts
const snapshot = await recommendationService.syncAccount()

console.log(snapshot.ships.length)

console.log(snapshot.equipment.length)
```

且：

```text
ships > 0
equipment > 0
```

抽樣 5 艘艦娘：

```text
KC3 UI
vs
Snapshot
```

一致。

抽樣 10 件裝備：

```text
name
master ID
improvement
proficiency
```

一致。

---

# 104. Phase 1 — 5-5 Vertical Slice

完成：

```text
KC3 Snapshot
↓
5-5 Rule
↓
Fleet Candidate
↓
Equipment Assignment
↓
Metrics
↓
Top 3
↓
UI
```

---

# 105. Phase 1 Scope

至少：

- 一條 5-5 route template
- ship candidate filtering
- Fleet Beam Search
- Equipment uniqueness
- basic air power
- basic LOS
- speed validation
- objective score
- Top 3 result
- No Solution
- UI card

---

# 106. Phase 1 Acceptance Criteria

對 fixture：

```text
midgame
```

結果：

```text
status = success
```

每組推薦：

```text
6 unique ships
all equipment IDs unique
all equipment owned
all ships owned
route constraints pass
LOS constraint pass
air constraint pass
speed constraint pass
```

---

# 107. Phase 2 — Normal Maps

擴展：

```text
1-1 ~ 7-5
```

工作主要變成：

```text
Rule Data
```

而不是 Solver architecture。

---

# 108. Phase 2 Deliverables

- map selector 全通常海域
- route selector
- route recommendation
- static rule import script
- rule source metadata
- regression suite

---

# 109. Phase 3 — Quality

加入：

- equipment movement penalty
- multiple objectives
- custom exclusion
- lock ship
- lock equipment
- better role scoring
- recommendation compare
- snapshot persistence
- performance worker

---

# 110. Phase 4 — Event Prototype

另外建立：

```text
EventRuleEngine
```

不要污染 NormalMap rules。

---

# 111. Event Future Model

需要：

```ts
interface EventMapContext {
  readonly eventId: string
  readonly mapId: string
  readonly difficulty: '甲' | '乙' | '丙' | '丁'

  readonly phase: string

  readonly unlockedMechanics: readonly string[]
}
```

---

# 112. Event Ship Tag

```ts
interface EventTagConstraint {
  readonly allowedTags?: readonly number[]

  readonly forbiddenTags?: readonly number[]
}
```

---

# 113. Historical Bonus Future

```ts
interface ShipBonus {
  readonly shipMasterId: ShipMasterId

  readonly nodeId?: string

  readonly multiplier: number

  readonly confidence: 'confirmed' | 'estimated'
}
```

---

# 114. Agent Implementation Rules

所有 Agent 必須遵守：

1. 不直接在 UI 寫 Solver logic。
2. 不直接從 Solver 存取 KC3 global。
3. 所有 ID 使用 instance/master type 區分。
4. 不可重複使用 equipment instance。
5. Hard Constraint 不使用 score 模擬。
6. External map rules 必須 normalize。
7. 所有新公式必須有 test。
8. 所有新 route rule 必須有 fixture test。
9. 不新增自動操作遊戲功能。
10. 不為了「推薦看起來合理」寫 random fallback。

---

# 115. Type Safety Requirements

禁止大量：

```ts
any
```

KC3 raw boundary 可以：

```ts
unknown
```

然後 parser：

```ts
function parseKC3Ship(value: unknown): OwnedShip
```

推薦：

```text
Zod
```

驗證 IPC/raw data。

---

# 116. Branded IDs

為防止：

```text
masterId
instanceId
```

混用，推薦：

```ts
type Brand<T, B extends string> = T & {
  readonly __brand: B
}

type ShipInstanceId = Brand<number, 'ShipInstanceId'>

type ShipMasterId = Brand<number, 'ShipMasterId'>

type EquipmentInstanceId = Brand<number, 'EquipmentInstanceId'>

type EquipmentMasterId = Brand<number, 'EquipmentMasterId'>
```

如果現有 TS architecture 不方便，至少命名必須完整。

---

# 117. Immutable Domain

推薦 Domain 使用：

```text
readonly
```

Solver state 需要 mutable optimization 時，可以內部使用 mutable structure。

但 outward API 必須 immutable。

---

# 118. Pure Function Preference

例如：

```ts
evaluateConstraint(fleet, constraint)
```

應為 pure function。

便於：

- test
- cache
- parallel
- debug

---

# 119. No Hidden Global Config

不要：

```ts
const AIR_WEIGHT = window.settings.airWeight
```

改：

```ts
evaluateFleet({
  fleet,
  weights,
})
```

---

# 120. Versioning

Snapshot：

```ts
metadata.schemaVersion
```

Rule：

```ts
ruleVersion
```

Solver：

```ts
SOLVER_VERSION
```

推薦結果 debug 可記錄：

```text
solver 0.1.0
rules 2026-08-22
snapshot schema 1
```

---

# 121. Reproducible Bug Report

未來 bug：

```text
為什麼 5-5 把 +10 五連酸素魚雷給錯人？
```

應可 export：

```text
Anonymized Snapshot
Map
Route
Preferences
Solver Version
```

在 developer machine replay。

---

# 122. Security

Electron 特別注意：

- 不 expose generic node API
- IPC whitelist
- no arbitrary eval from renderer
- no credential read
- minimize contextBridge surface
- validate IPC payload

---

# 123. KC3 Compatibility

KC3 更新可能改：

```text
object shape
storage
global name
```

所以：

```text
KC3Adapter
```

必須是 Anti-Corruption Layer。

例如：

```text
KC3 v35
       │
       ▼
KC3Adapter
       │
       ▼
AccountSnapshot v1
       │
       ▼
Recommendation Core
```

KC3 升級時只修 Adapter。

---

# 124. Capability Detection

Bridge 啟動時：

```ts
interface KC3Capabilities {
  readonly accountShips: boolean
  readonly accountEquipment: boolean
  readonly masterData: boolean
  readonly currentFleet: boolean
}
```

UI 可回報：

```text
KC3 版本目前不支援取得裝備熟練度。
```

而不是 crash。

---

# 125. Rule Confidence UI

如果 route rule：

```text
experimental
```

顯示：

```text
此路線規則仍屬實驗資料。
```

一般確認規則不需要干擾使用者。

---

# 126. User Override

未來可以：

```text
必須使用：
最上改二特

不要使用：
大和
武藏
```

Solver 直接轉 constraint。

---

# 127. Why Top-N

不要只顯示一組。

因為玩家可能：

- 不想動某件裝備
- 不想用高消耗船
- 想練船
- 某艘正在遠征

所以：

```text
Top 3
```

較實用。

---

# 128. Diversity

Top 3 不應只是：

```text
方案 A：雪風
方案 B：雪風同裝備，只換一顆 0 星砲
方案 C：雪風同裝備，只換順序
```

需要：

```text
diversity penalty
```

---

# 129. Recommendation Deduplication

可以建立 Fleet Signature：

```ts
function fleetSignature(recommendation: FleetRecommendation): string
```

基本：

```text
sorted ship IDs
```

相同船組但小幅裝備差：

```text
near duplicate
```

最多留 1~2。

---

# 130. Diversity Score

第二／第三推薦：

```text
score
-
similarityPenalty
```

讓方案具備實質差異。

---

# 131. User-facing Score

不應暗示：

```text
86 = 86% 勝率
```

除非未來真的有 Monte Carlo。

UI 用：

```text
綜合評分 86
```

不要：

```text
勝率 86%
```

---

# 132. Cost Estimate

第一版可以使用：

```text
ship base fuel/ammo
```

估算 fleet cost。

若沒有 sortie model：

```text
relative cost
```

輸出：

```text
Low
Medium
High
```

比虛假的精確數字好。

---

# 133. Source-of-Truth Policy

優先：

```text
KC3 / game master data
```

其次：

```text
trusted static rule data
```

不要使用：

```text
LLM memory
```

作為導航公式 source of truth。

---

# 134. Data Update

每次 KC3 refresh 後：

```text
AccountSnapshot
```

可以 invalidates recommendation cache。

---

# 135. Current Fleet Awareness

未來可加入：

```text
推薦優先保持當前編成
```

Score：

```text
ship movement cost
equipment movement cost
```

---

# 136. Potential Advanced Feature

推薦後：

```text
一鍵複製 Deck Builder 格式
```

例如外部模擬器格式。

不是 MVP，但 Domain output 應足夠轉換。

---

# 137. Potential Share Feature

可分享：

```text
Recommendation JSON
```

但需 anonymize。

---

# 138. Potential Historical Learning

未來可記錄：

```text
推薦 A
實際出擊
S 勝 / A 勝 / 撤退
```

利用本地資料調整 heuristic。

不是 MVP。

---

# 139. 不建議的架構

## 139.1 直接把所有規則寫 React

禁止：

```tsx
if (
  map === "5-5" &&
  battleships.length <= 2
) {
  ...
}
```

---

## 139.2 AI 直接產編成

禁止核心流程：

```text
inventory
→ GPT
→ recommendation
```

---

## 139.3 每艘船獨立配裝

禁止：

```text
for ship:
  chooseBestEquipment()
```

---

## 139.4 重寫 KC3 API capture

不要在沒有必要前重做。

---

## 139.5 Master / Instance ID 混用

Critical bug。

---

# 140. Suggested First PR Sequence

## PR 1

```text
feat(recommendation):
add domain types
```

包含：

- AccountSnapshot
- OwnedShip
- OwnedEquipment
- RouteTemplate
- Recommendation types

無 UI。

---

## PR 2

```text
feat(kc3-bridge):
read account snapshot
```

包含：

- bridge
- adapter
- schema validator
- fixture export

---

## PR 3

```text
feat(map-rules):
add 5-5 route model
```

包含：

- RouteTemplate
- Constraint Engine
- unit tests

---

## PR 4

```text
feat(fleet-solver):
add role candidate and beam search
```

---

## PR 5

```text
feat(gear-solver):
add global equipment assignment
```

---

## PR 6

```text
feat(metrics):
add air power and los
```

---

## PR 7

```text
feat(recommendation):
add evaluator and top-n
```

---

## PR 8

```text
feat(ui):
add recommendation page
```

---

# 141. Definition of Done — MVP

MVP Done 必須全部符合：

- [ ] Damecon 可取得 KC3 account snapshot
- [ ] Snapshot 有實際艦娘
- [ ] Snapshot 有實際裝備
- [ ] 裝備 improvement 正確
- [ ] 裝備 proficiency 正確
- [ ] master ID 與 instance ID 分離
- [ ] 5-5 至少一條 route rule
- [ ] FleetSolver 有 deterministic output
- [ ] GearSolver 不重複使用裝備
- [ ] GearSolver 檢查可裝備性
- [ ] 最終 speed constraint 正確
- [ ] 最終 air power 可計算
- [ ] 最終 LOS 可計算
- [ ] 所有 Hard Constraints 重新驗證
- [ ] 可以輸出 Top 3
- [ ] Top 3 有 diversity
- [ ] 無解時提供原因
- [ ] UI 可看每艘艦的 exact equipment
- [ ] 可以手動 refresh KC3 snapshot
- [ ] Solver 不阻塞 UI
- [ ] 核心有 fixture regression tests
- [ ] 不包含自動遊戲操作

---

# 142. Agent 驗收指令

Agent 完成一個功能後，必須回報：

```text
Changed:
- ...

Tests:
- ...

Assumptions:
- ...

Known limitations:
- ...

Next:
- ...
```

禁止只回：

```text
Done
```

---

# 143. Agent 對不確定規則的處理

如果 Agent 不確定：

```text
5-5 導航條件
某裝備 bonus
特殊攻擊觸發條件
```

不得猜測。

必須：

1. 標記 `TODO(rule-source)`
2. 尋找可靠來源
3. 新增 source metadata
4. 用 test 固化
5. 才 merge

---

# 144. Research Sources

主要研究基礎：

```text
Damecon Browser
https://github.com/planetarian/damecon-browser

KC3Kai
https://github.com/KC3Kai/KC3Kai

KanColle Browser
https://github.com/shichiria/kancolle-browser

KanColle Browser Data Flow
https://github.com/shichiria/kancolle-browser/blob/main/docs/SPEC/data-flow.md

KanColle Browser Map Recommendations
src-tauri/data/map_recommendations.json
```

Research observation：

- Damecon 已提供 KC3Kai 整合與 Strategy Room workflow。
- KC3Kai 是帳號狀態與 master data 的優先資料來源。
- `kancolle-browser` 已有通常海域 1-1～7-5 推薦 route checker，可作為 Rule DB schema 與資料整理參考。
- `kancolle-browser` 自身採 API interception，但本專案因已依賴 KC3/Damecon，不應一開始重複建立 interception layer。
- 本專案核心差異在「帳號 inventory aware + global equipment assignment + optimization」。

---

# 145. 最終 Architecture Decision

第一版 Architecture Decision Record：

```text
ADR-001

Decision:
Use KC3Kai as the account-data provider.

Decision:
Use a normalized TypeScript domain model between KC3 and Solver.

Decision:
Implement recommendation as deterministic Constraint + Search engine.

Decision:
Separate FleetSolver and GearSolver.

Decision:
Treat equipment as unique account-owned instances.

Decision:
Use 5-5 as the first end-to-end vertical slice.

Decision:
Do not automate gameplay.

Decision:
Do not use LLM as the recommendation authority.
```

---

# 146. Agent 最優先執行事項

Agent 接手此專案時，請不要先做漂亮 UI。

執行順序必須是：

```text
1. 跑起 damecon-browser
2. 確認 KC3 Strategy Room runtime
3. 找出最穩定 account state bridge
4. 輸出 AccountSnapshot fixture
5. 建立 Domain types
6. 建立 5-5 rule
7. 建 FleetSolver
8. 建 GearSolver
9. 建 Metrics
10. 最後才接 UI
```

如果第 3 步尚未證明：

```text
ships
gears
master data
```

可以可靠取得，不要直接做完整 UI。

---

# 147. 最小成功 Demo

Demo 流程：

```text
使用者啟動 Damecon
↓
KC3 正常取得帳號資訊
↓
打開「艦隊推薦」
↓
顯示：
艦娘 248
裝備 1384
↓
選：
5-5
Boss Clear
↓
Generate
↓
顯示 3 組方案
↓
點方案 A
↓
顯示：
6 艘實際艦娘
每艘 exact equipment instance
路線
制空
索敵
推薦原因
警告
```

如果這個流程成立，MVP 即證明核心產品價值。

---

# 148. 產品核心價值

現有攻略通常回答：

```text
這張圖理論上應該用什麼。
```

本專案要回答：

```text
以「我現在這個帳號」
有哪些艦娘與裝備的前提下，
我現在應該怎麼打。
```

因此，任何功能決策都應優先強化：

```text
Account Awareness
Correctness
Constraint Safety
Equipment Allocation
Explainability
```

而不是增加與核心無關的 browser feature。

---

# 149. Final Principle

推薦引擎的優先順序：

```text
合法
>
可實際組成
>
穩定
>
高分
>
漂亮
```

如果沒有合法解：

```text
清楚告訴使用者缺什麼
```

比生成一組看似合理但實際歪航／裝備不存在的編成更重要。
