// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatDateFor } from '../src/content/engine';

describe('formatDateFor', () => {
  it('follows the field placeholder', () => {
    expect(formatDateFor('Dec 2020', 'MM/YYYY')).toBe('12/2020');
    expect(formatDateFor('06/2018', 'mm/dd/yyyy')).toBe('06/01/2018');
    expect(formatDateFor('2021-03', 'MM/YY')).toBe('03/21');
    expect(formatDateFor('Jan 2021', 'YYYY-MM')).toBe('2021-01');
    expect(formatDateFor('Jan 2021', 'Start date')).toBe('Jan 2021');
  });
});
