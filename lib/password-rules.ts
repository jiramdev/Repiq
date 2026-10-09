// lib/password-rules.ts (safe to import from client components)
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt only uses the first 72 bytes
