extends Node
## Sound effects, music and haptics. Registered as the "Audio" autoload.

const SFX_DIR := "res://assets/audio/"
const VOICES := 14

var _streams := {}
var _players: Array[AudioStreamPlayer] = []
var _next := 0
var _music: AudioStreamPlayer
var _last_played := {}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_buses()
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_players.append(p)
	_music = AudioStreamPlayer.new()
	_music.bus = "Music"
	_music.volume_db = -7.0
	add_child(_music)
	var music_path := SFX_DIR + "music.ogg"
	if ResourceLoader.exists(music_path):
		var stream: AudioStream = load(music_path)
		if stream is AudioStreamOggVorbis:
			stream.loop = true
		_music.stream = stream
	Save.settings_changed.connect(_apply_settings)
	_apply_settings()


func _setup_buses() -> void:
	for bus_name in ["SFX", "Music"]:
		if AudioServer.get_bus_index(bus_name) == -1:
			AudioServer.add_bus()
			var idx := AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, bus_name)
			AudioServer.set_bus_send(idx, "Master")
	# Gentle limiter so stacked merges never clip.
	var master := AudioServer.get_bus_index("Master")
	if AudioServer.get_bus_effect_count(master) == 0:
		var lim := AudioEffectHardLimiter.new()
		lim.ceiling_db = -0.8
		AudioServer.add_bus_effect(master, lim)


func _apply_settings() -> void:
	AudioServer.set_bus_mute(AudioServer.get_bus_index("SFX"), not Save.get_setting("sfx"))
	var music_on := Save.get_setting("music")
	AudioServer.set_bus_mute(AudioServer.get_bus_index("Music"), not music_on)
	if music_on and _music.stream and not _music.playing:
		_music.play()
	elif not music_on and _music.playing:
		_music.stop()


func _stream(sound: String) -> AudioStream:
	if not _streams.has(sound):
		var path := SFX_DIR + sound + ".wav"
		_streams[sound] = load(path) if ResourceLoader.exists(path) else null
	return _streams[sound]


## Plays a one-shot sound. min_gap stops the same sound machine-gunning.
func play(sound: String, pitch: float = 1.0, volume_db: float = 0.0, min_gap: float = 0.03) -> void:
	var stream := _stream(sound)
	if stream == null:
		return
	var now := Time.get_ticks_msec() / 1000.0
	if now - _last_played.get(sound, -10.0) < min_gap:
		return
	_last_played[sound] = now
	var p := _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = stream
	p.pitch_scale = pitch
	p.volume_db = volume_db
	p.play()


func play_music() -> void:
	if Save.get_setting("music") and _music.stream and not _music.playing:
		_music.play()


## Short vibration on phones; strength 0..1.
func buzz(duration_ms: int, strength: float = 0.5) -> void:
	if not Save.get_setting("haptics"):
		return
	if OS.has_feature("mobile"):
		Input.vibrate_handheld(duration_ms, clampf(strength, 0.05, 1.0))
