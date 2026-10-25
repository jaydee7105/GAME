# Roblox (Rojo)

Roblox games for this repo live here. Code is written in Luau in `src/` and
synced into Roblox Studio with [Rojo](https://rojo.space), so it can be edited
in VS Code and kept in git.

## One-time setup (your computer)

1. Install [Roblox Studio](https://create.roblox.com).
2. Install [Rokit](https://github.com/rojo-rbx/rokit), the toolchain manager:
   - Windows (PowerShell):
     `Invoke-RestMethod https://raw.githubusercontent.com/rojo-rbx/rokit/main/scripts/install.ps1 | Invoke-Expression`
   - macOS / Linux:
     `curl -sSf https://raw.githubusercontent.com/rojo-rbx/rokit/main/scripts/install.sh | bash`

   Then restart your terminal.
3. In this folder, install the pinned tools from `rokit.toml`
   (Rojo, Selene, StyLua, luau-lsp):
   ```bash
   cd roblox
   rokit install
   ```
4. Install the Rojo plugin into Studio: `rojo plugin install`
5. Open **this `roblox/` folder** in VS Code and accept the recommended
   extensions (Rojo, Luau Language Server, StyLua, Selene).

## Day-to-day workflow

```bash
cd roblox
rojo serve          # start the live-sync server
```

In Studio, open a place (a new Baseplate is fine), click **Rojo > Connect** in
the Plugins tab, and every save in VS Code shows up in Studio instantly. Press
Play in Studio to test.

To build a place file without Studio running:

```bash
rojo build -o game.rbxl     # then open game.rbxl in Studio
```

Before committing:

```bash
stylua src          # format
selene src          # lint
```

CI (`.github/workflows/roblox.yml`) runs the same format check, lint and build
on every push that touches `roblox/`, and attaches the built `game.rbxl` to the
run.

## How files map into the game

`default.project.json` decides where each folder goes:

| Folder | In Studio | Runs on |
|---|---|---|
| `src/server/` | `ServerScriptService.Server` | Server |
| `src/client/` | `StarterPlayer.StarterPlayerScripts.Client` | Each player's client |
| `src/shared/` | `ReplicatedStorage.Shared` | Required by both |

File names decide the script type:

| File | Becomes |
|---|---|
| `Name.server.luau` | `Script` (server) |
| `Name.client.luau` | `LocalScript` (client) |
| `Name.luau` | `ModuleScript` |
| `folder/init.server.luau` | the folder itself becomes a `Script`, other files in it its children |

Instances that aren't code (parts, remotes, lighting) can be declared in
`default.project.json` too: the starter `Baseplate`, `SpawnLocation` and the
`ReplicatedStorage.Remotes.Welcome` RemoteEvent are defined there.

## Starter game

- `src/server/init.server.luau` gives each player a `Coins` leaderstat and
  fires the `Welcome` remote
- `src/client/init.client.luau` shows the welcome message as a notification
- `src/shared/Config.luau` and `src/shared/Remotes.luau` hold shared constants
  and typed remote handles

All scripts use `--!strict` Luau type checking (also set as the default in
`.luaurc`).

## Publishing

Rojo syncs code; Studio publishes. With Rojo connected, use
**File > Publish to Roblox** in Studio. (Automated publishing with
`rbxcloud`/Open Cloud can be added later; it needs an API key stored as a
repository secret.)

## Adding a second game

Copy this folder's config (`default.project.json`, `rokit.toml`,
`selene.toml`, `stylua.toml`, `.luaurc`, `.vscode/`) into a new folder, e.g.
`roblox/<game-name>/`, or point Rojo at another project file:
`rojo serve other.project.json`.
