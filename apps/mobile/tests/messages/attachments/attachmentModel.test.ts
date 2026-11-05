import { singleMediaSize, tileRows, uploadLabel } from '../../../src/messages/attachments/attachmentModel';
import { addFiles, fromDocumentAsset, fromImageAsset, MAX_FILE_BYTES } from '../../../src/messages/attachmentPicker';

describe('tileRows', () => {
  it('lays two images side by side', () => {
    expect(tileRows(2).rows.map((r) => r.spans)).toEqual([[3, 3]]);
  });

  it('lays four images as two rows of two', () => {
    expect(tileRows(4).rows.map((r) => r.spans)).toEqual([
      [3, 3],
      [3, 3],
    ]);
  });

  it('marks three images as one tall tile beside two', () => {
    expect(tileRows(3).tallFirst).toBe(true);
  });

  it('shows four tiles at most and counts the rest', () => {
    const grid = tileRows(7);
    expect(grid.shown).toBe(4);
    expect(grid.hidden).toBe(3);
  });
});

describe('singleMediaSize', () => {
  it('keeps the aspect ratio of an image', () => {
    expect(singleMediaSize({ width: 1600, height: 900 }, 300)).toEqual({ width: 300, height: 169 });
  });

  it('limits very tall and very wide images', () => {
    expect(singleMediaSize({ width: 100, height: 4000 }, 300).height).toBe(500);
    expect(singleMediaSize({ width: 4000, height: 100 }, 300).height).toBe(167);
  });

  it('falls back to 4:3 when the size is unknown and never exceeds 320 wide', () => {
    expect(singleMediaSize({}, 500)).toEqual({ width: 320, height: 240 });
  });
});

describe('uploadLabel', () => {
  it('shows the percentage', () => {
    expect(uploadLabel({ loaded: 45, total: 100 })).toBe('Uploading 45%');
    expect(uploadLabel(undefined)).toBe('Uploading 0%');
  });
});

describe('picked files', () => {
  it('names a library photo from its URI when the picker gives no name', () => {
    expect(fromImageAsset({ uri: 'file:///cache/IMG%201.jpg', fileSize: 5, type: 'image' })).toEqual({ uri: 'file:///cache/IMG%201.jpg', name: 'IMG 1.jpg', size: 5, mimeType: 'image/jpeg' });
  });

  it('keeps the document name, size and type', () => {
    expect(fromDocumentAsset({ uri: 'file:///x/doc', name: 'report.pdf', size: 9, mimeType: 'application/pdf' })).toEqual({ uri: 'file:///x/doc', name: 'report.pdf', size: 9, mimeType: 'application/pdf' });
  });

  it('refuses files over 25 MB and more than ten files, and says why', () => {
    const big = { uri: 'u', name: 'big.bin', size: MAX_FILE_BYTES + 1, mimeType: 'x/y' };
    const small = { uri: 'u', name: 'a.txt', size: 1, mimeType: 'text/plain' };
    expect(addFiles([], [big, small])).toMatchObject({ files: [small], problems: [expect.stringContaining('25 MB')] });
    const ten = Array.from({ length: 10 }, () => small);
    expect(addFiles(ten, [small]).problems[0]).toContain('at most 10');
  });
});
