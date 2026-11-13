# 当前合成 Node 回归的候选绑定

状态／战败磁盘回归、capture ME 合成控制和 H3 正常持物链的普通 regular 模式使用同一父运行器创建的 per-run binding。它只说明本轮合成 Node 测试消费了相同候选、数据和产物，不是旧 native 验收，也不将 dirty 开发状态称为固定候选。

历史 `capture-run-current-headless-runtime.json`、各 PLAN、runtimeRebinding、native pin 和旧证据不修改。无 `PF_HEADLESS_REGRESSION_BINDING` 时保留原历史精确检查；新候选缺少有效父 binding 不能自动捕获自己的实际值充当 expected，也不能因历史 gate 失败而回退。

## 父运行器顺序

在仓库外建立仅属于本轮的临时目录，输出文件使用 `wx`，不覆盖已有 binding：

```bash
node scripts/headless-regression-binding.cjs begin "$bindingDir/begin.json"
pnpm --dir src build:distribution
# 保留现有四插件构建：PS_BattleFlow、PS_SaveState、PS_Evolution、PS_BattleFlowTest
node scripts/headless-regression-binding.cjs finish "$bindingDir/begin.json" "$bindingDir/binding.json"
export PF_HEADLESS_REGRESSION_BINDING="$bindingDir/binding.json"
# 运行既有 regular suites
node scripts/headless-regression-binding.cjs verify "$bindingDir/binding.json"
```

`finish` 必须放在四插件构建循环之后。父运行器保留每个 suite 的真实终态，并把最后一次 verify 失败计入整跑失败；清理仅限本轮目录。worker 不运行构建、不生成 binding、不改 expected，也不自动重试业务。

runner 将原 binding 另存为 `build/headless-regression-bindings/<本轮临时目录名>.json`，使用 noclobber 保留回执；退出只清理临时副本，不覆盖已有运行记录。

## 小 helper 与校验范围

[headless-regression-binding.cjs](../../scripts/headless-regression-binding.cjs) 提供 `begin`、`finish`、`capture`、`verify` 和只从已有父映射选择 expected 的 `boundFiles`。分发构建器与 helper 共同使用 [framework-distribution-source.cjs](../../scripts/framework-distribution-source.cjs) 的同一源码 fingerprint 定义；原构建流程保留，只提取函数并将共享函数自身列入输入。

- `begin` 记录当前 HEAD、HEAD root/src tree、分发源码 fingerprint、实际消费的 source/helper/fixture/config 字节哈希，以及旧 manifest／四插件的文件 token。
- `finish` 要求 manifest 与四插件在 begin 后有新的文件 token；检查源码及 controlled inputs 前后一致，且分发 manifest 的 HEAD/tree/fingerprint 与开始值一致。它验证完整分发文件清单、SHA256SUMS、所有入口和共享 chunk、本地引擎／Showdown 字节与对应分发产物、固定 Showdown pin 及暂存扩展一致。
- 插件源及 metadata、插件 Vite config、四插件 bundle、磁盘 worker／父 test／PLAN、capture ME source、H3 support／父 test／host helper、被执行的本地 MZ 方法副本与相关合成数据均纳入明确清单。没有全仓扫描，也不把普通临时 untracked fixture 输出当作源变更。
- dirty 仅记录 begin/build/finish 时的元数据；是否可继续由 HEAD/src、源码 fingerprint、受控输入和产物的实际字节决定。受控源码为 dirty 时允许日常测试，记录仍保留 dirty；正式验收另外使用根协调固定的 clean 提交。
- `capture` 只读取父 binding 再验证。每个磁盘／Continue 子进程的 owned marker 另绑定父文件 SHA-256，拒绝缺失、替换或移植；返回候选摘要和编译内容身份，由父测试比较生产者／消费者／第三进程。结束时再核同一身份。

per-run 模式保留现有完整磁盘文件、raw/state/result hash、独立新 Node 进程、主提交一次性、取消不写、来源／物品守恒、状态／PP 与真实宿主方法业务断言。原 source/hash 门交给父 binding 的具体 expected 映射执行，历史模式继续使用原静态值。capture ME 的 15 案 PLAN 和原产品 pin 继续是历史计划事实，本轮合成 source 适用不等于重跑或扩签那 15 场 native。

## 验证边界

[headless-regression-binding.test.cjs](../../scripts/tests/headless-regression-binding.test.cjs) 仅创建临时合成 Git／source／package／plugin 身份树；不构建或破坏实际运行包。负控包含 source、HEAD、runtime、共享 chunk 增改／缺失、插件源／config／bundle、真实消费 helper／父 test／fixture、扩展、Showdown pin、manifest／SUMS、缺 binding、跨 root／父运行移植，以及未在 begin 后重建分发或插件。拒绝必须发生在合成业务写入之前。

实际当前候选的 producer/consumer 专项需要根协调受控 fresh build 后执行；临时身份树负控不能替代该专项，也不改写首轮冷 full 的失败结果。

作者实际执行：Node 22.21.1，`node --test scripts/tests/headless-regression-binding.test.cjs` 最终 28／28 通过，失败／取消／跳过均 0；相关 16 个 JS 文件语法与 diff 检查通过，历史 binding／PLAN 的 diff 为零。本轮未运行共享 build 或真实候选 worker 专项，后者由根协调后继记录。三套 step1 distribution／public-api／external-consumer 测试已只读核对，写入只发生在各自临时输出／副本，没有修改共享分发或运行包的负控。

根协调接入真实 runner 后，旧 runner sandbox 的工具白名单先复现 7／14 失败；只更新合成工具模型并增加构建顺序、binding 阶段失败、末尾核验及回执不覆盖合同。更新后的 runner 控制 18 项与 binding 负控 28 项合计 46／46 通过。合成控制不执行产品／NW，也不替代后续固定候选的真实 worker 专项与 regular 全量。
