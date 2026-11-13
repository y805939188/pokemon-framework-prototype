# pokemon-framework-prototype

用 TypeScript 为 **RPG Maker MZ** 实现的宝可梦游戏开发框架的主工作仓库（同时是一个可直接用 MZ 打开的工程：`game.rmmzproject`）。运行时用 RPGReactor（PixiJS 8），战斗用 Pokémon Showdown（固定提交，通过受支持的扩展点接入，不改其源码）。行为依据是 clean-room 规格库，不移植原版 Ruby 代码。

起点是 [rpg-maker-mz-initialize](https://github.com/y805939188/rpg-maker-mz-initialize) 模板（`b6fa1df`）；第二步（验证战斗接入）已完成，结论和证据在 `docs/step2/`。

## 当前阶段（2026-11-13）

5.4 已按批准的单打与默认呈现范围完成技术收口。主线整合以普通合并 `580c8637` 承接已独审的最终验收文档 [`4ac83373`](https://github.com/y805939188/pokemon-framework-prototype/commit/4ac83373fac77a2a9eec24e85191a6415ac5dd4a)，产品仍为 [`174568dc`](https://github.com/y805939188/pokemon-framework-prototype/commit/174568dc2a0d20b5e5e2b0878c35c63bca742e27)，src `7c52b290`（源码来源 `5a41caf`）；产品代码和静态运行包身份不变。[投球／逃跑整改](docs/step5/5.4-capture-run-followup.md)的 A1／B1／C1 仅按正常可达范围限域通过，不扩成全部机制验收。

开发分支的[精确 CI #313](https://github.com/y805939188/pokemon-framework-prototype/actions/runs/43366638211) 对产品 `174568dc`、[精确 CI #314](https://github.com/y805939188/pokemon-framework-prototype/actions/runs/43369227918) 对最终验收文档 `4ac83373` 各自两 job 成功，均为 280 套／5082 项通过，失败／取消／跳过均 0；冻结参考回放 EXCLUDED／NOT RUN，D1 合成控制 7＋23 另列。它们不是 main CI；此主线整合的精确 CI 以对应 main 提交的 [Actions 实绩](https://github.com/y805939188/pokemon-framework-prototype/actions?query=branch%3Amain) 为准，不继承开发分支 CI，也不预填本 README 所属最终 main 提交的结果。

此前 `2ecace8d`／`714b674` 的阶段收口与 CI312 保留为历史，不改写旧证据。战前仍统一用已实现的默认过渡；完整特殊注册／优先级和按场景、对手、事件自由编排尚未实现，后续阶段和日期未指定。范围及合并前固定验收记录见[5.4 收口记录](docs/step5/5.4-closure.md)和[验收索引](docs/step5/5.4-current-acceptance.md)。所链接文档保留 CI314 时的合并前记录；当前 main 集成事实以本节和对应 main CI 为准。旧 native／百场／HI05／CD 保留原版本；完整性能、跨平台与游戏包分发未因此通过，原 FAIL／WARN／UNKNOWN 及未测边界保持。

## 先读什么

1. [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md) —— 目标、路线、铁律与授权边界、协作协议、架构、仓库地图、环境准备、常用命令、已知坑、文档地图。**所有人和 AI 动手前必读。**
2. 工作区 `.handoff/STATUS.md` —— 现在做到哪、下一步（不在 git 里）。
3. [`docs/step2/README.md`](docs/step2/README.md) —— 第二步总结与文档导航。

## 最短上手

前提与细节见 `docs/PROJECT-GUIDE.md` 第 9 节。

```bash
REACTOR_SOURCE=/Users/dingshinn/Desktop/RPGReactor ./scripts/bootstrap-mac.sh
./scripts/test-quick.sh        # 类型检查 + 全部 Node 测试，约 1 分钟，无窗口
```

bootstrap 会完成依赖与类型准备、基础引擎／Showdown 扩展构建、固定 Showdown 暂存、完整内容与插件构建，最后运行 doctor；冷环境和已有构建产物的环境都使用这个顺序。

只支持 macOS Apple Silicon（Windows/Intel 暂缓）。bootstrap 默认不会改动已安装的 MZ（要替换它的 NW.js 必须显式加 `--install-nwjs`）。**不要使用 MZ 的"部署"打包**（会弄坏 NW.js 包），用 `scripts/package-mac.sh`。

## 目录

| 路径 | 内容 |
|---|---|
| `js/engine/` | 运行时代码：Showdown 网关、成长/写回/会话、RPG 扩展、场景矩阵（引擎构建产物 `showdown/` 被 git 忽略） |
| `src/plugins/` | MZ 插件的 TypeScript 源码 |
| `scripts/` | 引导、构建、打包、签名、测试、诊断脚本 |
| `experiments/step2/` | 第二步的测试、探针和证据 |
| `docs/` | 项目指南、阶段合同、测试与验收文档 |
| `data/` `img/` `audio/` … | MZ 工程内容（模板数据；MZ 素材由引导脚本从本机 MZ 复制，不提交） |


## 历史批次截面

以下保留各批次当时状态；其中“当前／下一批／待审”只指当时，不覆盖上方当前验收索引。

本整改分支从已限域接受的倒下纯排期f4f5551继续：原ultra及精确CI198双job均通过，旧拒绝／失败保留。当前小批为[简单倒下的Scene／音频消费者](docs/step5/5.4-D2c-faint-view.md)，尚待固定验证与独立复审。完整D2／5.4、新P-4和GC内存增长WARN仍OPEN，原U51-16超时FAIL／输入来源UNKNOWN保留，main未合并。

2026-11-01：默认F2 `9c045fb` 经独立纯路径、新包单轮81项与精确CI203限域接收；下一小批[战斗音频六入口纯选曲](docs/step5/5.4-D2c-audio-selection.md)待固定候选独立复审，只处理逻辑身份优先级，未播放／未接Scene。完整D2/5.4/E、新P4、GC WARN与旧UNKNOWN不关闭。

后继音频：纯选曲 `47a84e2` 已独立 PASS_SCOPED（155套/2840项），精确分支发布另核；[BGM端口／引子记忆与MZ适配器](docs/step5/5.4-D2c-audio-host-port.md)为下一独立候选，尚未接正式 Scene 或事件，未运行新 NW，不等于实际音频或完整 WP15/16 已验收。

后续接线：47a已发布且精确CI204全绿，内部端口7166f7a已获独立限域通过；当前[正式Scene开战BGM／事件引子／回程](docs/step5/5.4-D2c-audio-scene.md)是新候选待审，未运行新NW，不以纯路径代签真实宿主或整个D2。
