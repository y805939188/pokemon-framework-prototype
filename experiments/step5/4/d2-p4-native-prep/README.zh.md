# 正常D2：默认关闭的OS后端、100场导航与最终包接线准备

## 两项P2定点修订 r2

原d4d4864独审为NEEDS_CHANGES，本修订只处理P4-NATIVE-ULTRA-01/02及相邻保护。
使用新的独占修订worktree，原d4d4864 checkout/分支/全部证据和封印不改。
两项目前仅为作者实现/工具验证，关闭待原独审复验；没有新增原生执行准入。

强制替补现在显式走 `party-forced → P1 → party-command → switch-in`，与原moveUntilEnd/item/switch意图分开。
`observeForcedSelection` 只核对已观察的两个正常菜单快照并返回新context，不发键、不推进业务intentIndex。
前后必须是同case/owner/forced-request occurrence、同意图、实际eligible P1、forced子层和已选P1，且switch-in可用。
后继确认必须匹配该记录；无记录/过期请求/换owner/错成员或普通未知party-command都拒绝。
普通主动换人仍要求switch子层和对应稳定成员，然后选switch-in。
这些新增snapshot字段须由中央未来observer从实际root/App代际、当前强制请求**发生次序**及Scene子层/已选成员/DTO取值；
相同请求内容的下一次发生也必须换token，不能只用payload hash作为occurrence token。
纯工具快照不证明实机因果，完整100场observer/trace仍待接线。

输出边界现在在预检及任何mkdir/open之前重复校验物理路径：必须在executionRoot内、等于或落入任一已绑定APP（包括另一对照端）均拒绝，
实际指向APP的符号链接/`..`别名也拒绝；另用现存祖先的 `samefile` 身份检查拦截大小写别名等物理同目录路径。
预检冻结规范输出位置；launch时别名重指或物理位置变化拒绝。
日志/report/fatal及验证路径使用该规范位置；正常APP外新目录和外部别名可用，原禁止覆盖与launch前字节重检保持。
这只落实collector-owned输出边界，不代替未来正式driver/profile argv和真实OS资格绑定。

本批承接93314ee的 `PASS_SCOPED_TOOL_CORES`，仅在本新目录工作。
**OS后端代码及接口已实现但未在真实OS进程验证；导航策略具体化但完整trace/资格未冻结；最终包和共享接线未完成。**
没有宿主查询、NW/性能/对照执行，也没有push、构建APP、依赖安装、玩家档或共享STATUS写入。
旧48f3的19文件、933的10文件均保持，旧封印和失败记录不改。

## 实现及边界

`os_backend.py` 提供具体stdlib `SystemOps` 和对接已审Supervisor的 `MacOSBackend`。
默认 `ClosedPermit` 在subprocess、Popen、poll、PID查询、group probe及signal前拒绝；没有许可授予实现、launch CLI或自动调用。
许可端口必须由后继独审过的集成代码按真实授权绑定，不能由JSON true或工具夹具当许可。
原被拒占用动作不在这里重建：只有 `original_gate` / `after_gate` 回调；缺少原成功回执就阻塞，不换查询方式。
本批从未调用真实后端查询或启动原生进程。

| 代码能力 | 当前证据与限制 |
|---|---|
| 预检与启动 | 冻结每组spec副本、收据hash、全包清单、精确NW/project argv/cwd、新输出根和严格签名接口；启动前再核字节。当前只用普通临时文件/脚本化Ops；没有真实签名/APP |
| Popen与身份 | 具体start_new_session实现；精确PID/PPID/PGID/birth/executable及存储的OwnedProcess关联；外来或伪造PGID在任何probe/signal前拒绝。真实Popen生命周期未验 |
| 等待与原始结果 | 有界poll、取消、原fatal保留、D2正常报告版本/nonce/group、raw bytes hash。旧D1报告拒绝；正常输出writer/原生完整报告尚未接线 |
| 完整结果验证 | 显式actual Node/package-core verifier回调必需；未绑定不能预检。成功只能return None，失败须raise，False/失败字典拒绝；验证前后raw hash不变。实际包core校验器尚未绑定 |
| 回收 | 仅已存且逐字段相等的自有进程组；每次signal前查活跃leader身份，TERM及KILL有明确独立上限。leader退出但group尚在时保留UNKNOWN，不盲杀Helper；真实宿主可回收资格仍未证 |
| RSS接口 | 从实际Popen root递归直接子PID，绑定父链/可执行路径/出生字段/renderer，二次子集合核验，返回结构化逐进程字段；未保存原ps文本，真实renderer角色/完整采样证据仍待资格。EPERM/部分/重用为null+UNKNOWN，不用全机ps或包名求和，未实采 |
| 终检 | 完整包字节/权限/链接与严格签名接口，原after-idle回调；缺门/错组/漂移拒绝。真实终检未执行 |

`core_api.py` 只加载93314ee的声明/类/静态绑定函数，不加载测试、SDK、引擎或回放入口。
具体 `/bin/ps -p <ownedPID>`、`pgrep -P <ownedParent>` 只存在于将来的受许可自有进程采样实现；
它们不能代替原占用检查，未启动且未证自有时不得调用。
测试仅在mock替换的subprocess边界核实argv，绝不实际执行这些命令。

## 100场导航方案

`navigation.cjs` 从原F100输入生成100个具名case，保留请求、seed、setup、expected及首训练家特殊事件。
这是作者输入的策略编译，不运行旧冻结结果回放，不加载Showdown或比较原版业务结果。
固定Node JSON.stringify业务hash仍是 `93507d4bca39de181c462158240b87691fea1b09588d10494ad9c6692425ec4e`。

策略明确：

- 正常Fight→实际PayDay1/Memento3菜单槽，必须核当时公开招式ID；不静默用其他招式替代。
- Bag→实际口袋物品→Use→稳定P1或公开对手目标；口袋/对手ID缺失不猜。切口袋脉冲适配尚未实现。
- Party→P2/P1→生产 `switch-in` 命令；强制替补仍由实际资格拒绝，不自行挑不同成员。
- 正常learn-initial明确forget-move，首训练家学习仍选0起算槽3；意外后期学习/放弃分支阻塞，不默弃。
- 训练家替补问题显式No、野生倒下显式next，正常暂停/能力页交已审核心确认；普通/brief文本、动画barrier等待。
- 终局Continue前先核实际outcome；完整接收/命名/满队/Map/Title交接仍需公共适配，不猜按钮或跳过root handoff。

策略没有自己推进业务步：intentIndex只能由实际事件/状态oracle确认后推进，不能因发出按键就推进。
旧16个战斗行动循环guard作为来源保留，不作为正常耗时预算；全部qualifiedDeadline/resolvedNormalActions继续null。
mode1/naming1保持；如果实际显示昵称/去向问题，既定No/box意图仍需最终profile和公共adapter审查，
现有轻微默认No/Yes差异不在本批修产品。
需要中央提供正式App夹具/内容口袋、完整后期成长/接收分支、观察器及有据时限后才可得到可执行trace。
本策略不是已完成100场宿主导航、完整F100执行器或正常呈现接受。

## 最终包及中央共享接线

`pair_binding.py` / `final-pair-template.json` 把最终控制/候选、逐路径差异、同driver/input/config、逐指标可比性、
正常trace/时限、后端复审及原门禁回执列成明确缺项。两产品目前均null，不能把933/本工具commit或a4dc阅读根当最终包。
有材料时静态核完整inventory、package-info source/dirty/withTests、精确CI头和收据hash，
返回也仅 `STATIC_PAIR_BYTES_MATCH_PENDING_INDEPENDENT_REVIEW`，不认证签名、运行时或原生权限。
CI中执行过禁止冻结回放的结果/HOLD不能作为该门的接受，必须有独立核验的排除处置。

`integration_check.py` 只读四个项目源文件的hash和套件**名称**，不导入/执行套件、不打开冻结业务数据。
当前generic headless确有 `test-growth-differential.cjs`，故quick/headless/CI均不在本任务允许路径。
只允许当前目录两个精确Node/Python工具命令；不允许广泛node --test、旧套件或追加额外参数。
这不是中央CI排除修复；中央仍须先设计排除、独立检查，再考虑触发任何通用入口。

暂停共享写入与必需决定：

1. 中央确认最终产品与正常桥接控制：当前场域1eac流程HOLD、901127f AI候选待审等状态不能自动整合/转签。
2. 中央选择CJS工具的打包/嵌入方式、新正常路由、正式PSFlow.app与夹具生命周期，指定单写者修改 `PS_BattleFlowTest.ts`。
3. 补正常F100编排器/事件oracle、bag pocket/接收/地图/Title adapter和所有100场实际trace/时限。当前只有策略与输入核心，不是该完整编排器。
4. 绑定实际Node/package-core完整状态/seed/ledger验证器，独审真实Ops和原门禁回调；不是把None-return工具stub当业务验证。
5. 中央独占修改测试清单/CI排除边界，之后取得两个精确SHA的合规CI、最终APP/SDK/资源/配置/签名及逐指标可比性证据。
6. 原占用拒绝按新相关授权和实际结果处理，具名执行者/独占窗口落实后，才可能另行资格及单轮正式10/1000。

## 定向工具验证

仅使用已安装Node22.21.1的内置test runner和Python unittest，无依赖安装：

```sh
/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node --test experiments/step5/4/d2-p4-native-prep/test-navigation.cjs
python3 -B -m unittest discover -s experiments/step5/4/d2-p4-native-prep -p 'test_*.py' -v
python3 -B experiments/step5/4/d2-p4-native-prep/integration_check.py
```

测试用脚本化Ops/普通临时文件和mock后的subprocess/killpg/后端os接口，真正OS边界误触即失败。
临时目录虽以.app命名模拟文件结构，里面只有标注为工具夹具的普通文本，没有可运行NW或许可运行时。
首轮Node12过、Python27中19项在setUp失败：全局getpid哨兵拦了tempfile命名。
第二轮Node12过、Python14项遇到夹具/var与规范/private/var路径不符。两轮原源码/日志已保留；
只缩小mock作用域并规范夹具路径，没有放松后端身份门。修后Python27过；补强所有权/变更前launch检查后29过。
最终精确候选的命令、源码hash、结果和独立复审入口在外部证据，不累加历史轮次或subTest为新机制。

前版已核旧933限定独审30成员/96引用，历史只读567注册worktree未见该新目录/拟driver同路径；
本修订又核d4独审27成员/123引用，并只在新修订worktree处理，原路径/封印保持。
这些不证明全局无同职能任务或宿主空闲。改动局限本目录，不抢中央写入；无子agent、推送或main合并。
全部旧WARN/UNKNOWN/FAIL/HOLD/LOW/DEFER、GC+23.8929%、U51/AUD2及完整D2/E/5.4/P4未接受边界保持。
