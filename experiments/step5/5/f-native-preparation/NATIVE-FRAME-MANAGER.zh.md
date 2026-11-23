# F bootstrap 的原生帧管理器身份

`d-mz-native-frame-support.cjs` 在建立帧闭包、安装 Inventory/World 和上层 Flow hooks 之前，由 `native-frame-manager-support.cjs` 创建一次 pinned Reactor/MZ 的静态 `SceneManager` 函数，并安装原生 goto、push、pop、isSceneChanging、isCurrentSceneBusy、changeScene、updateScene。字段和方法都是该函数自己的数据属性。

排队入口、返回的 `h.manager` 与真实 `tick` 始终复用该对象。F nontransfer 与 C1 的 nativeSetup 只核对函数形态和身份；不再在闭包建立后重新声明 SceneManager 或复制旧对象描述符。旧做法把 `_nextScene` 排到新对象，却让闭包继续推进旧对象，使 bootstrap 在任何 F 操作开始前停止。

普通套件 `test-native-frame-manager.cjs` 直接调用实际被帧夹具使用的低层 helper，在最小 VM Scene 上运行 pinned 原生方法，覆盖自然排队、create/readiness/start/update、busy、active、push/pop、队列替换、方法返回、异常身份和旧对象分叉负对照。它不运行完整夹具、App、IIFE、restore、保存或任何 F/E3 业务断言。

该底层修复同时影响 D 原生帧、world-scene、Surf、E3、伙伴读档和 F 的调用链，后续应使用新固定候选的独立审查、自己的正式冷构建/绑定和新有限授权验证；旧 2dda/b514 绑定不得签新提交。旧 bootstrap 红例及未执行后缀保留。restore-ready、registry、owner/generation/Content、birth/handoff 和晚到帧守卫均保留，生产 src 未改。全量登记不等于执行，低层普通测试不签 F14、E3、完整 F 或 5.5。
