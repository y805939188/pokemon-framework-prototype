# 共享 home 参数合同

CharacterHome / GlobalHome 仍为同一JSON作者输入，只解析一次。旧合法三字段 {mapId,x,y} 继续接受，完整location补direction=2；这是本框架旧参数兼容政策，不声称正式净化规格定义了旧三字段的失败回程默认。显式第四字段direction只可2/4/6/8，坏值拒绝，不能降为2。额外字段/访问器/Proxy/未知参数源拒绝且不执行getter；JSON null也不是无home。

空字符串或缺少home字段代表已获得配置源、该home确实未配置，投影为null。参数源本身undefined/null/错误对象或getter不是null配置，返回明确错误；不静默走nohome。无效上层home不能落入较低优先级。角色与全局均有效时，正式App规则保最近中心→角色家→全局家；本解析器不授资格、不选择业务目标。

travel投影只含mapId/x/y，避免给严格WorldPoint泄露direction；Teleport仍按既有规则在最后构造direction=2。blackout投影取同一次解析的完整四元组，保显式方向。两个投影及来源对象冻结。

StartingOverSwitch缺省/空字符串为正式WP02默认1，显式值须正安全整数（仅字符串或数字，无对象强制转换）；错误不是未配置。元数据暴露原生switch参数，未来唯一F安装器把该数交表现helper，不在此安装Fhost。

当前窗口仅parser、元数据和真实WorldTravel factory两个投影的有限配置测试，完整F/collector/伙伴清理/非转移nonce/两helperP2仍不由此验收。

参数源进一步限定普通记录：直接null prototype字典合法；其它来源必须有其自身realm的规范Object.prototype（原型父级null、own data constructor、构造器不可借用的prototype回指及intrinsic Object函数源）。不使用本realm prototype相等限制跨realm输入；不读取Symbol.toStringTag/getter，不运行来源构造器。Date/Map等常见内建实例源明确unavailable，不能变为无home；此函数仅验证参数字典，不用于SceneManager/DataManager等MZ namespace。
