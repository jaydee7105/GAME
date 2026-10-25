--!strict
-- Client entry point (StarterPlayer.StarterPlayerScripts.Client).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")

local Remotes = require(ReplicatedStorage.Shared.Remotes)

Remotes.Welcome.OnClientEvent:Connect(function(message: string)
	-- SetCore can fail if the CoreScripts haven't registered it yet.
	local ok = pcall(StarterGui.SetCore, StarterGui, "SendNotification", {
		Title = "Hello!",
		Text = message,
		Duration = 5,
	})
	if not ok then
		print(message)
	end
end)
