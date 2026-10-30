# pre54-batch2-v1：三族公共设施及TS侧（未做真实Ruby对照）

产品快照 d6aae8cfa4d706cf976c42aeb3dcc683a252aa03，设施起点10e8b9811991d9d9aad4d348cf1f775ce6692832；framework树731261a82d12da7662150a093c131de3b8914fa8相同。本批不改变产品、5.4、friendship迁移或存档/战斗协议。编码sol6.1 xhigh，独立ultra后才接收本设施候选；真Ruby资格和双端接受另门。

## 闭合操作和分母

`profiles/pre54-batch2.mjs`及`schema/pre54-*.json`固定六操作，`requests/pre54-batch2.json`冻结354个输入，不含期望输出。selection-coverage逐case列共同/附加域，不将354/六操作当三个完整功能族或736单元覆盖率。

| 操作 | case数 | 范围 |
| --- | ---: | --- |
| learning.relearningCandidates | 48 | 六等级×MORE_MOVES两态×正常/蛋/Shadow/缺成员；明确表序、重复/已知排除、firstMoves交集 |
| learning.forgetting | 24 | 4个成员/槽数状态×pending/cancel/−1/0/1/4；**全部wrapper-qualification附加域**，等待真正包装资格，不从底层delete推最后一招/HM/UI合同 |
| pokedex.recordSequence | 21 | 十类入口×internalBattle两态、两次调用；另一条混合grant/appearance/capture/defeat序列。不是所有source/图鉴功能全覆盖 |
| pokedex.recentSequence | 3 | register/recent独立的性别、展示形态名称门、同值recent及覆盖顺序 |
| stats.computeStats | 226 | 25性格×等级1/50/100×显式IV/EV三组＋基础HP1；EV合法总数，不含随机创建、缺省IV或全部官方物种资料 |
| stats.hpAfterRecalc | 32 | 四个HP×四个新上限×默认/兼容模式；旧0→上限增长且默认false的具名附加域保留已批产品取舍，不自动写入新实际差异批准 |

外部小目录`DIRECTORY`是公开的固定实验输入，不是原版输出或官方全内容。只有alpha/beta及命名/无名形态，既用于TS公开函数，也将由独立观察者装配最小外部GameData。directory的公开值hash与整个profile模块hash分别保留；reference角色`fixture-directory`必须等于实际kit内profile工件hash，不能随意自报非零。真实原文件加载仍由隔离source审计核验。

## 投影与未知

query返回有序moves；遗忘保留幸存槽id/pp/maxpp/ppUps、成功/取消/pending及遗忘id，拒绝以error-object与闭合code分列。compound图鉴操作逐调用保留六项语义状态（seen/owned/seenForms/lastSeenForm/capturedCounts/defeatedCounts）、changed及refresh请求次数，最终状态必须等于末步骤；数组不排序。register将性别2并入0、只填首次lastSeen；recent保留2并覆盖，名称门分别调用真实core.normalizeDexAppearance。set/record与capture/defeat计数的重复语义不混同。

图鉴layoutIdentity/view/eligibility结构属于TS专有存储/呈现，不与Ruby内部对象机械相等；TS适配实际核完整非投影字段不变。公开compound结果是事前定义的语义投影，不宣称原方法原始返回对象布局相同；观察侧真实逐调用返回/诊断仍完整留私有，case外层value/error-object/raised类别不合并。若异常时不能证明完整输入和状态未改变，raw必须stateUnchanged=false并BLOCK发布，而不能丢掉部分状态、只拿异常类求同。当前不以此关闭任何原版部分写入行为。

六项数值逐整数比较；HP默认保持濒死和兼容复活分开，不打开兼容开关掩盖默认差异。mapping为空：已批产品方向仍须等真实观察，再将具体case/hash/outcome分类；不能把参数标签当一键豁免。未知源码方法与原始返回投影可行性由G3 readiness确认；本批未写Ruby适配器或业务oracle。

## 版本与复用

旧wp30八操作/配置/schema和其拒绝门保留。新profile由新request protocol、selection、行为协议、schemaVersion、normalizer和mapping版本闭合选择，不接受任意插件/JSON。正式入口仍verify-kit/run-dual/compare；源文件集静态allowlist新增profile和五schema，source及执行入口/依赖都纳manifest和外部freeze。旧已封kit/旧输入/旧观察/原FAIL不改。

为复用既有受控命令，kit内请求运输路径仍固定为`requests/wp30-r2.json`；该basename不是本批能力声明，新protocol和freeze明确pre54-batch2-v1。builder使用源`requests/pre54-batch2.json`与对应coverage及配置，在**新kit**的受控位置复制；schema逻辑hash指向新pre54 schema。错profile、少角色、错normalizer、未知操作、错case序/漏case、改profile或preload/execArgv都拒绝。新metadata需要learning-rules/pokedex-rules/stats-rules/adapter/fixture-directory，绝不拿旧growth/friendship来源资格自动替代。

构建：同次构建core和runner后，在现有build-kit命令末尾加 `--profile pre54-batch2-v1`。旧不带该参数仍构建wp30 profile。新kit内继续用外部FREEZE_SHA256、HANDOFF_SHA256正式验证执行/比较。缺core能力是进程失败，不能变成354条TypeError业务结果。

TS/设施自测入口：Node22.21.1 `node --test experiments/differential/test-headless.mjs`，每次给全新DIFFERENTIAL_TEST_ROOT。现有Mac sandbox下ps可能EPERM；须原样保失败并按正式权限运行自有超时进程组检查，不跳断言。Windows host和Linux真实Ruby按既定平台优先级分列；现有Linux设施CI保留，本批未推送跑CI。synthetic-reference工作者明确标INFRASTRUCTURE-SELF-TEST，只回放TS夹具以验证harness，所有该类PASS均不计原版执行或等价覆盖。

## 执行前置门和后继

G1：本profile/输入/分母/投影/目录冻结，已批HP策略具名；不在结果后静默删失败或改mapping。G2：旧90及新增闭合门/正式入口、精度、进程/污染、错序和差异反例，固定源/实际core/runner/manifest身份。G3：独立且具授权观察者每个操作真实加载正常＋拒绝/边界探针，独立来源审计通过；random实际非零、RGSS依赖或未适配返回形状须BLOCKED/NOT_RUN，不能合成算法补oracle。G4：全冻结输入真实双端、独立clean gate比较与复审后，只登记确切已执行范围。

当前六操作Ruby资格全NOT_RUN，原版新增0，actual dual0。普通差异固定case独立排修，不改变主线WIP；严重数据完整性问题交父协调。主线5.4仍同步全部质量门，5.5时才补已接收5.4外层行为；Showdown内部不强行与Ruby等价。保持Gen8、Windows/macOS优先、Linux专属低优；性能/RSS WARN、appRSS UNKNOWN、实体输入未测不关闭。

## 给隔离观察者的材料边界

`requests/pre54-qualification.json`列每操作两个真实加载readiness探针的caseId/requestHash，取自同一冻结354输入。它是准备材料，不是已跑结果或另一个参考oracle。source-method-binding均由私有观察者确认，clean作者不猜原方法名或抄实现。readiness可以先单独在观察侧执行这些输入并保留实际原始记录；它不等正式run-dual全矩阵或已覆盖两个case。若其中一操作不能真实调用，保留整批未测分母，版本化后决定范围，不静默删case求全绿。

新kit `config/runners.template.json`已按五个新reference角色准备，hash全零、runtime UNKNOWN会在任何child前被拒绝。观察者从自己私有目录填实际原文件/适配器role hash、版本、argv/cwd及fixture-directory实际profile工件hash；来源资格不是填上非零字符串。不得在公开材料写原版私有路径/源码/argv/stack；Node候选argv/cwd仍必须逐项为该实际kit，private/public目录不能重合/包含/物理别名。

默认单端/双端timeout30000ms、stdout16MiB、stderr1MiB，实际schema上限/旧资源约束不改。任何signal/非零exit/stderr/超限/多JSON/精度损失/缺case/随机合同缺口均非PASS；只回收自己创建的进程组。正式命令只能裸Node＋当前kit入口，NODE_OPTIONS/NODE_PATH/execArgv/外部harness禁止。实际payload无.ts/.map/sourceMappingURL，所有profile/schema/入口/依赖同次manifest/external freeze；clean比较须先过handoff及行为hash/来源门，不能凭observer自查标签读行为值。

现有五项计时WARN、Renderer/RSS归因、appRSS UNKNOWN及实体键鼠边界不因设施自测改变。本批未启动GUI/原版/观察角色或Linux安装。
