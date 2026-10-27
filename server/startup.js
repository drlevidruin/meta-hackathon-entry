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

export function startupMessages({ metaApiKey, hasStation, host, port }) {
  return [
    ...(!metaApiKey?.trim() ? ['META_API_KEY is missing; the ear cannot hear and lines show gray.'] : []),
    ...(!hasStation ? ['station/dist is missing; run cd station && npm run build.'] : []),
    `Kriah Listener: http://${host.includes(':') ? `[${host}]` : host}:${port}`,
  ];
}
