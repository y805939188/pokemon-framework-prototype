# 空伙伴正式读档的 globalInfo 先决态

本补丁是测试输入支持准备，产品 `src` 不变。`fixture()` 与 `io-adapter.install()` 默认仍使用原有空缓存；只有 `test-empty-formal.cjs` 显式传入 `globalInfoProfile: 'formal-empty-load'`。

该 profile 执行固定 Reactor 原文中的 `DataManager._globalInfo = null` 初始化，调用原 `DataManager.loadGlobalInfo()`，等待原 `isGlobalInfoLoaded()`。真实 `StorageManager.loadObject('global')` 返回的对象由原生方法安装。生产者的新隔离目录没有 global，保留原生失败后空数组行为；消费者必须成功读取本 run P00 的实体 global，不能以空数组 fallback 通过。

这仅补齐正式读档依赖的原生玩家数据先决态。没有执行 `Scene_Boot` 的数据库、配置、字体或图像完整启动链，也不证明真实新进程冷 Continue。

`global-info-input-support.cjs` 被动观察 Storage 的 global 读写：以原 receiver、原参数 `Reflect.apply`，返回原 Promise，同步错误原样抛出；新增 Promise reaction 只记录原 Promise 的结算。`waitForSaves()` 等待真实 global 写入完成，不把 file0 完成、文件已出现或 `saveGlobalInfo()` 返回当作 global 已完成。

正式正文已准备以下强断言，当前尚未执行：

1. P00 经正式 onBeforeSave／SaveState／DataManager／Storage 保存 file1，等异步 global 写完，记录实体 global SHA、完整 slot1 元数据和原生版本／saveCount。
2. 消费者从 null 经原 Storage 读取同 run global，加载前确认 slot1 索引、file1 SHA、完整 framework、原生版本和 saveCount。
3. E02 保持真实 Scene_Load／版本重载／原始 201／自动保存链；等待 global 写入后确认 slot0 和原 slot1 元数据同时存在，file1 字节及完整状态不变，file0 完整 framework 与原生版本／saveCount 正确，并保留 `E02-global-index-result.json`。
4. CEA 准备时保留 E03 原 getter 断言；其后 sealed 诊断确认该 getter 缺席不代表旧 App 回执。后继明确 oracle 变更见 `RECEIPT-INPUT.zh.md`，原失败、源/state/RNG/201/save/216/successor/8 帧/restore-once 强断言保留，正式新 run 仍未执行。

新增两个支持文件已列入 `scripts/tests/final-production-inputs.json` 的 controlledInputs，既有 `e3-empty-load-input-support.test.cjs` 在绑定校验后加载新纯支持测试。regular 套件数量仍是 399 登记项；没有执行 regular wrapper、cold、App 或正式 P00/E01/E02/E03。后继必须取得新固定输入的独立审查 GO，才能启动授权范围内的新 run，不能借用 81d 的历史 GO。
