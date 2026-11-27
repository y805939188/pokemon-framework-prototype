# 野生个体生成、角色开关与兼容

## 31/32生成开关保留

[config默认值和范围](../../src/framework/rules/config.ts)分别给 `SHINY_WILD_POKEMON_SWITCH=31`、`FATEFUL_ENCOUNTER_SWITCH=32`，接受非负安全ID，0关闭对应规则。作者内容源 `settings.json` 是规则名到值的裸对象，由正式内容编译器 checkOverrides校验；合并以下配置可关闭两项，保留已有其它规则：

```json
{"SHINY_WILD_POKEMON_SWITCH":0,"FATEFUL_ENCOUNTER_SWITCH":0}
```

普通、钓鱼、Sweet Scent及canonical generated在物种/等级已确定后走[共用完整创建阶段](../../src/framework/app/wild-generation-preparation.ts)：先取受控开关，后进入生成RNG。31在原随机重试／首队修正／形态登记后强闪，不省原draw；32在创建上下文写fateful并得到origin.method4。given不重新生成，旧StartBattle保持历史创建语义，不从这两入口反推它们已接完整生成开关。

[原生读取器](../../src/plugins/world/wild-generation-facts-mz.ts)只读own-data槽：合法稀疏缺槽、null、undefined为false，boolean保真；数字1、字符串等非boolean或accessor/Proxy不转换成false/true，而是拒绝整次生成，发生在生成RNG前。0只关闭该条规则，不替代其它世界事实或权限检查。原生 `value()` 的truthy语义不能覆盖此严格边界。

样例System中31/32名称为空不证明项目没用过它们；已有剧情将它们置ON会误触强闪／fateful。升级时应先确认用途，分配独占ID或设0。本文不自动命名System、不改开关值、不查看玩家状态。

野生持物池按规范 ID、列表长度与每个位置的重复项比较，不能排序、转集合或去除重复。若多个池完全相同且包含多个选项，从第一个池按原出现次数抽取。给定完整个体时保留作者提供的身份与资料，不能重抽。

`FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS` 为 true 时黑笛加、白笛减 1 至 4 级。先处理基础等级和队首修正，再抽一次幅度，即使已在 1 或 100 边界仍抽后钳制。两个等级标志同真时 lower 优先。false 时改遭遇概率，黑笛将概率减半、最少步数加倍；白笛将概率乘 1.5、最少步数减半。各标志独立，使用笛子只设相应标志。新游戏、读档和真实跨图清除，同图显式传送保留。
