# E02/E03 正式空伙伴读档输入

本说明只冻结测试输入与 oracle，不签业务执行。来源基线 `7e462a727578f2dfd28a6d2725d6168dc3808f85`；产品 src `508c287fca132b002c4859d99e97171b4ad9f01f` 不变。旧0ff及7e原断言、报告与失败保持。新固定输入须独立审查后才可运行；旧0ff仅P00→E01的GO不迁移。

## E02 保存期望的静态依据

正式净化规格 WP09 §4.1规定版本不一致时重设地图，§5.1区分内存保存计数／版本与磁盘写入；该规格不决定 MZ 自动保存次数。A合同§六、T20要求保留宿主实际抵达及保存边界，不能从“普通load”推出原生请求为0。以下次数仅是项目固定Reactor／正式插件与本受控输入的可复核调用契约，不声称参考运行等价。

| 固定调用链与前提 | 新oracle及边界 |
| --- | --- |
| P00文件来自真正onBeforeSave→PS_SaveState→DataManager→Storage/JsonEx；consumer `mismatch:true` 仅让当前System版本1与文件版本0不同，optAutosave=true。文件有效、无pendingReturn，地图5／队伍／库存均沿用同轮P00。 | 仍要求同轮physical SHA/receipt、完整framework GameState及stats严格相等；不依据运行结果增删字段。 |
| pinned `Scene_Load.onLoadSuccess/reloadMapIfUpdated`（reactor_scenes.js:2433–2455）一次调用reserveTransfer(map,x,y,d,0)+requestMapReload；真实goto新Map。 | 原raw201 mapId=[5]断言保留，并加完整五参数与真正onLoadSuccess前捕获的loaded-native位置相等。没有新增普通步、遭遇或F。 |
| `Scene_Map.create`（709–718）先锁存_transfer与_lastMapWasNull，再发真实loadMapData；正式解码后$dataMap仍是非空旧图，所以_lastMapWasNull=false。isReady→onMapLoaded→真实performTransfer完成。 | 原map/data/source、旧sprite/mask清退及generation+1断言保持。不能伪callonTransferEnd或用新图重放旧事件。 |
| `SceneManager.updateScene`（reactor_managers.js:3224–3236）调用真正start；pinned Scene_Base.start（44–47）先置_started/_active=true，Map.start→onTransferEnd（761–785）在_transfer分支且shouldAutosave=true时调用requestAutosave一次。 | outer原生request=1；E01/E03没有_transfer，仍为0。8帧后重复核同次数，禁止复活或重放。 |
| 正式world-travel-mz captureNativeSaveBoundary/readNativeTravelLease核current App/gen/Scene/queue/map/data/player和已消费reservation。无F owner/checkpoint/grant，blackout-save.beforeRequest走pass；app.deferWorldTravelSave=false。 | 这是普通版本重载请求，不是F继承请求或once-grant。新被动observer不创建请求、不授许可；若当前guard拒绝或意外retain，execute次数不足会失败，不以“可能拒绝”放宽。 |
| PS_SaveState普通load链finally在DataManager.loadGame返回Promise后、Scene_Load.onLoadSuccess前将ordinaryLoads降0；原生isAutosaveEnabled检查test模式、optAutosave、Game_System.isSaveEnabled。PSFlow无battle/world/management/inventory owner，PS_World.pending不含仅排队的companion birth。 | native execute=1。companionIngress.ready只登记waiting birth，initialize/restore在后续真正Map.update的mapFrame才启动，不是本次start保存门已忙的证据。 |
| PS_SaveState.beforeSave验证合法当前状态；saveGame与makeSaveContents分别再查，ordinaryWrites只记录正在写入。原生executeAutosave执行onBeforeSave，再DataManager.saveGame(0)。 | DataManager attempt=1、fulfilled=1（原返回0），拒绝/异常=0；真实file0经Storage重新解码，完整framework state等于P00。PSState.lastSave.slot0、lastSaveError=null。不能仅数到调用就当写入。 |
| native Game_System.onBeforeSave（reactor_objects.js:351–357）增加_saveCount并更新_versionId/frames/audio快照；正式framework snapshot没有据此更改GameState.stats。 | native saveCount仅+1、version成为当前1；这些host字段与framework完整状态分账。file0的native计数/版本也核同。异步global-info写完成不被DataManager结果本身冒称全局事务原子完成。 |

独立复核应沿当前固定源码验证上述无owner／无checkpoint和调用顺序。若此推导遗漏有效生产门，保留失败并重新分类，不运行E02来反推期望、不关闭autosave或更换为观测到的计数。

## E03 单旧请求运输

`singleRequestHold`只在真正旧357 RegisterEventCompanion前，以实际App、generation、map/data和解释器身份arm一次。匹配真实旧Map005请求后记录该XHR对象与构造序号并立即消费arm；新Map005对象始终经原send通过。同源同URL不再代表旧请求身份。原send的receiver、全部参数、原返回、异常及onload保持；release在发原send前标为已用，重入／异常不能重发。

旧请求只在正式新generation恢复完成、216正控和真实beginManagement successor已经存在后release一次。业务原“旧回执不得完成／不得清successor”、完整state/RNG/保存、source、8帧、清退和restore once断言保持。运输pure控使用明确synthetic方法／Promise，不运行App、正式load或Storage，不代签该真实业务链。
