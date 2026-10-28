# 框架整改第五步：组合验收入口与适用边界

> 本文只固定范围、命令和外部结果入口，不记录会变化的候选 SHA、实测数值或通过结论。最终结果必须以本批 author 的外部报告为准；本文本身不构成任何 PASS、独立复核或 5.4 开工批准。

## 1. 范围

本批是已批准 v1 技术目标、v2 五步流程及 v2.1 最小合同的**整改第五步组合验收**，不是产品 5.4、5.5，也不是性能/内存、Ruby 或无头 UI 平台。

- A：production/testing/legacy 入口、CJS 分发、声明、仓库外消费者及六种加载顺序。
- B：实际 import 解析、类型、边界、构建、Node 与宿主的一致性及歧义 fail-closed。
- C：应用 facade、查询/获得/接收、完整事务状态和既有高风险反例。
- D：真实 MZ 的正常 sample、显式 fixture 冷路径/ResetGame、获得/战斗/成长/捕获/治疗和 affected owner 恢复。
- E：固定清洁 SHA 的新离线包、正常 Title→Continue→Scene_Load、完整状态恢复及有真实 claim 的防重放。
- F：命令/迁移/适用边界、精确身份、失败归因和未决风险交付。

最终候选交独立 sol ultra，不由作者自批。精确 CI 和后续整合由协调者另行处理，本批不 push/merge/APPROVE。

## 2. 稳定命令与产物位置

作者证据根：

```text
/Users/dingshinn/Desktop/pokemon-framework/.verify/framework-remediation-step5-integration-20261028/author
```

固定提交后，以 `FINAL_SHA` 创建独立 `candidate-fixed-src`，复制 main donor 的本地锁定依赖；main 只读且不构建。完整 quick/type/boundary/build/distribution、外部消费者、六种加载顺序和静态 import 清单均在该固定检出运行。Showdown staged `custom-formats` 必须由当前构建复制并 `cmp`，不联网安装。

真实宿主沿用现有 runner：

```bash
PF_OWNED_BACKGROUND=1 PF_OWNED_SKIP_BUILD=1 \
  scripts/run-inventory-test-mac.sh <新证据目录> step5-fixture
PF_OWNED_BACKGROUND=1 PF_OWNED_SKIP_BUILD=1 \
  scripts/run-inventory-test-mac.sh <新证据目录> step5-sample
```

包内运行额外设置：

```bash
PF_OWNED_NW=<APP>/Contents/MacOS/nwjs \
PF_OWNED_PROJECT=<APP>/Contents/Resources/app.nw \
  scripts/run-inventory-test-mac.sh <新证据目录> <step5-fixture|step5-sample>
```

正常恢复进程必须绑定同一 producer：

```bash
PF_OWNED_EXPECTED=<成功的 pkg-sample 证据目录> \
PF_OWNED_SAVES=<该目录的隔离 saves> \
PF_OWNED_NW=<APP>/Contents/MacOS/nwjs \
PF_OWNED_PROJECT=<APP>/Contents/Resources/app.nw \
  scripts/run-inventory-test-mac.sh <另一个新证据目录> step5-continue
```

runner 使用共享锁和自有 PID/PGID；不得启用 `PF_OWNED_REQUIRE_IDLE`，不得使用全局 ps/pgrep 或默认用户存档。profile/save/expected 必须在 author 下。超时只终止自己的精确 PGID，所有实际 exit/signal/timeout 均保留。

## 3. 场景合同

### `step5-fixture`

在真实 `Scene_Boot.start` 前只对测试插件参数注入 `contentSource=fixture`，随后验证 testing 冷加载、缓存和两次 `PSFlow.resetGame()`：合法三成员 fixture、无 TypeError、无 sample/legacy fallback、无重复成员或残留 owner。该场景不证明正常游戏应使用 fixture。

### `step5-sample`

使用默认编译 sample 和正式空新游戏，不得先 ResetGame 或隐式退 fixture。真实 Map005 starter 事件领取一次并确认重复领取不变；真实野生遭遇完成成长和实际菜单捕获，再经护士事件治疗并写普通可见槽 7。

明确披露的编排仅包括：自动接收 `{mode:1,naming:1}`、固定 RNG/battle seed/fast、starter exp 临界值、一个大师球、治疗前 HP/status/PP，以及后续图鉴 UI 所需资格和全国视图。它们不是隐式 fixture 内容，不是实体输入，也不表示完全无编排自然游玩。

### `step5-continue`

必须是另一个新进程，以正常 Title 命令和 Scene_Load 选择同一普通槽，不得只用 `DataManager.loadGame` 代替，也不得注入 expected content/state。完整队伍/盒子/背包/金钱/图鉴/claims/ledger、MZ/map/seq 必须一致。

同一进程还包括：

1. 图鉴 down/up/关闭往返与只读 snapshot，完整状态强相等且 owner 释放；
2. 真实跨帧队伍→摘要→返回，保持同一 parent，完整状态强相等且 save lock/owner 释放；
3. 背包打开→取消→返回，完成自己的 cancelled handle，完整状态含导航字段强相等；
4. 真实 starter 事件 `already-claimed` 和原 battle result `already-applied`，不得重复发奖、扣物、改图鉴/统计或重写保存槽。

若未来出现合法导航变化，必须逐字段列出并断言预期 delta，禁止广泛归一化掩盖业务变化。

## 4. 稳定风险边界

- 总体同步性能、五项 canonical 计时 WARN、Renderer/summary-dex 归因继续 OPEN。
- CPU profile、instrument-off 相邻对照、allocation stack/native owner 及仪器分配影响缺证；appRSS 仍 UNKNOWN。
- active 23→23、null 39→739 不是无泄漏证明；本批不新增通用性能探针或清 WARN。
- Ruby 新增执行仍为 0；FINAL-INPUT、实体键鼠和适用原生 IME 仍 NOT_RUN。旧 F02 等状态不变。
- 5.4 正式依赖仍是 5.1 持物契约、5.2 徽章、5.3 战后进化；持物双门保持关闭。P-3 是 5.4 前 AI 快照原型，P-4 是 5.4 正式战斗场景骨架在加演出前的 100 场内存/帧时间门，本批均不代替。
- D5-8 的 +20% 与 100 场 7.2MB 是 WARN 而非硬阻断；缺 P-4/5.4 所需测量也不能写成 PASS 或自动延期。

## 5. 外部最终结果入口

执行结束后仅阅读下列本批 author 文件获取最终 SHA/tree、命令/exit、产物身份和实际结论：

- `author/DELIVERY.zh.md`
- `author/CANDIDATE.json`
- `author/VERIFICATION.json`
- `author/FAILURES.zh.md`
- `author/final-evidence/`（库存、diff、hash、封印）

允许的交付状态只有 `READY_FOR_INDEPENDENT_ULTRA` 或具体 `BLOCKED`。文档不得反向把这些外部结果预写为已通过。
