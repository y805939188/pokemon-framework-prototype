# D2 战前包装：默认 Map → BattleScene

本批接真实普通地图入口，不改变 Session、捕获/库存、结果提交或 Gen8 战斗规则。`PSFlow.openBattle(request, presentation)` 的 `presentation.transition` 可显式给 `category`（0–3）、`location`（0–3）、`night`；事件命令可给 `prebattleLocation`，留空继承同名插件参数，默认室外 0。普通野生/训练家调用默认类别 0/1；显式类别不从音乐或实际对手反推。日夜沿用显式 `battleTime`，位置不做 5.5 地图/遭遇推导。

依据：正式 WP16 pre-battle-transitions 及 BT08/09/12/16、WP15 BGM/BGS 生命周期；工作区 5.4 计划 D-2 §3.7。已有战斗内挑战/作者台词与本包装分开。

## 默认呈现及等待

本批使用可替换 `PrebattleOverlay` 端口的简单不透明度遮罩：实时地图继续更新，白天非洞穴闪白，其余闪黑；两次各 200ms 上升 + 200ms 下降，共 800ms。随后变黑，保持至少 100ms 后才 push 战斗 Scene；自有遮罩在实际 Map.terminate 前保持黑屏。Session 仍只在战斗 Scene 原 begin 入口创建。按墙钟与实际更新帧记录分段目标/完成时刻，丢帧不跳过分段终点；不宣称目标时间无抖动。

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

普通地图期间移动及主事件/地图并行事件/并行公共事件解释器推进受控，地图图形继续更新；不取消或重建公共事件解释器，其索引与等待在暂停期间保持，完成或取消后从原处继续。不增加引擎随机消费。真实宿主中的实际画面、输入和底层资源处置须后继原生验收，本批 Node 受控光栅不能证明视觉无缝或无泄漏。

已知 `PREBATTLE-ULTRA-P3-01`：返场到期已置 done 后若底层释放异常，终态诊断可能丢失。仅异常释放路径、未证正常资源失控；按本轮正常玩家流程优先要求 DEFERRED，未视为修复或关闭。

## 可复现检查及范围

`node --test experiments/step5/4/test-prebattle-wrapper.cjs`：默认表/时钟、自有清理/BGS、真实 App+Gen8+编译 Map/Scene 的野生/训练家开战与正常返场、普通取消/换档/初始化失败、同种子初始 request/游戏 RNG、宿主移动/事件门。有限反向变异：`PF_PREBATTLE_MUTATION=early-handoff` 和 `omit-return-wait` 必须使真实接线断言失败。

受影响 R9 Node 控制计划只绑定本次实际编译 runtime；正式 `author-dialogue-native-plan.json`、旧 App 及其已接受原生证据完全不改，不把旧哈希当新 runtime。controlled composition host 的 Base.start/isStarted 现在忠实记录生命周期，避免新 Map hook 捕获一个无效果 start。

整体 WP16、D2/E/5.4、新 P4、实际可见默认过渡/返场、物理输入、Windows、真实听感/信号、GC WARN 与 U51 UNKNOWN 均不由本批 Node 结果关闭。不启动新 NW，不把旧实机证据重新绑定此产品。
