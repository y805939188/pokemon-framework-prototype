# 显式友好度迁移接线

本批基于已限定接受的 B `995599b0f9d7014416172c921f1a38b80801a9be`，组合纯作者域 `3c968909a85536be9e0472a660765fa42df02a04`。作者自检与独立验收分列；没有合入 main、升级 Showdown 或修改战斗规则、schema9、来源门及配对账本。原始失败证据保留于外部任务 C，最终候选与命令以该处作者报告为准。

玩家入口为 `PS_SaveState` 的“预览并确认友好度迁移”事件命令，必须指定既存手动槽。显示迁移数量及超范围数量，默认取消；确认才改选定槽的精确256为255。脚本入口是 `await PSState.previewFriendshipMigration(slot, optionalPaths)`，将返回的 opaque `handle` 传给 `confirmFriendshipMigration(handle)` 或 `cancelFriendshipMigration(handle)`。App 内部持有计划，外部修改展示对象不改变授权。载入、Title/Continue不会触发这项迁移；旧256及其它非负安全整数继续读取，257等明确 outOfScope，未授权值不改。当前版本存档要求完整 friendship 字段；作者省略字段和纯计划中的省略保持省略，不通过本任务修改存档 schema。

Node 使用 `new SaveStore(file, {}, resolver, content).friendshipMigration()` 作为 `GameApplication.previewFriendshipMigration(adapter)` 的显式目标端口，然后确认 handle。预览绑定完整游戏、内容对象/完整内容哈希、App generation/写入revision、实际文件/槽及原始字节哈希。确认持排他 owner；普通状态操作、加载、新游戏、晚到回调和被捕获的重入尝试均不能穿透。安装后读回必须相同；持久化已提交但安装无法核同，或实际持久化不确定，会保留锁并返回 `reload-required`，需重启后核实/恢复，不能继续另存。

真实 MZ 使用本地 StorageManager 的目录、槽名、UTF-8 压缩字符串和实际 JsonEx 编码。框架 envelope 保持 `pokemon-framework-json`/version1。迁移只修改原槽的框架 envelope，其它宿主字段取自该槽；当前框架状态与槽不一致则拒绝，不保存其它未确认进度。预览/确认期间宿主快照或槽变化会拒绝，正常save/load在途也拒绝预览。此窄入口不调用普通 saveGame，不更新 globalInfo、保存时间或 stock `.rmmzsave_`，也不修改宿主源码/SaveLocation。

原始字节、完整候选、版本化收据先写在目标旁 `<file>.friendship/preparing-*`，文件 fsync 后以目录 rename 形成 `<file>.friendship/<id>/` 完整 prepared 包。收据绑定实际目标、codec、来源 schema、raw 前后哈希、pure plan/receipt、完整状态及内容身份/哈希。唯一目标提交点是同目录完整临时文件 rename 到原文件；提交后异常依据实际 old/new/unknown 哈希报告，绝不盲回滚。中断可能留下未完成 preparing 目录或临时文件；原件及收据不删除。此合同覆盖进程中断，不承诺断电或任意多文件原子，也不承诺与不遵守宿主所有权的外部文件写者互斥。

显式恢复用 Node `store.inspectFriendshipRecovery(bundle)` 和 `store.recoverFriendshipFile(bundle, 'complete' | 'restore-original')`；MZ对应 `PSState.inspectFriendshipRecovery` / `recoverFriendshipMigration`，仅准当前隔离/玩家保存目录的目标，执行后须普通重新载入该槽。old/new都先验证完整原件/候选/收据，unknown只报告并保持文件不动。恢复的“原件”是实际原始字节，不是JSON重新编码。重新执行同动作幂等；没有自动Continue恢复或自动规范化。

作者命令：`content-cli.cjs friendship-preview --src=<source> [--author-schema=2]` 输出只读 previewHash；`friendship-migrate --src=<source> --out=<全新目录> --confirm=<previewHash> [--author-schema=2]` 明确确认后发布。schema2必须对所有base/form/overlay通过完整标准域、来源和 assembled content 检查；残留256/257/MAX_SAFE等拒绝升级。schema1是可见legacy选择。源目录不写，输出目录含原字节 `.friendship-original/`、外置 `friendship-receipt.json` 与可正常build的作者文件；拒绝已有、别名及相互嵌套输出。全目录准备好后一次rename发布，失败不改原源目录。

测试入口已正式注册于 `scripts/test-headless.sh`，三套原纯测试与 App、真实子进程 kill/throw、作者目录、实际 JsonEx/StorageManager/pako 的 VM 端口套并列。完整 quick 使用固定 Node22.21.1/pnpm10.20.0、`PF_NO_SKIP=1`。在本树 build 中放临时目录时，设 `GIT_CEILING_DIRECTORIES=<T>/build`，避免安装测试的独立 fixture 向上误认产品 git；不改变测试断言或版本pin。Mac新离线包的程序化真实NW、Title→Continue新进程及下一场验证单列，不能称实体键鼠或Windows验收。Windows实际host另行计划；Linux专属/Ruby双端未执行，不替代通用业务测试。
