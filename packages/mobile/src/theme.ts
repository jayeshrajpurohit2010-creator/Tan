import { StyleSheet } from 'react-native';
import { TAN_COLORS } from '@tan/shared';

export const Colors = TAN_COLORS;

export const Fonts = {
  mono:    'Courier New',
  display: 'Courier New',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

export const BorderRadius = {
  sm:   2,
  md:   4,
  card: 6,
};

/** Glow shadow helpers for React Native (Android supports elevation, iOS uses shadow*) */
export const Glows = {
  purple: {
    elevation:       6,
    shadowColor:     Colors.purple,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.75,
    shadowRadius:    12,
  },
  cyan: {
    elevation:       4,
    shadowColor:     Colors.cyan,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.65,
    shadowRadius:    10,
  },
  pink: {
    elevation:       5,
    shadowColor:     Colors.pink,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.70,
    shadowRadius:    11,
  },
};

/** Common text styles */
export const TextStyles = StyleSheet.create({
  mono: {
    fontFamily: Fonts.mono,
    color:      Colors.cyan,
  },
  monoSm: {
    fontFamily: Fonts.mono,
    fontSize:   11,
    color:      Colors.cyan,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  monoXs: {
    fontFamily: Fonts.mono,
    fontSize:   9,
    color:      Colors.cyan,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heading: {
    fontFamily:    Fonts.mono,
    fontSize:      28,
    fontWeight:    '900',
    color:         Colors.pink,
    letterSpacing: -0.5,
  },
  label: {
    fontFamily:    Fonts.mono,
    fontSize:      10,
    color:         Colors.cyan,
    opacity:       0.7,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

/** Common container styles */
export const ContainerStyles = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  card: {
    borderWidth:   1,
    borderColor:   Colors.border,
    padding:       Spacing.md,
    marginBottom:  Spacing.sm,
    backgroundColor: '#0D0A14',
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
  },
  spaceBetween: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
});
