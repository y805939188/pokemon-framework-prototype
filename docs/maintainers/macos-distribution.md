# macOS 打包、签名与公证

在安装了有权使用的素材的框架样例检出运行 `scripts/package-mac.sh`。脚本保留 NW.js 包的符号链接并按清单装配；不要使用 MZ「部署」生成 Apple Silicon 玩家包。存档必须留在包外。可在本机运行的 ad-hoc 包不等于从网络下载后可以直接通过 Gatekeeper。

1. 本地验证可用 `scripts/package-mac.sh --harden`。JIT 与 ad-hoc 用的权限和正式身份不同；不要为了让未签名组件运行而关闭系统安全策略。
2. 对外分发使用有权使用的 **Developer ID Application** 签名身份，先检查 `scripts/notarize-mac.sh --check`，再用 `scripts/package-mac.sh --identity "Developer ID Application: <Name> (<TEAMID>)"`。所有嵌套组件从内到外签名；检查签名、hardened runtime 和安全时间戳。
3. 开发者在自己的钥匙串中设置公证凭据，然后使用 `scripts/notarize-mac.sh build/package/<App>.app --keychain-profile <profile>` 提交、等待结果并装订票据。不要将凭据写入仓库。
4. 对实际下载、带隔离标记的最终归档，在干净环境中检查 Gatekeeper、首次启动和外部存档。构建、ad-hoc 签名和静态检查均不能替代这一步。

框架不提供已公证的正式游戏 Demo。发布前请独立核对[第三方来源及分发条件](../sdk/distribution-notices.md)，MZ 授权不等同于可以重新分发任意素材。
