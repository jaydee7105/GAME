--!strict
-- Game-wide constants, shared by the server and the client.

local Config = {
	STARTING_COINS = 0,
	WELCOME_MESSAGE = "Welcome to the game!",
}

return table.freeze(Config)
