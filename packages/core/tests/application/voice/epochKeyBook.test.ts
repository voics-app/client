import { describe, expect, it, vi } from 'vitest';
import { EpochKeyBook } from '@discordy/core/application/voice/epochKeyBook';
import { frameKeyLabel } from '@discordy/core/domain/frameFormat';

const material = (label: string) => new Uint8Array(32).fill(label.length);

function setup() {
  const installed: string[] = [];
  const book = new EpochKeyBook(async (userId, index, bytes) => {
    installed.push(`${userId}@${index}:${bytes.length}`);
  });
  const source = vi.fn(async (userId: string, index: number) => material(frameKeyLabel(userId, index)));
  return { book, installed, source };
}

describe('EpochKeyBook', () => {
  it('installs the epoch key for every known sender, by user and key index', async () => {
    const { book, installed, source } = setup();
    await book.addUser('1');
    await book.addUser('2');
    await book.setEpoch(5, source);
    expect(installed).toEqual(['1@5:32', '2@5:32']);
    expect(source).toHaveBeenCalledWith('1', 5);
    expect(source).toHaveBeenCalledWith('2', 5);
  });

  it('gives a sender that is attached later the latest epoch key, and nothing before the first epoch', async () => {
    const { book, installed, source } = setup();
    await book.addUser('1');
    expect(installed).toEqual([]);
    await book.setEpoch(6, source);
    await book.addUser('3');
    expect(installed).toEqual(['1@6:32', '3@6:32']);
  });

  it('installs a new key index per epoch so older keys stay usable for in-flight frames', async () => {
    const { book, installed, source } = setup();
    await book.addUser('1');
    await book.setEpoch(1, source);
    await book.setEpoch(2, source);
    expect(installed).toEqual(['1@1:32', '1@2:32']);
  });

  it('rejects wrong-sized material instead of installing it', async () => {
    const { book } = setup();
    await book.addUser('1');
    await expect(book.setEpoch(1, async () => new Uint8Array(16))).rejects.toThrow(/length/);
  });

  it('forgets the epoch on clear', async () => {
    const { book, installed, source } = setup();
    await book.setEpoch(1, source);
    book.clear();
    await book.addUser('9');
    expect(installed).toEqual([]);
  });
});
