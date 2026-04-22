import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { initDb } from '../src/db/client';
import { resetOrphanedProcessing } from '../src/db/repositories/sourceLog';

export default function RootLayout(): JSX.Element {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await initDb();
      await resetOrphanedProcessing(db);
      setReady(true);
    })().catch((e) => {
      console.error('DB init failed:', e);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{ presentation: 'modal', title: 'Settings & Maintenance' }}
      />
      <Stack.Screen
        name="page/[slug]"
        options={{ title: 'Page' }}
      />
      <Stack.Screen
        name="onboarding"
        options={{ title: 'Welcome', headerBackVisible: false }}
      />
    </Stack>
  );
}
