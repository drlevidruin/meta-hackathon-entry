import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

function capture(startFrame = 12345) {
  let processor;
  const scope = { currentFrame: startFrame, Float32Array,
    AudioWorkletProcessor: class { port = { postMessage: vi.fn() }; },
    registerProcessor: vi.fn((name, Processor) => { processor = new Processor(); }),
  };
  runInNewContext(readFileSync('src/capture-worklet.js', 'utf8'), scope);
  const input = new Float32Array(128);
  const output = new Float32Array(128);
  return { scope, processor, input,
    frame(level) {
      input.fill(level);
      output.fill(1);
      expect(processor.process([[input]], [[output]])).toBe(true);
      expect(output.every(value => value === 0)).toBe(true);
      scope.currentFrame += input.length;
    },
  };
}

it('timestamps batched PCM on the audio thread, transfers independent samples and keeps output silent', () => {
  const audio = capture();
  expect(audio.scope.registerProcessor.mock.calls[0][0]).toBe('kriah-capture');
  for (let frame = 0; frame < 15; frame++) audio.frame(.5);
  const sent = audio.processor.port.postMessage;
  expect(sent).not.toHaveBeenCalled();
  audio.frame(.25);
  expect(sent).toHaveBeenCalledOnce();
  const [first, transfer] = sent.mock.calls[0];
  expect(first.startFrame).toBe(12345);
  expect(first.samples).toHaveLength(2048);
  expect(first.samples.subarray(0, 1920).every(value => value === .5)).toBe(true);
  expect(first.samples.subarray(1920).every(value => value === .25)).toBe(true);
  expect(transfer).toEqual([first.samples.buffer]);
  for (let frame = 0; frame < 16; frame++) audio.frame(.75);
  const second = sent.mock.calls[1][0];
  expect(second.startFrame).toBe(12345 + 2048);
  expect(second.samples.every(value => value === .75)).toBe(true);
  expect(first.samples[0]).toBe(.5);
});

it('keeps the audio frame after a gap without relabeling an earlier partial buffer', () => {
  const audio = capture();
  audio.frame(.5);
  audio.scope.currentFrame += 4096;
  for (let frame = 0; frame < 16; frame++) audio.frame(.25);
  const sent = audio.processor.port.postMessage;
  expect(sent).toHaveBeenCalledTimes(2);
  const first = sent.mock.calls[0][0], second = sent.mock.calls[1][0];
  expect(first.startFrame).toBe(12345);
  expect(first.samples).toHaveLength(128);
  expect(first.samples.every(value => value === .5)).toBe(true);
  expect(second.startFrame).toBe(12345 + 128 + 4096);
  expect(second.samples).toHaveLength(2048);
  expect(second.samples.every(value => value === .25)).toBe(true);
});
