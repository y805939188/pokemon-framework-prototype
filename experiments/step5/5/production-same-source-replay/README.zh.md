# 固定生产源两条正式文件回放

产品基线为 `12c763dcf4fa99e6a23b7b9ccc403c48ec03ca88`，产品 `src` 固定 `e0aee5ebc9b11d964ed339c95a2750f04326debc`。本提交只移植与适配测试，不更改产品、schema 或 shared regular runner。

四个明确 case：DF-P01 真实旧357战败→正式F/自动保存file0；DF-C01 另Node/VM/profile读取本轮file0经正式Load/Map/B，完整状态相等，12帧全状态/文件不变及零重放；T16-P01 真实公开领取及接收、Bag登记Old Rod、地图快捷Sweet Scent、真实Session/MasterBall捕获、No/Box、正式手动file1；T16-C01 另Node正式Load/Map/B读取本轮file1，完整状态/12帧/文件不变及公开操作与三类RNG零重放。

`event-defeat-autosave-continue-headless` 原测试来自5196a022，`t16-shortcut-capture-continue-headless`来自db698152。各自的 README 记录历史输入。禁止执行历史目录的runner/builder；复验须新E并改全路径，拒已有目标。

原命令、公开接收、App owner/generation/Content、Scene私票、原F/native保存与正式读档保持实际。render/audio/input/list/XHR资源为受控headless环境。presention辅助从固定12c原生矩阵摘取；新增 pinned Animations、原生Utils环境判断、隔离project身份和只读exists项目探测，服务新源默认音效/暗层依赖。没有测试darkmap像素/完整Flash；初始化暗层诊断原样保留。

在实际PSFlow.random和实际Math.random、最后一次JsExtensions后的Math.randomInt、原Gen5/Sodium next上只安装转调observer，保持this/args/返回。DF沿原有限固定rng/seed；T16沿原固定Session seed及真实Math.random，不为匹配计数重置或更换返回。

本任务仅给同源headless有限链作者证据，待独立review。不代NW/Title、人工键盘/听感/真实失焦、其它败北/CP分支、全自动保存、full360、T20或整5.5；P03/P05/Flute仍未答。清理只登记MARK_ONLY，保留所有失败、文件、raw和日志。
