# 载具取消：当前地图来源修补

针对6b7限定独审的 E3-VEHICLE-MAPID-SOURCE/P2，取消载具捕获真实原生 Game_Map 的 own-data `_mapId` 和 root own-data `$dataMap` 身份，并在每个 native/provider 前后和最后 pose 写之前复核。只比较地图对象不足：实际 native setup 可在同一对象上换地图。Proxy／非正常来源拒绝，不执行这些槽的 getter。

已发生的真实 vehicle.getOff 前缀（车辆 driving=false／步行BGM请求）保留；来源变化后旧效果不继续改玩家 walk／透明／through／速度，不预定目标，不清后继或新201。原 owner／player／map／vehicle／native epoch／SOURCE／once 守卫不放宽。源字段纯descriptor比较和最终own-data写之间没有未知回调。

作者有限验证为新4个来源控及相关原13，固定身份、原红、实际结果、绑定／清理与独审状态在新工作区 r8-vehicle-map-source 报告；不混UI／rope／PSInventory，不代NW／磁盘／完整E3签收。
