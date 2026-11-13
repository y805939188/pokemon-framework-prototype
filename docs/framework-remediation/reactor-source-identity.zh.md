# R6：Reactor 实际消费来源校验

正式模式默认使用 `scripts/versions.env` 的固定来源；`scripts/reactor-source-manifest.json` 固定同一 repository／commit 下的 **40 个 runtime 文件和 12 个声明／工具／LICENSE 文件**的 SHA-256。该文件只含路径、来源身份和摘要，不含上游源码或本机路径。来源是 `2dc2e10e89445e252c929257f8bf249525045d36` 的 git 对象，不是本地工作树当前内容。

`setup-reactor.sh --install` 和 `--check` 都校验实际消费字节。本地正式来源还须是 HEAD 等于固定提交的 git checkout；同 HEAD 下暂存、未暂存和新增的会复制文件均受文件集合及摘要比较约束。只有版本／revision 注释相同不能通过。下载／缓存解包后的文件使用同一清单验证，不以 URL、缓存文件名或 tar 可解压作为来源证明。失败的来源验证先于项目 runtime 更新。

消费集合与安装逻辑一致：runtime 包含根目录的 `reactor_*.js`（排除项目插件桥替换的 `reactor_plugins.js`），以及 `runtime/libs/` 全部普通文件；声明包含 `types/` 下 `.d.ts`、`types/tools/typecheck.cjs` 和 `LICENSE`，排除 `types/tests/`、`types/examples/` 与 `types/compat/lib.dom.generated.d.ts`。生成的 DOM 声明由编译器准备，不冒充固定上游字节。消费目录及文件不接受符号链接。

安装后的 `js/reactor_*.js`、完整 `js/libs/` 与 vendor 声明集合也按同一来源摘要核对。新增消费文件、正文篡改和同时重写 vendor 自身 `manifest.json` 均不能改变正式 pin。安装可修复安装侧偏离；源侧偏离须先恢复固定来源或显式使用开发模式。项目自己的 `js/plugins.js`、插件文件和 `src/types/` 不在替换范围。

正式记录是 `pinned:<repository>@<commit>`；本地与下载字节相同即可得到相同的来源身份。`.reactor-source` 仍仅在成功安装后记住本地位置，方便后续开发检查。旧的 `local:`／`github:` 记录需要执行一次 `--install` 迁移，`--check` 不会把旧声明直接当成新校验已经通过。

本地开发保留 `REACTOR_ALLOW_OTHER_COMMIT=1`，可接受不同 HEAD、工作树修改和非 git 目录。输出固定注明 `DEVELOPMENT (NON-STRICT; no pinned-source claim)`，来源记录为 `development:local:...`；该环境值不持久化。后续检查或安装须继续显式提供它。取消覆盖后，开发安装不能通过正式检查。开发模式仍比较安装字节与当前选择的来源，不放弃完整性检查。下载模式始终使用正式 pin。

改变正式 Reactor 版本时，应有意同步 `versions.env` 和固定来源摘要清单；安装器不会从选择的本地源或缓存中自动重签 pin。本次清单由固定提交的 `git ls-tree -r` 选择上述消费路径，逐一读取 `git show <commit>:<path>` 字节后计算 SHA-256；没有修改外部 checkout。实际网络下载可用性不由合成缓存测试证明。

专项回归命令（只操作临时合成 git／runtime 目录，不启动 MZ／NW.js）：

```sh
node --test scripts/tests/reactor-install.test.cjs scripts/tests/reactor-source-identity.test.cjs
```

测试先行记录：基线 `7ff11c917db9e605f245de370b0764ebad8b3243` 上来源专项初始 17 项为 1 通过／16 预期失败，失败包含安装正文 stamp 不变、有效 tar 替换字节和新增未跟踪文件。实现后旧安装 3 项与来源专项 19 项通过；后补两项为安装侧新增 libs／声明文件回归。它们验证正式来源与安装完整性，不证明运行兼容、完整构建、宿主测试或 CI。

独立复核发现并修复安装侧同名 runtime 符号链接：复制前仅移除项目管理范围内的普通文件及链接，再复制普通文件；不会沿旧链接覆写无关目标。新增合成回归在修复前 22 通过／1 失败，修复后 23／23 通过。目录 libs 与 vendor 声明采用已有安全替换逻辑，未更改。

2026-11-13 根协调整合验证另实际执行全新缓存的 `REACTOR_SOURCE=download ./scripts/setup-reactor.sh --install --force`，下载、解包及严格安装均 exit 0。它与同 pin 的本地严格安装，40 个 runtime 和 12 个声明／工具／LICENSE 文件逐项 SHA-256 全等；没有依赖旧下载缓存。此事实补充前述合成控制，仍不代表完整 bootstrap／doctor、NW、平台、性能或分发通过。个人源码路径不再是干净准备的必需条件。
