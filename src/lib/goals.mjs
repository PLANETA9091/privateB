// Single shared import point for mineflayer-pathfinder's exports. Modules that only need
// `goals` (deposit, scripts, tests) should import from here so the plugin package is
// loaded exactly once and unit tests have one place to mock.
import pathfinderPkg from 'mineflayer-pathfinder'

export const { pathfinder, Movements, goals } = pathfinderPkg
