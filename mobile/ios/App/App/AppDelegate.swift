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

        // Splash image is 2732×2732 displayed scaleAspectFill. The dot
        // in that image is centered at (1759, 1364) — derived from the
        // wordmark geometry in scripts/generate-ios-splash.mjs (canvas
        // centre + half wordmark width + dot offset).
        let imageSize: CGFloat = 2732
        let dotImagePoint = CGPoint(x: 1759, y: 1364)
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

        // Maximum halo radius — ~5x the dot for a generous-but-contained
        // ripple. Matches the relative scale of the in-app halo.
        let haloMaxRadius = dotScreenRadius * 5

        let halo = CAShapeLayer()
        halo.position = dotScreenCenter
        halo.fillColor = UIColor.clear.cgColor
        halo.strokeColor = UIColor(red: 217.0/255.0, green: 68.0/255.0, blue: 45.0/255.0, alpha: 1.0).cgColor
        halo.lineWidth = dotScreenRadius * 0.6
        halo.path = circlePath(radius: dotScreenRadius)
        halo.opacity = 0
        halo.zPosition = 1000  // ensure on top of the splash image
        splashImageView.layer.addSublayer(halo)

        // Path animates from dot-sized to halo-max-sized; opacity fades
        // from 0.55 to 0 over the same window. Group runs as a single
        // 1.5s ease-out that repeats forever (the splash teardown is
        // what stops it).
        let pathAnim = CABasicAnimation(keyPath: "path")
        pathAnim.fromValue = circlePath(radius: dotScreenRadius)
        pathAnim.toValue = circlePath(radius: haloMaxRadius)

        let opacityAnim = CABasicAnimation(keyPath: "opacity")
        opacityAnim.fromValue = 0.55
        opacityAnim.toValue = 0.0

        let group = CAAnimationGroup()
        group.animations = [pathAnim, opacityAnim]
        group.duration = 1.5
        group.repeatCount = .infinity
        group.timingFunction = CAMediaTimingFunction(name: .easeOut)
        halo.add(group, forKey: "sirenPulse")
    }

    private func circlePath(radius: CGFloat) -> CGPath {
        return UIBezierPath(
            arcCenter: .zero,
            radius: radius,
            startAngle: 0,
            endAngle: .pi * 2,
            clockwise: true
        ).cgPath
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
