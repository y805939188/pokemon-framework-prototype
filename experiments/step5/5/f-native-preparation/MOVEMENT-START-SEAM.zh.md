# 原生 movement-start 只读安装边界

固定基准9570（承接91c2）的 step-host.ts:193 increaseSteps 是成功移动开始登记identity，updateNonmoving:218是完成步；world-travel-mz.ts:379 executeMove wrapper仅处理失败越界connection，不能借它/connection/Dprefix给distance补数。

唯一native installer后继可在实际Game_Player.moveStraight原方法前捕获当前App/generation/player/map/mapId/坐标，原方法正常返回且真实isMovementSucceeded为真后提交一次开始观察。墙/转向失败不计；loop地图不能直接用to-from大差当格数。强制route不能被完成步的排除门自动排除，按正式WP12距离门独立；对角不经过四向分支，不另装moveDiagonally计数。jump在实际非零原生跳跃启动后观察原offset，两轴绝对值和与跳数由正式纯规则决定；0,0不算，不能等落地/完成步。方法抛错/换App/gen/player/map/来源失效不得追认旧开始，不回滚原生已发生前缀。

新movement-start-mz.ts作者只写新模块/纯数学与tests，先准备capture/once及actor事实接口；不装共享Player hooks，最终hunk由唯一native installer写。movement-start-ports.ts只冻结readonly观察值，不是统计权限或fakeApp回调授权；App统计入口/真实注册source仍由原App writer另行冻结并验证，缺cap不可自写GameState。

mode分别读取实际framework surfing/cycling/diving与native _vehicleType；原生boat/ship不能擅自等同framework Surf。当前只有显式terrain配置ice事实（entry.ice===true，已有默认策略）可供协商，bridge/ledge/实际正在冰滑能力未固定时应unavailable，不猜tag或假false。新模块先正式规格与实际Reactor方法VM、10–16有限向量，RNG0；不旧step/Map/full/NW/系统设置。
