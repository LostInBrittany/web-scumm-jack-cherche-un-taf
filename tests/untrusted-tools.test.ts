// What comes from outside the tools (a provider's answer, a layout file, a Studio request body) is read as `unknown`
// and narrowed: a wrong shape is ignored or refused with a message, never trusted.
import { describe, expect, it } from 'vitest';
import {
  type AnthropicStream,
  anthropicCalls,
  anthropicEvent,
  errorBodyMessage,
  ProviderError,
  readAnthropicMessage,
  readOpenAIChunk,
  readOpenAIMessage,
} from '../tools/studio/assistant-loop';
import { layoutsFromExport } from '../tools/pages/import-layout';
import { entity, isBody, noteEdit, textEdit, voicePatch } from '../studio-server/src/ops/routes';

describe('OpenAI-compatible stream chunks', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['a number', 5],
    ['a string', 'hello'],
    ['an array', [1, 2]],
    ['choices not a list', { choices: 'abc' }],
    ['delta not an object', { choices: [{ delta: 'x' }] }],
    ['content not a string', { choices: [{ delta: { content: 42 } }] }],
    ['tool_calls not a list', { choices: [{ delta: { tool_calls: { index: 0 } } }] }],
    ['tool call not an object', { choices: [{ delta: { tool_calls: [null, 7, 'x'] } }] }],
  ])('%s: carries nothing', (_why, data) => {
    const c = readOpenAIChunk(data);
    expect(c.error).toBeUndefined();
    expect(c.text).toBeUndefined();
    expect(c.toolCalls).toEqual([]);
  });

  it('an error stops the turn with its message', () => {
    expect(readOpenAIChunk({ error: { message: 'quota' } }).error).toBe('quota');
    expect(readOpenAIChunk({ error: 'boom' }).error).toBe('"boom"');
    expect(readOpenAIChunk({ error: { code: 1 } }).error).toBe('{"code":1}');
  });

  it('usage of the wrong type counts as zero', () => {
    expect(readOpenAIChunk({ usage: { prompt_tokens: '12', completion_tokens: null } }).usage).toEqual({
      input: 0,
      output: 0,
    });
    expect(readOpenAIChunk({ usage: { prompt_tokens: 3, completion_tokens: 4 } }).usage).toEqual({
      input: 3,
      output: 4,
    });
  });

  it('keeps the fields of a valid tool call fragment, drops the others', () => {
    const c = readOpenAIChunk({
      choices: [
        {
          delta: {
            content: 'hi',
            tool_calls: [
              { index: 1, id: 'call_1', function: { name: 'get_room', arguments: '{"id":' } },
              { index: 'x', function: { arguments: { id: 'house' } } },
            ],
          },
        },
      ],
    });
    expect(c.text).toBe('hi');
    expect(c.toolCalls).toEqual([
      { index: 1, id: 'call_1', name: 'get_room', args: '{"id":' },
      { index: 1, args: '{"id":"house"}' },
    ]);
  });
});

describe('OpenAI-compatible whole answers', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['no choices', {}],
    ['message not an object', { choices: [{ message: 7 }] }],
    ['tool_calls a string', { choices: [{ message: { tool_calls: 'abc' } }] }],
    ['tool_calls entries not objects', { choices: [{ message: { tool_calls: [null, 1] } }] }],
  ])('%s: no text, no call', (_why, data) => {
    const m = readOpenAIMessage(data);
    expect(m.text).toBeUndefined();
    expect(m.calls).toEqual([]);
  });

  it('a call with wrong-typed fields keeps empty ones (then refused as an unknown tool)', () => {
    expect(
      readOpenAIMessage({ choices: [{ message: { tool_calls: [{ id: 3, function: { name: 9 } }] } }] }).calls,
    ).toEqual([{ id: '', name: '', args: '{}' }]);
  });
});

describe('Anthropic stream events', () => {
  const fresh = (): AnthropicStream => ({ blocks: [], partial: new Map(), usage: { input: 0, output: 0 } });

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'x'],
    ['unknown type', { type: 'ping' }],
    ['block start without index', { type: 'content_block_start', content_block: { type: 'text', text: '' } }],
    ['block start with a negative index', { type: 'content_block_start', index: -1, content_block: {} }],
    ['text delta not a string', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 5 } }],
    ['json delta not a string', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta' } }],
    ['usage not numbers', { type: 'message_start', message: { usage: { input_tokens: 'a' } } }],
  ])('%s: shows nothing, keeps no block', (_why, data) => {
    const st = fresh();
    expect(anthropicEvent(st, data)).toBeUndefined();
    expect(st.blocks.filter((b) => b.text)).toEqual([]);
    expect(st.usage).toEqual({ input: 0, output: 0 });
  });

  it('an error event is refused with its message', () => {
    expect(() => anthropicEvent(fresh(), { type: 'error', error: { message: 'overloaded' } })).toThrow(ProviderError);
    expect(() => anthropicEvent(fresh(), { type: 'error', error: { message: 'overloaded' } })).toThrow(
      'anthropic: overloaded',
    );
    expect(() => anthropicEvent(fresh(), { type: 'error' })).toThrow('anthropic: undefined');
  });

  it('a valid tool_use stream gives one call', () => {
    const st = fresh();
    anthropicEvent(st, {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 't1', name: 'validate' },
    });
    anthropicEvent(st, {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    });
    anthropicEvent(st, { type: 'content_block_stop', index: 0 });
    expect(anthropicCalls(st.blocks.filter(Boolean))).toEqual([{ id: 't1', name: 'validate', args: '{}' }]);
  });
});

describe('Anthropic whole answers', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['content a string', { content: 'hello' }],
    ['content an object', { content: { type: 'text' } }],
    ['blocks not objects', { content: [null, 1, 'x', [2]] }],
  ])('%s: no block', (_why, data) => {
    expect(readAnthropicMessage(data).blocks).toEqual([]);
  });

  it('a tool_use with wrong-typed id and name keeps empty ones', () => {
    expect(anthropicCalls([{ type: 'tool_use', id: 1, name: null, input: { a: 1 } }])).toEqual([
      { id: '', name: '', args: '{"a":1}' },
    ]);
  });
});

describe('provider error bodies', () => {
  it.each<[string, string]>([
    ['{"error":{"message":"bad key"}}', 'bad key'],
    ['{"error":"nope"}', 'nope'],
    ['{"message":"down"}', 'down'],
    ['{"error":{"code":5}}', '{"code":5}'],
    ['null', 'null'],
    ['5', '5'],
    ['<html>502</html>', '<html>502</html>'],
  ])('%s → %s', (body, msg) => {
    expect(errorBodyMessage(body)).toBe(msg);
  });
});

describe('layout export files', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['a number', 5],
    ['a list of junk', [null, 1, 'x', { room: 3, layout: {} }, { room: 'house', layout: 'x' }]],
    ['docs of junk', { docs: [{ data: { room: 'house' } }, { room: 'house', layout: null }] }],
    ['layouts with non-object values', { layouts: { house: null, garden: 4, attic: 'x' } }],
    ['a wrapped entry with a non-object layout', { layouts: { house: { room: 'house', layout: 'x' } } }],
    ['a room that is not a string', { room: 5, layout: {} }],
  ])('%s: nothing to import', (_why, json) => {
    expect(layoutsFromExport(json)).toEqual([]);
  });
});

describe('Studio request bodies', () => {
  it('a body must be an object', () => {
    for (const v of [null, 1, 'x', true]) expect(isBody(v)).toBe(false);
    expect(isBody({})).toBe(true);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['no path, bad value', { value: 5 }, '`path` is required'],
    ['bad value', { path: 'look.x[0]', value: 5 }, '`value` must be a string or null'],
    ['missing value', { path: 'look.x[0]' }, '`value` must be a string or null'],
  ])('set_text %s: refused', (_why, b, msg) => {
    expect(() => textEdit(b)).toThrow(msg);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['bad kind', { kind: 'door', id: 'x', at: [1, 2] }, '`kind` must be prop, hotspot or actor'],
    ['id not a string', { kind: 'prop', id: 4, at: [1, 2] }, '`id` must be letters'],
    ['at not a point', { kind: 'prop', id: 'x', at: [1] }, '`at` must be [x, y]'],
    ['at with a string', { kind: 'prop', id: 'x', at: [1, '2'] }, '`at` must be [x, y]'],
  ])('add %s: refused', (_why, b, msg) => {
    expect(() => entity(b)).toThrow(msg);
  });

  it('add: wrong-typed optional fields are dropped', () => {
    expect(entity({ kind: 'prop', id: 'x', at: [1, 2], name: 3, look: {}, img: 0 })).toEqual({
      kind: 'prop',
      id: 'x',
      at: [1, 2],
      name: undefined,
      char: undefined,
      img: undefined,
      look: undefined,
    });
  });

  it('note edit: a wrong `about` is refused once the text is there', () => {
    expect(() => noteEdit({ text: 'hi', about: 3 })).toThrow('`about` must be a string');
    expect(noteEdit({ text: 5, about: 3 })).toEqual({ text: '', about: undefined });
  });

  it('voice patch: a non-string field is refused', () => {
    expect(() => voicePatch({ status: 3 })).toThrow('`status` must be a string');
    expect(voicePatch({ status: 'ok', note: null })).toEqual({ status: 'ok', note: undefined, actor: undefined });
  });
});
