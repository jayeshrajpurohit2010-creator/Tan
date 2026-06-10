import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../theme';

interface StatusPillProps {
  label:    string;
  active:   boolean;
  pending?: boolean;
}

export default function StatusPill({ label, active, pending = false }: StatusPillProps): React.JSX.Element {
  const borderColor = active   ? 'rgba(74,222,128,0.45)'
                    : pending  ? 'rgba(252,211,77,0.45)'
                    : 'rgba(34,211,238,0.2)';
  const bgColor     = active   ? 'rgba(74,222,128,0.12)'
                    : pending  ? 'rgba(252,211,77,0.1)'
                    : 'rgba(0,0,0,0.4)';
  const textColor   = active   ? Colors.green
                    : pending  ? Colors.amber
                    : `${Colors.cyan}66`;

  return (
    <View style={[styles.pill, { borderColor, backgroundColor: bgColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth:  1,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  text: {
    fontFamily:    Fonts.mono,
    fontSize:      9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
