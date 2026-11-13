# 开场持久状态导入时序修复

旧 Session 在双方 Team Preview 选择后才导入 HP、异常状态和 PP。第二个 team choice 已触发原生 send-out 和入场效果，因此公开 switch 消息可能仍是满血健康，随后 Scene 按该旧消息覆盖正确的初始卡片。正常默认样例中，小火龙第一战受伤并逃跑保存 15/18，第二战引擎为 15/18，但旧消息和卡片为 18/18；自然睡眠也会被显示为健康。

修复把双方 seedState 移至两个 team choice 之前。此时双方 roster 已存在，原生 send-out、入场特性与初次请求都读取同一持久输入。刷新请求保留既有行为，不额外执行回合，不补造事件，不让 UI 查询私有状态或重写原消息，也不在入场效果后再次覆盖状态。

原生 start 在 Team Preview 后会重设 pokemonLeft，因此既有 RPG onBattleStart 先按当前 fainted 重建双方活体人数，再保持原有初始场域逻辑。它位于 native reset 之后、switchIn 之前，不重置 HP/状态/PP，不新增阵亡、不增加 totalFainted。先前仅调整 seed 的候选被既有 carried-faint/复活回归拒绝，历史失败保留。

本修复依赖正式 RPG 单打/双打格式的 Team Preview，不扩大非 Team Preview 自定义格式支持。旧记录若缺少睡眠 count，仍按原有规则抽一次 2–4 回合，但抽样先于入场及 speed-tie RNG；不承诺与旧错误时序逐值一致。显式保存的剩余 count 不重新抽样。

新增 `experiments/step5/4/test-opening-state-scene.cjs`，已登记普通 headless 清单：

- 13 项真实编译 Scene、真实 App/composition/Gen8 Session，使用受控绘制、输入、时钟与隔离内存存档；4 项真实 Session 的显式敌方持久输入/睡眠 PRNG 契约。
- 默认样例中英文真实伤害、正常逃跑和第二战，精确 15/18 与 PP；自然 Spore 睡眠和 Toxic 转普通中毒后的第二战。
- 显式携入的六种状态、HP、PP Ups，上场阵亡成员跳过、受伤异常替补换人及身份保持。
- 原生 Immunity 入场：公开 switch 先有中毒，再原生 cure，最终状态不被旧 seed 覆盖。该测试与“将旧消息改为最后状态”的修补方案不兼容。
- 自然敌方睡眠后正常菜单捕获，精确保留剩余计数和 PP，不多执行行动；另测敌方受伤/睡眠/灼伤的原生开场与捕获结果。
- 开场恰一个 turn 1、无招式/不能行动/阵亡事件；公开消息字节在 Scene 播放后不变，敌方不显示数值 HP。

捕获测试止于真实捕获结果和接受确认前，未伪造共享受控宿主缺少的 receiving UI，不能据此声称该 UI 或捕获入库持久提交已验收。窗口原生像素、NW、实体输入、原版对照和真实玩家存档均未运行。该修复不关闭完整 5.4、持物写回或既有范围外问题。
