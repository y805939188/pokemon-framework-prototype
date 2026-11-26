# Pokémon Framework for RPG Maker MZ

本仓库是一个可以用 RPG Maker MZ 打开的 TypeScript 游戏框架，不是完整游戏或正式 Demo。地图与界面运行在固定版本的 RPGReactor（PixiJS 8）上，Gen 8 单打由固定版本的 Pokémon Showdown 模拟。框架通过扩展接口接入战斗，不移植 Pokémon Essentials 的 Ruby 源码。

## 上手

在 Apple Silicon Mac 上，准备 RPG Maker MZ、Node.js、pnpm 和 Git。具体版本、固定依赖与安装选项见[项目指南](docs/PROJECT-GUIDE.md#9-环境准备从零)。

```bash
REACTOR_SOURCE=download ./scripts/bootstrap-mac.sh
PF_NO_SKIP=1 ./scripts/test-headless.sh --scope=regular
```

引导脚本会准备固定依赖和构建产物，默认不替换 MZ 全局 NW.js。安装完成后，在 MZ 打开 `game.rmmzproject`。仓库附带的是开发模板，需要另行准备自己的地图、美术和经授权的内容；不要把本机 MZ 素材随框架再分发。

## 使用框架

- [运行模式、测试隔离与诊断](docs/step6/README.md)：使用正常模式开发，新建隔离工程做实机测试。
- [作者命令与内容结构](docs/step5/commands.md)：编译内容，配置事件、交易、战斗、传送、存档与界面。
- [打包与分发](docs/step5/distribution.md)：本机构建与限制。不要使用 MZ 自带的“部署”来替代此仓库的 Mac 打包脚本。
- [第五步](docs/step5/README.md) · [第四步](docs/step4/closure.md) · [第三步](docs/step3/closure.md) · [第二步](docs/step2/README.md)：各阶段范围与历史边界。

正式 Demo、Mac 玩家下载版签名和公证不属于这次交付。无界面 CI 不证明真实宿主或玩家安装包通过；当前提交的远程状态见 [GitHub Actions](https://github.com/y805939188/pokemon-framework-prototype/actions)。

## 仓库导航

| 路径 | 用途 |
|---|---|
| `src/framework/` | 游戏规则、状态、内容编译与战斗适配 |
| `src/plugins/` | MZ 插件和宿主对接 |
| `data/`、`content/` | MZ 工程及框架的开发用数据模板 |
| `scripts/`、`experiments/` | 安装、构建、打包及回归验证 |
| `docs/` | 使用说明、兼容边界及阶段索引 |

参与开发前阅读 [项目指南](docs/PROJECT-GUIDE.md)。构建生成物、运行日志、实机证据和开发交接应留在工作区，不能提交为框架内容。
