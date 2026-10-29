# Ruby / TS 首批对照：选择分母与证据边界

本文只说明本轮两个历史能力的输入选择和执行状态，不是独立验收或原版等价结论。完整逐行 caseId 映射冻结于 `experiments/differential/requests/selection-coverage.json`，其 requestHash 与 `requests/wp30-r2.json` 一致；run-kit 重建会逐字段再生比对并封印文件 hash。

## 正式来源与分母

- WP30 `deliverables/final-specification-set/creature-rpg/wp30-growth-learning-and-friendship.md` §§3.1–3.2、7.2–7.3；它是静态规格，不是本轮运行证据。
- r2 `BOUNDARY-MATRIX.zh.md`，SHA-256 `c07907c053b5c4ac4a91e93f73611e3c5a8785967102b2dc05aebfc8edb68f7f`。
- r8 `planning/implementation-routing/r8-20261017/` 的 736 routing 单元及其中 FR/WP 追溯。它们用于功能分母和边界追溯；本批不重算全 WP30、FR 或 routing 覆盖率，也不用测试条数充当百分比。
- `docs/step3/differential-growth.md` 的历史 growth 3504 仅列 frozen replay，不属于本轮 actual dual run。

## 固定选择

| API / 能力 | 选择分母与边界 | 冻结 case 数 | actual dual run |
| --- | --- | ---: | --- |
| growth `minimumExpForLevel` | 六曲线；默认 max100 的 L1..100 全表 600 格；max50/100/101 接缝、阈值派生输入及非法等级另列 | 858（含 18 额外域） | 0 / NOT_RUN |
| growth `maximumExp` | 六曲线 × max50/100/101 共 18 配置格 | 18 | 0 / NOT_RUN |
| growth `addExp` | 每曲线×每 max 的零/正常/上下钳制/负增量/饱和；另有由同一产品 API 组成的重复序列 | 198 + 36 组合序列 | 0 / NOT_RUN |
| growth `levelFromExp` | 六曲线×三 max 的阈值±1、指定接缝和固定经验锚点；空/负经验另列 | 960（含 36 额外域） | 0 / NOT_RUN |
| friendship `change` | 13 方法 × 13 初值 × 16 配置（地图2×球2×铃2×AFFECTION_EFFECTS2）；每方法 208 个共同合法域输入 | 2704 共同域 + 28 额外域 | 0 / NOT_RUN |
| friendship `affection` | 正常 friendship 0..255 全域，含 99/100、149/150、199/200、229/230、254/255 | 256 共同域 + 3 额外域 | 0 / NOT_RUN |
| friendship 具名序列 | 99/100、178/179 软限、199/200、255 上下变化、0 下钳；逐步骤保留 before/after | 5 | 0 / NOT_RUN |

growth 产品 API 分母是四，不把 `addExpSequence` 组合操作冒称第五个产品 API。合计请求为 5,066 case，其中共同域 4,981、额外/拒绝域 85；数量只是执行完备性分母，不是功能覆盖百分比。

Fluctuating max101 的 L100→L101 登记非单调以及 Erratic/Fluctuating 表外公式只作定向边界检查。不对 max>100 套全域经验单调性或反函数性质。

## 状态口径

作者真实 TS 子进程已对同一冻结请求产生 5,066 个协议完整 outcome，正式 TS/基础设施自测会重跑此矩阵；这仅标 `TS author self-test`。独立 observer、原版 Ruby 和 actual dual run 均为 `NOT_RUN`，approved divergence 为 0，host unsupported 尚未评估。缺端、gate 失败、过程失败、timeout、case 不完整或缺 provenance/hash 都不得转为 PASS。

本批只含 growth 四 API 与确定性的 friendship change/affection 投影，不包含行走机会抽选、学习替换、完整战斗/获得/进化流程或 WP30 其他能力。真实差异不自动批准；历史 frozen replay、TS 单端、自测合成 reference 和未来 actual dual run 始终分列。

本投影比较精确 JSON 数值，不保存原数字词法，也不比较 Ruby `Integer`／`Float` 运行时类型身份；`1`、`1.0`、`1e0` 的数值相同是已定义的有限合同，不代表原生数值类型等价。以后若需要该类差异，另定 schema／freeze，不悄改本轮输入或映射。数值下溢、负零、unsafe 值或十进制身份丢失仍拒绝；friendship v2 载体对支持的分数、域外状态只保留原值，不夹紧、舍入或消差。

第一批 d9 与 carrier789 的旧结果保留为历史设施证据。新增来源／harness／Node 装载环境反例已暂停旧 PASS 作为后继发布准入；必须在整改后的新 SHA、kit 与外部 freeze 下独立复审，再由隔离 observer 安排真实执行和来源审计。格式资格的27条额外域记录不是已接受的双端覆盖。非占位元数据门和报告中的来源字段便于审计，不替代观察侧证明真实文件加载、替身边界及原始结果关联。

设施套件会保留每次独立输出（含失败），通常约一分钟并产生约百 MiB 证据，不能沿用早期 quick 自检约十秒的估计。评审／CI 应显式指定全新 `DIFFERENTIAL_TEST_ROOT`，结束后按证据保留规则人工归档或可恢复清理，勿自动删除失败。
