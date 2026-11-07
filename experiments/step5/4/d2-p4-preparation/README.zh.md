# D2 正常呈现 P-4：后继测量合同与离线准备 v1

本候选只做 **PREPARATION_ONLY / NATIVE_NOT_RUN / PERFORMANCE_NOT_RUN**。
合同为 `PROPOSAL_PENDING_INDEPENDENT_REVIEW`；本地代码冻结不是最终产品、运行输入、APP或性能接受。
新正常驱动与实机监督器尚未实现。本目录没有NW启动、宿主占用查询、进程信号、构建、安装、联网或原生接受入口。

本次以已发布并限定接受的 G1/G3 `a4dc03c8e976467c78e9fa0d2e85189642ead10b`
（tree `00a6b3938d533edb6542adc4d3038da645c7f342`）为准备阅读基线。
11月4日 task-3 的准备包保持不改；本目录是其有新身份的后继，未接管其宿主或产品职责。

## 归属与当前事实

所有新增文件仅在独占 `experiments/step5/4/d2-p4-preparation/`。
该路径在本次创建前不存在；父派工授权本隔离准备。没有其他执行者拥有本次新物理路径的已知记录。
共享 `PS_BattleFlow`、产品、驱动、清单、STATUS 和其他候选均只读。
具体检查和限制写在 `ownership.json`；跨会话清单没有返回，已终止等待，不能声称排除了全局同职能负责人。
原生执行权和最终驱动文件归属仍由父协调另行核对。

| 已读身份 | 准确范围 |
|---|---|
| a4dc03c / CI264 | 已发布 G1/G3 测试及有限组合、作者全量补证核验；不是最终D2/P4 |
| bac2069 | 捕获接收四案受控Scene独审限定接受，未发布、无实机 |
| d57bf3f | 天气/G3有限组合独审接受，未发布、无实机 |
| c293122 | Protect App有限契约独审接受，非完整E/D2 |
| 87f6ee4 | 显式默认场域方案冻结，读取截面仍待方案复审、产品未开始 |

以上不是已经合成一个最终产品。不可把旧来源CI或局部接受转签本准备或未来组合。
来源回执逐字快照位于 `inputs/`；`source-provenance.json`记录原路径、字节与hash。
批准r2原文的SHA256为 `9de3ede2fd769ef18663bdc239bfd7b1fc8b51e6306fceb52a9a7e71f8b46135`。

AGENTS、PROJECT-GUIDE和最新STATUS已只读核对；相关 `.agents`/项目skills未发现。
本机记忆 `real-nw-runs-120hz.md`只作历史背景：updateMain约60Hz、显示rAF约120Hz应分开计，
跨realm和reactor_plugins链接须保留。其旧“Claude无沙箱”描述不代表本环境授权，不能用来绕过当前占用拒绝。
Codex记忆库无匹配条目，Personal Context返回不可用。未读原版Ruby、私有适配器或观察日志。

## 对照版本与输入

推荐对照是从当前已接受/发布产品根a4dc派生的**正常D2桥接包**，两端加入同一份新正常测量驱动、内容、配置与oracle，
各有新clean SHA/tree及精确CI。最终候选则由中心完成必要组合后冻结。
这是一项待独审确认的选择；`execution-pins.json`的finalProduct/comparableControl保持null。
若最终规则/接口变化造成不同比较端点或状态，逐指标登记NOT_COMPARABLE；不能偷偷换成旧D1 fast包。
旧D1十进程1000战及其P4限定接受继续有效，本方案不追加D1实机任务。

`workload-proposal.json`完整保留旧F100-v1所有业务字段、类型、100条请求、顺序、seed、前置、步骤和预期，
25轮依次野生胜/捕获/训练家胜/训练家败D3，seed严格为 `[1,2,3,4+i]`。
首训练家用药、FullRestore、挡球、换人、学招、消耗与暂时打落恢复均不删。
两战间只允许明确无owner边界的补给、治疗与既有披露前置；保留捕获成员、账本、统计、缓存。
不得每战重建进程、清缓存、GC或回填整份expected状态。

正常呈现叠层明确fast=false、Battle Effects=true、英语、816×624/DPR2。
正式前还要固定真实文本速度、媒体/过渡、接收设置与所有分支输入。
文本逐字、brief驻留、暂停/确认、HP/EXP/闪光、图片和音频barrier正常完成后才输入；
一次真实游戏tick输入和独立释放，经Window实际输入处理与processOk，不能直接onMenuOk/updateQueue或持续按OK快进。
`semanticSteps`为每种旧业务步骤给出正常导航意图；实际按钮、口袋、槽位和所有100场正常分支尚未解析，故不是可执行输入冻结。

旧driver的首训练家还有开战后foe HP=1测试注入；本候选明确披露而未搬动它。
未来若要改成开战前作者夹具，必须版本化并证明原业务轨迹/状态一致；不能把改变后的夹具仍叫原F100字节。
旧驱动手造App省略了正式logger及部分端口，新正常驱动必须接正式组合，或披露同样经审桥接而保留绝对正式耗时缺口。

## 运行、指标与阈值

正式顺序固定为自然1控制/候选、自然2控制/候选、自然3控制/候选、未插桩控制/候选、GC控制/候选。
10个独立进程各连续100战，共1000战；本次实际为0。
每组新profile/测试存档，串行独占宿主，不与本机build、测试或其他NW并发。
三次自然组先逐进程统计再取中位，off和GC各自分表，所有尝试保留且首败停止。
自然组不expose-gc/不强制GC；GC只在initial、4/50/100及idle120游戏tick采样点各调用两次并证实成功。
off保留业务/oracle和生产perf但关闭新增细探针，细帧/内存为NOT_SAMPLED，不能填0或签off帧性能。

| 测量 | 冻结要求 |
|---|---|
| 时钟/帧 | 原始单调时间；updateMain与rAF各自tick/dt；p50/p95/p99/max、严格>33ms数/比例、连续长帧原样保留 |
| 分段 | event→过渡选择/开始/结束→controller ready→首输入；动作、AI预算窗口、准备、安装、回地图分别计 |
| 有意等待 | 目标/实测等待、包含等待总体验和非等待段分开；重叠track用区间并集，不重复相加，不事后抹慢帧，不称CPU |
| 内存 | 初始、4/50/100、idle120；Renderer RSS/Node heap/浏览器heap/整app自有树RSS各自raw bytes及明确MiB |
| 资源 | 仅可达显示树texture/Bitmap/window/listener和rootOwner/saveBarrier，不是全局分配或无泄漏证明 |
| 状态 | 实际Node JSON.stringify+crypto、包core validateGame、完整初末/每场状态与账本独立绑定；不挑字段/抹时间/用Python数值哈希替代 |

保持 `perf-budget.json` 原factor1.2、全部canonical行和memory100的7.2MB原方法/标签，均为WARN。
同方法可比的新D2指标超过控制自然中位+20%报告WARN，不新增硬性能PASS门。
负或零增长基线不算比例，保留原始差值；旧159ms菜单线不能套包含4秒演出的总时间。
历史单位/工作量未证实相同时NOT_COMPARABLE，不默将旧MB重释为MiB。
原D1 GC整app增长+23.8929% WARN_OPEN、CPU/allocation、U51 UNKNOWN、AUD2和所有历史FAIL/HOLD/LOW/DEFER继续保留。

HP1000ms、满EXP段1750ms+200ms闪光、picture单位50ms、通用过渡1250ms及VS主效果4000ms是既有目标，
不是新实测值，也不能为性能删等待。正常时限不能沿用旧900秒。
`contract.json.deadlines`固定推导规则，但数值及资格输入仍null：枚举全部100场成长/接收等分支的临界路径等待上界，
加有依据的启动、非等待输入、采样、idle和尾检预算，独审后在正式前冻结。
只跑头4场不足以定界后96场。若不能静态枚举，可做明确另列的一次全100资格；不改称失败正式样本为资格，不从重跑中选绿。

## 宿主、身份与失败门

**原宿主占用ps拒绝未解决，当前不再查询，不启动NW。**
材料授权或父端排期不等于成功占用回执；不得换进程入口、另一个runner或推断空闲。
父协调获得相关新证据、核对原操作结果后，才能按既定规则一次重审原被拒且未执行的操作。
执行前还要确认最终包/驱动/输入/有据时限、唯一执行者与独占窗口、精确CI及独审。

包身份要绑定源码SHA/tree/clean、驱动/验证器/监督器、内容/配置/语言、SDK/资源/插件、Showdown实际stage/build、
Reactor、NW/Node/Chromium/V8/架构、全文件/目录/权限/内部链接与deep/strict签名。
旧D1三文件白名单不能适用于新D2：改为逐路径两端hash与原因，独审差异，不豁免整目录/二进制。
每组实际argv/env、GC/probe开关、报告nonce、UTC、PID/PGID/birth身份和前后APP清单都要对应同一次运行。

占用或自有回收能力未准入时不启动。开始后的可选RSS采样若部分/拒绝则null+UNKNOWN+原因，不冒Renderer为整app。
采样只从确知Popen主PID递归直接子进程并核路径/父链/renderer，禁止全机ps或包名求和。
信号/timeout/fatal/语义错保留首因，cleanupErrors和后续尾检错误独立保存；尝试启动后在finally尽力回收准确自有组、
核final APP/签名和已授权after-idle。拒绝不能由finally自动重试。
不确定Popen结果先核结果，非确知自有PID不得发信号；回收/组消失UNKNOWN阻止下一组。

真实保存/新进程Title→Continue→Scene_Load→下一战仍是独立功能门。
绑定普通隔离槽字节、完整框架/明确MZ字段、持物消耗与暂时恢复、一次安装和旧owner退休；
不可由同进程load或纯Node方法测试转签，也不额外塞入这100场。

## 离线检查与交审

在仓库根运行：

```sh
python3 -B experiments/step5/4/d2-p4-preparation/validate.py validate
python3 -B experiments/step5/4/d2-p4-preparation/test_controls.py
python3 -B experiments/step5/4/d2-p4-preparation/validate.py admission
```

前两项分别核准备输入与纯控制；第三项预期exit2/BLOCKED，列明缺失真实身份。
即使改成填入假pin也不能把本版本当原生执行器；应另建经审后继，不改本冻结截面。
`protocol_model.py`只用内存hook检验拒绝零启动、首因不被清理覆盖、失败仍做独立尾检、尾检失败不发PASS，
不操作进程、不证明实机行为。作者纯控制通过不等于Ultra独立通过。

独立Ultra入口由本工作树外的 `d2-p4-normal-evidence/REVIEW-ENTRY.zh.md` 固定提交、tree和封印。
只审本准备合同/脚本，重跑上述离线检查；不要运行旧native入口、查占用、构建APP或重跑已完成业务。
明确剩余门后交父端安排唯一驱动作者、最终产品会合和宿主；不因轻微默认UI差异拖慢此准备。
