# 逐级学招与单招 PP 背包训练家链

固定产品基线：`1a611aa2f03fd47b305c45d91276874ddf38dd19`。本批只新增测试与本文，不修改产品、正式测试清单或共享登记。

覆盖缺口：`test-levelup-stats-scene.cjs` 的 GLI 逐级学招只走单野怪；`test-battle-summary-scene.cjs` 的 learned Rest 链覆盖使用新招和后继训练家，但没有单招 PP 背包；`test-battle-bag-scene.cjs` 的 Ether 链没有先学招。因此不将旧单项覆盖拼接成当前整链已测。

新文件 `test-learn-pp-trainer-chain.cjs`：中/英 × 空槽追加/四槽替换四条独立链。真实编译 PS_BattleFlow、PS_SaveState、PS_Evolution 和驱动入口，真实 App/Session/固定 Gen8 引擎。仅窗口、输入、栅格和音频端口受控，不是 NW/真实像素/实体输入测试。

合成作者配置：初始 L5、有效经验区间；首名 L3 Pidgey 提供 269 EXP，L6 学 Rest、L7 学 Growl。后两名 L1 Pidgeotto 的合成 baseExp 为 0，隔离后续经验，以便只检验学招之后的 PP、道具及后继派出。对手均 Splash，不声称官方学习表或实际内容可取得性。

每条链验证：
- 每一级自己的状态窗口与学招顺序，新招身份/PP 进入真实 Session、永久引擎和当前 request。
- 学完立即进入 Bag，Growl 满 PP 时无效果、不耗道具、不记账、不走回合。
- 正常菜单用 Growl 令 PP40→39，再从真实 Bag 选择新槽，取消不扣；重新选择与重复输入只用一次 Ether，PP39→40。
- 同名 Growl 的另一成员、被替换旧招、其他招式都不能被误改；不做 Summary 排序。
- 击倒第二名派出第三名，再使用新招令 PP40→39，最终自然胜利；Result 与持久 PP/背包一致。
- 最终 Continue 前持久文档逐字不变、安装计数 0；结束时恰好安装 1 次，重复结束不再写入。

执行（仅显式当前套件）：`node --test --test-reporter=tap experiments/step5/4/test-learn-pp-trainer-chain.cjs`。必须在隔离工作树且固定已装 Node/pnpm/依赖，TMPDIR 自有。可设置 `PF_LPP_OBSERVATIONS` 到空的自有本地目录保存合成结果，不能用原版数据或玩家档。失败停止当前版本、不自动重跑，保留日志与失败临时目录；修正测试版本后另存新执行。

通过仅代表这四条合成编译宿主链，不自动接受完整 D2/E/5.4、NW、CI、H3、辅助事实/统计/图鉴全事务或原版等价。所有既有 HOLD/WARN/UNKNOWN/FAIL/DEFER 保留。待独审与中央必要整合后登记；作者自检不等于独立接受。

首轮历史：32b545b 四条均走到自然胜利/一次安装后，未参战成员逐字断言因输入未显式 `ppUps: 0` 而失败。提交会规范化缺省值；不是 PP 丢失。后继只补该合成输入规范字段，保留完整成员强比较，同时加前例失败后禁止后继业务的门和本地中间观察。旧失败与源码/载荷身份保持，不自动重跑同版本。

LPP-P2-01 修复：setup 整体和每例 finally 的宿主 cleanup 都通过同一个失败保护器；同步抛错或异步拒绝会保留原错误、标记失败、阻止后继业务并禁止 after 删除自有临时目录。新增 `test-learn-pp-trainer-chain-lifecycle.cjs` 为纯控制，只在 VM 中载入实际套件、注册但不执行四条业务；模拟分配/编译/插件读取/夹具构建/夹具加载失败、成功删除及同步/异步 cleanup 失败。它不加载引擎、不启动编译器或宿主、不运行原版/玩家资料。旧四链成功保持历史结果；此修复不重跑无关业务，也不把纯控制计入业务链数量。
