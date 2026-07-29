import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { setAudio, setGameUX, setSim } from "../../store/settingsSlice";
import { SoundManager } from "../../services/sound/SoundManager";

const CHANCE_CONTROLS = [
  ["battleBackChance", "Battle Back"],
  ["specialSafetyChance", "Special Safety"],
  ["doubleEvictionChance", "Double Eviction"],
  ["dayStartShockChance", "Morning Shock"],
] as const;

export default function SimulationDebugControls() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings);

  return (
    <>
      <section className="dbg-section">
        <h3 className="dbg-section__title">Simulation switches</h3>
        <div className="dbg-toggle-grid">
          <label>
            <input
              type="checkbox"
              checked={settings.sim.enableTwists}
              onChange={(event) =>
                dispatch(setSim({ enableTwists: event.target.checked }))
              }
            />
            Twists
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.gameUX.dramaMode}
              onChange={(event) =>
                dispatch(
                  setGameUX({
                    dramaMode: event.target.checked,
                    dramaModeAdminOverride: event.target.checked,
                  }),
                )
              }
            />
            Reality Mode
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.sim.publicMode}
              onChange={(event) =>
                dispatch(
                  setSim({
                    publicMode: event.target.checked,
                    publicModeAdminOverride: event.target.checked,
                  }),
                )
              }
            />
            Public Mode
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.sim.enableJuryHouse}
              onChange={(event) =>
                dispatch(setSim({ enableJuryHouse: event.target.checked }))
              }
            />
            Tribunal House
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.sim.enableFavoritePlayer}
              onChange={(event) =>
                dispatch(setSim({ enableFavoritePlayer: event.target.checked }))
              }
            />
            Public Favorite
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.sim.allowSelfEvict}
              onChange={(event) =>
                dispatch(setSim({ allowSelfEvict: event.target.checked }))
              }
            />
            Self Eviction
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.gameUX.spectatorMode}
              onChange={(event) =>
                dispatch(setGameUX({ spectatorMode: event.target.checked }))
              }
            />
            Spectator Mode
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.gameUX.animations}
              onChange={(event) =>
                dispatch(setGameUX({ animations: event.target.checked }))
              }
            />
            Animations
          </label>
        </div>
      </section>

      <section className="dbg-section">
        <h3 className="dbg-section__title">Twist probabilities</h3>
        {CHANCE_CONTROLS.map(([key, label]) => (
          <label className="dbg-range" key={key}>
            <span>{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={settings.sim[key]}
              onChange={(event) =>
                dispatch(setSim({ [key]: Number(event.target.value) }))
              }
            />
            <output>{settings.sim[key]}%</output>
          </label>
        ))}
        <label className="dbg-range">
          <span>Secret Mission</span>
          <input
            type="range"
            min={-1}
            max={100}
            value={settings.sim.secretMissionTriggerOverride ?? -1}
            onChange={(event) => {
              const value = Number(event.target.value);
              dispatch(
                setSim({
                  secretMissionTriggerOverride: value < 0 ? null : value,
                }),
              );
            }}
          />
          <output>
            {settings.sim.secretMissionTriggerOverride === null
              ? "default"
              : `${settings.sim.secretMissionTriggerOverride}%`}
          </output>
        </label>
        <label className="dbg-range">
          <span>Mission Week</span>
          <input
            type="range"
            min={0}
            max={20}
            value={settings.sim.secretMissionTriggerWeekOverride ?? 0}
            onChange={(event) => {
              const value = Number(event.target.value);
              dispatch(
                setSim({
                  secretMissionTriggerWeekOverride: value === 0 ? null : value,
                }),
              );
            }}
          />
          <output>
            {settings.sim.secretMissionTriggerWeekOverride ?? "off"}
          </output>
        </label>
        <div className="dbg-row">
          <button
            className="dbg-btn dbg-btn--wide"
            onClick={() =>
              dispatch(
                setSim({
                  battleBackChance: 100,
                  specialSafetyChance: 100,
                  doubleEvictionChance: 100,
                  dayStartShockChance: 100,
                }),
              )
            }
          >
            All 100%
          </button>
          <button
            className="dbg-btn dbg-btn--wide"
            onClick={() =>
              dispatch(
                setSim({
                  battleBackChance: 0,
                  specialSafetyChance: 0,
                  doubleEvictionChance: 0,
                  dayStartShockChance: 0,
                }),
              )
            }
          >
            All 0%
          </button>
        </div>
      </section>

      <section className="dbg-section">
        <h3 className="dbg-section__title">Audio & presentation</h3>
        <dl className="dbg-grid">
          <dt>Music</dt>
          <dd>{settings.audio.musicOn ? "on" : "off"}</dd>
          <dt>SFX</dt>
          <dd>{settings.audio.sfxOn ? "on" : "off"}</dd>
          <dt>Current track</dt>
          <dd>{SoundManager.currentMusicKey ?? "—"}</dd>
          <dt>BGM owner</dt>
          <dd>{SoundManager.currentBgmOwner ?? "—"}</dd>
        </dl>
        <div className="dbg-row">
          <button
            className="dbg-btn"
            onClick={() => {
              dispatch(setAudio({ sfxOn: true }));
              void SoundManager.unlockFromGesture();
              void SoundManager.play("ui:confirm");
            }}
          >
            Test Confirm
          </button>
          <button
            className="dbg-btn"
            onClick={() => {
              dispatch(setAudio({ sfxOn: true }));
              void SoundManager.unlockFromGesture();
              void SoundManager.play("ui:error");
            }}
          >
            Test Error
          </button>
          <button className="dbg-btn" onClick={() => SoundManager.stopMusic()}>
            Stop Music
          </button>
          <button className="dbg-btn" onClick={() => SoundManager.debugDump()}>
            Log Audio State
          </button>
        </div>
      </section>
    </>
  );
}
