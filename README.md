# Pokémon Framework for RPG Maker MZ

用 RPG Maker MZ 制作宝可梦风格 RPG 的 TypeScript 框架。你在 MZ 里做地图、剧情和事件，在内容文件里定义物种、遇敌和训练家；框架负责战斗、队伍、成长和存档。战斗使用固定版本的 Pokémon Showdown，项目参考 Pokémon Essentials 的行为规格，不移植原版 Ruby 代码。

当前可以用开发样例体验核心流程，也可以用自己的内容搭建工程。**正式 Demo 和配套美术、音频还在准备中。** 这里提供的是开发框架，不是可直接下载的完整游戏。

## 可以做什么

| 功能 | 能用于你的工程 |
| --- | --- |
| 战斗与捕获 | Gen 8 单打，野生遭遇和训练家战。支持选招、换人、使用战斗道具、捕获、逃跑，以及战斗结果和战败回程。 |
| 队伍与成长 | 领取初始成员、治疗、经验与升级、学招、忘招、进化、事件交易和队伍详情。 |
| 道具与进度 | 背包、商店、金钱、徽章、PC 仓库、图鉴和名人堂。可以用事件查询徽章来控制地图或剧情门槛。 |
| 地图与界面 | 配置地图遇敌、回家位置和场地行为；使用暂停菜单、选项、操作帮助、对话、选择项、数字和文字输入。部分界面和媒体使用占位资源。 |
| 存档 | 随 MZ 存读档保存框架状态，支持手动档位和 MZ 自动存档，并对支持范围内的旧框架存档提供迁移和诊断。 |
| 内容工具 | 从作者提供的 JSON 编译工程内容，核对内容身份，生成盘点报告，并把结果安装到指定的 MZ 工程副本。 |

双打不在当前范围。Windows 和 Intel Mac 不在当前已验证的使用路径；正式 Mac 下载包的 Developer ID 签名、公证和下载后验收另行安排。

## 快速上手

当前上手路径是 **Apple Silicon Mac + RPG Maker MZ（Steam 版，兼容的 arm64 NW.js）**。准备 Git、Node.js 22.21.1 和 pnpm 10.20.0；首次准备需要下载固定依赖。运行常规无界面测试还需要 Python 3。

```bash
git clone https://github.com/y805939188/pokemon-framework-prototype.git
cd pokemon-framework-prototype
REACTOR_SOURCE=download ./scripts/bootstrap-mac.sh
```

引导脚本会在当前检出准备并构建依赖和样例，使用你本机有权使用的 MZ 基础素材，**默认不替换 MZ 的全局 NW.js**。准备完成后，用 MZ 打开 `game.rmmzproject`，点击「测试游戏」并选择「新游戏」。与起点附近的样例事件对话领取初始队伍，再去左侧草丛尝试遇敌。样例用于体验框架，不是正式 Demo。

要做自己的游戏，从[作者上手指南](docs/user-guide/README.md)开始。指南会带你准备独立工程和内容，接好第一个领取、战斗与徽章事件，并检查存读档。

## 项目如何组成

| 路径 | 职责 |
| --- | --- |
| [`src/framework/`](src/framework/) | TypeScript 核心。规则层管理队伍、道具、成长和持久状态；应用层协调游戏流程，战斗适配层连接 Showdown。 |
| [`src/plugins/`](src/plugins/) | MZ 的接入层。把框架功能提供为插件命令、菜单和场景，并与 MZ 的输入、地图、事件及存档连接。RPGReactor 提供宿主运行与呈现。 |
| [`data/`](data/) / [`content/sample/`](content/sample/) | MZ 开发样例和作者 JSON 样例。地图与事件在 MZ 中编辑；物种、训练家等内容由工具单独编译。 |
| [`scripts/`](scripts/) / [`experiments/`](experiments/) | 安装、编译、打包、检查和回归测试。它们不是游戏内容。 |

## 文档

- [作者上手指南](docs/user-guide/README.md)：试玩样例、接入自己的工程、编译内容和配置第一个事件。
- [作者命令参考](docs/step5/commands.md)：查队伍、背包、战斗、进化、交易、地图和界面命令。历史验证命令不用于当前构件。
- [接入清单与验证边界](docs/step6/README.md)：复制哪些运行时文件、插件顺序，以及如何区分普通运行和隔离测试。
- [分发清单](docs/step5/distribution.md)：打包、素材来源与使用条件。不要把本机的第三方素材当成仓库已授权的发布资产。
- [开发者指南](docs/PROJECT-GUIDE.md) · [GitHub Actions](https://github.com/y805939188/pokemon-framework-prototype/actions)：构建、贡献和当前提交的自动检查。无界面 CI 不等于真实 MZ/NW.js 或玩家下载包验收。
