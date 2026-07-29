# QA Control Center

The QA Control Center is the single entry point for testing the game in local,
preview, mobile, and published builds.

## Opening it

- Local development: open any route with `?debug=1`.
- Published web or mobile build: open once with `?debug=1&qa=1`.
- Hash-router example: `/#/game?debug=1&qa=1`.
- While a QA session is enabled, press `Ctrl+Shift+D` to toggle the drawer.

An explicitly enabled published QA session is remembered on that device, so
normal navigation does not make the controls disappear. Use **End QA Session**
in the Tools section to remove that access. Remote QA sessions retain normal
gameplay choreography; opening the tools does not enable local-only automatic
phase skips.

## What is centralized

- Live season inspector and player roster
- Phase advancement, fast-forwarding, stuck-state recovery, and season reset
- LOH, nominees, POS, player status, Final 4, twists, and Secret Missions
- Runtime simulation switches and every twist probability override
- Incoming social interaction generation, scheduling, memory pressure, and logs
- Reality simulation RNG, trace, event, alliance, romance, and grievance metrics
- Finale initialization, vote forcing, seed rerolls, and fast-forwarding
- Minigame selection, deterministic seeds, rules/countdown bypasses, and the full
  registry-backed Minigame Auditor
- Survivor-mode lifecycle controls
- Audio probes and current BGM ownership
- Core state-invariant checks and the last captured runtime error
- A bounded history of the latest Redux actions
- Local checkpoints plus JSON campaign snapshot import/export
- Full diagnostic report and Reality trace exports
- Layout overlay and quick links to important QA surfaces

## Snapshot safety

**Save Checkpoint** stores one campaign checkpoint on the current device.
**Restore Checkpoint** and **Import Snapshot** ask for confirmation before
replacing the active campaign. Exports include game, finale, challenge, social,
public-opinion, settings, and entitlement context; restores intentionally
replace only resumable campaign slices so device-level settings and purchases
cannot be overwritten by an imported file.

## Release behavior

The control center and Minigame Auditor are included in production bundles, but
remain invisible without explicit QA access. The normal release build check
still rejects mutable global Redux/E2E backdoors.
