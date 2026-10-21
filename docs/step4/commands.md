# 第四步命令一页表

插件 `PS_BattleFlow`（MZ 事件命令“插件命令”）。所有命令都只改框架状态（`$gameSystem._psGame`），**不改** MZ 的 `$gameParty` 金币/物品/角色。框架状态缺失或不可用（读档失败）时，各命令按“拒绝”处理，什么都不改。

| 命令 | 参数 | 前置条件 | 成功 | 拒绝（什么都不改） | 错误 | 是否等待 | 事件用法 |
|---|---|---|---|---|---|---|---|
| `ClaimGrant` | `grant`：内容 `grants.json` 的 ID（样例 `starter`）；`resultVariable`；`message`（默认 true） | 新游戏或读档后的框架状态 | 变量 = 1：成员（队伍先、满了入盒）、物品、金钱一次发放，物种登记为已见/已拥有，写凭证；显示“加入队伍/送进盒子/获得道具”消息 | 变量 = 2：已领取过（不变）；变量 = 0：未知奖励、某物品会超过 999、队伍和盒子放不下、存档不可用、战斗进行中 —— 不发放、不写凭证，显示原因 | 不抛错；原因在 `PSFlow.lastClaim.reason/error` 与控制台 | 只在 `message` 为真时等消息关闭 | NPC 对话：先说台词，再一条 `ClaimGrant`，按变量分支 |
| `HealParty` | `resultVariable`；`message` | 同上 | 变量 = 1：HP/状态/PP 全恢复（已满也是 1，什么都不写） | 变量 = 0：存档不可用、成员物种不在内容里或战斗进行中（从开战创建会话起，到结束或中止） | 同上（`PSFlow.lastHeal`） | 同上 | 护士、床 |
| `StartBattle` | `kind`（wild/trainer）；`foes`（`物种:等级,…`，物种用内容 ID 或持久名）；`battleId`（自动加序号）；`resultVariable`；`canLose`（默认 false） | 至少一名可战斗成员；内容里有该物种且该等级至少会一个招式 | 1 胜、2 捕获、3 逃跑；成长/学招/捕获写回一次 | 0：开不了战（无可战斗成员、未知物种、存档不可用等，说明在 `PSFlow.lastOutcome.error`），或战斗中止（引擎失败等），状态不变 | 4：败/平 —— 扣钱+全队治疗与结果同次提交；`canLose` 为 false 时回家并**结束本事件及调用它的事件**（公共事件逐层；与“中止事件处理”相同） | 等战斗结束 | 剧情战斗；需要“输了也继续”时设 `canLose` |
| `ShowParty` | — | 同上 | 打开只读队伍界面（成员、HP、PP、盒子数量、背包、金钱），确定/取消关闭 | 存档不可用时界面显示原因 | — | 界面关闭后继续 | 告示牌；主菜单也有“Party/队伍” |
| `ResetGame` | — | — | **测试辅助**：装入第二步合成夹具队伍 | — | — | 否 | 仅测试，正式游戏不要用 |

## 插件参数（`PS_BattleFlow`）

| 参数 | 默认 | 作用 |
|---|---|---|
| `startMoney` | 3000 | 新游戏的框架金钱（WP24 StartMoney） |
| `noMoneyLoss` | false | NO_MONEY_LOSS：败/平不扣钱（仍治疗） |
| `homeMapId` / `homeX` / `homeY` / `homeDirection` | 0 / 0 / 0 / 2 | 战败回程点；0 = 无家（只治疗、不移动）。本工程设为 Map005 (8,9) |
| `contentSource` | sample | sample = 内容管线编译产物；fixture = 测试夹具（没有生成数据，不能开新战斗） |
| `language` | en | en / zh |

## 地图遭遇（地图备注）

```
<PSEncounter:regions=1;pidgey,60,2-4;caterpie,40,2-4>
```

- 何时：MZ 地图设置“遇敌步数”的原生计数（本切片 20 步）；
- 哪里：`regions=`（可省略 = 整张地图）列出的地图区域；
- 选什么：应用层按 WP36 §5.1（权重降序、单次掷、等级区间均匀）选，再从内容生成个体；
- 不触发：事件执行中、已有战斗、没有可战斗成员、区域不符、备注不合法（控制台说明）；
- 结束：同 `StartBattle`（`canLose` 恒为 false，败/平回家）；战后重新抽步数。

## 脚本侧可用的查询与辅助（宿主代码 / 测试）

| 入口 | 用途 |
|---|---|
| `PSFlow.game()` | 当前框架状态（不可用时抛错，绝不伪造） |
| `PSFlow.lastOutcome` | 最近一场战斗：`code`、`commit`（applied/already-applied/none）、`kind`、`defeat {moneyLost, healed}`、`blackout`、`projection`、`hostErrors`（提交之后宿主出错的步骤与原因；不改变前面这些字段） |
| `PSFlow.lastReturn` / `PSFlow.retryReturnHome()` | 战败回程结果（requested/no-home/failed）与失败后的重试（只移动，不结算） |
| `PSFlow.lastEncounter` | 最近一次遭遇判断（ok 或 reason：not-here、no-able-member、invalid-note、invalid-table、invalid-content…） |
| `PSState.lastSaveError` | 被拒或失败的保存：`battle-running` / `write-failed`、槽位、时间；成功保存后清空 |

## 运行与验证命令

| 目的 | 命令 |
|---|---|
| 无头自检（33 个套件） | `scripts/test-quick.sh` |
| 真实 MZ 开发树（T1–T29、V1–V3，弹窗） | `scripts/run-flow-test-mac.sh <证据目录>` |
| 打包 | `scripts/package-mac.sh [--with-tests]` |
| 包内完整套件（流程 + 替换包后重启校验 + 矩阵 + 默认存档位置 SL1 + 签名封印） | `scripts/run-package-tests-mac.sh <证据目录>` |
| 包内性能（含“遭遇→进战斗”“存/读档”） | `scripts/run-package-perf-mac.sh [次数] <证据目录>` |

两个包内脚本只结束自己用 `open -n` 启动的那个进程（按精确 PID），已有实例在运行时拒绝开始。
