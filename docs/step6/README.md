# 第六步运行时与工具子集

本候选包含战斗操作及退出、战后结算、存档作用域和诊断的实现，以及隔离启动准备器。作者工程、示例地图、媒体与作者分发包暂缺。本目录说明开发和回归入口。

- [运行模式和测试能力](6a-capabilities.zh.md)
- [运行时诊断](6d-diagnostics.zh.md)
- [隔离启动准备器](6d-isolated-launch.zh.md)

安装仓库声明的固定依赖后，运行 `pnpm --dir src typecheck` 和 `pnpm --dir src build`。常规套件清单由 `./scripts/test-headless.sh --list` 打印。安装固定的 Reactor 并构建 Showdown 后，使用 `PF_NO_SKIP=1 ./scripts/test-headless.sh --scope=regular` 执行常规回归。隔离启动套件使用 Node 构造临时目录并核验入口约束。实际宿主启动和跨进程存档须单独验证。
