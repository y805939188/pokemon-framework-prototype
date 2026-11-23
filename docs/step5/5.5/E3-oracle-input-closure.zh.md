# E3 Fly oracle 后继的正式输入登记

本登记承接固定测试支持 `f8533bd6180abc65fe4c13ff51a26462c1f30255` 及其 `PASS_SCOPED_ORACLE_SUPPORT` 独审，只闭合普通 suite、实际 helper 和输入目录。产品 src 仍为 `508c287fca132b002c4859d99e97171b4ad9f01f`；已审七个 test-support／文档文件的 blob 保持不变。

## 正式接线

`scripts/test-headless.sh` 的普通入口策略允许 `experiments/*.cjs`，执行分支直接使用 `node --test --test-reporter=tap "$s"`。因此原 `experiments/step5/5/e3-production/test-failure-realm-support.cjs` 登记一次，紧随原 phase-observer suite；没有包装或复制测试实现。

`scripts/tests/final-production-inputs.json` 的 controlledInputs 增加：

- `experiments/step5/5/e3-production/fly-failure-injection-support.cjs`；
- `experiments/step5/5/e3-production/test-failure-realm-support.cjs`；
- `experiments/step5/5/e3-production/FLY-FAILURE-ORACLE.zh.md`。

实际 JOINT 正文直接 require helper；新普通 suite require helper、phase support 和 native-consumer observer，静态读取 JOINT 与 joint fixture 的接线源码。这些源文件均在 controlledInputs 中。H 的 CONTROLLED_INPUTS 和 C 正规准备的 INPUTS 已各自展开该 catalog；无需改变原 binding／runtime 代码。未来官方 begin／finish 会对新候选及这些输入重新取摘要；本轮没有实际调用它们。

原修复说明里的“尚未登记”描述固定 f853 的历史状态；本文件记录后继登记，不修改已审说明来挪动其版本边界。

## 实际核对与数量

一次有限静态解析确认 **regular 404→405，unique 405**；catalog **controlledInputs 235→238，unique 238**。旧 regular 与 controlled 条目及相对顺序完整保留，原政策 exclusion 和全部 families 字段不变。上述是登记数量，**405 套均未在本轮执行**；238 也不是展开原生文件／目录后的 H 运行时库存总数，该库存须由后续新冷绑定实际生成。

本轮仅执行 `/bin/bash -n scripts/test-headless.sh`、Node22 的新正规入口 `--check` 和一次只读静态 JSON／source-edge 解析，均 exit0／waited。两个 Node 命令均使用项目 22.21.1，未 import 项目模块或执行测试正文。既有作者7项、独审9项纯控没有重放；没有运行 H／capture／prepare／资格、App／MZ／IIFE／fixture、JOINT／Retry／正式P3、构建／cold／full／NW。

## T／R／RNG 与未完成责任

- 输入登记门已由作者静态核对，仍需固定候选的独立输入整合审查；新 own-cold、runtime 与 binding 尚未创建。旧 b514 binding 不能用于此候选，正服务 F 的原 runtime 保持冻结。
- 原 b514 两次各自的 54P2F 历史账不合并、不覆写；最新单轮后 33 tuple／117 inner 未调用，正式伙伴计数校准和实际 Retry 仍未执行。本次未证明 oracle 是唯一实际阻断。
- T05／T13／T17／T25 的真实失败→Retry→一次保存、T12／T26 正式伙伴校准、R08 `[100]` 与不重掷前缀均待真实后继验证。产品 owner／generation／Content／receipt／registry／serial／birth／handoff／recovery 守卫与 RNG 代码完全不变。
- F14／完整F／E3／G、全量405、T14／T20、NW／冷Continue／人工键盘／声音／真实失焦和整体5.5 均未签收。不得把新增登记量加作通过量。

清理和对照线继续暂停，仅登记新 WT／E 的 MARK_ONLY；未推送或合并。
