// A commentary key is either the organiser's eight-character code or, for now,
// the tournament name without spaces. Badukcast ignores letter case for both.
const CODE = /^[2-9A-HJ-NP-Z]{8}$/;
const NAME = /^[A-Za-z0-9_-]{4,64}$/;
export const KEY_HELP = 'Enter your commentary key: the eight-character code or the tournament name without spaces.';

/** Returns the key ready to send, or '' when it cannot be a valid key. */
export function normalizeAccessKey(value) {
    const key = String(value || '').trim();
    if (CODE.test(key.toUpperCase())) return key.toUpperCase();
    return NAME.test(key) ? key : '';
}
