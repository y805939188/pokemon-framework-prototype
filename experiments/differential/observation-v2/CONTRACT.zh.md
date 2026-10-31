# pre54稳定输入边界观测协议 v2.0.0

本文件是独立的新观测协议候选，须独立ultra审查和父协调接受。它不改产品，不执行真实Ruby/354，不修改旧v1或其证据。不是新的业务规范或期望答案。

## 固定身份与范围

保留pre54-batch2-v1的354条输入，原请求字节SHA256 `d8ed3fc97db87148b29ed4a743c7417d182151f1dd4cdecce4c84a5fde9a1df2`、逻辑hash `19c09762f7166fef2a7b540c159ded9bd76cbde25903c44a5c3171338a90c133`、旧freeze `ebda61d9abdbc43cb7d3b27857b9b9a0deb5da6877068db105959b41c151555d`。原kit为8c9951c，产品d6aae8c。参考commit `8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b`和发布tag v21.1/commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`分别验证。

执行含义沿已接受附件8efcb2ceb35d2bac9ba7bf8ced7231311514984cac87dce9cb8c1e882434a64c和澄清v1.1：pending不提供选择；整数slot只投递一次原值，不夹紧/换算/补选；cancel须有被审计的保真控制绑定，否则unsupported；grant仅图鉴记录子链。calls/individuals各自有序共享case状态、case间隔离。此协议不改这些输入或行为。

新增可表达的稳定等待仅开放给learning.forgetting。其它五操作保留原v1值/异常投影；若出现新不可表达事实则unobserved并停止，不能悄悄扩快照白名单。旧normalizer/mapping/输入均不回写，新normalizer明确严格生命周期比较。

## 四种观测与原生事实

1. returned：原生调用确实返回，outcome保留value或error-object及原class/公开值。返回pending依然是returned，但businessIncomplete单列，不能叫成功遗忘。
2. raised：原生调用确实抛业务异常，保留class。沿旧合同，完整输入未变须真实证明；技术停止/观测暂停/进程退出不能写成raised，部分/未知状态不能硬填stateUnchanged。
3. awaiting-input-not-returned：原生调用尚未返回或抛业务异常，确实停在需要下一次外部输入的稳定请求边界，业务未完成。不能填一个虚构pending返回值。
4. unobserved：NOT_RUN、UNSUPPORTED_ENTRY_SEMANTICS、INCOMPLETE_STATE、UNPROVEN_STABLE_BOUNDARY、UNSUPPORTED_RANDOM、TECHNICAL_FAILURE、TIMEOUT或ACCESS_BLOCKED。attempted只报告实际尝试；NOT_RUN为false、TIMEOUT须true。不等于业务返回或错误，不计等价。遇到其中非NOT_RUN的必需阻塞项，后续只能NOT_RUN，不继续漂绿。

状态/选择只能来自实际观测；normalizer不得用输入回填实际返回的PP、次序、部分效果，也不推导一端应怎样响应。纯TS函数若真的返回pending，保持returned，不为与Ruby等价而强制挂起或改产品。

## 等待的闭合状态、证据及清理

wait的boundary为固定`learning.forgetting.move-selection-v1`，ordinal为1或2，deliveredInputCount为0或1。pending输入必须0/ordinal1；其它已定义选择有一次预算，若实际达到等待则已交付该次选择后停在第二边界。若不能保真交付/绑定，不可伪造交付计数，须unsupported。没有输入请求时的前门正常返回照原事实。

有界公开state只含member=null或{moves:[{id,pp,maxpp,ppUps}]}，最多4招，6个既定fixture招式ID，PP/ppUps界限与原profile相同，有序保留，PP不得大于maxpp。此范围是本批输入成员和遗忘投影的观察边界，不声称整个Pokemon任意字段可省略。O/A必须检查完整边界状态及此前所有部分效果；如有其它字段变化、未记录效果或无法证明投影完整，选择INCOMPLETE_STATE并停止，不归一化掉它。

proof严格包含真实输入请求/稳定边界证据hash（boundaryEvidenceSHA256）、完整私有状态证据hash、实际执行方法trace hash、公开state规范JSON hash、清理证据hash，以及backgroundQuiescent/fullStateProjection=true。私有证据必须证明真实请求，而非CPU空闲、无stdout、睡眠或达到timeout。生命周期、随机和源码加载各自举证，不能互相替代。

退出仅可为技术observer-unwind或isolated-process-disposal，并证明completed=true、nativeReturned=false、businessException=false。这是观察控制退出，不是原生终结。须证明没有未声明自动推进/后台变更、悬挂工作或跨case状态污染；不满足则UNPROVEN_STABLE_BOUNDARY/TECHNICAL_FAILURE。所有原证据私有保留，不上传raw、源码、adapter、栈或自由路径。

机器门能验证字段闭合、界限、计数和hash关系，**不能从几个true或hash证明来源/稳定性**。因此正式清洁接收还须父端精确pin的独立A最终执行审计回执，绑定新freeze、最终adapter、两端完整公开包字节和新资格证据。A在私有侧核真实输入请求、状态/部分效果、技术清理、来源与RNG；父端仍核真实O/A任务身份。仅符合schema不构成独立审计。

## 传输、净化与安全门

新增raw协议runner-pre54-observation-v2；公开协议behavior-pre54-observation-v2；旧outcome嵌在returned/raised内，原投影函数复用。raw和public都拒绝额外字段，JSON精度/原型/accessor/重复key/字节上限规则沿用，公开包不含raw。等待分支不允许outcome、class、任意字符串或超范围成员状态。

normalizer先完整验证raw，逐条保留真实公开投影，再校验完整公开包。新schema/normalizer/合同/工具依赖和旧kit副本一并由新的observation-freeze固定；旧freeze保留在legacy-kit，原37payload字节不变。新工具不打包另一份业务实现，仅legacy-kit中的固定core供未来TS黑盒调用；tools依赖只复制已有公共工具/旧schema，不含core或runner实现。

正式入口只允许bare Node+已冻结bundle内receive/compare；拒绝NODE_OPTIONS/NODE_PATH/execArgv注入、异地入口、链接/硬链接/额外文件/篡改工具、未知schema或版本、请求/冻结/角色/hash错配。无版本自动升级。固定public目录basename为public-observation-v2-0001，只允许reference-observations.json、candidate-observations.json、execution-audit.json，不能由O指向私有raw文件。实际父目录由父端按授权创建，不覆盖旧public-v2-*。

正式审计回执固定协议pre54-observation-execution-audit-v2、O/A既有真实任务ID、final-v2-adapter-source-and-execution-projection范围、freshV2Qualification=true，含新freeze/最终adapter/新资格/私有最终执行审计hash及两端公开包hash。必须由父提供回执字节hash，不从待测包自取信任。此回执是新版本的独立A执行审计元数据，不是旧12转授。没有它可以在各自产生端自检/封存，clean不得读取未通过固定门的行为内容。

## 比较与计数

双方都先过完整包gate，才读取比较值。returned/raised按旧严格投影比较，原mapping文件仍空批准且不改写；没有新增错误映射或忽略字段。wait对wait比较kind、boundary、实际选择投递数及完整白名单state，保留PP/顺序/部分效果；来源/清理hash是证据身份，不要求跨语言相同。

returned-pending与awaiting-input-not-returned **严格不同**，报告native-lifecycle差异，不以状态看起来相同就自动等价；未来若要允许对应必须另行明确政策，本版不预批。即使wait双方相同，也只叫等价观测，不叫完成调用、成功业务或全功能等价。

总分母恒354；独立报告attempted、observed、returned、raised、awaitingInput、nativeCompleted、businessIncomplete、unsupported/technicalFailure/notRun。等待计observed，绝不计returned/nativeCompleted。异常计原生已终结，不自动计业务成功。工具进程exit0只是观察传输结束，不等于业务成功。顶层进程失败时不伪造case或未尝试数，attempted/notRun为未知null，总354保留。

仅当两端全部354都有可比较记录且严格无差异时，状态PASS_OBSERVATIONAL；有任一unobserved/进程失败为BLOCKED，即使双方同为unsupported也不判相等；可报告已比较子集但不偷换总分母。生命周期或值不同为FAIL；有阻塞时差异仍列出，不被BLOCKED掩盖。receive exit0只代表门接受；compare exit0=PASS_OBSERVATIONAL、1=FAIL、2=拒绝整个包、3=BLOCKED。

## 后续角色顺序与本批交付边界

本批仅clean合同/工具和合成控制，固定候选后独立ultra。接受后，O在私有侧适配新版并固定最终adapter，实际完整新跑12及原25资格；A增量核来源、输入/稳定请求/状态/退出/随机和新freeze绑定，父接受新版资格。旧12不转授。之后才按原门安排正式354；O/A保留私有证据，A对最终执行/公开投影及两端包hash签闭合审计，父pin后clean门接收、比较、独立复审。

O/A仅需回答中性问题：已观察稳定请求能否按上述字段真实举证？当前moves投影是否完整，是否有范围外部分效果？技术退出和case隔离能否证明？cancel及一次原值交付是否已来源绑定？不提供任一端期望答案、不扩源码访问根。任何必需不能表达则明确阻塞，不回到全文方案循环或删354 case。

## 执行层失败与运行方式补充

完整可比较观测要求已证实seed=null/drawCount=0/draws=[]。顶层技术失败、逐例TIMEOUT/TECHNICAL_FAILURE/ACCESS_BLOCKED或UNSUPPORTED_RANDOM使用random=null表示未知/不支持，不伪填零；此类记录仍BLOCKED。其它仍可核零随机的NOT_RUN/unsupported语义记录不把它们当成功。normalizeFailure不制造case，attempted/notRun保持未知；没有实际业务返回不补354个错误值。

本版提供结构净化/失败封装库而非新增通用执行器；O/A沿既有隔离执行方法，把同次真实执行收据与原始观测交给normalizeResponse/normalizeFailure。流程是否真的等待、如何退出、完整状态与RNG仍由私有实际证据和独立A证明；工具不据无输出自行探测等待。测试只运行合成控制，使用明确PF_PRE54_LEGACY_KIT路径及Node22.21.1，不能靠全局残留包。实际新版O/A资格、正式354、CI、Windowshost本批均NOT_RUN。
