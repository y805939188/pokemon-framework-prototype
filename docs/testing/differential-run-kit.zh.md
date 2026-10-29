# Ruby / TS 通用对照 run-kit（observer 启动合同）

本 kit 是黑盒执行包，不是运行通过收据。作者只完成 TS 与基础设施自测；reference 的读取/执行由协调者另开的独立 observer 完成。在 observer 实际执行且共享 gate 通过前，新 Ruby 执行始终为 `NOT_RUN`。历史 growth 3504 仅为单独的 frozen replay，不计入本 kit 的 actual dual run。

## 固定环境和资源边界

- Node：v22.21.1；构建工具记录：Vite 8.3.1、TypeScript 7.0.2。
- 两个 runner 都用 argv 数组直接启动，`shell:false`；不使用 shell 命令字符串。
- 默认每端 timeout 30,000 ms、stdout 16,777,216 bytes、stderr 1,048,576 bytes。私有配置可在 schema 允许范围内收窄/调整，实际值写入每端收据。
- timeout/输出超限只 SIGKILL 回收该 runner 自己创建的进程组。任何 timeout、signal、非零退出、输出超限或非空 stderr 都失败，合法 JSON 不能覆盖。
- stdout 只允许一个完整 JSON envelope；日志拼接、多 JSON、空输出、schema 错、重复/缺失/额外 case 均失败。超限 raw 流只保留已接收前缀并标记 truncated，仍不得 PASS。
- 退出码：`0` 仅对应命令定义的成功；`1` 为行为差异或运行失败；`2` 为 kit/schema/gate/config 拒绝；`64` 为命令行用法错误。`run-dual` 的执行失败不是 PASS，仍须另跑 compare 固定失败报告。

## 文件与封印

`artifacts.manifest.json` 对全部 payload 记录 path/bytes/SHA-256；`freeze.json` 再封印 manifest、完整 request、schema、normalizer 和 mapping。交付方另给 `freeze.json` 的文件 SHA-256（下称 `FREEZE_SHA256`），observer 必须显式传入，不能只信包内自报 hash。

实际文件集必须等于静态 allowlist。额外文件、符号链接、`.ts/.tsx/.mts/.cts`、`.map`、inline/external `sourceMappingURL` 均拒绝。kit 含编译后的 `core/core.cjs` 和 `runners/ts-runner.mjs`，不含产品 TS 源或 source map。`requests/wp30-r2.json` 是完整冻结输入，不含期望输出。

## 独立 observer 准备

1. 将 kit 复制到 observer 自有的新目录；不要从作者工作树引用任何运行文件。
2. 将 `config/runners.template.json` 复制到 observer 私有目录，替换全部 `{}` 占位符、零 hash 和 `UNVERIFIED`。该私有配置包含两个完整 argv、cwd、输出目录和公开元数据。
3. reference 适配器从文件加载，接受 `--request <request.json>`，stdout 写唯一 `runner-response-v1`。不要使用 `-e`、`--eval`、`-c` 内联实现；完整 reference argv、原文件路径、替身细节、stdout/stderr 和异常诊断只留私有收据，绝不写入公开包或公开报告。
4. observer 独立核验固定 reference commit/tag、实际运行时版本、loaded-file role hash 和替身边界。无法核验或宿主不支持即 `BLOCKED/NOT_RUN`；不改业务 oracle、不改输入或映射求收敛。
5. candidate argv 使用 kit 内相对路径并以 kit 为 cwd；reference argv 完全由 observer 私有配置。两边都必须产生同一 request 的全量 case。

公开元数据只允许中立 entry ID、角色化文件 hash、闭合运行时/依赖版本与执行计数/hash。公开包没有 argv、路径、消息、堆栈或自由文本字段。公开关联仅 `caseId + requestHash`，clean 输入由 comparator 自己从 kit 加载。

## 准确启动顺序

以下 `$KIT` 是 observer 自有 kit 目录，`$PRIVATE_CONFIG` 是私有双 argv 配置，`$PUBLIC_RUN` 是新的公开行为包目录，`$REPORT` 是尚未存在的报告路径。Node 可写绝对路径，但该路径和 reference argv 不得复制进公开收据。

```bash
node "$KIT/verify-kit.mjs" --kit "$KIT" --expected-freeze "$FREEZE_SHA256"
node "$KIT/run-dual.mjs" --kit "$KIT" --expected-freeze "$FREEZE_SHA256" --config "$PRIVATE_CONFIG"
node "$KIT/compare.mjs" --kit "$KIT" --expected-freeze "$FREEZE_SHA256" --reference "$PUBLIC_RUN/reference.json" --candidate "$PUBLIC_RUN/candidate.json" --out "$REPORT"
```

第一条和第三条是各自独立的机器 gate；第二条生成公开包前也自检，但不能替代第三条 clean 端复核。第二条若因执行失败返回 1，仍保存 raw/公开失败包，并执行第三条以固定 `RUN_FAILED`；若第二条在配置/元数据门拒绝，则修复配置后使用全新输出目录，不挑选旧包中的可用部分。

## raw outcome 与公开投影

私有 raw case 保留 `kind=class=raw` 三元组：正常 `value`、返回的 `error-object`、抛出的 `raised` 分开；过程 `process-error`、`timeout`、`protocol-error` 位于执行层，不转换成 case 值。异常 class 原始保留，私有 raw 可含完整错误对象/诊断。

公开包只含操作白名单投影：数值、friendship before/after/delta、有序 steps、affection、闭合错误 code 与 raw kind/class。Ruby 状态变化到 TS plan.after 的投影已事前登记为 `ruby-state-change-to-ts-plan-after-v1`。额外 raw 字段、未知形状或不能闭合表示的自由文本使整端 protocol/gate 失败，不做关键词删除。

本批无随机输入：`seed=null, drawCount=0, draws=[]`。若实际 reference 发生随机消费，私有保留 bound/value/order，公开端整侧 protocol-error，保持 BLOCKED；先另定可复现输入契约，不得伪填 0 后继续 PASS。

## 比较与覆盖口径

只有 kit/freeze/hash/schema/白名单/request 关联全部通过，compare 才读取行为字段。任一侧缺失、过程失败、case 不完整或元数据不全均不 PASS。value/error-object/raised/process-error 永不合并；只有 mapping 中具体操作+输入域+raw kind+双方 class 的冻结映射可按具名粒度比较，raw class 仍在报告保留。当前 approved differences 与 classifications 均为空，作者不能批准真实差异。

覆盖以 growth 四 API、friendship 13 方法×13 初值×16 配置、affection 256 输入和具名序列为分母，另列额外/拒绝域。请求条数不是 WP30、FR 或 routing 736 单元的功能覆盖百分比；未执行、gate 失败、timeout 和 host unsupported 均不计 actual dual run。
