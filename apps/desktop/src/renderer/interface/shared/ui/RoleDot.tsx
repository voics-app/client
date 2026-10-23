import { usePrefsStore } from '@renderer/application/stores/prefsStore';
import { roleColorStyle } from '@renderer/domain/appearance';

/** Role colour of a name per the Accessibility setting: `tint` styles the name, `dot` draws a dot before it. */
export function useRoleColorDisplay(color: string | undefined): { tint?: string; dot?: string } {
  return roleColorStyle(color, usePrefsStore((s) => s.roleColors));
}

export function RoleDot({ color }: { color: string | undefined }) {
  return color ? <i className="role-dot" aria-hidden="true" style={{ background: color }} /> : null;
}
