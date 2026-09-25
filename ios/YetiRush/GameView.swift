import SwiftUI
import UIKit
import WebKit

/// Hosts the Yeti Rush game (bundled in the "Game" folder) in a full-screen
/// WKWebView and bridges haptic feedback to UIKit.
struct GameView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.userContentController.add(context.coordinator, name: "haptic")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.18, green: 0.44, blue: 0.92, alpha: 1)
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.allowsLinkPreview = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        if let gameDir = Bundle.main.url(forResource: "Game", withExtension: nil) {
            let index = gameDir.appendingPathComponent("index.html")
            webView.loadFileURL(index, allowingReadAccessTo: gameDir)
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        private let light = UIImpactFeedbackGenerator(style: .light)
        private let medium = UIImpactFeedbackGenerator(style: .medium)
        private let heavy = UIImpactFeedbackGenerator(style: .heavy)
        private let notify = UINotificationFeedbackGenerator()

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "haptic", let kind = message.body as? String else { return }
            switch kind {
            case "light": light.impactOccurred()
            case "medium": medium.impactOccurred()
            case "heavy": heavy.impactOccurred()
            case "success": notify.notificationOccurred(.success)
            default: light.impactOccurred()
            }
        }
    }
}
