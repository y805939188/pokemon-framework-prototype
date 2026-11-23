# E1 实现与当前验收范围

当前交付补齐默认生产前门及R12视觉随机隔离，并把有限控制接入正规 headless 入口。固定HEAD、tree、源码、每次运行和独立审查结论以本轮外部 READY／报告为准；本文件记录产品合同和覆盖边界。

## 实现

三竿、五阶段、无表／过滤空、咬钩／收杆、BEGIN／END公共事件、失焦暂停、聚焦卡顿不默认截断、原子前缀和取消恢复均沿用既有实现。普通背包与快捷杆在实际进入等待时提交 `fishing_count`；hook成功并正常恢复后，先提交 `fishing_battles`，再请求遭遇。后续候选空或Session未开始不回滚这些合法前缀。真正Session创建另计。直接等待模式不自动增加 battles 或发遭遇。依据 WP60§3.1、§5、§7及A合同T24／R07。

默认 `PSFlow.random(n)` 改由MZ叶 `business-random-mz.ts` 获取无状态的Node `crypto.randomFillSync` 熵，视觉Weather保留原生Math源。每次默认draw新建自有Uint32Array(2)，验证own-data能力、同步同buffer返回，再以27+26位构成53位 `[0,1)` unit；原 `Math.floor(unit*n)` 和各业务抽取次序不变。首次实际draw才加载能力；显式 `PSFlow.rng` 注入原样优先，完全不要求crypto。能力缺失、accessor、错误返回和熵源异常明确失败，不回退Math，不重放或回滚已提交前缀。没有新增PRNG、持久seed、schema或保存字段，未借用AI／Session RNG状态。

这项默认源变化适用于既有PSFlow.random消费者，包含钓鱼、世界天气、遭遇与生成等；不把“默认随机”描述成可复现持久流。确定性重放继续使用既有显式RandomPort／PSFlow.rng注入。引擎Gen5／Sodium等随机域单独观察，未改算法或seed策略。

正常快捷钓鱼的外层receipt和真实Fishing子层均正常终结、同代次私有itemToken登记且确无travel关联时，恢复facade派生只读终态，retry／cancel关闭，正常退役无需错误诊断。真实travel关联优先走原WorldTravel recovery；未知request、克隆、未promise、旧代次、失败、异常或真实travel失败仍走原拒绝和诊断，不靠`request-unavailable`字符串判定无关联。没有增加执行权限或复制owner／receipt。

## 正规控制与实际结果

新增单套 `scripts/tests/e1-default-production.test.cjs` 复用既有同源parent binding、正式distribution和八份生产IIFE。原363套顺序为精确前缀，新套为第364套。每selector使用fresh Node／私有case根。7个包装测试包含10个原始worker测试，二者不累加。

| 控制 | 实际入口／关键断言 |
|---|---|
| entropy unit（4项） | lazy零初始化抽取、自有不同buffer、0／最大53位映射、getter0、同步同buffer、原异常保留和0Math fallback |
| Bag成功 | 默认PSFlow.app＋普通Inventory installer→MapBirth→真实World父层→真实admission及生产BattleSession一次；count／battles各1、oldrod不消费、步数不增加 |
| Weather配对 | 两fresh默认Bag成功、INITIAL字节相同；实际pinned Weather雪花update在业务draw之间抽3次Math，默认业务14次crypto prefix保持；不改变业务天气／表／时段／队首 |
| 快捷取消 | 真实357→Management overlay→Native Input→钓鱼等待取消和exact恢复；count1／battles0／Session0，旧native回执不清新Inventory owner，克隆及旧generation拒绝 |
| 默认熵失败 | 已提交count保留，默认熵异常仅一次、0Math fallback／0Session，稳定帧不重试；失败receipt仍不可借正常终态吞诊断 |
| 显式注入兼容 | crypto不可用时原PSFlow.rng仍可执行，crypto能力读取和draw均0 |
| 真实Fly优先级 | 普通UI执行期间原recovery返回pending／awaiting-arrival／physical reserved；完成退役后completed、无可执行retry／cancel，克隆拒绝 |

作者在产品src1794上完成上述冷正规单套：7包装／10原始控制项均通过，插件／工具／framework类型、边界、正式distribution、八插件、Showdown staging及末端绑定均通过。新完整364套及最终独立结论另行记录；5631／src407b的完整363套7224通过是历史基线，不能移签新源码。

Weather配对的测试底层先真实调用 `randomFillSync` 并检查同buffer返回，再用公开冻结的精确word tape覆写该自有buffer，以得到可复制的业务初始状态；这是受控熵后端，不是对自然随机字节的纯观察。业务、crypto、视觉Math和引擎调用各自留原始trace。Bag／visual各创建一个真实生产Session；没有替换factory、伪造admission或私有权威。

首次R12红例及快捷正常取消后的误诊断红例均保留。首轮Fly测试在完整退役后错误要求`after-arrival`，该checkpoint此时已清除；后继把优先级控制放到真实UI执行期间，并保留终态身份反控。修正的是观测时点，不是放宽产品恢复守卫。

## 旧证据、P5与未覆盖

5631完整回归中#36–44／#64覆盖三竿、五阶段、focus／ACK、原子和late callback，#42／#44明确no-able及晚拒绝时合法统计前缀，#22含真实Showdown钓鱼来源与捕获消费者，#46包含Inventory→World。规则和host未改的精确输入可作历史依赖证据；新产品源码必须由本轮独审及必要整合回归签收。没有机械重跑三竿全套或旧两百万统计。

P5的12个声明来源、概率算法、oracle、47动作literal tape和native pin不变，但实际176个TS依赖中的WorldOperation发生变化，旧prepared不能移签。source-map仅由真实git推导当前src与provenance base，原严格身份／hash门不改；新当前prepare及有限47单独绑定。它仍是有限App／合成host和Session合同，不签新概率统计或真实NW。

本轮headless使用受控canvas／PIXI／数据库／XHR和窗口资源，真实原生方法、MapBirth、默认composition和私有准入照常执行。EXCLAMATION_ANIMATION_ID=0与fast只控制测试媒体；不证明真实像素、音效或完整战斗UI。原非Map黑暗投影诊断按实际来源保留，未吞installer异常。

C-P03同池／重复权重、C-P05初始form／setter、FLUTE政策仍待明确；当前普通受支持species/form与空野生held域不触发这些缺口，不借此暂停无关接线，也不将拒绝域签为完成。E1完成不等于E2／E3所有快捷能力或整体5.5。真实NW、实体键盘、听感、真实失焦、Title／global存档列表、T20及CI按各自授权和验收另列，本轮没有新增这些运行。没有推送或合并main。
