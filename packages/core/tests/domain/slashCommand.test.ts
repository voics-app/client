import { describe, expect, it } from 'vitest';
import {
  buildCommandData,
  buildComponentData,
  buildModalSubmitData,
  buttonTone,
  modalInitialValues,
  modalInputs,
  modalReady,
  safeComponentUrl,
  selectLimits,
  toggleSelected,
  flattenCommands,
  searchEntries,
  slashQuery,
  validateValues,
} from '@discordy/core/domain/slashCommand';
import type { ApplicationCommand } from '@discordy/core/contracts/rest';

const T = { SUB: 1, GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, NUMBER: 10 };

const commands: ApplicationCommand[] = [
  { id: '1', application_id: 'a1', name: 'ping', description: 'Pong', options: [] },
  {
    id: '2',
    application_id: 'a1',
    name: 'roll',
    description: 'Roll dice',
    options: [
      { type: T.INTEGER, name: 'sides', description: 'Sides', required: true, min_value: 2, max_value: 100 },
      { type: T.STRING, name: 'mode', description: 'Mode', choices: [{ name: 'Sum', value: 'sum' }, { name: 'Max', value: 'max' }] },
    ],
  },
  {
    id: '3',
    application_id: 'a2',
    name: 'role',
    description: 'Manage roles',
    options: [
      { type: T.SUB, name: 'add', description: 'Add', options: [{ type: T.USER, name: 'who', description: 'Who', required: true }] },
      { type: T.GROUP, name: 'mass', description: 'Mass', options: [{ type: T.SUB, name: 'clear', description: 'Clear', options: [] }] },
    ],
  },
  { id: '4', application_id: 'a2', type: 2, name: 'Profile', description: '' },
];

describe('slashQuery', () => {
  it('detects a slash at the start of the composer', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/ro')).toBe('ro');
    expect(slashQuery('/role ad')).toBe('role ad');
  });
  it('ignores ordinary text and paths', () => {
    expect(slashQuery('hello /ro')).toBeNull();
    expect(slashQuery('')).toBeNull();
    expect(slashQuery('/a/b')).toBeNull();
    expect(slashQuery('/ro\nmore')).toBeNull();
  });
});

describe('flattenCommands', () => {
  const entries = flattenCommands(commands);
  it('expands subcommands and groups and skips context menu commands', () => {
    expect(entries.map((e) => e.label)).toEqual(['ping', 'roll', 'role add', 'role mass clear']);
  });
  it('exposes the leaf options and the path', () => {
    const add = entries.find((e) => e.label === 'role add')!;
    expect(add.path).toEqual(['add']);
    expect(add.options.map((o) => o.name)).toEqual(['who']);
    expect(entries.find((e) => e.label === 'role mass clear')!.path).toEqual(['mass', 'clear']);
  });
});

describe('searchEntries', () => {
  const entries = flattenCommands(commands);
  it('ranks prefix matches before substring matches', () => {
    expect(searchEntries(entries, 'ro').map((e) => e.label)).toEqual(['roll', 'role add', 'role mass clear']);
    expect(searchEntries(entries, 'clear').map((e) => e.label)).toEqual(['role mass clear']);
  });
  it('returns everything for an empty query and respects the limit', () => {
    expect(searchEntries(entries, '')).toHaveLength(4);
    expect(searchEntries(entries, '', 2)).toHaveLength(2);
  });
  it('matches multi word queries against the full label', () => {
    expect(searchEntries(entries, 'role a').map((e) => e.label)).toEqual(['role add']);
  });
});

describe('validateValues', () => {
  const roll = flattenCommands(commands).find((e) => e.label === 'roll')!;
  it('requires required options', () => {
    expect(validateValues(roll.options, {})).toEqual({ sides: 'Required' });
  });
  it('checks integer bounds and format', () => {
    expect(validateValues(roll.options, { sides: 'abc' }).sides).toBe('Must be a whole number');
    expect(validateValues(roll.options, { sides: '1' }).sides).toBe('Must be at least 2');
    expect(validateValues(roll.options, { sides: '101' }).sides).toBe('Must be at most 100');
    expect(validateValues(roll.options, { sides: '6' })).toEqual({});
  });
  it('rejects a value outside the choices', () => {
    expect(validateValues(roll.options, { sides: '6', mode: 'min' }).mode).toBe('Pick one of the choices');
  });
  it('checks string length', () => {
    const opts = [{ type: T.STRING, name: 's', description: '', min_length: 2, max_length: 3 }];
    expect(validateValues(opts, { s: 'a' }).s).toBe('At least 2 characters');
    expect(validateValues(opts, { s: 'abcd' }).s).toBe('At most 3 characters');
  });
});

describe('buildCommandData', () => {
  const entries = flattenCommands(commands);
  it('coerces typed values and omits empty optional ones', () => {
    const roll = entries.find((e) => e.label === 'roll')!;
    expect(buildCommandData(roll, { sides: '6', mode: '' })).toEqual({
      id: '2',
      name: 'roll',
      type: 1,
      options: [{ name: 'sides', type: T.INTEGER, value: 6 }],
    });
  });
  it('coerces booleans and numbers', () => {
    const entry = flattenCommands([
      { id: '9', application_id: 'a', name: 'x', description: '', options: [{ type: T.BOOLEAN, name: 'b', description: '' }, { type: T.NUMBER, name: 'n', description: '' }] },
    ])[0]!;
    expect(buildCommandData(entry, { b: 'true', n: '1.5' }).options).toEqual([
      { name: 'b', type: T.BOOLEAN, value: true },
      { name: 'n', type: T.NUMBER, value: 1.5 },
    ]);
  });
  it('nests options inside subcommand groups', () => {
    const add = entries.find((e) => e.label === 'role add')!;
    expect(buildCommandData(add, { who: '42' })).toEqual({
      id: '3',
      name: 'role',
      type: 1,
      options: [{ name: 'add', type: T.SUB, options: [{ name: 'who', type: T.USER, value: '42' }] }],
    });
    const clear = entries.find((e) => e.label === 'role mass clear')!;
    expect(buildCommandData(clear, {}).options).toEqual([
      { name: 'mass', type: T.GROUP, options: [{ name: 'clear', type: T.SUB, options: [] }] },
    ]);
  });
});

describe('component and modal payloads', () => {
  it('builds button and select interaction data', () => {
    expect(buildComponentData({ type: 2, custom_id: 'ok' })).toEqual({ custom_id: 'ok', component_type: 2 });
    expect(buildComponentData({ type: 3, custom_id: 'pick' }, ['a', 'b'])).toEqual({ custom_id: 'pick', component_type: 3, values: ['a', 'b'] });
  });
  it('builds a modal submit in action rows', () => {
    expect(buildModalSubmitData('m1', { name: 'Ada', bio: 'x' })).toEqual({
      custom_id: 'm1',
      components: [
        { type: 1, components: [{ type: 4, custom_id: 'name', value: 'Ada' }] },
        { type: 1, components: [{ type: 4, custom_id: 'bio', value: 'x' }] },
      ],
    });
  });
});

describe('modal helpers', () => {
  const inputs = modalInputs([
    { type: 1, components: [{ type: 4, custom_id: 'name', value: 'Ada' }] },
    { type: 1, components: [{ type: 4, custom_id: 'why', required: false }, { type: 2, custom_id: 'ignored' }] },
  ]);
  it('finds the text inputs inside action rows only', () => {
    expect(inputs.map((i) => i.custom_id)).toEqual(['name', 'why']);
  });
  it('starts each input with its pre-filled value', () => {
    expect(modalInitialValues(inputs)).toEqual({ name: 'Ada', why: '' });
  });
  it('is ready when every required input has text; optional ones may stay empty', () => {
    expect(modalReady(inputs, { name: 'Ada', why: '' })).toBe(true);
    expect(modalReady(inputs, { name: '  ', why: 'x' })).toBe(false);
  });
});

describe('select and button helpers', () => {
  it('defaults a select to one of one', () => {
    expect(selectLimits({})).toEqual({ min: 1, max: 1 });
    expect(selectLimits({ min_values: 0, max_values: 3 })).toEqual({ min: 0, max: 3 });
  });
  it('toggles options without passing the maximum', () => {
    expect(toggleSelected(['a'], 'b', 2)).toEqual(['a', 'b']);
    expect(toggleSelected(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
    expect(toggleSelected(['a', 'b'], 'a', 2)).toEqual(['b']);
  });
  it('names button styles and opens only web addresses', () => {
    expect(buttonTone(undefined)).toBe('primary');
    expect(buttonTone(4)).toBe('danger');
    expect(buttonTone(5)).toBe('link');
    expect(buttonTone(99)).toBe('secondary');
    expect(safeComponentUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(safeComponentUrl('javascript:alert(1)')).toBeNull();
    expect(safeComponentUrl(undefined)).toBeNull();
  });
});
