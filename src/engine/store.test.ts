import { describe, expect, it } from 'vitest';
import { buyCourse, emptyProgress, todayXp, dayKey } from './store';
import { audioKey } from '../audio/key';

describe('shop', () => {
  it('starts with 150 coins and can buy a mini-course once', () => {
    const p = emptyProgress();
    expect(p.coins).toBe(150);
    const bought = buyCourse(p, 'mini_x', 60)!;
    expect(bought.coins).toBe(90);
    expect(bought.owned).toContain('mini_x');
    expect(buyCourse(bought, 'mini_x', 60)).toBeNull(); // already owned
  });
  it('refuses when there are not enough coins', () => {
    expect(buyCourse({ ...emptyProgress(), coins: 10 }, 'mini_y', 60)).toBeNull();
  });
});

describe('daily goal', () => {
  it("counts only today's XP", () => {
    const p = { ...emptyProgress(), daily: { day: dayKey(), xp: 30 } };
    expect(todayXp(p)).toBe(30);
    expect(todayXp({ ...p, daily: { day: '2001-01-01', xp: 99 } })).toBe(0);
  });
});

describe('audio keys', () => {
  it('are stable and language-scoped', () => {
    expect(audioKey('sv-SE', 'hund')).toBe(audioKey('sv', ' hund '));
    expect(audioKey('sv-SE', 'hund')).not.toBe(audioKey('pa-IN', 'hund'));
    expect(audioKey('sv', 'hund')).toMatch(/^[0-9a-f]{14}$/);
  });
});
