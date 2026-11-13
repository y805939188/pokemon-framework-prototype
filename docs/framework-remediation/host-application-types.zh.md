# R4：宿主应用类型合同

第一小批只收紧正式应用装配与学招 UI。`application-host.ts` 从真实 GameApplication 派生应用和窄 LearningApplication；动态生产入口只描述构造需要的出口，编译型 consumer 同时验证它与真实 production 出口兼容。MZ 的对象、Scene 和运行时加载边缘仍允许必要的 any。

PSFlow 自身的 app／_app、状态、内容、Dex、随机、时钟和构造参数有实际类型；生产构造器、端口对象与 options 都受检查。Progression 的本地访问器、handle.application 和直接调用也受检查，不只是导出一个未使用的 Pick。

这些引用为 type-only，插件仍独立打包为 IIFE，并在原位置动态加载 production.cjs。没有把 application 或 Showdown 打进 UI，也没有改变持久 schema。继续流程使用已有联合返回值做窄化，宿主的 hostErrors 保持宿主附加字段。

`scripts/tests/host-application-types.test.cjs` 包含正确 consumer、错误签名／端口／窄视图负例，并隔离复制实际插件源码，注入错误 revision 和 state reader，证明真实本地调用链仍产生编译错误。插件编译不增加 ambient Node types。测试只写自己的临时目录。

本批测试先行：新增 consumer 在实现前 0／6 通过；初次收紧实际插件时，编译器发现旧手写接口隐藏的 continuation、receiving、hostErrors 与 nullable 处理。修正类型及等价窄化后，consumer、Scene controller 与 learning UI 合计 116／116（其中 consumer 9 项） 通过，完整 typecheck 通过。所有运行均为 Node／合成宿主；没有 NW、音画／物理输入、CI 或原版对照通过声明。

第二小批继续收紧 Inventory、Management、Evolution、Pokedex 的本地访问器、handle／request.application 和实际调用。每个视图由真实应用 Pick 派生；PSFlow 的用例转发签名也从应用派生。混合继续结果只为不存在的字段补可选 never 类型，表达原本读取缺席字段得到 undefined 的事实，不抹掉 discriminator 或改成 any。泛化的 InventoryOutcome.result 仅在已确认的道具反馈分支投影为 ItemResult；MZ 窗口和动态菜单边缘仍保留必要 any。

新增四个真实插件编译负例在收紧前为 9 通过／4 失败；补齐真实调用与联合返回值窄化后，完整 typecheck 通过，consumer 与八套默认 UI 定向共 257／257 通过、失败／取消／跳过均 0。输入服务抽离另属 R5，本批未改输入采样及嵌套事务恢复协议。
