# 6D：独立隔离启动顺序 canary

这只准备和核验一个**不写存档**的隔离 canary。它不启动 NW、不安装运行时、不复制项目素材、不调整普通 MZ 安装，也不替代第三步历史 Flow runner、后续跨进程存档场景、T05 发布版 Slot 99 或 T07 全量。

1. 在已批准的框架工具 worktree 用 `node scripts/prepare-step6-isolated-launch.cjs new` 新建一个私有 stage。只允许工具根的 `build/step6-isolated/launch-…`，game、profile、saves、home、tmp、evidence 互相独立。准备器写入一次性的 native profile 约定和唯一私有 NW manifest 名；普通工程的 package 不修改。真实游戏项目、旧存档、旧期望、旧 profile 不能用作输入。
2. 由已审核的私有合成项目准备流程安置该 stage 的 `game/`（不得改写准备器生成的 `game/package.json`，不能预置 `game/js/plugins.js`、`game/js/reactor_plugins.js`、插件、项目 `save/` 或把文件软链接到外面）。准备器核对普通 `package.json` 的指纹，并核对私有 package 仅有 `name` 值被投影（其他设置完全一致）、Reactor pin（含固定库）、原生 `reactor_main.js` 唯一脚本入口与已编译正式内容的文件身份。素材完整性和 NW 来源仍由实际运行监督器核验。
3. `node scripts/prepare-step6-isolated-launch.cjs assemble <stage> default` 准备默认修复模式；用另一个全新 stage 和 `scene` 准备显式开启 scene 修复的对照。输出私有 `launch-plan.json` 的 SHA-256。计划含有固定的私有 `home`、`tmp`、NW manifest 名及实际 profile 定位。专用 `js/plugins.js` 只前移 SaveLocation，其他行、状态、参数与相对顺序均照常。按 6A 生成 `reactor_plugins.js → plugins.js` 的相对链接，并核实确实加载本 stage 的配置。各启用的 作用域消费者使用同一 stage Vite 构件；普通插件逐个与工具 worktree 原产物比对。此工具不重建普通构件。需要带本地 Management 详细诊断的测试不在这次 canary 里。
4. `node scripts/prepare-step6-isolated-launch.cjs verify <stage> <原先固定的 SHA-256>` 在交给本地监督器前重新核验。缺失、未按序、普通/隔离或轮次混用、内容身份不符、输出不在真正私有目录、任何已有存档或负载均拒绝。失败 stage 留作本地证据，不自动重用或删除。计划参数是结构化 argv，不是可 `eval` 的命令。
5. 仅在另行授权且空闲的 NW 原生窗口，由监督器验证主机身份与互斥并使用该确切参数。裸 `test`/btest/etest 和任意未列出的测试路径、截图或期望文件参数不支持。Driver 在安装观察 hook 前要求实际 NW profile、确切 StorageManager、BattleFlow 与在存储绑定之后安装的 RuntimeFixes 使用同一身份。此专用构件仅接受已量测的 Darwin arm64 NW 0.117.0 / Chromium 154.0.8037.58 的字面 `<private profile>/Default`：两份 NW 参数数组都必须恰好含有 `--user-data-dir=<private profile>`，同时要求 root 和 Default 都是当前 uid 的 canonical 私有目录、不跟随软链接、不接受任意后代目录或同路径别名。运行前明确设置该 stage 的 HOME、CFFIXED_USER_HOME 与 TMPDIR；app manifest 名不许回落到普通名。通用 scoped headless 构件保留原先的 literal profile-root 规则，不能混入专用 stage。普通 Boot 原样执行一次；canary 不调用 fixture、ResetGame、传送、写档或战斗。只有固定私有目录内可写一条有限布尔报告，之后请求 NW 退出。收到 pass、正确场景开关、实际进程退出及留空的 private saves（并且无 `game/save`）才是本次实机通过。报告缺失或失败必须保留，不因源码/Node 通过降级放行。

[四个历史 Mac runner](../PROJECT-GUIDE.md#8-常用命令)在当前仓库会先退出，不再构建、启动或清理证据。裸 `test` 或 `--ps-save-dir` 不是隔离作用域的授权来源。新 canary 不调用这些入口。
