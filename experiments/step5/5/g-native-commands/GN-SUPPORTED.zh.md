# GN01–05 正规有限入口接线准备

支持入口为 `scripts/tests/g-native-commands-production.test.cjs`，按 GN01、GN02、GN03、GN04、GN05 顺序调用现有 `final-production-runner`；每项使用独立 fresh worker。五项复用原 `test-commands.cjs` 业务正文与断言，GN01 元数据观察改为 parent 已捕获、正式运行时实际消费的 `bound.world` 文本。原 GN05 消息忙前提修正和所有 RNG、records、wait、generation、successor 断言保留。

本提交只完成非热点支持文件，尚未登记新 family、controlled inputs、stale selector 环境拒绝、临时目录 scope 或正规 suite。四个注册热点由 F 唯一整合者串行承接，精确片段与前置条件在本轮外部 `REGISTRATION-PLAN.json`。登记冻结前不运行此 wrapper；本阶段 GN01–05 均为 **NOT_RUN**，不以源码准备或语法检查宣称执行通过。

正式整合必须沿用 `final-production-worker.mjs` 的 `runtime.prepare()`→原正文→`runtime.verify()`，以及 parent `H.capture`／`boundFiles` 前后核验、正式 distribution、真实插件 IIFE、Reactor pin 与 Showdown staging。新 family 仅允许五个显式 selector，拒绝旧 selector 环境、外来 binding／runtime 和被改写的输入；不得引入自动／共享／默认 builder。原 literal 383 套顺序应作为精确前缀，原有后继注册也保留，GN wrapper 只追加一项。注册数量不是实测数量。

GN01 覆盖真实 357 注册与 origin／name／all 解除及三条 metadata；GN02 覆盖 malformed／unknown／accessor 拒绝、getter 0 与 records／RNG 前缀；GN03 覆盖原生 terminate 的 exact handle、晚准备与 successor；GN04 覆盖真实 stateReplaced、换代与新 raw201；GN05 覆盖原 201／216／236／StartBattle357 的忙时返回与待转移保留。GN05 不签成功战斗 Session。

旧 4a76 的 GN01–04 通过、GN05 首红及前提修正后通过保持原身份；GN07 空伙伴原红和后继限定关闭仍分列。当前 383／7503 通过也保持其原固定候选身份，不代签本新 family。`RETRY-SUPPORTED.zh.md` 的历史 365 记录原封保留。

后继由唯一整合者固定完整候选，再做五原正文、必要 fail-before-load 反控、共享 base 的原 Retry／F 闭包，以及 Sol ultra 普速独立审查。真实 NW／PIXI／XHR、实体键盘、听感、真实失焦、冷标题 Continue、T20、CI、完整 G 与整体 5.5 均另验；本准备不占 NW。

当前整合后继：原 GN01–05 保持五个原正文断言；新正式运行首次 GN05 在 companion prepare 忙时于 legacy world capture 抛错，原始红保留。正式 Wild/Trainer 入口将 capture 拒绝导回既有玩家可处理拒绝终态，App 的 busy/source/private latch 守卫不变。附加 GN-BUSY-WILD／GN-BUSY-TRAINER 验证真实命令返回、无提交、参数验证及 unrelated owner/successor 保留；它们单列，不冒作原五向量。当前是否通过以精确固定绑定原 TAP 为准。
