# A-P2：失败通知与完成步到达

失败的世界通知继续留在 FIFO 队首，保持原 Content、owner、代次、R08 缓存和存档／战斗阻挡；本修复不替通知回滚、丢弃、重掷或自动解忙。

World 在没有其它操作且 App 的非 World 忙门允许时，仍可为后续实际完成步建立自己的父端。计步、适用友好／驱虫及其它原前缀按原顺序处理，原生到达事件只运行一次。未决通知在 ordinary 入口前阻止框架、legacy 和原生遭遇；它不阻止合法 R09 友好随机。已提交前缀、重复步回执、取消、换代和后继操作各保原语义。

MZ 的 `arrival-only` 回执用于 App 拒绝或异常后的宿主回退：只有同一个仍有效的完成步来源才能执行。它复用 step-host 的原生到达缓存，已经 dispatch 过的事件不重放；该回执永不向任何遭遇入口交机会。真正 cancelled 保持不派发到达。消息呈现失败的旧断言相应更新为保留前缀、只派发一次到达且不遭遇。

本私树的固定依赖镜像单列为 NOT_ACCEPTED checkpoints：d25309e、0be55b3、a1fd97e。源自固定 62 的 D 两模块和实际直接依赖逐字绑定；bb31 的 App、ports、atomic、facts730 和 selector 守卫未被镜像覆盖。固定 62 的 PS_World／PS_Inventory 仅作为不可编辑的私有 IIFE 输入，解析到本树对应 D 模块及 App。原 D native-frame 测试还需要固定 PS_BattleFlow 的 legacyExecuteEncounter 编译片段；不以此接受构造票据或 B-P1。每个实际 IIFE 输入由私 builder 的 pre-resolve 和 SHA 清单明确绑定，不使用浮动 main build。

原 Claude 探针的末断言记录坏实际为 steps0／arrival0，脚本逐字保存：前置候选回放 2/2 表示缺陷成功复现；修后同脚本 1/2，唯一失败为实际 1 不再等于旧期望 0。新的契约向量另验正确的 steps1／arrival1、未决通知无任何遭遇、R09 的正当 draw(2)、failed head 不重试／不丢弃、fallback 前后一次性及旧来源／successor。不得把旧坏实际探针的 exit0 当作修复通过。

最终私有定向回归 575/575：新 A20、原 D／B相关208、快捷／E2／Surf叶／Fishing相关347。项目 App/core/framework strict、私有包含 D 适配器的 strict emit、生产 bundle、真实 IIFE 组合、边界检查均通过。原首失败、错误路由的私包和后来正确解析的输入清单均保留。完整 quick、NW、真实 Surf 自动链、B-P1、P3-C1、E3/F／伙伴整体及人工三项未由本修复签收。

作者证据：`build/step5-5-development-20261115/world-app-integration-author/failed-notice-step/`。最终 A 产品差异另提供 delta-source-only.patch，方便实际 MZ 后继仅接五个产品模块；依赖镜像与测试输入不混作新增产品功能。清理只登记，不删除日志、首失败或历史来源。

后继 `A-P2-SUCCESSOR-AFTER-ARRIVAL` 另修 native arrival 回调建立新完成步后，旧 finish 清除新 lease 的窗口。finish 在到达外调以及最后位置观察之后，都必须仍是同一个 active entry 且未 settled，才可退自己的操作；位置不再有效则只取消自己。真实新 Game_Player／同代或新代、拒绝与 rejected 回执、正常实际 App 前缀和错误坐标反控均验证；原独立一红转绿，必要 D／MZ／A 回归单轮127/127。App／framework 源码及生产 App bundle 与627逐字相同，旧575证据保留未重跑。后继证据在相邻 `arrival-successor-fix/`。

`A-P2-TERMINAL-OBSERVATION-THROW` 再修坐标 getter 在 owned 检查之后抛错的异常出口：currentStep 将整个读集失败视为来源不可用，pending/done 在该读后也核对原 entry 才可取消，已有 finish 两侧保护保留。原独立 mapId 正控和 x 反例现在各 throw 一次、arrival 一次、pending=false、unhandled=[]。新增 x/y、读中建立真正新代 Player 后继、pending/done 及真实 prefix，必要单轮134/134；不重跑575/full/NW。证据在 `terminal-observation-fix/`，源码仅 step-host 后继；C1 真实 Inventory Scene 许可仍排队。
