/**
 * ModelDownloadScreen — downloads the whisper.cpp model on first launch.
 *
 * Shows download progress, handles errors, and provides retry.
 * After successful download, navigates to the main app.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { STTService } from '../services/sttService';
import { colors } from '../components/UI';

interface ModelDownloadScreenProps {
  onComplete: () => void;
}

export function ModelDownloadScreen({ onComplete }: ModelDownloadScreenProps) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'downloading' | 'error'>('checking');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const requiredSpace = STTService.getRequiredDiskSpace();

  useEffect(() => {
    checkModel();
  }, []);

  const checkModel = async () => {
    setStatus('checking');
    const modelStatus = await STTService.checkModel();
    if (modelStatus.type === 'ready') {
      setStatus('ready');
      // Auto-proceed after short delay
      setTimeout(onComplete, 500);
    } else {
      setStatus('ready' as any); // Show download UI
    }
  };

  const startDownload = useCallback(async () => {
    setStatus('downloading');
    setProgress(0);
    setErrorMsg('');

    try {
      await STTService.downloadModel((pct) => {
        setProgress(pct);
      });
      setStatus('ready');
      setTimeout(onComplete, 500);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'Download failed');
    }
  }, [onComplete]);

  const formatProgress = (pct: number): string => {
    return `${Math.round(pct * 100)}%`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🎤</Text>
        </View>

        <Text style={styles.title}>Speech Model Required</Text>
        <Text style={styles.subtitle}>
          Reflector needs to download a lightweight speech recognition model
          (~15MB) to run on your device. Your audio never leaves your phone.
        </Text>

        {/* Status */}
        {status === 'checking' && (
          <View style={styles.statusContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>Checking model...</Text>
          </View>
        )}

        {(status === 'downloading') && (
          <View style={styles.statusContainer}>
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
            <Text style={styles.statusText}>
              Downloading... {formatProgress(progress)}
            </Text>
            <Text style={styles.sizeText}>
              ~{requiredSpace}MB · Supports Chinese & English
            </Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.statusContainer}>
            <Text style={styles.errorText}>Download failed</Text>
            <Text style={styles.errorDetail}>{errorMsg}</Text>
          </View>
        )}

        {/* Action button */}
        {(status === 'ready' || status === 'error') && (
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={startDownload}
            activeOpacity={0.8}
          >
            <Text style={styles.downloadButtonText}>
              {status === 'error' ? 'Retry Download' : 'Download Model'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Model: FunASR-Nano-2512 (2.5M params)</Text>
          <Text style={styles.infoText}>✓ Supports Mandarin Chinese (中文) and English</Text>
          <Text style={styles.infoText}>✓ Runs entirely on-device via ONNX Runtime</Text>
          <Text style={styles.infoText}>✓ No internet required after download</Text>
          <Text style={styles.infoText}>
            ✓ Your recordings stay private — no audio upload
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  statusText: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 12,
  },
  sizeText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  errorDetail: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  downloadButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginBottom: 24,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
  },
  infoTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 20,
  },
});