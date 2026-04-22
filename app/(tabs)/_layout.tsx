import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Plus, BookOpen, MessageCircle, List, Wrench } from 'lucide-react-native';

export default function TabsLayout(): JSX.Element {
  const router = useRouter();
  const settingsButton = () => (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel="Open settings and maintenance"
      style={{ paddingHorizontal: 12 }}
    >
      <Wrench size={22} color="#374151" />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        headerRight: settingsButton,
      }}
    >
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color, size }) => <Plus size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask',
          tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color, size }) => <List size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
