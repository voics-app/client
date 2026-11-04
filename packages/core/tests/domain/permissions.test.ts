import { describe, expect, it } from 'vitest';
import { Permission, ALL_PERMISSIONS } from '@discordy/core/contracts';
import { computeBasePermissions, computeChannelPermissions, hasPermission } from '@discordy/core/domain/permissions';

const GUILD = 'g1';
const OWNER = 'owner';
const ME = 'me';
const MOD_ROLE = 'r-mod';
const MUTED_ROLE = 'r-muted';

const everyone = { id: GUILD, permissions: String(Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES) };
const roles = [
  everyone,
  { id: MOD_ROLE, permissions: String(Permission.MANAGE_MESSAGES | Permission.KICK_MEMBERS) },
  { id: MUTED_ROLE, permissions: '0' },
  { id: 'r-admin', permissions: String(Permission.ADMINISTRATOR) },
];

const ctx = (memberRoles: string[], userId = ME) => ({
  guildId: GUILD,
  ownerId: OWNER,
  userId,
  memberRoleIds: memberRoles,
  roles,
});

describe('computeBasePermissions', () => {
  it('ORs @everyone with member roles', () => {
    const perms = computeBasePermissions(ctx([MOD_ROLE]));
    expect(hasPermission(perms, Permission.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(perms, Permission.KICK_MEMBERS)).toBe(true);
    expect(hasPermission(perms, Permission.BAN_MEMBERS)).toBe(false);
  });

  it('grants everything to the owner', () => {
    expect(computeBasePermissions(ctx([], OWNER))).toBe(ALL_PERMISSIONS);
  });

  it('grants everything to administrators', () => {
    expect(computeBasePermissions(ctx(['r-admin']))).toBe(ALL_PERMISSIONS);
  });
});

describe('computeChannelPermissions', () => {
  const cases: {
    name: string;
    memberRoles: string[];
    overwrites: { id: string; type: 0 | 1; allow: string; deny: string }[];
    expectSend: boolean;
    expectView?: boolean;
  }[] = [
    {
      name: '@everyone deny removes a base permission',
      memberRoles: [],
      overwrites: [{ id: GUILD, type: 0, allow: '0', deny: String(Permission.SEND_MESSAGES) }],
      expectSend: false,
    },
    {
      name: 'role allow beats @everyone deny',
      memberRoles: [MOD_ROLE],
      overwrites: [
        { id: GUILD, type: 0, allow: '0', deny: String(Permission.SEND_MESSAGES) },
        { id: MOD_ROLE, type: 0, allow: String(Permission.SEND_MESSAGES), deny: '0' },
      ],
      expectSend: true,
    },
    {
      name: 'role allows win over role denies regardless of order',
      memberRoles: [MOD_ROLE, MUTED_ROLE],
      overwrites: [
        { id: MOD_ROLE, type: 0, allow: String(Permission.SEND_MESSAGES), deny: '0' },
        { id: MUTED_ROLE, type: 0, allow: '0', deny: String(Permission.SEND_MESSAGES) },
      ],
      expectSend: true,
    },
    {
      name: 'member overwrite beats role allow',
      memberRoles: [MOD_ROLE],
      overwrites: [
        { id: MOD_ROLE, type: 0, allow: String(Permission.SEND_MESSAGES), deny: '0' },
        { id: ME, type: 1, allow: '0', deny: String(Permission.SEND_MESSAGES) },
      ],
      expectSend: false,
    },
    {
      name: 'missing VIEW_CHANNEL strips channel-scoped permissions',
      memberRoles: [],
      overwrites: [{ id: GUILD, type: 0, allow: '0', deny: String(Permission.VIEW_CHANNEL) }],
      expectSend: false,
      expectView: false,
    },
    {
      name: 'overwrites for roles the member lacks are ignored',
      memberRoles: [],
      overwrites: [{ id: MUTED_ROLE, type: 0, allow: '0', deny: String(Permission.SEND_MESSAGES) }],
      expectSend: true,
    },
  ];

  it.each(cases)('$name', ({ memberRoles, overwrites, expectSend, expectView }) => {
    const perms = computeChannelPermissions(ctx(memberRoles), overwrites);
    expect(hasPermission(perms, Permission.SEND_MESSAGES)).toBe(expectSend);
    if (expectView !== undefined) expect(hasPermission(perms, Permission.VIEW_CHANNEL)).toBe(expectView);
  });

  it('administrators ignore overwrites', () => {
    const perms = computeChannelPermissions(ctx(['r-admin']), [
      { id: GUILD, type: 0, allow: '0', deny: String(Permission.VIEW_CHANNEL) },
    ]);
    expect(perms).toBe(ALL_PERMISSIONS);
  });
});
