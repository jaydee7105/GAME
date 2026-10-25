# Roblox / Rojo project

- Language is Luau. Every script starts with `--!strict`; keep it type-clean.
- Use `.luau` file extensions. `*.server.luau` = Script, `*.client.luau` =
  LocalScript, plain `*.luau` = ModuleScript, `init.*` makes the folder itself
  the script.
- Where things land in the game is set by `default.project.json` (see
  README.md). Non-code instances such as RemoteEvents are declared there, then
  exposed through `src/shared/Remotes.luau`.
- Get services with `game:GetService(...)`, never `game.ServiceName`.
- Never trust the client: validate every RemoteEvent/RemoteFunction argument
  on the server.
- Style: tabs, double quotes, 120 columns (`stylua.toml`). Lint with Selene
  (`std = "roblox"`).

Before committing, from `roblox/`, all of these must pass:

```bash
stylua --check src
selene src
rojo build -o game.rbxl
```

Studio itself isn't available in a cloud session, so runtime behaviour can't be
tested here; say so when reporting changes.
