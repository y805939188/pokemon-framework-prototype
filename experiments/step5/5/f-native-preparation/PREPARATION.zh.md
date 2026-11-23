# F native 接口准备（未实现、未执行）

基线b26c7e200d26729eb90450f48c582f0ab30b1271，独立新树step5-5-f-native-preparation-20261115。旧9a／b26／14b不写。只读固定源码与项目实际MZ runtime；App新F WIP未读。本文是接口／夹具计划，不是空consumer、生产实现或通过报告。coding请求Sol xhigh默认普速，实际route未核验。

## 1. 已有能力与四个缺口

| 接缝 | 现有真实能力 | 必须先冻结的缺口 |
| --- | --- | --- |
| F来源／Scene交还 | 同Flow IIFE的opaque travel source，已注册pure WeakMap reader；reserved／performing／arrived；native goto＋真正Map构造，支持MZGlobalUpgrade orig.apply，SOURCE／once与旧失败不清successor | 只有E3源Map到目标Map票，没有Battle／Dex／菜单→冷Map的F source-handoff proof；当前Map也不能在F开始后补签旧Scene会员 |
| 到达前刷新 | native Game_Player.performTransfer内已有refresh→clearTransferInfo；其后private arrived proof和同步confirm，之后才display | 普通WorldTravelHost.effect(refresh)是async；F需要同步合同，明确消费已发生的native proof或在同步confirm窗口再做所需刷新，不能await至自动保存之后 |
| 连接毒步→F保存 | 真实requestAutosave才登记一个closure，锁App／generation／physical owner／receipt／lease／serial／player／scene；C1 returned认可后可迁exact新Map | F新reserve会淘汰旧physical proof；需App私parent关系同步转交原实际请求，不是按saveBlocked推断，不增第二套savedflag，不在atomic finisher调host |
| source／target进图 | native perform后App确认内B-entry原子安装；generic coordinator记录物理路由；E3 actualarrival去重 | F announce busy期间可能排source进图；需App私owned entry／claim规定source前缀与target一次关系，不能旧source通知晚刷目标weather／heal，也不能一律skip忙时进图 |

## 2. 所有权及纯读取方向（草案，待App ports-only固定）

App是Fowner／generation／phase／parent关系及source／target entry归属唯一权威。native生产者仅在真实App承认的当前F owner下arm一次source handoff，sourceScene为当前实际对象，不吃调用者kind／ID／bool权限。native的真实nativegoto与完整genuine constructor分配单次Map receipt；known pure reader从**同一canonical registry**读取immutable当前证明。source对象无公开可写cell／key，旧issued membership不能回放成current。

拟扩展existing source的readonly source-handoff部分（名称／精确类型待App作者）：exact Fowner、generation、originScene、genuine Map birth／queue epoch、当前scene/player/map/mapId/data身份、cold readiness阶段。仅描述应携事实，不是允许直接传这些DTO；record只能producer私publish，atomic只known-module纯reader物化。App最终区间只比较，不能未知getter／host callback进入finisher。atomic-state-mz无本任务写权，待ports／reader固定由root交原作者。

野外毒步原currentMap若需要member证明，必须来自F之前真正nativegoto／constructor完整完成时已登记的观察性birth＋queue epoch；F只绑定该exact current frame。不能靠initialize、new.target、prototype marker、旧Scene对象重新签发；nativegoto别名返回旧Map亦不能刷新旧权限。Battle／最后DexEvo菜单→Map使用private armed的真实一次构造；foreign current／queued、partial构造、重入、throw和晚source均不能洗回旧Fowner。

这要求扩展已有private allocation握手而非第二IIFE／第二producer／DTO registry。普通E3 SOURCE／once与raw201正常路径必须保持，source newticket与已有owned reserve不能竞争一张Map票；实现前先把各phase优先级与exact旧cleanup约定好。

## 3. 实际native终端时序

真实顺序已核：Game_Player.performTransfer定位／refresh→clearTransferInfo→producer genuine arrived proof→同步App确认→Scene_Map.createDisplayObjects→Scene_Map.start→onTransferEnd→autoplay／requestAutosave。

F同步刷新不得晚于同步确认返回及display；未知native调用前后核真实App owner／native serial／player／mapID／data／vehicle来源。最终业务安装区间无host callback。若native刷新异常，保持其真实已发生前缀，不能回滚成从未到达，也不得继续display／保存；显式恢复沿原genuine arrived proof，不重复reserve／B-entry／治疗／统计。

连接继承的旧实际保存请求若在confirm完成就立即resume，随后target onTransferEnd会再次请求，可能双保存。必须先冻结：何时迁移原closure、谁拥有它、target实际request如何coalesce、target无request时原已存在请求怎样处理、哪个私terminal grant允许原生尾完成后只consume一次。新代／新root／新201／tail失败不能让旧closure清successor、无条件保存或永久静默悬锁。原native保存作者门仍拒绝且不自动retry；计请求／原closure执行次数，不冒磁盘／冷Continue。

## 4. F entry约定待决项

现WorldEntryCoordinator会记录物理previousMapId后调用observeWorldMapEntry。Fbusy时source通知若合法需要前缀，必须经当前F私claim在target进入前同步apply／drain；若属同图菜单重建不应发新进入，也须依据真实entry cause／genuine source proof分类。不能Fbusy全drop、按mapID猜owner，或让队列旧source晚覆盖target天气／heal／访问记录。target仍由同native receipt到达原子B-entry一次，generic duplicate须关联该私entry而非当前地图重放旧事件。

## 5. 有界实际fixture矩阵（全未执行）

- 来源：真实Battle结束；最后Dex／Evo continuation；毒步已有genuine Map；冷Map数据空再加载；source当前和queued foreign；旧Map别名重排；borrowed initialize／partial constructor；实际orig.apply升级路径；source stop抛及通知重入successor。
- 来源前后：Map对象同但setup换ID；同ID换$dataMap；getter／Proxy反控；native epoch reserve→clear ABA；App newgen／Content变化；late旧owner callback不得获新票。
- 同步刷新：trace native perform→刷新→confirm→B-entry→display→start→onTransferEnd→save；正常／native refresh抛／provider重入换图；失败恢复不重reserve／prefix／B一次。
- 保存移交：实际connection目标毒步全灭，旧E3真实defer有／无请求；真实C1先push/pop后毒步；F source／target autosave作者开／关；target另发真实request去重；late旧E3resume／cancel／新201／newgen；只一个实际closure获最终消费权。
- 进图：F announce期间sourceentry已排队、source冷重建、target真正抵达、generic duplicate及晚旧source；逐项断言访问／heal／weather／localreset／RNG顺序，目标B一次，旧source不晚覆盖。
- 旁控：相关原E3 SOURCE／once／raw201／连接D／C1 No／Yes只取必要邻接，不机械重跑旧19／全量。

准备复用R9真实App+完整Flow／World／Inventory IIFE框架，新增真正native Scene_Map.isReady及文件末Reactor overlay（model preload／isReady／start），sourceMap从插件安装后真实nativegoto构造，不沿旧fixture seedMap伪称genuine冷ready。XHR／PIXI／渲染资源仍明确headless替身；actualMain／实机／人工／磁盘另验。

## 6. 前置与执行门

当前App ports-only SHA：待提供；native pure source-reader后继：待双方精确冻结；atomic接线：root尚未授权本作者写。不得把本计划当已签接口。固定App/native/atomic实际源码后，再登记具体矩阵子集、RNG、精确Node22 argv／WT_SOURCE_ROOT／TOOLS_ROOT／E／plannedOutputPaths和每次input前后，才启动有限headless验证。现在build／test／NW／焦点／声音／全量／默认发现均0次；没有更改生产源或旧证据。
