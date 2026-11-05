import { StyleSheet, View } from 'react-native';
import { space } from '../theme';
import { Txt } from './Txt';

/** A group label in a list: small spaced capitals, 16 pt from the edge, with room above so groups read as groups. */
export function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <View style={styles.row}>
      <Txt accessibilityRole="header" variant="caption" tone="subtle" caps chrome>
        {title}
      </Txt>
      {right ? (
        <Txt variant="caption" tone="subtle" chrome>
          {right}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28, paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[1] },
});
