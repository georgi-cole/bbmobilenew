const SAFE_ZONE_MIN = 2;
const GRACE_TIMER = 1.0;
const DANGER_ZONE_TIME = 75; // seconds until safe zone shrinks
const FALL_THRESHOLD = ...; // define your existing fall threshold

// New refs for managing time-ramping wind force
const windForce = useRef({ direction: 0, intensity: 0 });
const startTime = useRef(performance.now());

// Update movement logic to include new time-ramping wind force
const updatePlankMovement = () => {
    const elapsed = (performance.now() - startTime.current) / 1000; // Convert milliseconds to seconds
    const dt = ...; // existing deltaTime calculation

    // (1) Non-linear shrink of safe zone
    const shrinkRate = Math.max(SAFE_ZONE_MIN, initialSafeZone - (elapsed / DANGER_ZONE_TIME));
    if (currentZone < shrinkRate) {
        // Logic to handle when the current zone is breached
    }

    // (2) Grace timer outside safe zone
    if (currentZone < minSafeZone) {
        const outsideTime = elapsed - graceStartTime; // Calculate time outside safe zone
        if (outsideTime > GRACE_TIMER) {
            endGame(startTime.current);
        }
    } else {
        graceStartTime = elapsed; // Reset grace timer when within safe zone
    }

    // (3) Wind force effect
    windForce.current.direction += dt * windChangeRate; // Change direction over time
    windForce.current.intensity = calculateIntensity(elapsed); // Modify intensity based on some condition
    applyWindForce(windForce.current);

    // Continue existing surge events
    handleSurgeEvents();
};

function applyWindForce(force) {
    // Your logic to apply the wind force to the plank
}

function calculateIntensity(elapsed) {
    // Return intensity based on elapsed time
}

function handleSurgeEvents() {
    // Existing surge event logic
}

// Call updatePlankMovement in your game loop
