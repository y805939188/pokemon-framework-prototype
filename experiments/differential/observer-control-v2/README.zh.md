# pre54 固定快照来源合同 v2

本批只纠正固定 commit 与独立发布 tag 的来源语义。业务 kit、输入、映射、TS、旧 v1 门和所有旧 BLOCKED 证据均不变。控制提交不是业务候选。实现及合成自测不等于真实 Ruby 来源资格或双端覆盖。

固定 TS kit：8c9951c16cad74a595dfd30ac63aa307a5d13eae / tree 7fe7608c7ae4bb629f2e17383a0fa024c159ed9c / dirty=false；37 payload；freeze ebda61d9abdbc43cb7d3b27857b9b9a0deb5da6877068db105959b41c151555d，request 19c09762f7166fef2a7b540c159ded9bd76cbde25903c44a5c3171338a90c133。

## 固定来源与发布比较的两个义务

业务参考必须是 commit **8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b** 的精确只读导出；发布标签 **v21.1** 独立对应 commit **ea7b5d56d2436591160983c4e641a2ceee2d875a**。后者来自已接收的身份元数据，仍须 A 核原 Git 身份，不代表此门已独立核源码。固定来源不要求等于 tag 或仓库 HEAD。

`fixedReferenceSnapshotVerified` 要求私有来源清单绑定固定 commit/tree、Git blob、实际导出 bytes、导出不可变/前后证据，以及原依赖、运行时、fixture 边界。`privateSourceManifestSHA256` 绑定该实际清单。不能用当前 HEAD、对象身份或自报摘要代替精确导出证明。

`actualLoadedFilesVerified` 是另一个强条件：原业务及原依赖实际 loaded bytes 必须来自该固定导出，匹配对应 Git blob；标准库、薄 adapter、显式外部 fixtures 另列来源与实际摘要。正确导出但加载工作副本仍失败。方法定义归属、调用轨迹、完整前后状态/拒绝/异常、实际初始化和业务 RNG 均须核实；不允许薄适配器重写原算法或以 stub 冒充原方法。

`tagPrimaryFilesComparison` 是完整主文件集合的事实枚举：

- `IDENTICAL`：六操作真实方法归属确定的完整主文件集合已比较，全部 bytes 相同。
- `DIFFERENT`：同一完整集合已比较，至少一项确实不同或发布树无对应文件。
- `NOT_CHECKED`：未比较或集合覆盖不完整。即使部分文件已知不同，也不能声称整个集合已完成比较。

私有比较清单绑定两端 commit、完整集合来源清单 hash、逐项目标/tag blob 或缺失及实际字节比较；A 必须核集合完整，不能挑相同文件。证据键 `tagPrimaryFilesComparisonSHA256` 仅承载该清单的真实摘要。进行中/阻塞 `NOT_CHECKED` 可为 null 或真实部分清单 hash；`IDENTICAL`/`DIFFERENT` 必须有非零实际 hash。SEALED、A PASS 及父准入均拒绝 NOT_CHECKED。取消“必须相同”不会取消完成比较和归档义务；不要求运行发布版本或全仓 diff，不推断任何私有差异原因。

全部 **10** 个强布尔检查、五来源角色、七证据摘要、12 真实资格（每操作正常/边界各一）、实际 Ruby 3.1.3、完整可表达状态和已知零业务 RNG 在 SEALED 都必须成立。资格保真不要求结果与 TS 相同；真实差异保留给比较器，不改输入/映射/oracle 追绿。

## 协议、目录与兼容

新 binding `pre54-observer-control-binding-v2`；状态 `pre54-observer-status-v2`；审计 `pre54-source-audit-v2`；父准入 `pre54-native-auditor-admission-v2`。`referenceTargetCommit` 与 `observedReferenceCommit` 指固定源；`referenceReleaseTag`、`referenceReleaseTagCommit` 与 `observedTagCommit` 指独立发布源。SEALED 分别匹配两固定 pin，不强迫二者相等。

旧冻结行为包的 `source.commit` 仍精确为 8c5911e，`source.tag=v21.1` 仅是独立发布背景，**不能据此声称固定 source 就是该发布树**。实际 tag commit 在本 v2 额外绑定；业务 schema、package、角色、值/进程/producer/完整 354 case 门原样保留。

新公共目录只使用父端预建并核无链接的兄弟目录：
`/Users/dingshinn/Desktop/pokemon-framework/.verify/ruby-ts-pre54-observation-8c9951c-20261030/public-v2`
其中仍只读原六个固定文件名：observer-readiness.json、source-audit.json、observer-dual.json、reference.json、candidate.json、handoff.json。control 收据用 v2 前缀。此次实现不创建或读取真实 public-v2，不写旧 public，不让 O 继续。

v1 的代码、binding、schema、目录及旧失败封印保持原样；v1/v2 互斥，不自动转译、不 fallback、不继承旧 PASS。复用的 v1 有界 reader 仍拒绝链接/硬链接/别名/超限/非 UTF8/不精确 JSON。新门只读公共材料，不打开私有路径，不启动模型/Ruby/子进程；CLI 仅输出闭合安全代码。

## 父端显式接收及独立 A

裸 Node22.21.1，从独立审查固定的控制提交调用；父端不能将 O 自带 binding 或自行现算的摘要当可信带外 pin。

```sh
node experiments/differential/observer-control-v2/receive.mjs --binding experiments/differential/observer-control-v2/binding.json --expected-binding decb1dd74349715b769e6782be13b4350199f9250fe465209525c71b115270b7 --kit <frozen-8c-kit> --public-root <parent-pinned-public-v2> --kind readiness
```

kind=readiness/audit/dual；dual 额外要求 `--accepted-audit <parent-out-of-band-v2-audit-SHA256>`。NODE_OPTIONS、NODE_PATH、execArgv 必须为空；没有 loader/preload。缺文件 exit3，闭合元数据 exit0，拒绝 exit2。不用 exit0 自称来源通过。

顺序保持：固定代码独立 ultra → 父选 v2 namespace/binding 和真实 O 任务 → O 实际 12 调用及完整私有封存 → clean 独立跑门 → 父写 `auditor-admission.schema.json` 闭合准入 → fresh 独立 A 私下核来源/导出/loaded/method/raw/RNG/比较集合 → clean 跑审计门并由父接收准确 A bytes/hash → 才授权 354。本次 O/A/12/354 仍 NOT_RUN。

准入 schema 约束真实 O task/turn、源 pin、binding、readiness bytes、比较状态、七证据及角色。父须另外核 `controlCandidate` 是本次独立审查固定提交、实际 task/turn 是既定 O，将各字段与自己接收的 readiness 逐字绑定；schema 本身不能证明这些外部事实。A 必须核准入 binding/hash/control 身份及实际 readiness/证据一致，不接受 O 自发准入。`sourceAuditAcceptance` 只能 NOT_YET_ACCEPTED。

A 回执精确绑定 O readiness 字节、枚举、全部证据、五角色和六操作；PASS 要求 SEALED。变更来源、adapter、比较集合、任一证据或回执 bytes 均使原审计失效；不能更新摘要并继续沿用旧外部准入。最终 dual 仍验证外部已接收 A hash、原业务 package/source/process/producer/handoff/354 全集合，输出仅 ARTIFACTS_READY_NOT_EQUIVALENCE。

原生独立上下文+目录/读取纪律不是 OS 沙箱；父不读 O/A raw 回复/工具流。公开哈希不能证明私有文件真实性、调用时序或物理独立。A 实际私有审计与父原生执行记录是信任根；门不能自行认证这些事实。

## 有界验证与未运行项

```sh
PRE54_TEST_KIT=<frozen-8c-kit> DIFFERENTIAL_TEST_ROOT=<new-clean-test-output> node --test --test-reporter=tap experiments/differential/observer-control-v2/test-source-contract-v2.mjs
```

合成对照明确标 `INFRASTRUCTURE-SELF-TEST`，参考包由 TS 输出构造，仅测试门/比较器。覆盖 I/D 接受、NOT_CHECKED 终态拒绝、空/零摘要、缺调用/强检查/RNG、身份替换、审计失效、v1 互斥、闭合 CLI/父准入，以及原业务值/来源/完整集合/进程门。不会执行 Ruby、O 或 A；私有导出/loaded 混源、集合漏比和实际 Ruby 差异的 A01/A02/A03 必须留待 O/A 真实运行，不以这些控制计覆盖。


## 最终12项：父指定不可变collection，未封存工作区可追加

本批采用最终adapter完整新跑12，不复用旧10的调用资格。旧成功、旧阻塞、诊断和repair运行原字节保留。repair DONE不等于最终12或A通过；正式354仍待A与父另行准入。

`auditorAdmissionSchema(binding, bindingSHA256, expectedManifestPath)` 要求父端显式提供第三参数，无默认路径/fallback。只接受固定O根下 `readiness-v2-collections-20261030/collection-NNNN/manifest.json`，NNNN为0001–9999。仅检查原始字符串，不normalize路径；拒绝旧目的地、越根、..、重复分隔、非法编号/文件名及末尾换行。返回schema始终是该次**精确路径const**，不是整个命名族的pattern授权。

本次父端选择固定 `collection-0001`；本目录分发admission JSON即其具体schema。未来若父明确选另一编号，父可用同一已审factory生成新的具体const并带外固定该schema/hash；旧const/schema/准入不改。函数不能辨认调用者身份：真实父选择来自父自有调度/固定路径与hash。O的readiness/audit不允许携带路径字段，不能把O自行生成的schema当父准入。

当前准确路径：`/Users/dingshinn/Desktop/pokemon-framework/observation-pre54-batch2-8c9951c-20261030/readiness-v2-collections-20261030/collection-0001/manifest.json`。clean不读取/检查私有目录。O/A负责核真实父目录无链接/别名、所选目标无未知内容；A还须核实际manifest bytes/hash与父已接收readiness一致。

collection在最终manifest写入前是同一O的追加工作区，可记录修复准备/完整12的新运行、失败和必要版本，文件独占创建，原sealed对象只读。首次目标须不存在；同一O中断后只有精确run-context标记一致、没有manifest且确认均属本工作区的已知文件才可继续追加，未知内容或已有manifest停止，不能自动换号或覆盖。marker只是工作区归属/恢复记录，不作来源证据。

先固定最终adapter及依赖闭包、输入/初始化/观测/RNG策略，再完整新跑12。若adapter或共享初始化/观测发生任何变化，保留该次失败/旧运行并用最终版本完整再跑12；不混10+2。全部来源/loaded/method/原返回与完整状态/零RNG/完整tag比较及每项实际证据就绪、自检满足SEALED谓词后，**最后只用独占创建写一次collection manifest**，其闭包覆盖已关闭文件和同一次最终资格批；不预建空manifest、不写未来hash。封存后不再追加/修改collection。

公共readiness在封存后按真实工件更新，A准入仍等父clean独立接收，再以精确manifest路径和七实际摘要生成。工作区标记、路径选择和代码自测均不代表来源通过。A私审后才可授权354。本路径实现阶段不创建O私有目录、不运行Ruby、不续接O。
