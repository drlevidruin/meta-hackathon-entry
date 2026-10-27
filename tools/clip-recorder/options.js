import { checkSet } from './clips.js';

export function parseOptions(argv, command) {
  const options = command === 'server'
    ? { set: 'adult', port: 8790 }
    : { set: 'adult', model: 'primary', keep: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--set') options.set = checkSet(argv[++index]);
    else if (flag === '--port' && command === 'server') {
      const value = argv[++index];
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
        throw new Error('Port must be an integer from 1 to 65535.');
      }
      options.port = Number(value);
    } else if (flag === '--model' && command === 'ear') {
      options.model = argv[++index];
      if (!['primary', 'fallback'].includes(options.model)) throw new Error('Model must be primary or fallback.');
    } else if (flag === '--keep' && command === 'ear') options.keep = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}
