import { MODE_COPY } from '@discordy/core/domain/deliveryMode';
import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../src/brand';
import { theme } from '../src/theme';

export default function SignIn() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{BRAND.displayName}</Text>
      <Text style={styles.hint}>Sign in arrives with the text MVP.</Text>
      <Text style={styles.hint}>{MODE_COPY.standard.description}</Text>
      <Link href="/servers" style={styles.link}>
        Continue to the app skeleton
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, padding: 24 },
  title: { color: theme.text, fontSize: 32, fontWeight: '800' },
  hint: { color: theme.muted, marginTop: 8 },
  link: { color: theme.accent, marginTop: 24, fontSize: 16 },
});
