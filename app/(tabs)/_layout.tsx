import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Plus, BookOpen, MessageCircle, List, Wrench } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeContext';

export default function TabsLayout(): React.JSX.Element {
  const router = useRouter();
  const { colors } = useTheme();
  const settingsButton = () => (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel="Open settings and maintenance"
      style={{ paddingHorizontal: 12 }}
    >
      <Wrench size={22} color={colors.textSecondary} />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.borderSubtle,
        },
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
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
