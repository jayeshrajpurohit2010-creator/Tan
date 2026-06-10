import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import type { CaptureEvent, ReconstitutionEvent, ReconstitutionProgressEvent } from '@tan/shared';
import { formatBytes, mimeLabel, relativeTime } from '@tan/shared';
import { Colors, Fonts, Spacing, ContainerStyles } from '../theme';

interface CaptureGalleryProps {
  events:              CaptureEvent[];
  reconEvents:         ReconstitutionEvent[];
  reconProgress:       ReconstitutionProgressEvent[];
  onOpenFile?:         (path: string) => void;
}

type Filter = 'all' | 'video' | 'image' | 'document' | 'reconstituted';

const FILTERS: Filter[] = ['all', 'video', 'image', 'document', 'reconstituted'];

function ProgressBar({ percent }: { percent: number }): React.JSX.Element {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(2, percent)}%` as unknown as number }]} />
    </View>
  );
}

function InProgressCard({ streamId, percent }: { streamId: string; percent: number }): React.JSX.Element {
  return (
    <View style={styles.inProgressCard}>
      <View style={ContainerStyles.spaceBetween}>
        <Text style={styles.inProgressLabel}>⚙  Reconstituting</Text>
        <Text style={styles.percentText}>{percent}%</Text>
      </View>
      <Text style={styles.streamIdText} numberOfLines={1}>{streamId}</Text>
      <ProgressBar percent={percent} />
    </View>
  );
}

function GalleryRow({
  item,
  onPress,
}: {
  item: CaptureEvent | (ReconstitutionEvent & { isRecon: true });
  onPress: () => void;
}): React.JSX.Element {
  const isRecon = 'isRecon' in item;
  const label   = isRecon ? 'MP4' : mimeLabel((item as CaptureEvent).mimeType);
  const title   = isRecon
    ? `▶ ${(item as ReconstitutionEvent).streamId}`
    : (item as CaptureEvent).url.split('/').pop() ?? (item as CaptureEvent).url;
  const size    = formatBytes(isRecon ? (item as ReconstitutionEvent).totalBytes : (item as CaptureEvent).bytes);
  const time    = relativeTime(item.timestamp);
  const hasError = Boolean(item.error);

  const borderColor = isRecon  ? `${Colors.cyan}55`
                    : hasError ? `${Colors.red}44`
                    : `${Colors.purple}33`;
  const bgColor     = isRecon  ? 'rgba(34,211,238,0.05)'
                    : hasError ? 'rgba(248,113,113,0.05)'
                    : 'rgba(168,85,247,0.04)';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, { borderColor, backgroundColor: bgColor }]}
      activeOpacity={0.7}
    >
      <View style={styles.labelBadge}>
        <Text style={styles.labelText}>{label}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <View style={ContainerStyles.row}>
          <Text style={styles.rowMeta}>{size}</Text>
          <Text style={styles.rowMeta}>  •  </Text>
          <Text style={styles.rowMeta}>{time}</Text>
          {isRecon ? (
            <>
              <Text style={styles.rowMeta}>  •  </Text>
              <Text style={[styles.rowMeta, { color: Colors.cyan }]}>
                {(item as ReconstitutionEvent).segments} segs
              </Text>
            </>
          ) : null}
        </View>
        {hasError ? (
          <Text style={styles.errorText} numberOfLines={1}>{item.error}</Text>
        ) : null}
      </View>
      {isRecon ? (
        <View style={styles.mp4Badge}>
          <Text style={styles.mp4Text}>MP4</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function CaptureGallery({
  events,
  reconEvents,
  reconProgress,
  onOpenFile,
}: CaptureGalleryProps): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const [detailItem, setDetailItem] = useState<CaptureEvent | null>(null);

  const completedStreamIds = new Set(reconEvents.map((e) => e.streamId));
  const inProgress = reconProgress.filter((p) => !completedStreamIds.has(p.streamId));

  const allItems: Array<CaptureEvent | (ReconstitutionEvent & { isRecon: true })> = [
    ...reconEvents.map((e) => ({ ...e, isRecon: true as const })),
    ...events,
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filtered = allItems.filter((item) => {
    if (filter === 'all')         return true;
    const isRecon = 'isRecon' in item;
    if (filter === 'reconstituted') return isRecon;
    const mime = isRecon ? 'video/mp4' : (item as CaptureEvent).mimeType;
    if (filter === 'video')    return mime.startsWith('video/') || isRecon;
    if (filter === 'image')    return mime.startsWith('image/');
    if (filter === 'document') return mime.startsWith('text/') || mime.includes('json');
    return true;
  });

  const handleRowPress = useCallback((item: typeof allItems[number]) => {
    if ('isRecon' in item) {
      onOpenFile?.((item as ReconstitutionEvent).outputPath);
    } else {
      setDetailItem(item as CaptureEvent);
    }
  }, [onOpenFile]);

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filtered.length}</Text>
        </View>
      </ScrollView>

      {/* In-progress reconstitutions */}
      {inProgress.map((p) => (
        <InProgressCard key={p.streamId} streamId={p.streamId} percent={p.percent} />
      ))}

      {/* Gallery list */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Awaiting captured payloads...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered.slice(0, 80)}
          keyExtractor={(item) =>
            'isRecon' in item
              ? `recon_${(item as ReconstitutionEvent).streamId}_${item.timestamp}`
              : (item as CaptureEvent).id
          }
          renderItem={({ item }) => (
            <GalleryRow item={item} onPress={() => handleRowPress(item)} />
          )}
          scrollEnabled={false}
          style={styles.list}
        />
      )}

      {/* Detail modal */}
      {detailItem ? (
        <Modal transparent animationType="fade" onRequestClose={() => setDetailItem(null)}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setDetailItem(null)}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Payload Detail</Text>
              <Text style={styles.modalLabel}>URL</Text>
              <Text style={styles.modalValue}>{detailItem.url}</Text>
              <Text style={styles.modalLabel}>MIME Type</Text>
              <Text style={styles.modalValue}>{detailItem.mimeType}</Text>
              <Text style={styles.modalLabel}>Size</Text>
              <Text style={styles.modalValue}>{formatBytes(detailItem.bytes)}</Text>
              {detailItem.sha256 ? (
                <>
                  <Text style={styles.modalLabel}>SHA-256</Text>
                  <Text style={styles.modalValue} numberOfLines={1}>{detailItem.sha256}</Text>
                </>
              ) : null}
              {detailItem.savedPath ? (
                <>
                  <Text style={styles.modalLabel}>Saved Path</Text>
                  <Text style={styles.modalValue} numberOfLines={2}>{detailItem.savedPath}</Text>
                </>
              ) : null}
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setDetailItem(null)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  filterBar: {
    flexDirection:    'row',
    marginBottom:     Spacing.sm,
    paddingVertical:  4,
  },
  filterTab: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    marginRight:        4,
    borderWidth:        1,
    borderColor:        'transparent',
  },
  filterTabActive: {
    borderColor:     `${Colors.purple}55`,
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  filterText: {
    fontFamily:    Fonts.mono,
    fontSize:      10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         `${Colors.cyan}66`,
  },
  filterTextActive: {
    color: Colors.pink,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical:   4,
    justifyContent:    'center',
  },
  countText: {
    fontFamily: Fonts.mono,
    fontSize:   10,
    color:      `${Colors.cyan}55`,
  },

  inProgressCard: {
    borderWidth:   1,
    borderColor:   `${Colors.purple}55`,
    backgroundColor: 'rgba(168,85,247,0.08)',
    padding:       Spacing.sm,
    marginBottom:  Spacing.xs,
  },
  inProgressLabel: {
    fontFamily:    Fonts.mono,
    fontSize:      10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color:         Colors.pink,
  },
  percentText: {
    fontFamily:    Fonts.mono,
    fontSize:      11,
    color:         Colors.purple,
  },
  streamIdText: {
    fontFamily:    Fonts.mono,
    fontSize:      10,
    color:         `${Colors.purple}99`,
    marginTop:     2,
  },
  progressTrack: {
    height:          3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    marginTop:       6,
    overflow:        'hidden',
  },
  progressFill: {
    height:          3,
    backgroundColor: Colors.cyan,
    opacity:         0.85,
  },

  emptyState: {
    padding:        Spacing.xl,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily:    Fonts.mono,
    fontSize:      11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color:         `${Colors.cyan}44`,
  },

  list: { flex: 1 },

  row: {
    flexDirection:   'row',
    alignItems:      'center',
    borderWidth:     1,
    padding:         Spacing.sm,
    marginBottom:    Spacing.xs,
  },
  labelBadge: {
    borderWidth:     1,
    borderColor:     `${Colors.cyan}33`,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginRight:     Spacing.sm,
    flexShrink:      0,
  },
  labelText: {
    fontFamily:    Fonts.mono,
    fontSize:      9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         `${Colors.cyan}99`,
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: Fonts.mono,
    fontSize:   12,
    color:      `${Colors.cyan}EE`,
  },
  rowMeta: {
    fontFamily:    Fonts.mono,
    fontSize:      10,
    color:         `${Colors.cyan}66`,
  },
  errorText: {
    fontFamily: Fonts.mono,
    fontSize:   10,
    color:      `${Colors.red}BB`,
    marginTop:  2,
  },
  mp4Badge: {
    borderWidth:     1,
    borderColor:     `${Colors.cyan}55`,
    backgroundColor: 'rgba(34,211,238,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft:      Spacing.xs,
    flexShrink:      0,
  },
  mp4Text: {
    fontFamily:    Fonts.mono,
    fontSize:      9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         Colors.cyan,
  },

  modalBackdrop: {
    flex:            1,
    backgroundColor: 'rgba(2,1,6,0.85)',
    justifyContent:  'center',
    padding:         Spacing.xl,
  },
  modalCard: {
    backgroundColor: '#0D0A14',
    borderWidth:     1,
    borderColor:     `${Colors.purple}55`,
    padding:         Spacing.lg,
  },
  modalTitle: {
    fontFamily:    Fonts.mono,
    fontSize:      13,
    fontWeight:    '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color:         Colors.pink,
    marginBottom:  Spacing.md,
  },
  modalLabel: {
    fontFamily:    Fonts.mono,
    fontSize:      9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color:         `${Colors.cyan}66`,
    marginTop:     Spacing.sm,
  },
  modalValue: {
    fontFamily:    Fonts.mono,
    fontSize:      11,
    color:         Colors.cyan,
    marginTop:     2,
  },
  modalClose: {
    marginTop:       Spacing.lg,
    borderWidth:     1,
    borderColor:     `${Colors.cyan}44`,
    padding:         Spacing.md,
    alignItems:      'center',
  },
  modalCloseText: {
    fontFamily:    Fonts.mono,
    fontSize:      12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color:         Colors.cyan,
  },
});
