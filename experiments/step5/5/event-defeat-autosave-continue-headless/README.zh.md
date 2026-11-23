# 真实事件战败→正式自动保存→新进程正常 Continue

本目录只新增 headless producer/consumer 夹具，产品固定 e2f80f5、src e1037013；9caa 只提供修正后的正式读档夹具。真实事件战败 source 来自冻结 18f，实际 admission/legacy-return 消费块与固定 e2 逐字一致。本目录不修改产品源码或旧封印。

仅 P01/C01 两项。P01 从合法低 HP level2 Snorlax 对 Pidgey30 的真实事件357 StartBattle、实际 Scene.create/controller/Session/Showdown.chooseMove/onEnd、ledger/F 到原 target executeAutosave，经正式 SaveState/DataManager/Storage/JsonEx/pako 写 file0/global。C01 必须由不同 Node 进程、全新 VM/profile，从 P01 这两份文件逐字复制件经真正 Scene_Load.executeLoad(0)/onLoadSuccess/reload/goto/Map/B，验证 CPnull/recover0、状态和 RNG 不重放。作者数据内容从 P01 前置合法 content 留存后给新实例读取；恢复 game state 仅来自实际文件，不能手塞。

render/audio/input、文件列表和 XHR 测试资源是明确 presentation/provider façade；实际 storage/load/native flow 方法保留。每 case 独占新的 E/cases/P01 或 C01/save/profile，SaveLocation 的 --ps-save-dir 与每次实际 FS syscall 都校验范围和无 symlink；home/default 玩家目录禁止。原 Storage 的实际 flags/backup 行为按日志记，不称其 wx；本夹具原始/完成 JSON 使用 wx。两份旧报告、所有旧文件和 IBF5 raw 缺失局限保留，新 case raw 不覆盖。

正式执行只由独占 E 的白名单 runner 给出显式 strict/build/P01/C01；无裸 node --test 或 fallback。首次失败保留日志/原始状态并停止当前流水线，具体后继修正后才在新 case 目录继续。最多两种 meaningful case，不重跑旧 4 battle/3 pending-load/旧 full。

无 NW/真实 Title/键盘、听感、真实失焦、CDP/网络/端口/系统玩家/外盘操作；此 headless 同源链不代实机或完整 T20/G/5.5。
