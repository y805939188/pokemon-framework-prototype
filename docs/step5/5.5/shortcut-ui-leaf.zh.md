# 5.5 快捷／队伍入口叶

基线 `a6f9c960d757374ad7704915d5e26dd74f378c86`。本叶负责只读快捷查询、两列基础窗口和当前队伍调用者的场外动作子菜单。依据 A-contract §六/T11、正式 WP27 §5、WP59 §5.1。生产 `GameApplication`、`PS_World`、`PS_Management` 的装配由唯一整合者完成。

## 开发前测试登记

| 责任 | 登记向量 |
| --- | --- |
| 查询 | 登记但无货／未知物品；处理器丢失仍收集但选择拒绝；排序及同名稳定身份；九项批准能力；蛋／移出队伍／忘招／资格／处理器变化；无能力 provider 不显示可执行招式；查询不改输入 |
| 选择 | 只交稳定 itemId 或 memberId+moveId；再次查询后交真实父 admission；DTO 不能创建许可；fresh query 拒绝不调用 admission |
| 生命周期 | 取消、错误后重显、迟到结果、dispose、新 owner、异步期间重入；旧菜单不能关新菜单；调用者变化不能恢复新菜单控制 |
| MZ 叶 | 基础 Window_Base 两列与滚动；只接收调用者转交的输入；ordinary 输入不拦截、不改全局 Input；队伍入口只接自己的调用者；恢复原菜单控制 |

RNG：本叶查询／呈现／选择消费 **0** 次业务 RNG；测试令 Math.random 抛错，不能把能力父操作的 RNG 计入此叶。真实快捷键绑定、生产队伍入口装配、场外动作／钓鱼完整闭环、NW 与人工键盘／声音／真实失焦均 **NOT_IMPLEMENTED / NOT RUN**，不以叶测试代签。

## 最小装配计划（NOT_IMPLEMENTED）

1. 唯一 App 整合者以当前库存／内容目录／队伍和实际 E2/E3 silent qualification 构造 `FieldShortcutQuery`，公开投影；所有执行仍经实际 parent admission。查询结果不提供 owner 或 token。
2. `PS_World` 唯一整合者在地图已静止且可进入菜单时转交既有 `hostInput` 的 special 输入，创建基础窗口并调用菜单叶。道具 admission 复用 `beginInventoryOperation → inventorySnapshot/ticket → prepareFieldItemHandoff(..., 'shortcut')`，地图恢复后执行已有 handoff。move admission 交真实 E2/E3 父入口，重新观察并验资格。
3. `PS_Management` 唯一整合者在当前可写队伍成员菜单中调用 `createPartyFieldActions`；传当前 controller 的真实调用者对象和控制暂停／恢复闭包。不能给只读 summary、仓库成员、战斗 summary 或其它调用者安装此子菜单。返回地图和执行由父 admission 负责。
4. `PS_Inventory` 的登记命令仍沿既有持久操作；本叶不写 GameState、不登记持久缓存、不改 schema、不生成操作 token。

验证命令、精确源码与编译产物身份、实际结果及清理台账见主树 `build/step5-5-development-20261115/shortcut-ui-author/`；独审与整合尚待后续。

## cc2 独审 R1/R2 定向修复登记

旧固定候选及独审证据保留。新隔离树以 `cc2fba213d90df421a3f7ae8aabedbe066d3b8a3` 为基线；首先私编译并原断言复现独审 15 项的 11 通过／4 失败：handler 同步重入双 admission、handler 清库存、canUse 移队伍、catalog 清库存。修复向量还覆盖同代次库存／队伍／内容替换、名称回调变动、资格上下文身份变动、异常后的选择释放与后续成功、取消／dispose／新 caller、普通输入和真实 Window_Base 正控。

RNG 仍为 0；每个 handler／canUse／名称回调在一次查询内最多按原收集次数执行，不以重跑资格或无限重试修复。只读 state/catalog 的末端观察用于对比 materialized 数据。实际父 admission 保持最终新鲜授权。

54b5f20 曾采用 `read()`／`catalog()` 的前后观察，独审 R3 已证实不能捕获末端 read 替换整个目录对象；该旧方案不再作为安全查询契约。

## R3 联合观察契约与测试登记

以 `54b5f2002f53bebdd5bb9c5a7e270140797cbb63` 为基线的新树先保留并复现原 R3：新独审16项为15绿1红，resolve仍available且实际catalog为空，read2／handler1。新契约改为实际父层的 `observe(): QueryObservation`，一次返回 `{state:{inventory,party,...}, catalog, eligibilityIdentity}`。parent须在所有可能重入的获取回调结束后，从实际权威状态／实际Content／资格上下文一次捕获联合物化数据；不可将旧read/catalog返回值顺序拼接冒充联合。能力 provider 的额外事实（世界／local／徽章／registry／内容等）必须纳入确定性资格身份；不用clock/frame制造必变版本。

查询在开头联合捕获，调用资格／名称provider各一次，最后再次联合捕获；末端只做plain-data验证、复制、纯语义比较与返回，没有追加旧观察调用、重跑资格、无限重试或RNG。legacy构造字段可继续类型兼容，但缺observe时不调用read/catalog，明确返回 `joint-query-observation-required`／空stale行。有效joint正常snapshot／resolve／菜单选择继续成功，不能靠一律拒绝宣称修复。

原probe只作构造器端口接线适配：旧read/catalog回调保留为测试中的变动钩子，其返回值不再作为联合数据；钩子执行完后，从fixture实际store/context一次直接深拷贝联合聚合。原业务断言、重入行为和调用计数不变，原始探针另存。向量登记：目录整体替换／反向状态替换／资格上下文变化、缺joint明确拒绝、正常副本、原R1/R2/15及R3/16、once／cancel／dispose／newowner／ordinary-await、真实Window VM正控和RNG0。生产joint provider由唯一App整合者实现，真实parent fresh admission仍是最终授权门，本叶不代签该接线。
