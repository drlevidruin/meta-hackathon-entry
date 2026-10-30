import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CurrentLine } from './Game.jsx';

afterEach(() => vi.restoreAllMocks());

it('shrinks a line that overflows the card until it fits, and leaves a line that fits alone', () => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
    return this.classList.contains('current-line') ? 100 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
    if (!this.classList.contains('current-line')) return 0;
    const scale = parseFloat(this.querySelector('.current-line-text')?.style.fontSize || '1');
    return Math.round(this.textContent.length * 4 * scale);
  });
  const { container, rerender } = render(React.createElement(CurrentLine, { item: { id: 'long', text: 'בְּרֵאשִׁית בָּרָא אֱלֹהִים' }, word: null }));
  const size = () => container.querySelector('.current-line-text').style.fontSize;
  expect(size()).toBe('0.9em');
  expect(container.querySelector('.current-line').scrollHeight).toBeLessThanOrEqual(101);
  rerender(React.createElement(CurrentLine, { item: { id: 'short', text: 'בָּרָא' }, word: null }));
  expect(size()).toBe('');
});
