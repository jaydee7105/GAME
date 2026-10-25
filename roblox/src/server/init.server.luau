--!strict
-- Server entry point (ServerScriptService.Server).
-- Modules placed next to this file become its children and can be required
-- with require(script.ModuleName).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Leaderstats = require(script.Leaderstats)

local function onPlayerAdded(player: Player)
	Leaderstats.setup(player, Config.STARTING_COINS)
	Remotes.Welcome:FireClient(player, Config.WELCOME_MESSAGE)
end

Players.PlayerAdded:Connect(onPlayerAdded)

-- Players who joined before this script ran (common when testing in Studio).
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end
