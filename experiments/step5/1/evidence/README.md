# 5.1 A–E 准备阶段记录

未提交开发阶段的原始 TAP/log 已原样保存在工作区 `.verify/step5-1-preparation/`（包括失败、修复后通过与依赖未齐导致的跳过）。没有为消除空白检查而改写原始输出。本目录保留准备阶段的反向 JSON/stderr 和此索引。早期 HEAD 是基线4b0c724且dirty，这些文件不能冒充固定候选SHA验证。

- `M-preparation-quick-2.log`：本地47套件/482项，零失败/取消/跳过（工作区准备档案）。此前 `M-preparation-quick.log` 有2项跳过，随后仅在此工作树安装固定Reactor运行时/声明后重跑，不能引用早期为全通过。
- `M-preparation-reverse.json` / `.stderr`：43历史＋8新探针，51/51 caught，源文件逐项finally恢复。`P51-held-snapshot`证明整份旧快照会覆盖独立编辑；另外覆盖容量/越界/缺模板/宿主接收锁/默认入战门/空内容来源/暂持保存。
- `M-preparation-build.log`：完整构建（含内容与插件），准备阶段通过。
- B/C/D/E及BE/CDE等其它tap/log：阶段定向/旧回归记录。部分旧API调用在显式补模板/策略/时钟前失败，日志保留；作者修过grant接收漏登记dex、安装失败应保留锁等实际回归，不把它们当仅测试过时。

固定提交后证据写工作区 `.verify/step5-1-M/<完整SHA>/`，不会通过新增证据提交制造SHA追逐。manifest列SHA、实际命令/退出码、测试/反向汇总、冻结文件和构建产物哈希、CI与未执行项；STATUS为唯一交接。作者报告和coverage分层见docs/step5/5.1-M-candidate.md。
