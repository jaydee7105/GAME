# Planet Drop

Drop cute planets into a jar, merge matching ones, and grow your way from a
tiny asteroid all the way to the Sun. A physics merge puzzle for Android, made
with Godot 4.7.

![Feature graphic](store/feature_graphic_1024x500.png)

## Features

- 11 planets, from Asteroid to Sun, modelled procedurally in Blender
  (`art/blender/`) and lit in real time so they can roll freely
- Chain reactions with score multipliers, and a **Supernova** when two Suns merge
- Power-ups: **Black Hole** (remove a planet) and **Shake** (jolt the jar)
- **Daily Challenge** with the same drop sequence for everyone, plus streaks
- Planet collection with fun facts, stats, and a first-run tutorial
- Your run is saved automatically and resumes after the app is closed
- Synthesized sound effects and ambient music (`art/audio/synth.py`)
- Haptics, safe-area support, Android back button, no ads, no tracking

## Project layout

| Path | What |
|---|---|
| `scripts/game/` | Gameplay: world, planets, jar, dropper, effects |
| `scripts/ui/` | HUD and screens (title, pause, game over, settings, planets) |
| `scripts/autoload/` | `Save` (persistence) and `Audio` (sound, music, haptics) |
| `shaders/planet.gdshader` | Lights the Blender albedo + normal maps |
| `assets/` | Generated art, audio and the Fredoka font (OFL) |
| `art/` | Sources that generate the assets (Blender, audio, store tools) |
| `store/` | Play Store icon, feature graphic, screenshots and listing text |
| `docs/` | Publishing guide and privacy policy |

## Running it

Open the folder in Godot 4.7 and press Play. Desktop testing uses the mouse:
drag to aim, release to drop, and press Esc to pause.

## Building for Android

GitHub Actions builds a signed `.aab` and a test `.apk` on every push.
See **[docs/PUBLISHING.md](docs/PUBLISHING.md)** for signing keys and the
Google Play steps.

## Regenerating assets

```bash
pip install bpy pillow numpy scipy        # Blender as a Python module
python art/blender/planets.py             # planets + Saturn's rings
python art/blender/background.py          # nebula backdrop
python art/audio/synth.py                 # sound effects + music (needs ffmpeg)
```

Store art is rendered by the game itself:

```bash
godot --path . -- --scene=icon --shots=out       # app icons
godot --path . -- --scene=feature --shots=out    # feature graphic
godot --path . --resolution 1080x1920 -- --scene=showcase --shots=out
python art/tools/store_screens.py out            # captioned screenshots
```

Other test scenes: `title`, `supernova`, `powerups`, `pause`, `resume`,
`gameover`, `collection`, `tutorial`, or `--autoplay --every=3 --count=5`.
