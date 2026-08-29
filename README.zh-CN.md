# <img src="./packages/shell/browser/ui/assets/icons/logo.png" alt="KanColle Assistant 图标" width="48"> kancolle-assistant

[English](./README.md) · [繁體中文](./README.zh-TW.md) · **简体中文** ·
[日本語](./README.ja.md)

KanColle Assistant 是一款专为游玩《舰队 Collection》设计的精简标签页式浏览器，集成
KC3Kai 与 KCCacheProxy 支持。

本项目是原作者 planetarian 的 [damecon-browser](https://github.com/planetarian/damecon-browser) 修改分支。<br>
Damecon 原项目基于 Samuel Maddock 的 [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell)。

## 版本状态

| 应用程序版本 | README 更新日期 |
| ------------ | --------------- |
| `v1.0.8`     | `2026-08-29`    |

- **下载版本：** 安装程序和便携式压缩包可从
  [GitHub Releases](https://github.com/kevinsuu/kancolle-assistant/releases)下载。
- **单一版本的变更：** [最新版本更新日志](https://github.com/kevinsuu/kancolle-assistant/releases/latest)
  会保存每个 tag 之间自动生成的更新内容。
- **当前累积能力：** [功能状态](#功能状态)分别列出当前支持、将来可能加入和不在计划内的项目。
- **功能技术细节：** 下方项目功能重点会链接至对应文档。

### v1.0.8 更新重点（相比 v1.0.7）

- 普通海域推荐新增行飞巴哈图文攻略中 1-4 至 6-5 的 30 套不重复配置，以及两套经过审查的
  4-1 KCWiki 替代方案。每套配置单独保存来源，未完整建模的出击条件保留人工提示，不会为旧
  图文配置放宽当前路线或装备限制；3-4 航母练级路线也修正为 A-C-E-G-J-P。
- 项目新增 `kancolle-stage` 项目 skill，用于导入后续攻略网址与配置图片；流程会检查重复、
  验证当前关卡条件，并在来源或图片无法可靠读取时明确向用户提问。

### v1.0.7 更新重点（相比 v1.0.6）

- 扩展测试运行器现在直接声明命令行解析器依赖，使干净的 Windows release 构建能够执行完整的 Electron 扩展测试套件。

### v1.0.6 更新重点（相比 v1.0.5）

- 普通海域推荐改为只在用户选择附来源的攻略模板后即时计算；读取大型 KC3 账号时仍保持战略室响应，并以攻略优先的结果与有界诊断取代隐藏的全海域预载。
- 舰队求解器改用各海域独立规则模块，加强高速＋与航母舰载机分配、完整持有装备验证，以及 KC3 战斗公式重排，让合法方案与失败原因更清楚。
- 远征规划改以归一化每小时效率比较完整舰队组合，支持优化、至少收支平衡与忽略资源，纳入收取间隔及补给成本，并提供可选用的优化调试报告。
- 资源中心新增 1、5、30 分钟活动区间、可强制刷新的快照复用，以及更清楚的获取、消耗、来源与库存历史显示。
- 启动时不再把游戏放大超过原生比例；默认浏览器界面改用中性色，且本地打包缺少 KCCacheProxy 缓存时会明确警告而不直接失败。

### v1.0.5 更新重点（相比 v1.0.4）

- 4-5 自动推荐现在会验证混合对陆配置：不重复的账号持有三式弹、KC3 判定的航母对陆攻击机、轻巡驱逐最短路线、高速＋栏位冲突及明确的失败原因。
- 所有普通海域推荐现在会用 KC3 当前完整配装公式，按舰娘别／组合加成、改修、适重命中，以及水上、反潜或对陆有效火力重新排序；4-5 高速＋战舰航母也拆成两种完整验证比例，不再需要手动确认。
- 舰队推荐会沿用已同步的 KC3 快照及相同的完成计算，直到用户明确重新同步；地图与路线控制也不再等待首次账号数据提取。
- 普通装备栏位现在一定生成完整合法配装，理想装备不足时改用舰种安全的次佳兼容装备；2-5 北路与 5-5 南路也会验证不同舰娘各自携带的运输桶数量。
- 2-1 现在会将 KC3 当前水上战斗机与相关装备分类应用到所有关卡，并新增航母进王替代编成、E 点固定高速建造材回收路线，以及覆盖 37 张普通海域主要路线的生成验证。
- 自动 Top 3 现在会在整张地图没有完整验证替代路线时，自动改为比较可计算但带警告的路线；7-4 等地图不再只是为了生成配队就要求先手动选择路线。
- KC3 每日改修页面现在默认启用原生的可改修装备筛选；用户仍可切回完整列表。

### v1.0.4 更新重点（相比 v1.0.3）

- 4-5 自动推荐现在会为兼容舰娘保留三件不重复的账号持有三式弹系装备；若无法成立，也会显示明确原因。
- KC3 每日改修页面现在默认启用原生的可改修装备筛选；用户仍可切回完整列表。

### 本项目功能重点

与原版相比，当前源代码新增或优化了以下功能：

1. **[账户访问优化](./docs/dmm-local-login-storage.md)** — 经用户确认后，可通过操作系统安全存储机制加密保存 DMM 登录信息；同时提供可信外部转发代理的全流量模式和地区错误提示。
2. **[自适应游戏画面](./docs/display-auto-fit.md)** — 游戏启动时根据 KC3 实际内容调整面板宽度，再以屏幕剩余空间自动调整窗口和舰娘画布；之后拉伸窗口时会尽可能完整显示游戏，且不锁定窗口宽高比。
3. **[普通海域舰队推荐](./docs/fleet-recommender.md)** — 在 KC3 战略室为 1-1 至 7-5（含 5-6）选择附来源的攻略模板后，即时计算最多三套账号持有舰队；不会自动更改游戏状态。
4. **[远征推荐](./docs/expedition-resource-planner.md)** — 战略室中独立的**远征推荐**页面会显示当前资源，并根据归一化每小时效率后的四项资源与水桶权重、已勾选远征、成功与大发设置及第 2～4 舰队状态，推荐一套最佳配对；不会修改原有远征评分页面，也不会自动派遣。
5. **[资源中心与收支摘要](./docs/resource-ledger-summary.md)** — 新增 KC3 战略室**资源中心**仪表板，可按今天、昨天或最近 24 小时查看当前资源、获取、消耗、净变化、每小时收支、来源分类与消耗品。
6. **[KC3 开发者工具集成](./docs/kc3-devtools.md)** — 打开游戏开发者工具时，优先排列并选中 KC3 的 `KanColle` 面板，减少重复手动切换。
7. **[战略室置顶链接](./docs/strategy-room-recent-tabs.md)** — 最多可将五个战略室标签页置顶到 `常用链接`；普通导航不会改变顺序，第六个置顶项会替换最下方链接。
8. **[每日改修筛选](./docs/daily-improvement-filter.md)** — KC3 每日改修页面默认应用一次原生的可改修装备筛选，并新增只包含当天可改修装备类别的横向筛选；原生切换按钮仍可查看完整列表。

这些新增的战略室界面会跟随 KC3 选择的语言，支持英文、繁体中文、简体中文和日文。

## ⚠️ 注意事项

#### KanColle Assistant 不适合作为通用浏览器。

KanColle Assistant 只为一个目的而设计：游玩《舰队 Collection》。

KanColle Assistant 基于 Electron，缺少主流浏览器所具备的许多安全功能。本项目仍可能
存在尚未发现的问题与技术限制。

#### 如果使用 KanColle Assistant 处理任何敏感信息，风险须由用户自行承担。

## 使用方式

### 使用 Release 版本

前往 [Releases 页面](https://github.com/kevinsuu/kancolle-assistant/releases/latest)，下载以下
其中一种文件：

安装程序：`kancolle-assistant-*.Setup.exe`

- 下载后直接运行即可安装。
- 安装版支持 KanColle Assistant 自动更新，也是最简单的使用方式。

或下载压缩包：`kancolle-assistant-*.zip`

- 将文件解压到空文件夹，再运行其中的 `kancolle-assistant.exe`。
- 可以保留指定版本，但不支持自动更新。

### 使用 `yarn` 从源代码启动

```bash
# 获取源代码
git clone --recurse-submodules https://github.com/kevinsuu/kancolle-assistant
cd kancolle-assistant

# 安装并启动浏览器
yarn
yarn start
```

### 🔌 安装扩展程序

放在 `./extensions` 中的未打包扩展程序会自动加载。

- 同时支持 Manifest V2 和 V3 扩展程序。
- 由于部分扩展 API 尚未支持，一些插件可能无法完整运行或完全无法执行。

Release 版本会预装几个常用插件。如果不需要，可以直接删除 `extensions` 文件夹中对应的插件。

### ⚙️ 设置

首次启动时会自动打开设置页面。

KanColle Assistant 会开始下载最新版 KC3Kai；完成后会打开 KC3 起始页面。

随时可以点击窗口左上角的应用程序图标，重新进入 KanColle Assistant 设置页面。

### KC3Kai 更新设置

设置页面中的 KC3Kai 部分可以选择 KC3 的更新方式。

共有三个更新频道：`release`、`master` 和 `develop`。

- 推荐使用最稳定的 `release` 频道。
- `master` 和 `develop` 包含开发中的代码，可能不稳定。
  - 首次使用这两个频道时，下载可能需要数分钟。
- 不同频道会分别存储，并使用各自独立的配置文件。
  - 可以随时切换频道，已经下载的频道不需要重新下载。
  - 切换时会自动卸载旧频道的扩展程序并加载新频道。
  - 如需删除某个频道，删除 `./extensions` 中对应的 `kc3kai-*` 文件夹即可。

### 代理设置

KanColle Assistant 已完整集成 KCCacheProxy，不再需要 ProxySwitchy 等扩展程序。

可以在设置页面的 `Proxy` 部分设置 KCCP 主机和端口。

勾选 `Enabled` 后，舰これ流量会按照所选模式转发到代理；取消勾选则会停用。

`KCCP internal` 和 `KCCP external` 只代理舰これ游戏服务器流量，不会改变 DMM 登录与地区检查所看到的公网 IP。如果要使用经过授权的 HTTP/HTTPS 外部转发代理处理所有浏览器流量，请选择 `all-external`，输入主机与转发代理端口后启用。KanColle Assistant 会重新应用代理、关闭已有连接，并重试被重定向到 DMM 地区限制错误页面的标签页。

KanColle Assistant 不会内置或搜索公共代理。请勿通过不受信任的代理传输 DMM 登录信息。如果当前网络地区本应受支持但仍出现地区限制页面，请关闭意外启用的 VPN、代理或 Private Relay 后重试。

## 功能状态

### ✨ 界面展示

资源中心可汇总当前资源与近期获取、消耗及净变化：

![KC3 战略室资源中心仪表板。](./screenshots/resource-center.png)

远征推荐会显示当前资源，并为可用舰队安排最佳远征：

![KC3 战略室远征推荐页面。](./screenshots/expedition-recommendation.png)

关卡推荐会按照账号持有的舰娘与装备，提供普通海域编成建议：

![KC3 战略室关卡推荐页面。](./screenshots/map-recommendation.png)

### 🚀 当前功能

- [x] 安装程序与应用程序在启动、打开游戏及每六小时自动检查更新
- [x] KC3Kai 集成
- [x] KC3 自动更新
- [x] 同时支持稳定版和开发版 KC3
- [x] 可配置 KC3 更新计划（每天／每周／总是／从不）
- [x] 自动打开 KC3 起始页面、开发者工具与战略室
- [x] 打开游戏开发者工具时优先排列并选择 KC3 `KanColle` 面板
- [x] 完整集成 KCCacheProxy 与代理客户端
- [x] 经授权的外部代理全流量模式与 DMM 地区错误提示
- [x] [预设与自定义浏览器色彩、浅色／深色主题，以及可上传替换的设置页图标](./docs/theme-personalization.md)
- [x] Manifest V3 扩展程序支持
- [x] Chrome 应用商店扩展程序支持
- [x] 新标签页提供常用第三方舰これ资源链接
- [x] 可配置新标签页行为
  - 可选择 KC3 启动页面、DMM 游戏页面或战略室
- [x] 多窗口支持
- [x] 使用 `Custom` 频道管理自定义 KC3 文件夹
- [x] 常用键盘快捷键（F12、Ctrl+T、Ctrl+F4、Ctrl+Tab、Ctrl+D 等）
- [x] 按网站隐藏地址栏并支持通配符
- [x] 常用鼠标操作（中键关闭标签页、拖动标签页、Ctrl+滚轮等）
- [x] 页面查找（Ctrl+F）
- [x] 使用操作系统加密的 DMM 专用本地登录信息保险库
- [x] 可自由拉伸窗口的舰これ游戏画布持续自适应
- [x] 1-1 至 7-5 普通海域的账号舰队推荐，采用附来源的攻略网验证编成骨架，战略室需选择附来源的参考攻略配置、不再提供空白自动路线，并包含完整普通装备栏位、2-1 航母替代编成与高速建造材路线、KC3 当前水战／航空机／炮弹分类、2-5／5-5 运输桶分歧、高速＋装备、补强增设栏位、夜战航母配置、与来源一致的 3-5 上路、潜艇、Nelson Touch、固定与随机下路配置、4-5 高速＋夜母、夜母小船、Nelson Touch 与绕路配置及混合对陆配置的制空优先弹性航母配装、5-5 特殊炮击配对、站位与阵形提示，以及 KC3 完整配装加成与目标别有效火力重排
- [x] 包含舰队配对与权重设置的远征推荐
- [x] KC3 固定近期时间段资源收支摘要
- [x] KC3 战略室最多五个固定排序的置顶链接
- [x] KC3 每日改修页面默认启用可改修装备筛选，并只列出当天可改修的装备类别

### 🤞 将来可能加入

- [ ] 安装 KC3 更新前询问
- [ ] 鼠标悬停链接时显示网址提示
- [ ] 扩展程序管理（启用／停用／卸载）
- [ ] `.CRX` 扩展程序加载器
- [ ] 支持更多常用 [`chrome.*` 扩展程序 API](https://developer.chrome.com/extensions/devguide)
- [ ] 遵循扩展 manifest 权限
  - 再次提醒：这不是安全的通用浏览器

### ❌ 不在计划内

- 可分离标签页
- Chrome／Edge 等通用浏览器的高级功能
  - 包括通用密码管理器及其他安全功能
- 任何形式的 AI 集成（欢迎自行实现）

## 许可证

GPL-3

本仓库是原作者 planetarian 的 [damecon-browser](https://github.com/planetarian/damecon-browser) 修改分支。<br>
Damecon 原项目基于 Samuel Maddock 的 [electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell)。

以下为原项目声明的翻译；正式授权仍以项目许可证文件和原始英文声明为准：

> 如果要将 electron-browser-shell 用于专有软件，请[联系 Samuel Maddock](mailto:sam@samuelmaddock.com?subject=electron-browser-shell%20license)，或按照适当级别在 GitHub [赞助 Samuel Maddock](https://github.com/sponsors/samuelmaddock/)，以取得[专有用途许可证](https://github.com/samuelmaddock/electron-browser-shell/blob/master/LICENSE-PATRON.md)。这些贡献有助于项目持续维护和开发，也表达了对相关工作的支持。

### 贡献者许可协议

提交 Pull Request 即表示您授予 electron-browser-shell 的所有者和用户一项永久、全球性、非独占、免许可费且不可撤销的著作权许可，允许复制、制作衍生作品、公开展示、公开表演、再许可和分发您的贡献及其衍生作品。

damecon-browser 与 electron-browser-shell 项目的所有者也有权重新许可所贡献的源代码及其衍生作品。
