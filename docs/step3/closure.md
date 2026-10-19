# 第三步收口记录（工程基础与首条 Ruby／TS 差分链）

**状态：已收口（2026-10-19）。** 范围仅限第三步既定交付（A 工程化、B 内容/本地化/存档、C 首条差分链，含并入的 F1–F3 与第二步补充收尾）。它**不代表**框架功能齐全、第四步已开始，也**不证明**性能无退化。

## 提交与标签

| 项 | 提交 | 说明 |
|---|---|---|
| 被验收的候选 `step3-candidate-3` | `433e78a016ea80b46fe1caa758fdf9c6c789b8de` | 独立复核有条件通过（R1–R4 全部关闭） |
| 合并提交（并入 `main`） | `a0e6b848115cd47d4504f0f5e06e07a546a1d2bb` | `--no-ff`，第二父提交即候选 `433e78a`，合并树与候选逐字相同；其后只有本文件等纯文档提交 |
| `step3-closed` | 指向最终 `main` 提交（`git rev-parse step3-closed^{commit}`） | 在该精确提交的 CI 成功之后才创建 |
| 保留的历史标签 | `step2-closed`（`76cee14`）、`step2-closeout`、`step3-candidate`（`89988b2`）、`step3-candidate-2`（`e0a6be5`）、`step3-candidate-3` | 均未移动 |

## 验收经过

1. 首次独立验收 `step3-candidate-2`（`e0a6be5`，Codex）：**不通过**，4 项 P2（本地化原型同名缺失 key、flow 穿透战斗接入层、检查器漏模板插值、overlay 绕过 nameKey 唯一性）。
2. 作者限定整改 R1–R4（提交 `7631c6a`、`9290648`、`00b963c`、`bef2474`、`d9a9779`，说明见 `docs/step3/README.md` “第三步限定整改”）。
3. 针对整改差异的独立复核 `step3-candidate-3`（Codex）：**有条件通过**，R1–R4 通过，无新阻塞项；条件是保留性能未知项并核对最终 `main` 的 CI。
4. 报告在工作区（不在 git 里）：`.independent-reviews/step3-20261019/REPORT.zh.md`（首次，不通过）、`.independent-reviews/step3-rework-20261019/REPORT.zh.md`（整改复核，有条件通过）。

## 测试与证据（绑定到精确提交）

- 本地 `scripts/test-quick.sh`：21 套件 **168 项**通过（含第二步 68 项原测试、冻结协议、矩阵、F1–F3、失败封闭、边界检查 21 项）；完整构建通过。独立复核在隔离检出上重跑同样通过。
- 真实宿主与打包（NW.js 0.117.0 / Chromium 154 / Node 26.7.0，ad hoc 签名）在代码提交 `d9a9779`（`workingTreeChanges: 0`）上：开发树 T1–T11 + V1 通过；包内 T1–T11 + V1 + S1–S10 + SL1 通过，签名封印有效，S1–S10 指纹与 Node 及冻结基线逐个相同；引擎包哈希 `3e2267c3c43f96f7bc7d4274b5bd572b7d874a4193ce231849fa7ba583547acc`（包内 = Node 加载）。证据：`experiments/step3/evidence/rework/`。`d9a9779` 之后只有文档与证据。
- 成长曲线差分：3504 条原版实际运行用例逐条相同（只覆盖成长曲线，不是全框架等价）；交付包只含行为数据，见 `docs/step3/differential-growth.md`。
- CI：GitHub Actions 两层（headless、plugins）对候选 `433e78a` Run 17 成功；最终 `main` 精确提交的结果见 `.handoff/STATUS.md` 与 `scripts/ci-status.sh main`（workflow 对 `main` 与 `step3/**` 的推送都会运行）。窗口、打包、性能不在 CI。

## 已知限制（沿用，不因收口而消失）

- **性能：尚无同条件基线，未证明无退化**；冷启动比候选记录慢约 190–200 ms、引擎动作延迟 +1.5–2 ms 的原因未判定。
- 只验证 macOS Apple Silicon；Windows/Intel、Developer ID 签名与公证未验证（用户决定：Windows/Intel 不作首发条件）。
- 实际复核配置（模型/推理/Standard）没有环境回显，记未验证；clean-room 历史没有独立访问审计。
- 首版单打；双打与长尾后置；框架独有内容数值仍是 `author-placeholder`。
- “边界债务与去向”（`docs/step3/README.md`）里仍后置的部分——无 Node 核心入口、摘要注入、应用+假适配器、真实 MZ 同契约、插件 `any`、`process.*` 规则——属于第四步前的短架构批次，不在本次收口范围。

## 回退

收口是一次 `--no-ff` 合并；撤销用 `git revert -m 1 a0e6b848115c`（保留历史，不要 reset 或 force）。各整改提交也可单独 `git revert`。
