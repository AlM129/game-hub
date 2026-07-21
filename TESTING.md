# Game Hub - Testing Guide

## Overview

This document describes the automated smoke testing system for Game Hub using Playwright and Electron.

## Setup

### Install Dependencies

```bash
npm install
```

### Install Playwright Browsers

```bash
npx playwright install chromium
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Smoke Tests Only

```bash
npm run test:smoke
```

### Run Specific Test File

```bash
npx playwright test tests/launcher.spec.js
npx playwright test tests/games.spec.js
npx playwright test tests/bridge.spec.js
```

### Run Tests with UI

```bash
npx playwright test --ui
```

## Test Structure

```
tests/
├── launcher.spec.js      # Launcher startup and navigation tests
├── games.spec.js         # Game registry, file health, and launch tests
├── bridge.spec.js        # Bridge integration tests
└── helpers/
    └── electron.js       # Reusable Electron launch/setup code
```

## Test Coverage

### ✅ Covered

- **Launcher Loading**
  - Electron app launches successfully
  - Window appears with correct title
  - No JavaScript errors on load
  - No uncaught exceptions

- **Navigation**
  - Home view loads
  - Games Library view loads
  - Achievements view loads
  - Statistics view loads
  - Settings view loads
  - Navigation buttons are functional

- **Game Registry & File Health**
  - All stable game HTML files exist
  - All beta game HTML files exist
  - All game JS files exist
  - Game thumbnails exist

- **Game Launch Smoke Tests**
  - Launcher displays all stable games
  - Can navigate to game details (Sky Ace, Neon Survival, Tactical Drone Defense)
  - Game details page has play button
  - Game details page has back button
  - Can return to launcher from game details

- **Bridge Communication**
  - `game_started` event queuing
  - `game_closed` event queuing
  - `achievement_unlock` event queuing
  - Launcher processes queued events on load
  - Bridge queue handles multiple events
  - Bridge queue survives page navigation
  - Invalid events are rejected with warnings
  - Achievement unlocks update launcher storage
  - Event structure validation

### ❌ Not Covered

- **Gameplay Mechanics**
  - Combat systems
  - Physics accuracy
  - Scoring systems
  - Player skill requirements
  - Game balance

- **AI Behavior**
  - Enemy AI patterns
  - Pathfinding
  - Difficulty scaling

- **Visual/Audio**
  - Graphics rendering quality
  - Audio synchronization
  - Animation smoothness
  - Visual effects

- **Performance**
  - Frame rate stability
  - Memory usage
  - Load times
  - Optimization effectiveness

- **Edge Cases**
  - Network failures (games are offline)
  - Storage corruption recovery
  - Browser compatibility (Electron only)
  - Multi-monitor setups

## Test Philosophy

These are **smoke tests**, not comprehensive integration tests. The goal is to catch:

1. **Launcher regressions** - Broken navigation, missing elements, JS errors
2. **Missing files** - Games with broken paths or missing assets
3. **Bridge failures** - Communication breakdown between launcher and games
4. **Console errors** - Uncaught exceptions, failed imports, validation errors

## Writing New Tests

### Guidelines

1. **Keep tests focused** - Test one thing per test case
2. **Use helpers** - Leverage `tests/helpers/electron.js` for common operations
3. **Clean up** - Always clean up localStorage in afterEach/afterAll hooks
4. **Avoid gameplay** - Don't test game mechanics, only launch/return flow
5. **Fast execution** - Tests should complete in seconds, not minutes

### Example Test Pattern

```javascript
test('should do something', async () => {
    const app = await launchGameHub();
    const window = await waitForLauncher(app);
    
    // Setup
    // ...
    
    // Action
    // ...
    
    // Assert
    // ...
    
    await app.close();
});
```

## Troubleshooting

### Tests Fail to Launch Electron

- Ensure Electron is installed: `npm install`
- Check that `main.js` exists in project root
- Verify Electron version compatibility

### Playwright Browser Not Found

```bash
npx playwright install chromium
```

### Tests Timeout

- Increase timeout in test configuration
- Check for slow network requests
- Verify Electron is not hanging on startup

### Bridge Tests Fail

- Verify localStorage is accessible
- Check that test cleanup is working
- Ensure no leftover state from previous tests

## CI/CD Integration

To run tests in CI:

```bash
# Install dependencies
npm ci

# Install Playwright browsers
npx playwright install --with-deps chromium

# Run tests
npm run test:smoke
```

## Known Limitations

1. **Electron-only** - Tests require Electron, not Chrome
2. **No gameplay testing** - Games are not played automatically
3. **Limited bridge testing** - Full event processing requires manual verification
4. **No visual regression** - Screenshot comparison not implemented
5. **Single platform** - Tests run on current OS only

## Future Improvements

- Add screenshot comparison for visual regression
- Add performance benchmarks
- Add network request interception
- Add test data factories
- Add parallel test execution
- Add test reporting dashboard