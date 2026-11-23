# C：给定完整野生个体入口（增量）

`GameApplication.startGivenWildBattle({ battleId, seq, member, ...flags })` 接受当前持久 `Member` 的完整普通数据。它验证结构、当前 Content、形态资格、道具映射及 ID 冲突，隔离副本后复用既有 Session、结果提交和接收流程。它不调用个体生成器、业务随机、创建上下文或来源时钟，不重新决定 PID、IV、性格、性别、闪光或形态。战斗种子及 Session 内部随机仍按原战斗合同使用。

MZ 事件的脚本（355）可调用：

```js
PSFlow.openGivenWildBattle({ battleId: 'author-given-1', seq: 1, member: myCompleteMember });
this._psBattleId = 'author-given-1';
this.setWaitMode('psBattle');
```

完整个体必须在调用前由作者提供；错误数据拒绝，不补造或重生。常规战斗 flags 与 `initialField` 可放在首个输入中。第二参数沿用现有演出配置；如需当前地图场地，第三参数使用现有事件字段，例如 `{ defaultWeather: 'inherit', defaultTerrain: 'none', battleEnvironment: 'inherit' }`。第三参数和首参数 `initialField` 不得同时提供。省略或空白天气保持 `none`。此脚本入口经过既有真实事件场地 latch、私有预留及 Scene handoff，不能以结构相同的对象伪造许可。

该增量入口不改变旧 `StartBattle` / `startBattle` 的历史 species+level 创建；完整 WP36 生成使用新增 canonical `PSFlow.openGeneratedWildBattle`，不把旧入口冒称已统一升级。等级模式黑笛提高、白笛降低1–4级已有授权，是项目设计选择而非已证明的参考逐色等价，见 [C 当前候选](C-current-candidate.zh.md) 与 [兼容登记](C-compatibility-note.zh.md)。捕获后实际球、战斗状态、接收首招和存放治愈仍按原合同更新；稳定个体身份及原属主保持。新测试是定向无窗口验证，未代表 NW 或人工验收，尚需最终套件登记及整合回归。
