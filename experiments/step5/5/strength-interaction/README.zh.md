# 普通 Strength 互动生产接线

当前 PS_World 在原生输入前安装窄 Strength adapter，位于已有 Surf executeMove wrapper 外侧。普通、非跳跃、非消去且事件名包含完整 strengthboulder 的当前面向事件，可以用 OK 或前方触碰发起真实 App use/interaction；确认 No 不提交，Yes 完成本图激活。激活后方向或再次互动调用既有 App strength-push，严格双端预检和原生普通事件移动仍由原 host 执行。

每个原生机会只同步尝试一次；未匹配、忙时、未获接纳或 borrowed receiver 原样调用原方法一次。防重仅绑定同 App代次／Content／Map／Scene／player起点／当前event与方向：自己仍在运行或同目标旧输入不会重复提交；玩家实际前进后仍按住方向可产生下一次合法推动。没有要求每推一格松键。没有 idle 全图事实采样，只在真实输入且匹配当前原生槽位时进入 App；不依赖 Reactor events()/eventsXy() 同帧缓存。

源绑定贯穿 host guard 的每个阶段，晚到换图、换人、换Scene／event／Content或读档换代只取消自己的 requestId；不清 successor 的保存屏障／路线。先由原生输入抢在事件解释器启动前接纳，D／解释器忙时拒绝新增父链，不能在自身解释器内等待一个新 world parent。无新许可、owner、START、ACK或持久schema。

正规 strength family 只有 S01–S09 九输入，各fresh Node，沿已有 parent binding／正式发行包／八IIFE／strict当前源码／真实原生按键和触碰调度；旧366套顺序为精确前缀，新增后367只是登记数量。旧case／断言正文不改。实际SHA、首红、TAP及限制见本任务外部REPORT。

S01触碰No；S02真实OKYes、实际原生事件运动、持续输入两推／之间玩家一步；S03/S04源／目标低层阻挡；S05普通canPass失败保已提交count/记录、无音效和伪等待；S06非marker原生return／脚本与busy；S07换代＋successor item屏障；S08当前event替换；S09 Content晚变。资格徽章／蛋／成员以及through和严格host细则复用当前不变规则及既有正式原控，不机械重跑host100。当前新矩阵不代签其余五E2族或全部E2。

声音为原AudioManager.playSe请求，测试只观察Push DTO／后端facade；实体键盘、听感、真实触碰硬件、NW／像素及真实blur另验。未新增NW授权，不测试音量或玩家配置。P5算法12／oracle／tape不变，旧1794整src metadata不能移签当前；必要新映射与有限47由root唯一安排，作者不重复跑47或2M。
