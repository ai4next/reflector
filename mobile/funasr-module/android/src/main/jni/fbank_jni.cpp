/**
 * JNI bridge for fbank feature extraction.
 *
 * FunASR-Nano requires 80-dimensional fbank features from 16kHz audio.
 * This JNI layer delegates computation to optimized C++ code.
 */

#include <jni.h>
#include <vector>
#include <cmath>
#include <cstring>

// ─── Fbank computation (same algorithm as iOS version) ───

struct FbankConfig {
    int sample_rate = 16000;
    int num_mel_bins = 80;
    float frame_length_ms = 25.0f;
    float frame_shift_ms = 10.0f;
    float low_freq = 20.0f;
    float high_freq = 8000.0f;
};

static float* build_mel_filterbank(const FbankConfig& config, int fft_size, int& num_fft_bins) {
    int frame_size = static_cast<int>(config.sample_rate * config.frame_length_ms / 1000.0f);
    int fft = 1;
    while (fft < frame_size) fft <<= 1;
    num_fft_bins = fft / 2 + 1;

    auto hz_to_mel = [](float hz) { return 2595.0f * log10f(1.0f + hz / 700.0f); };
    auto mel_to_hz = [](float mel) { return 700.0f * (powf(10.0f, mel / 2595.0f) - 1.0f); };

    float mel_low = hz_to_mel(config.low_freq);
    float mel_high = hz_to_mel(config.high_freq);
    float mel_spacing = (mel_high - mel_low) / (config.num_mel_bins + 1);

    float* weights = new float[config.num_mel_bins * num_fft_bins]();

    for (int m = 0; m < config.num_mel_bins; m++) {
        float hz_center = mel_to_hz(mel_low + (m + 1) * mel_spacing);
        float bin_center = hz_center * fft / config.sample_rate;

        float hz_left = mel_to_hz(mel_low + m * mel_spacing);
        float hz_right = mel_to_hz(mel_low + (m + 2) * mel_spacing);
        float bin_left = hz_left * fft / config.sample_rate;
        float bin_right = hz_right * fft / config.sample_rate;

        for (int k = 0; k < num_fft_bins; k++) {
            float w = 0.0f;
            if (k >= bin_left && k <= bin_center)
                w = (k - bin_left) / (bin_center - bin_left);
            else if (k > bin_center && k <= bin_right)
                w = (bin_right - k) / (bin_right - bin_center);
            if (w > 0.0f)
                weights[m * num_fft_bins + k] = w;
        }
    }
    return weights;
}

static void compute_fbank_internal(const float* audio, int num_samples,
                                    float* fbank, FbankConfig& config) {
    int frame_size = static_cast<int>(config.sample_rate * config.frame_length_ms / 1000.0f);
    int frame_shift = static_cast<int>(config.sample_rate * config.frame_shift_ms / 1000.0f);

    int fft = 1;
    while (fft < frame_size) fft <<= 1;

    int num_fft_bins = 0;
    float* mel_weights = build_mel_filterbank(config, fft, num_fft_bins);

    int num_frames = (num_samples - frame_size) / frame_shift + 1;
    if (num_frames < 1) num_frames = 1;

    for (int t = 0; t < num_frames; t++) {
        int offset = t * frame_shift;

        // Apply window (Hamming)
        std::vector<float> windowed(fft, 0.0f);
        for (int i = 0; i < frame_size && (offset + i) < num_samples; i++) {
            float hamming = 0.54f - 0.46f * cosf(2.0f * M_PI * i / (frame_size - 1));
            windowed[i] = audio[offset + i] * hamming;
        }

        // DFT magnitude squared
        std::vector<float> spectrum(num_fft_bins, 0.0f);
        for (int k = 0; k < num_fft_bins; k++) {
            float real = 0.0f, imag = 0.0f;
            for (int n = 0; n < fft; n++) {
                float angle = 2.0f * M_PI * k * n / fft;
                real += windowed[n] * cosf(angle);
                imag -= windowed[n] * sinf(angle);
            }
            spectrum[k] = (real * real + imag * imag) / fft;
        }

        // Mel filterbank
        for (int m = 0; m < config.num_mel_bins; m++) {
            float sum = 0.0f;
            for (int k = 0; k < num_fft_bins; k++) {
                sum += spectrum[k] * mel_weights[m * num_fft_bins + k];
            }
            fbank[t * config.num_mel_bins + m] = logf(fmaxf(1e-10f, sum));
        }
    }

    delete[] mel_weights;
}

// ─── JNI Exports ───

extern "C" JNIEXPORT jfloatArray JNICALL
Java_expo_modules_funasr_FunasrModule_computeFbank(
    JNIEnv* env, jobject thiz,
    jfloatArray audio_data, jint sample_rate, jint num_mel_bins) {

    jsize num_samples = env->GetArrayLength(audio_data);
    jfloat* audio = env->GetFloatArrayElements(audio_data, nullptr);

    FbankConfig config;
    config.sample_rate = sample_rate;
    config.num_mel_bins = num_mel_bins;

    int frame_size = static_cast<int>(config.sample_rate * config.frame_length_ms / 1000.0f);
    int frame_shift = static_cast<int>(config.sample_rate * config.frame_shift_ms / 1000.0f);
    int num_frames = (num_samples - frame_size) / frame_shift + 1;
    if (num_frames < 1) num_frames = 1;

    std::vector<float> fbank(num_frames * num_mel_bins);
    compute_fbank_internal(audio, num_samples, fbank.data(), config);

    env->ReleaseFloatArrayElements(audio_data, audio, JNI_ABORT);

    jfloatArray result = env->NewFloatArray(num_frames * num_mel_bins);
    env->SetFloatArrayRegion(result, 0, num_frames * num_mel_bins, fbank.data());
    return result;
}