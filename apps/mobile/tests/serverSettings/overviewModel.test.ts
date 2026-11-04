import { iconUpload, MAX_ICON_BYTES } from '../../src/serverSettings/overviewModel';

describe('iconUpload', () => {
  it('builds a data URI from the picked image', () => {
    expect(iconUpload({ base64: 'QUJD', mimeType: 'image/png' })).toEqual({ uri: 'data:image/png;base64,QUJD' });
  });

  it('assumes JPEG when the picker gives no type', () => {
    expect(iconUpload({ base64: 'QUJD' })).toEqual({ uri: 'data:image/jpeg;base64,QUJD' });
  });

  it('refuses an unreadable image and one over 10 MB', () => {
    expect(iconUpload({})).toEqual({ error: 'Could not read the image.' });
    expect(iconUpload({ base64: 'A'.repeat(Math.ceil((MAX_ICON_BYTES * 4) / 3) + 8) })).toEqual({ error: 'Images must be 10 MB or smaller.' });
  });
});
