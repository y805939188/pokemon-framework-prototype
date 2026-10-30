# 六操作参考对象身份：独立诊断门

只接收Git对象元数据，不读取Ruby源/adapter/raw，不执行Ruby、外部CLI或源导出。冻结target仍8c5911e4a4b07b07e832e4bb0d5d8859e88b4a9b；本批不是来源审计或原版等价。旧readiness gate及8c业务kit/输入/映射不改。

公共单文件 `/Users/dingshinn/Desktop/pokemon-framework/.verify/ruby-ts-pre54-observation-8c9951c-20261030/identity-public/reference-object-identity.json`；这是原public/control的独立兄弟目录。O仅可写该文件，不能向原readiness闭合schema塞新字段。root是父clean可信调用参数，不能接受O任意提供的新根；准入核路径/链接/写所有权纪律，不宣称OS沙箱。所有原始Git命令/错误/路径留O私有根。

按identity.schema.json精确字段发布：固定protocol/observerRunId/candidate/freeze/request/targetObjectSHA/targetTag；status=OBSERVED或BLOCKED、code闭合枚举；facts.target的exists/objectType/peeledCommitSHA；facts.tag的exists/objectType/objectSHA/peeledCommitSHA；facts.headCommitSHA；rubyExecuted必须false。未知exists用null/type unknown/hash null，已知不存在用false/missing/null。hash必须40位小写非零。没有free text/路径/堆栈字段。

OBSERVED表示查询事实已取得，不是目标已合格。不同tag或当前HEAD不造成自动拒绝：存在的固定commit可以与tag/HEAD不同，tag缺失也可作为真实诊断事实接收。tag或commit的peel语义必须自洽；同一ID不能报两种类型；missing不能同时被其它已观察commit事实证明存在。BLOCKED须非NONE原因码；未知/未完成peel不得冒作OBSERVED。关系由接收器计算，不接受agent自签匹配字段。

schema SHA256 `9a929f1e0ef6f53fef214d69743e7cf2b8fc2f1ae4508fe84d63ef0e162deb44`；receiver SHA256 `3802dc7cac21d75f2c1b544e66a365c3e90811941da111971311e0ee909fb4cd`。固定候选的两个哈希必须由父端带外取得，不能O改schema后现算现信。生产调用：

```sh
/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node /Users/dingshinn/Desktop/pokemon-framework/.worktrees/ruby-ts-pre54-identity-only-20261030/experiments/differential/identity-only/receive.mjs --public-root /Users/dingshinn/Desktop/pokemon-framework/.verify/ruby-ts-pre54-observation-8c9951c-20261030/identity-public --expected-schema 9a929f1e0ef6f53fef214d69743e7cf2b8fc2f1ae4508fe84d63ef0e162deb44
```

裸Node22.21.1，无NODE_OPTIONS/NODE_PATH/execArgv；文件/目录无链接、无硬链接，单文件最大16KiB，严格JSON/UTF8、有界fd快照，失败只输出固定代码。missing=exit3、拒绝=exit2、结构/语义有效=exit0（包括合法BLOCKED事实）。实际文件SHA随收据返回；父clean必须自己执行，不能读取O原答复或相信自测。

成功输出始终sourceQualificationAccepted=false、referenceTargetChanged=false、readinessGateChanged=false、realRubyExecutionAccepted=false。对象关系匹配不自动关闭SOURCE_PIN_MISMATCH，也不允许改legacy字段冒充另一类对象。后继若需身份模型修订，独立小批审查后决定；固定target导出及实际加载/执行证据仍由O生成、A审计。

本批自测全为INFRASTRUCTURE-SELF-TEST，不包含本次观察值；不从旧公开growth记录填当前事实。命令 `node --test --test-reporter=tap experiments/differential/identity-only/test-identity-only.mjs`。本模块只复用既有严格JSON/schema校验库，没有改旧门或加入通用框架。
