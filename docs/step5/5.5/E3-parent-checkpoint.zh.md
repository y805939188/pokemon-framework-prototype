# E3 实际 App 父端接口检查点

状态：NOT_ACCEPTED。此检查点用于固定真实 App consumer 和 MZ 后继接线接口；尚不签收完整 E3。

基线是 e53856a06a580ebff43ecec65f66d6248a5aa6bc。依赖接口 dcee28e、6862d66；共享 travel types 和既有 E3 规则／叶镜像固定于 ea2cf5b。原 C1、A/A2/A3、B 安装及 Content/owner/generation 守卫保持原路径。本批不安装 schema 11、F 父流程或伙伴自动跟随。

## 接线

GameApplication 接收 `worldTravel: WorldTravelHost`，其实际父端为 `WorldOperation.travel`（`WorldTravelApplication`），构造真实 `WorldTravelOperation`。公共入口为 `runWorldTravel`、`retryWorldTravel`、`cancelWorldTravel`、`worldFlyDestinations`。转移适配器使用 `isWorldTravelOwner`、`isWorldTravelReceipt`、`confirmWorldTravelArrival`、`finishWorldTravelArrival`、`failWorldTravelTransfer`。自动保存被门拒绝时调用 `deferWorldTravelSave`，最终安装后至多通知一次 `resumeDeferredSave`。

`GameStatePort.atomicWorldContent` 必须同时观察正式 Content 槽、实际游戏状态、原生位置和 travelPlayer/travelSwitches；缺能力或无法安全观测时拒绝，不降级 legacy replace。父端最终区间仅比较私有 owner/receipt registry 和已物化原生槽，并安装一次状态。未知 host 调用、B 天气 RNG、异步展示均位于该区间以外。

Fly 从当前区域的首条点记录、目的地图访问记录和真实开关槽派生；Dig/Teleport 才确认。真实抵达原子提交 Surf／伙伴位置与 B 的访问记录、治疗点、Flash 和天气，后继原生进入通知去重。连接在真正目标提交一次既有完成步并派发一次到达；不在源图先计步。Fly BGM→refresh→callback→实际异步 250ms→清逃脱点／选择→最终退役，尾段保存门保持。

MZ 必须实现共享 `retireTransfer(owner, receipt)`：仅退役精确 registry/native pending lease。仅比较同坐标不足以区别其它 201 或 successor；需真实 reserve serial。取消或失败后的清理失败须明确返回 failed，父端保持保存门并等待显式恢复。

## 已执行与尚未通过

私有运行基于 Node 22.21.1、真实 GameApplication、固定 e2b3fe0 原生 atomic slots、固定 f2dd727 transfer-host 及项目实际 Reactor/MZ 原生方法切片；XHR 为人工响应，不是实际磁盘 XHR／NW。

- App 严格类型检查通过；初次 nullable 编译错误原日志保留。
- 首轮 24 case 为 22 pass/2 fail，两处测试夹具错误已保留并修正（API 名和新游戏应返回 cancelled）。
- 后继 25 case 为 24 pass/1 fail，Surf 目标完成步通过；distance_surfed=0 的原始红例独立登记为 NATIVE-MOVEMENT-DISTANCE/IMPLEMENTATION_GAP。正式规格将距离统计放在移动开始，不能只给连接或完成步补数。原断言保留于 `e3-native-movement-distance-gap.probe.cjs`，此新副本未重跑；未接受、未延期，范围归属仍待统筹。
- 当前显式 parent32：31 pass/1 fail。唯一失败是正式 f2dd727 transfer-host 尚无 retireTransfer，Fly callback 失败后准确返回 retirement-not-implemented，保存门保持。该项必须由真实 MZ 后继实现后再验，不能用测试空方法代签。

证据：主工作仓 build/step5-5-development-20261115/e3-application-parent-author。各次 launch 均登记显式文件、argv、runner/child PID、UTC 及唯一日志；后续 source inventory 同步封存。原失败保留。完整源码／runtime／native／TS platform 最终绑定与清理台账待固定最终候选封存。

未执行：完整回归、实际 MZ 装配、NW、实体键盘、听感、真实失焦、CI、冷 Continue、完整 F／伙伴／G。自动输入或原生方法切片不代签这些项目。

## r2 后继检查点（原结论保持）

r2 从固定 5fd9c8630e2644b46319174c0f9bbc3dce8fb4cc 建独立树。补真实抵达后目标事实失败的私有恢复前缀：显式重试只执行尚未完成的目标完成步，不重发转移、不重做 B 进入。新重试总是创建新 owner，旧异步结果不能退役 successor。原生 travel 槽不安全时，父端先安全捕获并拒绝，再执行位置回调，方向／继承开关 getter 的明确调用计数为 0。

实际 parent37：36 pass/1 fail；唯一失败继续为正式 transfer-host 缺 retireTransfer，原红未改断言。新增清理失败保存门、连接目标事实失败恢复、迟到 predecessor 不清 successor、原生方向 getter0 和继承开关 getter0 均有作者实际证据。私有 App／core 严格检查和分层检查 exit0；私有 core 在无 require/process/Buffer/DOM 的环境中 1/1，保留所有旧 runtime keys，只增 worldTravel（原已存在 wildGeneration 也补入 canonical 测试清单）。最初未压缩 core 的字符串扫描命中源码文档注释，失败日志保留；私有 core 压缩后按同一断言通过，产品 core 源未改。

本阶段源／runtime／原生方法／实际 TS 输入与工具链绑定记录 333 个源、176 个 sourcemap 条目、176 个编译输入、455 个工具文件，见外部 r2/binding-provisional-1910.json。该记录最初绑定 WIP；固定后身份以其后继绑定为准。唯一缺口仍需正式 native retirement/serial 后继；本检查点 NOT_ACCEPTED，不代签独审、真实装配或完整回归。
