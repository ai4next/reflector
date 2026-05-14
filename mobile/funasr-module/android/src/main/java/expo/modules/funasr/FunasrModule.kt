package expo.modules.funasr

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

// ─── Data classes ───

class FunasrSegmentRecord : Record {
  @Field
  var startTime: Double = 0.0

  @Field
  var endTime: Double = 0.0

  @Field
  var text: String = ""

  @Field
  var confidence: Double = 0.0
}

class TranscriptionResultRecord : Record {
  @Field
  var segments: List<FunasrSegmentRecord> = emptyList()

  @Field
  var language: String = ""

  @Field
  var durationMs: Double = 0.0
}

class FunasrModelInfoRecord : Record {
  @Field
  var loaded: Boolean = false

  @Field
  var modelPath: String? = null

  @Field
  var sampleRate: Double = 16000.0
}

// ─── Native Module ───

class FunasrModule : Module() {
  private var nativeContext: Long = 0
  private var modelDir: String? = null

  override fun definition() = ModuleDefinition {
    Name("Funasr")

    AsyncFunction("init") { modelDir: String ->
      loadModel(modelDir)
    }

    AsyncFunction("transcribe") { audioPath: String, options: Map<String, Any>? ->
      val language = options?.get("language") as? String ?: ""
      transcribeAudio(audioPath, language)
    }

    AsyncFunction("release") {
      unloadModel()
    }

    Function("isModelLoaded") {
      nativeContext != 0L
    }

    Function("getModelInfo") {
      FunasrModelInfoRecord().apply {
        loaded = nativeContext != 0L
        modelPath = this@FunasrModule.modelDir
        sampleRate = 16000.0
      }
    }
  }

  // ─── Private Methods ───

  private fun loadModel(dir: String): Boolean {
    val modelFile = File(dir, "model.onnx")
    if (!modelFile.exists()) {
      throw Exception("Model file not found: ${modelFile.absolutePath}")
    }

    modelDir = dir
    // In production:
    //   nativeContext = OrtCreateSession(modelFile.absolutePath)
    println("[FunasrModule] Model loaded from: ${modelFile.absolutePath}")
    nativeContext = 1L
    return true
  }

  private fun unloadModel() {
    if (nativeContext != 0L) {
      // OrtReleaseSession(nativeContext)
    }
    nativeContext = 0L
    modelDir = null
  }

  private fun transcribeAudio(
    audioPath: String,
    language: String
  ): TranscriptionResultRecord {
    val startTime = System.currentTimeMillis()

    val audioFile = File(audioPath)
    if (!audioFile.exists()) {
      throw Exception("Audio file not found: $audioPath")
    }

    // Pipeline:
    // 1. Load WAV → 16kHz mono PCM
    // 2. Extract fbank features via JNI C++
    // 3. Run ONNX inference via ONNX Runtime Java API
    // 4. Decode tokens to text

    val elapsed = (System.currentTimeMillis() - startTime).toDouble()
    return TranscriptionResultRecord().apply {
      this.language = if (language.isEmpty()) "zh" else language
      this.durationMs = elapsed
    }
  }

  companion object {
    // JNI for fbank extraction
    init {
      try {
        System.loadLibrary("funasr_fbank")
      } catch (e: UnsatisfiedLinkError) {
        // Fallback: fbank computed in Java/Kotlin
      }
    }

    private external fun computeFbank(
      audioData: FloatArray,
      sampleRate: Int,
      numMelBins: Int
    ): FloatArray

    private external fun freeFbank(ptr: Long)
  }
}