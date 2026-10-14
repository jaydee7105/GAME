// Native bridges (Capacitor) with web fallbacks: haptics, back button,
// app lifecycle and the status bar.

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar } from "@capacitor/status-bar";
import { Save } from "./save";

export const isNative = Capacitor.isNativePlatform();

/** Short vibration; strength 0..1. */
export function buzz(ms: number, strength = 0.5): void {
  if (!Save.setting("haptics")) return;
  if (isNative) {
    if (ms <= 40) {
      const style = strength > 0.66 ? ImpactStyle.Heavy : strength > 0.33 ? ImpactStyle.Medium : ImpactStyle.Light;
      void Haptics.impact({ style }).catch(() => {});
    } else {
      void Haptics.vibrate({ duration: ms }).catch(() => {});
    }
  } else if ("vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      /* not allowed before a user gesture */
    }
  }
}

export interface PlatformHooks {
  onBack(): void;
  onPause(): void;
  onResume(): void;
}

export function initPlatform(hooks: PlatformHooks): void {
  if (isNative) {
    void StatusBar.hide().catch(() => {});
    void App.addListener("backButton", () => hooks.onBack());
    void App.addListener("pause", () => hooks.onPause());
    void App.addListener("resume", () => hooks.onResume());
  } else {
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hooks.onBack();
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hooks.onPause();
    else hooks.onResume();
  });
  window.addEventListener("pagehide", () => hooks.onPause());
}

export function exitApp(): void {
  if (isNative) void App.exitApp();
}
