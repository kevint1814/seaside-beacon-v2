import MetalKit

/// Manages the Metal render pipeline for the animated sunrise canvas.
/// Draws a fullscreen triangle each frame with procedural sky, sun, stars, water, and god rays.
final class SunriseRenderer: NSObject, MTKViewDelegate {

    // MARK: - Metal State

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let pipelineState: MTLRenderPipelineState

    // MARK: - Uniforms

    private var uniforms = SunriseUniforms()
    private let startTime = CFAbsoluteTimeGetCurrent()

    /// Duration of one full sunrise cycle in seconds.
    private let cycleDuration: Float = 90.0

    /// Progress range — keeps the scene in the visually interesting band.
    /// 0.15 = pre-dawn with stars, 0.85 = full morning light.
    private let progressMin: Float = 0.15
    private let progressMax: Float = 0.85

    // MARK: - External Inputs (set from SwiftUI)

    var tiltX: Float = 0
    var tiltY: Float = 0
    var reduceMotion: Bool = false
    var isPaused: Bool = false

    // MARK: - Init

    init?(device: MTLDevice) {
        self.device = device
        guard let queue = device.makeCommandQueue() else { return nil }
        self.commandQueue = queue

        guard let library = device.makeDefaultLibrary(),
              let vertexFunc = library.makeFunction(name: "sunriseVertex"),
              let fragmentFunc = library.makeFunction(name: "sunriseFragment") else {
            return nil
        }

        let desc = MTLRenderPipelineDescriptor()
        desc.vertexFunction = vertexFunc
        desc.fragmentFunction = fragmentFunc
        desc.colorAttachments[0].pixelFormat = .bgra8Unorm

        guard let pipeline = try? device.makeRenderPipelineState(descriptor: desc) else {
            return nil
        }
        self.pipelineState = pipeline

        super.init()
    }

    // MARK: - MTKViewDelegate

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        uniforms.resolution = .init(Float(size.width), Float(size.height))
    }

    func draw(in view: MTKView) {
        guard !isPaused else { return }

        let elapsed = Float(CFAbsoluteTimeGetCurrent() - startTime)
        uniforms.time = elapsed

        // Sunrise progress: oscillates within the visible band (0.15 – 0.85)
        if reduceMotion {
            uniforms.sunriseProgress = 0.45
        } else {
            let phase = elapsed.truncatingRemainder(dividingBy: cycleDuration) / cycleDuration
            // Triangle wave: 0 → 1 → 0
            let triangle = phase < 0.5 ? phase * 2.0 : 2.0 - phase * 2.0
            // Map to visible range
            uniforms.sunriseProgress = progressMin + triangle * (progressMax - progressMin)
        }

        uniforms.tiltX = tiltX
        uniforms.tiltY = tiltY
        uniforms.reduceMotion = reduceMotion ? 1.0 : 0.0

        guard let drawable = view.currentDrawable,
              let passDesc = view.currentRenderPassDescriptor,
              let cmdBuf = commandQueue.makeCommandBuffer(),
              let encoder = cmdBuf.makeRenderCommandEncoder(descriptor: passDesc) else { return }

        encoder.setRenderPipelineState(pipelineState)
        encoder.setFragmentBytes(&uniforms, length: MemoryLayout<SunriseUniforms>.stride, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()

        cmdBuf.present(drawable)
        cmdBuf.commit()
    }
}
