# E03 原 receipt／真实源／callback oracle

这是显式的新 test-only oracle 输入，基于 CEA 的 Boot/globalInfo 修正；产品 src 不变。旧 81d getter predicate 和 j9／qq 的失败证据均保留在固定历史中。新输入尚未运行正式 case，不能借用旧 GO。

旧 357 前只观察一次真实公开 `App.beginEventCompanion`。非 async 包装以原 this/args 调用并返回同 receipt/handle/result Promise，同步原错误保持 identity。executeCommand 同步返回后恢复方法，再对原 result 附结算观察；异步 source 选择窗口独立保持到唯一原 guarded source Promise 与 held XHR 均捕获。

`e3-production/companion-fixture.cjs` 的新 sourceReceipt 是可选 test hook。缺省直接透传；启用时仍返回原 source Promise／原错误，观察器自己的错误另账，不替换生产结果。cold fixture 仅透传该 hook。来源只按公开调用、旧 App/generation/map/data、唯一匹配 origin、opaque prepared 与 held scope 标定，不读取 private owner 或构造映射。

只在精确 selected XHR 的既有 onload descriptor 上增加非 async 观察，实际调用仍来自原 send 的调度。原 handler、this、args、return、throw 保留；测试从不主动调用 onload，也不生成响应。callback property identity 因观察包装而改变，这是明确披露的测试流程。App 方法与 callback 恢复均只恢复仍由自己拥有的 descriptor，后装 hook 不被覆盖，恢复错误独立记录。

原最多 40 capture flush 和最多 40 post-release flush 保持。末端分别等待原 App result、原 guarded source Promise、真实 selected onload 一次正常返回；wait=false/getter缺席/released=true 均不可代替。terminal 仅接受原 Promise fulfilled 且 cancelled/failed；completed/duplicate/falsy/rejected/pending 均失败。source fulfilled/rejected 单独记录，不伪装为 App failed。

全部完成门后才执行原合法 Management successor、完整 cleared、endManagement unchanged 和 8 帧／旧更新稳定／restore-once。源引用、同 run 真实 load、完整 state/business RNG/native RNG/raw201/save/216 断言继续保留。失败时 LAST 记录各真实状态和未捕获值，不能补猜。

纯支持测试只验证方法／Promise／transport／descriptor 与 oracle 的控制性质；不包含生产 App、正式读档、Management、216、8 帧或 NW 验收。新增支持和纯控已加入受控闭包；下一步必须冻结新候选，独立检查并取得它自己的 cold/binding 与执行 GO。
