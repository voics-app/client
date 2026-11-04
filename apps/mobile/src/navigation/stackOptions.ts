import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';
import { theme } from '../theme';

type ScreenOptions = NonNullable<ComponentProps<typeof Stack>['screenOptions']>;

/**
 * Options for every screen in the root stack. The native back button otherwise shows the previous route's file name ("index"),
 * so it is reduced to the chevron on every pushed screen.
 */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: theme.surface },
  headerTintColor: theme.text,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: theme.background },
} as const satisfies ScreenOptions;
