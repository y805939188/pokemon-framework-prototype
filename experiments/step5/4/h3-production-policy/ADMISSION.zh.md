# 历史闭门准入记录（默认开放候选已另批修订）

本文件下文保留原闭门实现及当时限制。后续本轮明确授权的开发分支准入修订见 `../../../../docs/step5/5.4-held-default-release.md`：不再以合main为默认开放前置，但仍需正常生产路径、独审和精确CI。不得把下文旧常量false陈述当作新候选状态。

# B-3 闭门生产策略接线与开发分支准入

## 实现而非开门

编译、运行时内容组装、GameApplication 和 PSFlow 提前入战守卫共同调用 rules/config.ts 的 runtimeCapabilities。唯一私有发布常量 ORDINARY_HELD_ITEMS_RELEASED 保持 false；正常来源与持物入战使用同一个值，返回冻结快照。它不是新运行时开关，没有参数、存档、环境变量或调用方授权入口。原 developmentCapabilities 严格解析接口保留，既有两个布尔开发覆盖不变。

保留 allowExperimentalHeldItemBattle 旧字段以避免扩大 API 迁移。管理页 experimental 标签仍只看开发覆盖，不因未来正常发布而标成实验。正常能力依次传到 management/gift/grant/trade/captured receipt；PSFlow 提前守卫与 App 两侧检查一致。底层规则使用上层验证的显式 sourceAllowed，不独自读取发布状态。Session/required 来源注册与原子提交逻辑不变，正常空持物战仍 required，不新增 legacy 降级。

## 现在可接入的批次

1. 固定提交并独立复审五个产品文件和新测试，重跑 49 项、构建、类型及边界。作者自测不算独审。
2. 中央分配集成窗口后，作为“默认关闭的一致接线”集成到最新 5.4 开发候选，不覆盖并行改动，不登记为 B-3 默认开放接受。
3. 在集成后的精确 SHA 重建复验，使用已审排除旧冻结成长回放的 CI 路径。独审及发布预检通过后才按授权正常推送 step5/4-*；不强推，不合 main。

## 真正开放仍需的决策与验收

原冻结计划 .handoff/step5-4-plan.zh.md B-3 要求生产写回独立验收并合入后才协调默认开门。main 仍 d6aae8c；当前禁止合 main。本批保留该依赖，不以开发分支绿替代。中央需安排原条件何时可满足；若希望开发分支先开门，必须先取得对原合同的明确变更授权，不能由代码暗中替代。

条件满足且排定开门窗口后，另批独审唯一发布常量改动。该批不得注入 developerCapabilities，必须从正常编译/组装开始逐一验证给予、带物赠送/领取、交换及捕获入队/送盒/满队换出，涵盖消费、取消/技术中止、安装故障、重复提交、存读档→下一战、required 对账及 stats/dex。已有受控 H3 证据不替代正常生产验收。

真实 NW/包装/重启需中央协调宿主空闲与独立准入窗口；本批不运行或新增其授权。不扩大 5.5 野生持物生成、双打或异常长尾，不关闭已有 unsupported mutation 项。

## 实测和局限

策略13 + 既有 test-held-app24 = 37；当前候选编译宿主12，合计49通过，失败取消跳过0。四引擎入口、四插件构建通过；framework/core/app、plugin/tools 类型及141文件边界通过。插件类型首轮因同一 vendor 的符号链接和真实路径重复加载声明失败，原日志保留；改为本树独立副本并用已有类型准备脚本后通过，未改共享 vendor 或使用 skipLibCheck。

宿主套和 fixture 是 da86278 已审版本的独立副本，仅改成当前候选计划和自身运行时，旧冻结文件未改。runtime-plan/host-plan 固定构建字节，独审同时核对源码提交并重建。Node22.21.1；测试命令：
- node --test experiments/step5/4/h3-production-policy/test-policy.cjs experiments/step5/4/test-held-app.cjs
- H3_RUNTIME_ROOT="$PWD" node --test experiments/step5/4/h3-production-policy/test-host.cjs

未执行完整 quick/headless、旧对照、NW、公开 CI 或 main 操作。宿主为 Node VM 非渲染合成环境，不能代表真实 UI 或统一宿主中的磁盘 Continue→下一战。pairHash 仅格式/保存/幂等，非独立语义重算。App 创建后修改开发覆盖不属于正常生产配置热更新契约。本批不能签收完整 B-3 或5.4。
