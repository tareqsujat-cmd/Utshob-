import { describe, it, expect } from 'vitest';
import { cleanUrl } from '../config/env.js';

// Regression test: a line break pasted into CLIENT_ORIGIN on Vercel made every response a 500.
describe('cleanUrl', () => {
  it('removes line breaks, spaces, invisible characters and trailing slashes', () => {
    expect(cleanUrl('https://utshob-pu8r.vercel.app\n')).toBe('https://utshob-pu8r.vercel.app');
    expect(cleanUrl(' https://utshob-pu8r.vercel.app/ ')).toBe('https://utshob-pu8r.vercel.app');
    expect(cleanUrl('​https://utshob-pu8r.vercel.app')).toBe('https://utshob-pu8r.vercel.app');
  });

  it('keeps a normal URL unchanged', () => {
    expect(cleanUrl('mongodb+srv://u:p@cluster0.x.mongodb.net/db?w=majority')).toBe(
      'mongodb+srv://u:p@cluster0.x.mongodb.net/db?w=majority'
    );
  });
});
