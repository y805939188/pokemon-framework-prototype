# pokemon-framework-prototype (AGENTS.md — 与 CLAUDE.md 内容相同，供 Codex 等读取)

主工作仓库。**动手前先读 [`docs/PROJECT-GUIDE.md`](docs/PROJECT-GUIDE.md)**（目标、铁律与授权边界、协作协议、架构、环境、命令、已知坑、文档地图），再读工作区的 `../.handoff/STATUS.md`（当前进度与下一步，不在 git 里），最后用 `git status` 核对实际状态。

要点（细节都在指南里）：
- clean-room：只读规格库 `../pokemon-framework-reference` 的正式规格，**不读不移植原版 Ruby**。
- 推送/合并到 `main`、强制推送、永久删除、改全局 MZ/NW.js、使用凭据、改变首版范围：**先问用户**。
- 子 agent 默认不用，只能用 Sonnet 5.5（除非用户指定）。
- 快速自检：`scripts/test-quick.sh`（约 1 分钟，无窗口）。会弹窗口的测试见指南第 8 节。
- 不用 MZ 的"部署"打包；用 `scripts/package-mac.sh`。
