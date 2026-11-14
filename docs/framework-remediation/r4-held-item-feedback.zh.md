# R4 常见持物反馈整改（2026-11-14）

承接 `2c365d5`，核对 Claude R4 对 `d47c092` 的复审及固定 Showdown 7244fe8 的实际事件。R4 表中为7种不同正常速度场景、8次成功执行（N两次），不是8种不同场景。

`-enditem [eat]` 明确表述吃掉树果；`-item [from] ability: Frisk` 表述察觉到原有持物；原生无来源 Air Balloon 的开场／结束表述浮空／破裂。Trick 转移仍表述获得，Knock Off 仍表述打落，`[silent]` 先行保持静默。英文所有权撇号统一 ASCII。不改变协议、持物状态或台账。Frisk、Balloon、Sitrus 均有真实 Gateway 生产事件断言，英中测试断言具体语句，不只断言非空。

Full Restore 只消除状态且回复0时只显示使用，不显示“恢复0”；有正回复时保留准确数字。日志按本场编译内容的作者 nameKey／name 查询显示名，缺失时回退已有翻译或原生显示文本。五种常用药补标准英文回退词，以避免 Fullrestore 等拼接ID；这不是全道具／全语言本地化。真实编译 Scene 测试覆盖作者自定义名、翻译key和 Full Restore。

非消耗HP物品的真实扣除另见[合同边界](authored-hp-healing-contract.zh.md#r4-非消耗主动治疗边界2026-11-14)：本批给出编译 warning，未实现可重复使用战斗物品。

新增20项定向测试先在旧运行时得到3通过／17失败；修正后相关144项通过，typecheck及完整build通过。最终固定候选、regular与NW实绩、失败原件和验证边界由本地 `build/r4-feedback-remediation/REPORT.zh.md` 记录，未完成前不预填绿。作者复核不等于另一AI独审，后继Claude复审仍需父协调安排。


## 最终本地验收回执

固定产品／测试 `123590fbb68f25f74f4ee440c3b83a48c455045d`，tree `c44a497396be0d9d71c558cc98ccd569bee6f045`，src `a002b32f533b8b9fe8d52a4e99edb9102fda70d0`。完整typecheck／build、144定向通过；PF_NO_SKIP=1 regular **296唯一套／5388项通过，失败／取消／跳过0、exit0**，runId `7e935ebc-0136-425f-ad39-e037f0d827ce`，before／build／after dirty=false，正式列表逐序匹配，末尾及另行binding verify通过。冻结参考回放EXCLUDED NOT RUN，不计绿，无新CI。

正常速度NW最终两场全过，consoleErrors=[]，各胜利commit=applied且只一次；树果／Frisk／气球事件与FullRestore满血清状态、正式库存扣一均核实。只用合法合成作者数据与披露初始状态，可信CDP键盘，非实体输入；中文只有headless／Scene文本证据。正式七模式all64/64、verify-save4/4、step5-*各1/1、held11/11、held-continue6/6、battle-entry10/10均exit0、无超时，最终NW0。

[完整本地报告](../../build/r4-feedback-remediation/REPORT.zh.md) SHA256 `5d469936c6054e5878a350a617b12425c63331adf5b40450af8ded0d4151d0d8`；原3/17、18/2、三次自建正常速脚本失败及最终两场绿、完整regular绑定与七模式均原件保留。此前633份封印证据复验未变，R4原报告不变。FINAL-RECEIPT及EVIDENCE-SHA256同目录；勿在已封印目录重跑覆盖。

O-3并非行为修复：合法非消耗主动HP道具仍在战斗扣除一件并用内建效果；仅新增明确编译warning及可用配置选择，重复使用战斗语义仍未实现。作者逐段自检不是另一AI独审；仓库限制Sonnet5.5而工具不提供，后继Claude固定候选独审待父协调。本提交之后只有回执文档，不更改受测产品／测试。未push／PR／merge，主检出main03f7e54保持干净。
