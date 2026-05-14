/**
 * HomeScreen — main entry point with recorder and live transcription.
 *
 * On first launch, shows model download screen.
 * During recording, shows real-time transcription from on-device FunASR-Nano.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Recorder } from '../components/Recorder';
import { ModelDownloadScreen } from '../components/ModelDownloadScreen';
import { Button, colors } from '../components/UI';
import { useRecording } from '../hooks/useRecording';

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const [modelReady, setModelReady] = useState(false);

  const {
    isRecording,
    error,
    modelStatus,
    latestSegments,
    latestLanguage,
    startRecording,
    stopRecording,
  } = useRecording();

  // Model not downloaded — show download screen
  if (!modelReady && modelStatus.type === 'not_downloaded') {
    return <ModelDownloadScreen onComplete={() => setModelReady(true)} />;
  }

  // Model was downloaded but not yet loaded—still show the UI
  const isTranscribing = false; // Derived from status checks

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Reflector</Text>
          <Text style={styles.subtitle}>反思者</Text>
          <Text style={styles.tagline}>
            Record conversations · On-device transcription · AI reflection
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.onDeviceBadge}>
              <Text style={styles.badgeText}>On-device STT</Text>
            </View>
            <View style={styles.langBadge}>
              <Text style={styles.badgeText}>中 / EN</Text>
            </View>
          </View>
        </View>

        {/* Recorder with live transcription */}
        <Recorder
          isRecording={isRecording}
          error={error}
          modelStatus={modelStatus}
          latestSegments={latestSegments}
          latestLanguage={latestLanguage}
          isTranscribing={isTranscribing}
          onStart={() => startRecording()}
          onStop={stopRecording}
        />

        {/* Quick actions */}
        <View style={styles.actions}>
          <Button
            title="View History"
            variant="ghost"
            onPress={() => navigation.navigate('History')}
            style={styles.actionButton}
          />
        </View>

        {/* Info cards */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How it works</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoStep}>1</Text>
            <Text style={styles.infoText}>
              Tap record — audio is captured in 5-minute chunks
            </Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoStep}>2</Text>
            <Text style={styles.infoText}>
              Each chunk is transcribed on-device via whisper.cpp (privacy-first,
              no audio upload)
            </Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoStep}>3</Text>
            <Text style={styles.infoText}>
              AI analyzes the conversation for themes, actions, and insights
            </Text>
          </View>
          <View style={styles.privacyCard}>
            <Text style={styles.privacyText}>
              Privacy: All transcription runs locally on your device. Audio
              files are deleted immediately after processing.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 16,
    marginTop: 2,
    marginBottom: 8,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  onDeviceBadge: {
    backgroundColor: '#22c55e20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e40',
  },
  langBadge: {
    backgroundColor: '#3b82f620',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b82f640',
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  actions: {
    alignItems: 'center',
    marginBottom: 20,
  },
  actionButton: {
    width: 200,
  },
  infoSection: {
    marginTop: 10,
  },
  infoTitle: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoStep: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary + '20',
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  infoText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  privacyCard: {
    backgroundColor: '#22c55e10',
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#22c55e30',
  },
  privacyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});