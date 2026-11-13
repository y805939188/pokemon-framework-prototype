# 基础 driver 与正式战斗能力合同

本合同记录现有实现的可替换边界。`BattleDriver`／`BattleDriverFactory` 是基础会话接口；完整实现其 TypeScript 方法，可以提供脚本驱动或其他引擎，不能据此取得正式持物结算、训练家 AI 或可选换人能力。当前正式组合仅由生产 composition 选择固定 Showdown factory；本批不增加其他正式引擎，不统一或重写三套来源机制。

## 选择入口

| 入口 | 当前授权和限制 |
|---|---|
| `BattleSession.create({driver})` | 基础会话与 driver 自己的 opaque checkpoint。默认不建立 required 结算。持物直接入口仍需显式实验选项；该选项也不授予 App 结算来源。 |
| `createBattleSessionFactory`，省略 driver 或传入同一个生产 `showdownDriverFactory` 对象 | composition 注册 required factory；App 捕获注册来源和 create 函数，绑定自己的 operation、generation、内容身份与返回 handle。即使双方起初无持物，也保持 required 模式。 |
| `createBattleSessionFactory({driver: custom})` | 提供基础 Session，factory 没有 required 注册。包装真实 Showdown factory 仍是另一 factory 对象；其返回真实 gateway 不会补授 App 来源。 |
| `createLegacyNoHeldSessionFactory`／`createLegacyNoHeldBattleSessionFactory` | 显式兼容来源，先选择旧生产者再创建 App。无持物 gate 贯穿入口和写回；缺少 required 方法不会自动转入此分支。 |
| `createLegacyNoHeldResultFactory` + `createLegacyNoHeldBattleHandle`／`commitLegacyNoHeldResult` | 同步旧结果迁移入口，先预留 App／operation／generation，再调用事先选定的 producer；裸 JSON 不能选择模式。 |

`requiredSettlement: true` 是建立通道的请求，不是证明；来源未知时报 `required-settlement-driver-unavailable`。`supported`、`mode`、`required` 等调用者公开属性没有注册效力。`testing.cjs` 的 `requiredFactoryProbe` 是诊断注入能力，生产入口不导出它；不能把使用诊断入口当作普通第三方 driver 已获正式支持。

## 三套真实来源

| 能力 | 建立和绑定 | 当前性与消费 | checkpoint／回滚 |
|---|---|---|---|
| required 持物／金钱结算 | gateway 私有 `SETTLEMENTS` 保存 tracker + lineage；Session 的 required channel 保存 lineage、App binding、捕获的真实 restorer；App 的 factory/admission/handle 均独立绑定 | 必须提供完整 sealed facts，配对 `battleId + generation + rawHash + contentIdentity`。空物品不是来源缺失的豁免。读取过的内容来源变化可永久失效；已安装旧 raw ledger 不补造新证明。 | Session checkpoint 以 opaque engine token 关联同一 Session 的 seal；真实 gateway 恢复 tracker 与 lineage，随后检查 lineage 一致。复制 JSON 或另一会话的 token 无权恢复。 |
| 训练家 AI | gateway 私有 source 在真实引擎请求／公开事件上建立；bind 生成 owner，保存 catalog、seed、lineage；composition 提供 App `isCurrentBattle` 与 generation | ticket 绑定 owner、真实 request identity、资源 revision 和候选 action；DTO candidateId 仅为选择器。请求变化、已提交、资源变化、内容失效、App 代次退休均拒绝。策略只能看冻结公开 DTO，不取得 source。 | checkpoint 同时绑定 Session、lineage、策略对象／实现绑定、资源与随机状态。恢复先只读预检，再退休旧 epoch，调用真实 restorer，重绑同源 driver，重用已记录决策；旧异步结果不能释放后继操作。 |
| 正式可选换人 | `replacementOffers` 在 composition 捕获，默认关闭；只接受 formal factory + 单打 trainer + switch style。gateway source 另有 owner/lineage | 真实强制换人机会和私有 snapshot 建立一次性 ticket。`offerId` 是 UI 过期输入选择器，公开 view 不具授权。目标与 trapping 在独立 native clone 上复核。 | checkpoint 绑定同一 Session／lineage；恢复重建 source ticket 与 prepared AI choice，并生成新 offerId。旧 selector 失效；原 player switch 和同一 foe choice 在一个受控动作里提交。 |

lineage 是进程内对象身份；generation 是 App 安装新时间线后的计数；两者都不是可从存档字符串恢复的凭据。checkpoint 是回滚工具，不是战中存档格式。三条通道共享受控 Session 恢复顺序，各自保留自己的私有来源检查。

实现入口：[driver](../../src/framework/battle/driver.ts)、[composition](../../src/framework/composition.ts)、[factory／handle 来源](../../src/framework/app/settlement-source.ts)、[required channel](../../src/framework/flow/required-settlement.ts)、[AI source](../../src/framework/battle/trainer-ai-source.ts)、[AI channel](../../src/framework/flow/trainer-ai.ts)、[换人 source](../../src/framework/battle/replacement-source.ts)、[换人 channel](../../src/framework/flow/replacement-offer.ts)。

## 证据映射

| 行为 | 已有测试，不计本轮新增 |
|---|---|
| required 不能降级、未知／外 App／退休 handle、同 id 后继、内容 ABA、精确重放 | [test-held-app.cjs](../../experiments/step5/4/test-held-app.cjs)：HF-01、HF-02/03/06、HF-07、HF-08、HF-10、HF06/11；并含真实 factory 选定后 options 不可换 driver。 |
| AI owner／ticket／资源 revision、未知来源、未公开信息 | [test-trainer-ai-integration.cjs](../../experiments/step5/4/test-trainer-ai-integration.cjs)。 |
| AI 异步取消、外 checkpoint、决策／随机回放、恢复前重入 | [test-trainer-ai-async.cjs](../../experiments/step5/4/test-trainer-ai-async.cjs)、[test-trainer-ai-c2-remediation.cjs](../../experiments/step5/4/test-trainer-ai-c2-remediation.cjs)。 |
| 换人真实机会、trap、外 selector、checkpoint 新 selector、失败回滚、captured opt-in | [test-switch-style-ports.cjs](../../experiments/step5/4/test-switch-style-ports.cjs)：SSP01–14；场域序列化 SSF 向量另列于同文件。 |

本轮新增 [test-formal-battle-capabilities.cjs](../../experiments/framework-remediation/test-formal-battle-capabilities.cjs)：FC01 静态证明完整基础接口兼容；FC02 正反两组 public `supported` 标记均不能授权 required；FC03 结构完整的真实 driver 包装器仍须显式 legacy admission；FC04 用真实 Fling 消费物品后，在同一个 checkpoint 恢复 held seal、AI prepared choice 与换人 offer，随后只安装一个 paired settlement。FC04 使用 authored 学习表和合成队伍，不宣称默认投放可取得这些组合。

## 本轮实际验证

2026-11-13，Node 22.21.1 对本批稳定重建运行包执行：

```bash
node --test experiments/framework-remediation/test-formal-battle-capabilities.cjs experiments/framework-remediation/test-application-operation-contract.cjs experiments/framework-remediation/test-field-potion-vectors.cjs
```

首轮 14／14 通过（正式能力 5、App 3、共享 Potion 6），失败／取消／跳过均 0；随后将 FC03 拒绝收紧为具体来源错误，并用 `node --test experiments/framework-remediation/test-formal-battle-capabilities.cjs` 单独重跑 5／5 通过。其中 TypeScript 检查使用独立临时 tsconfig、`noEmit` 和完整基础 driver 接口。新增测试核验现有合同，没有产品红测或产品机制修改。已有测试映射不表示本轮重跑；验证不扩大为原生 UI、全参考机制或第三方正式引擎兼容验收。

同日值语义增补将 FC01 的 `skipLibCheck` 改为 `false`；与新增值语义 18 项合跑 23／23 通过。该类型检查只引入基础 driver／pure scripted 实现，不靠跳过声明检查通过。命令与边界见[迁移和值语义蓝本](migration-vectors.zh.md#错误与阶段分类蓝本)。
