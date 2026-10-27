# 步骤 1：本地 CommonJS API 与消费合同

本文是 `build/framework-cjs` 的使用说明和兼容边界。它是本轮本地候选的合同，不是 npm 发布说明，也不是完整 MZ 游戏或法律分发许可。

## 1. 公开入口与兼容分类

包名：`@pokemon-framework/engine`。下列子路径是公开 API；`src/framework/**`、构建 chunks 和未列出的文件都是内部实现，不提供外部深路径兼容承诺。

| 入口 | 运行时 | 声明 | 用途 |
|---|---|---|---|
| `.` / `./production` | `js/engine/build/production.cjs` | `types/production.d.ts` | 生产 Node API：规则、状态、应用、Showdown 适配、内容、SaveStore 等；不含 testing |
| `./core` | `js/engine/build/core.cjs` | `types/rules/index.d.ts` | 独立、无 Node/DOM/MZ/Showdown 的纯 core；保留 bare-context 能力 |
| `./testing` | `js/engine/build/testing.cjs` | `types/testing.d.ts` | 显式测试设施：`fixtures`、`harness`、`matrix`、`fakes`、`scripted` |
| `./legacy` | `js/engine/build/engine.cjs` | `types/index.d.ts` | 历史总入口；保留全部生产与 testing 导出 |
| `./content-cli` | `js/engine/build/content-cli.cjs` | `types/tools/content-cli.d.ts` | 内容作者程序；用 `require.resolve` 定位后以 Node 子进程运行，不要当作无副作用库加载 |
| `./content/sample.json` | `data/framework/content.json` | JSON | 从当前 `content/sample` 正式编译的作者占位内容；不是隐式 fallback |
| `./manifest.json` | `manifest.json` | JSON | 同次构建源码、工具链、依赖和文件 hash |

`production`、`testing`、`legacy` 在一次多入口构建中共享生产 chunks；同一安装、同一进程内它们的 constructor、错误类、application 继承关系、checkpoint WeakMap 和事务身份一致，加载次序不改变这一点。`core` 是单独的纯宿主 bundle，保持无 `require` 的 bare-context 合同；不要把 `core` 与 `production` 的类构造器做跨入口 `instanceof` 身份假设。本轮名义身份承诺仅针对 `production/testing/legacy`。

历史 facade 随包提供，并使用以下公开子路径：

- `./legacy/gateway.cjs`、`./legacy/harness.cjs`、`./legacy/matrix.cjs`；
- `./legacy/fixtures/game.cjs`；
- `./legacy/game/store.cjs`、`state.cjs`、`session.cjs`、`growth.cjs`、`describe.cjs`（均在 `./legacy/game/` 前缀下）；
- `./legacy/rpg/rules.cjs`。

仓库原路径 `js/engine/**/*.cjs` 也保持原样。旧 API 删除不在本步范围内。内部 TypeScript 深路径的单元测试仍是内部测试，不因此升级为公开 API。

## 2. fixture 与生产内容分类

- `tools/fixtures/**` 及 `js/engine/fixtures/**`：合成测试世界、战斗输入、金样与矩阵基线；只经 `testing` 或显式 legacy 使用。
- `tools/fakes.ts`、`scripted-driver.ts`、`harness.ts`、`matrix.ts`：测试/诊断；`SaveStore` 虽位于 `tools/`，仍是生产 Node 持久化适配器，留在 production。
- `content/sample`：默认 MZ 示例及 Node 集成测试使用的作者占位生产输入，不搬入 testing；加载失败不得隐式改吃 fixture。
- `content/examples/progression`：显式作者示例，不是默认新游戏。
- `experiments/**/fixtures`：内部测试数据，不进入本地库交付。

插件 `resetGame` 仍是显式 testing aid；正式 `startNewGame` 仍创建空状态。本步不改变存档 schema、战斗协议、内容语义或恢复规则。

## 3. 本地安装与 Node CJS 直载

把完整 `build/framework-cjs` 复制到一个空工程的 `node_modules/@pokemon-framework/engine`。不能只挑几个 bundle；共享 chunks、声明、fixture、Showdown 及其 `ts-chacha20` 都是交付的一部分。无需 `NODE_PATH`、源码路径、打包器或网络安装。

```js
const production = require('@pokemon-framework/engine/production');
const core = require('@pokemon-framework/engine/core');
const testing = require('@pokemon-framework/engine/testing'); // 仅测试工程
const legacy = require('@pokemon-framework/engine/legacy');
```

已实际支持/验证的配置仅为：Node **22.21.1**、TypeScript **7.0.2**，`target=ES2022`、`module=Node16`、`moduleResolution=Node16`、`strict=true`、`skipLibCheck=false`。包声明的运行要求是 Node `>=22.18`（Showdown 要求）；其他 Node/TS 版本、ESM、浏览器直接加载和任意宿主通用性均未验证。

`production/core` 的声明闭包可在 `types:[]` 下独立严格编译，不强迫纯 core 消费者安装宿主类型。`testing/legacy` 的 harness 报告公开引用 `NodeJS.ProcessVersions/Platform/Architecture`，其声明依赖是 `@types/node@22.20.4` 及锁定传递依赖 `undici-types@6.21.0`（DefinitelyTyped/对应包，MIT）。使用 testing/legacy 的空工程必须把这两个声明包放在自己的 `node_modules` 中；它们不来自框架 `src`，也不会由运行时代理自动寻找。缺少这些类型时 testing 声明编译必须失败，不能改 `skipLibCheck` 或补 `any` 来掩盖。包内 Showdown/`ts-chacha20` 已是运行交付，无需再安装运行依赖。

TS 示例使用 CJS 形式：

```ts
import production = require('@pokemon-framework/engine/production');
import core = require('@pokemon-framework/engine/core');
const digest: string = core.digest.sha256Hex('abc');
const app: production.app.GameApplication = createApplication(production);
```

应用的 `GameStatePort`、`ContentPort`、`OutcomeProjection`、`BattleSessionFactory` 等正式命名类型位于 `production.app`；核心 `Content`、`Member` 等位于 `core`。消费者可以实现自己的端口，无需继承测试 fake 或读取私有模块。

## 4. Showdown、内容与 CLI

Showdown 固定为 `7244fe8e28fa8bc4d0809ae30d183c608b62bb2b`，位于 `js/engine/showdown`，其 `SOURCE_SHA`、`LICENSE`、`dist/{sim,data,lib,config}` 和 `node_modules/ts-chacha20` 必须一起交付。来源与 MIT 文本见该目录；其他权利与再分发审查仍按 `THIRD-PARTY-NOTICES.md` 保持开放。本包不给出额外法律许可，第一方候选标记为 `UNLICENSED`/私有本地交付。

缺 Showdown 或其中的模块时，真实 Node `require` 会以带缺失路径的 `MODULE_NOT_FOUND` 失败；没有自动下载、源码 fallback 或 fixture 替代。`SOURCE_SHA` 与 pin 不一致、staged `custom-formats.js` 与当前构建不一致时，分发构建拒绝完成。

CLI 示例（输出必须显式放在消费者自己的可写目录）：

```bash
node "$(node -p "require.resolve('@pokemon-framework/engine/content-cli')")" \
  build --src=content/examples/progression --out=/absolute/consumer-output/content.json
```

CLI 的项目根是包根；`scripts/showdown.env` 与作者输入随包提供。它不依赖调用者的 cwd。

## 5. 从当前源码生成与身份核对

在框架工作树运行：

```bash
pnpm --dir src build:distribution
```

该命令依次重建多入口 runtime 与独立 core、核对 staged Showdown、编译当前 sample、生成声明，再组装 `build/framework-cjs`。它不会安装、联网、发布或启动宿主。staged Showdown 必须已由环境准备；缺失就是失败。

`manifest.json` 记录源码 SHA/tree、dirty 状态、源输入 fingerprint、Node/TS/Vite、Showdown pin 和逐文件 SHA-256。`SHA256SUMS` 包含 manifest 自身；交付报告另记录它的 hash。只有 clean 的固定提交、同次构建产物才能作为候选；dirty 构建只用于开发自测。

## 6. 宿主适用边界与未覆盖

- `core` 保留无宿主纯规则入口；Node CJS 消费和 bare-context 是不同验收。
- `production` 的 Node 适配器与 Showdown 需要 Node builtins；本步验证真实 Node CJS，不声称任意浏览器或任意 MZ/NW 版本通用。
- MZ 插件仍从本工程构建。本步只迁移其公开源码入口和保留兼容，不包含完整 MZ 插件包、真实 GUI/NW、实体输入、离线游戏包、性能或发布授权验收。
