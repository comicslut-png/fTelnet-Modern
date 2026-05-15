/**
 * Public exports for the components module.
 *
 * Each entry registers its custom element as a module-load side
 * effect (via the @customElement decorator), so importing this
 * barrel is enough to make all components available.
 *
 * Callers that need the class type (for `as FFocusWarning` casts
 * etc.) can import it by name:
 *
 *     import { type FFocusWarning } from '@components/index.js';
 *
 * Tests typically import the file directly for clarity:
 *
 *     import '@components/FFocusWarning.js';
 */
export { FFocusWarning } from './FFocusWarning.js';
