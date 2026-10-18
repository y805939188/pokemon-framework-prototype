# RPG Maker MZ + RPGReactor + TypeScript

一个使用 TypeScript 开发 RPG Maker MZ 插件的项目模板，适用于 **macOS Apple Silicon**。

你可以继续在 MZ 中编辑地图、数据库、事件和插件参数，用 TypeScript 编写插件，再通过 MZ 的 Playtest 测试游戏。模板使用 RPGReactor 作为游戏运行时，并配好 Vite 构建、引擎类型提示和初始化脚本。

## 模板包含什么

- **RPGReactor 运行时**：替换项目中的 MZ 默认运行时，使用 PixiJS 8。
- **TypeScript 开发环境**：安装引擎类型声明，提供代码补全和类型检查。
- **Vite 构建**：将 TypeScript 编译到 `js/plugins/`，支持监听文件变化和生成 Source Map。
- **MZ 插件管理器支持**：继续在 MZ 中配置和启用插件。
- **初始化脚本**：准备 NW.js、引擎、MZ 默认资源和开发依赖。
- **粒子示例插件**：`RR_Pixi8Particles` 展示 TypeScript 插件与 PixiJS 8 的基本用法。

## 使用前准备

- Apple Silicon Mac。当前安装脚本不支持 Intel Mac、Windows 或 Linux。
- 已安装并持有 RPG Maker MZ。
- Git、Node.js 22 或更新版本、pnpm 10.20.0。
- 一份包含 `types/` 声明及配套类型工具的 RPGReactor 本地源码。

当前默认的远程源码快照尚未包含类型声明，首次安装需要通过 `REACTOR_SOURCE` 指定本地源码。配套的 `types/tools/typecheck.cjs` 需要支持 `--compiler-root` 参数。

## 快速开始

使用此模板创建自己的仓库，克隆到本地后，在项目根目录运行：

```bash
REACTOR_SOURCE="/path/to/RPGReactor" ./scripts/bootstrap-mac.sh
```

将 `/path/to/RPGReactor` 替换为你的 RPGReactor 源码目录。安装成功后，脚本会在本地记住这个路径，后续可以直接运行 `./scripts/bootstrap-mac.sh`。

脚本默认查找 Steam 安装的 MZ。如果你的安装位置不同，可以同时指定：

```bash
MZ_APP="/path/to/RPGMZ.app" \
REACTOR_SOURCE="/path/to/RPGReactor" \
./scripts/bootstrap-mac.sh
```

**NW.js 会安装到 MZ 应用内部。** 初始化默认使用 NW.js **0.117.0 SDK（ARM64）**，先备份，再替换 `RPGMZ.app/Contents/Resources/nwjs-mac`。这会影响使用该 MZ 安装启动的所有项目 Playtest。备份默认保存在 `~/Documents/RPGMZ-NWJS-Backups/`；Steam 或 MZ 更新可能覆盖这次替换。

如果已经准备好兼容的 NW.js，可以跳过这一步：

```bash
REACTOR_SOURCE="/path/to/RPGReactor" ./scripts/bootstrap-mac.sh --skip-nwjs
```

初始化完成后，用 RPG Maker MZ 打开 `game.rmmzproject`，即可编辑项目和运行 Playtest。

## 编写插件

在项目根目录启动自动构建：

```bash
pnpm --dir src dev
```

修改 `src/plugins/` 下的插件源码并保存，Vite 会自动更新构建结果。随后在 MZ 中重新运行 Playtest，查看效果。

模板中的示例文件：

| 文件 | 用途 |
|---|---|
| `src/plugins/RR_Pixi8Particles.ts` | 插件代码 |
| `src/plugins/RR_Pixi8Particles.meta.txt` | 插件说明、参数和命令定义 |
| `js/plugins/RR_Pixi8Particles.js` | 构建生成的插件 |

**当前构建配置只有这个示例入口。** 新增独立插件时，需要在 `src/vite.config.mts` 中配置对应入口、输出文件和插件说明，再在 MZ 插件管理器中启用。仅新增一个 `.ts` 文件不会自动生成独立插件。

引擎声明安装在 `src/vendor/rpgreactor/types/`，已接入类型检查。项目自己的补充声明放在 `src/types/`。目前引擎声明尚未覆盖所有 API，开发时可以按需补充。

常用命令：

```bash
pnpm --dir src typecheck  # 准备类型声明并检查代码
pnpm --dir src build      # 构建一次
pnpm --dir src dev        # 监听变化并持续构建
```

自动构建不会代替类型检查，提交代码前建议单独运行 `typecheck`。

## 更新引擎和类型

修改或更新本地 RPGReactor 源码后，运行：

```bash
./scripts/setup-reactor.sh --install
pnpm --dir src typecheck
pnpm --dir src build
```

脚本会从已保存的源码目录同步 runtime 和类型声明。即使引擎版本没变，声明文件的更新也会被同步。这一步不会修改 MZ 的 NW.js。

更换源码目录时，重新指定 `REACTOR_SOURCE` 即可：

```bash
REACTOR_SOURCE="/path/to/another/RPGReactor" ./scripts/setup-reactor.sh --install
```

检查安装状态：

```bash
./scripts/setup-reactor.sh --check
./scripts/doctor.sh
```

## 项目目录

```text
.
├── game.rmmzproject       # 用 MZ 打开的工程文件
├── data/                 # 地图、数据库等游戏数据
├── js/
│   ├── plugins.js        # MZ 插件配置
│   ├── plugins/          # 构建后的插件和第三方插件
│   ├── libs/             # 安装的引擎依赖
│   └── reactor_*.js      # 安装的引擎代码
├── src/
│   ├── plugins/          # TypeScript 插件源码
│   ├── types/            # 项目自身的补充声明
│   ├── vendor/rpgreactor/ # 安装的引擎类型和工具
│   ├── package.json      # 开发依赖和命令
│   └── vite.config.mts   # 插件构建配置
└── scripts/              # 初始化和环境检查脚本
```

## 资源与版本管理

MZ 默认素材由初始化脚本从本机的 MZ 安装中复制，并写入本地 Git 忽略规则。新增的自制素材仍可正常提交。

安装的引擎、引擎类型、开发依赖和示例插件构建产物不提交到 Git。本地源码路径保存在被忽略的 `.reactor-source` 中，因此换电脑后需要重新指定。新增插件时，也应为对应的构建产物添加忽略规则。

工具版本在 `scripts/versions.env` 和 `src/package.json` 中维护。如果要让模板通过 GitHub 下载完成初始化，需要先发布包含类型声明和配套工具的 RPGReactor 源码，再更新 `scripts/versions.env` 中的仓库、commit 和对应版本。
