# pre54 六操作：公共状态接收门（不启动观察者）

这是独立于8c业务kit的clean协调工具。目标TS snapshot仍为8c9951c16cad74a595dfd30ac63aa307a5d13eae，freeze ebda61d9abdbc43cb7d3b27857b9b9a0deb5da6877068db105959b41c151555d；控制工具自身候选另行固定/ultra。不要重建或添加文件到旧37payload kit，不把control commit冒作业务source版本。

`binding.json`固定profile/六操作/12资格caseId与hash/354分母、target v21.1/8c5911e、实际kit manifest、source/tree/dirty、预期Ruby3.1.3和O/A中立runId。binding SHA256：`4674654de0ba63b1a717a5eab8c36eaf33951204ecd90fe85ebd1cf3a2a80838`。父端必须从独立review/固定代码取得此带外hash，不能读取观察者发来的binding再“现算现信”。外部固定binding允许测试用明确INFRASTRUCTURE-SELF-TEST夹具；实际生产binding保持8c/dirtyfalse，不使用测试binding。

## 输入和状态范围

public-root只读固定六文件名：observer-readiness.json、source-audit.json、observer-dual.json，以及既有reference.json、candidate.json、handoff.json。private源码/adapter/raw不在读取路由中。配置root是父端可信输入，不从观察者JSON取；父端须按合同先核private/public路径隔离。文件无链接/硬链接/路径别名，有界fd快照、严格JSON和UTF8，异常输出仅固定代码，不回显路径/stack/原始JSON。

readiness/audit/dual.schema.json是按实际绑定生成的闭合分发接口，测试核其与代码schema相同。旧a490 observer-status-v2不被修改或放宽。本次控制schema不属于业务normalizer/mapping，不改变既有六操作输入输出。

- **readiness**：NOT_RUN必须明示12项未调用、随机未知null；封存必须12正常/边界全部真实调用且可表达、真实版本/原方法/加载/轨迹/薄适配/随机证明及非零hash齐全。状态只是待审元数据，不替代A来源审计。资格不要求与TS值相等。
- **audit**：闭合O/A runId与角色必须相异，回执精确绑定readiness文件字节hash、六操作、adapter/来源/加载/执行证据及五角色。自报PASS只有AUDIT_RECEIPT_REQUIRES_PARENT_ACCEPTANCE，不能启动全量；物理独立上下文不能从两个标签证明，父端仍核真实角色/启动记录。
- **dual**：父端经独立A报告后，从带外提供`--accepted-audit`固定回执hash；没有它/不匹配/来源或资格漂移均拒绝。NOT_RUN保留已完成12资格但全量计数0/未知artifact null，不造未来hash。SEALED须354+354、进程成功、参考先封、全量私有执行/加载/方法/随机trace摘要齐全；实际handoff/behavior字节hash及原source/process/数值/案例门全部通过。仍只表示DUAL_ARTIFACTS_READY_NOT_EQUIVALENCE；既有比较器才判断差异，真实合规差异不会被本门抹平。

公共元数据/哈希不证明私有事实为真，也不证明真实新Ruby执行或模型物理独立。A私有审计、父端带外接收与实际执行记录是信任根；本工具不把selfcheck变成来源接受。

## 父端只读调用（不是Codex CLI启动）

从已复审控制候选，裸Node22.21.1：

```sh
node experiments/differential/observer-control/receive.mjs --binding experiments/differential/observer-control/binding.json --expected-binding 4674654de0ba63b1a717a5eab8c36eaf33951204ecd90fe85ebd1cf3a2a80838 --kit <frozen-8c-kit> --public-root <parent-pinned-public-root> --kind readiness
```

kind为readiness/audit/dual；只有dual另加`--accepted-audit <parent-out-of-band-accepted-SHA256>`。缺文件exit3；闭合元数据有效exit0；任何拒绝exit2且不泄漏输入。NODE_OPTIONS/NODE_PATH/execArgv非空拒绝，不能带loader/preload。调用者不能把自己的CLI stdout自检收据当父端正式接收。脚本无模型、Codex/Ruby/GUI/child进程启动，也不修改任何接收文件。

## 自测和验证边界

正式注册在test-pre54-integration.mjs，沿现有单入口test-headless，不增加bootstrap并行。新增fixture均合成，保留INFRASTRUCTURE-SELF-TEST标记；每个负例先构造完整可工作的正控，支持缺字段/私有污染、计数和案例hash、角色/审计外部hash、stale/source drift、真实pub文件/producer/进程门、symlink/hardlink/大小/UTF8/JSON精度与裸Node。实际固定8c kit可单独readiness missing-public-root试接收，exit3不是观察运行。

此阶段没有O/A/Ruby真实业务、外部agent或模型通信，不签G3/G4。原128设施/来源/退出/进程回收断言不删，不用新状态代码代替business门。

## 平台限制继续有效

C线公共BLOCKED-RESULT已明确：Codex CLI的require_escalated启动因protected/root/.codex初始化风险两次拒绝，第二次是在HOME为dingshinn且/root/.codex不存在的事实后仍拒。本批新材料授权没有解除该限制。新O/A若需要同一受保护动作，本任务不尝试CLI、不改HOME/CODEX_HOME或存储、不以其它agent/API/间接路径绕过；只交公共控制候选给ultra。父端需平台正式解决，不能要求用户为无关/root目录追加泛授权。

两个角色及共享/本地保留合同在工作区.handoff/ruby-ts-pre54-observer-contracts-20261030T105941Z，原封印不改。执行门就绪且平台许可允许后，由父端先12readiness→独立来源审计→父接收→354正式双端。原增长/友好度资格不继承，main/5.4 C/私有原文件不修改。
