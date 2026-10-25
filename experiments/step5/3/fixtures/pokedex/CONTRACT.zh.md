# F 纯图鉴模块交接

实现起点 `b9d29a8fe718e865ef64123ba44f7190ff5a87f2`；本批只增加两个规则文件、两套定向测试及本目录。没有修改 B schema／迁移、共享 types／index、app、保存、正式 runner 或插件。主协调允许 C／D／F 基于固定 B 接口先行，这不表示 B 已接收或 M1 已通过。模型请求 sol xhigh、Standard／nonFast，隐藏有效配置 UNVERIFIED。

依据为已批准整体 r3 §8／D53-02a–c、06ac r3 §3，以及只读正式 WP62、WP66-B 与相关净化测试目录。测试是从正式规格推导的合成期望，不是原版运行观察。没有读取 Ruby 或 reference sources 快照。

## E 的记录接缝

- `normalizeDexAppearance(content, individual, "register" | "recent")`：`individual` 只含已映射基础内容 ID、原形态号、数值性别和异色；普通登记查展示形态名称，recent 查原形态名称；前者性别 2→0，后者保留 2。无法识别返回 null，不造 form0 来代替未知身份。
- `planDexRecord(dex, input)` → `{status, patch, changed, refreshAccessible, previouslyOwned, reason?}`。`DexAppearance = {species,gender:0|1|2,form,shiny}` 是规范化展示值，不能传原始 details／日志／引擎对象。来源 `appearance/defeat/capture` 必须给 `internalBattle`；其可选 `species` 只用于“基础身份已知而精确形态缺失”情形，此时传 `appearance:null`，只消费独立可证明的基种 seen／计数／owned，不造形态。其余登记无可识别身份返回 invalid／空 patch。
- `grant/receive/party-gift` 显式给 `seeForm`：即使 false 仍写 seen＋owned；`party-silent` 的 false 只写 owned。`evolution/split/trade` 登记＋owned；`form-commit` 只登记。包装区分不代表已经完成对应真实应用入口。蛋／暗影／孵化等本期未开放消费者不在这里新增持久字段。
- capture 的直接 owned 写不受 internal 门；内部 capture 另登记并累计捕获。defeat 只累计当刻展示基种。**计数每调用一次就加一次**；集合布尔不是事件去重标志。E 必须用已经批准的原账本／prepared seal 同次安装，拒绝重放及迟到补账；本模块无事件账本、无 trusted caller 权限。
- `previouslyOwned` 需在安装前保留；`dexShouldOfferEntry` 保留捕获与其它获得提示条件分叉。消息正常返回、打开 Info 之前，E 才调用 `planDexLastSeen(dex,species,record)` 作小提交。此函数按原键、性别不归一、总覆盖、幂等，不加 seen／owned／计数，也不要求重新登记。交换始终只对草稿投影调用，最终一次安装。
- `applyDexPatch` 返回完整 detached DexState，可用于草稿组合；`patch` 只含确实改变的现有字段。`refreshAccessible` 只要求刷新调用方的局部派生缓存，不落档可访问列表。`planDexClear` 保留 hasDex／unlocks／view／layoutIdentity；授予资格可安装现有 `{hasDex:true}` 字段。

## 查询与观看接缝

`createDexQueryCatalog` 从 B 的 Content／forms／regionalDex 与显式翻译表产生普通值目录。`dexSortKeys` 原样传递；中文缺作者键进入 other 并诊断。英文可从显示名派生；没有自动拼音、内部 ID 回退或 Intl 默认排序。各入口读取 lastSeen 的形态数据，普通图像请求固定 shiny=false，不写存储记录。

区域有 `dexRegionMembers`／`dexRegionalNumber`／`dexRegionLength`／`dexRegionCounts`、`dexAccessibleRegions`、`refreshDexAccess`、`dexMenuEntry`。空／缺区域的数据级计数返回具名 unavailable；列表按已批安全政策回全国。当前区域模式独立于 unlock；常规模式检查 unlock 与 seen。计数投影只含 seen／owned 和各自完成标记，不增加第三个长度显示数。`planDexUnlock` 返回现有 unlocked 的 patch。

`dexEntryNumber(...,"summary"|"brief")` 保留首解锁即停／继续后续区域的差异。`dexCompleteEntryNumber` 独立保留完整单条 view=-1 查最后区域表及偏移键 -1 的参考兼容异常；不要改用全国结果统一它。主列表的 `row.number` 则来自本列表位置与偏移。

`dexList` 提供六模式、数值裁尾、偏移首行与不可开的未见占位。十元参数顺序是 `[排序,名字组,属性1,属性2,身高下界,身高上界,体重下界,体重上界,颜色,形状]`；目录数量全部由实参决定，大小具体档 0..36、未选 -1、表长哨兵 37 分开。37 档常量单位分别是 dm／hg；筛选始终用这些原值，US Info／搜索重量显示差异单独保留。

`createDexSearchSession` 初始化已接受参数／列表／结果态／游标。编辑草稿由调用方另存。`startDexSearch` 返回 mode patch；空结果保持原 session 四项与草稿，不恢复 mode。Cancel 直接弃编辑草稿，无领域写。`backDexSearch` 仅在结果态复 mode0／参数，并按当前物种恢复普通列表游标；非结果态仅返回 exit。`refreshDexSearch` 在条目返回重跑原已接受搜索并夹游标。`planDexViewing` 只写明确的 region／mode／非搜索游标；结果态游标不持久化。空区域的全国回退列表可有本地游标，持久游标仍须符合 B 的原空表只允许0规则。

`dexInfo` 给拥有门后的类别／文本 key、尺寸、属性、足迹资格和两计数合成值；媒体处理归后继。`dexForms` 的 baseFrontsEqual 由调用者提供规范化的资源解析相等事实（两者都缺也可以相等，不证明资源存在），每形态优先使用自身 gender；options.gender 只作显式目录缺字段输入。结构合格非0形态先决定 multi，再查已见；showAll 不越过结构门。`planDexFormSelection` 仅在 >1 项时返回首轮／移动的 lastSeen patch（shiny=false）；BACK／USE 保留已写值。`moveDexFormSelection` 首末循环。

`dexArea` 只消费已规范化的遭遇表、地图位置／隐藏／有限 ASCII 掩码及可见 Point。保留 v>0 枚举同时含 v0 的兼容行为、尾格不补、同格可见点并集。没有输入或无合法点是 unknown；非法有限域是 invalid。完整地图／遭遇 provider、绘制与媒体在5.5／G／H，不由本模块伪造。

## 验证与剩余门

测试入口是 `test-pokedex-rules.cjs`／`test-pokedex-query.cjs`，直接加载这两个真实 TS 模块，不等共享 index 导出。JSON 结构回读另外调用**本工作树构建**的 B `dexStateProblems/dexLayoutStateProblems`；不是文件保存／新进程证据。向量分层见 `VECTOR-MAP.csv`。

必要命令：`pnpm --dir src typecheck:framework`、`node scripts/check-boundaries.cjs`、`pnpm --dir src build:engine`、`node --test experiments/step5/3/test-pokedex-{rules,query}.cjs`，以及 B `test-migration7.cjs` 回归。构建保留原入口；F 尚未导出到共享 index，正式 runner 也尚未登记，均交 E 单 owner。

作者自检在既有项目 Node v22.21.1 上实际通过：规则18／查询29，fail／cancelled／skipped 全0；framework／core／app 类型、边界及现有 engine bundle 构建通过。B 迁移40项回归另计，不把它当 F 新功能覆盖。初轮 shell 默认 Node v22.14.0 的通过记录保留；最终资格采用22.21.1重跑。工作区封存分派 SHA256SUMS 的8个输入成员也全部核同。

尚未验证：真实 observer／faint／capture／grant 及原账本一次安装、全事务失败隔离、交换草稿最终安装、物理输入、场景与媒体、正式 NW／真正退出新进程、文件保存、CI、性能、M1 或整5.3。纯测试通过不能替代这些门。本工作树没有启动 NW／GUI／后台服务，也没有远端操作。
