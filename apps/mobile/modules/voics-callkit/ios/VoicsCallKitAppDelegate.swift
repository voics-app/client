import ExpoModulesCore
import UIKit

/// Registers for VoIP pushes when the app launches, before JavaScript runs: a push that wakes a closed app
/// must reach CallKit at once, and only native code that exists at launch can do that.
public class VoicsCallKitAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    CallCoordinator.shared.start()
    return true
  }
}
