import { describe, expect, it } from 'vitest';
import { loose, looseKey, tight, tightKey } from './normalize';

describe('tight', () => {
  it('folds case, punctuation and whitespace runs', () => {
    expect(tight('  Ring   of  FIRE!  ')).toBe('ring of fire');
  });

  it('folds diacritics', () => {
    expect(tight('Café Tacvba')).toBe('cafe tacvba');
  });

  it('agrees on ampersand and "and"', () => {
    expect(tight('Hall & Oates')).toBe(tight('Hall and Oates'));
  });

  it('closes up apostrophes rather than splitting the word', () => {
    expect(tight("Rockin' in the Free World")).toBe('rockin in the free world');
    expect(tight('Rockin’ in the Free World')).toBe('rockin in the free world');
  });

  it('keeps non-Latin letters', () => {
    expect(tight('Сплин')).toBe('сплин');
  });

  it('does not strip a leading article', () => {
    expect(tight('The Weight')).toBe('the weight');
  });
});

describe('loose', () => {
  it('drops trailing parentheticals', () => {
    expect(loose('Hurt (Live)')).toBe('hurt');
    expect(loose('Hurt [Remastered 2011]')).toBe('hurt');
  });

  it('drops a dashed qualifier', () => {
    expect(loose('Hurt - Acoustic Version')).toBe('hurt');
  });

  it('drops a featured-artist clause', () => {
    expect(loose('Jackson feat. June Carter')).toBe('jackson');
    expect(loose('Jackson ft June Carter')).toBe('jackson');
  });

  it('strips a leading article', () => {
    expect(loose('The Weight')).toBe('weight');
  });

  it('leaves a name that is only an article alone', () => {
    expect(loose('The The')).toBe('the');
  });
});

describe('keys', () => {
  it('joins song and artist with a separator that cannot appear in either', () => {
    expect(tightKey({ song: 'Ring of Fire', artist: 'Johnny Cash' })).toBe(
      'ring of fire|johnny cash',
    );
  });

  it('omits the artist half when there is no artist', () => {
    expect(tightKey({ song: 'Ring of Fire', artist: '' })).toBe('ring of fire');
  });

  it('folds the article on both halves of a loose key', () => {
    expect(looseKey({ song: 'The Weight', artist: 'The Band' })).toBe('weight|band');
  });
});
