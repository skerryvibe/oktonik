// Packaging selects the default; tests can explicitly exercise either profile.
export const BUILD_PROFILE = 'lab';
export const PRODUCT_NAME = 'OKTONIK';
export const PRODUCT_VERSION = '0.2.0';
export const LAB_VERSION = '0.1.0-lab.47';
export const moduleId = (profile = BUILD_PROFILE) => profile === 'public' ? 'oktonik' : 'oktonik-lab';
export const globalStatePath = (profile = BUILD_PROFILE) => `/data/UserData/schwung/modules/tools/${moduleId(profile)}/state-v7.json`;
export const PRODUCT_TAGLINE = 'Harmonic performance instrument';
export const PUBLIC_PAGES = Object.freeze(['PLAY', 'CHORDS', 'MELODY', 'BASS', 'MIDI']);

// One implementation, different exposure. Never copy a Public engine into Lab.
// Public 0.2.0 candidate uses the shared clip engine; experimental capabilities
// remain Lab-only. Installed module IDs and project settings stay independent.
const LIVE_FEATURES = ['liveHarmony','bassGesture','melodyPolyPressure','coRun','projectSaves'];
export const PUBLIC_020_FEATURES = Object.freeze([...LIVE_FEATURES,
  'clips','recording','trackNavigation','partMute','buttonLights',
  'soloPalettes','targetMelody','extensionProfiles','editableModifiers',
  'profileApproaches','registerLead','bassPadSurface','advancedStrum']);
const LAB_FEATURES = Object.freeze([...PUBLIC_020_FEATURES,
  'ideas','capture','smartBass','ensemble','partExpression','arp']);
const PUBLIC_FEATURES = PUBLIC_020_FEATURES;
export function featuresFor(profile = BUILD_PROFILE) {
  if(profile !== 'lab' && profile !== 'public')throw new Error('Unknown OKTONIK profile');
  return profile === 'lab' ? LAB_FEATURES : PUBLIC_FEATURES;
}
