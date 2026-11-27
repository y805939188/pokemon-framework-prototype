# 通过事件命令重试战败回程

让一次真实的完成步和野外中毒产生回程失败，不手填 checkpoint 或 owner。用原生 command357 调用生产安装器：稳定失败可以显式重试，读档后的重试必须走正式 Load 通知建立的路由。等待、初始化、已移交状态不能重复执行；已完成的旧存档不应签发第二次传送。正式读档后保持稳定失败时，允许保存，但必须拒绝开新战斗，直到显式恢复。

读档场景通过 `DataManager.makeSaveContents`、`Game_System.onBeforeSave`、JsonEx、PS_SaveState、`DataManager.loadGame` 和 `Scene_Load.onLoadSuccess`。存储传输可以是受控内存对象；仍要核对序列化字节、摘要、checkpoint 和代次，不把它算作物理冷读档。保存与原始来源守卫、回调的接收者和返回值、Content 与私有票据均须保留。

实际 selector 和输入由 `scripts/tests/final-production-inputs.json` 登记。本组固定注入的业务随机输入并对照其前缀，不证明默认熵来源或真实 NW 渲染。
