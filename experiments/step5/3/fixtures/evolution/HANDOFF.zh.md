# D：纯进化规则与成功计划

基线 `b9d29a8fe718e865ef64123ba44f7190ff5a87f2`；分支 `step5/3-D-evolution-core`。请求模型 sol xhigh、Standard/nonFast；有效隐藏配置 **UNVERIFIED**。

依据为批准整体 r3 §4.2a、§7，06ac r3 的完整计划／局部隔离合同，以及净化 WP31、WP32、WP18、WP19、WP21 本期地区目的地子集。用例是从规格推导的期望；没有读取或执行原版 Ruby。

## 交给 E 的实际出口

- `rules/evolution.ts`：`scanEvolution(input)` 按当前物种形态、有序原条目、触发家族扫描；`planPostBattleEvolution(input)` 仅在可信 L0 证明升级后先检查升级族，完整 no-target 后才检查战后族。输入 `member/content` 为已验证持久 plain 数据；`party` 是当刻全局非战斗拼接队伍，查询时排蛋、保留濒死者和自身。`shadow` 与 `friendshipSoftCap` 由当前操作提供。
- `EvolutionFacts` 的每项是 `{status:'value',value}`、`{status:'absent'}`、`{status:'unavailable',reason?}`、`{status:'invalid',reason?}` 或返回它的惰性函数。缺少输入为 unavailable；抛错、坏值为 invalid。`mapMetadata.absent` 必须由 provider 确认真正有效的当前地图无元数据；不能用它表示坏地图／未接系统。天气 value 必须是 B 表的精确世界天气 ID，不能拿战斗天气或缺系统伪造 None。`moveTypes` 为当前已知招式 ID 到属性的正规目录投影。
- 返回 `kind:'no-target'|'target'|'context-unavailable'|'invalid'`。target 带 `memberId/source/target/entry/entryIndex/family/cancellable`；目标 form 随选择锁存。可有 `readiness:{readyToEvolve:true,evolutionReadiness:'known'}`。这只是**完整本成员计划**，不是查询写入；前后任一必要未知会丢弃暂定的新 R。旧 R、可靠 faint/HP0/普通治疗的清除及其它独立副作用由 E 按 06ac 同次安装，不因 D 的未知返回一起丢掉。
- `PostBattleEvolutionInput.levelBefore.absent` 表示合法无 L0 的新接收者；unavailable 表示预期 L0 损坏。`eligibleHp` 仅供 E 传入败局正确逻辑时点的资格 HP，不修改 actual member；`checkFainted` 默认 true。K/D 输入须是 E 已独立验证、完整覆盖／reset 后的计数，不能拿最终 HP 或普通日志补造。
- `rules/evolution-success.ts`：`planEvolutionSuccess({member,content,selection,resources?})` 返回 `kind:'ready'` 与独立 `member`、`learning:{source:'evolution',moves:string[]}`、`afterAction`、`evolutionCount:1`、`diagnostics`，或显式失败。字符串学习意图按新种 level0 然后重派后当前级顺序给 E，E 正规解析 id/PP 后调用 C 的 `source={kind:'evolution'}`。不触发升级友好、升级招式或链式再检查。
- `afterAction` 是 none、consume-held-item 或 extra-member。额外体 `draft.member` **没有 id**，附 `ballCost` 和旧表 entryIndex；无全局 ordinal、更改 party、送盒或实际扣球。E 最终提交分配真正实体 ID、校验碰撞／推进 ordinal，并把 dex/统计/球与主体写集同次安装。`resources.pokeBall.id` 必须由 E 从正式库存目录确定为普通球，D 不根据物品名字猜类别。先检查容量；满队时不读取球。存在 Shedinja 后置而未给资源时显式 context-unavailable，不能悄悄当无球。
- `decideEvolutionCompletion(selection,decision)` 仅返回纯决策。石头／正式交换取消为 continue；技术终止不计玩家取消。动画末帧输入、成功一次性安装及成功后的旧回调由 G/E 实现，本函数不自称覆盖它们。
- `applyEvolutionBattleFact` 是有限正规输入的纯 K/D 计量 helper：有效玩家要害逐次计；直接损失按 hpLost 加；其它 HP 减少不加；实际 faint 清 D 不清 K。它**不是实际 hook 来源证据**，不校验观察记录的完整性／身份绑定；这些由 E 的 V2 seal 负责。

## 已实现与反例

`METHOD-SUPPORT.csv` 逐项登记 B 的全部 64 方法；64 个具名正／拒绝用例之外，还有复合方法在等级／友好／物品满足时独立第二条件失败的反例。None、反向关系与 Shedinja 不作为目标；反向关系仍由 B 独立查询，不拼进前向扫描表。

覆盖 P53-17–21 纯规则：统一守卫、当前 form、首命中、无关家族不读 provider、时段边界、世界天气映射、地图 absence、L0 合法缺席／损坏分叉、升级未知不跨族且不泄漏半个 R、TradeSpecies 保自身比较、事件可复用及 R unknown 屏障。P53-22 只覆盖纯取消权限与技术终止结果。

覆盖 P53-23/24 成功计划：实体/PID/Owner/来源/昵称/自然性格/statNature/IV/EV/球/首招等保真；exp27000 Medium→Slow 重派 L27、HP0 保0；requested/effective 特性槽分开；null 唯一恢复／重名最小槽诊断／可信覆盖与不认识时拒绝；目标默认 form→非零目标记录→保旧 form；通常保性别、固定性别目标重派；旧条目顺序首个成功后置、实际目标＋当前持物消费；额外体无 id、保 PID、清指定字段／全治、满队／无球不阻主体。

地区目的地只按 `ruleSpecies` 实现 PIKACHU/EXEGGCUTE/CUBONE 的 region1 与 KOFFING/MIMEJR 的 region2；元数据 absence 回0，存储 form≥2 保留，目标显式 form/default 优先。本模块不实现完整 WP21 动态读取／战斗还原／招式形态处理器，也不把 POST-VECTOR-OWNERS 的所有 D/5.1/后继行计成本期已完成。

## 实际验证与限界

详见 `verification/SUMMARY.json` 和两份定向／可用旧回归 TAP；`regressions.tap` 保留额外四套回归尝试的完整失败史。core/app/framework 类型检查、导入边界与 build:engine 已通过。新模块未登记共享 `rules/index.ts` 或总 runner；上述构建不证明新公开入口已经接通，直接模块测试才是本次 D 执行证据。

四套旧回归尝试 64 项中 63 通过，P51-05 因本树没有暂存 `js/engine/showdown/dist/sim` 失败；没有修改旧断言或伪造引擎。随后只运行无需此产物的既有 friendship／learning-candidates／member-bridges 三套并单列结果。不宣称完整 quick/headless 通过。

未执行：真实进化／糖果／石头／交换／事件入口、连续 owner 与保存锁、真正资源/ordinal/dex 安装、真实战斗 K/D/V2/faint 来源、完整新进程保存、NW/GUI、远端/CI、实体硬件输入及性能。E 尚需导出、调用并验证这些边界；纯 D 通过不代表 B 接收、M1、整 5.3 或独立复核通过。
