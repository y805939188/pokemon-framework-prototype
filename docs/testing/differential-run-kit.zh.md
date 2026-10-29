# Ruby / TS 通用对照 run-kit（observer 启动合同）

本 kit 是黑盒执行包，不是运行通过收据。作者只完成 TS 与基础设施自测；reference 的读取/执行由协调者另开的独立 observer 完成。在 observer 实际执行且共享 gate 通过前，新 Ruby 执行始终为 `NOT_RUN`。历史 growth 3504 仅为单独的 frozen replay，不计入本 kit 的 actual dual run。

## 固定环境和资源边界

- Node：v22.21.1；构建工具记录：Vite 8.3.1、TypeScript 7.0.2。
- 两个 runner 都用 argv 数组直接启动，`shell:false`；不使用 shell 命令字符串。
- 默认每端 timeout 30,000 ms、stdout 16,777,216 bytes、stderr 1,048,576 bytes。私有配置可在 schema 允许范围内收窄/调整，实际值写入每端收据。
- timeout/输出超限只 SIGKILL 回收该 runner 自己创建的进程组。任何 timeout、signal、非零退出、输出超限或非空 stderr 都失败，合法 JSON 不能覆盖。
- stdout 只允许一个完整 JSON envelope；日志拼接、多 JSON、空输出、schema 错、重复/缺失/额外 case 均失败。数字 token 在转换前后还必须保持十进制身份，下溢、分数精度舍入、非有限值、负零和 unsafe integer 均拒绝，不能先变成 0/整数再比较。超限 raw 流只保留已接收前缀并标记 truncated，仍不得 PASS。
- 退出码：`0` 仅对应命令定义的成功；`1` 为行为差异或运行失败；`2` 为 kit/schema/gate/config 拒绝；`64` 为命令行用法错误。`run-dual` 的执行失败不是 PASS，仍须另跑 compare 固定失败报告。

## 文件与封印

`artifacts.manifest.json` 对全部 payload 记录 path/bytes/SHA-256；`freeze.json` 再封印 manifest、完整 request、selection-coverage、schema、normalizer 和 mapping。交付方另给 `freeze.json` 的文件 SHA-256（下称 `FREEZE_SHA256`），observer 必须显式传入，不能只信包内自报 hash。candidate 行为包的 commit/tree/dirty 与 core/runner hash 必须逐项等于此 manifest；reference commit/tag 固定为本轮 `8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b` / `v21.1` 目标，实际 loaded-file hash 由 observer 产生。

实际文件集必须等于静态 allowlist。额外文件、符号链接、`.ts/.tsx/.mts/.cts`、`.map`、inline/external `sourceMappingURL` 均拒绝。kit 含编译后的 `core/core.cjs` 和 `runners/ts-runner.mjs`，不含产品 TS 源或 source map。`requests/wp30-r2.json` 是完整冻结输入，不含期望输出；`requests/selection-coverage.json` 是逐 API/方法/配置/边界的完整 caseId 清单。

## 独立 observer 准备

1. 将 kit 复制到 observer 自有的新目录；不要从作者工作树引用任何运行文件。
2. 将 `config/runners.template.json` 复制到 observer 私有目录，替换 reference 的 `{}` 占位符、零 hash 和 `UNVERIFIED`。该私有配置包含两个完整 argv、cwd、输出目录和公开元数据；candidate 公开元数据由 run-dual 从实际 verified kit manifest/artifacts 派生，不信任外部声明。
3. reference 适配器从文件加载，接受 `--request <request.json>`，stdout 写唯一 `runner-response-v1`。不要使用 `-e`、`--eval`、`-c` 内联实现；完整 reference argv、原文件路径、替身细节、stdout/stderr 和异常诊断只留私有收据，绝不写入公开包或公开报告。
4. observer 独立核验固定 reference commit/tag、实际运行时版本、loaded-file role hash 和替身边界。无法核验或宿主不支持即 `BLOCKED/NOT_RUN`；不改业务 oracle、不改输入或映射求收敛。
5. candidate 只接受约定 Node 与固定 argv `runners/ts-runner.mjs --request requests/wp30-r2.json --core core/core.cjs`，且 cwd 的 realpath 必须等于 verified kit 根；外部 runner/core/request/fixture 或错 cwd 在任何 runner 启动前拒绝。reference argv 完全由 observer 私有配置，两边都必须产生同一 request 的全量 case。
6. private/public 输出目录先建空再按 realpath 检查，必须不同且互不包含；同路径、相对/symlink 别名、双方祖先嵌套（含缺失末级）均零 child 拒绝。公开目录发布 handoff 前只允许 `reference.json` 与 `candidate.json`，完成后只增加 `handoff.json`，RNG/其他阻塞仍不伪造 handoff。

公开元数据只允许中立 entry ID、角色化文件 hash、闭合运行时/依赖版本与执行计数/hash。公开包没有 argv、路径、消息、堆栈或自由文本字段。公开关联仅 `caseId + requestHash`，clean 输入由 comparator 自己从 kit 加载。`run-dual` 另发布闭合 `handoff.json`，只列 reference/candidate entry ID 与两个行为文件的 SHA-256；observer 发布其文件 hash，接收方固定为 `HANDOFF_SHA256`，比较报告关联这些已核行为工件。

## 准确启动顺序

以下 `$KIT` 是 observer 自有 kit 目录，`$PRIVATE_CONFIG` 是私有双 argv 配置，`$PUBLIC_RUN` 是新的公开行为包目录，`$REPORT` 是尚未存在的报告路径。Node 可写绝对路径，但该路径和 reference argv 不得复制进公开收据。

```bash
node "$KIT/verify-kit.mjs" --kit "$KIT" --expected-freeze "$FREEZE_SHA256"
node "$KIT/run-dual.mjs" --kit "$KIT" --expected-freeze "$FREEZE_SHA256" --config "$PRIVATE_CONFIG"
node "$KIT/compare.mjs" --kit "$KIT" --expected-freeze "$FREEZE_SHA256" --handoff "$PUBLIC_RUN/handoff.json" --expected-handoff "$HANDOFF_SHA256" --reference "$PUBLIC_RUN/reference.json" --candidate "$PUBLIC_RUN/candidate.json" --out "$REPORT"
```

第一条和第三条是各自独立的机器 gate；第二条生成公开包前也自检，但不能替代第三条 clean 端复核。compare 在解析任何行为正文前先核 expected-handoff 与两个行为文件的实际 SHA-256。第二条若因过程执行失败返回 1 但仍产生完整 handoff，则执行第三条固定 `RUN_FAILED`；若显示 `RUN_BLOCKED` 或缺 handoff，则整次保持 BLOCKED，不挑选单侧包或旧 handoff 消费。配置/元数据门拒绝后使用全新输出目录，不修改期望消差。

## raw outcome 与公开投影

私有 raw case 保留 `kind=class=raw` 三元组：正常 `value`、返回的 `error-object`、抛出的 `raised` 分开；过程 `process-error`、`timeout`、`protocol-error` 位于执行层，不转换成 case 值。异常 class 原始保留，私有 raw 可含完整错误对象/诊断。

公开包只含操作白名单投影：数值、friendship before/after/delta、有序 steps、affection、闭合错误 code 与 raw kind/class。Ruby 状态变化到 TS plan.after 的投影已事前登记为 `ruby-state-change-to-ts-plan-after-v1`。额外 raw 字段、未知形状或不能闭合表示的自由文本使整端 protocol/gate 失败，不做关键词删除。

本批无随机输入：`seed=null, drawCount=0, draws=[]`。若实际 reference 发生随机消费，私有 response 保留真实 bound/value/order，该侧公开行为包和整次 handoff 均不发布，run-dual 返回 `RUN_BLOCKED`；先另定可复现输入契约，不得伪填 0 或兜底发布空 trace。

## 比较与覆盖口径

只有 kit/freeze/handoff/行为工件 hash/schema/白名单/request 关联全部通过，compare 才读取行为字段。任一侧缺失、过程失败、case 不完整或元数据不全均不 PASS。value/error-object/raised/process-error 永不合并；只有 mapping 中具体操作+输入域+raw kind+双方 class 的冻结映射可按具名粒度比较，raw class 仍在报告保留。当前 approved differences 与 classifications 均为空，作者不能批准真实差异。

覆盖以 growth 四 API、friendship 13 方法×13 初值×16 配置、affection 256 输入和具名序列为分母，另列额外/拒绝域。请求条数不是 WP30、FR 或 routing 736 单元的功能覆盖百分比；未执行、gate 失败、timeout 和 host unsupported 均不计 actual dual run。
