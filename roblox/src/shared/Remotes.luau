--!strict
-- Typed handles to the RemoteEvents declared in default.project.json
-- (ReplicatedStorage.Remotes). Add new remotes there, then expose them here.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local folder = ReplicatedStorage:WaitForChild("Remotes")

return {
	Welcome = folder:WaitForChild("Welcome") :: RemoteEvent,
}
