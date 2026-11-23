# E2／快捷 App 测试的同源默认入口

15个现有测试仅在原第一条业务语句之前调用 `regular-field-action-test-runtime.cjs.prepare(profile)`；原调用、fixture和断言保持原样。纯规则、D/A native、Scene／wrapper、F/E3/G、旧 regular helpers 和正式 runner 均不改。

| profile | 使用测试（省略 `test-`／`.cjs`） | 显式 review 的原有必需输入 |
|---|---|---|
| query | atomic-field-query-mz | `PF_E2_PARENT_OUT` |
| native | field-move-host | `PF_MZ_RUNTIME_OBJECTS` |
| leaf | field-move-operation、field-move-reentry | `PF_FIELD_MOVE_APP_OUT`、`PF_MZ_RUNTIME_OBJECTS`；App bundle可选 |
| parent | field-move-real-parent、field-runtime-query、field-facts-observation、field-shortcut-real-parent／selection／source-parent | leaf必需项＋`PF_E2_PARENT_OUT`、`PF_E2_PARENT_ENGINE`；App bundle可选 |
| ui | field-shortcut-freshness／joint | `PF_SHORTCUT_UI_BUNDLE`或`PF_SHORTCUT_UI_OUT`，只要求query／menu两个模块 |
| ui-menu | field-shortcut-menu | 同上，另需要party／window模块 |
| fishing | field-shortcut-fishing | `PF_E1_PARENT_OUT`、`PF_FISHING_HOST_OUT`、`PF_MZ_OBJECTS`；E1 engine可选 |
| combined | field-shortcut-showdown | parent＋fishing必需项；各自原有可选项不变 |

只要当前profile有任一显式PF输入，就完全进入显式模式：必需成员缺失立即报错，不补默认输出。UI保留原BUNDLE优先于OUT的二选一路径；未被选中的分支不新增要求。显式目录／文件不存在保持失败。原fixture仍负责其模块实际读取；helper不改写review输入或伪造Proxy能力。

同进程默认→显式再入时，只从真正显式的成员选择来源；验证成功后撤掉本helper在该组仍保留的默认成员。后来显式OUT不会被先前默认BUNDLE遮住，原测试加载函数也会实际走OUT；真正用户显式BUNDLE仍优先。非UI组先前注入的默认required成员不能补齐新显式组，旧默认optional成员也不混入新组。

全部缺省时，helper在本工作树的 `build/test-field-action-runtime/<inputHash>/`生成私有strict CJS emit和五个必要App／UI CJS bundle。emit以仓库根为rootDir：E2／E1父端的OUT指向`out`，leaf／FishingHost OUT指向`out/src`；两个原布局不互相覆盖。UI使用bundle目录。第一次生成缓存由一个测试进程负责，现有正式runner逐套串行；本批定向命令也使用`--test-concurrency=1`。遇到不完整／失败的同hash目录直接失败并保留，不能清空重试。

输入hash包括本树framework／plugins／types TS、helper／组合port、package／lock、Node版本与实际可执行文件hash、strict配置、所用TypeScript wrapper／匹配平台包完整文件及实际tsc binary、Vite及已安装运行依赖完整包清单。Vite worker另外记录真实ESM／CJS加载文件、解析的源模块及本树native addon；它们必须已在编前清单，且编前后完整输入相同。缓存命中逐字验证inputs、全部输出路径／SHA和实际加载工具输入；不使用只有存在性检查的旧out。

实际engine只来自本树正式 `js/engine/build/production.cjs`。使用engine的profile要求已准备本树正式distribution；helper不运行distribution builder或Showdown builder。它核对当前`sourceFingerprint`、正式manifest、distribution完整inventory／hash，并把实际`js/engine/build`共享chunk和`js/engine/showdown`全清单逐项与distribution核对。缺少或过期就失败，不自造engine、不借作者out或另一树产物。默认native objects／windows读取本树当前安装文件并计入输入hash。

独立review可继续显式传入自己的固定emit／bundle／engine／native输入。默认路径需要事先准备当前树已安装的工具及正式distribution；不安装依赖，不联网、不启动NW，也不运行任何旁路对照材料。这里不改变A3或730 F1的产品状态，不代签实际菜单接线、完整Surf、F/E3、NW/T20或人工验收。

当前正规整合增补：`world-scene`用于两个已注册的App受控Scene叶suite，复用parent的四个必需输入并要求`PF_MZ_BATTLE_SOURCE`／`PF_MZ_BATTLE_COMPILED`。显式review组完整保留；缺省组先核现有`PF_HEADLESS_REGRESSION_BINDING`及其中Flow源码／IIFE的精确字节，再启动strict emit。新增world-battle-scene-mz.ts编译入口；不使用这个受控constructor证明真实MZGlobalUpgrade或生产私票安装。当前11项真实Native向量及两条file/freshLoad链仍按独立接入计划执行。
