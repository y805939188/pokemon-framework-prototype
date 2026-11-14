# 5.4 Claude 三轮回归整改回执（2026-11-14）

本页固定 488dade 的历史验收；F1 后续已从 warning 继续接入真实治疗量，见[后继合同](authored-hp-healing-contract.zh.md)，新候选资格不可借本页旧绿。

固定基线 `03f7e54d9a772d4d321554651cdbfecc907a2694`；产品／测试候选 `488dade87108a9109750c5ed2fde0511a9c5cf4d`（src tree `b59126605921b82de091ae1fb4f1b57b66b6d1f4`）。独立工作树 `.worktrees/regression54-remediation`，分支 `fix/regression54-claude-20261114`。本回执是其后的纯文档提交，不代替候选本身的运行绑定。

| Finding | 本次结果 | 保留边界 |
| --- | --- | --- |
| F1 | 为战斗可用 HP 道具的作者参数与固定表差异提供编译 warning，覆盖两配置列、比例与补满；真实 CLI 及新增测试通过 | 保留既有数值合同，**没有统一作者战内／场外治疗量**；复活／PP 等家族不扩展 |
| F2 | 战斗全屏学招隐藏底层卡片／日志／图层，并恢复各自原可见值；Scene 回归与正常速度截图通过 | 场外学习与进化 Scene 未修改 |
| F3 | 正式修复口袋／Use／目标层、成长文字观察、当前持物合同、拒绝及三容器守恒；补真实捕获替换持有者的保存／Continue／Knock Off 恢复 | 关闭持物旧 UI 在当前生产策略不可达，不把合同替换算成该旧分支覆盖；自换比较只排除 choice.error 拒绝诊断 |
| F4 | 学会消息经内容／翻译解析 ID；补失败、持物、变身、无效果、天气／场地结束、醒来／解冻及 Potion 重复文字 | 白名单文本；未知事件保持原边界，没有完整机制／文本覆盖声明 |

最终完整 typecheck、build 通过；六文件定向 92/92。完整 regular **295 套／5356 项通过，失败／取消／跳过 0，exit0**，runId `3529e819-8741-4e60-b5db-5006dd3b29e0`，before/build/after dirty=false，末尾与另行 binding verify 通过。冻结参考回放 1 套按政策 EXCLUDED／NOT RUN，不计通过；没有新 CI。

最终真实 NW 七模式均通过：all 64/64、verify-save 4/4、step5-sample 1/1、step5-continue 1/1、held 11/11、held-continue 6/6、battle-entry 10/10；另有 T2 定向 1/1。各 runner rc0，子进程 exit0，无超时。真实保存、Title Continue 及再次战斗均使用隔离 saves／profile。

正常速度两条定向链补齐：永久四招／复制四招后非终结击倒→替换第四永久槽→下一请求出招→胜利提交；以及永久一招／复制四招后自动追加第五招→出招→提交。均验证临时／永久 PP 与复制招式隔离。四槽案例完成于 d768340 的一个整体失败 harness 进程；后续只改测试驱动，引擎及全部产品插件与最终候选逐字节相同，详细资格见完整报告。五槽案例在最终候选单独整体通过。均为可信 CDP 键盘注入与合成作者夹具，非实体输入；七槽只有 headless 证据。

第一轮 d768340 regular 也为 295/5356，但 NW T2 因比较包含拒绝诊断而失败，生产者失败后的 verify-save 按设计拒绝；最终已修正重跑。另有严格类型与外部正常速度 harness 的早期失败，均保留原日志，未靠重试隐藏失败或修改历史受控哈希。详细判断、六条提交、负例、真实命令、未测范围和复审重点见 [完整本地报告](../../build/regression54-remediation/REPORT.zh.md)（SHA-256 `69f54afb41592f38342b85ec1197c2b6e20c4874bf668ed4ba621b4c2f251610`）；证据摘要见 `build/regression54-remediation/EVIDENCE-SHA256.txt`，最终身份见同目录 `FINAL-RECEIPT.json`。该 build 目录是保留的本地证据，不在 Git 中，不应清理。

本执行者独立核查 Claude 报告并编写本次修复；本回执不等于另一位 AI 对修复的独立签收。未验证实体输入／IME、人工听感、跨平台、性能／百场、原版／OA／完整机制，未推送、建 PR 或合并 main，未读写玩家档，未外传原版内容。原 5.4 收口边界保持。
