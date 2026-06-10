import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { formatBytes, relativeTime } from '@tan/shared';
import Logo from '../components/Logo';
import ArchiveButton from '../components/ArchiveButton';
import StatusPill from '../components/StatusPill';
import CaptureGallery from '../components/CaptureGallery';
import WebViewCapture from '../capture/WebViewCapture';
import type { WebViewCaptureHandle } from '../capture/WebViewCapture';
import { useCaptureEngine } from '../hooks/useCaptureEngine';
import { useConfig } from '../hooks/useConfig';
import { Colors, Fonts, Spacing, ContainerStyles } from '../theme';

type Tab = 'browser' | 'gallery';

/**
 * Main screen of the Tan Mobile archival suite.
 *
 * Layout:
 *   ┌─ StatusBar / Header ──────────────────────────────────────┐
 *   │  ) TAN logo + status pills                                  │
 *   ├─ Tab switcher ─────────────────────────────────────────────┤
 *   │  [Browser] [Gallery]                                        │
 *   ├─ Content area ─────────────────────────────────────────────┤
 *   │  Browser tab: WebView                                       │
 *   │  Gallery tab: CaptureGallery + metrics                      │
 *   ├─ Control bar ──────────────────────────────────────────────┤
 *   │  ▶ ACTIVATE ARCHIVE MODE button                             │
 *   └───────────────────────────────────────────────────────────┘
 */
export default function ArchiveScreen(): React.JSX.Element {
  const { config, setConfig, loaded } = useConfig();
  const { events, status, captureManager, activate, deactivate } = useCaptureEngine();
  const webViewRef = useRef<WebViewCaptureHandle>(null);
  const [tab, setTab] = useState<Tab>('browser');
  const [urlDraft, setUrlDraft] = useState('');
  const [currentUrl, setCurrentUrl] = useState(config.primaryAuditEndpoint);

  const totalBytes = events.reduce((sum, e) => sum + e.bytes, 0);

  const handleToggleArchive = useCallback(() => {
    if (status.active) {
      deactivate();
    } else {
      activate(currentUrl);
    }
  }, [status.active, currentUrl, activate, deactivate]);

  const handleGoPress = useCallback(() => {
    const next = urlDraft.trim() || currentUrl;
    const normalized = /^https?:\/\//i.test(next) ? next : `https://${next}`;
    setCurrentUrl(normalized);
    setUrlDraft('');
    webViewRef.current?.loadUrl(normalized);
    if (status.active) {
      // Re-arm capture on the new URL
      deactivate();
      activate(normalized);
    }
  }, [urlDraft, currentUrl, status.active, activate, deactivate]);

  const handleNavigate = useCallback((url: string) => {
    setCurrentUrl(url);
  }, []);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Text style={styles.loadingText}>Initializing...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Logo size="sm" />
        <View style={styles.pills}>
          <StatusPill label="Archive" active={status.active} />
          <StatusPill label="Stealth"  active={status.stealthEnabled} />
          <StatusPill
            label="CDP"
            active={false}
            pending={status.active}
          />
        </View>
      </View>

      {/* ── URL bar ───────────────────────────────────────────── */}
      <View style={styles.urlBar}>
        <TextInput
          style={styles.urlInput}
          value={urlDraft}
          onChangeText={setUrlDraft}
          placeholder={currentUrl}
          placeholderTextColor={`${Colors.cyan}44`}
          onSubmitEditing={handleGoPress}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
        />
        <TouchableOpacity onPress={handleGoPress} style={styles.goBtn}>
          <Text style={styles.goBtnText}>GO</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => webViewRef.current?.goBack()} style={styles.navBtn}>
          <Text style={styles.navBtnText}>{'<'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.navBtn}>
          <Text style={styles.navBtnText}>↺</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab switcher ─────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          onPress={() => setTab('browser')}
          style={[styles.tab, tab === 'browser' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'browser' && styles.tabTextActive]}>
            Browser
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('gallery')}
          style={[styles.tab, tab === 'gallery' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'gallery' && styles.tabTextActive]}>
            Gallery
            {events.length > 0 ? ` (${events.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Content ──────────────────────────────────────────── */}
      <View style={styles.content}>
        {/* Browser — always mounted to keep the session alive */}
        <View style={[styles.webViewContainer, tab !== 'browser' && styles.hidden]}>
          <WebViewCapture
            ref={webViewRef}
            url={currentUrl}
            captureManager={captureManager}
            onNavigate={handleNavigate}
          />
          {/* Capture-active overlay badge */}
          {status.active ? (
            <View style={styles.liveBadge} pointerEvents="none">
              <Text style={styles.liveBadgeText}>● REC</Text>
            </View>
          ) : null}
        </View>

        {/* Gallery */}
        {tab === 'gallery' ? (
          <ScrollView style={styles.galleryScroll} contentContainerStyle={styles.galleryContent}>
            {/* Metrics row */}
            <View style={styles.metricsRow}>
              <MetricCard label="Payloads" value={String(events.length)} />
              <MetricCard label="Bytes"    value={formatBytes(totalBytes)} />
              <MetricCard label="Queue"    value={String(status.queueDepth)} />
              <MetricCard label="Mode"     value={status.mode} />
            </View>

            {/* Terminal readout */}
            <View style={styles.terminal}>
              <Text style={styles.terminalRow}>
                mode: <Text style={styles.terminalVal}>{status.mode}</Text>
              </Text>
              <Text style={styles.terminalRow}>
                target: <Text style={styles.terminalVal} numberOfLines={1}>{currentUrl}</Text>
              </Text>
              <Text style={styles.terminalRow}>
                vault: <Text style={styles.terminalVal}>/sdcard/Android/data/Tan/...</Text>
              </Text>
              <Text style={styles.terminalRow}>
                stealth: <Text style={[styles.terminalVal, { color: status.stealthEnabled ? Colors.green : Colors.red }]}>
                  {status.stealthEnabled ? 'active' : 'disabled'}
                </Text>
              </Text>
            </View>

            <CaptureGallery
              events={events}
              reconEvents={[]}
              reconProgress={[]}
            />
          </ScrollView>
        ) : null}
      </View>

      {/* ── Archive button ─────────────────────────────────── */}
      <View style={styles.controls}>
        <ArchiveButton
          state={status.mode === 'active' ? 'active' : status.mode}
          onPress={handleToggleArchive}
        />
      </View>
    </SafeAreaView>
  );
}

function MetricCard({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex:            1,
    backgroundColor: Colors.background,
    alignItems:      'center',
    justifyContent:  'center',
  },
  loadingText: {
    fontFamily:    Fonts.mono,
    fontSize:      13,
    color:         Colors.cyan,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  screen: {
    flex:            1,
    backgroundColor: Colors.background,
  },

  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop:     Platform.OS === 'android' ? Spacing.sm : 0,
    paddingBottom:  Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.cyan}18`,
  },
  pills: {
    flexDirection: 'row',
    gap:           Spacing.xs,
  },

  urlBar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.cyan}18`,
    gap: Spacing.xs,
  },
  urlInput: {
    flex:          1,
    borderWidth:   1,
    borderColor:   `${Colors.cyan}33`,
    backgroundColor: '#0D0A14',
    color:         Colors.cyan,
    fontFamily:    Fonts.mono,
    fontSize:      12,
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Platform.OS === 'android' ? 4 : 8,
  },
  goBtn: {
    borderWidth:   1,
    borderColor:   `${Colors.purple}55`,
    backgroundColor: 'rgba(168,85,247,0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical:   Platform.OS === 'android' ? 6 : 9,
  },
  goBtnText: {
    fontFamily:    Fonts.mono,
    fontSize:      11,
    fontWeight:    '700',
    color:         Colors.purple,
    letterSpacing: 1,
  },
  navBtn: {
    paddingHorizontal: Spacing.xs,
    paddingVertical:   Platform.OS === 'android' ? 6 : 9,
  },
  navBtnText: {
    fontFamily: Fonts.mono,
    fontSize:   14,
    color:      `${Colors.cyan}88`,
  },

  tabBar: {
    flexDirection:     'row',
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.purple}22`,
  },
  tab: {
    flex:          1,
    paddingVertical:   Spacing.sm,
    alignItems:        'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.purple,
    backgroundColor:   'rgba(168,85,247,0.06)',
  },
  tabText: {
    fontFamily:    Fonts.mono,
    fontSize:      11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color:         `${Colors.cyan}66`,
  },
  tabTextActive: {
    color: Colors.pink,
  },

  content: { flex: 1 },

  webViewContainer: {
    flex:     1,
    position: 'relative',
  },
  hidden: {
    position: 'absolute',
    width:    0,
    height:   0,
    overflow: 'hidden',
  },
  liveBadge: {
    position:     'absolute',
    top:          Spacing.sm,
    right:        Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical:   2,
    backgroundColor:   'rgba(248,113,113,0.85)',
  },
  liveBadgeText: {
    fontFamily:    Fonts.mono,
    fontSize:      9,
    fontWeight:    '700',
    letterSpacing: 1.5,
    color:         '#fff',
  },

  galleryScroll: { flex: 1 },
  galleryContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  metricsRow: {
    flexDirection:  'row',
    gap:            Spacing.xs,
    marginBottom:   Spacing.md,
  },
  metricCard: {
    flex:          1,
    borderWidth:   1,
    borderColor:   `${Colors.cyan}28`,
    backgroundColor: '#0D0A14',
    padding:       Spacing.sm,
    alignItems:    'center',
  },
  metricLabel: {
    fontFamily:    Fonts.mono,
    fontSize:      8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color:         `${Colors.cyan}66`,
  },
  metricValue: {
    fontFamily:    Fonts.mono,
    fontSize:      14,
    fontWeight:    '700',
    color:         Colors.cyan,
    marginTop:     2,
  },

  terminal: {
    borderWidth:   1,
    borderColor:   `${Colors.cyan}22`,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding:       Spacing.md,
    marginBottom:  Spacing.md,
  },
  terminalRow: {
    fontFamily:    Fonts.mono,
    fontSize:      11,
    color:         `${Colors.cyan}77`,
    marginBottom:  2,
  },
  terminalVal: {
    color: Colors.cyan,
  },

  controls: {
    borderTopWidth: 1,
    borderTopColor: `${Colors.purple}22`,
    paddingVertical: Spacing.sm,
  },
});
