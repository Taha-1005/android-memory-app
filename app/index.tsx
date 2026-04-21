/**
 * Root entry — decide whether to send the user through onboarding or
 * straight into the Browse tab based on whether they already have a key.
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getApiKey } from '../src/secure/apiKey';

export default function Index(): JSX.Element {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const key = await getApiKey();
      if (key) router.replace('/(tabs)/browse');
      else router.replace('/onboarding');
    })().catch(() => router.replace('/onboarding'));
  }, [router]);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
