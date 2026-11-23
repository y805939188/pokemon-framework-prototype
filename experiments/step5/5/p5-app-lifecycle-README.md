# P5 真实 App 连续生命周期准备

初始固定源码 `0099d51c4f43d966e2a92d52c41ce5269588b194`；E2 接线后继固定产品 `2d685a4df01968cf280ef499bb0d073db846137a`，只新增本前缀夹具、驱动和证据。`--prepare` 私建 bundle，`--exercise` 执行有限字面链；本驱动没有统计运行模式。

`prefixChain` 由真实 GameApplication 的公开入口建立非零 accumulator：10 次未中达到210，跨图进入保留，另一格未中达到231，同图传送保留；宽限拒绝不增加，折算后常规 draw21 触发，真实 admission/start/finish 提交 ledger；随后真实背包 repel 入口、活动未中与挡下验证早退无生成抽取。逐步 runtime 由独立 WP36 oracle 和 JSON 字面快照双重检查，完整请求域和返回值逐次核对。

`combinedPublicApiChain` 先在同一 App 内完成 map→非零 accumulator，再测试同值／异值／版本0回退、显式事件开战与结束、Surf 起止、Water／Land 切换和普通遭遇交接。缺正式入口时停于首个 NOT_READY；其余 oracle 行只表示从规格推导的期望，不算生产执行。初始候选缺正式版本 setter 或 E2 Surf parent；E2 后继已提供公开入口和生产 host，实际通过结论以绑定该后继的执行回执为准。

生产 App／规则及真实 `createMZAtomicStatePort` 被私建。会话 factory 由正式 `createLegacyNoHeldSessionFactory` 注册；会话结果、地图事实、时钟和输入随机带是显式合成端口，不宣称 Showdown 或 MZ/NW 实机验证。旧源码只能只读观察 TS-private JS `App.world.encounterRuntime` getter，驱动不写 private、不替换 App 方法、不手改 runtime、不借 `stateReplacedByHost` 模拟版本切换。正式只读 `worldEncounterRuntime()` 可用后优先使用。

最小正式接口已发唯一 App 作者：`GameApplication.setEncounterVersion(version:number)` → `WorldOperation.setEncounterVersion`，验证 signed safe 整数；同值保持表与 runtime；异值通过 native atomicWorld 的 owner/generation/content/map/scene 最末守卫写入、加载当前地图表并只清 graceSteps，保留 accumulator，0 RNG。`GameApplication.worldEncounterRuntime()` 只返回副本。正式开战应在有效 factory 完成且 owner 当前时清双计数；失败不冒充实际开战。

Surf 接线将用正式 `GameApplication.runFieldMove(requestId,{kind:'use',moveId:'surf',entry:'party',memberId:'P1'})`、`{kind:'surf-land'}` 及 `{kind:'surf-cleanup'}`；需真实 E2 parent 与生产 `FieldMoveExecutionPort`，不能用测试方直接调用 applyStage/reset 代替。初始健康、非蛋、无同行、徽章1–4、Surf 招式资格及水／岸地形由独立夹具给定；上下水能力跳跃不计普通步、不额外抽 R01。上水后合格玩家通知先清基点；上岸跳跃先保留 surfing=true／endingSurf=true，后续 cleanup 才清业务模式并 reset，不把 landing 与最终 cleanup 混成一次提交。

`p5-app-lifecycle-surf-host.cjs` 已准备独立 native MZ 夹具：真实生产 `createFieldMoveHost`、`Game_Player`／`Game_Map` 和逐帧原生跳跃；音效、文本、演出使用显式合成 ACK。它不实例化假 FieldMoveOperation，不拥有 App 状态，不调用 applyStage。后继固定 E2 parent 可在私建 entry 导出 `createFieldMoveHost`，prepare 另传 `--mz-runtime /absolute/js/reactor_objects.js`；runtime 路径和 SHA 与源码一起绑定。没有导出／文件绑定时 Surf 仍 NOT_READY。

P5 原20边际的12个生产模块按 SHA 与首轮做映射，首轮 prepared／2M 结果只读保留。是否因最终 RNG 源变化需要新统计由协调者决定。本任务不改 seed／N／m／α／阈值，不重建旧 prepared、不运行旧 `--run`，旧首轮的 P03／P05／FLUTE-MAP 未闭合记录保留；当前 C 后继已实现的范围和剩余验收以 C-current-candidate.zh.md 及精确绑定报告为准，本驱动不代签。

运行（各输出目录必须全新；用 Node22.21.1）：

```sh
node experiments/step5/5/p5-app-lifecycle-run.cjs --prepare --out /absolute/new/prepare --compiler-root /absolute/main/src --old-p5-evidence /absolute/main/build/step5-5-development-20261115/p5-product-prep/formal-first-01 --expected-commit FIXED_SHA
node experiments/step5/5/p5-app-lifecycle-run.cjs --exercise --out /absolute/new/exercise --prepared /absolute/new/prepare/PREPARED.json
```

私有构建、结果、源码／runtime 绑定、首失败、清理台账放 `build/step5-5-development-20261115/p5-app-lifecycle-prep/`。清理只登记，独有证据及旧首轮保持。
