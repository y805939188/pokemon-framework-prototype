# R5：共享宿主输入服务

`src/plugins/host-input.ts` 按宿主对象保存输入服务。各插件分别编译为独立 IIFE 时，模块内变量会复制；服务使用固定的 `Symbol.for('pokemon-framework.host-input.v1')` 在同一宿主上取得同一个实例。不同宿主保持独立。服务不属于任何默认 presenter，也不依赖 `PSManagement` 对象。

服务统一拥有键盘键、原生文本输入已消费键、DOM 按住起始帧与同帧 `InputFrame` 缓存。每个宿主只安装一次永久 `keydown`／`keyup`／`blur` 监听和 `Input.isTriggered`／`isRepeated` 消费屏蔽包装。键盘与 gamepad／MZ Input 状态按原有逻辑合并；同一帧的调用得到相同采样值和各自的返回副本。场景的 `Input.clear()` 不会制造另一份同帧采样。

Management 仍保留原来的 `physical`、`InputLatch`、`inputIntent` 优先级、ready 屏障及 MZ 触发／重复输入来源。它通过服务订阅原键盘事件和 blur，而不是额外注册 DOM 监听；订阅在原场景清理点释放。原生文本输入提交后，服务继续屏蔽该 Enter／Escape 操作，直到对应真实 keyup 或 blur；移除文本元素或 presenter 不会提前解除屏蔽，释放其他同义按键也不会解除它。

Inventory、Progression、Evolution、Pokedex 直接从宿主服务采样，继续使用各自已有的 `InputLatch` 和边界处理。`PSManagement.inputFrame()` 保留为兼容转发；替换或移除 Management presenter 不会剥夺其他默认 UI 的输入来源。本次没有改写父子 UI 的事务、token、恢复或提交行为，也没有增加作者输入配置 API。

专项测试使用 Vite 在内存中分别编译多个独立 IIFE，并在同一个受控宿主加载；还实际编译并加载五个 UI，将 `PSManagement` 替换为无 `inputFrame` 的 presenter，另覆盖完全不加载 Management 的情况，分别打开四个默认 UI，确认其原输入 latch 能观察按住、完整释放、下一次按下及 blur。测试不使用已暂存插件，不启动 NW.js，也不写共享构建输出：

```sh
node --test scripts/tests/host-input.test.cjs
```

测试先行时，四个实际默认 UI 都在初始边界报告 `PSManagement.inputFrame is not a function`；新服务的三个契约测试起初因服务尚不存在失败。服务建立后，三个契约测试先通过，四个 UI 红测保留至接线；后补订阅清理和 Management 缺席案例。最终专项 **12／12 通过**；现有 Management 输入／UI、Inventory、Progression、Evolution、item evolution、Pokedex、Pokedex search UI 与应用消费者类型契约的九文件回归 **238／238 通过**，插件 TypeScript 检查通过。真实宿主与 IME 的新实机证据未在本批执行。

接线后新专项 12／12、既有 UI／类型 consumer 定向 238／238 通过，失败／取消／跳过均 0；插件 strict 类型检查通过。四个默认 UI 分别覆盖 Management 被替换与完全未加载两种情形。上述为 Node／受控宿主，不是新 NW 或物理输入／IME 实绩。

整合首轮 regular 又暴露六处旧测试宿主接线：缺完整无输入端口、替换已经安装服务的 document，以及在产品加载后覆写虚拟 getter 而绕过消费屏蔽。仅补测试 host，不给产品增加容错 fallback，不改既有业务断言。有效红测分别包含 composition 17 失败、追加 inline host 3 失败及 nativeConsumed 时序 1 失败；修复后受影响定向 76／76、149／149 通过，并新增三个端口连通回归。磁盘／h3 的旧候选身份门失败另行处理，不计为输入修复通过。

早期补测有缺 Reactor 依赖及临时视图准备失败，均未进入有效业务测试，不计产品红测；其中一次无效准备日志被后继有效红测复用，原完整日志不能提供，该限制另有登记。有效红／绿及明确端口探针日志分别保留。
