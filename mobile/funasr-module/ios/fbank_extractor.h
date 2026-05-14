/**
 * C++ header for fbank (filterbank) feature extraction.
 *
 * FunASR-Nano expects 80-dimensional fbank features computed from
 * 16kHz mono PCM audio with a 25ms window and 10ms shift.
 *
 * This implementation follows the Kaldi-style fbank computation
 * used by the FunASR training pipeline.
 */

#ifndef FBANK_EXTRACTOR_H
#define FBANK_EXTRACTOR_H

#include <vector>
#include <cstdint>
#include <cmath>
#include <cstring>

// ─── Fbank Configuration ───

struct FbankConfig {
    int32_t sample_rate = 16000;
    int32_t num_mel_bins = 80;
    float  frame_length_ms = 25.0f;
    float  frame_shift_ms = 10.0f;
    float  low_freq = 20.0f;
    float  high_freq = 8000.0f;
    float  dither = 1.0f;
    bool   remove_dc_offset = true;
    bool   window_type_hamming = true;  // false = hanning
};

// ─── Fbank Extractor ───

class FbankExtractor {
public:
    explicit FbankExtractor(const FbankConfig& config);

    /// Compute fbank features from raw PCM audio (16kHz mono)
    /// @param audio         pointer to PCM float samples
    /// @param num_samples   number of samples
    /// @param num_frames    [out] number of output frames
    /// @param num_bins      [out] number of mel bins (always config.num_mel_bins)
    /// @return              fbank matrix: num_frames × num_mel_bins, row-major
    float* compute(const float* audio, int32_t num_samples,
                   int32_t* num_frames, int32_t* num_bins);

    ~FbankExtractor();

private:
    FbankConfig config_;
    float*      mel_weights_ = nullptr;
    int32_t     num_fft_bins_ = 0;

    void buildMelFilterbank();
    void applyWindow(const float* frame, float* windowed, int32_t frame_size);
    void computePowerSpectrum(const float* windowed, float* spectrum, int32_t fft_size);
};

// ─── Implementation ───

FbankExtractor::FbankExtractor(const FbankConfig& config) : config_(config) {
    int32_t frame_size = static_cast<int32_t>(config_.sample_rate * config_.frame_length_ms / 1000.0f);
    num_fft_bins_ = frame_size / 2 + 1;
    buildMelFilterbank();
}

FbankExtractor::~FbankExtractor() {
    delete[] mel_weights_;
}

void FbankExtractor::buildMelFilterbank() {
    int32_t frame_size = static_cast<int32_t>(config_.sample_rate * config_.frame_length_ms / 1000.0f);
    int32_t fft_size = 1;
    while (fft_size < frame_size) fft_size <<= 1;
    int32_t num_fft_bins = fft_size / 2 + 1;

    mel_weights_ = new float[num_fft_bins * config_.num_mel_bins]();

    // Convert frequencies to mel scale
    auto hz_to_mel = [](float hz) -> float {
        return 2595.0f * std::log10(1.0f + hz / 700.0f);
    };
    auto mel_to_hz = [](float mel) -> float {
        return 700.0f * (std::pow(10.0f, mel / 2595.0f) - 1.0f);
    };

    float mel_low = hz_to_mel(config_.low_freq);
    float mel_high = hz_to_mel(config_.high_freq);
    float mel_spacing = (mel_high - mel_low) / (config_.num_mel_bins + 1);

    for (int32_t m = 0; m < config_.num_mel_bins; m++) {
        float mel_center = mel_low + (m + 1) * mel_spacing;
        float hz_center = mel_to_hz(mel_center);
        float bin_center = hz_center * fft_size / config_.sample_rate;

        float mel_left = mel_low + m * mel_spacing;
        float mel_right = mel_low + (m + 2) * mel_spacing;
        float hz_left = mel_to_hz(mel_left);
        float hz_right = mel_to_hz(mel_right);
        float bin_left = hz_left * fft_size / config_.sample_rate;
        float bin_right = hz_right * fft_size / config_.sample_rate;

        for (int32_t k = 0; k < num_fft_bins; k++) {
            float weight = 0.0f;
            if (k >= bin_left && k <= bin_center) {
                weight = (k - bin_left) / (bin_center - bin_left);
            } else if (k > bin_center && k <= bin_right) {
                weight = (bin_right - k) / (bin_right - bin_center);
            }
            if (weight > 0.0f) {
                mel_weights_[m * num_fft_bins + k] = weight;
            }
        }
    }
}

void FbankExtractor::applyWindow(const float* frame, float* windowed, int32_t frame_size) {
    for (int32_t i = 0; i < frame_size; i++) {
        float window_val;
        if (config_.window_type_hamming) {
            window_val = 0.54f - 0.46f * std::cos(2.0f * M_PI * i / (frame_size - 1));
        } else {
            window_val = 0.5f - 0.5f * std::cos(2.0f * M_PI * i / (frame_size - 1));
        }
        windowed[i] = frame[i] * window_val;
    }
}

void FbankExtractor::computePowerSpectrum(const float* windowed, float* spectrum, int32_t fft_size) {
    // Simplified: using DFT magnitude approximation
    // In production: use vDSP_fft or a proper FFT library
    for (int32_t k = 0; k <= fft_size / 2; k++) {
        float real = 0.0f, imag = 0.0f;
        for (int32_t n = 0; n < fft_size; n++) {
            float angle = 2.0f * M_PI * k * n / fft_size;
            real += windowed[n] * std::cos(angle);
            imag -= windowed[n] * std::sin(angle);
        }
        spectrum[k] = (real * real + imag * imag) / fft_size;
    }
}

float* FbankExtractor::compute(const float* audio, int32_t num_samples,
                                int32_t* num_frames, int32_t* num_bins) {
    int32_t frame_size = static_cast<int32_t>(config_.sample_rate * config_.frame_length_ms / 1000.0f);
    int32_t frame_shift = static_cast<int32_t>(config_.sample_rate * config_.frame_shift_ms / 1000.0f);
    int32_t fft_size = 1;
    while (fft_size < frame_size) fft_size <<= 1;
    int32_t num_fft_bins = fft_size / 2 + 1;

    *num_frames = (num_samples - frame_size) / frame_shift + 1;
    if (*num_frames < 1) *num_frames = 1;
    *num_bins = config_.num_mel_bins;

    float* fbank = new float[(*num_frames) * config_.num_mel_bins]();
    float* windowed = new float[fft_size]();
    float* spectrum = new float[num_fft_bins]();

    for (int32_t t = 0; t < *num_frames; t++) {
        int32_t offset = t * frame_shift;
        std::memset(windowed, 0, fft_size * sizeof(float));
        std::memset(spectrum, 0, num_fft_bins * sizeof(float));

        int32_t samples_available = num_samples - offset;
        int32_t copy_size = (samples_available < frame_size) ? samples_available : frame_size;
        for (int32_t i = 0; i < copy_size; i++) {
            windowed[i] = audio[offset + i];
        }

        applyWindow(windowed, windowed, frame_size);

        if (config_.remove_dc_offset) {
            float mean = 0.0f;
            for (int32_t i = 0; i < frame_size; i++) mean += windowed[i] / frame_size;
            for (int32_t i = 0; i < frame_size; i++) windowed[i] -= mean;
        }

        computePowerSpectrum(windowed, spectrum, fft_size);

        // Apply mel filterbank
        for (int32_t m = 0; m < config_.num_mel_bins; m++) {
            float sum = 0.0f;
            for (int32_t k = 0; k < num_fft_bins; k++) {
                sum += spectrum[k] * mel_weights_[m * num_fft_bins + k];
            }
            // Log mel: log(max(eps, sum))
            fbank[t * config_.num_mel_bins + m] = std::log(std::max(1e-10f, sum));
        }
    }

    delete[] windowed;
    delete[] spectrum;
    return fbank;
}

// ─── Simplified token decoding ───

/// Simple argmax decoder: token_id = argmax of each frame's logits
/// In production, this would use the model's tokenizer to map IDs to text.
inline void decodeTokens(const float* logits, int32_t num_frames, int32_t vocab_size,
                          int32_t* out_tokens) {
    for (int32_t t = 0; t < num_frames; t++) {
        int32_t best = 0;
        float best_score = logits[t * vocab_size];
        for (int32_t v = 1; v < vocab_size; v++) {
            float score = logits[t * vocab_size + v];
            if (score > best_score) {
                best_score = score;
                best = v;
            }
        }
        out_tokens[t] = best;
    }
}

#endif // FBANK_EXTRACTOR_H