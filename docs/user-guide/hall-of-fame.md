# 地图作者用法 / Map author guide

## 中文

在 RPG Maker MZ 的地图事件或冠军剧情调用的公共事件中，选择 **PS_Management → 登记名人堂**（`RegisterHallOfFame`）。只在真实冠军剧情确认成功的分支放置一次。这个分支负责资格与剧情判断。若剧情需要展示准备或播放 BGM，先完成准备。配置了音乐就先交付播放请求，再调用登记。事件失败、取消或使冠军条件不成立时跳过登记。普通训练家胜场、胜利变量与胜场账本本身没有登记权限。

`historyLimit` 可留空，默认保留 50 届。请输入整数。正数超限时本次仅移除最早一届，负数不裁剪，0 从空档案起登记时仍累加届序但没有保留记录。如果已有保留记录，再改为 0 也只移除最早一届。每次合法调用登记一届，另一次真实通关可再次登记。

指令立即把当前队伍的展示值（含蛋）登记到当前内存档案。新档或没有历史的兼容旧档，首次登记从第 1 届开始。不会倒造历史、改名人堂统计或登记用时。此指令不播放音乐、不启动演出或片尾，也不触发存档。玩家可在普通 PC 查看记录，之后按正常流程手动保存。当前发行样例尚未接入真实冠军剧情，作者需在自己的成功分支配置此指令。

## English

In an RPG Maker MZ map event or a common event called by the championship story, select **PS_Management → Register Hall of Fame** (`RegisterHallOfFame`). Place it once in the branch that confirms genuine championship completion. Your story event owns that decision. Finish any presentation preparation first and, if you configure music, submit the BGM playback request before invoking the command. Skip registration if the championship fails, is cancelled, or was never confirmed. Ordinary trainer wins, result variables, and battle records carry no registration authority.

Leave `historyLimit` blank to retain up to 50 entries. Enter a whole number to override it. A positive limit removes one oldest entry when exceeded. A negative limit never prunes. A zero limit still increments the count, so an initially empty archive retains no records. If records already exist, reducing the limit to zero still removes just one oldest entry per call. Each successful invocation creates one entry, including a later, genuine championship completion.

The command immediately records display values for the current party, including Eggs, in the current game's in-memory archive. The first registration for a new game or a compatible old save without history starts at No. 1. Existing statistics and championship time are preserved. The command starts no music, presentation, credits, or save. Players can browse the resulting history on the ordinary PC and persist it through their normal manual save. The shipped sample has no championship event wired to this command.
