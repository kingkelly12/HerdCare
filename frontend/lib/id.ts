// Pure-JS UUID v4 generator, deliberately free of any React Native / native-module
// dependency: db/schema.ts imports this for primary-key defaults, and that file is
// also loaded directly under Node by `drizzle-kit generate` — a native import there
// breaks migration generation.
export function generateId(): string {
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4';
    } else if (i === 19) {
      uuid += ((Math.random() * 4) | 8).toString(16);
    } else {
      uuid += ((Math.random() * 16) | 0).toString(16);
    }
  }
  return uuid;
}
