import SwiftUI
import MetalKit

/// SwiftUI wrapper for the Metal-rendered sunrise canvas.
struct SunriseMetalView: UIViewRepresentable {

    var tiltX: Float
    var tiltY: Float
    var reduceMotion: Bool
    var isActive: Bool

    func makeUIView(context: Context) -> MTKView {
        let mtkView = MTKView()

        guard let device = MTLCreateSystemDefaultDevice() else {
            // Metal unavailable (e.g. Intel Mac simulator) — show static fallback color
            mtkView.backgroundColor = UIColor(red: 8/255, green: 6/255, blue: 22/255, alpha: 1)
            return mtkView
        }

        mtkView.device = device
        mtkView.colorPixelFormat = .bgra8Unorm
        mtkView.framebufferOnly = true
        mtkView.preferredFramesPerSecond = 30  // Slow animation doesn't need 60fps
        mtkView.isPaused = false
        mtkView.enableSetNeedsDisplay = false  // Continuous rendering
        mtkView.isOpaque = true
        mtkView.backgroundColor = UIColor(red: 8/255, green: 6/255, blue: 22/255, alpha: 1)

        if let renderer = SunriseRenderer(device: device) {
            context.coordinator.renderer = renderer
            mtkView.delegate = renderer

            // Trigger initial size
            let size = mtkView.drawableSize
            renderer.mtkView(mtkView, drawableSizeWillChange: size)
        }

        return mtkView
    }

    func updateUIView(_ mtkView: MTKView, context: Context) {
        guard let renderer = context.coordinator.renderer else { return }

        renderer.tiltX = tiltX
        renderer.tiltY = tiltY
        renderer.reduceMotion = reduceMotion
        renderer.isPaused = !isActive

        mtkView.isPaused = !isActive
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var renderer: SunriseRenderer?
    }
}
