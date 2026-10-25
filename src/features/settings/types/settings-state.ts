export type Density = 'compact' | 'cozy' | 'spacious';

export interface SettingsState {
  density: Density;
  setDensity: (density: Density) => void;
}
