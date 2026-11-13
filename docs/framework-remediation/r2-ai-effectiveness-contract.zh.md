# R2 多属性与 Trainer AI 倍率合同修复

本专项的固定产品基线是 `d69870708863343aee6408a85a5d9c6e0f0b0392`；开始时分支为 `step5/architecture-remediation-20261113`，HEAD 是仅文档后继 `0b4f32ba17320ac76b173af9bdbefc4292cbf216`（tree `b2629473d3597e5ac5e72be0a28b4571266b07f0`），工作区干净，两者之间没有相关产品改动。Showdown 保持 `7244fe8e28fa8bc4d0809ae30d183c608b62bb2b`。没有更新 main、读取私有对照材料、启动 NW、修改玩家档。

## 根因与明确合同

正式作者 types 已能完整到达本场引擎和公开 AI 投影，但采集器按全部类型相乘，快照及评分的 Ratio 校验仍限制分子、分母各至 16。正式普通请求在策略执行及策略故障兜底之前校验，因此五弱点／五抗性会使默认及已注册策略的 Session 行动抛出 `trainer-ai-invalid-public-snapshot` 并回滚。强制替补的优势／风险评分也消费同一校验；旧行为可能走策略故障后的首个合法候选兜底。它不是默认一至两属性内容普遍故障，也没有证据说明存档损坏。

固定引擎将免疫和属性指数分开处理：`dist/sim/battle-actions.js` 的 `getDamage` 先检查免疫；`dist/sim/pokemon.js` 的 `runEffectiveness` 汇总当前全部类型并执行 Effectiveness 事件；`modifyDamage` 在伤害计算中把最终指数限制到 `[-6, 6]`，再按二的幂应用。因此，逐类型原始表乘积、有效属性伤害系数、AI 的公开基础表代理是三个不同概念。

`publicTypeMultiplier` 仍是 **公开基础属性表代理**，不是引擎最终伤害预测：

1. 只使用合法目录中的攻击属性、目标全部已公开当前类型；`???` 作为中性防御类型。不得截断作者列表或读取玩家私有类型。
2. 任一表格免疫使代理为 `0/1`。其余每项转为 `-1 / 0 / +1` 指数，先完整累计，最后限制到 `[-6, 6]`，生成约分后的 `1/64 … 64`。不能逐项限幅，否则晚出现的抵抗／弱点无法正确抵消。
3. 采集、快照重算、默认招式评分及强制替补招式优劣评估使用同一内部纯函数。计算不依赖 Node、Showdown 或宿主；指数累计避免合法非约分目录在十八项乘积中溢出。
4. STAB、命中、基础威力沿原评分合同分别计算。招式特例、动态 Effectiveness 事件、特性、场地、实际伤害的舍入／最低伤害等仍不在这个属性表代理中。例如 Flying Press、Freeze-Dry、Delta Stream 并未因此成为完整伤害预测。现有 omitted 诊断保持。
5. Ratio 仍为 `{numerator, denominator}`，普通整数校验上限由伤害指数域推导为 64；保留旧的等价非约分比例。目录单格保持原 `0..16 / 1..16` 且商仅为 `0 / 0.5 / 1 / 2` 的接受域，不扩大或收紧作者类型。

| 向量 | 原始表乘积 | AI 基础代理 / 原生普通伤害的属性系数 |
| --- | --- | --- |
| Fighting → Normal / Ice / Rock / Dark / Steel | 32 | 32 |
| Grass → Fire / Grass / Poison / Flying / Bug | 1/32 | 1/32 |
| Grass → Bug / Dragon / Fire / Flying / Grass / Poison | 1/64 | 1/64 |
| Grass → 上行再加 Steel | 1/128 | 1/64 |
| Fighting → 五弱点再加 Ghost | 0 | 0（普通攻击免疫） |
| 四项 Fire / Poison / Flying / Bug，再由 Forest's Curse 加 Grass | 1/32 | 1/32 |

固定标准十八属性表的单攻击属性正向最高为五弱点（Fighting、Ground），无法通过标准作者列表构造正六／七级；这些边界只用明确标记的合成公共目录测试，不冒充真实标准配置。负七级可以由标准 Grass 或 Bug 抵抗组合到达。它们的免疫和动态规则仍归真实引擎。

## 兼容与边界

作者 JSON／PBS、内容 schema4、Member／GameState 存档、战果协议、AI DTO `trainer-ai-public-v1`、策略注册及返回意图形状保持。无需重写作者列表或修改旧存档；不修改原生引擎。对固定生产目录，既有有效的一至四类型倍率、评分和随机公式不变。过去遭拒绝或进入策略故障兜底的多属性域恢复正常评分和执行。

公开策略 API 还接受合法注入目录。本轮特意保留隐形岩原有的入场估量公式，避免把旧已成功的合成目录替补选择改掉；仅招式候选及替补的招式优势／风险按新伤害指数合同限幅。标准生产岩石表只有四弱、三抗，原入场估量与引擎上限没有差异。合成七抗岩石目录的公开替补选择有单独兼容回归；不因此宣称任意合成表等价于固定引擎真实规则。

没有放宽 owner、lineage、generation、ticket、checkpoint 或来源身份保护，也没有吞掉校验异常。Stellar / Future 跨层一致性继续 **OPEN**，不计入本专项通过。

## 测试与迁移蓝本

新增 `experiments/framework-remediation/test-r2-ai-effectiveness-contract.cjs`，加入 regular 注册。主要用正式作者编译与装配 → 生产 App → 正式 Session → 固定真实 Showdown 和 Trainer AI；debug 仅观察内部引擎结果／checkpoint／测试诊断，不通过破坏权威状态创造触发条件。

首批15项在旧运行时实跑 **5通过／10失败**，原始 `build/r2-ai-effectiveness/before.tap` 保留；其中五弱点、五抗性和注册策略均实触发正式快照异常，七抗性暴露未限幅的 `1/128`。修复后首轮14/15，剩余一项是测试把同义 JSON 对象序列化后的键序差异当成状态差异；改为完整解析对象深比较后15/15。扩展24项的首轮23/24，是测试误把 journal 诊断对象当数组；改为检查真实 `entries` 后24/24。没有删减状态、重放或安全断言，原失败日志保留。

扩展用例覆盖：默认策略及不选择问题招式的注册策略；双／三／四／五／十八类型；真实免疫；六／七抗性实际伤害指数；Forest's Curse 第五属性、checkpoint 重放、旧 ticket 和旧 driver 拒绝；正式强制替补的优势和风险评分不走策略故障兜底；安全整数及非法倍率；非约分公共目录与旧等价比例；正负上限和混排抵消。后补用例未在旧候选重跑红测，不将全部24项都说成旧候选失败。

兼容回归增补后专项共25项；完整验证及独立复审结果在后继交付记录登记，旧290套／5,256项记录不作为本提交证据。

上述向量可作为 C#／GDScript 的值合同：类型顺序不影响最终系数，免疫独立，所有指数先求和再限幅，整数比例、整数评分及错误分类显式保留。它不是完整战斗黄金集或概率验收，也不能替代引擎能力、部署和性能验证。

## 独立复核与诊断后继

首批修复固定为 `8a47b0f5eb48678ba80ea23c24b06dfa13b79784`，tree `8c3040998f1b3abe5fcdd4994ff57f4b97b51fe9`。根协调者定向13文件383/383、完整类型、完整构建、146文件AST依赖边界通过；`PF_NO_SKIP=1 ./scripts/test-headless.sh --scope=regular` 实际完成 **291套／5,281通过，失败／取消／跳过均0，exit0**，不是复用旧5,256项。日志 `build/r2-ai-effectiveness/regular.log`，绑定 `build/headless-regression-bindings/pf-headless-binding.EbJm0B.json`，其末尾复核 HEAD／源码／字节不变且 dirty 三阶段均 false。摘要及manifest／SUMS保存在同目录的 `first-regular-summary.json`、`8a47b0f-manifest.json`、`8a47b0f-SHA256SUMS`。

未参与编码的独立 reviewer 请求配置为 **GPT-6 Astra（`gpt-6-astra`），ultra**；工具不提供速度档位回执，不能确认“普速”或fast。其固定8a独审为 `PASS_SCOPED`：独立重跑新专项、作者类型合同与能力诊断58/58；另按固定Dex基础表独立比较18攻击属性×262,143非空标准防御子集，共4,718,574个值组合，以及6个区分替补选择的探针、4个非法目录负控，全部通过。这是值函数及有限行为检查，不是数百万场战斗或完整概率验收。复核范围包括编译、内容、App、正式Session、引擎、采集／校验／评分、动作与恢复；reviewer未独立重跑完整regular。

独审发现P3诊断回归：非标准原生 `MissingNo.` 在作者省略types时可编译／开场，但其原生 `Bird` 不在固定AI标准目录。旧采集器明确拒绝 `trainer-ai-public-type-missing`，8a共享函数仍拒绝却返回空消息。后继仅恢复这个错误字符串，继续fail-closed，不新增对Bird／MissingNo.的战斗AI支持。正式作者→App→Session拒绝及状态不变回归在8a实跑红测exit1（`diagnostic-before.tap`），随后加入本专项成为26项，定向合计384/384通过；完整类型、完整构建及AST检查也通过。后继完整regular和独立复核必须绑定新固定SHA，不能把8a的记录算作后继已通过。

上文错误分类指公开快照／评分的 `invalid-snapshot`、`invalid-random-result` 等值合同；缺少可信表单元的内部诊断另外按上述旧token保留，不声称所有内部异常字符串都是公开SDK。

## 最终固定交付

最终产品／断言提交为 **`c6536a326f6f0c01477426d1cfb7585f29142c12`**，tree `ca2a43f27f16af3d86a2136d7fc73a13e4eef6ee`，src tree `7fe59a57f8bcb415e70eda941c604d4d252a639d`。提交链为 `0b4f32b` → `8a47b0f`（倍率与25项合同）→ `c6536a3`（原诊断及第26项回归）。后继文档记录不冒充新产品候选重新跑过测试。

| 实际验证 | 固定对象／结果 | 本地原始记录 |
| --- | --- | --- |
| Node22 定向13文件 | c653：384通过，fail/cancel/skip/todo均0，exit0；含新专项26项 | `build/r2-ai-effectiveness/followup-directed.tap` |
| 完整类型与完整构建 | c653提交前的相同源码：均exit0 | 同目录 `followup-typecheck.log`、`followup-full-build.log` |
| AST依赖边界 | 146文件，exit0 | 同目录 `followup-boundaries.log`；regular另执行一次 |
| 完整regular | c653：291套，5,282通过，fail/cancel/skip均0，exit0 | 同目录 `regular-final.log`、`final-regular-summary.json` |
| 独立复审 | c653：GPT-6 Astra / ultra，`PASS_SCOPED`，首轮P3关闭，无新阻断 | 同目录 `reviewer-astra-c6536a3.tap`、`reviewer-astra-c6536a3-probes.log` |

最终独审另跑五文件 **135/135**（本专项、作者类型合同、作者类型能力诊断、既有Trainer AI集成、既有Trainer AI修复），零失败／取消／跳过，exit0；在c653重新核对4,718,574个标准基础表值。公开policy未知类型仍 `invalid-snapshot` 且零抽样。正式MissingNo省略types时精确拒绝原token，driver身份、引擎快照、持久状态均未变；这里发生在取checkpoint的采集前置检查，**不是执行后回滚证明**，恢复／重放证明来自Forest's Curse及邻近checkpoint合同。同一物种显式配置五个标准抗草属性时倍率为1/32且行动成功。8a的6个替补选择与4个坏目录探针单列，不冒充c653重跑。独审未独立跑完整regular。

实际命令如下，测试、pnpm构建与regular使用显式Node22.21.1的PATH（本机前缀 `/Users/dingshinn/.nvm/versions/node/v22.21.1/bin`）；没有依赖某个测试“碰巧跳过”来制造通过：

```sh
pnpm --dir src build
pnpm --dir src typecheck
node scripts/check-boundaries.cjs
node --test \
  experiments/framework-remediation/test-r2-ai-effectiveness-contract.cjs \
  experiments/framework-remediation/test-r2-author-types-contract.cjs \
  experiments/step5/4/test-trainer-ai.cjs \
  experiments/step5/4/test-trainer-ai-integration.cjs \
  experiments/step5/4/test-trainer-ai-strategy.cjs \
  experiments/step5/4/test-trainer-ai-async.cjs \
  experiments/step5/4/test-trainer-ai-c2-remediation.cjs \
  experiments/step5/4/test-trainer-ai-realms.cjs \
  experiments/step5/4/test-trainer-ai-remediation.cjs \
  experiments/step5/4/test-trainer-public-type-transitions.cjs \
  experiments/step5/4/test-transform-growth.cjs \
  experiments/step5/4/test-stance-growth.cjs \
  experiments/step5/4/test-transform-learning.cjs
PF_NO_SKIP=1 ./scripts/test-headless.sh --scope=regular
```

最终regular绑定为 `build/headless-regression-bindings/pf-headless-binding.I9pAUs.json`，runId `7e9bd98b-9c55-43b6-b6af-77db71126081`。末尾重新核对固定HEAD、src、输入及实际运行时字节，dirty 的 before/build/after均false。原始日志SHA256 `7b9077a00eb6103ac3ae43e11aa2eb52622d28ddffbb778f6a80ea622f02c35b`，binding SHA256 `02020902ff9fc70cc754ef261d89a4c2718eb125899ec5fc10d6860d5032328a`；保留 `c6536a3-manifest.json`、`c6536a3-SHA256SUMS` 和 `EVIDENCE-SHA256.json`。这些本地ignored证据没有上传。

本轮只关闭R2倍率缺口和本次引入的拒绝诊断回归，不宣称整个架构整改、全部游戏机制或概率验收完成。保留作者静态类型、不改策略API形状／玩家存档／原生Showdown；普通已有效的一至两类型及既有功能由上述回归保护。Stellar / Future 一致性继续OPEN；非标准原生Bird在未显式给标准类型时仍按原边界拒绝。验证使用已准备的本地依赖与stage，不是另一次冷下载／全新环境准备证明。regular既定的1项冻结回放排除明确NOT RUN，不算通过；真实NW、原版/OA、玩家档、跨平台、历史NW/P4性能和新CI均未运行。未推送、创建PR、合并main或清理工作区。
