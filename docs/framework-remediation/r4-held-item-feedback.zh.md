# R4 常见持物反馈整改（2026-11-14）

承接 `2c365d5`，核对 Claude R4 对 `d47c092` 的复审及固定 Showdown 7244fe8 的实际事件。R4 表中为7种不同正常速度场景、8次成功执行（N两次），不是8种不同场景。

`-enditem [eat]` 明确表述吃掉树果；`-item [from] ability: Frisk` 表述察觉到原有持物；原生无来源 Air Balloon 的开场／结束表述浮空／破裂。Trick 转移仍表述获得，Knock Off 仍表述打落，`[silent]` 先行保持静默。英文所有权撇号统一 ASCII。不改变协议、持物状态或台账。Frisk、Balloon、Sitrus 均有真实 Gateway 生产事件断言，英中测试断言具体语句，不只断言非空。

Full Restore 只消除状态且回复0时只显示使用，不显示“恢复0”；有正回复时保留准确数字。日志按本场编译内容的作者 nameKey／name 查询显示名，缺失时回退已有翻译或原生显示文本。五种常用药补标准英文回退词，以避免 Fullrestore 等拼接ID；这不是全道具／全语言本地化。真实编译 Scene 测试覆盖作者自定义名、翻译key和 Full Restore。

非消耗HP物品的真实扣除另见[合同边界](authored-hp-healing-contract.zh.md#r4-非消耗主动治疗边界2026-11-14)：本批给出编译 warning，未实现可重复使用战斗物品。

新增20项定向测试先在旧运行时得到3通过／17失败；修正后相关144项通过，typecheck及完整build通过。最终固定候选、regular与NW实绩、失败原件和验证边界由本地 `build/r4-feedback-remediation/REPORT.zh.md` 记录，未完成前不预填绿。作者复核不等于另一AI独审，后继Claude复审仍需父协调安排。
