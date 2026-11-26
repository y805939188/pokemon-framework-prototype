# 6A 测试能力与入口矩阵（§3.4）

这里锁定 6D 的拒绝边界。基线普通运行**尚未隔离**以下测试入口；把两个测试插件排除，或把标签从编辑器隐藏，都不构成授权。

**模式判定**：普通开发/游玩以正式编译内容为正控；受控隔离测试同时满足专用测试构件、显式 test 启动、隔离 profile/存档和合成数据，执行层验证本次测试授权；发布式构件永远缺此权限，即使命令行传 `test`。编辑器、调用者提供的布尔值、插件参数和能否找到文件都不授予权限。发布产物不试图防御任意改写本地代码的人；必须挡住配置、原生事件、注册表和产品暴露的直接调用路径。

| 能力 × 入口 × 数据源 | 91fe853f 现状与副作用 | 普通 / 发布（后者含带 test）目标 | 受控隔离 test 目标 |
|---|---|---|---|
| **ResetGame**：元数据 `PS_BattleFlow.meta.txt:264–266`；原生 357 → PluginManager；直接 PluginManager；`PSFlow.resetGame` | 无条件注册（`:1247`）；在 `:367–374` **先**清 `_psSaveError/_psSaveInfo/_psSaveWarning`、退休状态/操作并推进 App 代次，随后使用当前的 compiled/fixture 内容映射读取 testing 夹具、替换内存队伍并重置序号。无直接写盘，后续正常保存可落盘。即使删 testing 文件，前半段也已生效，见 6A 实测。 | 从生产元数据剔除该指令（保留普通命令）。原生 357/直接注册与执行层均 fail-closed；没有 callback 的构件仍对过期事件给可定位的安全预检拒绝。拒绝早于读取测试/内容、清元数据、代次退休、队伍/序号/变量改变和任何保存写。 | 仅专用测试适配器可见、显式授权后运行同一业务消费者。正控证明合成队伍与状态确实更新，随后正常保存行为单列，不靠让老测试改成绕开注册层。 |
| **`contentSource=fixture`**：编辑器参数 → `PSFlow.content()`、App session factory | `:5–11` 元数据提供参数；`:241–256` 在生产插件中按参数懒读 `testing.cjs`，`:411–412` 切 legacy 工厂及 replacement offers 策略。来源影响新游戏/持久状态、战斗和后续保存；坏 compiled 本身不回退。 | 从生产元数据剔除 fixture 项；明确拒绝历史项目里的 fixture 值，不能忽略输入后偷偷加载 compiled，也不能坏 compiled → fixture。两处消费 ingress 在引擎/fixture require、缓存与工厂装配之前执行相同拒绝。正常 authored compiled 正控继续可读。 | 经受控适配才准 fixture；合成占位的**作者编译 JSON 仍是 compiled**，不是 fixture 测试态。旧测试迁移应对照资料、factory/行为与条件分支，不将 Legacy 特性带到常规路径。 |
| **故障注入**：`window.PSFlow.debug.failProjection / failReturn / failNext='move'` 可在事件脚本 355、控制台或第三方插件设置，消费者 `PS_BattleFlow.ts:234,558,914,2668` | 正式 compiled 或 fixture 都可到达；影响投影/消息、返回、招式流程。已提交结果不一定回滚；可能阻塞/改变原本后续存档或引起旧值继续。设置标志本身不写盘。 | 从普通全局对象去掉测试写能力或使它没有注入权限，并在消费点拒绝/不使用，不能仅隐藏设置入口。分别由事件脚本/直接入口触发；随后普通正控行为、变量、回程、保存与未注入基线一致。 | 仅显式注入测试端口；三个触发点各用原负路径的可观察断言，不省略原回归。 |
| **随机、时钟与实验操作**：`PSFlow.rng`、`seed`、`clock`、`fast`、`testLimits`、`developerCapabilities`、测试 `receiveOptions` 等直接对象属性；`:196,223,232–234,251,357–362,411–415,501–513,1220,1795` | 默认正常，当前通过脚本写属性可消费；分别影响个体/遭遇抽样、战斗种、业务时间、表现节奏、容量/配置、实验性能力/队伍接收等。可能改变状态并随正常保存落盘；不把纯节奏当直接存档写。 | 为这些已知覆盖路径划界，常规保留真时钟/随机/MZ 许可设置；只在隔离授权上下文接收测试覆盖。不提供现有私有全局对象作为作者扩展 API。有明确的合法作者 option 时保留该 option，而非任意测试字段。 | 保留样本、设定种子/时钟和旧断言的可复验性，避免测过的是不同消费者。 |
| **作者地点／TravelDebug 与宿主调试**：`Utils.isOptionValid('test')`、`PS_World.TravelDebug`、`isDebugThrough`、`runtime-inputs-mz.ts:50`、原生 playtest checkpoint | 位置包装器仅 test 输出（下节）。World 参数在 `world-travel-mz.ts:445–447,581` 进入资格/提示，不是测试介质许可；宿主调试可能影响过路/资格，原生 Playtest checkpoint 若开启有独立写入。 | 区分安全的作者只读提示、Native MZ 合法作者 playtest 与框架内部测试授权；生产禁拟真 debug、不得借 `TravelDebug=true` 或 `test` 改通过/存档资格。保留常规 travel/回家/保存和原有合法用户入口。T04 明确关闭并核对额外 playtest checkpoint。 | 作者受控诊断只读、限制内容；test 构件才可使用测试资格，涉及存盘时仅落规定隔离位置。 |
| **包装测试专用产物**：`PS_BattleSmoke/PS_BattleFlowTest`、`testing.cjs`、legacy fixture/runtime、测试 chunks 与原型资产 | `scripts/package-excludes.sh:5–10` 仅名字排两插件另有通用排除；`package-mac.sh:51–68` 会复制完整 `js/` 子树，`build-framework-distribution.cjs:134–137` 明确带多项测试输入。排插件不处理内建入口。 | 6D 独立检查编辑器元数据、运行拒绝和包内实际 allowlist，缺一不通过。只收实际 production require 闭包与许可 staged 依赖。 | 测试版本单列清单和权限，不把可安装的隔离 smoke 当公开发布。 |
| **正常迁移/恢复与 PC、保存**：`PS_SaveState` 和 `PSState` 显式恢复入口、File UI、`PS_Management` | 不是自动 fixture 或测试权限。显式恢复带 handle/hash/目录、操作和加载代次边界；某些入口确实写盘。 | 6D 不能为禁测试删除、隐藏或重写已有正式迁移/恢复/档位合同；保持原行为并回归。不给作者教程万能改档或扩展现有 API。 | 测试保存只在合成路径；真实玩家资料不得输入。 |

**拒绝原子性收据**：对普通非 test、发布非 test、附带伪 test 标志的发布构件分别在实际入口做正负矩阵，快照闸前后比较 `_psGame`/队伍、版本/代次、活动操作及 waiter、`_psBattleSeq`、三个保存诊断字段、结果变量、fixture/compiled I/O 次数、保存入口调用和隔离文件/global 索引摘要。对 ResetGame 刻意拿走 testing 资源再拒绝，仍要求**全部未变化**；只看到异常/没落盘不能通过。选取该案例是因为 6A Node 基线反例确已看到 fixture require 抛前删三个字段并推代次，队伍/序号恰好不变。生产正常 compiled 与正常保存为正控；test 再跑 reset/fixture/注入的各自合成正控。

### 最小安全诊断决定

现有 `src/plugins/navigation/author-command.ts:9–30` 只包装 Management 的 ShowChoices、ShowNumber、ShowTextInput、ShowMessage 和 RegisterHallOfFame。StartTrainerBattle、徽章、内容加载没有该包装；`PS_BattleFlow.ts:247–252` 会把本地绝对路径和原异常拼入错误，6A 不改现状。6D 要在**玩家可见错误、普通 console、发行包的实际执行路径**证明不输出绝对路径、原参数/异常、堆栈、凭据或档案数据；正常约束拒绝可用稳定短码。受控本地作者才输出项目相对路径、插件/命令、图/事件/页/命令号、字段与可改指引；公共事件归属不明留空。编辑器显示或一个封装层不能代替实际输出检查。

不新增全局钩子、每帧扫描、持久诊断、联网或新公开 TS 扩展面。应用/Node CommonJS 现有生产入口不是作者 MZ 事件的脚本接口；6C 只使用已确认的 MZ 命令与原生命令。
