/**
 * Public exports for the filetransfer module.
 *
 * Currently includes YMODEM (send and receive) plus the in-progress
 * ZMODEM implementation. Phase 4 ships ZMODEM in stages:
 *   Stage 1 ✓ — CRC-32 (in common/CRC.ts) and protocol constants
 *   Stage 2 ✓ — ZModemDecoder (streaming parser)
 *   Stage 3 ✓ — ZModemEncoder (frame builder, this stage)
 *   Stages 4-5 — receive/send state machines (next)
 *   Stage 6 — auto-detect in the ANSI parser
 *   Stage 7 — transfer-progress UI
 *
 * Earlier plans suggested replacing this module with an external
 * library (zmodemjs / zmodem2-js). Decision: continue cleanroom
 * for codebase consistency and long-term maintainability. See
 * docs/phase4-references.md for the implementations we consult
 * when stuck.
 */
export { FileRecord } from './FileRecord.js';
export {
  ZModemDecoder,
  type ZModemDecoderEvents,
} from './ZModemDecoder.js';
export { ZModemEncoder } from './ZModemEncoder.js';
export { ZModemHeader } from './ZModemHeader.js';
export { YModemReceive } from './YModemReceive.js';
export { YModemSend } from './YModemSend.js';
export { YModemSendState } from './YModemSendState.js';
