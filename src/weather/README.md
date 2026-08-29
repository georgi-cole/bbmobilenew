# Weather system

The weather module enriches the existing Day Start and Day End cards without adding new game phases.

## Player-facing flow

1. **Day Start** uses the existing faux-TV transition card and shows the day's resolved weather.
2. Normal gameplay continues unchanged.
3. During the existing **social_2** phase, one minor weather bulletin is added after the normal social beat. It includes the current temperature plus contextual flavour copy.
4. **Day End** uses the existing transition card, rendered as a weather-aware sunset/night treatment.

Depression Shock remains authoritative. Its active storm days suppress the generic late-day bulletin, and its recovery presentation can force the rainbow treatment.

## External files

Canonical weather tuning and copy are served from GitHub Pages with the rest of the public configuration:

- `public/config/weather-config.json` - simulation rules, temperature ranges, condition weights, transition weights and phenomenon probability.
- `public/config/weather-bank.json` - Day Start/Day End copy and the weighted late-day bulletin databank.

Development automatically reads `/config/weather-config.json` and `/config/weather-bank.json`, while packaged builds use `https://georgi-cole.github.io/bbmobilenew/config/`.

Both documents are validated before use. Unknown weather states, invalid numbers and malformed copy entries are discarded. Remote files are pure data only - they cannot execute JavaScript or inject CSS.

## Weather model

Weather is deterministic per `gameId` but stateful across days. A day's condition is selected from the previous condition's weighted transition table, so consecutive identical conditions are intentionally valid.

Current base conditions are:

- sunny
- mostly_sunny
- partly_cloudy
- cloudy
- overcast
- misty
- foggy
- drizzle
- light_showers
- sun_showers
- rainy
- heavy_rain
- stormy
- snow_showers
- snowy
- clearing

`rainbow` is a phenomenon/modifier rather than a base condition. It can occur when sunlight returns around wet weather. `sunset` and `starry` are Day End presentation states, not additional phases.

## Persistence

Once a day is resolved, its condition, temperature, streak and phenomenon are retained under the game's stable `gameId`. A later remote configuration change therefore affects future unresolved days without rewriting weather the player has already seen.

The selected late-day bulletin ID is also retained so recent copy can be avoided where alternatives exist.

## Temperature units

Temperature is stored internally in Celsius. Presentation uses the weather config's `temperature.unit`:

- `c` - always Celsius
- `f` - always Fahrenheit
- `auto` - Fahrenheit in common Fahrenheit-using locales and Celsius elsewhere

Temperature differences are converted separately, so a 5°C change is presented as a 9°F change rather than as an absolute-temperature conversion.

## Editing guidance

For normal content changes, edit `weather-bank.json`. For simulation behaviour, edit `weather-config.json`.

Keep transition weights relative rather than trying to make every row sum to 100; the engine normalises them automatically. Same-condition weights are expected and are what make multi-day weather spells possible.

Bulletin templates support these placeholders:

- `{temp}` - formatted current temperature
- `{delta}` - absolute change since yesterday, in the active unit
- `{streak}` - consecutive days with the exact same base condition
- `{player}` - one living AI player
- `{players}` - two living AI players where possible
- `{condition}` - human-readable base condition

Bulletin eligibility can be constrained by `conditions`, `phenomenon`, `minTempC`, `maxTempC`, `minDeltaC`, `maxDeltaC` and `minStreak`.
