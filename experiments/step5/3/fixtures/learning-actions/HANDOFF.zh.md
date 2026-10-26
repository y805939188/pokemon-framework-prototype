# E3 学习动作纯计划叶（作者自检候选）

基线为未最终接收的 E2a 候选 `821ee885939b81e4c8bd072409d638b2f7d231a6`，本叶不证明其接收或整体 E／M1／5.3。分支 `step5/3-E3-learning-actions`，独占工作树 `/Users/dingshinn/Desktop/pokemon-framework/.worktrees/step5-3-E3-learning-actions`。未修改共享入口、应用／库存类型／已有 C 或友好算法、配置、runner、插件、样例、golden、STATUS 或 dashboard。

## 实际入口

`src/framework/rules/learning-actions.ts` 只导出三个有限的计划函数及其值类型：

```ts
planTeachingAction(member, content, source, context, answers = [])
planRelearningAction(member, content, { shadow: false }, answers = [])
planForgettingAction(member, slot?)
```

- `member` 是真实成员或 incoming draft 的 `Readonly<Member>` 副本，可为 null／undefined；没有 party lookup、ID 分配、owner、锁或日志。实际成员／草稿 discriminator 及答案绑定由 root 应用持有。
- teaching source 为 `{kind:'generic'|'tutor',moveId}` 或 `{kind:'machine',entry:'bag'|'party',itemId,inventory}`。机器分类／招式／消费由实际 catalog 的 `fieldUse`／`move`／`consumesItem` 读取，不按物品名字、前缀或技能显示名猜。
- teaching context 为 `{shadow,friendship,friendshipSource}`。`friendship` 复用 `FriendshipContext` 的 `mapId`／`AFFECTION_EFFECTS`，`friendshipSource` 复用 `Omit<FriendshipMember,'friendship'>` 的实际 ball／item／origin 类型。root 在操作时点解析身份与地图并传入；当前 friend 从本次待更新成员取，不接受另一个旧 friend 值。当前产品调用显式传 `shadow:false`。
- teaching／relearning ready 携带完整 `member`，机器另携带完整 `inventory`。`effects` 保留 C 的解释：其中资源及 machine friend 意图已合入以上副本，**只有 statistics 是待 root 应用的差量**；不可重复扣物或加 friend。`friendshipChanges` 是实际共享友好规则的计算结果。普通放弃可 ready 无变化，root 可据 learned outcomes 判断成功。forgetting ready 同样携带完整成员。
- pending／refused／empty／exited／cancelled 没有 patch、member、inventory、state 或 effects。所有输入不变，ready 的嵌套成员／库存字段不与输入别名。

## 语义与已知数据边界

直接复用 `planLearningQueue`、`planMoveForgetting`、`planRelearning` 与 `planFriendshipChange`，没有第二套学习／友好算法。满槽机器成功替换才计算 machine friend；空槽256保值成功，满槽256整次拒绝且没有可安装副本。新槽／普通替换满 PP 和 ppUps0；配置保留机器旧 PP 仅作用满槽替换。Bag TR 成功按身份去重追加 firstMoves 并计机器统计，Party TR 不追加、不计该包装统计；两者都按真实消费属性扣量。独立遗忘允许 HM，最后一招拒绝；历史零招可查看与学习。提醒保留 C 三层取消与 nullable／空候选规则。

当前真实 `Content` 没有 `compatibilities` 或 egg move 目录。资格只按精确当前 form 的导师表／任意等级表证明；未命中时把 egg 来源传 null，返回 compatibility-unavailable，不能伪造已知 false，也没有增加新内容字段。root 已知此限制，后续若补正式蛋招数据须另接 typed 合同。display-name 表引用只做目录精确查找，机器和请求招式使用 canonical ID；HM 保护来自真实 HM catalog。缺精确 form 拒绝，不借基础形态资格。

## 实际验证

所有 Node 调用使用 `/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node`（v22.21.1）；pnpm 10.20.0 / TypeScript 7.0.2。工作树仅只读链接同锁文件的 `src/node_modules` 依赖，四包由本树自行生成，未复制其它作者的 build。测试用 Node 官方 TS loader 读取本树实际模块图；未为了测试更改公共 index。

详细原始证据位于工作区 `/Users/dingshinn/Desktop/pokemon-framework/.verify/step5-3-E3-learning-actions-4cb12d1/`。下列 `logs/` 路径相对此证据目录。12份原始 `.tap`／`.log`、12份同名 `.gz` 压缩副本及原交付说明已逐文件复制并核对 SHA256，gzip 解压字节与原件一致；`COPY-VERIFICATION.json` 记录来源与核验，`SHA256SUMS` 封印26个成员。原始失败未整理或重写。本地原始日志仍在工作树原位被精确忽略，仓库 fixture 历史只保留必要辅助代码与说明，不再新增运行输出；旧 `4cb12d1` 提交保留原压缩副本。

- `pnpm --dir src build:engine`：本树四包构建通过，`logs/build02.log`。
- `pnpm --dir src typecheck:framework`：framework／core／app 三项通过，`logs/framework02.log`。
- `node scripts/check-boundaries.cjs`：92 文件通过，`logs/boundaries02.log`。
- `node --test experiments/step5/3/test-learning-actions.cjs`：新增16项通过，`logs/target03.tap`；随后别名断言亦包含于最终组合回归。
- 新测试加已有 learning-candidates／learning-plans／friendship／friendship-adapters／CD-core-integration 五套：**93 PASS，fail／cancelled／skipped 全0**，`logs/regression02.tap`。
- 新测试实际调用编译→组装、C／友好规则、真实 Inventory API、createMember／newGame，并把 teaching→forgetting→reminder 的完整 ready 副本组合后通过 schema7 内容验证。此为纯组合状态验证，未安装到真实应用。
- `git diff --check` 通过。

首轮 `target01.tap` 保留 **13 PASS／1 FAIL**：关闭更多重学后候选实际为空，测试误期待 not-a-candidate；按 C 原有空列表＋额外答案为 unexpected-answer 修正期望。未修改生产规则迎合该测试。`target02.tap`、`regression01.tap` 为中间真实绿结果；没有覆盖旧红输出。

未执行全量 quick、NW／GUI、实体输入、CI、远端 push／PR／merge，也没有独立审查或 M1／完整 E 签收。root 需唯一持锁，在最终身份／资源／内容／generation 复检后，把成员、机器库存及统计同次安装；外层确认／菜单与可控技术终止仍由 root 应用处理。无当前工具／权限阻塞，无后台自有进程。请求编码 gpt-6.1-sol xhigh、Standard／nonFast；隐藏有效字段 UNVERIFIED。

本次后续交付整理只迁出12份受控运行输出并更新证据路径，生产源码、测试及 helpers 与 `4cb12d1` 逐 SHA256 不变；没有重跑或改写功能测试结论。原13 PASS／1 FAIL 和最终93 PASS均仍是原先的实际执行结果。
