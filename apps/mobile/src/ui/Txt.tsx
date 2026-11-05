import type { ComponentProps } from 'react';
import { StyleSheet, Text } from 'react-native';
import { CHROME_FONT_CAP, theme, type } from '../theme';

export type TxtVariant = keyof typeof type;
export type TxtTone = 'text' | 'muted' | 'subtle' | 'accent' | 'danger';
export type TxtWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface TxtProps extends ComponentProps<typeof Text> {
  /** A rung of the type scale; `body` by default. */
  variant?: TxtVariant;
  tone?: TxtTone;
  weight?: TxtWeight;
  /** Text inside a fixed-height box stops growing with Dynamic Type at 1.3 so it cannot spill out; free text keeps the system size. */
  chrome?: boolean;
  /** Section labels: small capitals with letter spacing, as in desktop's category headers. */
  caps?: boolean;
}

const WEIGHTS = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;

/** The one text component for screens: type scale, tone and weight as props, a Dynamic Type cap for chrome, and a line height that follows the size. */
export function Txt({ variant = 'body', tone = 'text', weight = 'regular', chrome = false, caps = false, style, ...rest }: TxtProps) {
  const size = type[variant];
  return (
    <Text
      {...(chrome ? { maxFontSizeMultiplier: CHROME_FONT_CAP } : {})}
      {...rest}
      style={[{ fontSize: size, lineHeight: Math.round(size * 1.35), color: theme[tone], fontWeight: WEIGHTS[weight] }, caps && styles.caps, style]}
    />
  );
}

const styles = StyleSheet.create({
  caps: { textTransform: 'uppercase', letterSpacing: 0.66, fontWeight: '600' },
});
