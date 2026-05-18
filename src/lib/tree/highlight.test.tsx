import { isValidElement } from 'react';
import { describe, expect, test } from 'vitest';
import { highlight } from './highlight';

describe('highlight', () => {
  test('empty needle returns the raw text unchanged', () => {
    expect(highlight('hello', '')).toBe('hello');
  });

  test('no match returns the input as a single text segment', () => {
    expect(highlight('hello', 'world')).toEqual(['hello']);
  });

  test('single match produces [before, <mark>, after]', () => {
    const out = highlight('hello world', 'lo') as unknown[];
    expect(out).toHaveLength(3);
    expect(out[0]).toBe('hel');
    expect(isValidElement(out[1])).toBe(true);
    expect((out[1] as { props: { children: string } }).props.children).toBe(
      'lo',
    );
    expect(out[2]).toBe(' world');
  });

  test('case-insensitive match preserves original casing in the mark', () => {
    const out = highlight('Hello World', 'hello') as unknown[];
    expect(isValidElement(out[0])).toBe(true);
    expect((out[0] as { props: { children: string } }).props.children).toBe(
      'Hello',
    );
  });

  test('multiple matches each get their own <mark>', () => {
    const out = highlight('aXaXa', 'a') as unknown[];
    // Parts: <a>, X, <a>, X, <a>
    expect(out).toHaveLength(5);
    expect(isValidElement(out[0])).toBe(true);
    expect(out[1]).toBe('X');
    expect(isValidElement(out[2])).toBe(true);
    expect(out[3]).toBe('X');
    expect(isValidElement(out[4])).toBe(true);
  });
});
