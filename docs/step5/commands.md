# 第五步命令与作者入口（5.0 起）

第四步的命令表（[../step4/commands.md](../step4/commands.md)）继续有效。下面只列 5.0 新增或改变的部分。

## 内容

| 入口 | 用法 | 说明 |
|---|---|---|
| 形态记录 | `species.json` 的记录加 `"form": <1–999>` | 形态 0 是基础形态，每个 ID 必须有；（ID, 形态）唯一；overlay 用 `"target": "species/<id>/<form>"` |
| 来源使用前核对 | `sources.json` 条目加 `"usageCheck": {"checkedOn": "YYYY-MM-DD", "checkedBy": "...", "conditions": "...", "decision": "use-allowed" \| "internal-use" \| "not-allowed"}` | 物种或领取引用一个来源前必须先有核对记录；明确的作者占位（`kind: author-placeholder` + `status: placeholder`）不受阻塞。来源种类新增 `author-data`（作者自己提供的数据） |
| 规则配置 | 可选 `settings.json`，例如 `{"NUM_STORAGE_BOXES": 40, "MAX_PARTY_SIZE": 6}` | 本版读 `MECHANICS_GENERATION`（只能 8）、`MAX_MONEY`、`MAX_PARTY_SIZE`（1–6）、`NUM_STORAGE_BOXES`、`BAG_MAX_PER_SLOT`；未知键或越界在编译时定位报错 |
| PBS 导入 | `node js/engine/build/content-cli.cjs import-pbs --file=<pokemon.txt> --source=<来源ID> [--src=content/sample] [--report=build/pbs-import.json]` | 来源必须已在 `sources.json` 并有允许使用的核对记录，否则什么都不写。只写报告文件（物种记录＋逐条记录的“未导入/后续批次/忽略/覆盖/缺省”），由作者把记录并进 `species.json` |

## 存档

- **当前 schema**：schema 4。成员带 `form`，图鉴记内容 ID，另有 `stats`（74 个字段）和 `steps`。
- **旧存档迁移**：schema 3 及更早的存档在读档时迁移，需要当前内容的物种映射。
  - **内容读不了**：`_psSaveError.code` = `needs-content`。
  - **有物种映射不到**：`unmapped-species`，`problems` 列出每个位置。
  - **原始状态保留**：两种情况都原样保留原始框架状态，并拒绝之后的任何存档（`state-unusable`，写明槽号），原存档文件不被覆盖。新游戏或读入可用的存档后解除。

## 插件

- **计步**：玩家每走一步，框架步数加 1；强制移动路线或事件运行中不加。当前值在 `PSFlow.game().steps`，最近一次结果在 `PSFlow.lastSteps`。
- **统计**：`PSFlow.game().stats` 记录战斗统计（野生/训练家胜负、战败扣款累计、全灭次数），`StartBattle` 的 `canLose = true` 时不算全灭。
- **容量**：来自内容的规则配置，没有时用 Gen 8 默认（队伍 6、盒子 40×30、每种 999、金钱 999999）。

## 测量与测试

| 目的 | 命令 |
|---|---|
| 核心计时（满盒子、大背包，无窗口） | `node experiments/step5/perf-core5.cjs [次数]` |
| 反向验证 | `node experiments/step5/probes/unfix5.cjs [id...] > out.json` |
| 无头 SaveStore（工具/测试） | `new SaveStore(file, hooks, speciesKeyResolver(content))`；夹具世界显式传 `identityKeys`。不给映射时旧档和带物种名的结果都被拒绝 |
| 重新生成第四步迁移样本 | `node experiments/step5/fixtures/gen-step4-saves.cjs --root <c789620 检出，已构建引擎和 Showdown>` |
| 包内性能（含 5.0 的满盒子/大背包/打开队伍界面） | `scripts/run-package-perf-mac.sh 3 <证据目录>`（弹窗口） |
| 100 场内存 | `PF_PERF_ARGS="--ps-perf-rounds=25 --js-flags=--expose-gc" scripts/run-package-perf-mac.sh 1 <证据目录>`（弹窗口） |
| 对照性能预算（只报警） | `node scripts/perf-budget.cjs <perf-summary.json> [--memory100=<100 场的汇总>] [--out=<报告>]` |
| 无头测试且不允许跳过（CI 用） | `PF_NO_SKIP=1 scripts/test-headless.sh` |
