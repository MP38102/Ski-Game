import SwiftUI
import AVFoundation

@main
struct YetiRushApp: App {
    init() {
        // Game audio mixes with the player's music and respects the silent switch.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            GameView()
                .ignoresSafeArea()
                .background(Color("LaunchBackground"))
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .defersSystemGestures(on: .all)
        }
    }
}
