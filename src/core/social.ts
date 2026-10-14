// Sharing scores, asking for a store review, and the daily reminder.

import { InAppReview } from "@capacitor-community/in-app-review";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { isNative } from "./platform";
import { Save } from "./save";

export const STORE_URL = "https://play.google.com/store/apps/details?id=com.jaydee7105.planetdrop";
/** Where docs/privacy-policy.md is hosted (must match the Play Console). */
export const PRIVACY_URL = "https://github.com/jaydee7105/GAME/blob/main/docs/privacy-policy.md";

/** Shares a message. Returns "shared", "copied" or "failed". */
export async function shareText(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (isNative) {
      await Share.share({ title: "Planet Drop", text, url: STORE_URL, dialogTitle: "Share your score" });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title: "Planet Drop", text, url: STORE_URL });
      return "shared";
    }
  } catch {
    /* cancelled or blocked: fall through to copying */
  }
  try {
    await navigator.clipboard.writeText(`${text} ${STORE_URL}`);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * Asks Google Play for a review prompt at a happy moment. Play decides
 * whether it actually appears; we keep it rare on our side too.
 */
export function maybeAskForReview(): void {
  if (!isNative) return;
  const r = Save.data.review;
  const days = (Date.now() - r.last) / 86400000;
  if (Save.data.stats.games < 6 || r.asked >= 3 || days < 45) return;
  r.asked++;
  r.last = Date.now();
  Save.save();
  void InAppReview.requestReview().catch(() => {});
}

// ---------------------------------------------------------------------------
// Daily reminder (local notification, no server)
// ---------------------------------------------------------------------------
const REMINDER_ID = 7001;

export async function enableReminders(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;
    Save.setSetting("reminders", true);
    await scheduleReminder();
    return true;
  } catch {
    return false;
  }
}

export async function disableReminders(): Promise<void> {
  Save.setSetting("reminders", false);
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {
    /* nothing scheduled */
  }
}

/** (Re)schedules tomorrow-and-onwards reminders with up-to-date wording. */
export async function scheduleReminder(): Promise<void> {
  if (!isNative || !Save.setting("reminders")) return;
  const streak = Save.liveStreak();
  const body = streak > 1
    ? `Keep your ${streak}-day streak alive - today's Daily Challenge is waiting.`
    : "A brand new Daily Challenge is ready. Can you reach the Sun today?";
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_ID,
        title: "Your daily planets are here",
        body,
        schedule: { on: { hour: 18, minute: 30 }, allowWhileIdle: true },
        smallIcon: "ic_stat_planet",
        iconColor: "#FF9F2E",
      }],
    });
  } catch (e) {
    console.warn("reminder", e);
  }
}
