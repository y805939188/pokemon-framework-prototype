# F 当前联合测试支持

本目录的 `current-fixture.cjs`／`test-current-production.cjs` 是当前正式绑定的 pending 存档链。`scripts/tests/f-load-current-production.test.cjs` 顺序选择 P00、L01、L02、L03；单 family 新 run 内共 4 个业务 leaf。只有登记和纯输入控制通过时，不代表这四项已经执行。

P00 经真实玩家完成步、D 野外中毒、F 资源失败形成合法稳定 pending；不直接填写 `pendingReturn`，不产生测试 owner、nonce、receipt 或到达 ACK。正式 `Game_System.onBeforeSave`、PS_SaveState 的 snapshot 校验、`DataManager.saveGame(8)`、Storage、JsonEx、pako 与文件系统生成 file8/global。全局索引使用现有 `formal-empty-load` 测试 profile 的真实 native readiness 前置，profile 名不意味着该存档为空。输出为当前私有 `build/headless-final-production/f-load-current-*/P00/{save,profile,...}`。

L01–03 在各自新 Node/VM/profile 中，只消费同 family／同 run／当前 binding 的 P00；runner 校验物理 SHA 并以 COPYFILE_EXCL 拷贝 file8/global。消费者从正式 Scene_Load.executeLoad(8) 开始，保留原 9caa8d4 的 L01 实际来源地图观察器修正，以及以下责任：L01 recover 一次、source5→target7；L02 原生版本 reload5 先于 F target7、recover 一次；L03 真 Map7 失败、稳定 12 帧不自动重试、显式 Flow retry 后 recover 两次；最终完整 file0/global、money12／steps4／blacked1／HP／CPnull、file8 字节不变和业务／native RNG 前缀不变。

稳定失败／pending 阶段使用独立阶段谓词，不要求成功 native restore／idle；成功 Bootstrap 仍消费原生产观察器。L01–03 的本次 Load 成功终态、file0 出现和 completed 尾部另外消费同一个现有 observer 的实时 ready()：当前 App／onLoadSuccess 观测代次／目标 Map7 必须一致，并具备同 Scene/map/data/player/frame/birth 的真实 restore 完成及随后 Map update。初始 Map5 或旧代次的 ready 不能代替这一步；失败阶段不接成功门。资源、音频与绘制是有记录的 facade；文件保存、加载和框架业务是真入口。该链属于 headless 物理保存／读档，不签 NW、Title 冷 Continue、T20、键盘、听感或真实失焦。

`scripts/tests/f-native-current-production.test.cjs` 另登记原 normal2／NoTransfer3，以及历史 8989ed8 组合的 C1 No／Yes、N11 旧 Scene、C1 ABA、Yes 迟到旧回执五项，共 10 leaf。正常两项与历史组合重叠，合并计数时只算一次。全部历史绝对源码和输出路径已改为当前受控相对入口／selector scope；原始历史证据不改。旧 Scene.onTransferEnd 的显式调用仅用于迟到／重复负控，合法 No／Yes 主链仍由真实 Inventory 返回新 Map，禁止手调新 receiver 的 onTransferEnd、伪造保存请求或放宽私票守卫。

输入由现有 final-production catalog／runner／worker、全局 controlledInputs 和 regular 显式列表管理。新增环境只有 `PF_F_NATIVE_CASE`／`PF_F_NATIVE_ROOT`；F load 复用 `PF_COLD_CASE_KIND`／`PF_COLD_CASE_ROOT`／同 run `PF_COLD_PRODUCER_INPUT`。两 family 都只消费官方冷父构建，不启动默认 builder。精确候选、自有冷绑定、独立输入审查以及 root 的新业务执行授权仍是实际运行前置。E3 阶段观察器修复冻结后，由唯一整合者对齐共享支持文件；不能据本叶支持草稿跳过该前置。

RNG：normal／NoTransfer／C1/N11 保原完整或增量零抽样断言；pending producer 与消费者分别保存正式业务及 native tape，完成步至稳定失败、物理保存、读档恢复和 12 帧稳定均不得新增抽样。本支持不改产品 RNG、统计或阈值，也不读取参考 Ruby 或隔离对照产物。
