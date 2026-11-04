import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../src/theme';

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.hint}>Mentions and replies will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 24 },
  title: { color: theme.text, fontSize: 22, fontWeight: '700' },
  hint: { color: theme.muted, marginTop: 8, textAlign: 'center' },
});
