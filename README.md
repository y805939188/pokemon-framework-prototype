# pokemon-framework-prototype

用 TypeScript 为 **RPG Maker MZ** 实现的宝可梦游戏开发框架的主工作仓库（同时是一个可直接用 MZ 打开的工程：`game.rmmzproject`）。运行时用 RPGReactor（PixiJS 8），战斗用 Pokémon Showdown（固定提交，通过受支持的扩展点接入，不改其源码）。行为依据是 clean-room 规格库，不移植原版 Ruby 代码。

起点是 [rpg-maker-mz-initialize](https://github.com/y805939188/rpg-maker-mz-initialize) 模板（`b6fa1df`）；第二步（验证战斗接入）已完成，结论和证据在 `docs/step2/`。

本整改分支的5.4进度：D1骨架及冻结十进程／1000战P-4、D2a时钟与D2b-1状态框已限域接受；GC内存增长WARN仍OPEN，不能据此宣称无泄漏。本支从精确CI184通过的6135e03独立准备[D2c-1逻辑资源选择](docs/step5/5.4-D2c-battlebacks.md)，没有接真实加载／绘制。菜单1520游标问题已独立限定关闭，但原宿主失败及输入来源UNKNOWN仍OPEN；完整默认UI、D2与整体5.4未接受。本说明不表示main已整合，也不改变既有PR边界。

## 先读什么

1. [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md) —— 目标、路线、铁律与授权边界、协作协议、架构、仓库地图、环境准备、常用命令、已知坑、文档地图。**所有人和 AI 动手前必读。**
2. 工作区 `.handoff/STATUS.md` —— 现在做到哪、下一步（不在 git 里）。
3. [`docs/step2/README.md`](docs/step2/README.md) —— 第二步总结与文档导航。

## 最短上手

前提与细节见 `docs/PROJECT-GUIDE.md` 第 9 节。

```bash
REACTOR_SOURCE=/Users/dingshinn/Desktop/RPGReactor ./scripts/bootstrap-mac.sh
./scripts/build-showdown.sh
pnpm --dir src build
./scripts/test-quick.sh        # 类型检查 + 全部 Node 测试，约 1 分钟，无窗口
```

只支持 macOS Apple Silicon（Windows/Intel 暂缓）。bootstrap 默认不会改动已安装的 MZ（要替换它的 NW.js 必须显式加 `--install-nwjs`）。**不要使用 MZ 的"部署"打包**（会弄坏 NW.js 包），用 `scripts/package-mac.sh`。

## 目录

| 路径 | 内容 |
|---|---|
| `js/engine/` | 运行时代码：Showdown 网关、成长/写回/会话、RPG 扩展、场景矩阵（引擎构建产物 `showdown/` 被 git 忽略） |
| `src/plugins/` | MZ 插件的 TypeScript 源码 |
| `scripts/` | 引导、构建、打包、签名、测试、诊断脚本 |
| `experiments/step2/` | 第二步的测试、探针和证据 |
| `docs/` | 项目指南与第二步文档 |
| `data/` `img/` `audio/` … | MZ 工程内容（模板数据；MZ 素材由引导脚本从本机 MZ 复制，不提交） |
