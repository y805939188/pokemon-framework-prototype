# 实际快捷选择父端

本提交承接 2409 的 App joint-query 槽和 730 的真实 facts producer。`GameApplication` 是请求、库存操作和 World 父端的整合者；菜单负责真实调用场景的关闭与返回地图。

## MZ 调用合同

1. `app.prepareFieldShortcutSelection('shortcut', selection)` 或 `app.prepareFieldShortcutSelection('party', selection, memberId)` 返回 `prepared.request`。对象由 App 的私有 WeakMap 注册；token、相同字段副本、其它 App 对象均无权限。party 入口只能选择该成员的场外招式。
2. 允许在真正的队伍 management 内准备请求。调用者应正常关闭自己持有的 management、返回真实 Map-ready，再调用 `app.executeFieldShortcut(request)`。App 不临时解忙、不替调用者结束 management。请求锁定当前代次及实际地图、玩家和位置，菜单 Scene 到 Map 的合法转换不伪装为地图更换。
3. `executeFieldShortcut` 在任何 query/provider 前保留 Promise。重复同一请求始终返回相同 Promise／结果；fresh query、实际 Inventory ticket、World 原子守卫继续核对资格。
   World 从 App 私有 registry 同时取得最初冻结的 map/player/mapId/point 来源，所有准入 provider 结束后在原子末端比较，不得把回调换过的来源重新认领。当前执行 Scene 在进入 World 准备前锁定，仍允许调用者在执行前完成真实菜单到地图的合法转换。Content-only 的早期更新可以真正重新捕获。
4. `completed` 表示该请求真正完成；`accepted` 只携带真实 C 私有 registry 发出的 `admission`。MZ 必须沿现有 `openAdmittedWorldBattle(admission)` 呈现／启动，不能再次生成对手或调用普通 `startBattle`。
5. `cancelFieldShortcut(request)` 只取消这个请求及其尚在途的实际 child；钓鱼仍等实际恢复回执。已完成／已交付的请求返回 `duplicate`，不会因菜单 dispose 再中止已交付战斗。过时代次不撤销 successor。

已实现的选择消费：六个 E2 本地场外招式，以及 Repel、Sacred Ash、Honey、三种钓竿的真实现有父端。Honey 沿同一个 field-item owner 使用 Sweet Scent child；钓竿沿真实 FishingOperation 和生产钓鱼呈现；Rock／Sweet／Fishing 的遭遇仍由注册 C producer 消费。未知 host 返回的 `encounter`／`admission` 只是额外 DTO，不参与权限或来源；FieldMoveOperation 只投影已验证的呈现 ACK 和自己真正发出的 intent。

E3 三种旅行招式、Escape Rope、Flute 未由本提交接通。query 明确不提供未接 handler，现有 raw bag 入口保持原合同。真实 PSManagement 菜单 transport、原生插件快捷键装配、E3／F／伙伴整体集成、NW 和人工输入／声音／真实失焦未签收。

## 有限验证

Node 22.21.1 私有 emit／生产 bundle，实际 App＋独立 native atomic writer＋生产 field/fishing host，真实 SessionFactory／Showdown 消费。新增 59 项：请求 clone／once／重入、source 漂移、management busy、取消／换代 successor、未知 DTO、Repel 最后 read／Content 的注册／库存／Content／原生生命周期终检、Honey 前缀、三竿与 bag 的逐次 RNG 序列、真实钓鱼两投球入口来源。相关 query32、UI67、E258、D32、Fishing69，共 317 项通过；完整 quick／NW 未执行。

准备／查询／无遭遇 Cut／Repel／拒绝前路径 0 RNG；Rock 保留一次 R11，Sweet／Honey 不新增 trigger 或 allowance；UI 钓鱼与同条件 bag 的 R01–R06 及后继 draw 序列相同。取消保留已经提交的正确前缀，不重复使用统计、消耗或 admission。

完整命令、首失败、strict／产物绑定和只登记清理台账由作者证据目录 `build/step5-5-development-20261115/world-app-integration-author/shortcut-selection-composed/` 保存。源码提交后冻结供独审，不以作者绿例代签独审。

选择来源后继窄修验证了原独审 map/player/point 三条失败及 Content-only 正控。UI 非移动场外动作一直核对出发点；Surf 只在真实 child 的已签发、按顺序安装 `runtime.surfBase` 后释放这项出发点比较，生产 host 的既有 scope 继续核对一次合法跳跃和任何额外位移。它不会被当作普通完成步，额外移动失败也不撤销此前正确提交的 Surf 前缀。后继证据为相邻的 `shortcut-source-fix/` 目录。
