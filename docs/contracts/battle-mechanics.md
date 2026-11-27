# 对战机制：可复查的功能边界

以下每一行只表示该条件下的行为，不表示对应大类的所有招式、引擎和宿主都已覆盖；两项无法在内置作者入口构造的前提也不外推给自定义 SDK。检索本页时可直接搜索招式、特性或道具名。

| 适用范围 | 条件与结果 |
|---|---|
| 局部规则 | 真实NPC施加Disable/Taunt后，编译Scene拒绝当前选择、PP/请求不被拒绝动作改变，再合法重选；Dig/Recharge仅单候选续行 |
| 局部规则 | Quick Attack优先于更高速Tackle；同优先级无修正/非平局时高速先行，两轮真实PP |
| 局部规则 | 在场/越界/已濒死的换入登记被拒，HP/PP/active保持且不遗留行动 |
| 局部规则 | 普通换人确认前不生效/可取消，真正switch先于对手move；真实位置恢复消费者在换入者上执行；开场携入状态身份 |
| 内置入口不适用 | 冻结sample/正式作者管线/标准App内置factory与默认固定引擎的源级入口闭包不触达Shift。 |
| 局部规则 | 物品事件先于普通对手攻击；真实毒伤终局/主结果提交与开场携入濒死/真实KO局部 |
| 局部规则 | 真实Grassy/Toxic与Sand/Toxic同轮组合、第五轮沙暴先自然结束再同成员毒伤，以及中止新战隔离 |
| 局部规则 | 固定初始weather/terrain/environment的数据与当前状态分离；all-none与省略输入的raw/PRNG/state一致；snapshot重绑定和合法入口 |
| 局部规则 | 初始普通/原始天气、原始天气拒普通覆盖、CloudNine压制时仍存原始门、合法原始替换/来源结束恢复、临时rain自然到期恢复sand及当轮残余一次 |
| 局部规则 | 临时terrain自然恢复默认，Defog/SteelRoller直接移除不恢复；四terrain恢复通知各一次、Mimicry真实回调、no-default及checkpoint重绑定 |
| 局部规则 | 有界作用域目录中普通StealthRock/Spikes/ToxicSpikes/StickyWeb侧记录的局部建立与消费者 |
| 局部规则 | 默认grassy经Defog实际直接清空且不重启；仅描述此Defog子合同。 |
| 局部规则 | 真实普通换入：岩、菱1/2/3层、一层毒菱普通毒及网降速；主结果一次安装、中止零写、新战旧岩不遗留 |
| 局部规则 | Wish跟随当前位置实际换入者、满HP到期不等待；HealingWish恢复HP/status而不补PP；LunarDance PP-only资格与中止新战隔离 |
| 局部规则 | 仅正式字面63行及有限72个语义链接的有效Gen8 flags与9个调用消费者静态关联；不是完整默认注册表或随机调用动态等价。 |
| 局部规则 | 固定Gen8的17 Plate/17 Memory/4 Drive共38字段映射及对应Judgment/Multi-Attack/Techno Blast本地消费者源绑定；只签数据/局部门，不签全部物种组合、合法作者取得或动态业务。 |
| 局部规则 | 固定Gen8的67条NaturalGift类型/基底字段映射及native局部读取/消费源绑定；只签固定表数据，不签每击当前持物重读、消费时点或U04多击链参考等价。 |
| 局部规则 | -A §2 lines21–55；当前基础/附加类型投影和§2.1四种原能力值操作有限样本。 |
| 局部规则 | -A §3.3环境消费者，限环境映射/场地优先、Camouflage/Nature Power/Secret Power。 |
| 局部规则 | -A §4 lines112–135；普通Protect伤害阻止及次回合解除，有限使用/PP与结果。 |
| 局部规则 | -A§5.1/5.3：Ghost/非Ghost Curse本次动态目标及MagicBounce单目标状态反射。 |
| 局部规则 | -A §6 lines177–212；Nature Power环境调用与Sleep Talk的调用PP/睡眠许可局部，Mimic临时槽隔离仅交界。 |
| 局部规则 | 仅字面33行的有效Gen8号令/安可排除flags与对应消费者静态关联，并保留非flag前门；不宣称最近招式记录、PP或期限已动态等价。 |
| 局部规则 | 仅固定Gen8的60个canonical不可移物组合与9种局部处理器变体（8函数+false常量）的静态绑定、局部门和具名差异；不签全部实际取物交互。 |
| 局部规则 | 固定578上游静态对照既有范围，加76126/69b/2ec同src的三RPG Item本场视图及RHI正向Fling30/30/10、native对照伤害/PRNG、指定guard/checkpoint/自然KO/一次安装；原058四案仅历史，Flower原生0保持，不签全。 |
| 局部规则 | -B §3.1（formal range48–95内Curse具名子条）非幽灵Curse分支，限速度−1/攻击+1/防御+1与原能力值分离。 |
| 局部规则 | -B §4 lines96–115；Disable/Taunt/Encore选择执行与永久PP/临时副本交界。 |
| 局部规则 | -B §6最后Transform子条，限临时类型/非HP能力值/PP与永久个体、学习、checkpoint/换回。 |
| 局部规则 | RolePlay获得Intimidate后的实际Start效果和同能力再次复制失败。 |
| 局部规则 | Intimidate/Clear Body及入场Drought/Primordial Sea与默认场域局部。 |
| 局部规则 | 敌源反射Growl实际降阶后的Defiant反应。 |
| 局部规则 | Mimicry实际TerrainChange回调/公开类型恢复。 |
| 局部规则 | 仅入场Intimidate原回调后显式故障的原错传播/独立Gateway部分变化，显式实验持物Leftovers残留回调故障的Session恢复，以及既有6项合成事务/broken防提交技术合同；普通入口与注入故障分列，不签全部能力阶段。 |
| 局部规则 | Tackle对Ghost免疫；WaterGun克制/抗性定性；Levitate/MoldBreaker局部；固定伤/强制会心遇Ghost免疫 |
| 局部规则 | 六次真实DoubleTeam至+6后固定seed一次Swift命中；ThunderWave→Ground无异常且免疫 |
| 局部规则 | StormThrow强制crit、ShellArmor阻crit且仍掉血、Ghost免疫时无crit |
| 局部规则 | 固定中性、无STAB/天气/场地/会心的物理/特殊基本数值。 |
| 局部规则 | Sturdy实际HP留1对照，以及编译Scene Protect HP、首击KO真实卡片HP/无晚到额外动作 |
| 局部规则 | 仅固定Gen8规则配置的支持/拒绝事实、Tackle/AuraSphere/Thunder/Toxic四个具名字段及实际静态消费者；独立开关缺口具名保留，不把世代号当全规则通过。 |
| 局部规则 | 正常免疫不被最小伤害反向击穿；固定伤/强制会心遇Ghost及无伤害Counter失败仍扣正常PP |
| 局部规则 | 114项归属表中RaiseUserAttack2与LowerTargetAttack1的两个具名普通阶级条目，由真实SwordDance/Growl消费 |
| 局部规则 | 31项目录中的BadPoisonTarget、SleepTarget及ParalyzeTargetIfNotTypeImmune以Toxic/Spore/ThunderWave有限行为映射 |
| 局部规则 | 附表§4的12项固定文本数据：具名ID、Type、Category及具体主效果入口对应；仅静态数据合同，不签12个机制行为或完整。 |
| 局部规则 | 真实Toxic/Spore/Glare异常、Poison免疫，真实App主战果、跨战状态；普通磁盘SaveStore+新Node与编译Scene卡片分列 |
| 局部规则 | 六种带入状态局部延续/清理、Toxic换人重置、真实状态跨战/治疗/中止、普通磁盘新Node、编译Scene开场身份与cant行为 |
| 局部规则 | 七次Growl得到-1…-6/-6、六个正下降事件及末轮atk0，总PP减7 |
| 局部规则 | 有界状态招式目录中的剧毒/电磁波、直接睡眠/普通麻痹局部：真实施加和Poison/Ground免疫 |
| 局部规则 | 普通攻击+2至上限及目标攻击-1、普通换人/新战清零、中止不写回 |
| 局部规则 | 强化实际影响后继普通伤害；非接力普通换人与新战清零、临时阶级不进入持久Member或result |
| 局部规则 | Poison异常施加被正常拒绝不改状态；攻击阶级至极值后的实际变化0；ESTA-03普通换人仅证明临时阶级清零、步骤前后未提前写持久状态及换人期间玩家招式PP不变，不推断携带异常状态换下。 |
| 局部规则 | 仅四个具名责任链接及对应已执行子合同：HitOncePerUserTeamMember→BeatUp两击，RandomlyDamageOrHealTarget→Present本次伤害分支，UserFaintsFixedDamageUserHP→FinalGambit/鬼免疫，HealUserFullyAndFallAsleep→Rest。 |
| 局部规则 | 仅None→中性伤害、StartGrassyTerrain→场域/限定terrain生命周期、SetUserAbilityToTargetAbility→-B主责及RolePlay共享能力入口证据的三条责任连接；不改主责、不重复计运行。 |
| 局部规则 | 覆盖§3：固定Gen8 NG准备消费→Jaboca反应→PB续击/单击三拓扑。 |
| 局部规则 | 整招/每击、中断，限普通单目标首击KO及PP/实际HP/无后继行动。 |
| 局部规则 | 普通多击及Dig/Hyper Beam蓄力、休息局部。 |
| 局部规则 | FixedDamageUserLevel、类型免疫、Counter实际本回合物理损失/失败局部。 |
| 局部规则 | AlwaysCriticalHit：请求会心覆盖，但先受不可会心门。 |
| 局部规则 | Recover/Giga Drain及Pain Split公开投影局部，不是全部恢复合同。 |
| 局部规则 | Double-Edge按实际损HP反伤及中止局部。 |
| 局部规则 | 仅14个具名有效Gen8 Move字段/实际自身顶层15函数来源与消费者静态合同，附r1五个单回合Gateway观察；参考三处P1/native0、Rest Gen8 PP10及显示/AI投影边界分列。 |
| 局部规则 | LEVITATE/MOLDBREAKER有效性局部及Cloud Nine有效天气压制。 |
| 局部规则 | Chlorophyll晴天速度倍率被下一回合实际排序消费。 |
| 局部规则 | Shell Armor拒强制会心局部。 |
| 局部规则 | SheerForce物理/特殊威力槽5325/4096。 |
| 局部规则 | Clear Body防威吓降攻的普通对侧降阶资格。 |
| 局部规则 | Arena Trap对非浮空候选提供拘束资格，限该输入正常逃跑被拒的局部样本。 |
| 局部规则 | Pressure、Levitate/MoldBreaker、StickyHold、Damp及环境附效能力的核心交界局部。 |
| 局部规则 | 仅(SpeedCalc,CHLOROPHYLL)及(DamageCalcFromUser,SHEERFORCE)两个参考责任配对到当前原生消费者、实际下一回合排序与物理/特殊威力槽样本的限定连接。 |
| 局部规则 | 仅显式作者能力/类型身份及对应lookup缺依赖的compile→assemble拒绝，缺创建abilities数据的普通createMember拒绝/RNG0；这是§11数据依赖边界子合同，不冒称能力计算回调故障已测。 |
| 局部规则 | 仅(ExpGainModifier,LUCKYEGG)与EVGainModifier七个Macho/Power配对的静态责任链接、实际八成长处理器与faint绑定current/recovery/捕获live pair限定合同；不签完整196登记或效果族。 |
| 局部规则 | 固定Gen8的18宝石/18减伤果类型映射及本地消费者门枚举；宝石5种有pledgecombo门、13种无该本地门，仅静态局部门，不证明誓约/完整数值/消费时序/多击业务。 |
| 局部规则 | ChoiceBand/Specs分别在Gen8 Atk/SpA槽6144/4096。 |
| 局部规则 | Air Balloon破裂不恢复，以及玩家AmuletCoin初始持物入场标志等已列直接交界局部。LuckIncense在本证据中仅为敌方负控，不验证玩家LuckIncense正向。 |
| 内置入口不适用 | 内置作者JSON/PBS管线、标准App内置factory与默认固定Dex/引擎不能构造合法具名但缺实现效果的一般前提；不依赖某个测试夹具名。 |

进入危害、位置变化、环境触发与胜负结果分别使用实际事件和单独回归。不能将「命中次数」等价于伤害数值；例如三个条件的 30/30/10 指威力而非固定 HP。
