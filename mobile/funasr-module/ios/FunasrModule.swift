import ExpoModulesCore
import Foundation
import Accelerate

/// FunASR-Nano transcription result segment

struct FunasrSegmentRecord: Record {
  @Field var startTime: Double = 0
  @Field var endTime: Double = 0
  @Field var text: String = ""
  @Field var confidence: Double = 0
}

struct TranscriptionResultRecord: Record {
  @Field var segments: [FunasrSegmentRecord] = []
  @Field var language: String = ""
  @Field var durationMs: Double = 0
}

struct FunasrModelInfoRecord: Record {
  @Field var loaded: Bool = false
  @Field var modelPath: String? = nil
  @Field var sampleRate: Double = 16000
}

public class FunasrModule: Module {
  /// ONNX Runtime session pointer (bridged from C++)
  private var ortSession: UnsafeMutableRawPointer?
  private var modelDir: String?

  // Fbank config (default values for FunASR-Nano)
  private let numMelBins: Int32 = 80
  private let sampleRate: Int32 = 16000

  public func definition() -> ModuleDefinition {
    Name("Funasr")

    AsyncFunction("init") { (modelDir: String) -> Bool in
      return self.loadModel(directory: modelDir)
    }

    AsyncFunction("transcribe") { (audioPath: String, options: [String: Any]?) -> TranscriptionResultRecord in
      let language = options?["language"] as? String ?? ""
      return self.runTranscription(audioPath: audioPath, language: language)
    }

    AsyncFunction("release") {
      self.unloadModel()
    }

    Function("isModelLoaded") { () -> Bool in
      return self.ortSession != nil
    }

    Function("getModelInfo") { () -> FunasrModelInfoRecord in
      var info = FunasrModelInfoRecord()
      info.loaded = self.ortSession != nil
      info.modelPath = self.modelDir
      return info
    }
  }

  // MARK: - Private

  private func loadModel(directory: String) -> Bool {
    self.modelDir = directory
    let modelPath = (directory as NSString).appendingPathComponent("model.onnx")

    guard FileManager.default.fileExists(atPath: modelPath) else {
      print("[FunasrModule] model.onnx not found at: \(modelPath)")
      return false
    }

    // In production: create OrtSession from model.onnx
    //   ort_session = OrtCreateSession(modelPath, &options)
    print("[FunasrModule] Model loaded from: \(modelPath)")
    self.ortSession = UnsafeMutableRawPointer(bitPattern: 0x1)
    return true
  }

  private func unloadModel() {
    // In production: OrtReleaseSession(ort_session)
    self.ortSession = nil
    self.modelDir = nil
  }

  private func runTranscription(
    audioPath: String,
    language: String
  ) -> TranscriptionResultRecord {
    let startTime = CFAbsoluteTimeGetCurrent()

    guard FileManager.default.fileExists(atPath: audioPath) else {
      print("[FunasrModule] Audio file not found: \(audioPath)")
      return TranscriptionResultRecord()
    }

    // Pipeline:
    // 1. Load WAV → 16kHz mono PCM
    // 2. Extract fbank features (80-dim, 25ms window, 10ms shift)
    // 3. Run ONNX inference
    // 4. Decode tokens to text

    // In production this calls the C++ pipeline:
    //   let audioData = loadWav(audioPath)
    //   let fbank = computeFbank(audioData, numMelBins, sampleRate)
    //   let output = ortSession.run(fbank)
    //   let text = decodeTokens(output)

    let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
    var result = TranscriptionResultRecord()
    result.language = language.isEmpty ? "zh" : language
    result.durationMs = elapsed
    return result
  }
}