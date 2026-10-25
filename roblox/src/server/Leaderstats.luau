--!strict
-- Creates the "leaderstats" folder Roblox shows on the player list.

local Leaderstats = {}

function Leaderstats.setup(player: Player, startingCoins: number)
	local folder = Instance.new("Folder")
	folder.Name = "leaderstats"

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = startingCoins
	coins.Parent = folder

	folder.Parent = player
end

return Leaderstats
