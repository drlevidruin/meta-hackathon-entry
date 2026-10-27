import { checkSet } from './clips.js';
import { defaultVotes } from '../../ear/votes.js';
import { PRESETS } from '../../rulebook/index.js';

export function defaultEarModel(env = process.env) {
  if (env.META_API_KEY?.trim()) return 'primary';
  return env.BASETEN_API_KEY?.trim() ? 'fallback' : 'primary';
}

export function parseOptions(argv, command) {
  const options = command === 'server'
    ? { set: 'adult', port: 8790 }
    : { set: 'adult', model: defaultEarModel(), votes: defaultVotes(), keep: false, preset: 'ashkenazi', meter: true, card: true };
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
    } else if (flag === '--votes' && command === 'ear') {
      const value = argv[++index];
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 5) {
        throw new Error('Votes must be a whole number from 1 to 5.');
      }
      options.votes = Number(value);
    } else if (flag === '--preset' && command === 'ear') {
      options.preset = argv[++index];
      if (!Object.hasOwn(PRESETS, options.preset)) throw new Error(`Preset must be one of: ${Object.keys(PRESETS).join(', ')}`);
    } else if (flag === '--no-meter' && command === 'ear') options.meter = false;
    else if (flag === '--no-card' && command === 'ear') options.card = false;
    else if (flag === '--keep' && command === 'ear') options.keep = true;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (command === 'ear' && options.model === 'fallback') options.votes = 1;
  return options;
}
