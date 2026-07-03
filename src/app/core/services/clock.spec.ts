import { formatCountdown } from './clock';

describe('formatCountdown', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(59 * 60 + 30)).toBe('59:30');
  });

  it('switches to h:mm:ss at and past an hour', () => {
    expect(formatCountdown(3600)).toBe('1:00:00');
    expect(formatCountdown(3600 + 15 * 60 + 30)).toBe('1:15:30');
    expect(formatCountdown(2 * 3600 + 5 * 60 + 9)).toBe('2:05:09');
  });

  it('clamps negatives to zero', () => {
    expect(formatCountdown(-10)).toBe('0:00');
  });
});
