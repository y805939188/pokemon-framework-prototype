# pre54 candidate-only producer v1（候选，待独立ultra）

只调用固定8c kit的TS业务；不读Ruby/私有adapter/raw，不改产品或旧354输入。本包为f100168已接受观测v2.1的执行包装，不升级协议，不添加映射。参考侧资格保持，正式354仍HOLD。

## 身份与派发

外部producer-freeze SHA固定6个producer payload与完整原f100168 protocol-bundle（74文件，其中唯一旧core一份），旧freeze4d85016e743f4e0507086efccee9121ef523484fe8a95c1d518d147eae0b6b15不变。build入口从明确外部旧包构建一次新目录；输出不得覆盖。实际调用者先按非作者固定SHA核工具/入口，不能把未知脚本自检当沙箱。验证所有文件/额外文件/链接/硬链接、Node22.21.1/无loader注入，再加载业务。新producer身份单独绑定，不冒称其源码已经属于旧协议freeze。

顺序调用一个worker一次，仅选择已有qualification12-v1/additional25-v1/qualification37-v1/formal354-v1。资格不是正式354；本批自测只允许有限37。先逐案校验真实结果再派下一案，不整批map完后删尾部假装停止。

固定旧TS runner原生支持合法非空case集合（公开schema/validateRequest）。每worker运输子请求只含一个从固定354原案复制的完整case；所有input、caseId、caseHash不变，header同profile，仅运输requestHash/requestId因单案重封。worker再次以原案重建并严格比对，保留父完整请求→子运输请求的映射和实际argv。**原354文件字节不改**，公共v2.1仍父requestHash/原354顺序，handled为实际已执行计划前缀。该显式派生运输不是对原354的替换或已运行声明。

worker加载旧runner原字节，runner调用唯一固定core；只是新entry/proc包装，不复制规则/计算/返回值。source.files.runner/core仍指实际已加载执行的旧7ffd7e8a/beb0f7e5；新worker/coordinator/producer实际entry、代码依赖、argv与hash在独立producer-freeze和本次执行receipt中另列，不冒称进程入口是旧runner。无src深路径/第二core/NODE_PATH或残留包。

## 事实与净化

v1严格结构校验成功后才显式包裹：value/error-object为原生returned，raised为原生raised；value唯一class:null仅做结构投影，不丢掉非空class。由f100168原profile净化，不用input回填PP/次序/refused未变/partial。真实TS返回pending保持returned，不根据参考wait/整数造同形结果。候选同步入口未返回则技术超时，不造awaiting-input-not-returned；v1不支持的wait carrier须拒绝。本包装不生成新的integer-and-state业务表示。

worker将Math.random调用原函数并计数，不改变随机返回；原固定六操作要求零随机。实际非零或无可信counter均不补0；UNSUPPORTED_RANDOM/random=null阻塞。该用户态计数不宣称监控任意OS/crypto随机；本固定同步纯TS调用无外部随机参数，依赖身份/现行合同与有限资格共同界定范围。

未知输出/未证明状态不造error：INCOMPLETE_STATE或OUTPUT_CONTRACT_UNSUPPORTED停后续，原始值留candidate私有执行目录。child超时/非零/信号/stderr/坏JSON/限额都是技术事实，不作业务raised。已收到已验证entry-start的失败可以记attempted（尝试该案入口，不等于已证明某native业务函数到达），native完成未知；不确定是否到入口则coordinator失败，公共失败包cases[]/dispatch=null/random=null，详细已知prefix日志仍私有保留，不改成NOT_RUN。有效停止包保留前缀观测，未派发项NOT_RUN，不缩354分母。

## 生命周期与输出

producer→coordinator→逐案worker，用shell:false、明确argv/cwd、只给LANG=C/TZ=UTC，无密钥/认证环境。自身SIGINT/TERM/断开走Abort；只有自己spawn登记的组可TERM→200ms后KILL→1秒有界收尾。实际close和本组不存在才记cleanupVerified，EPERM/未知/残余组均不伪造回收。Mac/Linux组核查有效；Windows真实host未验，group证明不足时保留失败，不声称已支持。无ps或系统配置修改。不能证明清理时保留PID/收据，停止接收，不移除历史或绕拒绝。

默认总endpoint30秒（子worker沿剩余预算），stdout16MiB/stderr1MiB；任何stderr/超限/非法IPC/信号按实际记录。每workerstdout/stderr/IPC/proc/派生请求和前缀journal独占写candidate私有输出；coordinator真实stdout及实际exit/信号/字节/hash形成v2.1 execution。正常coordinator exit0只代表观测运输完成，个案可BLOCKED；失败不洗成成功。不能把技术退出或未知RNG写成业务return/wait。

produce输出仅一个净化candidate-observations.json以及私有proc证据和producer-manifest；CLI只打印闭合状态/计数/hash。它不是完整三文件formal公共目录，不能替A写audit，也不能自己声称双端通过。真实formal运行后A核producer与stage实际字节并写execution-audit，父外部pin后才用原f100168 receive/compare。source audit6f7925c仅参考侧，candidate自身仍需本固定工件独立ultra。

## 实际命令与边界

构建：node candidate-producer-v21/build.mjs --protocol-bundle ABS_FIXED_F100_BUNDLE --out NEW_ADDON_ROOT。
运行：Node22.21.1 NEW_ADDON_ROOT/producer/produce.mjs --root NEW_ADDON_ROOT --expected-producer EXTERNAL_PRODUCER_FREEZE_SHA --plan qualification37-v1 --out NEW_OUTPUT_ROOT。
正式仅未来父调度把plan改formal354-v1；不能未审自开。程序不接受外部core/runner/argv覆盖，输出必须新建/真实父路径且不与工具树重叠。协议包和旧kit原封存字节不变，产品/原映射/来源不改。有限TS资格只是单端，不算新增真实Ruby覆盖/354双端或5.4完成。

CLI退出码：0仅表示所选计划且整个354均已实际可观测；3表示候选包结构成立但总354中仍有unobserved（因此正常37资格也为3，317 NOT_RUN保持），1为实际执行/协议失败包，2为启动前拒绝。所有计划状态都不等价于双端PASS。新producer-manifest的全部原始流按bytes哈希，不用UTF8解码改写错误流；净化JSON另经严格UTF8/闭合门。

协议payload除与新producer清单核对，还逐项与外部固定f100 freeze中的原bytes/hash交叉核同；即使重算新producer pin也不能混入改过的旧core/runner。worker据此使用不可变原354快照选单案，再由旧runner验证子请求，不在每个worker重复对整个354做语义重验；不是对象身份缓存或移除子案校验。
