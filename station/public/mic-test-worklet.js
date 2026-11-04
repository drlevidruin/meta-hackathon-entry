class PeakProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    let peak = 0, sum = 0;
    if (input) for (let i = 0; i < input.length; i++) { peak = Math.max(peak, Math.abs(input[i])); sum += input[i] * input[i]; }
    this.port.postMessage(input ? { peak, rms: Math.sqrt(sum / input.length) } : null);
    return true;
  }
}
registerProcessor('peak', PeakProcessor);
