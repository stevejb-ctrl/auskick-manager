import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Schedule the splash halo overlay. We add it as a sublayer of
        // Capacitor's splash UIImageView so it's removed automatically
        // when SplashScreen.hide() fires from JS — no separate teardown.
        //
        // 50ms delay gives Capacitor's plugin time to mount its splash
        // view; 1500ms is a safety ceiling if the search keeps failing
        // (shouldn't happen, but a stuck animation loop would be worse).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            self.attachSplashHalo(retries: 30)
        }
        return true
    }

    // MARK: - Splash pulse halo

    // Pulsing halo overlay drawn on top of the dot in the splash image.
    // The dot itself is baked into splash-2732x2732.png; this draws an
    // expanding circle stroke on top in alarm-orange that fades out as
    // it grows, repeating until the splash dismisses.
    //
    // Steve asked for "a visual indicator that something is happening"
    // during the WebView's remote-URL cold start; this is it. The
    // animation matches the in-app SirenWordmark's `siren-pulse`
    // keyframes (globals.css) so the loader and the loaded shell read
    // as the same brand.
    private func attachSplashHalo(retries: Int) {
        guard retries > 0 else { return }
        guard
            let window = activeWindow(),
            let splashImageView = findSplashImageView(in: window)
        else {
            // Splash hasn't mounted yet — retry next runloop tick.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                self.attachSplashHalo(retries: retries - 1)
            }
            return
        }

        // Respect Reduce Motion — show the dot without the halo
        // expansion, just at static alpha. Still on-brand, no movement.
        if UIAccessibility.isReduceMotionEnabled { return }

        // Splash image is 2732×2732 displayed scaleAspectFill. The dot's
        // actual pixel position is measured (not calculated) by
        // scripts/generate-ios-splash.mjs after rendering and printed
        // to stdout for paste-in here. Re-run the script if the splash
        // is regenerated with different font / sizing, then update these
        // constants.
        //
        // Current values from the generator's last run:
        //   dot in image: center=(1689, 1365) radius=35
        let imageSize: CGFloat = 2732
        let dotImagePoint = CGPoint(x: 1689, y: 1365)
        let dotImageRadius: CGFloat = 35

        let bounds = splashImageView.bounds
        let scale = max(bounds.width, bounds.height) / imageSize
        let scaledImageW = imageSize * scale
        let scaledImageH = imageSize * scale
        let dotScreenCenter = CGPoint(
            x: (bounds.width - scaledImageW) / 2 + dotImagePoint.x * scale,
            y: (bounds.height - scaledImageH) / 2 + dotImagePoint.y * scale
        )
        let dotScreenRadius = dotImageRadius * scale

        // Match the in-app `.siren-dot--pulsing` CSS keyframes
        // (globals.css):
        //
        //   0%   box-shadow: 0 0 0 0   rgba(217,68,45,0.55)
        //   100% box-shadow: 0 0 0 Xpx rgba(217,68,45,0)
        //
        // That's a FILLED halo that grows OUTWARD from the dot's edge
        // while fading to transparent — not a stroke ring travelling
        // outward. We replicate via a donut path: inner radius pinned
        // at the dot's edge, outer radius animating from 0 to halo
        // max. Fill colour goes from 0.55 alpha → 0 alpha via opacity.
        //
        // Halo max spread is ~2.5× the dot, matching the relative
        // scale in SirenWordmark.tsx (10px pulse-radius on a 9px dot
        // at size="lg" → ~1.1x; 30px halo on a ~10px dot in the live
        // app header → ~3x). 2.5× lands in the sweet spot for the
        // splash's bigger dot.
        let haloMaxSpread = dotScreenRadius * 2.5

        let halo = CAShapeLayer()
        halo.position = dotScreenCenter
        halo.fillColor = UIColor(red: 217.0/255.0, green: 68.0/255.0, blue: 45.0/255.0, alpha: 1.0).cgColor
        halo.strokeColor = UIColor.clear.cgColor
        halo.lineWidth = 0
        halo.fillRule = .evenOdd  // outer minus inner = donut
        halo.path = donutPath(inner: dotScreenRadius, outer: dotScreenRadius)
        halo.opacity = 0
        halo.zPosition = 1000  // on top of the splash image
        splashImageView.layer.addSublayer(halo)

        // Path: outer radius grows from dot edge to dot + spread.
        // Inner radius stays at dot edge throughout so the halo
        // always emanates from "behind" the dot, never overlaps it.
        let pathAnim = CABasicAnimation(keyPath: "path")
        pathAnim.fromValue = donutPath(inner: dotScreenRadius, outer: dotScreenRadius)
        pathAnim.toValue = donutPath(inner: dotScreenRadius, outer: dotScreenRadius + haloMaxSpread)

        // Alpha fades over the same window. 0.55 matches
        // --siren-pulse-from in globals.css.
        let opacityAnim = CABasicAnimation(keyPath: "opacity")
        opacityAnim.fromValue = 0.55
        opacityAnim.toValue = 0.0

        let group = CAAnimationGroup()
        group.animations = [pathAnim, opacityAnim]
        group.duration = 1.5
        group.repeatCount = .infinity
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        halo.add(group, forKey: "sirenPulse")

        // Add the warm-up phrase cycler below the wordmark. Same
        // metaphor as the web (app)/loading.tsx — kids warming up
        // pre-game. Keeps the native splash voice aligned with the
        // in-app loader so the iOS user reads the same "Lacing the
        // boots…" / "Star jumps…" copy whether they're seeing the
        // 5-second cold-start splash or a tab-transition loader.
        attachSplashPhrases(
            on: splashImageView,
            below: dotScreenCenter,
            dotRadius: dotScreenRadius
        )
    }

    // MARK: - Splash warm-up phrase cycler

    // Warm-up phrases that rotate beneath the wordmark on the
    // native splash. MUST stay in sync with the default set in
    // src/components/ui/WarmUpPhrases.tsx — both surfaces are the
    // same loading moment from the user's perspective.
    private static let warmUpPhrases: [String] = [
        "Lacing the boots…",
        "Star jumps…",
        "Stretching the hammies…",
        "Practising marks…",
        "Spreading the cones…",
        "High knees…",
        "Pumping up the footy…",
        "Limbering up…",
        "Coach's pre-game chat…",
        "Tossing the coin…",
    ]

    private func attachSplashPhrases(
        on container: UIView,
        below dotCenter: CGPoint,
        dotRadius: CGFloat
    ) {
        // Sit ~60pt below the dot's lower edge. That's far enough
        // to clear the wordmark glyph descenders (the "g" tail in
        // "Tossing"), close enough that the label reads as part of
        // the wordmark moment rather than floating on its own.
        let labelHeight: CGFloat = 24
        let labelY = dotCenter.y + dotRadius + 60
        let label = UILabel(frame: CGRect(
            x: 0,
            y: labelY,
            width: container.bounds.width,
            height: labelHeight
        ))
        label.textAlignment = .center
        label.font = UIFont.systemFont(ofSize: 14, weight: .medium)
        // --ink-dim from globals.css = #5E6860
        label.textColor = UIColor(
            red: 94.0 / 255.0,
            green: 104.0 / 255.0,
            blue: 96.0 / 255.0,
            alpha: 1.0
        )
        // Autoresize horizontally so the label stays centered if the
        // imageView resizes (orientation change, split-view, etc.).
        label.autoresizingMask = [.flexibleWidth]
        label.text = AppDelegate.warmUpPhrases[0]
        // zPosition lives on CALayer, not UIView — addressed via
        // label.layer rather than label directly. Without this the
        // Xcode Cloud archive fails compile (which is exactly how
        // Build 107 caught it).
        label.layer.zPosition = 1000
        container.addSubview(label)

        // Under Reduce Motion show a single static phrase instead
        // of cycling. The phrase IS informational; the crossfade
        // is decoration. Vestibular-sensitive users get the
        // signal without the swap motion.
        if UIAccessibility.isReduceMotionEnabled {
            label.text = "Warming up…"
            return
        }

        // First phrase is already visible — schedule the cycle to
        // swap to the next one after the standard 1.5s hold.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.cycleSplashPhrase(label: label, idx: 0)
        }
    }

    // Recursive scheduler — fade out current phrase, swap text,
    // fade in, hold, repeat. Bails when the label is no longer in
    // a window (splash dismissed by Capacitor's hide() call).
    // Total cycle per phrase: 0.175s out + 0.175s in + 1.15s hold
    // = 1.5s — matches WarmUpPhrases.tsx's intervalMs default.
    private func cycleSplashPhrase(label: UILabel, idx: Int) {
        guard label.window != nil else { return }
        let nextIdx = (idx + 1) % AppDelegate.warmUpPhrases.count
        UIView.animate(withDuration: 0.175, animations: {
            label.alpha = 0
        }) { _ in
            guard label.window != nil else { return }
            label.text = AppDelegate.warmUpPhrases[nextIdx]
            UIView.animate(withDuration: 0.175, animations: {
                label.alpha = 1
            }) { [weak self] _ in
                guard label.window != nil else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.15) {
                    self?.cycleSplashPhrase(label: label, idx: nextIdx)
                }
            }
        }
    }

    // Filled-donut CGPath: outer circle minus inner circle, drawn
    // with opposite winding so .evenOdd fill rule punches out the
    // hole. Used by the splash halo to keep its inner edge pinned
    // to the dot while the outer edge animates outward.
    private func donutPath(inner: CGFloat, outer: CGFloat) -> CGPath {
        let path = CGMutablePath()
        path.addArc(
            center: .zero, radius: outer,
            startAngle: 0, endAngle: .pi * 2, clockwise: false
        )
        path.addArc(
            center: .zero, radius: inner,
            startAngle: 0, endAngle: .pi * 2, clockwise: true
        )
        return path
    }

    private func activeWindow() -> UIWindow? {
        if let w = self.window { return w }
        // iOS 13+ scene-based fallback — Capacitor's default project
        // doesn't always wire self.window, depending on Xcode version.
        return UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }
            .first
    }

    // Find the Capacitor splash plugin's UIImageView in the view tree.
    // Plugin v8 adds a fullscreen UIImageView with our Splash asset to
    // the key window before any WebView is shown. Recursive walk so we
    // don't depend on a specific subview index.
    private func findSplashImageView(in view: UIView) -> UIImageView? {
        if let imageView = view as? UIImageView, imageView.image != nil {
            return imageView
        }
        for subview in view.subviews {
            if let found = findSplashImageView(in: subview) {
                return found
            }
        }
        return nil
    }

    // MARK: - Capacitor / iOS lifecycle (unchanged from scaffold)

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
