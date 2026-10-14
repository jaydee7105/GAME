// AdMob integration (Android) with a demo stand-in for the web build.
// See config.ts for the placement and pacing rules.

import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";
import { Network } from "@capacitor/network";
import { Sound } from "../core/audio";
import { isNative } from "../core/platform";
import { Save } from "../core/save";
import { AD_UNITS, PACING, USING_TEST_ADS } from "./config";

type Waiter = () => void;

class AdService {
  /** Consent gathered and SDK started; ads may be requested. */
  private ready = false;
  private online = typeof navigator === "undefined" ? true : navigator.onLine;
  private interstitialLoaded = false;
  private rewardedLoaded = false;
  private bannerShown = false;
  private bannerWanted = false;
  private onInterstitialClosed: Waiter | null = null;
  private onRewardedClosed: Waiter | null = null;
  private rewardEarned = false;
  private starting: Promise<void> | null = null;
  /** Shows the "demo ad" stand-in on the web build. Set by the app. */
  demoAd: ((seconds: number) => Promise<void>) | null = null;
  /** True when the user must be offered a way to change their consent (GDPR). */
  privacyOptionsRequired = false;

  get native(): boolean {
    return isNative;
  }

  async init(): Promise<void> {
    if (!isNative) return;
    try {
      const status = await Network.getStatus();
      this.online = status.connected;
      void Network.addListener("networkStatusChange", (s) => {
        this.online = s.connected;
        if (this.online) this.preload();
        else this.hideBanner();
      });
    } catch {
      /* assume online */
    }
    try {
      // Google's consent form (GDPR/UK and US states). Must run before ads load.
      let info = await AdMob.requestConsentInfo();
      if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
        info = await AdMob.showConsentForm();
      }
      this.privacyOptionsRequired = String(info.privacyOptionsRequirementStatus) === "REQUIRED";
      if (!info.canRequestAds) return;
    } catch (e) {
      console.warn("consent", e);
    }
    await this.startSdk();
  }

  private startSdk(): Promise<void> {
    if (this.ready || this.starting) return this.starting ?? Promise.resolve();
    this.starting = this.doStartSdk();
    return this.starting;
  }

  private async doStartSdk(): Promise<void> {
    try {
      await AdMob.initialize({
        initializeForTesting: USING_TEST_ADS,
        maxAdContentRating: MaxAdContentRating.ParentalGuidance,
        tagForChildDirectedTreatment: false,
      });
    } catch (e) {
      console.warn("AdMob init failed", e);
      this.starting = null;
      return;
    }
    void AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => (this.interstitialLoaded = true));
    void AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => (this.interstitialLoaded = false));
    const closeInterstitial = () => {
      this.interstitialLoaded = false;
      this.onInterstitialClosed?.();
      this.onInterstitialClosed = null;
    };
    void AdMob.addListener(InterstitialAdPluginEvents.Dismissed, closeInterstitial);
    void AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, closeInterstitial);
    void AdMob.addListener(RewardAdPluginEvents.Loaded, () => (this.rewardedLoaded = true));
    void AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => (this.rewardedLoaded = false));
    void AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (this.rewardEarned = true));
    const closeRewarded = () => {
      this.rewardedLoaded = false;
      this.onRewardedClosed?.();
      this.onRewardedClosed = null;
    };
    void AdMob.addListener(RewardAdPluginEvents.Dismissed, closeRewarded);
    void AdMob.addListener(RewardAdPluginEvents.FailedToShow, closeRewarded);
    this.ready = true;
    this.preload();
    if (this.bannerWanted) this.showBanner();
  }

  private preload(): void {
    if (!this.ready || !this.online) return;
    if (!this.interstitialLoaded) {
      AdMob.prepareInterstitial({ adId: AD_UNITS.interstitial, isTesting: USING_TEST_ADS })
        .then(() => (this.interstitialLoaded = true))
        .catch(() => (this.interstitialLoaded = false));
    }
    if (!this.rewardedLoaded) {
      AdMob.prepareRewardVideoAd({ adId: AD_UNITS.rewarded, isTesting: USING_TEST_ADS })
        .then(() => (this.rewardedLoaded = true))
        .catch(() => (this.rewardedLoaded = false));
    }
  }

  // -------------------------------------------------------------------------
  // Banner: bottom of the screen during play, from the player's second run.
  // -------------------------------------------------------------------------
  /** Whether the layout should keep room for a banner. */
  get reservesBanner(): boolean {
    return isNative;
  }

  showBanner(): void {
    this.bannerWanted = true;
    if (!this.ready || !this.online || Save.data.ads.finished < PACING.bannerAfterRuns) return;
    if (this.bannerShown) return;
    this.bannerShown = true;
    AdMob.showBanner({
      adId: AD_UNITS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: USING_TEST_ADS,
    }).catch(() => (this.bannerShown = false));
  }

  hideBanner(): void {
    this.bannerWanted = false;
    if (!this.bannerShown) return;
    this.bannerShown = false;
    AdMob.removeBanner().catch(() => {});
  }

  // -------------------------------------------------------------------------
  // Interstitials: only at natural breaks, paced, with a new-player grace.
  // -------------------------------------------------------------------------
  /** Call once whenever a run or level finishes. */
  runFinished(): void {
    Save.data.ads.finished++;
    Save.save();
  }

  /** Whether pacing would allow an interstitial right now. */
  interstitialDue(): boolean {
    const a = Save.data.ads;
    if (a.finished < PACING.graceRuns) return false;
    if (a.shown > 0 && a.finished - a.lastAt < PACING.runsBetween) return false;
    if (Date.now() - a.lastTime < PACING.minSecondsBetween * 1000) return false;
    return true;
  }

  /** Shows an interstitial if one is due and loaded; resolves when it closes. */
  async maybeInterstitial(): Promise<void> {
    if (!this.interstitialDue()) return;
    if (!this.ready || !this.online || !this.interstitialLoaded) {
      this.preload();
      return;
    }
    const a = Save.data.ads;
    a.lastAt = a.finished;
    a.lastTime = Date.now();
    a.shown++;
    Save.save();
    Sound.setBackground(true);
    await new Promise<void>((resolve) => {
      this.onInterstitialClosed = resolve;
      AdMob.showInterstitial().catch(() => resolve());
      setTimeout(resolve, 90_000);
    });
    Sound.setBackground(false);
    this.preload();
  }

  // -------------------------------------------------------------------------
  // Rewarded: one placement, the revive.
  // -------------------------------------------------------------------------
  rewardedAvailable(): boolean {
    if (!isNative) return this.demoAd !== null;
    if (!this.rewardedLoaded) this.preload();
    return this.ready && this.online && this.rewardedLoaded;
  }

  /** Plays a rewarded ad. Resolves true only if the reward was earned. */
  async showRewarded(): Promise<boolean> {
    if (!isNative) {
      if (!this.demoAd) return false;
      await this.demoAd(3);
      return true;
    }
    if (!this.rewardedAvailable()) return false;
    this.rewardEarned = false;
    Sound.setBackground(true);
    await new Promise<void>((resolve) => {
      this.onRewardedClosed = resolve;
      AdMob.showRewardVideoAd().catch(() => resolve());
      setTimeout(resolve, 120_000);
    });
    Sound.setBackground(false);
    this.preload();
    return this.rewardEarned;
  }

  /** Opens Google's consent form again (Settings > Privacy options). */
  async privacyOptions(): Promise<void> {
    if (!isNative) return;
    try {
      const info = await AdMob.showConsentForm();
      if (info.canRequestAds) await this.startSdk();
    } catch (e) {
      console.warn("consent form", e);
    }
  }
}

export const Ads = new AdService();
