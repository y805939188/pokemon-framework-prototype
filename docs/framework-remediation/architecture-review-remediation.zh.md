# 整体架构 review 整改回执（2026-11-13）

> 获批 Gen8／无头整改范围完成。固定产品／测试候选 `d69870708863343aee6408a85a5d9c6e0f0b0392` 已通过完整 regular；本文件是其文档后继，不把文档提交冒充重新执行过的产品候选。

## 对象与边界

起点 main／HEAD 为 `7ff11c917db9e605f245de370b0764ebad8b3243`，tree `c7380748e89758a7a231051baf33c33b20f8a31f`，已跟踪及未跟踪状态干净。主树未改；整改在独立 managed worktree 的 `step5/architecture-remediation-20261113` 分支。没有推送、合并 main、创建 PR／issue、启动 NW／游戏／原版／O/A／冻结增长回放或读取真实玩家档。交接记录仍是工作区唯一 `.handoff/STATUS.md`。本轮未打开禁区原材料内容；实现与验收只使用产品源码、公开依赖、正式规格及本轮合成资料，不使用原版源码、私有O/A适配器、原始对照输出或玩家档作输入。

子任务通过工具参数请求 GPT-6.1 Sol xhigh 编码、Sol ultra 独审；工具没有单独 fast 参数，也未回报 fast 生效状态。下列独立结果来自本轮不同 reviewer，作者自测不计独立。

## 分批结果（各行计数有交集，不能相加）

| 批次 | 本地提交 | 实际修改／保护 | 独立复核与边界 |
|---|---|---|---|
| R1 | `3ae79b010da606c7362828e6e707366deb471b20` | bootstrap：依赖／类型→基础 engine→Showdown→完整构建→检查；README／指南统一。旧脚本19项中8过11败，修复19／19。 | Sol ultra 固定源码＋独立19／19；真实脚本但子步骤为临时 stub，不冒称完整 MZ 冷安装。 |
| R6 | `102923df4f7610a846db3776aeaf1f1ff8bdf3eb`、`effe3555569d50981a4df10f1a8d497b318fbf83` | 固定消费清单40 runtime＋12声明／工具／LICENSE；本地／下载与安装字节同标准，显式 NON-STRICT 开发覆盖。独审发现 runtime symlink 修复会跟随目标；红22／23后修复。 | 独立23／23与原探针，外部目标保持；不验证 NW 兼容或分发许可。 |
| R4A／B | `3fe7e17ccd0d1c73128526ab0214c80f2f336b0d`、`e5b3c80fd599b087ae13762e49f9a5477dd97924` | 真实构造器／ports/options、实际 app 访问器／转发和默认 UI 持有者类型；实际源码编译负例，不是未消费的 Pick。 | 与 R5 累计独立269／269；当时明确记录冻结 R2 集成运行时，不当作旧提交的自包含构建。 |
| R5 | `3bfa08d95c82e9f66c70d894abd2538b531c1e05` | 按宿主 Symbol 单例跨独立 IIFE；采样／nativeConsumed／订阅，旧入口转发，Management 可替换或不加载。未重写跨 UI 事务。 | 新12项及 UI定向；累计独审269／269。 |
| R3／GameApplication／迁移 | `314507854d4a3d7dd6598d254c2de286a4682311` | 正式能力与基础 driver／显式legacy的真实合同、操作×parent×保存×代次矩阵；32项组合测试、12字节golden与6 Potion共享向量。未拆 GameApplication。 | 独立32／32；历史测试只作映射、不冒称重跑；无通用新 driver 授权接口／RPC。 |
| R2 | `e013efc8b73d705e3224826623fbbad24d8feb19`，注释后继 `50fdf59f6edf8336c8abe275f645995c29a3e8e8` | 作者类型经局部 Dex 统一静态消费者与战斗；快照重绑、AI公开名与域；不改共享 Dex／持久 schema／三通道权限。 | 独立16文件414／414＋有限默认／codec／Burn Up／Protean／Reflect Type 探针；未签全部机制或 NW。 |
| Cache4测试兼容 | `8bf513720dc8057f0f970da09340eed40f169584` | 原 legacy input／identity／cache golden 字面值不变，仅回投版本与派生身份核旧字节；旧缓存须重建。红42／48→48／48。 | 独立48／48，幸福值和来源门不弱化；无产品改变。 |
| R5宿主整合 | `a702a2cfa6861ceb229780a22c74da53478fedfd` | 六旧测试宿主补真实端口／稳定registry／getter时序，新增3端口回归；业务断言不改。 | 独立196／196；原失败和准备日志缺失限制保留。 |
| 普通回归候选绑定 | `d753807fe9dc39ac0a3b9c56eba91be873d25430`、`98b4bb17541651e29e53ef18dcd30a8161243747` | fresh构建前后固定源码、完整分发／共享chunk／Showdown／插件／真实消费输入，worker验证同一父binding；旧9份pin／PLAN不改。 | 初版默认77过但独审NEEDS_CHANGES；修复旧root兼容、两个VM来源、外root override后独立61控制＋77当前专项通过；filtered探针另列。 |
| 下载准备文档 | `c71fe0f6d08e619094f680325e0ffd5378457fc9` | 默认download路径替代个人路径；版本变量不变。 | 独立104实际文件hash匹配pin，两来源字节同；只读日志核范围，不称NW／doctor通过。 |
| Summary宿主 | `d850ca9bbae746c810c1240067f6a65fc66e5654` | 第二轮仅3例同类registry错接；红111／114→114／114，原listener1／successor／state／saveBlocked断言不改。 | 独立114／114，无产品改变。 |

## 已批准的内容兼容合同

Gen8标准十八种类型的列表不截断；按类型身份去重并保序；显式空列表规范化为 Normal。作者schema仍2／显式legacy1，compiled语义4要求旧缓存重建，持久schema仍9，战斗协议v1不变。作者JSON与玩家档未被重写。静态个体摘要／图鉴／进化使用内容类型，战斗临时类型仍由引擎拥有。

Stellar等Future类型保留接受并显式warning；含Future的整条物种记录保留原生战斗类型，不删单个元素后投影其余类型；跨层一致性仍OPEN。这是用户明确选择的本轮边界。

## 冷准备与失败保留

新检出初始无node_modules、vendor、engine、Showdown stage、compiled content或distribution；pnpm新store32下载／0复用，Showdown新源与npm cache构建成功。初始e013引擎准备后仅同步两条接口注释50；注释前后CJS字节全等，再做完整content／plugins构建。严格Reactor本地与全新网络download安装的40＋12文件逐项hash全等。

没有执行bootstrap整体、MZ素材复制或doctor（其会执行NW --version）；不能将以上无头链写成完整MZ冷安装通过。

固定50首轮regular：289套、4543pass／612fail、cancel／skip0，完整保留。失败包括旧输入宿主、compiled3断言、历史精确候选门；部分文件在声明业务案前退出，计数不能当作612个独立游戏缺陷。

固定98b第二轮：290套、5241pass／3fail、cancel／skip0；只剩Summary fixture，末尾同binding核验通过。它不是通过轮次。日志分别是忽略目录的 `build/architecture-remediation/cold-logs/regular.log`、`regular-final.log`，从不覆写为绿。

## 保存入口类型收尾

`d69870708863343aee6408a85a5d9c6e0f0b0392`（parent `d850ca9`）仅四路径。PS_SaveState 的 preview／confirm／cancel 及已有 host replacement guard 使用真实派生类型；read／commit 请求与结果使用已有 FriendshipPersistencePort，局部纯 schema 结果保持 GameState。保留 Node／MZ I/O 边缘 any，不改编码、await 顺序、宿主对象或不确定状态锁。

六个实际源变异先误编译通过而使测试红，改后 consumer26与合成保存72合计98／98；完整类型检查通过。作者测试只把原 MZ suite 的输出／读取重定向至临时插件；独审获独占插件输出窗口，直接执行原四套，98／98。独审首轮误用 `/tmp` alias 被旧 realpath 门拒绝，29pass／52fail／17cancel；canonical `/private/tmp` 重跑通过，代码／断言未改，两日志保留。该失败不计产品红测。

验证检出已更新到 d698，完整 typecheck＋完整 build exit0。第三轮固定 d698 的 PF_NO_SKIP regular 已完整通过；保存口独立原四套在 canonical 临时目录重跑 98／98，失败／取消／跳过均0。

## 最终固定验证

- 产品／测试 SHA：`d69870708863343aee6408a85a5d9c6e0f0b0392`。
- tree：`703fba7261d7eb6158a2f71bc0fd72d2a5d9edf3`；src tree：`bdd29d869e7d06c1a01aeb66d4845c21c914de24`。
- macOS 本机 Node `22.21.1`、pnpm `10.20.0`；source fingerprint：`8eb35d0c44275a82b9836e6346a3289354283937c34d0aecd90075e8401d89e2`。
- 实际命令：`PF_NO_SKIP=1 ./scripts/test-headless.sh --scope=regular`，工具进程终态 exit **0**。
- **290 个唯一 regular suite，5,256 pass，fail／cancelled／skipped 均0**；冻结回放 EXCLUDED／NOT RUN。最终 binding 的 before/build/after dirty 均false，末尾身份核验通过。
- 原始日志 SHA-256：`bdc3bc69333d3623ba3c05f4770ce529ab25e6e87b0cad0c36b7b7a36d5cd538`。
- binding SHA-256：`0f0d5626236fccda2142c4e1202801224326dc594589d721796d0a689a87f4e6`。
- 分发 manifest SHA-256：`ae16f5513ad6e111013782fd964718e7adc9e269ce7f559f69bd3dcfff2599dc`；SUMS：`d3f5d3620bf24d8049b4a797ad779fd6def4547664b0b1c03ab6bf552f37a4b5`。

独立 reviewer 另从原始日志重算套件顺序／计数，并调用 capture 核验实际 coldRoot：654 个分发成员（另 manifest／SUMS）、9 engine、466 Showdown、4 plugin 及 runtime 快照字节一致。该 reviewer 做的是只读日志／身份／产物审计，**没有声称独立重跑整套业务**；exit0来自根的工具进程终态记录，二次summary不替代原始日志。

初始冷准备与最终有缓存再验证分开：冷依赖／engine／Showdown准备始于 e013，50仅接口注释后完整构建；注释前后CJS逐字一致。最终 d698 又执行完整 typecheck、完整 content／plugins build 和 fresh-distribution regular，属于已准备依赖环境的再验证。未使用当前 Mac 的旧pnpm／Showdown缓存证明冷准备。

主整改树也已按 d698 重建分发与全部插件。早期复用的本地 Showdown stage 比冷构建少33个声明产物，所有共同文件原本逐字相同；只从本轮验证过的冷构建补齐声明，未修改第三方源码。终态两树的466 Showdown、9 engine、整个656文件分发及4个受绑定插件逐字一致，未留下不同候选拼接的交付包。

具体命令及原始输出在 Git 忽略的 `build/architecture-remediation/`：`cold-logs/`保留三轮全量和冷准备，`review-evidence/`只收集本轮明确生成的测试／审查文件，`INDEX.json`说明缺失项；它不是原始transcript或历史native证据封印。R2和保存类型的定向材料另在`build/r2-author-types/`、`build/r2-author-types-cache4-compat/`和`build/r4-save-application-types/`。这些新合成材料没有推送或对外发布。

## 兼容、回滚与后续顺序

R1／R6属于工程准备，可独立回滚；R2的归一、compiled4、静态摘要、battle-local view、恢复与AI合同应作为一致功能组评估，不能只回滚其中一层重造类型分叉。R4视图与UI调用、R5输入服务接线按提交先后协调；各测试宿主后继不改产品。新per-run身份仅用于普通合成Node回归，旧binding／PLAN／native文件仍独立精确，不能将新候选或dirty开发记录登记为旧实机通过。

GameApplication没有因为行数被拆类；仅整理并测试排他、合法parent、保存与代次合同，没有Operation基类、插件总线或通用工作流。Showdown formal能力仍由真实来源／lineage拥有，未知driver或可伪造supported标志不能获得权限；本轮没有实现任意正式driver替换，也没有机械RPC化。

后续若用户决定继续，可分别安排：真实MZ/NW变更链的单一宿主输入／IME／音画验证；保留旧WARN/UNKNOWN的性能测量；用同一Potion向量做一个Godot或Unity场外试点。三个主题可独立规划，持久格式、完整UI和战斗核心不在同一试点同时重写。原review中的安抚铃持物取值时点、低优先返回快照所有权未在本轮擅改，也不因本轮通过自动关闭。

未执行：新GitHub CI、NW／游戏／物理键鼠／IME／真实音画、Windows/Intel、Godot/Unity工程、完整机制笛卡尔积、历史NW/P4性能、原版/OA或冻结增长回放、真实玩家档、完整bootstrap／doctor与包分发验收。5.4仍按原约定默认过渡交付，自由编排战前演出仍是后续功能；资源来源／许可的既有待确认项保持。

本轮全部为本地提交，main保持原7ff，无push、merge或PR。报告完成后停止，等待用户决定后续验收与是否发布开发分支。


## 完整本地提交与父提交

下表不包含本报告自身的文档后继；每行依次为 SHA、parent、主题。

```text
3ae79b010da606c7362828e6e707366deb471b20 7ff11c917db9e605f245de370b0764ebad8b3243 fix: prepare Showdown before bootstrap content build
102923df4f7610a846db3776aeaf1f1ff8bdf3eb 3ae79b010da606c7362828e6e707366deb471b20 fix: verify pinned Reactor source and installed bytes
effe3555569d50981a4df10f1a8d497b318fbf83 102923df4f7610a846db3776aeaf1f1ff8bdf3eb fix: replace runtime links without following their targets
3fe7e17ccd0d1c73128526ab0214c80f2f336b0d effe3555569d50981a4df10f1a8d497b318fbf83 refactor: type application construction and learning host calls
e5b3c80fd599b087ae13762e49f9a5477dd97924 3fe7e17ccd0d1c73128526ab0214c80f2f336b0d refactor: retain application types through default UI accessors
3bfa08d95c82e9f66c70d894abd2538b531c1e05 e5b3c80fd599b087ae13762e49f9a5477dd97924 refactor: share host input independently of management UI
314507854d4a3d7dd6598d254c2de286a4682311 3bfa08d95c82e9f66c70d894abd2538b531c1e05 test: specify formal battle and application lifecycle contracts
e013efc8b73d705e3224826623fbbad24d8feb19 314507854d4a3d7dd6598d254c2de286a4682311 fix: unify authored Gen8 species types across game and battle
50fdf59f6edf8336c8abe275f645995c29a3e8e8 e013efc8b73d705e3224826623fbbad24d8feb19 docs: align trainer type comments with authored type contract
8bf513720dc8057f0f970da09340eed40f169584 50fdf59f6edf8336c8abe275f645995c29a3e8e8 test: preserve legacy content goldens across cache rebuild
a702a2cfa6861ceb229780a22c74da53478fedfd 8bf513720dc8057f0f970da09340eed40f169584 test: wire controlled hosts to the shared input service
d753807fe9dc39ac0a3b9c56eba91be873d25430 a702a2cfa6861ceb229780a22c74da53478fedfd test: bind regular regressions to their controlled current build
c71fe0f6d08e619094f680325e0ffd5378457fc9 d753807fe9dc39ac0a3b9c56eba91be873d25430 docs: document verified pinned Reactor download setup
98b4bb17541651e29e53ef18dcd30a8161243747 c71fe0f6d08e619094f680325e0ffd5378457fc9 test: retain frozen roots and close regression binding inputs
d850ca9bbae746c810c1240067f6a65fc66e5654 98b4bb17541651e29e53ef18dcd30a8161243747 test: keep shared summary on its installed input targets
d69870708863343aee6408a85a5d9c6e0f0b0392 d850ca9bbae746c810c1240067f6a65fc66e5654 refactor: type save migration application and persistence ports
```
