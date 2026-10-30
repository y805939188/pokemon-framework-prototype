# 友好度标准作者域与显式迁移：冻结合同及第一批 partial 实现

2026-10-30。父端已冻结本合同，开始授权已具备。此文件由原草案修订，原始草案在本批外部 C 的 `INITIAL-CONTRACT-DRAFT.zh.md` 保留。本批只交作者域与纯 plan/apply；**完整友好度存档迁移未交付**，实际 App/Store/MZ 路径及公共导出/注册等待 B 协调，状态 OPEN。

工作树 `.worktrees/friendship-standard-domain-20261030`，分支 `fix/friendship-standard-domain-20261030`，基础为已接受 A-M1 `5f46c8565fd36945461cd199e659b39fa61ab11b`。没有接入 B 在途代码、变更持久 schema 或迁移账本。作者只自检，不代替父端安排的独立 ultra。

## 冻结版本合同

- 作者 manifest **schema2**：新标准，happiness 仅接受 0..255 整数；省略继续省略，创建时沿用现有 70 fallback。base、显式 form、overlay 各自过门；有效 overlay 不能掩盖非法原输入。
- 作者 **schema1**：明确 legacy 选择，保留非负安全整数（含 256 和其它 >255），返回 `legacy-author-schema` 兼容诊断。CLI build/check/inventory、PBS 导入可见。版本来自 manifest，不猜文件创建时间；显式 1 是兼容选择，不是安全/防作弊边界。
- manifest 缺少 schema 或非法 schema 受控拒绝，不回退 legacy。当前样例和 progression 示例入口改为 2，历史 fixture manifest1 保留。
- compiled 仍为 **schema3**。共享 `speciesFieldProblem`、runtime loadCompiled/assembleContent、member factory、旧 save reader 不收紧；旧 256 可读、保持原值，不因载入自动钳改。原 schema1 输入的 inputsHash、contentIdentity 和 compiled JSON 保持相同。

## PBS 合同与 API 变化

CLI 从所属项目 manifest 读取明确作者版本，来源预使用门仍先于 PBS 读取和 form 适配。bundle 任一文件/字段失败不暴露可用 species/identity/text 前缀，报告保留精确 file/line/path。

`importPbsSpecies(text, sourceId, authorSchema = 2)` 与 `importPbsBundle({authorSchema: 2, ...})` 默认标准2。旧两参数文本调用的正常 0..255/省略场景兼容；需要导入 256 的文本调用必须显式传 `1`，bundle 同样显式 `authorSchema: 1`。两种 API 均返回 `warnings`；legacy 诊断不写入编译产物，不改变旧编译身份。调用者不能无声忽略 legacy 诊断来冒称标准2。文本 API 保持原有 accepted-record 诊断语义；原子承诺属于 gated bundle。PBS 已有省略 Happiness=70 的导入默认不变。

## 纯迁移合同

内部模块 `rules/friendship-migration.ts` 处理 party 和 `storage.boxes[].slots`；`content/friendship-migration.ts` 处理原始 species/form/overlay happiness。它们无 Node/DOM/Showdown/MZ 依赖，核心不反向依赖 content，未加入公共 root/SDK 导出。作者预览经过正常 compile 校验（含来源和身份门），不会把非法 schema2 配置当 legacy；作者迁移保持 manifest 原版本，升级为2是调用者后续明确操作。

- plan version1，kind 分玩家/作者；每个候选及选定目标具名身份、精确路径、before=256、after=255。缺省选择全部 exact256，显式 paths 可选子集或空集；重复/未知/非256路径拒绝。省略字段不补70。
- 绑定完整、排序规范的 before/after JSON 快照及 SHA-256，并以 planHash 覆盖版本、kind、两个快照、候选全集、选择、未纳入项。快照对象仅限无损 JSON 数据；undefined、非有限值、-0、稀疏数组、隐藏字段、getter、symbol、环和非普通对象受控拒绝，避免静默丢失其它字段。不是通用 JS/JsonEx 序列化器。
- apply 必须收到预览时独立保留的 `{planHash, targetPaths}`；从原始快照与选择重新计算完整计划，逐字段核对。缺项、篡改、未知版本/kind、错误确认、当前快照变化、部分应用均原子拒绝，原输入不变且不返回可提交 data/receipt。
- 当前快照必须精确等于 before 或 after；后者返回 `already-applied`，确定性收据相同；无选中修改返回 `unchanged`。完成后若任何其它状态再变化，旧 plan 为 stale，需重新预览。没有往状态写持久幂等标记。
- 成功只返回 detached data 与**外置收据**：含原始完整快照、前后 hash、目标、planHash、after 快照、receiptHash。核心不会安装状态或写文件。hash 是完整性绑定，不是加密签名；能同时换掉计划和确认的一方可以选择另一份预览。
- 仅迁用户批准的精确256。其它 >255 非负安全整数保留并列 `outside-approved-256-migration`；未选中的256仍在 candidates 中可见。因此部分迁移或存在257等数据，不能声称全部 legacy 已标准化，切换 manifest2 仍会被正常门拒绝。
- 玩家仅校验本任务相关 schema/集合/成员身份和 friendship，不替代完整 save/content validator。正式接线必须继续用 App/Store 自有的完整校验、操作锁、状态权威及事务。

迁移后的255使用现有 `planFriendshipChange` / `deriveAffection` / item adapter 正常路径；未知方法仍为 TS 结构化拒绝，未迁旧值仍按正常域门拒绝。本批没有改 `friendship.ts` 的事件增量、软限、affection 阈值或任何 Showdown 规则。当前 Gen8 优先，Gen9 后续；原 Ruby 历史不自动作为产品规范，本批没有读 Ruby 或观察 raw。

## 已实施与验证入口

精确独立命令（在本树，从未存在的新 phase 名运行，拒绝覆盖旧日志）：

```sh
/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node experiments/friendship-standard-domain/run-checks.cjs review-fresh
```

runner 串行执行 framework/core/app 三层 types、边界、runtime/custom-formats/core/content-cli 构建、标准样例 build/check、18 个相关新旧套件。日志和构建输出为本树 ignored `build/`；旧 suite 自建临时文件通过 TMPDIR 定位到该次 ignored 目录。新三套覆盖作者门/PBS、纯迁移与正常规则回归，旧 fixtures/golden 未改；唯一旧断言调整是把 author schema2 未知改为真正未知999。边界 checker 和 runner 注册文件未改。

依赖仅从允许的已接受 A 树 COW 复制本树缺失的 `src/node_modules`、`src/vendor/rpgreactor`、`js/engine/showdown`。Node 固定22.21.1，TS7.0.2、Vite8.3.1、Showdown SHA7244fe8e28fa8bc4d0809ae30d183c608b62bb2b，未安装/升级/联网。复制前核对 A HEAD/base、锁文件、battle 自定义源码和 staged 扩展身份，复制后核内容与独立 inode、无跨树外部链接。

首轮真实失败保留：新 author suite 两项错误目标断言（Charizard误认Charmander）已修测试；额外旧 `test-save-gates7.cjs` 为48pass/8fail（均缺本树 `js/reactor_core.js`），不补超范围依赖、不修改旧套件/断言，后续限定 runner 不包含该额外宿主套件。它的宿主验证受环境阻塞，不能写通过。固定候选 SHA、最终实测命令/exit/count 与稳定证据封印见本批外部作者报告。

## OPEN：后继共享窗口

1. 父端协调 B 最终基线后，在 App/Store 正常预览→确认路径复核权威当前快照、操作锁和完整 save/content 校验；保原始持久文件与收据后才安装/写入，备份/收据任一失败不能半提交。不得直接写 `$gameSystem`、加载即迁、自动 Continue 或新增持久 schema/ledger。
2. 通过真实 Store、MZ 序列化/槽位/普通 Continue 重启证明原始备份与外置收据、失败原子和重复幂等。纯 JSON 返回值不算 MZ 支持。
3. 公共导出/SDK、正式 CLI/宿主迁移入口与 `scripts/test-headless.sh` 注册等待共享写入窗口；建议注册本目录三个 `test-*.cjs`，不能先拿当前未注册状态宣称 CI 覆盖。
4. 全 quick、全 SDK/消费者、完整插件、NW/Docker/跨平台及完整产品长测本批未执行；独立 ultra、CI、推送/合并均未执行。没有自签通过。

外部 C：`/Users/dingshinn/Desktop/pokemon-framework/.verify/ruby-ts-differential-20261029T093035Z/friendship-exclusive-sol-xhigh-20261030T041032Z`。作者最终报告 `AUTHOR-RESULT.zh.md`；不更新共享 STATUS/PARENT-checkpoint，不封印 CLI 最后回写的 final.md 或运行中顶层 stdout/stderr。

## 2026-10-30 后继组合接线

App/Store/MZ及作者目录入口已在独立后继树实现，具体目标写集、预览确认、prepared原字节包/收据、显式恢复、SDK和测试入口见 [友好度存档接线](friendship-save-integration.zh.md)。上文OPEN及48/8描述是原纯批次的历史范围，不覆盖或改写其封印；组合作者结果与独立ultra仍须分别核验。
