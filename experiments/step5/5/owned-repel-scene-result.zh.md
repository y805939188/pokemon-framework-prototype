# C1 owned Repel Scene 后继

基线5b0eb9e（A3）；889f9d7仅固定49/62 PS_Inventory逐字producer镜像，NOT_ACCEPTED。该后继仅接完成步Repel子UI的真实场景生命周期，不改变其它背包/商店/道具handler。

App私有OwnedRepelScene绑定实际permit/selection及本步map/player/mapId/point/SceneManager。D2取得当前App发出的hooks，将exact owner/selection与callbacks传到真正PSInventory；push正常返回后才能opened。initialize仅记录内部identity，不授予App许可。原生pop前锁定Inventory handle/scene，pop后捕获真正_nextScene，经过所有parent providers后再以纯native事实闭合，返回Map启动且同target时一次回执。callback不得作为普通DTO跨realm复制；Inventory验证callback record后保四function identity。

atomic-state-mz仅增加own-data SceneManager/scene/next/prototype/started观察；getter/Proxy先拒且0调用。Surf cleanup尚未创建此UI lease，原2b末端Scene和x/y守卫不放宽。取消只在同代无其它App/World/inventory占用且物理仍为自己的旧Inventory时退展示；不adopt旧回执、不退新owner。native proof损坏则拒绝，不猜测/重放native pop或arrival。真正当前回执末端失败令旧lease失效，避免消费完notice后永久等待。D2在外调后确认仍是同running/selection，清理先摘下旧effects再调用外部cancel。

原真实probe保持业务断言，观察wrapper仅透传第四参数：旧5b App/D配固定49真实IIFE为1过1红；早期修为2过。最终受控231/231（16显式文件，0cancel/skip），含原2、C1作者16、trusted slots6及D-App/Surf/2b/A/A2/A3/native相邻回归。Inventory单文件strict、私有strict emit（含App与D/atomic）、production bundle与两组IIFE构建均0。framework/app/core strict、boundary早期0；末次import图不变，最终private emit验证新增字段/类型。无测试或构建输出写共享产物；早期bundle与最终final-runtime分开保留。

保留首Inventory strict类型错误（泛型union及App-only基线型投影），后仅局部类型修正，不改shared application-host。首次指定230=229过1夹具错误：opened早拒分支未挂h.replies观察方法；修复夹具挂载时点，业务断言不减。新增returned末readiness失效反控，最终231全过。

另有一次未授权默认Node发现：误命令名导致无文件列表，session41505经Ctrl-C130中断；87只是可见subtests，121只是自有artifact时间窗，不能当通过或全执行上界。准确历史PID/开始结束未记录。根18:31:01只读检查matchingC1为空/NW总0与保护源不变后解除暂停，不等于证明历史从未NW或从未更早读取。所有原log/产物保留；runner改白名单、既有.cjs固定映射与启动前PID记录，根独立AST-prefix9控通过。本候选通过仅来自恢复后的显式有限单轮，误发现不计任何通过。

真实IIFE组合的PSWorld/PSFlow与未改MZ叶输入为固定49只读字节，C1独有Inventory/D2/atomic及App解析新树；两组binding逐module列路径/SHA。49带有另外的B-P1等未接后继，本门不代签整个MZ或后续f2dd联合装配。没有NW/系统焦点/音量/玩家配置操作；实体键盘、听感、真实失焦未人工验收。未full/quick/2M/push/main merge。清理台账仅标记，独有失败与证据不删。请求Sol xhigh默认普速，actual backend/effort/speed无回显未核验。
