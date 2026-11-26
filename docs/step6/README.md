# 第六步：使用与验证框架

本阶段交付的是框架，不是在仓库中发布作者工程、开发验收用地图或正式 Demo。面向作者的通用内容编译、MZ 插件命令和隔离诊断可以复用。正式 Demo 和 Mac 玩家下载版的 Developer ID 签名、公证及下载后验收另行安排。

## 使用自己的内容

1. 按[环境指南](../PROJECT-GUIDE.md#9-环境准备从零)构建固定的 Reactor、Showdown、框架插件和内容工具。MZ 的基础素材使用你本机有权使用的安装副本，不从别的工程转拷来历不明的文件。
2. 在自己的项目中建地图、素材和事件。按 `js/plugins.js` 的相对顺序启用生产插件；例如 `PS_World` 在 `PS_BattleFlow` 和 `PS_Inventory` 后面。若要配置战败回程，在 `PS_World` 设置有效的 `CharacterHome` 或 `GlobalHome`，并核对地图、坐标、方向及 `StartingOverSwitch`。缺少位置配置时不能把未回程当成已验证。
3. 作者源目录需有 `manifest.json`、`sources.json`、`species.json` 和 `overlays.json`。领取、训练家等按实际启用的功能添加，引用的素材与数据在来源表登记。见[内容与命令](../step5/commands.md)。
4. 编译到新的暂存位置，用作者清单的内容 ID 及实际文件确认结果，再放到作者工程的 `data/framework/content.json`。不要运行默认内容构建来更新作者数据；默认源是框架内的开发样例。编译的 `--out` 和盘点的 `--report` 不可互换。也不要用 `content:check` 的退出码代替实际输出的身份和文件校验。

在框架根目录运行，三个路径都要用绝对路径；暂存目录本身必须不存在，它的父目录必须已存在。把 `my-content-id` 换成你在作者 `manifest.json` 写的 `id`。只校验并编译时去掉 `--game`。

```bash
node scripts/author-content.cjs \
  --src="/absolute/author-content" \
  --stage="/absolute/work/first-author-build" \
  --expect-id="my-content-id" \
  --game="/absolute/MZ-author-project"
```

工具会先核对固定 Showdown 暂存；成功时在暂存目录写 `content.json`、`inventory.json`，末行给出作者内容 ID、输入摘要以及两份文件的 SHA-256。安装只写目标工程的 `data/framework/content.json`，不替换已有文件。重新安装请在隔离副本中明确保留旧文件，然后使用新的暂存目录。失败后不要复用残留暂存。

## 从新建 MZ 工程接入

保留三个互不嵌套的目录：框架工具检出、MZ 新建的作者工程、全新的内容暂存目录。在作者工程的副本中安装，不要直接覆盖已有项目，不要使用整个原型的 `data/` 或 `js/`。

| 文件来源 | 作者工程应使用 |
|---|---|
| 作者自己的 MZ 安装 | 新建的项目标识、菜单及数据库、插件清单、自己有权使用的基础素材 |
| 固定 Reactor | 用同一次固定安装的 `js/reactor_*.js` 和 `js/libs/`，入口页启动 `js/reactor_main.js`；让 `js/reactor_plugins.js` 指向作者工程当前的 `js/plugins.js`。不要混装 stock 核心 |
| 框架构建 | `js/engine/build/production.cjs` 及它实际引用的同构建文件、下列生产插件。不要靠文件名猜构建缓存，也不要复制旧实验的 `engine.cjs` 或 `testing.cjs` |
| 固定 Showdown | 同一框架检出的 `scripts/build-showdown.sh` 生成的 `js/engine/showdown/{dist/{sim,data,lib,config},node_modules/ts-chacha20,LICENSE,SOURCE_SHA}`，保留许可证通知和当前构建的 `dist/config/custom-formats.js`；源代码缓存不随工程分发 |
| 作者内容 | 编译产物 `data/framework/content.json`，作者自行准备的地图、事件、图音与其他数据 |

普通插件按 `PS_RuntimeFixes → PS_SaveLocation → PS_SaveState → PS_BattleFlow → PS_Management → PS_Inventory → PS_World → PS_Progression → PS_Evolution → PS_Pokedex` 启用。保存后重读实际清单，验证各插件仅出现一次且已启用；不启用 Smoke、FlowTest 或原型的 Reactor 演示插件。只对有授权的素材进行安装；同路径文件不同字节时停止，不覆盖作者资产。现有原型打包脚本不等同于这个安装清单，也不授权任何第三方再分发。

在工具根目录检查 Showdown 和框架内部构建文件，不要按旧版文件名复制 Vite 带哈希的分块：

```bash
node scripts/check-showdown-staging.cjs
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const seen = new Set();
function visit(name) {
  if (!/^[\w.-]+\.(?:js|cjs)$/.test(name)) throw Error('Unexpected chunk name: ' + name);
  if (seen.has(name)) return;
  seen.add(name);
  const file = path.join('js/engine/build', name);
  const code = fs.readFileSync(file, 'utf8');
  console.log(file);
  for (const [, dep] of code.matchAll(/\brequire\(["']\.\/([^"']+)["']\)/g)) visit(dep);
}
visit('production.cjs');
NODE
```

把上述输出的框架文件连同指定插件留在相同的项目相对路径。对照 `shasum -a 256` 核验工具侧和作者侧相同文件。上面的命令列的是静态相对依赖；需要真实启动来检查实际运行时依赖。若你的项目另加插件或资源，按实际引用另行核对。

## 用真实事件验证一次最小流程

- 通过 `ClaimGrant` 领取初始队伍。为结果选专用变量，首次领取为 1，重复为 2；检查重复领取没有再增加物品或成员。
- 开战前清空结果变量。用 `StartTrainerBattle` 指定内容中的训练家 ID 和版本，等原生解释器恢复后再分支；仅胜利结果 1 才发章。拒绝、宿主错误和战败不能进入发章分支。
- 要查询指定徽章，`QueryBadge` 必须填明确的徽章索引和目标变量。空索引读到的是徽章数量，门禁应先清旧值，只认明确的布尔 `true`。同时测试持章可达和无章原地留置。
- 测试存读档时每例使用新的隔离 profile、HOME 和档目录。关和开自动存档分开验证；手动槽位选择明确的槽号，开启时把自动槽 0 和全局槽位索引一起纳入检查。通过标题新进程继续，不以存档函数返回代替磁盘写入或冷读。不要使用真实玩家存档。
- 验证普通运行不会因事件、启动参数或内容配置而获得测试权限；遇到正常运行的短错误码，先查[诊断说明](6d-diagnostics.zh.md)，不要让玩家日志暴露本机绝对路径或原始内容。

## 开发验证入口

- [测试能力和入口](6a-capabilities.zh.md)记录基线、拒绝定义与正负例；其中“现状”列指原 5.6 基线，不是此版本仍允许测试访问。
- [隔离启动准备器](6d-isolated-launch.zh.md)只验证并组装不写存档的隔离启动计划，不等于运行过真实 NW。
- `pnpm --dir src typecheck` 和 `pnpm --dir src build` 检查类型与构建。固定依赖准备好后，`./scripts/test-headless.sh --list` 可查看用例，`PF_NO_SKIP=1 ./scripts/test-headless.sh --scope=regular` 执行常规无界面回归。冻结对照回放、实际 MZ/NW 操作和玩家分发不属于该命令的通过范围。
