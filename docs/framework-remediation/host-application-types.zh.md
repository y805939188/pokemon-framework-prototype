# R4：宿主应用类型合同

第一小批只收紧正式应用装配与学招 UI。`application-host.ts` 从真实 GameApplication 派生应用和窄 LearningApplication；动态生产入口只描述构造需要的出口，编译型 consumer 同时验证它与真实 production 出口兼容。MZ 的对象、Scene 和运行时加载边缘仍允许必要的 any。

PSFlow 自身的 app／_app、状态、内容、Dex、随机、时钟和构造参数有实际类型；生产构造器、端口对象与 options 都受检查。Progression 的本地访问器、handle.application 和直接调用也受检查，不只是导出一个未使用的 Pick。

这些引用为 type-only，插件仍独立打包为 IIFE，并在原位置动态加载 production.cjs。没有把 application 或 Showdown 打进 UI，也没有改变持久 schema。继续流程使用已有联合返回值做窄化，宿主的 hostErrors 保持宿主附加字段。

`scripts/tests/host-application-types.test.cjs` 包含正确 consumer、错误签名／端口／窄视图负例，并隔离复制实际插件源码，注入错误 revision 和 state reader，证明真实本地调用链仍产生编译错误。插件编译不增加 ambient Node types。测试只写自己的临时目录。

本批测试先行：新增 consumer 在实现前 0／6 通过；初次收紧实际插件时，编译器发现旧手写接口隐藏的 continuation、receiving、hostErrors 与 nullable 处理。修正类型及等价窄化后，consumer、Scene controller 与 learning UI 合计 116／116（其中 consumer 9 项） 通过，完整 typecheck 通过。所有运行均为 Node／合成宿主；没有 NW、音画／物理输入、CI 或原版对照通过声明。

第二小批继续收紧 Inventory、Management、Evolution、Pokedex 的本地访问器、handle／request.application 和实际调用。每个视图由真实应用 Pick 派生；PSFlow 的用例转发签名也从应用派生。混合继续结果只为不存在的字段补可选 never 类型，表达原本读取缺席字段得到 undefined 的事实，不抹掉 discriminator 或改成 any。泛化的 InventoryOutcome.result 仅在已确认的道具反馈分支投影为 ItemResult；MZ 窗口和动态菜单边缘仍保留必要 any。

新增四个真实插件编译负例在收紧前为 9 通过／4 失败；补齐真实调用与联合返回值窄化后，完整 typecheck 通过，consumer 与八套默认 UI 定向共 257／257 通过、失败／取消／跳过均 0。输入服务抽离另属 R5，本批未改输入采样及嵌套事务恢复协议。

第三小批收齐 `PS_SaveState` 的迁移应用访问链。`SaveApplication` 从真实应用派生 preview／confirm／cancelFriendshipMigration 与既有 host-state-replacement 守卫；本地 app 与当前 `_app` 访问器实际消费该类型。迁移 port、preview/read、commit/request/result 都受已有 `FriendshipPersistencePort` 约束；局部 schema 视图只取纯核心 migrateGame／snapshotForSave，使验证后的 GameState 不再沿整条 port 退化为 any。迁移句柄、预览联合和结束结果也使用真实应用类型。

本批保留 MZ 对象、JsonEx／压缩、Node 文件与动态 IO 的必要 any，没有重写 PSState 宿主对象、持久编码、迁移状态语义或持久端口协议。新引用均为 type-only，未把 GameApplication、Showdown 或 Node ambient declarations 引入插件；运行时只增加等价本地访问器／schema 函数别名，原参数、状态检查与 await 次序保持。

测试先行实际复制原插件源码编译：未修改代码的正例通过；把真实 confirm(handle)／cancel(handle) 改为42、preview paths改为42、preview state改为42、commit request改为未知字段、commit result改为非法status，旧代码六次均误编译成功，因此新增测试首轮为1通过／6失败。类型接线后相同7项全过；外部窄视图与端口正／负例增补后，完整 consumer 为26／26通过。完整 `pnpm --dir src typecheck` 通过，包含插件、工具与framework/core/app检查。

另运行原 `test-mz-integration.cjs` 的全部用例及app/file integration，共72／72通过。MZ套件原before hook会构建共享插件，因此只在本批 ignored 目录复制测试与host，定向调整Vite `--outDir` 和插件产物读取路径；业务用例未改，真实JsonEx、压缩与生产应用仍来自primary，所有存档／备份均为本批临时生成的合成资料。共享 `js/plugins/PS_SaveState.js` 前后SHA一致，未改cold树、未构建共享engine。合计26＋72＝98项，失败／取消／跳过均0；这不是NW、真实玩家档或全宿主通过声明。本地红绿、精确命令与源码／临时产物身份记录在 `build/r4-save-application-types/`，由根协调者统一登记和提交。
