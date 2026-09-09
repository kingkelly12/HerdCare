// Card is now a thin alias over the elevation system in Surface.tsx, kept so existing screens
// keep working while they migrate to picking an explicit elevation.
export { Surface as Card, PressableSurface as PressableCard } from './Surface';
export type { Elevation } from './Surface';
