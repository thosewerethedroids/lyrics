import { describe, expect, it } from 'vitest';
import { alternateBareHyphenParses, displayTitle, parsePageName } from './pageName';

describe('parsePageName', () => {
  it('splits on a spaced dash', () => {
    expect(parsePageName('Ring of Fire - Johnny Cash')).toEqual({
      song: 'Ring of Fire',
      artist: 'Johnny Cash',
    });
  });

  it('keeps a hyphen that belongs to the song', () => {
    expect(parsePageName('Man-Sized Wreath - The Decemberists')).toEqual({
      song: 'Man-Sized Wreath',
      artist: 'The Decemberists',
    });
  });

  it('leaves a hyphenated title alone when there is no artist', () => {
    expect(parsePageName('Man-Sized Wreath')).toEqual({ song: 'Man-Sized Wreath', artist: '' });
  });

  it('splits on the last separator, not the first', () => {
    expect(parsePageName('Marquee Moon - Live - Television')).toEqual({
      song: 'Marquee Moon - Live',
      artist: 'Television',
    });
  });

  it('accepts the en and em dashes iOS substitutes', () => {
    expect(parsePageName('Wagon Wheel – Old Crow Medicine Show')).toEqual({
      song: 'Wagon Wheel',
      artist: 'Old Crow Medicine Show',
    });
    expect(parsePageName('Wagon Wheel — Old Crow')).toEqual({
      song: 'Wagon Wheel',
      artist: 'Old Crow',
    });
  });

  it('treats a one-sided hyphen as a typo of the separator', () => {
    expect(parsePageName('Wagon Wheel- Old Crow')).toEqual({
      song: 'Wagon Wheel',
      artist: 'Old Crow',
    });
    expect(parsePageName('Wagon Wheel -Old Crow')).toEqual({
      song: 'Wagon Wheel',
      artist: 'Old Crow',
    });
  });

  it('does not split when a side would be empty', () => {
    expect(parsePageName('- Johnny Cash')).toEqual({ song: '- Johnny Cash', artist: '' });
    expect(parsePageName('Ring of Fire -')).toEqual({ song: 'Ring of Fire -', artist: '' });
  });

  it('trims surrounding whitespace', () => {
    expect(parsePageName('  Ring of Fire  -  Johnny Cash  ')).toEqual({
      song: 'Ring of Fire',
      artist: 'Johnny Cash',
    });
  });

  it('handles an empty string', () => {
    expect(parsePageName('   ')).toEqual({ song: '', artist: '' });
  });
});

describe('alternateBareHyphenParses', () => {
  it('offers every bare-hyphen split, longest song first', () => {
    expect(alternateBareHyphenParses('Ring of Fire-Johnny Cash')).toEqual([
      { song: 'Ring of Fire', artist: 'Johnny Cash' },
    ]);
  });

  it('offers each hyphen in a multiply-hyphenated string', () => {
    expect(alternateBareHyphenParses('Man-Sized Wreath-The Decemberists')).toEqual([
      { song: 'Man-Sized Wreath', artist: 'The Decemberists' },
      { song: 'Man', artist: 'Sized Wreath-The Decemberists' },
    ]);
  });

  it('returns nothing when there is no hyphen', () => {
    expect(alternateBareHyphenParses('Ring of Fire')).toEqual([]);
  });
});

describe('displayTitle', () => {
  it('joins with a spaced dash', () => {
    expect(displayTitle({ song: 'Ring of Fire', artist: 'Johnny Cash' })).toBe(
      'Ring of Fire - Johnny Cash',
    );
  });

  it('omits the separator when there is no artist', () => {
    expect(displayTitle({ song: 'Ring of Fire', artist: '' })).toBe('Ring of Fire');
  });
});
