import { readFileSync } from 'node:fs';

export function teacherPinError(pin) {
  if (!pin) return 'TEACHER_PIN is missing; set it to 4 to 12 digits.';
  if (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)) {
    return 'TEACHER_PIN must contain 4 to 12 digits.';
  }
  return null;
}

export function listenOptions(env = process.env) {
  return { host: env.HOST || '127.0.0.1', port: Number(env.PORT || 8787) };
}

export function tlsOptions(env = process.env, readFile = readFileSync) {
  if (!env.TLS_CERT && !env.TLS_KEY) return null;
  for (const name of ['TLS_CERT', 'TLS_KEY']) {
    if (!env[name]) throw new Error(`${name} is missing; set both TLS_CERT and TLS_KEY.`);
  }
  const options = {};
  for (const [name, option] of [['TLS_CERT', 'cert'], ['TLS_KEY', 'key']]) {
    try {
      options[option] = readFile(env[name]);
    } catch {
      throw new Error(`${name} could not be read.`);
    }
  }
  return options;
}

export function startupMessages({ basetenApiKey, metaApiKey, hasStation, host, port, tls = false }) {
  return [
    ...(!basetenApiKey?.trim() && !metaApiKey?.trim()
      ? ['META_API_KEY (primary ear) and BASETEN_API_KEY (fallback ear) are missing; the ear cannot hear and lines show gray.'] : []),
    ...(!hasStation ? ['station/dist is missing; run npm run build.'] : []),
    `Kriah Listener: ${tls ? 'https' : 'http'}://${host.includes(':') ? `[${host}]` : host}:${port}`,
  ];
}
