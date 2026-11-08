# 未消费持物跨 Continue 的闭门安全恢复

产品运行时固定3c080ff，测试工作树也从该版本派生。原 H3 lifecycle 磁盘链保存的是消费后的空持物；原安全取下是在单进程编译宿主中验证。本案连接尚未覆盖的“未消费持物保存→进程退出→Continue→默认关闭能力下恢复”路径，不重复七来源矩阵。

三个独立 Node22.21.1 子进程：
1. 使用已有受控 H3 give fixture 经真实管理 API 获取 Lum。显式开发能力只用于该合成来源准备。实际 PS_SaveState/DataManager/StorageManager/JsonEx/pako 保存到自有临时槽；同时保留模拟旧开发进程的 Game_System 能力字段。
2. 实际已绑定 Title/Load/Continue 方法加载压缩槽，字段全量与生产者比较。新建 App 不传开发能力，持物来源关闭，开战拒绝且零替换、不锁存档。安全取下仅改变持物槽和 inventory，物品数量+1，重复同回执和再次取空均不重复写。正常工厂创建全空持物训练家战，真实招式终局、required pair一次写入，重复结束无第二次写；再保存。
3. 新进程 Continue，所有持久字段与第二进程终态完全相同；验证槽哈希不变。

实际1案通过，fail/cancel/skip/todo0；不是三案或三个业务来源。原失败日志保留：首轮测试把现代状态不存在的 bag 键写成 undefined，导致结构比较失败，修正为只归一 inventory 后通过，无产品改动。

运行：H3_RUNTIME_ROOT=<固定3c080ff产品树> node --test experiments/step5/4/h3-held-continue/test-continue.cjs。plan.json固定宿主方法/SaveState/辅助脚本字节，复用生产策略 support 又校验全部引擎产物及Showdown身份。临时文件以pf-h3-held-continue开头，有OWNED.json和每进程stdout/stderr；成功与失败均保留，不上传。

边界：保存与Continue方法真实，但Game对象、场景、窗口为非渲染适配；后续战为App/Session，不是实际PS_BattleFlow Scene或NW，不签真实UI/Boot/Title。来源仍为受控编译内容，不是正常默认开放的作者内容管线。pairHash只验证格式、主hash、保存和幂等，没有独立语义重算。未测损坏存档/写失败/非零奖金，本案不取代这些专项。

默认门仍关闭，main条件未变。不修改产品、共享登记、CI或既有冻结计划，不运行旧对照。独审后由中央决定如何登记与发布；本固定运行时测试不应盲目加入通用CI。完整H3/B-3/5.4不因此接受。
