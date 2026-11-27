# 友好度和显式迁移

- 作者 manifest **schema2**：新标准，happiness 仅接受 0..255 整数；省略继续省略，创建时沿用现有 70 fallback。base、显式 form、overlay 各自过门；有效 overlay 不能掩盖非法原输入。
- 作者 **schema1**：明确 legacy 选择，保留非负安全整数（含 256 和其它 >255），返回 `legacy-author-schema` 兼容诊断。CLI build/check/inventory、PBS 导入可见。版本来自 manifest，不猜文件创建时间；显式 1 是兼容选择，不是安全/防作弊边界。
- manifest 缺少 schema 或非法 schema 受控拒绝，不回退 legacy。新内容使用作者 schema 2。

## PBS 导入

CLI 从所属项目 manifest 读取明确作者版本，来源预使用门仍先于 PBS 读取和 form 适配。bundle 任一文件/字段失败不暴露可用 species/identity/text 前缀，报告保留精确 file/line/path。

`importPbsSpecies(text, sourceId, authorSchema = 2)` 与 `importPbsBundle({authorSchema: 2, ...})` 默认标准2。旧两参数文本调用的正常 0..255/省略场景兼容；需要导入 256 的文本调用必须显式传 `1`，bundle 同样显式 `authorSchema: 1`。两种 API 均返回 `warnings`；legacy 诊断不写入编译产物，不改变旧编译身份。调用者不能无声忽略 legacy 诊断来冒称标准2。文本 API 保持原有 accepted-record 诊断语义；原子承诺属于 gated bundle。PBS 已有省略 Happiness=70 的导入默认不变。

## 纯迁移合同

内部模块 `rules/friendship-migration.ts` 处理 party 和 `storage.boxes[].slots`；`content/friendship-migration.ts` 处理作者源中的 species/form/overlay happiness。它们无 Node/DOM/Showdown/MZ 依赖，核心不反向依赖 content，未加入公共 root/SDK 导出。作者预览经过正常 compile 校验（含来源和身份门），不会把非法 schema2 配置当 legacy；作者迁移保持 manifest 原版本，升级为2是调用者后续明确操作。

- plan version1，kind 分玩家/作者；每个候选及选定目标具名身份、精确路径、before=256、after=255。缺省选择全部 exact256，显式 paths 可选子集或空集；重复/未知/非256路径拒绝。省略字段不补70。
- 绑定完整、排序规范的 before/after JSON 快照及 SHA-256，并以 planHash 覆盖版本、kind、两个快照、候选全集、选择、未纳入项。快照对象仅限无损 JSON 数据；undefined、非有限值、-0、稀疏数组、隐藏字段、getter、symbol、环和非普通对象受控拒绝，避免静默丢失其它字段。不是通用 JS/JsonEx 序列化器。
- apply 必须收到预览时独立保留的 `{planHash, targetPaths}`；从原始快照与选择重新计算完整计划，逐字段核对。缺项、篡改、未知版本/kind、错误确认、当前快照变化、部分应用均原子拒绝，原输入不变且不返回可提交 data/receipt。
- 当前快照必须精确等于 before 或 after；后者返回 `already-applied`，确定性收据相同；无选中修改返回 `unchanged`。完成后若任何其它状态再变化，旧 plan 为 stale，需重新预览。没有往状态写持久幂等标记。
- 成功只返回 detached data 与**外置收据**：含原始完整快照、前后 hash、目标、planHash、after 快照、receiptHash。核心不会安装状态或写文件。hash 是完整性绑定，不是加密签名；能同时换掉计划和确认的一方可以选择另一份预览。
- 仅迁用户批准的精确256。其它 >255 非负安全整数保留并列 `outside-approved-256-migration`；未选中的256仍在 candidates 中可见。因此部分迁移或存在257等数据，不能声称全部 legacy 已标准化，切换 manifest2 仍会被正常门拒绝。
- 玩家仅校验迁移相关 schema/集合/成员身份和 friendship，不替代完整 save/content validator。正式接线必须继续用 App/Store 自有的完整校验、操作锁、状态权威及事务。


## 安全安装与原档


玩家入口为 `PS_SaveState` 的“预览并确认友好度迁移”事件命令，必须指定既存手动槽。显示迁移数量及超范围数量，默认取消；确认才改选定槽的精确256为255。脚本入口是 `await PSState.previewFriendshipMigration(slot, optionalPaths)`，将返回的 opaque `handle` 传给 `confirmFriendshipMigration(handle)` 或 `cancelFriendshipMigration(handle)`。App 内部持有计划，外部修改展示对象不改变授权。载入、Title/Continue不会触发这项迁移；旧256及其它非负安全整数继续读取，257等明确 outOfScope，未授权值不改。当前版本存档要求完整 friendship 字段；作者省略字段和纯计划中的省略保持省略，不通过迁移入口重写存档 schema。

取消只丢弃尚未执行的预览，零持久写入。已经完成（含 unchanged）的 handle 返回 `refused / preview-completed`，表示该历史操作无法取消，不回滚、不判断后来载入的新存档。重复确认仍核验当前完整状态、代际、内容及原目标；完成后尝试取消不会销毁这项核验能力。普通取消后的重复取消为 unknown-preview。

正式命令在真实地图解释器中执行：先取得本操作的短期模态所有权，等 command357 推进索引并完成当前帧后才预览；选择期间仅暂停该 Scene_Map 的 updateMain（地图、解释器、玩家、计时器、画面世界状态），消息窗口、选择输入、渲染和 Graphics 帧继续。普通保存/载入及第二个迁移预览被拒绝；所有原有 App owner/generation/full-state、slot raw、完整 hostIdentity 与写入门继续核验。确认、取消、预览/提交失败均释放世界暂停，离开/终止场景清除所拥有的选择并使迟到操作失效。已持久提交但安装无法核实的情况释放世界/UI暂停，App 的 reload-required 写入锁继续保留，需重启载入。没有调用 SceneManager.stop 或修改 Graphics.frameCount。

直接 PSState 脚本 API 不取得世界暂停；调用者须提供并维持完整宿主静止条件，直到异步预览/确认完成。在正常地图中请使用正式事件命令。第三方插件或外部脚本若改变持久对象，完整 hostIdentity 仍会拒绝；这项暂停不声称冻结任意插件的所有更新。

Node 使用 `new SaveStore(file, {}, resolver, content).friendshipMigration()` 作为 `GameApplication.previewFriendshipMigration(adapter)` 的显式目标端口，然后确认 handle。预览绑定完整游戏、内容对象/完整内容哈希、App generation/写入revision、实际文件/槽及原始字节哈希。确认持排他 owner；普通状态操作、加载、新游戏、晚到回调和被捕获的重入尝试均不能穿透。安装后读回必须相同；持久化已提交但安装无法核同，或实际持久化不确定，会保留锁并返回 `reload-required`，需重启后核实/恢复，不能继续另存。


真实 MZ 使用本地 StorageManager 的目录、槽名、UTF-8 压缩字符串和实际 JsonEx 编码。框架 envelope 保持 `pokemon-framework-json`/version1。迁移只修改原槽的框架 envelope，其它宿主字段取自该槽；当前框架状态与槽不一致则拒绝，不保存其它未确认进度。预览/确认期间宿主快照或槽变化会拒绝，正常save/load在途也拒绝预览。此窄入口不调用普通 saveGame，不更新 globalInfo、保存时间或 stock `.rmmzsave_`，也不修改宿主源码/SaveLocation。

原始字节、完整候选、版本化收据先写在目标旁 `<file>.friendship/preparing-*`，文件 fsync 后以目录 rename 形成 `<file>.friendship/<id>/` 完整 prepared 包。收据绑定实际目标、codec、来源 schema、raw 前后哈希、pure plan/receipt、完整状态及内容身份/哈希。唯一目标提交点是同目录完整临时文件 rename 到原文件；提交后异常依据实际 old/new/unknown 哈希报告，绝不盲回滚。中断可能留下未完成 preparing 目录或临时文件；原件及收据不删除。此合同覆盖进程中断，不承诺断电或任意多文件原子，也不承诺与不遵守宿主所有权的外部文件写者互斥。

显式恢复用 Node `store.inspectFriendshipRecovery(bundle)` 和 `store.recoverFriendshipFile(bundle, 'complete' | 'restore-original')`；MZ对应 `PSState.inspectFriendshipRecovery` / `recoverFriendshipMigration`，仅准当前隔离/玩家保存目录的目标，执行后须普通重新载入该槽。old/new都先验证完整原件/候选/收据，unknown只报告并保持文件不动。恢复的“原件”是实际原始字节，不是JSON重新编码。重新执行同动作幂等；没有自动Continue恢复或自动规范化。
