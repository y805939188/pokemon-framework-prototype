// Only the audited private native launcher opts into this profile dialect.
// The legacy/headless scoped stage continues to require the literal profile root.
export const NATIVE_PROFILE_FILE = ".pf-native-launch-profile";
export const MAC_NW_PROFILE_DEFAULT = "darwin-arm64-nw0.117.0-chromium154.0.8037.58-profile-default-v1";
export const isolatedNativeAppName = (epoch: string): string => "pf-step6d-launch-" + epoch.slice(0, 24);
