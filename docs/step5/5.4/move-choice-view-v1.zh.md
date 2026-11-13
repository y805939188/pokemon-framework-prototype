# D2 招式窗 v1：类型标识和 PP 余量

按已冻结 5.4 D-2 / WP67-A §4.1，直接补现有正式招式窗，基线为已接收产品 `c93e783`。保留四槽 2×2 导航、稳定槽位编号、PP0/领域封锁仍可选中但由 Session 拒绝、取消回主菜单与原游标记忆，不依赖待批的普通消息修后驱动或暂停消息候选。

每个已存在招式按钮显示完整名称、简单可替换的类型色条/类型标识及 PP。类型资料复用已核来源的锁定 Gen8 Dex；按引擎发布的名称优先查显示变体，再按 ID 查基础记录，复用现有中英类型字典。未知、未核来源或 Recharge 等虚拟动作无资料时明确用中性 `?`，不虚构类型、不阻止合法输入、不改变请求或选择规则。颜色是默认 UI 配色，不是战斗属性计算；未来自定义美术可替换此呈现边界。

PP 按公开请求原值显示：0 红、正数且≤总量1/4橙、≤1/2黄、其余深色；使用精确比例，奇数上限不向上取整。图形窗总PP≤0或请求不提供PP时不画PP文本，类型标识仍保留，不用文本模式的 `PP: ---` 代替。没有把 disabled 或 PP0 灰掉。类型标识按背景选择黑/白字，PP置于浅底；当前每个按钮都可见PP，选中时无需重新查询状态。

实际 Window_PSMenu 的招式行高改为两行，默认808×616 box下两行均在172高内容区内，按安装版 Window_Selectable 的 itemRect/itemHeight 计算；主菜单/其它列表仍委托原绘制与行高。大片浅底绘入contentsBack，位于宿主原光标层之后，避免前景不透明块遮住当前选中格；标签/PP仍在文字层。配色和绘制均只读；不改 Session、引擎、RNG、PP扣减、背包或最终提交。招式拒绝、改选和实际PP消费仍由原规则完成。

测试入口 `node --test experiments/step5/4/test-move-choice.cjs experiments/step5/4/test-move-details-scene.cjs experiments/step5/4/test-move-menu-refusal.cjs experiments/step5/4/test-menu-grid.cjs`。纯视图7项与编译Scene8项均已登记headless；编译Scene使用真实App/Session/Gen8、生产翻译及安装版窗口几何和图层组装函数，字形/Bitmap/输入交付/音频仍受控，不冒称实际NW像素或实体输入。测试通过稳定命令身份出招，PP0拒绝和正常改选后刷新不写持久状态。

`PF_MOVE_DETAILS_PRODUCT_ROOT` 仅改变测试编译的产品来源，供旧c93同断言对照，不写旧树；`PF_MOVE_DETAILS_SCENE_MUTATION` 仅在测试读取的编译输出内撤PP绘制或类型文字，原源文件不改。当前 headless 捕获ME测试的来源hash随此产品准确更新，历史原生PLAN/APP/失败封印不重绑。来源守卫仍检查完整hash，不删除检查。

实际固定SHA、回归与构建以工作区 `.verify/step5-4-D2-move-details-20261104/` 为准。本批作者测试不等于独立接受；新精确CI、APP/真实字体/窗口/触控及NW尚未验。Encore/无招自动入口、完整命令列表消息合同、逐级学招交错、其它呈现和完整D2/E/5.4/P4仍OPEN，GC WARN/U51 UNKNOWN/旧失败/DEFER保持。不合main、不更新总进度网页。
