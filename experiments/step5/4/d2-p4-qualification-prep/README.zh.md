# P-4 当前源绑定、时限计算与中央接线准备

本目录基于限定独审通过的2dcb1b9，新增离线准备；不修改39个旧P-4文件、共享产品、测试清单或旧证据。原两项P2已由原独审CLOSED_SCOPED。本批尚待新的独立复核，不能接受真实OS、完整trace/最终APP或P-4。

本工具分支承接旧产品树，c6只在外部被读取/绑定，没有合入本分支。因此本checkout的旧generic入口仍不得执行；不得拿c6的安全CI边界替本分支或未来中央整合H背书。交中央的增量只含本新目录，不把旧src/scripts树带回当前产品。

`source-lock.json` 固定当前已发布产品c6ce3e6的SHA/tree/src、精确CI266既有回执、4个共享接点源码及9个当前构建文件的实际字节。CI231套4123通过来自原发布证据，本批没有重跑业务或远端查询；todo原runner未保留，不补造0。649/651 SDK只列原构建审计，不冒称本批重核完整SDK。c6尚无本三组P-4工具目录，也未注册d2-normal-f100；它是新的候选源身份，最终两端仍null，不能将旧a4dc建议根或c6CI自动转成最终正常对照包/APP。

`deadline-proposal.cjs` 对每个最终role/mode独立计算待审时限：调用时显式传入已有D2-final-pair-profile-v1，plan.pairProfileHash须等于其Node JSON.stringify/crypto摘要，所选role/sourceHead必须匹配，两端须声明不同clean源及对应exact-CI成功/旧回放未跑；这仍不认证包/CI真实性。按原100个ID/seed/业务hash核对，每case取所有已枚举互斥分支上界最大值；一个分支内对故意等待区间取并集，再加显式非等待/输入次数与单次上界。过程上界为launch+全部100case+idle120游戏tick+sampling+verification+tail，再显式乘一次安全系数并向上取整。每一项与分支覆盖均要求来源hash/定位；所有数值为有限安全整数，拒绝缺项/溢出/旧900秒默认或失败后延长。正常与instrumentOff不暴露GC/不强制调用，off细探针关闭但oracle预算保留，GC模式单独记录5点共10次调用。

此计算器只验证身份、结构和算术，不能证明区间是真实可达时序、分支穷尽、非等待/输入上界有实测支持，或来源已经独审。最终报告始终qualified=false/nativeAdmission=false；连ISOLATED_NATIVE_QUALIFICATION标签也不是运行或授权证明。来源的真实性、全部尝试、两端/各模式、trace及语义完整性必须另行独审。`deadline-template.json` 全部实际字段保持null，不能直接计算或启动。若静态无法证明完整100场正常分支，待原宿主门真正满足后才可进行正式组外资格运行；不得现在启动或将失败正式组改名。

唯一新测试命令：

```sh
/Users/dingshinn/.nvm/versions/node/v22.21.1/bin/node --test experiments/step5/4/d2-p4-qualification-prep/test-deadline-proposal.cjs
```

测试只生成明确标记SYNTHETIC的100行算术夹具，读取原作者输入manifest、调用纯waitUnion/hash，不导入Scene/SDK/引擎，不产生实际对局、按键、timer或OS调用。测试中的4560ms等是算术预期，绝不是建议的实机时限。没有运行通用quick/headless/CI或旧冻结回放；本新suite未登记到中央清单，c6CI也未覆盖本目录。

`central-handoff.json` 是交中央单写者的具体接点：从实际Scene.inputState与root/App代际绑定owner、从实际子层/已选成员读取字段，并新增真正的forced-request occurrence来源。现在没有这个可序列化token接线，不能用请求payload hash、对象地址或按键发送补造。原观察函数只有实际相邻ready快照匹配才形成强制替补因果，业务意图仍等真实事件oracle推进。接收/学习/Map/Title、正式fixture、完整Node/package-core验证及模块打包决定均未接线。本批不抢写这些共享路径，只提供精确新测试路径给中央决定。

`os-qualification-matrix.json` 分列12个实际接口资格点与已有纯控制，所有真实OS结果仍NOT_RUN或BLOCKED。无许可授予或原生入口；ClosedPermit和原宿主占用拒绝保持，不查询、不绕过、不推断空闲。没有新APP、安装、运行时复制/链接、真实存档、push、main或共享STATUS写入。RSS仍只有结构化字段，原始ps文本/实际renderer证明没有补签。

旧历史FAIL/HOLD/LOW/DEFER/WARN/UNKNOWN、GC+23.8929% WARN_OPEN、U51 UNKNOWN/AUD2与完整D2/E/5.4/P4未验收均保持。全局同职能归属UNKNOWN：本机任务读取接口未返回，已核父分工及本地冻结/所有权材料；只在本独占新目录写入，中央任务不重复执行。
