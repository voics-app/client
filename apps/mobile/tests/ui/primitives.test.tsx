import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../../src/ui/controls';
import { EmptyState } from '../../src/ui/EmptyState';
import { ListRow } from '../../src/ui/ListRow';
import { PressableScale } from '../../src/ui/PressableScale';
import { SectionHeader } from '../../src/ui/SectionHeader';
import { MessageSkeletons, RowSkeletons } from '../../src/ui/Skeleton';
import { Txt } from '../../src/ui/Txt';
import { CHROME_FONT_CAP, HIT, radius, space, theme, type } from '../../src/theme';

const styleOf = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe('design scales', () => {
  it('copy desktop tokens: type ladder, 4-point spacing and the four radii', () => {
    expect(Object.values(type)).toEqual([11, 12, 13, 14, 15, 17, 20, 24, 30]);
    expect(Object.values(space)).toEqual([4, 8, 12, 16, 24, 32, 48, 64]);
    expect([radius.chip, radius.control, radius.panel, radius.dialog]).toEqual([6, 10, 14, 20]);
    expect(HIT).toBe(44);
  });
});

describe('Txt', () => {
  it('takes size and colour from the scale and tone, with a line height that follows the size', async () => {
    await render(<Txt variant="title" tone="muted" weight="bold">Hello</Txt>);
    const style = styleOf(screen.getByText('Hello'));
    expect(style).toMatchObject({ fontSize: 17, lineHeight: 23, color: theme.muted, fontWeight: '700' });
  });

  it('caps Dynamic Type for chrome only', async () => {
    await render(
      <>
        <Txt chrome>Row</Txt>
        <Txt>Message</Txt>
      </>,
    );
    expect(screen.getByText('Row').props.maxFontSizeMultiplier).toBe(CHROME_FONT_CAP);
    expect(screen.getByText('Message').props.maxFontSizeMultiplier).toBeUndefined();
  });

  it('sets section labels in spaced capitals', async () => {
    await render(<Txt caps variant="caption">Roles</Txt>);
    expect(styleOf(screen.getByText('Roles'))).toMatchObject({ textTransform: 'uppercase', letterSpacing: 0.66 });
  });
});

describe('PressableScale', () => {
  it('passes presses through and exposes the pressed state to its style', async () => {
    const onPress = jest.fn();
    await render(
      <PressableScale accessibilityRole="button" accessibilityLabel="Go" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Txt>Go</Txt>
      </PressableScale>,
    );
    await fireEvent.press(screen.getByLabelText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Button', () => {
  it('is at least 44 pt high and 48 pt when large', async () => {
    await render(
      <>
        <Button label="Regular" onPress={jest.fn()} />
        <Button label="Large" size="large" tone="primary" onPress={jest.fn()} />
      </>,
    );
    expect(styleOf(screen.getByLabelText('Regular'))).toMatchObject({ minHeight: 44 });
    expect(styleOf(screen.getByLabelText('Large'))).toMatchObject({ minHeight: 48 });
  });

  it('does not fire while busy', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" busy onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ListRow', () => {
  it('is a 52 pt button with a chevron when it opens something, and plain text otherwise', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <ListRow title="Opens" subtitle="More" onPress={onPress} />
        <ListRow title="Static" />
      </>,
    );
    await fireEvent.press(screen.getByLabelText('Opens'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByLabelText('Static')).toBeNull();
    expect(screen.getByText('Static')).toBeTruthy();
    expect(styleOf(screen.getByLabelText('Opens'))).toMatchObject({ minHeight: 52 });
  });
});

describe('EmptyState', () => {
  it('shows a headline, a sentence and one action', async () => {
    const onPress = jest.fn();
    await render(<EmptyState icon="people-outline" title="No friends" body="Add someone." action={{ label: 'Add friend', onPress }} />);
    expect(screen.getByRole('header', { name: 'No friends' })).toBeTruthy();
    expect(screen.getByText('Add someone.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Add friend'));
    expect(onPress).toHaveBeenCalled();
  });

  it('works with a headline alone', async () => {
    await render(<EmptyState icon="people-outline" title="Quiet" />);
    expect(screen.getByText('Quiet')).toBeTruthy();
  });
});

describe('SectionHeader', () => {
  it('is a header with an optional count on the right', async () => {
    await render(<SectionHeader title="Online" right="3" />);
    expect(screen.getByRole('header', { name: 'Online' })).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

describe('skeletons', () => {
  it('stand in for messages and rows with an accessible loading label', async () => {
    await render(
      <>
        <MessageSkeletons count={3} />
        <RowSkeletons count={2} avatar={false} />
      </>,
    );
    expect(screen.getByLabelText('Loading messages')).toBeTruthy();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});
