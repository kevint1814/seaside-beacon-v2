import CoreMotion

/// Reads device attitude for gyroscope-driven parallax on the sunrise canvas.
/// Provides smoothed tilt values (-1…1) for X (roll) and Y (pitch).
@Observable
final class SunriseMotionManager {

    var tiltX: Float = 0
    var tiltY: Float = 0

    private let motionManager = CMMotionManager()
    private let smoothing: Float = 0.15  // Low-pass filter coefficient

    func start() {
        guard motionManager.isDeviceMotionAvailable,
              !motionManager.isDeviceMotionActive else { return }

        motionManager.deviceMotionUpdateInterval = 1.0 / 60.0
        motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let attitude = motion?.attitude else { return }

            // Clamp and normalize roll/pitch to -1…1
            let rawX = Float(min(max(attitude.roll, -0.5), 0.5)) * 2.0
            let rawY = Float(min(max(attitude.pitch, -0.5), 0.5)) * 2.0

            // Smooth with low-pass filter
            self.tiltX += (rawX - self.tiltX) * self.smoothing
            self.tiltY += (rawY - self.tiltY) * self.smoothing
        }
    }

    func stop() {
        motionManager.stopDeviceMotionUpdates()
        tiltX = 0
        tiltY = 0
    }
}
