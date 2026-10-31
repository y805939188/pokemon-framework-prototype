# pre54观测协议v2.1：原生返回事实、稳定等待与派发顺序

这是独立工具批次，不改变产品实现、原354输入、v1 schema/normalizer/mapping、旧kit或历史结果。详细合同见`experiments/differential/observation-v2/CONTRACT.zh.md`。当前只完成clean工具自测，尚待独立ultra；新版O/A资格、真实Ruby和正式354均未执行。

适用范围：六操作的真实返回/异常仍用原投影，learning.forgetting新增稳定输入边界的not-returned观察及安全整数原值＋实际moves状态载体。整数没有已批准的成功/取消枚举语义，不能猜填status；已观察例不外推剩余22。真实返回pending和未返回等待严格不同。等待须有实际输入请求、完整状态/部分效果、来源/trace、无后台推进及技术退出清理证据；不能根据无stdout/超时推断等待。任何超出moves白名单的效果无法完整证明，必须阻塞。

工具实现：

- `schema.json`：闭合raw/public观测、整数返回事实/实际状态、等待状态、审计回执和独立freeze。
- `protocol.mjs`：原值与实际状态保真、旧返回投影复用、等待验证、失败未知状态、比较和计数。
- `dispatch.mjs`/`dispatch-plans.json`：固定12/25/37/354计划，父pin的A审计绑定planId；实际前缀停止、原354输出顺序。不能把先前真实观测改为NOT_RUN。
- `bundle.mjs`/`build.mjs`：复制并验证不变的旧kit，冻结新工具及其公共依赖；拒绝覆盖旧目录。
- `receive.mjs`/`compare.mjs`：固定public文件、外部freeze/审计摘要、来源和JSON安全门。

默认严格比较，未加任何差异批准/错误映射。总分母354保留。returned、raised、awaitingInput、nativeCompleted、businessIncomplete、businessCompletionUnattested和unobserved分别报告；没有“工具退出0就业务成功”的口径。BLOCKED保留已比较子集及真实差异；双方都unsupported也不算相等。进程失败或不能确认RNG时为null，不补零或伪造case。

本地可重跑（Node22.21.1；显式输入固定kit，不自动找残留产物）：

```sh
PF_PRE54_LEGACY_KIT=/absolute/fixed-candidate-neutral-kit node --test experiments/differential/test-observation-v2.mjs experiments/differential/test-observation-dispatch.mjs experiments/differential/test-pre54.mjs
node experiments/differential/observation-v2/build.mjs --legacy-kit /absolute/fixed-candidate-neutral-kit --out /absolute/NEW-bundle
```

bundle中的旧core/runner字节不变；tool依赖不含第二份core/runner。仅给新freeze，不替换原v1 freeze。输出目录必须不存在，采用真实路径，不用符号链接/硬链接；失败目录保留为历史，不原地刷新。

接受后由父协调创建新公开目录`public-observation-v2-1-0001`，只含三个固定文件：`reference-observations.json`、`candidate-observations.json`、`execution-audit.json`。O/A私有资料不可放进该目录。独立A最终审计回执绑定同一新版freeze、最终adapter、新资格、dispatchPlanId和两端公开包字节，父端另核真实任务身份并提供回执SHA；旧12不能转授。

```sh
node NEW-bundle/tools/observation-v2/receive.mjs --bundle /absolute/NEW-bundle --expected-freeze FREEZE_SHA256 --public-root /absolute/public-observation-v2-1-0001 --expected-audit AUDIT_SHA256
node NEW-bundle/tools/observation-v2/compare.mjs --bundle /absolute/NEW-bundle --expected-freeze FREEZE_SHA256 --public-root /absolute/public-observation-v2-1-0001 --expected-audit AUDIT_SHA256
```

使用已经核验的固定工具入口；Node加载门不是OS沙箱，也不能从自报metadata证明独立来源。不要启动未知/被篡改工具再把它自检当执行隔离。工具库的比较报告标为library-only，正式CLI门还须绑定父pin审计。

执行顺序保持一次收敛：clean候选ultra→父接受→O固定新版私有adapter并完整重跑12/原25→A增量来源/稳定请求/状态/清理/RNG审计→父限定接受→正式354及最终执行审计→clean固定门接收/比较与独立复审。任何必需不可表达保留分母并停止，不继续全文方案循环。本批不启动这些真实步骤，也不推送/合并。

版本边界：v2.1协议/审计/normalizer/freeze显式升级，旧5fac437与v1/v2证据保留，不自动转授。新整数分支只用于learning.forgetting的实际安全整数返回；类型、状态或证据不完整必须阻塞，不按输入补造。不支持的必需控制保留总354及已发生的前缀事实；25计划的未运行项与计划外329项分别计数。新工具冻结包含73个payload（原71加2个派发表文件），legacy-kit39及其中37payload字节不变。
