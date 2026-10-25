#!/bin/bash
# Gives Selene its Roblox standard library in a cloud session.
#
# Selene downloads the Roblox API dump itself, but its HTTP client ignores the
# session's proxy, so `selene src` fails with "error when getting API dump".
# This builds a copy of Selene that reads the dump from a file instead, fetches
# the dump with curl, and writes the result to Selene's cache. The regular
# selene then uses that cache (it prints a harmless "Using the cached one
# instead" note once the cache is a few hours old).
set -euo pipefail

version=$1
cache="${XDG_CACHE_HOME:-$HOME/.cache}/selene"
[ -f "$cache/roblox.yml" ] && exit 0

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

src=$(find "$HOME/.cargo/registry/src" -maxdepth 2 -type d -name "selene-$version" | head -1)
[ -n "$src" ] || { echo "selene $version source not found (install it with cargo first)" >&2; exit 1; }
cp -r "$src" "$work/selene"

python3 - "$work/selene/src/roblox/generate_std.rs" <<'PY'
import re, sys
path = sys.argv[1]
code = open(path).read()
patched, n = re.subn(
    r"ureq::get\(API_DUMP\)\s*\.call\(\)\s*\.context\([^)]*\)\?\s*\.into_json\(\)",
    'serde_json::from_reader(std::fs::File::open(std::env::var("SELENE_API_DUMP")?)?)',
    code,
)
if n != 1:
    sys.exit("selene source changed; update .claude/hooks/selene-roblox-std.sh")
open(path, "w").write(patched)
PY

curl -sSfL -o "$work/api-dump.json" \
  https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/API-Dump.json
cargo build --quiet --release --locked --manifest-path "$work/selene/Cargo.toml"
SELENE_API_DUMP="$work/api-dump.json" "$work/selene/target/release/selene" update-roblox-std
