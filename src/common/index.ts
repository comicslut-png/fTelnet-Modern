/**
 * Public exports for the common module.
 *
 * Importers should prefer the barrel:
 *     import { ByteArray, CRC, TypedEvent } from '@common/index.js';
 *
 * rather than reaching into individual files. This keeps refactoring
 * across the module internal.
 */
export { Benchmark } from './Benchmark.js';
export { ByteArray } from './ByteArray.js';
export { ClipboardHelper } from './ClipboardHelper.js';
export { CRC } from './CRC.js';
export { DetectMobileBrowser } from './DetectMobileBrowser.js';
export { GetScrollbarWidth } from './GetScrollbarWidth.js';
export { getOffset } from './Offset.js';
export { Point } from './Point.js';
export { StringUtils } from './StringUtils.js';
export { TypedEvent, type IEvent } from './TypedEvent.js';
