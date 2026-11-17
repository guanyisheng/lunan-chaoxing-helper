#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/路南云🏅学习通AI研习助手|刷课+答题+API专刷.js"
dst="$root/lunan-chaoxing-helper.user.js"
if [[ ! -f "$src" ]]; then
  echo "missing source: $src" >&2
  exit 1
fi
cp "$src" "$dst"
echo "synced -> lunan-chaoxing-helper.user.js"
