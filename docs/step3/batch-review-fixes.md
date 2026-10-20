# 短架构批次复核后的限定修复（作者自测候选）

2026-10-20，Codex 修复作者。用户已授权接手，Claude 停止。本轮请求配置为 gpt-6.1-sol / xhigh / Standard；环境没有可核验的模型、推理或服务档位回显，**不宣称隐藏配置已验证**。未起子代理。

这是对 `.independent-reviews/step3-batch-opus-20261019/REPORT.zh.md` 六项发现的限定修复，不是独立复审结论，不重开历史全局 review。后续由父会话安排非作者复审，再交用户/Claude 验证。本轮未推送、合并或打/移动标签，未进入第四步。

## 固定对象与可回退提交

- 实际核对本地与公开远端 refs：`main` / `origin/main` / `step3-closed^{}` = `4ce31e119de69067100e570c0ed41298539cf841`；`step3/arch-batch` / `origin/step3/arch-batch` / `step3-batch-candidate^{}` = **`47523bedba8010507832fc7dbbd7b10c5c49036c`**。原树干净，未切换、reset、clean 或 stash。
- 新分支 `fix/step3-batch-review-20261020`，独立 worktree `<workspace>/.worktrees/step3-batch-fixes-20261020`，直接从上述真实候选创建。原树、规格库和既有 worktree 均保留；未访问 Ruby 或 `observation-growth/workspace/`。

| 提交 | 内容 |
|---|---|
| `440902e6baa5a79b19bd9b3da4bfce60a5a78180` | 应用结果预检、插件初始化失败清理、Node 回归与真实宿主 T13/T14 |
| `2bdbc8d46c599286d90278838a1b24dee4a31a97` | 检查器限定收紧与六项回归 |
| **`5d8f7e717f830b96fa1cb388232b53c2b12af24e`** | T14 测试选择器使用真实显示名 `Master Ball`；这是最终被测代码 SHA |
| 本报告所在的后续文档/证据提交 | 只更新文档和证据；最终精确头见共享 STATUS 与交付消息 |

回退用 `git revert`，顺序为最后的文档/证据提交 → `5d8f7e7` → `2bdbc8d` → `440902e`。不 reset、不改旧标签；原候选和 main 从未改动。

## 发现核实与处理

| 原发现 | 核实及处理 | 回归 |
|---|---|---|
| 1，P3，初始化失败留下上一场结果 | 确认。插件的宿主投影抽成 `projectOutcome`，正常端口与初始化失败兜底共用。应用构造不出来时也写变量 0、保留 battleId/原错误、释放解释器等待；只有实际投影抛错才标 `projection: failed`，不再把初始化错误误标成投影错误 | 新 `test-plugin-abort.cjs` 4 项：engine 加载失败、dex 初始化失败、terminate、变量写入也失败。后者保留真实投影错误并释放等待，不假称变量已归零。真实 T13 从 `Module._load` 注入 dex 加载失败，两次构造均失败而变量 0、状态未变、事件继续 |
| 2，P3，缺 outcome 后提交再抛错 | 确认，正常 BattleSession 当前不会产生，但端口契约须自守。应用在 `commitResult` 写状态前验证 outcome 为对象、kind 为非空字符串、winner 为字符串或 null；`finishBattle` 在 try 中先读取并计算所有结束投影字段再提交。合法 kind 的旧映射仍保留，不新增枚举限制。投影在提交后失败仍报告已提交，不撤销/重发奖励 | 应用新增 1 项循环覆盖 missing/null/空对象/数组/错误 kind、winner；finish 重试与直接 commit 都不能部分提交，修正结果后仅提交一次。真实 T14 对已捕获的真实 session 返回值移除 outcome，检查球、捕获、账本未变；修正重试 applied，再重试 already-applied |
| 3，P3，应用经 flow/session、任意根文件接线 | 确认是机器约束缺口，现有 app 未穿透。app 从 flow 只能引 `content-runtime.ts`，该服务自身只能引 rules/content，阻断间接桥接；根文件只允许 `index.ts` / `composition.ts`。未重写默认驱动或应用架构 | imports/re-exports/动态字面量 import、content-runtime 间接引 session/battle、新根文件均拒绝；现有合法接线通过 |
| 4，P4，宿主全局遗漏与属性误报 | 确认。补常用编码器、计时器、调度、clone、fetch、console/globalThis 等宿主名；全局名检查排除普通属性键和成员名，仍检查简写值与计算表达式。动态 import 必须是可检查的字符串字面量 | 五个纯层逐名检查，属性/类型属性/方法/解构别名不误报，简写与计算表达式违规；非字面量动态 import 拒绝 |
| 5，P4，性能措辞与试跑来历 | 确认。表中少数非冷启动遍中位数超过基线中位数上界：+0.5 ms、+0.2 ms、+1 MB、最大 +2 MB，仍在基线单遍样本范围内。已改批次报告与 perf-compare，说明 `e6f799d` 的 161 ms 试跑包含内容加载，以及 `cd0fc0b` 的计时修正与尚有口径差异 | 只核对历史读数和文档，未重测修复代码性能；不借历史读数宣称新修复无退化 |
| 6，P4，表格与中止 battleId 盲区 | 确认。债务表恢复三列，移除已过时的“尚未做核心无 Node 编译”，补修复去向；中止结果增加非空/空 request 的 battleId 断言 | 把 abort battleId 改成 null 的定向变异被新断言杀掉（`null !== 'x#1'`）；T13/T14 也断言真实宿主 battleId |

同时澄清端口文档：`replace()` 若抛错必须保留旧状态（端口拥有者的原子性责任）；投影失败与是否提交是两个独立维度。没有尝试对违约的“先写后抛”状态端口做补偿事务。

未机械接受为新功能要求的观察：生产入口导出 fakes/scripted、组合根默认从 fixtures 构造敌人，都是现有原型选择，本轮没有由此发现运行错误，保留。`flow/session.ts` 仍默认 import Showdown 工厂、其余 flow/UI 的 any、保存阶段守卫和奖励凭证等既有后置项不扩展。检查器保持保守静态约束，不是完整词法绑定分析或任意恶意代码的隔离沙箱；例如同名局部绑定仍可能被保守拒绝。

## 先红后绿与本地验证

证据统一在 [`experiments/step3/evidence/batch-review-fixes/`](../../experiments/step3/evidence/batch-review-fixes/)，路径已遮蔽；完整原始输出与测试保存仅留在 `<workspace>/.verify/step3-batch-fixes-20261020/`，不入库。原复核报告只读。

| 实际动作 | 结果与证据 |
|---|---|
| 候选 `47523be` 运行时代码 + 新定向测试（测试文件当时未提交） | `functional-before.tap`：18 项中 13 过、5 败，包含 TypeError 和变量 `1 !== 0`；独立原探针 `finish-before.jsonl` 明确 missing/null outcome 均为 replaced=1、projected=0 后抛错。初始默认 shell 的 Node 为 22.14.0；这组红测没有另行保存旧 bundle 哈希，不借它标记最终宿主身份 |
| 修复后定向应用/插件回归 | `functional-after.tap`：18/18；最终 quick 在指定 Node 22.21.1 上再次覆盖相同测试 |
| 旧检查器 + 六项新增测试 | `boundaries-before.tap`：25 过、6 败；`boundaries-after.tap`：31/31 |
| abort battleId 定向变异 | `abort-id-mutation.tap`：1 项预期失败，明确失败在 battleId 断言；使用内存编译的 bundle 变异，未改工作树源码 |
| `scripts/test-quick.sh` | **26 套件 212/212 通过**，`test-quick.txt`；含应用契约 14、插件兜底 4、边界 31、摘要/裸 core、旧账本、冻结协议、矩阵与原失败封闭套件 |
| `pnpm --dir src build` | **通过**，`build.txt`。最终 quick/构建均显式选 `~/.nvm/versions/node/v22.21.1/bin` 到 PATH；pnpm 10.20.0 |
| `git diff 47523be..5d8f7e7 -- src/framework/rules experiments/step2 js/engine/fixtures content data` | 空：canonical JSON/SHA-256、核心/账本、协议与原矩阵基线未改，不更新任何冻结文件 |

新增插件 Node 套件在临时目录编译真实 TS 插件，再在 vm 的 MZ 桩环境加载；不依赖预先生成的插件、Reactor 运行时或 Showdown。已加入 headless 套件列表，CI 能在未安装 Reactor 类型包时运行它。离线 pnpm install 因本机 store 缺 pixi.js tarball 失败，后改为从原树只读复制 node_modules 与忽略运行依赖到独立树；没有下载或更换依赖版本。初始临时构建缺 Vite 的失败不是功能红测，正式留存的红测已在依赖齐备后重跑。

## 新代码的真实宿主与包内证据

所有最终运行均在 **`5d8f7e717f830b96fa1cb388232b53c2b12af24e`，工作树干净**；测试前/后 `identity-*.json` 均记录空 status、空 diff 的 SHA-256 `e3b0c442…`、精确代码 SHA、可执行文件及产物哈希。原有开发树报告缺提交身份的盲区由本轮旁证补齐，未借旧哈希充当新通过。

环境实测：macOS arm64；NW.js **0.117.0**，其 Node **26.7.0**，Chromium **154.0.8037.58**，V8 **15.4.80.11**；本地 headless Node **22.21.1** / pnpm **10.20.0**。Showdown `7244fe8e28fa8bc4d0809ae30d183c608b62bb2b`。

| 产物 | 最终 SHA-256 |
|---|---|
| `engine.cjs` | **`ed52a870fadf3cfec95072c7c9ce4d208dea8ed99443013a125fdc60cdc809a1`** |
| `core.cjs` | `d80bc987f89d79241a7a2bc25c4a516b19c56a31ce06fc83393e4bcbe25b50cf` |
| `custom-formats.cjs` 及 Showdown 暂存拷贝 | `b7a0412ea2cd72d3371ee2fb409f09c7a2de893bb422d9034dafe0f8acf54ec8` |
| `PS_BattleFlow.js` | `5e700e8ad5e9644c927590a5359c211720c4de66de0136bfce5152b7ed77dbcb` |
| `PS_BattleFlowTest.js` | `825d611a7633f9d27584da69317ab317ee0c64325fdf13411dfb8ce77a5b4464` |

应用层修复进入 engine bundle，所以原 `2a66c938…` 哈希应当变化；core、Showdown 扩展和 `inputsHash` 保持不变，后者仍为 `c322d83047dc4c5b09823384d0250b6ccc8e89b7bb7e2e2875b8fde94f2b6625`。

- **开发树通过**：T1–T14，V1 真进程重启读档。`dev-final/ps-flow-report.json`、`dev-final/ps-flow-verify-save.json` 与身份旁证。
- **包内通过**：`scripts/package-mac.sh --with-tests` 构建、ad hoc 签名；T1–T14、V1、S1–S10，包内 packageInfo 的 gitHead 是上述代码 SHA、workingTreeChanges=0；与 Node 的十个矩阵指纹及加载引擎哈希逐个相同（`matrix-comparison.json`）。运行后 `codesign --verify --deep --strict` 退出 0（`package-seal.json`）。
- 首次开发树在 `2bdbc8d` 上 T1–T13/V1 通过，T14 因测试选择器 `/masterball/i` 未匹配实际 `Master Ball` 而失败。原失败报告留在 `dev/`，没有当作产品通过；修正选择器提交 `5d8f7e7` 后完整重跑上述最终证据。
- 实际运行器是 `.verify/step3-batch-fixes-20261020/run-host.py dev-final` 与 `.../run-host.py package`。入库副本 `run-host.py` 仅遮蔽路径，原脚本保留可直接重跑。直接启动本机 NW.js 或包内的 NW.js 可执行文件，传入独立 `--user-data-dir` / `--ps-save-dir`；**没有用 LaunchServices `open` 启动**。不调用原包测试脚本中的 `pkill -f`，仅等待/停止自己 `Popen` 的 PID。本次所有 7 个自启根进程均退出 0，结束后按精确 PID 核对均不存在。

打包复测范围依据：修改的是应用结束契约与插件失败清理，故复测包内流程/异常、读档幂等性、矩阵一致性与签名封印；打包脚本、保存位置插件均未改，**未重跑替换包、默认保存位置 SL1、LaunchServices 启动、性能/内存**。不宣称完整包内套件全通过，不沿用旧 SL1 或旧性能作为新代码证据。全部存档在证据目录，没有使用玩家存档槽或 Claude 窗口，也未终止他人进程。

## 交给非作者的复审范围

只看 `47523bedba8010507832fc7dbbd7b10c5c49036c..fix/step3-batch-review-20261020`；最终文档头可从 STATUS 的完整 SHA 固定。运行时代码为 `47523be..5d8f7e7`，之后只有文档/证据。重点文件：

- `src/framework/app/game-application.ts`、`ports.ts`：预检在状态提交前，投影失败保持 commit 事实，状态端口原子性前提。
- `src/plugins/PS_BattleFlow.ts`：初始化失败独立归零；`PS_BattleFlowTest.ts`：T13/T14 的真实路径与可恢复注入。
- `experiments/step3/test-application.cjs`、`test-plugin-abort.cjs`、`scripts/test-headless.sh`：异常/幂等回归与无 Reactor 的插件编译测试。
- `scripts/check-boundaries.cjs`、`scripts/tests/check-boundaries.test.cjs`：app 的 flow 例外下层闭包、入口限制、属性不误报和动态 import。
- 文档为本报告、PROJECT-GUIDE、step3/README、architecture-batch、历史 perf-compare；其余新增均为本轮证据。

建议复验命令：`node --test experiments/step3/test-application.cjs experiments/step3/test-plugin-abort.cjs scripts/tests/check-boundaries.test.cjs`；`scripts/test-quick.sh`；`pnpm --dir src build`。宿主可按原运行器在隔离路径重做，代码状态与产物哈希须重新记录。

**剩余：独立复审未执行；此次未推送，最终新 SHA 在线 CI 未执行，待获准推送后核对**（当前 fix/* 分支不会触发仅匹配 main / step3/** 的 push CI，可由获准创建的 PR 触发；本轮不擅自推送/改 workflow）。Windows/Intel、公证、双打、第四步玩法均未执行。当前没有权限或运行时阻塞；本轮交付停在作者自测候选。
