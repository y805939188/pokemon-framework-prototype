# E3 阶段观察与旧角色计数支持

原支持基线 a91e334269efbb5d9c6508bab7b733455e17fff3；PH-R1 时序窄修基线 aa279da78fe8cd33ced711f931139513aded2d56。均仅测试支持纠正，不修改产品 `src`。

FR-R1：两条既有 Fly callback/cleanup 失败在显式 retry 前使用 `pumpFailedArrival`。它保留原 predicate、140 帧上限、伙伴/作者 pending 和稳定原生 Map 条件，另外核对真正 run/confirm/finish 调用观察、原 receipt、failed finish Promise 的实际返回、同代次与地图对象、保留的 arrived lease/serial/owner/receipt、map birth，以及纯 recovery 的 after-arrival/arrived/tail-failed/retry 状态。观察包装返回原 Promise/值，不主动调用 run、confirm、finish、restore 或生命周期来源；rich travelLease 只观察生产本来就发生的 atomicWorldContent 读取，基础 worldLifecycle 不被假定具有 rich 字段，也不覆盖 rich 观察。成功 pump 和显式 retry 后仍用原 `nativeConsumer.ready()` 完整空闲门。

PH-R1：原 onMapLoaded 内的 performTransfer 同步确认早于 loaded 通知与 isReady 的完整 frame 发布。Fly 的早期 atomic 可能合法省略 mapBirth。因此先记录真实 confirm 的原 request/receipt/owner、同一 application/generation/scene/map/data/player 与已到达 physical lease/serial；之后只将实际 rich atomic 观察中同一身份的完整 published birth 单次关联到该确认。缺失值本身不能建立关联；若早期已有 birth 则必须同一对象；若尚未物化则必须有后续观察次序和精确保留身份。关联后不能换绑另一个 later birth。新 request、代次、Scene/map/data/player、receipt/owner/lease/serial/registry 的变化均拒绝。此支持不制作或发布 birth、frame、ACK 或恢复工作。

P3-1：同一 `countCharacterUpdates` 包装用于真实 fixture，统计全部原 `Game_Character.prototype.update` 接收者；原测试取得 `oldCharacters` 后仍按原对象身份读取 Map。旧精灵脱离 parent 后也可增长；原 return、receiver、参数、抛错对象保持。E01–E03 原八帧及其它断言不删改。

纯支持控通过 `test-phase-observer-support.cjs` 直接执行，正规入口 `scripts/tests/e3-phase-observer-support.test.cjs` 已注册 regular，并闭合到 `final-production-inputs.json`。纯控只使用普通对象、benign fake 原生函数和两个自有观察 helper；不执行 App/MZ/fixture 或业务正文。业务 RNG、原生 RNG 消费均为零。纯控内的“旧 parent-only 包装被断言抓到”是故意负对照，由外层断言验证；不能当作业务失败或真实旧对象实测。

后续执行矩阵（本候选这里仅登记，必须等精确独审、自己的 cold/binding 和统筹新授权）：

| 入口 | 责任与保留断言 | 当前执行性质 |
|---|---|---|
| regular e3-phase-observer-support | PH01–PH11，另含原独审 IR01–IR04 与 BR01–BR06；保真实早缺/晚完整两阶段正控、提前birth正控、晚期wrong/stale身份、基础/丰富来源分界、原Promise/error透明性及计数控 | 作者只直跑纯控；正规 H/cold 入口未跑 |
| e3-travel-current / JOINT 原19项 | 原正常成功与失败前缀、真实 callback/cleanup failure checkpoint、显式 retry 后完整 nativeReady、一次 reserve/自动保存、前缀/统计/escapePoint/presentation/callback/cleanup 次数与 RNG | 未跑；旧 a91 17P2F 保留，不改记 |
| e3-companion-empty-formal / P00→E01→E02→E03 | 同一物理producer、正式空档读入、原八帧对象身份计数、restore once、216、state/RNG、退役/晚到与successor | 新候选未跑；旧JA四链限定通过保持，不挪用为本次计数修复动态证明 |
| E01/E02/E03 新正式计数校准尾部 | 原八帧稳定断言完成后，确认真实旧精灵parent===null，再经安装的原生包装对oldCharacters[0]精确调用1次update；新Game_Character对象另调用1次，严格断言旧集合只增指定1次、新计数独立，state/双RNG不变 | 已加入原正规四链正文并闭合输入；本候选未执行，不虚构实际旧对象校准通过 |
| 其余29 tuple/113、F、新300/full及NW/T20 | 保留原准入、前缀与资源约束 | 未执行，本补丁不授权 |

本支持不签产品修复、正式业务通过或整体 E3/F。FR-R1、PH-R1 与 Claude P3-1 仍待固定候选独立复核及必要新业务验证；旧 aa279 IR01 红和作者11绿均保留原版本。O1–O7 未复现观察不扩展为产品改动。
