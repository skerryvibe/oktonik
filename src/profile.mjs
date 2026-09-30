// Packaging selects the default; tests can explicitly exercise either profile.
export const BUILD_PROFILE = 'lab';
export const PRODUCT_NAME = 'OKTONIK';
export const PRODUCT_VERSION = '0.1.0-rc.4';
export const moduleId = (profile = BUILD_PROFILE) => profile === 'public' ? 'oktonik' : 'oktonik-lab';
export const globalStatePath = (profile = BUILD_PROFILE) => `/data/UserData/schwung/modules/tools/${moduleId(profile)}/state-v7.json`;
export const PRODUCT_TAGLINE = 'Harmonic performance instrument';
export const PUBLIC_PAGES = Object.freeze(['PLAY', 'CHORDS', 'MELODY', 'BASS', 'MIDI']);
