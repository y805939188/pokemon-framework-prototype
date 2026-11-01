# 完整捕获接收窄 profile v1

仅 capture.completeReception；固定产品 d6aae8cfa4d706cf976c42aeb3dcc683a252aa03、参考 commit 8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b。发布 v21.1 tag peeled commit ea7b5d56d2436591160983c4e641a2ceee2d875a 分别核验，不要求不同 commit 字节相同。旧 v2.1、354 输入/投影/映射/证据及318一致36差异/严格FAIL均不改。

本版新增独立捕获 workflow，不是把旧低层结果重新映射成一致。普通独立遗忘参考 caller 为 BLOCKED_MATERIAL_IDENTITY，缺普通 caller/事件资产身份，不以 debug 替代，也不阻塞捕获。

## 边界和初态

固定 C01–C09，不删除失败/未完成场景。definitions、输入字节、schema、比较器和实际生产 CJS 闭包同一 freeze；inputs.json 包含每个 case 的完整合成初始 GameState、内容、完整上游队列模板、明确固定 random 序列和政策。参考只按共同字段建立合法实际初态，不照搬TS schema或业务算法；来源A验证原生完整终局caller/接收consumer及实际加载、初态、技术UI边界。所有数据为合成数据，无用户存档/真实名字。构造party/盒子/队列时每个可变个体独立，不能假占位计数。

C01 内部新拥有/队伍有位/保留名；C02 非内部直接完整队列；C03 已拥有/新昵称Sprout；C04 满队自动盒子、Box01满后Box02槽0/治疗；C05 询问BACK按WP38明确送盒；C06 替换P02、幸存者次序/新成员追加、出队者入盒治疗；C07 强制入队BACK先被拒再替换P02；C08 满队自动盒子双成员、顺序处理后重放同一结果，不重新填队列；C09 满队满盒的捕获后安全边界，自动盒模式和保留名后记录真实失败前缀。C09不是投球前置自然可到达性证明。

上游捕获已成功事实由 BattleSessionFactory 端口输入。它不是模拟Showdown，也不验证捕获概率/球数/战中消耗。内部C01等必须真实 startBattle 取得私有上下文，再 finishBattle/resolveReceiving/resolvePokedex；C02明确走公开非内部 commitResult+原始模板和其同一个真实接收/图鉴消费者，不冒充internal=true。App/规则不替换、不stub、无最终状态预填。effects receipt是上游显式合成固定事实，不冒充引擎观察；无伤害/成长/进化后继是本批固定fixture，不能签这些后继功能。

各端每case仅初始化一次。生产 App 的队列载体与原生参考可能不同：TS结果captured数组实际保留，pendingReceiving是活动视图，安装账本防重放；不得根据“已经落位”伪造数组已清空。reference实际队列清空则原样记录；carrier/remaining的不同仍是差异。

## 白名单与保真

schema.mjs 是可执行的闭合JSON Schema子集；冻结 schemas.json 为同一来源导出。所有字段必须自有数据，拒绝额外键、getter、toJSON、重复JSON键、非有限/有损整数、链接/硬链接、路径逃逸或自由raw对象；未知必需字段/变化不可表达则技术BLOCKED，不能丢弃。

StateSchema：party有序≤6；40×30实际槽位与当前盒；真实所有已存在成员及上游队列模板的稳定合成key、物种/形态/PID/性别/闪光、owner/origin/等级经验/昵称、实际HP及实际内容计算HP上限、statusCount、PP/maxpp/ppUps/firstMoves、能力/IV/EV/nature/保护标记/球；dex六事实加实际hasDex/unlocked/view；实际money/inventory/claims/player/badges/steps和储存外观摘要。初态、每次实际调用后/实际请求处和终态读取真实当前状态。不得hash输入代替读回。

所有参与放置的成员和未涉及成员均明文保留核心字段，未声明的extra字段直接拒绝。不能投影的意外改变要阻塞披露而非压平为unchanged。TS专有ownerCompatibilityDefault/origin.compatibilityDefault/statNature/ot/evolutionReadiness的实际变化在unexpectedChanges逐字段记录实际安全标量和摘要；不要求参考有虚构同名内部字段。stats/nextMemberOrdinal/ledger是候选专属可审计提交事实，未纳入两端同表示比较；候选完整初态/执行闭包和实际安装由独立审查核验，不能声称这些内部表示等价。

刷新有明确 carrier/calls/callOrdinals。参考explicit-cache-refresh须包装真实刷新callee计数及其外层原生调用ordinal；候选生产无刷新缓存/刷新方法，按请求推导而非刷新，carrier=derived-on-query-no-cache、真实缓存刷新调用0。不把plan.refreshAccessible布尔转为次数，也不把源与目标carrier不同忽略；本carrier不声称统计所有纯函数计算次数或性能。

原生边界按每次真实外层业务callee记录ordinal/role：terminal-consumer、receive-decision、entry-ack、repeat-consumer。returned pending依然returned；after-call checkpoint绑定当前原生调用ordinal。仅披露闭合selected return字段(type/integerValue/booleanValue/value/status/commit/pending/aborted/code/errorPresent)；integerValue仅安全整数±(2^53−1)、booleanValue仅原生布尔，不赋予成功/取消语义；未列return值不发布、不比较，不凭selected字段相同宣称完整返回值等价。raised仅安全类标识；原始消息/栈留私有。awaiting-input-not-returned必须真实已发输入请求、稳定状态hash/请求证据hash、未返回证明及受控停止证据；timeout/退出/取消/技术异常不能变成等待。原生完整返回值未比较明确写NOT_COMPARED。

workflow保留实际请求/输入、调用后状态顺序、落位和真实queue/完成。不能按phase排序/补齐理想流程。TS没有原生交互请求函数的地方只记录pendingReceiving公共视图，不猜一个名字/放置提示。ACK是实际Pokedex phase的输入；BACK仅运输为WP38规定选择，不写状态。若输入未使用或出现未声明请求，技术BLOCKED。

completed只代表实际完整消费者完成且无必须输入/条目后继；TS须安装账本、全部队列成员实际落位、saveBlocked=false，参考须真实消费者return/队列清空且无剩余输入。异常、pending、部分前缀记录为incomplete，不因进程exit0算成功。C09 incomplete保留，不删分母。

## 技术限额、进程与冻结

每case限30s、stdout16MiB、stderr1MiB，≤16决定、96事件、32checkpoint、32原生callee；冻结前实际TS路径最大C09约6.95MB紧凑JSON，最大8callee/少于20checkpoint（实际值看作者证据），96事件是本九例的显式技术上限，不截断合法事件。超过任何预算技术阻塞，不能加时/重试到绿或丢状态。实际运行由boundedChild启动单个独立worker进程组，只有Node白名单环境，无shell/NODE_OPTIONS/NODE_PATH，固定Node版本；逐case串行，退出/超时/取消/输出超量均回收自有组，保留已知记录前缀及stop精确case，不伪填未跑case。

freeze含本工具、schemas、完整inputs、实际production.cjs唯一依赖闭包；production/testing不重复实现；producerSHA绑定实际produce入口，freeze绑定完整闭包。源码src tree固定1a7f69d39e47a7262a2f7a131d21fbb9ee70bfd5；作者候选Git SHA与构建/工件hash另外封印供独立重建核验。运行时多文件/改字节/不匹配Node/外部loader拒绝。

## 资格、实际父文件、运行和比较

QUALIFICATION.json列12检查维度；每端仅C01正常＋C07必要边界真实smoke，资格和正式共用同一最终核心/闭包/初态/投影，仅case选择不同。非业务身份/路径/错误输入/前置门控制另外列，不冒充Ruby调用。旧12/37资格和旧b670生产器独审不得转授。本阶段仅工具/候选TS自测，O/A未执行。

顺序：独立ultra接受工具及真实producer → O在私有侧同版适配/两smoke → fresh A核来源与新资格/投影/生命周期 → 父clean固定qualification文件的外部hash（A/O真实身份必须父直接核验，JSON self-report不自证） → 父makeParentFiles产生正式实际dispatch/config → 绑定真实D/Q/config字节pins → cli preflight对THOSE文件返回ADMITTED_ZERO_BUSINESS/calls0 → 父派O单轮九例。qualification模式允许authorized显式准入而无需未来qualification；不等于工具独立门可省略。formal模式缺本版新Q、任一false检查/零hash/旧Q/错角色/错闭包，均在业务或行为解析前拒绝。未获得真实资格时仅生成HOLD草稿，绝不用合成Q填入正式配置。

命令（路径由父派发，外部pin不可从未受信文件自读冒充）：

    node tools/cli.mjs preflight <frozen-root> <freezeSHA256> <actual-parent-pins.json>
    node tools/produce.mjs <frozen-root> <freezeSHA256> <actual-parent-pins.json> <new-candidate-only-output>

原O独立参考执行/封存先于candidate。候选包装只读固定TS+inputs，不读Ruby或参考值；不根据参考值改生产业务。完成后A私有审计，再向固定公共目录发布reference-observations.json、candidate-observations.json、execution-audit.json。父先pin外部A审计摘要；cli receive先validate真实D/Q及审计角色/版本/绑定后才读取行为值，接收方仅项目clean协调/比较器/独立ultra。不发Kimi/Claude/GitHub。O/A自己的私有正文不进入clean上下文。

    node tools/cli.mjs receive <root> <freezeSHA> <actual-pins> <ref> <candidate> <audit> <external-auditSHA> <new-receipt>
    node tools/cli.mjs compare <root> <freezeSHA> <actual-pins> <ref> <candidate> <audit> <external-auditSHA> <new-report>

工作流、业务RNG抽样和原生selected事实分列；fixture/setup的实际RNG事实保留但不假定两种初始化实现抽样次数相同。工作流与原生selected事实分列，完整/可比较/未执行分列，正式分母9固定。完整actual数组顺序不排序，不把snapshot/调用层的不同强行映射。任何不同严格FAIL_OR_INCOMPLETE并列实际差异；native未投影值永远NOT_COMPARED，不能用功能近似覆盖它。此窄工具通过不等于九业务通过，不影响原354严格FAIL，也不签完整捕获/5.3/Gen8/5.4。

实际最终父文件生成器（资格完成前仅hold，不写假Q；synthetic控制文件绝不复用到正式）：

    node tools/cli.mjs prepare <root> <freezeSHA> formal hold <new-control-dir> NONE NONE
    node tools/cli.mjs prepare <root> <freezeSHA> qualification authorized <new-qualification-control-dir> NONE NONE
    node tools/cli.mjs prepare <root> <freezeSHA> formal authorized <new-final-control-dir> <actual-Q-file> <external-QSHA>

最后一条先校验真实新Q再创建目录，写实际dispatch/config/parent-pins后立即对这些字节做零业务准入；父另行运行preflight并pin其回执，才派发。公共观察目录固定basename public-capture-workflow-v1-0001，闭合且仅三文件；额外文件/不同目录拒收。未收到真实资格或真实独立工具/候选报告hash，保持HOLD。
