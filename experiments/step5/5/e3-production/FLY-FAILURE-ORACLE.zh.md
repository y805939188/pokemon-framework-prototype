# B514 Fly 失败注入与严格理由 oracle 后继

本叶仅修测试支持 B514-ORACLE-R1/P2，基线 `b51481a19c417879068636cfb39cc1cd3a6d8ebf`，产品 src 保持 `508c287fca132b002c4859d99e97171b4ad9f01f`。

原单轮 APP 37P＋JOINT 17P/2F＝54P/2F 保留。两红停在 `pumpFailedArrival`，尚未执行显式 Retry；后 33 tuple／117 inner（含正式伙伴计数四组）未调用。独审 `step5-5-b514-e3-counter-r2-failure-sol-20261118` 已证明跨 realm Error 与严格短 reason 不一致是充分阻断，未证明唯一阻断或产品缺陷。

## 修改与保留的契约

- `configuredFlyFailure(G, phase)` 从被测 VM context 取得 Error 构造器，创建并保留一份对应 callback／cleanup 的 Error。真实配置的原回调抛出该对象；预期 reason 独立由固定 phase 构造，不读取实际结果。
- `failedArrivalReady` 原函数字节不变，仍严格要求 fulfilled／failed／reason 全等及原 request、receipt、owner、generation、native data、registry、lease、serial、birth、handoff、late-frame 和 recovery 条件。没有删 `Error: `、接受任意 failed 或改生产错误规范化。
- `failedArrival` 缓存该次已观察输入；`failureStatus()` 只将这些输入转换为有限字符串和布尔摘要。它不额外调用 recovery、confirm、finish、restore、atomic、provider 或 frame；不输出原生对象、完整 trace 或循环结构。
- 仅失败 checkpoint 的超时输出改为 barrier 与缓存摘要；正常／Retry 后的成功 idle 门、原业务断言和 140 帧上限不变。原 Promise、结果与异常对象透传保留。

## 实际验证

项目 Node 22.21.1（SHA256 `8179f1d4a920be531d81edef7a26df5cc5c9cb11c8b5a28fb336aa030fbfe3df`）执行一次 6 文件语法检查和一次新增 ordinary controls：**7/7，fail/cancel/skip 0**，7 个 Node 子进程均 exit 0／waited。只构造普通 `vm.createContext` 与合成观察，不加载 App、生产 IIFE、MZ 实现或业务 fixture。

OR01/02 固定 same-realm 正控与旧 cross-realm 反控；OR03 保留严格 guard 反控；OR04 证明循环身份不会扩展诊断且单字符串限制 240 字符；OR05/06 核对缓存诊断零额外调用和原 Promise／结果／异常身份；OR07 只读核对真实测试正文接线。矩阵内部断言不另加为 TAP case。原 21／25 等不变支持证据不重复执行或加作本轮结果。

## T／R／RNG 责任与下一步

| 责任 | 当前结论 | 后续责任 |
|---|---|---|
| B514-ORACLE-R1/P2 | 作者测试支持修复及普通 controls 通过，待独立窄审 | 独立 reviewer 核 fixed SHA；协调者整合与新冷绑定 |
| T05／T13／T17／T25：真实 Fly 失败→保留前缀→显式 Retry→一次保存 | **NOT RUN**；未据普通 controls 关闭原实际失败 | 新有限业务授权与独立读回 |
| T12／T26：正式伙伴空档旧角色计数校准 | **NOT RUN**；Claude P3 动态校准未代签 | 正规四链实际执行 |
| T14／T20、F14、完整 E3/F/G／5.5、全量404、NW／冷 Continue／人工 | **NOT RUN / 未验收** | 各生产链及最终验收责任人 |
| R08 进图天气、前缀及重试 RNG | 原 `[100]` 和不重掷断言保留，本候选实际业务未跑 | 真实业务尾部核对 |
| 测试支持自身 | 固定 phase／对象，无业务 RNG 消费；合成控不证明产品 RNG 前缀 | 不新增／放宽生产随机入口 |
| Content 及生产 owner／generation／receipt 守卫 | 全部 src 字节不变；本合成控不替代产品 Content 检查 | 沿用原产品证据，真实链另验 |

本叶不改 regular 注册、共享输入清单或 runtime。新 helper 和 ordinary test 必须在后续唯一整合时纳入正式输入闭包；当前旧 binding 只属于原 b514，不适用于本后继。没有构建、复制依赖、创建 runtime 或 binding，也没有运行输入／环境门、JOINT、Retry、P3 formal、cold、NW 或 T20；旧 max1 AUTH 已消耗。清理和对照线继续暂停，只做 MARK_ONLY 登记。
