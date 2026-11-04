import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

export function Placeholder({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 24 },
  title: { color: theme.text, fontSize: 22, fontWeight: '700' },
  hint: { color: theme.muted, marginTop: 8, textAlign: 'center' },
});
