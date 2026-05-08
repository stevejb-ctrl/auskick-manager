import { isNative, platform } from "@/lib/platform";
import { createClient } from "@/lib/supabase/client";

// ─── Push-notification device registration ────────────────────
//
// Called once per authenticated session from
// NativeNotificationsBridge. The flow:
//
//   1. Bail on web — push registration is meaningless without a
//      Capacitor runtime to bridge to APNs / FCM.
//   2. Check current permission. If still "prompt", show the OS
//      dialog. If denied, bail quietly (no nag, no in-app
//      banner — that's a future UX iteration).
//   3. Wire listeners for `registration` / `registrationError`
//      BEFORE calling `register()`. Per Capacitor docs the events
//      may fire synchronously on Android.
//   4. Receive the FCM/APNs token, upsert into device_tokens
//      keyed by (user_id, token). Idempotent: re-running on app
//      launch just bumps last_seen_at.
//
// Returns a cleanup function the caller must invoke on unmount,
// otherwise the listeners survive across mounts and end up double-
// upserting tokens (each call to `register()` re-fires
// `registration`).

interface CleanupFn {
  (): void;
}

export async function registerDeviceForPush(): Promise<CleanupFn> {
  const noop: CleanupFn = () => {};
  if (!isNative()) return noop;

  const platformId = platform();
  if (platformId === "web") return noop;

  // Dynamic import — keeps @capacitor/push-notifications out of
  // the web bundle. The chunk only loads when isNative() is true
  // at runtime.
  const { PushNotifications } = await import("@capacitor/push-notifications");

  let perm = await PushNotifications.checkPermissions();
  if (
    perm.receive === "prompt" ||
    perm.receive === "prompt-with-rationale"
  ) {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== "granted") {
    return noop;
  }

  const registrationHandle = await PushNotifications.addListener(
    "registration",
    async (token) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("device_tokens").upsert(
        {
          user_id: user.id,
          platform: platformId,
          token: token.value,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" },
      );
      if (error) {
        // Non-fatal: a failed upsert just means this device
        // won't receive pushes until the next app launch.
        console.error("[push] device_tokens upsert failed:", error);
      }
    },
  );

  const errorHandle = await PushNotifications.addListener(
    "registrationError",
    (err) => {
      // Most common cause: google-services.json missing on
      // Android, or APNs entitlement misconfigured on iOS. The
      // app keeps working; the user just won't get pushes.
      console.error("[push] registration failed:", err.error);
    },
  );

  await PushNotifications.register();

  return () => {
    registrationHandle.remove();
    errorHandle.remove();
  };
}
