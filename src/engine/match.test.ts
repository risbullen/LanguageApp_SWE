import { describe, expect, it } from 'vitest';
import { matchSpeech, passes, pickChoice } from './match';

describe('matchSpeech', () => {
  it('accepts the word, ignoring case and punctuation', () => {
    expect(passes(matchSpeech('Hund', ['hund.']))).toBe(true);
    expect(passes(matchSpeech('smörgås', ['Smörgås']))).toBe(true);
  });
  it('is lenient with small recognition slips in longer words', () => {
    expect(passes(matchSpeech('smörgåsarna', ['smörgåsarne']))).toBe(true);
  });
  it('rejects a different word', () => {
    expect(passes(matchSpeech('katt', ['hund']))).toBe(false);
    expect(passes(matchSpeech('hunden', ['hundar']))).toBe(false);
  });
  it('uses the best of several recognition alternatives', () => {
    expect(passes(matchSpeech('kaka', ['kakan', 'kaka']))).toBe(true);
  });
  it('accepts a phrase with one word missed', () => {
    const m = matchSpeech('En kopp kaffe, tack.', ['en kopp kaffe']);
    expect(m.score).toBe(0.75);
    expect(passes(m)).toBe(true);
  });
});

describe('pickChoice', () => {
  const choices = ['En kopp kaffe, tack.', 'Ett kopp kaffe, tack.', 'Hej då!'];
  it('finds the spoken answer', () => {
    expect(pickChoice(choices, ['hej då'])!.index).toBe(2);
    expect(pickChoice(choices, ['en kopp kaffe tack'])!.index).toBe(0);
    expect(pickChoice(choices, ['ett kopp kaffe tack'])!.index).toBe(1);
  });
  it('returns null when nothing matches', () => {
    expect(pickChoice(choices, ['jag vill ha te'])).toBeNull();
  });
});
