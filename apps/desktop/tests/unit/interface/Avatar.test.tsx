// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Avatar } from '@renderer/interface/shared/ui/Avatar';

afterEach(cleanup);

describe('avatar loading failures', () => {
  it('keeps initials and presence visible when every image URL fails', () => {
    const { container } = render(<Avatar id="7" name="QA account" status="online" sources={['https://cdn/first.png', 'https://cdn/second.png']} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/second.png');
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('QA')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'online' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('tries a newly saved image after a previous image failed', () => {
    const { container, rerender } = render(<Avatar id="7" name="QA account" sources={['https://cdn/old.png']} />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('QA')).toBeTruthy();
    rerender(<Avatar id="7" name="QA account" sources={['https://cdn/new.png']} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/new.png');
    fireEvent.load(container.querySelector('img')!);
    expect(screen.queryByText('QA')).toBeNull();
  });
});
