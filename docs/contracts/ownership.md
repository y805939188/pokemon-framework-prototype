# 应用事务和持久化边界

## 代表性互斥/事务矩阵

| 真实入口/边界 | 现有保护性测试 | 核实到的覆盖 |
|---|---|---|
| 各操作持有者 → 开战拒绝 | `tests/regression/battle/test-battle-entry-ownership.cjs` | management/inventory/learning/trade/receiving/pokedex/battle/evolution/dex-battle，分别经 core/host；拒绝前后 token/revision/状态、create/random/replace 计数不变，原操作出口仍可用 |
| 交换 UI 拒绝战斗后继续 | `tests/regression/trading/test-trade-ui.cjs:38` | pending trade 拒绝 battle，原 UI 完成后只安装一次；39/40另覆盖合法后续战斗和回执退休 |
| 管理交换链、取消、重复请求 | `tests/regression/management/test-management.cjs` | held intent 不回写旧快照、取消保留独立编辑、提交一次、replace失败与旧代次拒绝；普通未持起的管理根仍允许保存 |
| 背包事务与排序取消 | `tests/regression/inventory/test-inventory-transactions.cjs` | 请求幂等/冲突、槽位版本、零写重试、写后呈现失败不重复、读档退休、取消恢复且保留独立金钱变化 |
| 学习原子安装/回读失败/取消 | `tests/regression/move-learning/test-learning-operation.cjs`、`test-learning-ui.cjs` | TR资源/招式/PP/统计一次提交，普通取消返回正确层、partial write保留屏障、旧UI/答案不能释放新代次所有者 |
| 道具/事件进化事务 | `tests/regression/evolution/test-triggered-evolution.cjs`、`test-evolution-commit.cjs` | 糖果/石头/事件不同取消语义、资源和主体原子写、回读失败确认、旧代次不干扰新操作、稳定成员身份 |
| 交换应用事务 | `tests/regression/trading/test-trade-operation.cjs` | 报价取消零RNG/序号/状态，开始演出后仅技术终止，最终唯一替换，零写可重试、partial write保持锁、外部编辑/读档失效 |
| 战斗提交/恢复/唯一写入 | `tests/regression/battle/test-battle-commit-receipts.cjs`、`tests/regression/battle/test-session-operations.cjs`、`test-session-failure.cjs` | 同一battle结果幂等、写后错误确认、零写重试与不可证实的部分写屏障、旧句柄不提交；Session动作错误恢复由其专项覆盖 |
| 保存/读档/状态替换 | `tests/regression/saves/test-save-install-gates.cjs`、`tests/regression/application/test-application-operation-contract.cjs` | own-data保存快照、坏状态整次拒绝且原字节不变；旧battle completion不读取producer/不释放新management-inventory child；旧inventory清理不释放新learning child；new game显式退休旧操作 |
| 宿主排队但尚未启动UI | `tests/regression/battle/test-battle-entry-ownership.cjs` | 管理/背包/学习/进化UI在获取领域token前也拒绝开战；被替换场景不能迟到获取新代次token或释放后继 |

以上文件均已在 `scripts/test-headless.sh` 的 regular SUITES 中登记；`--list` 与 `--list-exclusions` 是登记核查入口。冻结成长回放有单独政策排除，不算通过/跳过。没有发现必须为这份矩阵机械新增的普通路径组合；现有参数化测试已经覆盖用户指出的交换→战斗线索。这里没有把所有理论操作排列当配额，也没有修改现有断言、fixture 或登记。

## 存档与外部数据

`save-schema.ts` 接收 `unknown`，支持逐版本迁移，按原版本先验证，再在副本上逐级迁移，最后执行当前 schema 与内容一致性检查。schema 7+ 的 `validatedOwnDataCopy` 用属性描述符建立 own-data 视图，拒绝访问器、序列化钩子、继承必填字段、稀疏/异常数组，避免执行 caller 的迭代器/数组方法。`snapshotForSave` 通过校验后才生成编码用副本。此描述符门不声称对 schema 1..6 具有相同严格度；旧格式迁移行为由各版该功能保护。

结构检查已包括整数/范围、重复成员ID、PP<=maxpp、IV/EV范围、readiness关联、inventory布局、训练家键值身份及ledger记录字段。`member-content.ts` 在最终内容门检查精确species/form、能力目录、持有物/球、基础PP与PP Ups的关系及firstMoves目录。图鉴布局迁移要求唯一声明的一跳转换；缺内容/不映射/超容量整体拒绝，保留原输入。可在 [存档回归](../../tests/regression/saves/) 中查看对应向量。

不能以字段名匹配代替这些语义，也不能为了“更严格”直接改变旧值：friendship 的历史非负安全整数（包括256与更大值）、EV255、长firstMoves、空招式/空能力以及超当前普通上限的旧库存各有明确保留/拒绝路径。`tests/regression/friendship/test-migration.cjs` 专门保护仅显式选择256迁移，其他合法旧值不暗中截断。exp、等级、HP等与当前重算上限之间的进一步关系不能直接套用新游戏创建约束，因为进化和旧格式有自己的语义；当前未改变。



## 两套物品数据的职责与同步

`rules/rules.ts` 的 HEAL/STATUS/REVIVE/PP/STAT 等表属于当前战斗规则支持集；`rules/item-families.ts` 的 `FIELD_EFFECTS` 描述场外主动用法和可配置参数，还包括目前没有战中支持的家族。`item-catalog.ts:legacyCatalog()` 先从 BAG_ITEMS 接战斗身份，再叠加场外效果；作者 `items.json` 又可提供独立内容ID、价格、显示名、fieldUse/battleUse/battleId。它们职责不同，不适合仅为消除“两张表”整体合并。



战斗 PP、复活和逃跑分别回归；场内外规则交叉时请参看[治疗与估值](healing.md)。不能只因存在某个场外处理器就自动授予战斗能力。
