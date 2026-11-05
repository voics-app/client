import { draftOf, profilePatch, shownColor } from '../../src/settings/profileEditModel';

const user = { global_name: 'Me Myself', bio: 'hello', accent_color: 0x336699 };

describe('profilePatch', () => {
  it('is empty for an untouched draft', () => {
    expect(profilePatch(user, draftOf(user))).toEqual({});
  });

  it('sends only what changed', () => {
    expect(profilePatch(user, { ...draftOf(user), bio: 'new bio' })).toEqual({ bio: 'new bio' });
    expect(profilePatch(user, { ...draftOf(user), color: '#e5484d' })).toEqual({ accent_color: 0xe5484d });
  });

  it('clears the display name with null and trims it', () => {
    expect(profilePatch(user, { ...draftOf(user), globalName: '   ' })).toEqual({ global_name: null });
    expect(profilePatch(user, { ...draftOf(user), globalName: ' Pat ' })).toEqual({ global_name: 'Pat' });
  });

  it('enforces the display name and About me limits desktop has', () => {
    expect(profilePatch(user, { ...draftOf(user), globalName: 'x'.repeat(40) }).global_name).toHaveLength(32);
    expect(profilePatch(user, { ...draftOf(user), bio: 'x'.repeat(400) }).bio).toHaveLength(300);
  });

  it('sends a newly picked avatar and banner', () => {
    expect(profilePatch(user, { ...draftOf(user), avatar: 'data:image/png;base64,AA', banner: 'data:image/png;base64,BB' })).toEqual({ avatar: 'data:image/png;base64,AA', banner: 'data:image/png;base64,BB' });
  });

  it('does not resend the colour the account already has', () => {
    expect(profilePatch(user, { ...draftOf(user), color: '#336699' })).toEqual({});
  });
});

describe('shownColor', () => {
  it('prefers the draft, then the account, then none', () => {
    expect(shownColor(user, { ...draftOf(user), color: '#e5484d' })).toBe('#e5484d');
    expect(shownColor(user, draftOf(user))).toBe('#336699');
    expect(shownColor({ accent_color: null }, draftOf(user))).toBeNull();
  });
});
