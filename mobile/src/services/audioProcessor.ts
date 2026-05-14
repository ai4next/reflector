/**
 * Audio processor for FunASR-Nano.
 *
 * Ensures audio is in the correct format for the model:
 * - 16kHz sample rate
 * - Mono channel
 * - 16-bit PCM
 * - WAV format
 *
 * The fbank feature extraction is handled by the native module.
 */

import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

/** FunASR-Nano compatible recording settings */
export const FUNASR_RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.wav',
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

/** Verify audio file exists and is accessible */
export async function prepareForTranscription(audioUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(audioUri);
  if (!info.exists) {
    throw new Error(`Audio file not found: ${audioUri}`);
  }
  return audioUri;
}

/** Estimate audio duration from file size (16-bit PCM at 16kHz) */
export function estimateDuration(fileSizeBytes: number): number {
  return fileSizeBytes / (16000 * 2);
}

export const SAMPLE_RATE = 16000;