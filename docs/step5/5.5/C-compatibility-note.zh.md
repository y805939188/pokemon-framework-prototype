# C兼容与升级提醒：当前技术登记

本文补充已有C实现说明，不改C算法、默认ID、开关值或System，不签本轮新C业务／参考等价／NW。c08 Claude只读报告 `cdecf58e57ef7e8d5ee5e5ea6076b9bfa2e104da34d9e7ff83bff2b8fc82e47d` 为 PASS_SCOPED_STATIC_REVIEW，无P1/P2；三个P3按下列当前源事实登记，不把旧报告的时点说明扩大到后继。

## 31/32生成开关保留

[config默认值和范围](../../../src/framework/rules/config.ts)分别给 `SHINY_WILD_POKEMON_SWITCH=31`、`FATEFUL_ENCOUNTER_SWITCH=32`，接受非负安全ID，0关闭对应规则。作者内容源 `settings.json` 是规则名到值的裸对象，由正式内容编译器 checkOverrides校验；合并以下配置可关闭两项，保留已有其它规则：

```json
{"SHINY_WILD_POKEMON_SWITCH":0,"FATEFUL_ENCOUNTER_SWITCH":0}
```

普通、钓鱼、Sweet Scent及canonical generated在物种/等级已确定后走[共用完整创建阶段](../../../src/framework/app/wild-generation-preparation.ts)：先取受控开关，后进入生成RNG。31在原随机重试／首队修正／A登记后强闪，不省原draw；32在创建上下文写fateful并得到origin.method4。given不重新生成，旧StartBattle保持历史创建语义，不从这两入口反推它们已接完整生成开关。

[原生读取器](../../../src/plugins/world/wild-generation-facts-mz.ts)只读own-data槽：合法稀疏缺槽、null、undefined为false，boolean保真；数字1、字符串等非boolean或accessor/Proxy不转换成false/true，而是拒绝整次生成，发生在生成RNG前。0只关闭该条规则，不替代其它世界事实或权限检查。原生 `value()` 的truthy语义不能覆盖此严格边界。

样例System中31/32名称为空不证明项目没用过它们；已有剧情将它们置ON会误触强闪／fateful。升级时应先确认用途，分配独占ID或设0。本文不自动命名System、不改开关值、不查看玩家状态。

## 正版本枚举保留v0，与单表回退区分

正式WP36§3.1与WP62§5.3登记参考枚举反例：v>0时，即使同图已有v表，v0仍参与枚举。当前[dexArea](../../../src/framework/rules/pokedex-query.ts)保留该兼容行为：接受当前版本，且正版本另外接受0；同图v0含X、v1不含X，版本1的Area仍可能由v0点亮。隐藏、当前地理区域和可见Point等门仍生效，结果格去重；这不是把单次精确查询／未命中再回退0改成枚举，也不是所有查询都回退。

这已不是当前“无consumer”状态：真实App的 `pokedexArea` 经原子game/Content/native快照进入[projectPokedexArea](../../../src/framework/app/pokedex-area-query.ts)，把正式world.encounters/regionMaps/mapMetadata投影给dexArea。7c 的 E3 独审覆盖 Area 生产 provider 及具名无头用例。c08报告的“尚无consumer”保持其固定c08静态边界；本文不把后继76 unique／77执行、支持5或383/7503称作本轮重跑，更不代NW/XHR/真实资源通过。

本登记沿用正式规格的兼容技术选择，未修正枚举算法、未宣称新参考运行等价。归档README的“复刻/修正待登记”保留归档时点，这里登记当前实际行为和影响；不是另行豁免、延期或改变范围。若未来改成仅精确版本枚举，须另记产品兼容决定及相应验证，不能在本busy整改暗改。

## 其余静态观察

A域合法fallback与未知资格拒绝按[C当前说明](C-current-candidate.zh.md)及实现分域，注释不充当全部A域已验证的证据。持物tier单元素仍可请求draw(1)，与逐位相同池单元素免draw是不同分支；不为统一前缀而改oracle／抽样。严格boolean边界见上。以上只登记静态边界，不新增P5边际，不改12kernel、47动作／tapes或N/m/alpha/seed/阈值，不运行原版或对照。
