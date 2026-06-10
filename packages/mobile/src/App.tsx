import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import ArchiveScreen from './screens/ArchiveScreen';
import { Colors } from './theme';

export type RootStackParams = {
  Archive: undefined;
};

const Stack = createStackNavigator<RootStackParams>();

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary:    Colors.purple,
            background: Colors.background,
            card:       Colors.background,
            text:       Colors.cyan,
            border:     Colors.border,
            notification: Colors.pink,
          },
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Archive" component={ArchiveScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
