#!/usr/bin/env bash
# Shared, narrow rsync policy. Callers pass 0/1 for inclusion of test plugins.
# rsync receives each top-level resource directory as its source root, so this
# anchored namespace excludes only old VM scratch under img/pokemon/....
package_excludes() {
  EXCLUDES=(--exclude '*.map' --exclude '.DS_Store'
    --exclude '/pokemon/battlebacks/__tests__/scene-ready-*/')
  if [[ "$1" -eq 0 ]]; then
    EXCLUDES+=(--exclude 'PS_BattleSmoke.js' --exclude 'PS_BattleFlowTest.js')
  fi
}
