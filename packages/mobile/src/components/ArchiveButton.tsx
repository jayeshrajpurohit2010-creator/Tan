import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated, View, ActivityIndicator } from 'react-native';
import { Colors, Fonts, Spacing } from '../theme';

type ButtonState = 'idle' | 'active' | 'arming' | 'flushing' | 'error';

interface ArchiveButtonProps {
  state:     ButtonState;
  onPress:   () => void;
  disabled?: boolean;
}

/**
 * Prominent glowing "ACTIVATE ARCHIVE MODE" button — the heart of the UI.
 * In active state it pulses red with an abort animation.
 * In idle state it shimmers with a purple-pink glow.
 */
export default function ArchiveButton({
  state,
  onPress,
  disabled = false,
}: ArchiveButtonProps): React.JSX.Element {
  const pulseAnim  = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const isActive = state === 'active';
  const isBusy   = state === 'arming' || state === 'flushing';

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900,  useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 900,  useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    if (!isActive) {
      Animated.loop(
        Animated.timing(shimmerAnim, { toValue: 1, duration: 2400, useNativeDriver: false })
      ).start();
    } else {
      shimmerAnim.stopAnimation();
    }
  }, [isActive, shimmerAnim]);

  const pulseOpacity = pulseAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: isActive ? [0.6, 1] : [0.85, 1],
  });

  const borderColor  = isActive ? Colors.red : Colors.purple;
  const bgColor      = isActive ? 'rgba(248,113,113,0.15)' : 'rgba(168,85,247,0.18)';
  const textColor    = isActive ? Colors.red : Colors.pink;

  const label = isBusy
    ? state === 'arming'
      ? '⟳  Arming...'
      : '⟳  Flushing...'
    : isActive
      ? '◼  Abort Archive Session'
      : '▶  Activate Archive Mode';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || isBusy}
      activeOpacity={0.8}
      style={[styles.outer, disabled || isBusy ? styles.disabled : null]}
    >
      <Animated.View
        style={[
          styles.inner,
          { borderColor, backgroundColor: bgColor, opacity: pulseOpacity },
        ]}
      >
        {/* Corner accents */}
        <View style={[styles.corner, styles.topLeft, { borderColor }]} />
        <View style={[styles.corner, styles.topRight, { borderColor }]} />
        <View style={[styles.corner, styles.bottomLeft, { borderColor }]} />
        <View style={[styles.corner, styles.bottomRight, { borderColor }]} />

        <View style={styles.row}>
          {isBusy ? (
            <ActivityIndicator size="small" color={textColor} style={styles.icon} />
          ) : null}
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </View>

        {/* Scan line effect */}
        {isActive ? null : (
          <View style={styles.scanLine} pointerEvents="none" />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const CORNER = 10;

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: Spacing.md,
    marginVertical:   Spacing.sm,
  },
  disabled: {
    opacity: 0.45,
  },
  inner: {
    borderWidth:  1.5,
    paddingVertical:   Spacing.lg,
    paddingHorizontal: Spacing.xl,
    alignItems:        'center',
    justifyContent:    'center',
    position:          'relative',
    overflow:          'hidden',
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: Spacing.sm,
  },
  label: {
    fontFamily:    Fonts.mono,
    fontSize:      16,
    fontWeight:    '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  scanLine: {
    position:        'absolute',
    left:             0,
    right:            0,
    height:           1,
    top:             '50%',
    backgroundColor: 'rgba(168,85,247,0.25)',
  },
  // Corner brackets
  corner: {
    position:    'absolute',
    width:        CORNER,
    height:       CORNER,
    borderColor:  Colors.purple,
  },
  topLeft: {
    top:         0,
    left:        0,
    borderTopWidth:  1.5,
    borderLeftWidth: 1.5,
  },
  topRight: {
    top:         0,
    right:       0,
    borderTopWidth:   1.5,
    borderRightWidth: 1.5,
  },
  bottomLeft: {
    bottom:       0,
    left:         0,
    borderBottomWidth: 1.5,
    borderLeftWidth:   1.5,
  },
  bottomRight: {
    bottom:        0,
    right:         0,
    borderBottomWidth: 1.5,
    borderRightWidth:  1.5,
  },
});
