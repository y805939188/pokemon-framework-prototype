# 真实事件战败到 F：常规入口准备

状态 `PREP_ONLY / NOT_REGISTERED / NOT_RUNTIME_VALIDATED`。这是四项业务断言的正规入口准备；本阶段没有执行 Node、VM、构建或四项测试。案例来源固定 `18f84361230b5b3b18e5bd571fffffec3e32e7ad`；最终 5.5 同源组合尚待统筹选择，不能用该历史案例通过替代新正规入口运行。

## 文件与合同

- `battle-defeat-f.test.cjs`：一个显式 suite、P01/P02/B01/B02 四项。原业务断言保留，每项 120 秒上限；原生 Scene pump 仍有限循环。不接受附加 selector，未知参数在加载生产入口前拒绝，不会启动子进程或退回裸 `node --test`。
- `battle-defeat-f-runtime.cjs`：使用现有 `headless-regression-binding.cjs` 的 `capture/boundFiles`，要求真正的父级同源绑定，读取该根实际 production 与三个 IIFE。核对 Node 22.21.1、项目 Reactor pin、现有 Showdown staging 检查；无编译、安装、网络或私产物 fallback。
- `battle-defeat-f-native.cjs`：固定 18f 的 E3/full-Scene 原生夹具适配，复用现有 D/Surf 支持；唯一 build 注入返回已验证输入，屏蔽原自动构建入口。full-Scene 窄装配把 `require.resolve` 绑定到实际 production 文件，并直接保留生产 composition；不使用原默认 unfinished-session 替身。实际 App 构造、私 source 发行、原 native 方法和 `Reflect.apply` this/args/return 保留。
- `battle-defeat-f-fixture.cjs`：固定 18f 的事件业务夹具，入口改为上述受控输入；真实 command357→注册 StartBattle parser→Scene.create/controller→真实 no-held Session/Showdown→Scene.onEnd→finish/ledger/F。参数 `battleEffects:'on'`；`true` 字符串不合法。数据库 `switches=['','StartingOver']` 和 switch id1 保留。recentCenter7 与 legacy home1 有意不同。
- `battle-defeat-f-inputs.json`：精确 suite、数据入口、插件、原生路径与受控依赖闭包。数据仅从 `src/framework/tools/fixtures/content.ts` 经已有 `ts-source-loader.cjs` 导入；不导入 `testing.cjs` 的历史矩阵，不新造 loader/compiler。数据源和生产 framework 由 distribution fingerprint 覆盖；插件源码由现有 `src/plugins` footprint 覆盖。

共享 `scripts/test-headless.sh`、binding 和产品源码未改。统筹另持未应用 registration patch：增加这一个 suite；同源新建并绑定 World/Inventory 两个插件；只补当前确缺的受控依赖，既有 native 路径不重复增加。binding 的 synthetic tests 已动态使用 `PLUGIN_BUNDLES`；补丁仅把“four”测试标题改为“all”，不放宽断言。原三份准备（schema/core 3fe、F joint e777、START dcad）仍各保原范围；本项不把其静态支持或历史 TAP 加为本项通过数。

## 四项与证据范围

| 项 | 业务断言 |
|---|---|
| P01 | 实际败北应用一次、ledger1；F center7 唯一路由、legacy0；pending=null、blackout count1、saveGame facade1 |
| P02 | canLose=true 实际败北应用一次、ledger1；F/legacy/arm/save0，原map5 |
| B01 | F capability禁用时，保留原 committed blackout marker、legacy home1 一次及 saveGame facade1 |
| B02 | 真实 stateReplaced 后旧真实 Scene.onEnd，不应用ledger、不扣款、不转移、不保存，lastStale.finish |

contentSource 明确为 `fixture`、真实支持的 no-held Session；不签 required-held/正式编译内容。render/audio/input/XHR 与 saveGame 为 facade；低层初始 D/Surf scaffold 不作为正式战斗 handle，实际事件有 App session identity 和真实结果断言。原始完整业务 RNG prefix 独立保留：战斗准备 `[65536,65536,32,32,32,32,32,32]`，F 不追加；native prefix 和每个实际 Showdown RNG this/args/value 均逐项写出，不重置计数。fixture 数据构造 RNG 不是生产随机证据。

保存观察分层：`nativeOriginalRequests` 是安装器捕获的原 closure 真执行；`actualSaveExecutorCalls` 是实际 Scene_Base.executeAutosave→DataManager.saveGame facade 调用。outer raw request 次数 `NOT_DIRECTLY_OBSERVED`。二者不是磁盘持久化；不签 PS_SaveState 文件链、冷 Continue、NW、T20 或人工键盘/声音/真实失焦。

每次实际运行输出仅放本根 `build/headless-battle-defeat-f/<fresh-binding-runId>-<unique>/`，保留 INPUT-BINDING 及四份独立完整 observed JSON，不删首失败。不依赖 `.verify`、旧 worktree 或作者 build 输出。

## 后续执行门与命令

先由 root 完成：18f 正式独审、最终同源源码冻结、精确 registration patch 整合、World/Inventory 与其余 regular 插件的受控重建和 fresh binding。之后在该明确有限验证窗口，只执行：

```sh
PF_HEADLESS_REGRESSION_BINDING=<fresh-parent-binding.json> H3_RUNTIME_ROOT=<same-source-root> node --test --test-concurrency=1 --test-reporter=tap scripts/tests/battle-defeat-f.test.cjs
```

ROOT/cwd 必须是含本组最终同源文件与实际产物的根。没有这些输入时是 `BLOCKED/NOT_RUN`，不会借旧 artifact 或自动构建来通过。现阶段仅 Python 文件/依赖/原断言文字对比与 git whitespace/patch-applicability 检查，不能代替 JS 语法或运行验证。正式 source/full regular、最终统计/伙伴/owned-parent/普通 channel 接线另由统筹验收。
