# 终局协议 v1

战斗协议在会话与宿主之间只传普通数据，不向 UI 传递引擎对象。冻结的基础消息与写集见[机器合同](../../tests/support/battle/protocol-v1.frozen.json)，实际调用还须满足[正式驱动与结算权限](battle-capabilities.md)。这不是双打 UI 或战斗时存档的支持声明。

1. 开战时从持久成员生成队伍，按稳定 member id 关联身份。引擎持有临时状态；会话持有本场背包、参与者和待确认的成长。都不能在回合中写玩家存档。
2. 有成长时同步等级、EV、能力和学习的招式，再刷新请求。待学习选择完成，才将后续请求交给 UI。
3. 结束后建立结果。保存层验证完整写集，按 battleId 幂等提交；同一 ID、同一哈希返回 `already-applied`，同一 ID 不同哈希、未知成员、非法库存或重复捕获身份均拒绝。协议号、作者 schema 和存档版本各自独立。
4. 状态计数随结果持久化。睡眠保留剩余回合；没有该字段的合法旧档进战重新抽取。普通毒、剧毒在入场分别取 0、1，战后剧毒写为普通毒。临时能力等级和临时招式不混写永久槽。

## Messages out of the session (`take()` / return values)

| kind | payload | meaning |
|---|---|---|
| `events` | `events:[{type,args,raw}]` | public battle log lines (wall-clock `\|t:\|` must be ignored when comparing) |
| `request` | `side, request` | the engine's move/switch/wait request for that side (player = `p1`); only issued once growth is settled |
| `growth` | `member, foe, exp, level, levelUps[], hp` | exp/EV paid for a defeated foe |
| `learn-prompt` | `member, move{id,name,pp}, slots[]` | full move set: answer with `decideLearn(slot\|null)` |
| `learned` | `member, move, replaced` | applied move change |
| `error` | `side, message` | engine refused something (nothing was applied) |
| `end` | `reason: win\|run\|caught\|tie, outcome, winner` | `winner` is `null` for run/caught: engine tie/win is never the business meaning. For `win` it names the winning side (`Player` = the player); **`reason: win` with another winner is a defeat** |

## 账目与磁盘

使用道具前查询与执行期复核是两个检查。拒绝时不登记、不占回合。已预留但未执行的消耗、执行时目标已无效或取消，仅退款一次；训练家挡下已经抛出的球仍消耗。持物必须有本场真实来源才能进入正式结算，不从结果裸 JSON 猜测。

单文件原子安装使用临时文件、fsync 和 rename；不是跨文件或断电情况下的任意持久性保证。MZ 全局索引与存档槽须分别等写回，并从新进程明确选槽复核。
