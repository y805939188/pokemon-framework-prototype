# 主动治疗配置一致性（2026-11-13）

本批基线为 `02cff041078e9e98af7b6bb29df680a44ebf5839`。期望来自只读正式规格：`creature-rpg/wp28-item-use-and-training.md` §5.1，以及 `combat-requirements/wp51-ai-decision-defaults.md` §1；没有运行原版、冻结回放或玩家存档。

## 问题与修复

场外主动道具经内容 `settings` → `resolveConfig` → `item-effects` 已正确区分 `REBALANCED_HEALING_ITEM_AMOUNTS`；战斗执行和训练家 AI 原先都只使用配置真的固定表。因此配置假时，普通玩家使用同一道具在场外和战斗中会得到不同治疗量，AI 也使用错误估量。

| 现支持道具 | 配置真（默认） | 配置假 |
| --- | ---: | ---: |
| Super Potion | 60 | 50 |
| Hyper Potion | 120 | 200 |
| Fresh Water | 30 | 50 |
| Soda Pop | 50 | 60 |
| Lemonade | 70 | 80 |

Potion、Berry Juice、Sweet Heart 恒 20，Moomoo Milk 恒 100，Oran Berry 恒 10。Max Potion 实际补满，AI 估量保留 999；Sitrus Berry 实际请求 `floor(使用时最大 HP / 4)`，AI 估量按 WP51 保留 1。这些估量不代替实际治疗请求，实际恢复仍封顶到使用时缺少的 HP。

最小接线为：已校验内容配置 → `BattleSession.create` → `GatewayOptions.rebalancedHealingItemAmounts` → 引擎拥有的 `battle.rpg` 上下文 → 回合内道具执行。固定量选择由 `healAmount` 共用；训练家目录从相同内容配置建立估量。场外处理器的职责及可由作者配置的效果参数保持原合同，没有统一或重写两套物品定义。

## 快照与兼容

- 该布尔值属于单场战斗的引擎快照，创建后随 Showdown JSON 和 Session 不透明检查点一起保存、恢复。恢复时传入的创建选项不覆盖快照值。
- 旧引擎快照缺少该字段时沿用配置真，保持其已有治疗效果。未新增玩家存档字段、版本或迁移；持久存档 schema 9、战斗结果协议 v1 不变。
- `GatewayOptions` 只增加可选字段；`healRequest` 的第三个参数可省略，旧两参调用保持配置真。`HEAL_ITEMS` 为五个已有条目增加可选 `oldAmount` 元数据；没有新增已支持的战斗物品身份。
- 不新增运行时校验或更早失败时机；非 RPG 格式没有因该配置新增拒绝。配置假下五种道具的战斗执行和 AI 估量改变，是本轮已授权的正式规格偏差修复；默认配置效果保持。
- Energy Powder、Energy Root 等只有场外支持的家族继续按既有战斗能力拒绝，没有顺便开放。

## 保护性测试与证据

新增 `experiments/step5/4/test-healing-config.cjs`，13 项测试使用合成作者内容和真实 App/composition/Session/Showdown 调用，覆盖场外 App 提交、两种配置的玩家实际战斗效果与消耗、AI 估量、训练家实际使用、默认配置、缺血封顶、Sitrus 比例和估量例外、Max Potion、引擎快照与旧快照默认、Session 检查点重放及未支持家族边界。

基线红测以 Node 22.21.1 执行：

```sh
node --test experiments/step5/4/test-healing-config.cjs
```

实得 8 通过、5 失败、取消/跳过 0，exit 1。五处均为配置假：玩家 Super Potion 60≠50、AI Super Potion 60≠50、训练家 Hyper Potion 120≠200、恢复后 HP121≠201、检查点前 AI120≠200。原日志保留在 `build/progressive-remediation/healing/before.tap`，没有删除测试、放宽断言或改变既有期望。

修复后首轮新套件 12 通过、1 失败，原 `after.tap` 保留。该失败来自新增测试误将 JSON 对象键序纳入检查点合同：Showdown 恢复只改变 `formatid` 的键位置。与既有 `test-trainer-ai-integration.cjs` 的检查点测试一致，改为解析后逐字段深等；没有删除字段或更改治疗、资源、AI、请求等业务断言。

作者随后以 Node 22.21.1 执行以下五文件定向回归，246 项全部通过、失败/取消/跳过 0，exit 0；原日志 `build/progressive-remediation/healing/after2-targeted.tap`：

```sh
node --test experiments/step5/4/test-healing-config.cjs \
  experiments/step5/2/test-item-effects6.cjs \
  experiments/step5/4/test-trainer-ai.cjs \
  experiments/step5/4/test-trainer-ai-integration.cjs \
  experiments/step2/s5/test-engine-contract.cjs
```

整合验证由本轮总回执记录精确候选 SHA、命令、计数和独立复审结果；本节作者定向测试不代替最终完整 regular 或独审证据。此批不验收 NW 窗口、性能、完整机制、原版等价或 Godot/Unity 迁移运行能力。
