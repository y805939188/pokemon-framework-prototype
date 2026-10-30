# 5.4 C：纯模块候选（正式接线未做）

基于已限定接受的 B `995599b0f9d7014416172c921f1a38b80801a9be`。父协调已在准备包独立 ultra PASS_SCOPED 后采用 `basic-power-proxy-v1` 和 `basic-self-care-v1`，本批实现这两参数及冻结 DTO／随机合同；不是原版 AI 等价，也不是完整 C 验收。Gen8／Showdown `7244fe8` 固定。

产品增量仅 `src/framework/rules/trainer-ai.ts`，没有 import、引擎对象、宿主或持久状态。`createTrainerAiPolicy(catalog).decide(snapshot, randomN)` 接收值并返回原 candidateId／有限重试意图。评分／权重／换人／用药的具名函数是纯值测试缝，不应在后继公开入口中作为适配层塞最终分的授权路径。没有修改 SDK、入口 export、总 runner、driver、session、checkpoint、Store、App、MZ 或根 STATUS。

## 元数据与运行时边界

`TrainerAiCatalog` 是为实际招式／强制替补查询增加的显式值依赖，沿用已审合同的固定 Gen8 公开元数据责任。它只含 gen、招式静态族／类型／威力／命中、基本属性表，以及框架作者药物目录（不强迫药物属于 Showdown 持物目录）。构造时按数据描述符复制，不接查询函数或原始 Dex。快照与目录都拒绝访问器／额外字段／Symbol／稀疏数组／不支持原型及不合法数值；构造后外部别名不能改策略。目录合法结构不是来源证明：后继唯一接线者还须从锁定目录和正规内容装配，绑定内容身份，不能用本测试的小目录替代完整生产目录。

快照保留原批准字段。对手只有已公开的显示身份、类型、百分制 HP 条、状态、阶级及揭示历史，不能增加精确 HP、未见队伍、choice 或 pending。所有字段先检查和复制，再抽样；输入与目录不被修改。binding 仅回传相关性，不授权来源；同值伪请求、跨战斗、换代与恢复安全仍必须由后续私有 owner／采集器校验。

强制替补在纯模块用己方有限 PP 招式、固定公开类型表、最后公开招式计算已审近似，绝不调用实际伤害预演。现有 string 型 publicConditions 在本期识别 `p2:spikes:1/2/3`、`p2:toxicspikes:1/2`、`p2:stealthrock`、`p2:stickyweb`；均为公开条件值，不是发动引擎原语。已知 boots／Flying／Levitate／Air Balloon／Iron Ball／Magic Guard／Immunity 只用于该有限入场估量；其余场地、状态修正／复杂能力效果不宣称覆盖，保留 omitted 诊断。真实采集器的条件名映射及效果归属须另审，不改变引擎规则。

评分不是实际伤害；公开失败与静态伤害族免疫在预测开启时记 20，状态／未建模族不会只因招式属性为零就擅判失效。未建模族诊断与 60／100 偏好、普通 STAB、WP51 截值与权重、HP30%／状态40%门保持冻结合同。强制替补允许负分且稳定选最高；正式请求不会主动换人。普通move请求必须先提供完整招式枚举或显式自动挣扎候选；空招式且有合法药物的矛盾请求在概率门前invalid-snapshot／零draw，无药空集仍no-legal-action／零draw。不会为了只用药而改概率或捏造挣扎。药物仅返回候选，不扣量、治疗或退款。fullrestore／Sitrus 的 AI 估量不是实际 HP 请求。

## 可重跑验证

在本工作树根，Node22.21.1：

```
node --test experiments/step5/4/test-trainer-ai.cjs
node src/node_modules/typescript/bin/tsc --noEmit -p src/framework/tsconfig.core.json
node src/node_modules/typescript/bin/tsc --noEmit -p src/framework/tsconfig.json
node src/node_modules/typescript/bin/tsc --noEmit -p src/framework/tsconfig.app.json
node scripts/check-boundaries.cjs
node experiments/step5/4/trainer-ai-pure/reverse.cjs /absolute/fresh/evidence-directory
```

132 个真实纯层测试，包括原封存 46 向量逐字复用、整份快照、数据门、输入不变、随机调用／边界与别名重入、候选关联、作者药物、强制替补和相邻控制。`adapter.cjs` 只映射测试输入到真实纯函数，不重写选择算法、不硬编码预期。原准备包自身和其清单不改。原8项反向和删除空候选前置门的第9项反向，均仅在独立临时文件中改一处实现，真实跑同一测试并要求断言失败；不污染作者源码。

`PF_TRAINER_AI_TEST_MODULE` 仅是上述两个测试文件的显式模块路径，用于临时变异与本模块独立 CJS 编译验证；生产模块不读取环境变量。相关类型、CJS／声明验证不等于 SDK 已公开该 API，正式产品包仍未接线。

## 后继门与隔离

准备包的 27 项真实 fullrestore 执行／公开采集器／来源与恢复门继续 NOT_EXECUTED。本次纯层测试不把它们升级 PASS，也不把真实源缓存、AI 域 PRNG／状态、道具 ledger、私有 checkpoint、部分结果屏障、帧表现、性能、NW/MZ 或实体键鼠算作已测。完整 C、D/E 和新精确 CI 未验收。

friendship 共享窗口交回后，以父端实际验收组合 SHA 为基线，由唯一整合写者补正规目录／公开采集、请求来源与候选登记、独立 random(n) 提供者和 checkpoint、trainer 资源与真实 fullrestore，保留 B 的事实／重放／partial 及 A 服从、旧 wild/defaultAi 和 S1/S6。当前不得抢接这些共享文件。

Windows/macOS优先；本次只本机 Node 纯模块。Windows host NOT_RUN，Linux设施 CI 保留但本批没有新 CI；不研究 Docker。原性能/RSS WARN、appRSS UNKNOWN、Ruby 与最终实体输入边界保持。
