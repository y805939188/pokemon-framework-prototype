# 开发者指南

从[作者指南](user-guide/README.md)可以运行样例或在空白 MZ 工程里制作游戏。这里说明如何修改框架、重建依赖，以及如何判断改动有没有影响游戏。

## 工程与依赖

- 框架面向 RPG Maker MZ + RPGReactor，战斗采用固定提交的 Pokémon Showdown Gen 8。公开玩法入口是单打；引擎能表达的机制，不等于在 MZ 里已有作者入口、交互和存档支持。
- 使用[公开行为规格](https://github.com/y805939188/pokemon-essentials-clean-room/tree/main/spec)、[验收案例](https://github.com/y805939188/pokemon-essentials-clean-room/blob/main/vectors/README.md)和[证据边界](https://github.com/y805939188/pokemon-essentials-clean-room/blob/main/reference/scope-and-evidence.md)实现，不移植原版 Ruby、素材或未授权的数据。战斗内部以固定的 Showdown 为准；参见[战斗维护说明](maintainers/battle.md)。
- MZ 编辑器读取自己的地图和数据库，作者内容由单独的编译器处理。不要直接编辑构建产物来改变规则，或将 MZ 的金币、物品当作框架的持久库存。

## 环境与构建

面向 Apple Silicon Mac。准备 RPG Maker MZ（Steam）、兼容的 arm64 NW.js、Git、Node.js 22.21.1、pnpm 10.20.0。常规回归另需 Python 3。Reactor 运行时、声明和 Showdown 源须符合仓库固定的版本。见 [Reactor 安装](../scripts/versions.env)和 [Showdown 固定版本](../scripts/showdown.env)。

```bash
REACTOR_SOURCE=download ./scripts/bootstrap-mac.sh
./scripts/doctor.sh
```

已有同版本 Reactor 检出时，可令 `REACTOR_SOURCE` 指向它。只有明确启用的非严格开发模式才允许其他版本，不能以此证明成果兼容固定版。引导默认不改 MZ 的全局 NW.js。MZ 素材须来自有权使用的安装，无法确定同名素材的来源时不要覆盖作者的文件。

| 用途 | 命令 |
|---|---|
| 检查类型、导入边界 | `pnpm --dir src typecheck`、`node scripts/check-boundaries.cjs` |
| 构建引擎 | `pnpm --dir src build:engine` |
| 构建并暂存固定 Showdown | `./scripts/build-showdown.sh`；先构建同一份源代码的引擎扩展 |
| 构建样例内容、生产插件、测试插件 | `pnpm --dir src build` |
| 构建开发者 SDK | `pnpm --dir src build:distribution`；见 [SDK 接口](sdk/api.zh.md) |
| 列出常规套件 | `./scripts/test-headless.sh --list` |
| 常规无窗口回归，跳过即失败 | `PF_NO_SKIP=1 ./scripts/test-headless.sh --scope=regular` |
| 快速开发检查 | `./scripts/test-quick.sh` |
| macOS 样例打包 | `./scripts/package-mac.sh`；请勿用 MZ 的「部署」替代。参阅[签名与分发](maintainers/macos-distribution.md) |

改动框架 TypeScript 后须重建引擎。修改 `battle/custom-formats.ts` 或 RPG 行为规则后，还要重新暂存 Showdown 使用的扩展，不能用另一份检出的二进制通过测试。引导完成后使用[作者安装说明](user-guide/integration.md)，不要让框架的样例编译覆盖作者自己的内容。

## 架构与状态所有权

| 模块 | 职责与约束 |
|---|---|
| [rules](../src/framework/rules/) | 无 Node、DOM 和 Showdown；管理成员、背包、成长和持久状态，按稳定内容 ID、形态和成员 ID 工作。 |
| [content](../src/framework/content/) | 校验作者记录、来源与引用，产生规范化内容。形态、招式等由内容身份解析，不从显示名猜。 |
| [battle](../src/framework/battle/) | 引擎请求、能力边界、序列化及行动队列。运行时加载固定 Showdown，不向 UI 泄露引擎对象。 |
| [app](../src/framework/app/) 和 [flow](../src/framework/flow/) | 游戏操作、会话、成长、结果与内容；通过端口与宿主交互，[composition](../src/framework/composition.ts) 将正式战斗接到应用。 |
| [plugins](../src/plugins/) | MZ 插件命令、事件等待、输入、地图、菜单、场景及存读档。宿主呈现失败不重做已提交的业务结果。 |
| [tests](../tests/) 和 [scripts](../scripts/) | 按功能验证规则与实际入口；小样本、替身宿主、真实编辑器运行和发行包是不同层次的证据。 |

战斗期间不原地改玩家存档。引擎拥有对战中的 HP、状态、PP 与临时变化；会话跟踪消费和参与；应用先验证战果，再按 battleId 一次提交。成员的内容 ID＋形态用于存档和图鉴，Showdown 身份用于战斗视图；不能直接互换。终局协议版本、存档 schema、作者输入版本和编译内容版本分别独立。只迁移明确支持的旧档；无法表示时保留原档并拒绝保存，不截断数据。

## 专题与验证

[战斗](maintainers/battle.md) · [训练家 AI](maintainers/trainer-ai.md) · [队伍与存档](maintainers/saves-and-party.md) · [图鉴](maintainers/pokedex.md) · [地图与旅行](maintainers/world.md) · [运行与测试](maintainers/engineering.md)。

普通 Playtest 不是隔离测试。旧 Mac 测试启动脚本会在启动或清理前退出（64），`--ps-save-dir` 不保护真实玩家档。需要隔离启动时请按[隔离启动说明](testing/isolated-launch.md)准备全新目录。窗口出现并不代表地图可交互，写档函数返回也不代表文件和全局索引都落盘。常规无窗口回归不包含冻结的参考回放或 MZ/NW 真机操作。

## 贡献约定

提交源码、可复用的测试与使用文档。不要提交玩家存档、素材缓存、本机路径、密钥或测试执行日志。变更前后用 `git status` 核对，不覆盖他人修改，不擅自更新冻结期望。跨层改动保留对应正例和反例；注明实际运行的命令与尚未覆盖的平台。
