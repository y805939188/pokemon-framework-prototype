# e9 招式类型/PP与默认捕获同步：原生驱动静态准备 v1

产品固定 `e9ea723e4b8d0ec28d2109de368d7ddbd184581c`，五项产品载荷直接取该已审产物；与旧9f菜单、c93普通消息、f021捕获15项计划分版。本批只新增测试驱动、模式入口、计划、确定性受控测试及headless登记，不改产品行为。旧计划/包/失败与封印不变。驱动静态准备不等于APP冻结、精确driverCI或实际NW通过。

计划为单进程两有序正常案MC01英文、MC02中文，总上限180秒，异常即停，剩余NOT_RUN，不自动重跑。两案都从真实冷Title/后继已启动Map经已接受Map就绪门进入真实App/Gen8 Session，先显式初始化App再openBattle以保留ca6忙Map修复；全程fast=false。前态主动建立已解码world曲，不将标题曲当未知继任者。

菜单四槽为Ember6/25、Water Gun12/25、Growl40/40、Tackle0/35，固定Gen8资料，中英类型为火/水/一般。覆盖橙/黄/深色/红PP和三种类型色，第四槽游标通过实际Window确认交真实Session拒绝，非首格拒绝/BACK再入均回3，工作状态与完整持久状态不变。实际Window bitmap在独立预定PP区域和type区域记录RGB匹配像素，容差每通道16、至少1个非透明匹配点；不以DTO或drawText参数代替真实栅格。完整合成图/仅隐藏contents的同更新对照供独立逐图检查光标和文字；历史背景层修复不因这里只检查色像素就被重新解释为实体输入通过。

随后由Scene.act调用真实Session.throwBall(masterball)，不模拟结果或重写捕获算法。此接点是实际Session/Scene消费链，不宣称覆盖整个背包选择UI。Gotcha文本由实际成功事件的生产描述器取得，不按英文匹配。记录全显与ME请求的真实Scene更新序号，须是相邻两更新；整个ME逻辑阶段文字保持全显、菜单不放行，3500ms等待及停止确认不改。记录实际AudioBuffer/AudioBufferSourceNode、解码声道/采样率/已冻结资源时长与实际play调用，声音仍静音运行，听感不作通过结论。MC01直到3500ms正常完成后显式取消；MC02在250ms后已有真实媒体和可见文字证据时于旋律内取消。两案都必须归Map、根锁释放、完整持久状态不变、安装0，不验最终接收/写档/新进程Continue。

每案固定三主图与三同更新no-contents对照：move-cards（选中第四槽）、gotcha-full（ME尚未进入）、melody-visible（实际媒体已开始且文字仍在）。共6主图6对照；先保存PNG和RGB计数，再执行像素断言，失败也留证。每帧记录完整状态摘要、消息/ME视图、输入可用性、更新序号和安装次数；上限3600行/案。取消/异常只回收本驱动拥有的root与观察器，恢复原参数/语言/fast/factory/play方法，原始首因和清理错误分开记录。外部监督器仍须验证真实PID/组/退出、首因/无fatal、APP前后一致和所有图，不允许驱动自签AUTHOR_EXECUTED。

本地 `test-menu-capture-native.cjs` 使用真实编译驱动/Scene/App/Session/锁定Gen8、安装版Map忙态与Window命令/几何方法；媒体buffer/source、时钟、绘制、字形和输入均为明确模型，报告NOT_SELF_QUALIFIED。模型7控制覆盖完整双案及忙Map、缺内容图像时先留证、缺PP真实栅格、身份替换、同对象状态变更和入口失败；删除PP像素门使相同缺PP模型误过的有限反向变异验证断言有效。首次5过2失败仅模型Bitmap缺球绘制fillRect，原日志保留；补该已存在的模型栅格端口，不改产品或业务断言，随后7过。不复制或安装字体，缺字体CI模型有显式占位，不赋予实际字体资格。

本批固定后先交原Ultra代码/纯链静态复核。**APP、签名/manifest、真实资源INPUT冻结、专用监督器和新driver精确CI尚未准备/执行**，不能把本JSON当作已可运行的冻结实机计划。后继包应绑定本product五载荷、最终driverSHA和完整APP、字体/世界/媒体hash，复用已审资源生成器的实际Ogg v3资格（只用world/battle/long三资产，不能接受模型占位）；不改变旧输入或把旧15项全跑当必要前置。准入满足后由父端协调宿主空闲与单轮，作者本轮NW0/不查占用/不推送、不合main。

不扩18类型美术全集、动态天气类型、硬件键鼠/听感/Windows、完整接收/保存、全消息系统、完整D2/E/5.4/P4；GC WARN/U51 UNKNOWN及全部历史DEFER/FAIL保留。后继需要改变本两案范围应版本化并说明，不静默放宽断言。
