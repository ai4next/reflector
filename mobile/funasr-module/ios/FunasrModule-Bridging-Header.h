/**
 * Bridging header for FunASRModule iOS.
 * Exposes C++ fbank extraction to Swift.
 */

#ifndef FunasrModule_Bridge_h
#define FunasrModule_Bridge_h

#import <Foundation/Foundation.h>

// In production, this header would expose the C++ fbank functions
// to Swift via a thin C wrapper:
//
// extern "C" {
//     float* compute_fbank(const float* audio, int32_t num_samples,
//                          int32_t* num_frames, int32_t* num_bins);
//     void free_fbank(float* fbank);
// }

#endif /* FunasrModule_Bridge_h */