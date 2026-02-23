import simd

/// CPU ↔ GPU shared uniforms for the sunrise canvas shader.
/// Must match the `Uniforms` struct layout in `SunriseShaders.metal` exactly.
struct SunriseUniforms {
    var resolution: SIMD2<Float> = .zero
    var time: Float = 0
    var sunriseProgress: Float = 0
    var tiltX: Float = 0
    var tiltY: Float = 0
    var reduceMotion: Float = 0
    var _pad: SIMD2<Float> = .zero   // 16-byte alignment padding
}
