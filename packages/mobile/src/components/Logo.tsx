import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Fonts, Spacing } from '../theme';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Tan cyberpunk logo.
 * The prompt char ") " glows pink, "TAN" uses a purple-to-pink gradient simulation
 * via nested Text spans with individual colors (React Native doesn't support
 * CSS linear-gradient on text directly, so we approximate it).
 */
export default function Logo({ size = 'md' }: LogoProps): React.JSX.Element {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, [glowAnim]);

  const fontSize = size === 'lg' ? 40 : size === 'sm' ? 22 : 32;
  const opacity  = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity }}>
        <Text style={[styles.wordmark, { fontSize }]}>
          <Text style={styles.prompt}>{')'} </Text>
          <Text style={styles.tanT}>T</Text>
          <Text style={styles.tanA}>A</Text>
          <Text style={styles.tanN}>N</Text>
          <Text style={styles.version}>  v1.0</Text>
        </Text>
      </Animated.View>

      {/* Horizontal rule with subtitle */}
      <View style={styles.subtitleRow}>
        <View style={styles.rule} />
        <Text style={styles.subtitle}>Forensic Archival Suite</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems:    'flex-start',
    paddingBottom: Spacing.sm,
  },
  wordmark: {
    fontFamily:  Fonts.mono,
    fontWeight:  '900',
    letterSpacing: -0.5,
  },
  prompt: {
    color:    Colors.pink,
    // Simulated glow via text shadow (Android supports it)
    textShadowColor:  'rgba(244,114,182,0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  tanT: {
    color:    '#E879F9',
    textShadowColor:  'rgba(168,85,247,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  tanA: {
    color:    '#C084FC',
    textShadowColor:  'rgba(168,85,247,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  tanN: {
    color:    Colors.pink,
    textShadowColor:  'rgba(244,114,182,0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  version: {
    fontSize:  11,
    color:     Colors.cyan,
    opacity:   0.55,
    fontWeight: '400',
  },
  subtitleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginTop:      4,
    gap:            8,
  },
  rule: {
    flex:        1,
    maxWidth:    60,
    height:      1,
    backgroundColor: Colors.purple,
    opacity:     0.5,
  },
  subtitle: {
    fontFamily:    Fonts.mono,
    fontSize:      9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color:         Colors.purple,
    opacity:       0.6,
  },
});
