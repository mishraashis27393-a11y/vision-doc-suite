/**
 * Google AdMob monetization layer.
 *
 * The web preview cannot load the native AdMob SDK, so this module:
 *  - keeps a single source of truth for the ad unit IDs,
 *  - always uses Google's official TEST ad unit IDs in development,
 *  - uses the configured production IDs in a production build,
 *  - talks to the native AdMob plugin (`@capacitor-community/admob`) when the
 *    app runs inside the Android wrapper, and renders an in-app house
 *    placeholder on the web so layout/frequency logic stays identical.
 */

export type AdIds = {
  appId: string;
  banner: string;
  interstitial: string;
  rewarded: string;
};

/** Official Google AdMob test unit IDs — safe to use during development. */
export const TEST_AD_IDS: AdIds = {
  appId: "ca-app-pub-3940256099942544~3347511713",
  banner: "ca-app-pub-3940256099942544/6300978111",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
};

const STORAGE_KEY = "dcr.admob.ids";

export function isProduction() {
  return import.meta.env.PROD;
}

export function loadAdIds(): AdIds {
  if (typeof localStorage === "undefined") return TEST_AD_IDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return TEST_AD_IDS;
    const parsed = JSON.parse(raw) as Partial<AdIds>;
    return { ...TEST_AD_IDS, ...parsed };
  } catch {
    return TEST_AD_IDS;
  }
}

export function saveAdIds(ids: AdIds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

/** Ad IDs actually used at runtime: test in dev, configured real IDs in prod. */
export function activeAdIds(): AdIds {
  return isProduction() ? loadAdIds() : TEST_AD_IDS;
}

export function adsRemoved() {
  return typeof localStorage !== "undefined" && localStorage.getItem("dcr.ads.removed") === "1";
}

export function setAdsRemoved(value: boolean) {
  localStorage.setItem("dcr.ads.removed", value ? "1" : "0");
}

type NativeAdMob = {
  initialize: (o: unknown) => Promise<void>;
  showBanner: (o: unknown) => Promise<void>;
  hideBanner?: () => Promise<void>;
  prepareInterstitial: (o: unknown) => Promise<void>;
  showInterstitial: () => Promise<void>;
  prepareRewardVideoAd: (o: unknown) => Promise<void>;
  showRewardVideoAd: () => Promise<unknown>;
};

function nativeAdMob(): NativeAdMob | null {
  const w = window as unknown as { AdMob?: NativeAdMob; Capacitor?: { Plugins?: { AdMob?: NativeAdMob } } };
  return w.Capacitor?.Plugins?.AdMob ?? w.AdMob ?? null;
}

export function isNativeAds() {
  return typeof window !== "undefined" && !!nativeAdMob();
}

let initialized = false;

export async function initAds() {
  if (initialized || adsRemoved()) return;
  initialized = true;
  const plugin = nativeAdMob();
  if (!plugin) return;
  await plugin.initialize({ initializeForTesting: !isProduction() }).catch(() => {});
}

export async function showBannerAd() {
  if (adsRemoved()) return;
  const plugin = nativeAdMob();
  if (!plugin) return;
  await initAds();
  await plugin
    .showBanner({ adId: activeAdIds().banner, isTesting: !isProduction(), position: "BOTTOM_CENTER", margin: 0 })
    .catch(() => {});
}

/** Interstitials are frequency-capped so they never feel spammy. */
const INTERSTITIAL_MIN_GAP_MS = 90_000;
let lastInterstitial = 0;
let actionCount = 0;

export async function maybeShowInterstitial(everyNActions = 3) {
  if (adsRemoved()) return false;
  actionCount += 1;
  if (actionCount % everyNActions !== 0) return false;
  if (Date.now() - lastInterstitial < INTERSTITIAL_MIN_GAP_MS) return false;
  const plugin = nativeAdMob();
  if (!plugin) return false;
  lastInterstitial = Date.now();
  try {
    await plugin.prepareInterstitial({ adId: activeAdIds().interstitial, isTesting: !isProduction() });
    await plugin.showInterstitial();
    return true;
  } catch {
    return false;
  }
}

/** Rewarded ad — resolves true when the user earned the reward. */
export async function showRewardedAd() {
  const plugin = nativeAdMob();
  if (!plugin) return false;
  try {
    await plugin.prepareRewardVideoAd({ adId: activeAdIds().rewarded, isTesting: !isProduction() });
    const reward = await plugin.showRewardVideoAd();
    return !!reward;
  } catch {
    return false;
  }
}