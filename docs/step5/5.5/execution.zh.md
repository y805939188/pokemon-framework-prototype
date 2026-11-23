# 5.5 执行状态

2026-11-15。用户已批准按最终方案开展 5.5 整体开发，并要求安全任务尽量并行。此前 A 合同和归档 README 中“仅归档、暂停”记录的是 10:18 的历史状态；后来的执行授权以本文为准，原归档字节保留在本地提交 `312aa56`。没有推送或合并 main。

## 固定本地基线：通过

- 源码 HEAD：`037e79ece74a1abfd9ecdeb7420eb7f8fd8e712b`；src tree：`98778d0d7c92308d970022c57153dcea503c081c`。
- 旧失败 `build/step5-5-baseline-20261115/test-quick.log`／`.exit` 保留：暂存扩展不一致，298 套未执行。
- 最小恢复仅替换 ignored `js/engine/showdown/dist/config/custom-formats.js`。旧字节和全部 433 文件清单保留，其余 432 文件未变。新扩展 SHA256 `ea6ce8f497495213f68633e1b24b1e256a3780b224c99e660a1dcc5e1d7eb58e`；历史候选 466 文件同名部分仅此文件不同，其余 33 文件均为声明。
- 新运行：Node `22.21.1`，`PF_NO_SKIP=1 scripts/test-quick.sh`，11:01:17–11:11:59 UTC，**298 唯一套／5432 pass／fail 0／cancelled 0／skipped 0／exit 0**。冻结参考回放 **EXCLUDED NOT RUN**。
- before/build/after dirty 均 true，来自原有未提交方案文档；当时产品和测试源码未改。
- 随后完整 `pnpm --dir src build` exit 0。固定基线运行载荷 489 文件已另存，供后续 F 的真实 5.4／5.5 自动保存对照使用；目前该动态对照仍未执行。
- 证据：`build/step5-5-development-20261115/baseline-recovery/`，含原字节、前后清单、日志、exit、运行身份、套件汇总及 fixed-payload.sha256.json。历史候选及受保护 9 文件均复验未变。

这次没有执行 build-showdown.sh；没有 fetch、npm ci、全量 Showdown 重建或删除旧暂存。历史 binding 引用的 manifest 已缺，因此本轮没有重新认证历史完整封印；以上通过来自新本地运行。

## 执行门槛与分工

[B 合同](B-contract.zh.md)固定迁移、事实、内容、无目标道具和宿主适配边界。[P-5](P5-statistics.zh.md)在产品写入前冻结20项、样本量、容差、seed和失败解释。A补正：R02应读作“均须有向量”；R04包含威吓／锐利目光的适用50%拒绝门。所有T01–T26、R01–R13仍按原合同逐批落实。

共享状态／schema／framework入口由B整合者单写；新world-data／world-input由内容作者独占；PS_World／背包及保存宿主适配由宿主作者独占。C遭遇纯规则、D步后纯规则、E1钓鱼纯规则可以在独立文件并行，接口接入按B依赖串行。构建和完整回归由协调者串行，NW独占。本线不操作旁路对照、原版源码、O/A适配器或原始输出，不碰外盘清理任务和玩家资料。

当前放行的是实现和安全并行准备，尚无B功能通过、NW、CI或整体5.5签收。

## 登记的未闭合项

- B：新schema、内容、世界事实、236、正式读档失败、读档进入及无目标返图链的定向／完整测试和独立审查待执行。
- C：FLUTE-MAP（黑白笛等级方向及互斥写入）缺正式净化说明；持物逐值段／同池特殊路径、传说IV去重的逐次RNG需补净化说明或明确框架实现约定。不得凭原版记忆填入。
- D／E／F／G：尚未签收；P-5只冻结未测，正式NW、真实保存／冷Continue、5.4实际自动保存、人工输入／听感／手感均未执行。

后续结果按固定候选及真实命令追加；不把准备报告或历史通过当当前实现证据。
