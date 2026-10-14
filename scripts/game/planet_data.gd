class_name PlanetData
## Static description of every planet tier, from the smallest asteroid to the Sun.

const COUNT := 11
const SUN := 10
## Tiers the dropper can hand out.
const DROPPABLE := 5
## Relative odds for each droppable tier.
const DROP_WEIGHTS: Array[float] = [26.0, 24.0, 20.0, 16.0, 14.0]

const NAMES: Array[String] = [
	"Asteroid", "Moon", "Mercury", "Mars", "Venus", "Earth",
	"Neptune", "Uranus", "Saturn", "Jupiter", "Sun",
]

const KEYS: Array[String] = [
	"asteroid", "moon", "mercury", "mars", "venus", "earth",
	"neptune", "uranus", "saturn", "jupiter", "sun",
]

## Radius in world pixels (the jar is 600 px wide inside).
const RADII: Array[float] = [22.0, 30.0, 39.0, 49.0, 60.0, 72.0, 85.0, 99.0, 114.0, 129.0, 145.0]

## Points for creating a planet of this tier by merging.
const POINTS: Array[int] = [0, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66]
const SUPERNOVA_POINTS := 500

## Main colour of each body: particles, UI accents and silhouettes.
const COLORS: Array[Color] = [
	Color("8a7a6b"), Color("d9d8d4"), Color("b8977a"), Color("d9612e"), Color("f5cf7a"),
	Color("3f8fd8"), Color("3d63e0"), Color("8fe0e3"), Color("e8cf92"), Color("d9a46e"),
	Color("ffd34d"),
]

## Atmosphere glow colour and strength.
const RIM_COLORS: Array[Color] = [
	Color("6b6158"), Color("c4d2ff"), Color("ffd8b0"), Color("ff9a6b"), Color("ffe6a8"),
	Color("7cc4ff"), Color("6f9bff"), Color("b8fbff"), Color("ffe9b5"), Color("ffd9a8"),
	Color("ffb347"),
]
const RIM_STRENGTH: Array[float] = [0.0, 0.12, 0.08, 0.35, 0.65, 0.85, 0.75, 0.7, 0.45, 0.45, 0.0]

const FACTS: Array[String] = [
	"Rocky leftovers from when the planets formed, 4.6 billion years ago.",
	"The Moon drifts about 3.8 cm farther away from Earth every year.",
	"A whole year on Mercury lasts just 88 Earth days.",
	"Mars has Olympus Mons, a volcano nearly three times taller than Everest.",
	"Venus spins backwards, and its day is longer than its year.",
	"Our home: the only world known to have life and open oceans.",
	"Neptune has the fastest winds in the Solar System, over 2,000 km/h.",
	"Uranus rolls around the Sun on its side, tipped over by 98 degrees.",
	"Saturn is so light it would float in a big enough bathtub.",
	"Jupiter's Great Red Spot is a storm wider than the whole Earth.",
	"About 1.3 million Earths could fit inside the Sun.",
]


static func albedo(tier: int) -> Texture2D:
	return load("res://assets/planets/%s.png" % KEYS[tier])


static func normal_map(tier: int) -> Texture2D:
	return load("res://assets/planets/%s_n.png" % KEYS[tier])


static func spec_map(tier: int) -> Texture2D:
	var path := "res://assets/planets/%s_s.png" % KEYS[tier]
	return load(path) if ResourceLoader.exists(path) else null


## Collision radius; the lumpy asteroid sits a little inside its sprite.
static func collision_radius(tier: int) -> float:
	return RADII[tier] * (0.9 if tier == 0 else 1.0)


static func mass(tier: int) -> float:
	return pow(RADII[tier] / 40.0, 2.0)
