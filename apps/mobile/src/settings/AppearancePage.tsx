import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePrefsStore } from '@discordy/core/application/stores/prefsStore';
import { needsRestart } from '../appearance/appearanceModel';
import { appliedAppearance } from '../appearance/boot';
import { ACCENT_CHOICES, THEME_CHOICES, paletteFor } from '../appearance/palettes';
import { theme } from '../theme';
import { Hint, SettingRow, SettingsPage, StepperRow, SwitchRow } from './rows';

const TEXT_SIZE = { min: 0.85, max: 1.3, step: 0.05 } as const;

/** Desktop's Appearance page as far as a phone allows: Theme, Accent, match the iPhone, and Text size for messages. */
export function AppearancePage({ highlight }: { highlight: string | null }) {
  const prefs = usePrefsStore();
  const restart = needsRestart(appliedAppearance(), prefs, Appearance.getColorScheme());
  return (
    <SettingsPage highlight={highlight}>
      <SettingRow title="Theme" stacked>
        <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={styles.cards}>
          {THEME_CHOICES.map((t) => {
            const palette = paletteFor(t.id, prefs.accent);
            const on = prefs.theme === t.id;
            return (
              <Pressable key={t.id} accessibilityRole="radio" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => prefs.set('theme', t.id)} style={[styles.card, { backgroundColor: palette.background, borderColor: on ? theme.accent : theme.hairlineStrong }]}>
                <View style={styles.preview}>
                  <View style={[styles.swatch, { backgroundColor: palette.surface }]} />
                  <View style={[styles.swatch, { backgroundColor: palette.raised }]} />
                  <View style={[styles.swatch, { backgroundColor: palette.accent }]} />
                </View>
                <Text style={[styles.cardLabel, { color: palette.text }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SettingRow>
      <SettingRow title="Accent" stacked>
        <View accessibilityRole="radiogroup" accessibilityLabel="Accent colour" style={styles.accents}>
          {ACCENT_CHOICES.map((a) => (
            <Pressable key={a.id} accessibilityRole="radio" accessibilityLabel={a.label} accessibilityState={{ selected: prefs.accent === a.id }} onPress={() => prefs.set('accent', a.id)} style={[styles.dot, { backgroundColor: paletteFor('dark', a.id).accent }, prefs.accent === a.id && styles.dotOn]} />
          ))}
        </View>
      </SettingRow>
      <SwitchRow title="Match iPhone appearance" description="Follow the light or dark setting of your iPhone. A dark iPhone keeps the dark variant chosen above. This device only." value={prefs.syncOsTheme} onChange={(v) => prefs.set('syncOsTheme', v)} />
      {restart && <Hint>Your theme and accent are used the next time Voics starts: close it from the app switcher and open it again.</Hint>}
      <StepperRow title="Text size" description="Scales message text. Other text follows the text size set in your iPhone's Display and Brightness settings." value={prefs.fontScale} {...TEXT_SIZE} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => prefs.set('fontScale', v)} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', gap: 10 },
  card: { flex: 1, minHeight: 88, borderRadius: 12, borderWidth: 2, padding: 10, justifyContent: 'space-between' },
  preview: { flexDirection: 'row', gap: 4 },
  swatch: { flex: 1, height: 28, borderRadius: 6 },
  cardLabel: { fontSize: 14, fontWeight: '600' },
  accents: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dot: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: 'transparent' },
  dotOn: { borderColor: theme.text },
});
