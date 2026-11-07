# H3 闭门取下旧持物的守恒补证

基于664ee9b，仅补非渲染编译host测试，不改产品、默认false策略、共享注册或旧接受结论。

原H3-SAFE-TAKE正例现在核：完整GameState只改变party[0].item（lumberry→空）与既有背包唯一lumberry槽（1→2），一次安装的实际快照也符合；同receipt重放与新receipt取空持物不多写，结束管理后状态不变。之后原空持物required战斗仍照原合同完成。

oracle不调用产品addItems或takeItem：从完整前态复制，仅显式修改这两个值，再deepEqual全态，保留背包其他槽/次序/光标、其他成员、HP/PP、钱款、stats/dex、旧账本与仓库。它针对本夹具唯一已有Lum槽，不宣称覆盖新增槽、满包、排序策略、所有持物或真实UI。

纯读数控制：1正控＋13负控（缺少/重复背包加一、保留持物、其他成员、HP、PP、背包光标、钱款、stats、dex、旧账本、仓库、额外字段）。负控只变异内存数据，不重跑战斗，也不是产品缺陷红测。

验证命令：设置H3_RUNTIME_ROOT为固定664ee9b的匹配已编译运行时，执行 node --test experiments/step5/4/h3-production-policy/test-take-conservation-oracle.cjs experiments/step5/4/h3-production-policy/test-host.cjs。support/host-plan在加载前核所有指定运行时与插件hash。作者单轮26/26，其中原host12（包含增强正例）与oracle14，不额外相加。当前树src与该固定运行时源相同，无需为测试-only修改重建产品；不冒称本批独立重构建或完整全量/CI。

这是正常闭门取下行为的Node VM程序动作，不是无开发覆盖的新持物来源开放：fixture使用既有开发能力生成旧持物后清空覆盖，再执行正常取下。默认开门、main前置、NW/物理输入/磁盘Title-Continue、pairHash贯穿和完整B-3/5.4仍未验收。新增纯oracle入口没有修改共享注册，由中央独立复审后接入。
