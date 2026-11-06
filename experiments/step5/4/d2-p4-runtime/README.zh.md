# 正常 D2 driver / supervisor 后继实现准备 v1

状态：**核心代码已实现，工具验证待本候选独审；未接入产品、未冻结完整正常输入、无原生执行准入。**
承接 `48f3da4edb9dc0f94d380fa13433aa582f0848f4` 的独立 `PASS_SCOPED_PREPARATION`。
原19路径和全部封印保持；本批只新增本目录，不改任何共享产品、驱动注册、测试清单或STATUS。

本目录的代码已经能够通过受控端口执行输入/监督逻辑，超出了原先的合同与纯示意模型。
它仍不是已经接入PS_BattleFlowTest的F100驱动，也没有Popen/ps/pgrep/信号/签名等真实OS后端。
本批不运行产品战斗、对照业务、宿主检查、NW或性能测试。

## 已实现及证据边界

| 模块 | 实际实现 | 尚未接受/绑定 |
|---|---|---|
| normal-driver.cjs | 正常菜单网格、唯一可用key、暂停全显后独立输入、指定等级delta/total能力页确认；单写/退役/owner/代际守卫；DOM key code工厂 | 完整100场菜单/分支、真实字体/DOM输入、接收/地图/Title消费者 |
| installGameFrames | 明确调用时才包装updateMain；首个游戏update的finally同步keyup；两次独立release采样；停帧deadline、原fatal与释放/计时器错误分开保留 | 未在NW安装；显示rAF不当游戏tick；真实信号资格未执行 |
| bindBattleScene | 绑定现有inputState、ordinaryMessageState、levelStatsState和实际root op/App generation，不手造App；scene/root/代际变化即失效 | 未导入共享测试插件；只支持BattleScene，不能跟随接收/后继owner |
| supervisor.py | 10组固定顺序、100个准确ID、有限时限和单调时钟、typed准入/自有进程回执、首败停止、延迟取消、uncertain-launch先查明归属、独立尾检/日志失败处理 | 仅端口核心；原生后端不存在，实际PID/出生身份、等待/回收/签名/RSS仍未实现/验证 |
| binding.py | 全文件/目录/权限/内部链接清单与精确差异检查；缺/多/变字节或权限拒绝；不遍历外部链接 | 当前仅小临时夹具；不执行codesign，不把静态匹配说成签名或原生准入 |
| workload-plan.cjs | 以Node JSON.stringify完整核原F100输入及100个seed，生成逐场业务意图；正常trace形状检查 | 每场resolvedNormalActions和qualifiedDeadline仍null；形状检查不是语义审查，不执行案例 |
| metrics.cjs | 原始updateMain/rAF各表、>33ms连续段及失焦保留、等待区间并集、三自然组中位、WARN/不可比/N/A比较 | 离线数据分析函数，无真实采样器/插桩/GC/RSS或性能数值 |

正常输入不调用onMenuOk、updateQueue、任意sleep或改Input.isTriggered。
DOM工厂沿用项目实际keyCode方案，确认通过未来宿主的正常Window输入路径；这次测试只有受控Window形状端口，
不能声称运行了生产Window.processOk或实体键盘。普通/brief文本不自动快进，暂停只在全显、箭头/暂停及后继采样满足时确认。
同菜单key若有多个enabled匹配则拒绝；disabled空槽不会遮住唯一可用Cancel。
新消息不能继承上一帧的持续OK；原fatal与keyup/计时器错误分别保留。

监督核心的HostAdmission必须包含本次nonce/group、成功占用结果、可回收能力和原始回执hash，bool/None不当准入。
OwnedProcess必须有精确pid/pgid/birth/nonce/group，缺失或错组先reconcile，无法证明自有就不调用cleanup。
uncertain时仅做独立文件尾检，after-idle未执行明确登记；绝不扩大查进程或向未知PID发信号。
wait_report的阻塞时限和cleanup期限最终仍须由经审真实后端落实；核心还会拒绝返回后已越界/倒退的时钟。
本模块不安装OS信号处理器，取消由端口传入；当前信号均是内存控制。
任何backend种类的输出都保留acceptance=NOT_GRANTED/nativeBattleClaims=0，不因工具绿灯生成P4接受。

## 当前绑定与暂停的写入

`binding-template.json` 保持最终产品/正常对照、完整100场输入、有据时限、正式App/fixture、真实后端、APP和宿主回执为null。
原900秒没有复用；工具测试中的30秒只是内存夹具值，不是正常D2的建议预算。
Node原业务canonical hash为 `93507d4bca39de181c462158240b87691fea1b09588d10494ad9c6692425ec4e`；
正常呈现策略hash为 `62e2bc156a0e59f39f67a64e94344af72ef44fdd0d806243bd30a22731e5f5ee`。
这些绑定的是原输入/策略，不是最终产品或APP。

必须由中央单写者处理的后继位置明确暂停：

- `src/plugins/PS_BattleFlowTest.ts`：新driver导入/路由、实际正式App与夹具生命周期、接收/地图/成长端口。
- `scripts/test-headless.sh`：中央整合时注册新Node/Python工具套件。本批直接用既有测试方式定向运行，不改共享清单。
- 最终产品/正常桥接控制的SHA/tree/精确CI、构建和资源/配置/引擎/SDK/签名绑定。
- 原被拒宿主占用操作、唯一执行者和独占窗口。当前无后端、无launch CLI，更没有解除原拒绝。

这些都是尚未满足的真实依赖，不能以示意绑定、假文件或工具夹具替代。需要确认最终产品和中央接线归属后再实施相应写入。
a4dc仍是准备阅读根；截至本轮只读STATUS，场域r2 `c1231e35c7786ef95a7bea453ac3b190ab43c39b` 仍是待复审方案，
不能当新场域产品或最终D2。bac/d57/c293的旧限定接受不扩签。

## 验证方式

只用项目既有Node内置test runner和Python unittest；无需依赖安装、引擎或构建。
本机默认Node是22.14，故明确使用已安装且项目支持的22.21.1：

```sh
/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node --test experiments/step5/4/d2-p4-runtime/test-normal-driver.cjs
python3 -B -m unittest discover -s experiments/step5/4/d2-p4-runtime -p 'test_*.py' -v
python3 -B experiments/step5/4/d2-p4-runtime/binding.py experiments/step5/4/d2-p4-runtime/binding-template.json
```

最后一项应exit2/BLOCKED。不运行quick/build/旧native入口或真实对照业务。
Node控制使用受控SceneManager、键事件和计时器；Python使用TOOL_FIXTURE backend及临时普通文件，且屏蔽Popen/kill/socket。
全部不是业务场次、真实自有进程回收或性能采样。
旧52项首次工具绿灯原始日志保留；后继收紧了首因/释放、歧义key、布尔别名及单调deadline控制。
最终精确测试数、源码hash、命令/PID/exit和候选SHA只读本轮外置证据入口；不累加旧轮与subTest。

## 并行与历史边界

先核旧独审12成员/67引用封印及原作者26成员/40引用均通过，只读注册worktree564个，未发现本次新目录/拟driver名已存在。
这只排除所查具体文件冲突，不证明全局同职能任务都空闲；父本轮明确派工只授权本隔离新增范围。
没有接管共享产品、驱动注册或宿主。PROJECT-GUIDE、当前STATUS、旧冻结计划/合同及本机相关记忆作为背景已核，
旧“Claude无沙箱”记忆不改变本环境权限。

原+20%和7.2MB WARN、GC+23.8929% WARN_OPEN、U51 UNKNOWN、AUD2、归因与所有FAIL/HOLD/LOW/DEFER继续保留。
实机Title/Continue/音画/物理输入、完整D2/E/5.4/P4仍未签；没有新软件、APP、依赖/运行时复制或链接、上传/推送/合main。
