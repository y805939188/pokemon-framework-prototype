# Required 持物结算安装结果异常

基线/固定产品68d48b6。查重：test-held-app HF12已有零写replace失败重试及投影失败；H3 lifecycle已有每来源零写故障；pair/held-continue/money-slot已有正常配对与磁盘链。本批只补状态端口“完整写后抛错”和“仅party写入”的required结算组合，不重复七来源或磁盘矩阵。

两案均从真实管理give获得Lum的合成输入出发，真实App/Session/Gen8经Tackle受伤、Rest触发一次Lum消费、PayDay终局。终局前持久状态不变。明确开发能力只用于已有受控路径，生产默认门未变。

1. 完整next写入后replace抛错：App读回识别已完整安装，主hash/pair、持物与钱同次写入，保留宿主确认失败诊断，解锁；重复finish/commitResult零追加写。
2. 故意只装party、缺钱和主/配对账本：不能误当零写或成功；再次resolve不重写，terminate要求reload，技术abort仍保留saveBlocked且下一战拒绝。只验证隔离内存故障，未制造真实磁盘损坏，也未假装重载恢复已验证。

首次运行2/2通过；未跑完整套件/CI/NW/旧对照。源码零产品改动，hash绑定68d运行时support/manifest，support再校验全部引擎产物与Showdown身份。pairHash只做格式/安装一致性，不替代已有独立pair语义oracle。投影日志与合成状态保留本地，不上传。

运行：H3_RUNTIME_ROOT=<68d48b6产品工作树> node --test experiments/step5/4/h3-install-outcome/test-install.cjs。

固定候选须独审。无需新产品修复；不修改默认开放合同或main，不签完整H3/5.4。此固定运行时专项不应未经重绑定直接加入通用CI。
