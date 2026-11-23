# F 夹具的伙伴启动屏障

F 的 nontransfer 和 C1 夹具复用 `e3-mz-world-travel-fixture.cjs` 返回前已经完成的真实 current Map birth、生产 ingress 恢复和后续 Map.update 屏障。它们不再额外 goto 新 Scene，也不再要求在新 Scene 上重复初始化同一存档代次的旧 bootstrap 来源。

`current-companion-bootstrap-support.cjs` 只断言当前状态：真实 App、代次、Content、原生帧管理器、正式 registry、nativeEpoch、current birth/frame、已完成恢复、晚于调用的 Map.update，以及所有 idle/pending 边界。它不创建回执，不推进帧，不调用 initialize/restore，不更改投影、账本、mask 或任何产品守卫。普通观察器仅增加 `bootstrapSource()`，从已发生的 restore 调用和它同步触发的 atomic 读取保留来源；原 `ready()`、失败到达和 retry 观察条件均不变。

同代新 Scene 的恢复仍由正式 ingress 的 `restoreEventCompanionsAtMap` 完成。`GameApplication.initializeBlackoutCompanions` 的旧来源复用检查、private Scene 构造票、owner/generation/Content/registry/birth/frame/handoff 约束全部保留。normal-production 的非空伙伴精灵、父级和原生 follower mask 断言及全部后续 F 清理/到达/保存一次断言未删除或改弱。

普通套件 `scripts/tests/f-companion-bootstrap-support.test.cjs` 针对该屏障使用 pinned 原生 SceneManager、真实 allocation/registry/atomic/ingress 模块和被动观察器。Map 资源和 App 返回端是明确的协议控制端；这些断言只验证调度与观察接口，不是完整 GameApplication、实际伙伴渲染、正式 F 或保存业务通过。它覆盖同 Scene 重复观察不多次初始化/恢复、新 Scene 只恢复新 birth、迟到旧恢复和 successor、代次变化、App/Content/manager/registry/map/data/player/birth/owner/idle-ABA/handoff 及各 pending 反控。

该普通套件在本测试进程内复用共享 TS resolver，并局部使用 Node 22.21.1 的 `stripTypeScriptTypes({mode: 'transform'})` 加载当前工作树的 `src/*.ts`。这让传递依赖中的 constructor parameter property 可以执行；共享 strip-only loader 与产品源码均不改。原首轮20项共用的模块加载失败保留，不算协议或产品断言失败；局部加载修正后的普通协议单轮20/20。

历史执行口径分别保留：a91 是31 tuple／169项、剩29／113；b514 和2dda 是35／173、剩33／117。本支持改动的407 regular／243 controlled 是登记数，不能写成全量已执行，也不挪用 future E3 或其它候选的通过。

5360 原 session74006 的一次正式轮次保持失败：唯一 worker 0P/1F，fixture 未返回，`h.run()` 与 F/save 主体未到，后13 tuple 未调用。原授权 ec1f968 已消耗。本支持后继要经独立窄审、新 own binding 和新有限授权，才可运行完整夹具及正式 F；普通控不能代签。`_windowLayer` own-data 视觉日志保持独立观察，本修复没有证明其为原初始化失败根因，也没有修改视觉 facade 或放宽 darkness 读取要求。
