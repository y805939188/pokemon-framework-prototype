# E1 character family 正式输入准入

本修正从固定 `7acd37c2896f1f9f55c7f34e97cb8600c0d0b2e2` 接续，只改测试支持与正式 family 准入。产品 src `508c287fca132b002c4859d99e97171b4ad9f01f`、E02/E03 输入及其16个pure控制均保持。22 selector／145 inner尚未在新联合执行，不沿用原叶独审或0ff执行GO。

| selector | 实际调用与准备责任 |
| --- | --- |
| POSE01–12、RESOURCE、PLAYER、FAMILIES、RECEIPT、FRAMES、REPROJECT、HOT、READERS（141 inner） | entry→e1-fishing-presentation fixture→ui-wire-travel→已选择的ui-wire-e3。新family必须取当前final-production-runtime.get，使用正式engine和js/plugins IIFE；在加载surf/world-scene/frame支持前先把D build绑定至该已验证对象。该入口不调用consumer默认builder。 |
| PREDICATE（2 inner） | entry先prepare('fishing-host')，再加载typed fishing-messages.js。 |
| ROUTE（2 inner） | entry→fishing-host-fixtures，先prepare('fishing-host')，再从typed root加载host、rules、host-input、character helper；原生对象／窗口／图片裁切来源均是本树pin。 |

普通统一worker仍先capture/boundFiles，current cold parent由正式cGenerationSupport验证源/Node/工具/完整strict emit与native pin。`e1-character-inputs`在profile require、prepare和产品import前重新核同一parent binding/source，并验证完整10键（profile组9键，加实际engine输出PF_E3_JOINT_OUT）；PF_FISHING_HOST_OUT明确为parent/out/src，PF_MZ_OBJECTS明确为本树js/reactor_objects.js。真实profile默认字段映射和实际发射目录均支持这个结构，不是按变量名猜测。world-scene组同时保持own out、field bundle、正式engine、BattleFlow source/IIFE与原生对象来源。

H.capture已经核父manifest的全部outputs/loadedInputs/source/Node与pin；host的五个直接typed callee还逐名要求存在。新helper不以消费端代码生成输出，也不借C suite身份。合法准备实际调用原helper的world-scene与fishing-host，两者必须explicit；缺键、foreign路径、mixed parent/native、旧独立builder组必须在这些调用前拒绝。仅formal family拒绝无关legacy组；原regular-field-action-test-runtime字节不动，独立旧helper的默认模式仍可使用。

其余native环境与IIFE仍由final-production-runtime的sameExplicit和绑定校验负责。可靠Node types.isProxy来自绑定Node builtin；真正App/业务、RNG、图片和原断言没有改。ui-wire-e3只增加新family的当前运行时白名单，原独立分支保留。

新增pure准入suite只检查路径/绑定/profile mode与调用计数，不导入PREDICATE、ROUTE、pose body、App或产品emit。missing/foreign/stale负控分别断言明确拒绝、profile import/prepare/compiler/product import计数0；compiler拦截器不会为负控真的构建。当前全部业务及new300/full/C14/P5/MC/NW仍须新固定输入独审GO后另跑。

新character family的PF_E3_JOINT_OUT也必须是本树正式engine目录；即使foreign目录字节相同，也在旧review兼容分支之前拒绝。其他family原显式review兼容分支不变。
