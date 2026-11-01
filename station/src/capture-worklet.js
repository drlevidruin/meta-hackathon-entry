const CAPTURE_SAMPLES = 2048; // Keep the existing batch size to bound message and rendering overhead.

class LiveCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(CAPTURE_SAMPLES);
    this.length = 0;
    this.startFrame = 0;
  }

  flush() {
    const samples = this.samples.subarray(0, this.length);
    this.port.postMessage({ samples, startFrame: this.startFrame }, [samples.buffer]);
    this.samples = new Float32Array(CAPTURE_SAMPLES);
    this.length = 0;
  }

  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    if (!input?.length) return true;
    // Preserve a partial buffer separately if the audio clock skips any input frames.
    if (this.length && this.startFrame + this.length !== currentFrame) this.flush();
    for (let offset = 0; offset < input.length;) {
      if (!this.length) this.startFrame = currentFrame + offset;
      const count = Math.min(input.length - offset, CAPTURE_SAMPLES - this.length);
      this.samples.set(input.subarray(offset, offset + count), this.length);
      this.length += count;
      offset += count;
      if (this.length === CAPTURE_SAMPLES) this.flush();
    }
    return true;
  }
}

registerProcessor('kriah-capture', LiveCaptureProcessor);
