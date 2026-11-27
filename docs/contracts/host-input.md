# 宿主输入与类型适配

`src/plugins/host-input.ts` 按宿主对象保存输入服务。各插件分别编译为独立 IIFE 时，模块内变量会复制；服务使用固定的 `Symbol.for('pokemon-framework.host-input.v1')` 在同一宿主上取得同一个实例。不同宿主保持独立。服务不属于任何默认 presenter，也不依赖 `PSManagement` 对象。

服务统一拥有键盘键、原生文本输入已消费键、DOM 按住起始帧与同帧 `InputFrame` 缓存。每个宿主只安装一次永久 `keydown`／`keyup`／`blur` 监听和 `Input.isTriggered`／`isRepeated` 消费屏蔽包装。键盘与 gamepad／MZ Input 状态按原有逻辑合并；同一帧的调用得到相同采样值和各自的返回副本。场景的 `Input.clear()` 不会制造另一份同帧采样。

Management 仍保留原来的 `physical`、`InputLatch`、`inputIntent` 优先级、ready 屏障及 MZ 触发／重复输入来源。它通过服务订阅原键盘事件和 blur，而不是额外注册 DOM 监听；订阅在原场景清理点释放。原生文本输入提交后，服务继续屏蔽该 Enter／Escape 操作，直到对应真实 keyup 或 blur；移除文本元素或 presenter 不会提前解除屏蔽，释放其他同义按键也不会解除它。

Inventory、Progression、Evolution、Pokedex 直接从宿主服务采样，继续使用各自已有的 `InputLatch` 和边界处理。`PSManagement.inputFrame()` 保留为兼容转发；替换或移除 Management presenter 不会剥夺其他默认 UI 的输入来源。

## 宿主类型

第一小批只收紧正式应用装配与学招 UI。`application-host.ts` 从真实 GameApplication 派生应用和窄 LearningApplication；动态生产入口只描述构造需要的出口，编译型 consumer 同时验证它与真实 production 出口兼容。MZ 的对象、Scene 和运行时加载边缘仍允许必要的 any。

PSFlow 自身的 app／_app、状态、内容、Dex、随机、时钟和构造参数有实际类型；生产构造器、端口对象与 options 都受检查。Progression 的本地访问器、handle.application 和直接调用也受检查，不只是导出一个未使用的 Pick。

这些引用为 type-only，插件仍独立打包为 IIFE，并在原位置动态加载 production.cjs。没有把 application 或 Showdown 打进 UI，也没有改变持久 schema。继续流程使用已有联合返回值做窄化，宿主的 hostErrors 保持宿主附加字段。

MZ 窗口、DOM 和动态 IO 是边界，不向纯领域复用其动态类型。宿主窄视图由真实应用接口派生；不能让 UI 通过省略检查扩充授权。
