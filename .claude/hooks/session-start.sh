#!/bin/bash
# Installs the Roblox toolchain (Rojo, Selene, StyLua) in Claude Code cloud
# sessions so roblox/ can be formatted, linted and built.
#
# Rokit can't fetch GitHub release binaries from a cloud session, so the tools
# are built from crates.io instead. Versions match roblox/rokit.toml. The first
# run compiles for several minutes; the container is cached afterwards.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

export PATH="$HOME/.cargo/bin:$PATH"

# Reads "<tool> = "owner/repo@x.y.z"" from rokit.toml.
version_of() {
  sed -n "s/^$1 = \"[^@]*@\([^\"]*\)\"/\1/p" "$CLAUDE_PROJECT_DIR/roblox/rokit.toml"
}

install() {
  local crate=$1 version=$2
  shift 2
  if command -v "$crate" >/dev/null && "$crate" --version 2>/dev/null | grep -q "$version"; then
    return
  fi
  cargo install --locked --quiet "$crate@$version" "$@"
}

install stylua "$(version_of stylua)" --features luau
install selene "$(version_of selene)"
install rojo "$(version_of rojo)"
"$CLAUDE_PROJECT_DIR/.claude/hooks/selene-roblox-std.sh" "$(version_of selene)"

echo "export PATH=\"\$HOME/.cargo/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
