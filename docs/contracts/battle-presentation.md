# 战前过渡、对话与反馈

## 默认呈现及等待

框架使用可替换 `PrebattleOverlay` 端口的简单不透明度遮罩：实时地图继续更新，白天非洞穴闪白，其余闪黑；两次各 200ms 上升 + 200ms 下降，共 800ms。随后变黑，保持至少 100ms 后才 push 战斗 Scene；自有遮罩在实际 Map.terminate 前保持黑屏。Session 仍只在战斗 Scene 原 begin 入口创建。按墙钟与实际更新帧记录分段目标/完成时刻，丢帧不跳过分段终点；不宣称目标时间无抖动。

默认表保留参考效果身份及主段目标（列：室外/室内/洞穴/水域）：

| 调用类别 | 白天 | 夜间 |
|---|---|---|
| 野生 0/2 | SnakeSquares / DiagonalBubbleTL / DiagonalBubbleBR / RisingSplash | SnakeSquares / DiagonalBubbleBR / DiagonalBubbleBR / RisingSplash |
| 训练家 1 | TwoBallPass / ThreeBallDown / BallDown / WavyThreeBallUp | SpinBallSplit / BallDown / BallDown / WavySpinBall |
| 双训练家类别 3 | FourBallBurst（所有位置） | 同白天 |

主段：SnakeSquares/DiagonalBubble/RisingSplash 1250ms；TwoBallPass/SpinBallSplit/WavySpinBall 1000ms；ThreeBallDown 2000ms；BallDown/FourBallBurst 900ms；WavyThreeBallUp 1100ms。**这里只复用选择与目标时长，统一画简单遮罩，未实现这些具名效果的图案、地图快照/冻结、特殊训练家注册组及立绘。** 类别 2/3 可作呈现输入，不意味着已支持双打战斗。

正常结算仍只由应用原入口提交一次。回到已 start 且窗口/地图精灵就绪的 Map，首帧黑屏，400ms 渐显并重置遭遇计数；渐显结束前继续保持事件 `psBattle` 等待、移动/事件推进和保存屏障。`flow.running` 原结算语义不改；`operationPending()` 同时覆盖宿主回程。既有 BGM 操作负责曲目/引子/进化/世界 sequence 恢复；本包装只增加 BGS 暂停与无 seek 恢复，实际新 BGS buffer/登记接管后不覆盖继任者。

开发者显式 `flow.fast=true` 或非 Map 调用保留立即进入缝，诊断标 `developer-fast` / `non-map-immediate`；它们不能作为普通 Map 包装的验收。

## 所有权与失败

root op + App + stateGeneration 限定所有工作；自有 Sprite/Bitmap 每次包装独立创建/释放，无共享缓存或全局计时器。取消、换档/新游戏、分配/绘制/切场/Session 初始化失败不得迟到创建旧 Session、提交持久状态或锁住保存。换档取消不恢复旧音效覆盖新世界。失败/清理错误保留在 `prebattleState()` 新副本中；原战斗错误和 hostErrors 继续沿用，不用正常返回的保证粉饰失败。

普通地图期间移动及主事件/地图并行事件/并行公共事件解释器推进受控，地图图形继续更新；不取消或重建公共事件解释器，其索引与等待在暂停期间保持，完成或取消后从原处继续。不增加引擎随机消费。真实宿主中的实际画面、输入和底层资源处置须后继原生验收，Node 受控光栅不能证明视觉无缝或无泄漏。

## 有效的窗口与结果

等待真实的场景出生、开始和可交互状态。输入要作用于已显示的窗口和当前页；操作前、召唤出场、命令菜单及终局是不同阶段。按固定动作身份而非本地化菜单文字执行。多页中英文作者台词须能显示完整行、保留空段，逐页继续；最后结果只安装一次。消息、确认、错误退出、后续回程分别验证。绘制命令或窗口可见不证明文字像素实际呈现，受控时钟也不证明物理输入和听感。

[战斗维护说明](../maintainers/battle.md) · [战斗宿主回归](../../tests/regression/battle-host/)。
