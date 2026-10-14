extends Node
## Persistent player data: settings, records, stats, discoveries and the
## in-progress run. Registered as the "Save" autoload.

signal settings_changed

const PATH := "user://save.json"
const VERSION := 1

var settings := {
	"music": true,
	"sfx": true,
	"haptics": true,
	"faces": true,
	"guide": true,
}
var best := 0
var daily_best := {}          # "YYYY-MM-DD" -> score
var daily_streak := 0
var daily_last := ""          # last date a daily run was finished
var discovered: Array[bool] = []
var created: Array[int] = []
var stats := {
	"games": 0,
	"merges": 0,
	"supernovas": 0,
	"drops": 0,
	"seconds": 0.0,
}
var tutorial_done := false
var snapshot: Dictionary = {}  # in-progress run, empty when none

var _dirty := false


func _init() -> void:
	discovered.resize(PlanetData.COUNT)
	discovered.fill(false)
	created.resize(PlanetData.COUNT)
	created.fill(0)


func _ready() -> void:
	load_data()


func get_setting(key: String) -> bool:
	return settings.get(key, true)


func set_setting(key: String, value: bool) -> void:
	settings[key] = value
	save_data()
	settings_changed.emit()


func is_discovered(tier: int) -> bool:
	return discovered[tier]


func discovered_count() -> int:
	return discovered.count(true)


## Marks a planet as discovered. Returns true the first time.
func discover(tier: int) -> bool:
	created[tier] += 1
	_dirty = true
	if discovered[tier]:
		return false
	discovered[tier] = true
	save_data()
	return true


## Marks a planet as seen (dropped into the jar) without counting it as made.
func mark_seen(tier: int) -> bool:
	if discovered[tier]:
		return false
	discovered[tier] = true
	save_data()
	return true


static func today() -> String:
	var d := Time.get_date_dict_from_system()
	return "%04d-%02d-%02d" % [d.year, d.month, d.day]


static func _day_number(date: String) -> int:
	var unix := Time.get_unix_time_from_datetime_string(date + "T12:00:00")
	return int(floor(unix / 86400.0))


## A stable seed for today's daily challenge.
static func daily_seed(date: String = "") -> int:
	if date == "":
		date = today()
	return hash("planet-drop-daily-" + date)


func todays_daily_best() -> int:
	return daily_best.get(today(), 0)


## Streak that is still alive today (0 if the player missed a day).
func live_streak() -> int:
	if daily_last == "":
		return 0
	var gap := _day_number(today()) - _day_number(daily_last)
	return daily_streak if gap <= 1 else 0


## Records a finished run. Returns true if it set a new best for its mode.
func record_game(mode: String, score: int, seconds: float) -> bool:
	stats.games += 1
	stats.seconds += seconds
	var new_best := false
	if mode == "daily":
		var key := today()
		if score > daily_best.get(key, 0):
			new_best = daily_best.get(key, 0) > 0 or score > 0
			daily_best[key] = score
		if daily_last != key:
			daily_streak = live_streak() + 1
			daily_last = key
		# Keep the file small: only the last 60 days.
		if daily_best.size() > 60:
			var keys := daily_best.keys()
			keys.sort()
			for k in keys.slice(0, keys.size() - 60):
				daily_best.erase(k)
	else:
		if score > best:
			new_best = best > 0 or score > 0
			best = score
	save_data()
	return new_best


func add_stat(key: String, amount: float = 1.0) -> void:
	stats[key] = stats.get(key, 0) + amount
	_dirty = true


func set_snapshot(data: Dictionary) -> void:
	snapshot = data
	save_data()


func clear_snapshot() -> void:
	if snapshot.is_empty():
		return
	snapshot = {}
	save_data()


func has_snapshot() -> bool:
	return not snapshot.is_empty()


func reset_progress() -> void:
	var keep := settings.duplicate()
	_init()
	best = 0
	daily_best = {}
	daily_streak = 0
	daily_last = ""
	stats = {"games": 0, "merges": 0, "supernovas": 0, "drops": 0, "seconds": 0.0}
	tutorial_done = false
	snapshot = {}
	settings = keep
	save_data()


func flush() -> void:
	if _dirty:
		save_data()


func save_data() -> void:
	_dirty = false
	var data := {
		"version": VERSION,
		"settings": settings,
		"best": best,
		"daily_best": daily_best,
		"daily_streak": daily_streak,
		"daily_last": daily_last,
		"discovered": discovered,
		"created": created,
		"stats": stats,
		"tutorial_done": tutorial_done,
		"snapshot": snapshot,
	}
	var tmp := PATH + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("Could not write save file: %s" % FileAccess.get_open_error())
		return
	f.store_string(JSON.stringify(data))
	f.close()
	DirAccess.rename_absolute(tmp, PATH)


func load_data() -> void:
	if not FileAccess.file_exists(PATH):
		return
	var text := FileAccess.get_file_as_string(PATH)
	var data = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		push_warning("Save file was unreadable; starting fresh.")
		return
	for k in settings.keys():
		if data.get("settings", {}).has(k):
			settings[k] = bool(data.settings[k])
	best = int(data.get("best", 0))
	daily_best = {}
	for k in data.get("daily_best", {}):
		daily_best[k] = int(data.daily_best[k])
	daily_streak = int(data.get("daily_streak", 0))
	daily_last = str(data.get("daily_last", ""))
	var disc: Array = data.get("discovered", [])
	for i in mini(disc.size(), PlanetData.COUNT):
		discovered[i] = bool(disc[i])
	var made: Array = data.get("created", [])
	for i in mini(made.size(), PlanetData.COUNT):
		created[i] = int(made[i])
	for k in stats.keys():
		if data.get("stats", {}).has(k):
			stats[k] = data.stats[k]
	tutorial_done = bool(data.get("tutorial_done", false))
	var snap = data.get("snapshot", {})
	snapshot = snap if typeof(snap) == TYPE_DICTIONARY else {}
