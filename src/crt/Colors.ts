/*
  fTelnet: An HTML5 WebSocket client
  Copyright (C) Rick Parrish, R&M Software

  This file is part of fTelnet.

  fTelnet is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or any later version.

  fTelnet is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with fTelnet.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * Color constants used throughout the terminal.
 *
 * Phase 1 migration notes:
 *   - Extracted from `Crt` and `CrtFont` to break a circular import:
 *     CharInfo needs colors → was reaching into Crt for them → Crt
 *     uses CharInfo. In the original, this was fine because everything
 *     was global; with ESM it would have caused a load-order cycle.
 *   - Color values are byte-identical to the originals.
 *
 * Two palettes coexist:
 *   - The 16-color ANSI/CGA palette (Crt.BLACK..Crt.WHITE)
 *   - The 16-color PETSCII palette for Commodore 64/128 emulation
 *
 * Values are stored as 0xRRGGBB (24-bit RGB packed into a number).
 */

/**
 * 16-color ANSI/CGA palette indices. These match the dim/bright
 * pairing of the original 4-bit CGA color attribute byte:
 *   bits 0-2 = foreground color (or 0-3 for high-intensity bit)
 *   bit  3   = foreground bright flag
 *   bits 4-6 = background color
 *   bit  7   = blink (or background bright, depending on mode)
 */
export const Color = {
  BLACK: 0,
  BLUE: 1,
  GREEN: 2,
  CYAN: 3,
  RED: 4,
  MAGENTA: 5,
  BROWN: 6,
  LIGHTGRAY: 7,
  DARKGRAY: 8,
  LIGHTBLUE: 9,
  LIGHTGREEN: 10,
  LIGHTCYAN: 11,
  LIGHTRED: 12,
  LIGHTMAGENTA: 13,
  YELLOW: 14,
  WHITE: 15,
  /** When bitwise-OR'd with another color, marks the attribute as blinking. */
  BLINK: 128,
} as const;

/**
 * 16-entry RGB palette used by ANSI/CGA rendering.
 * Values are 0xRRGGBB packed integers.
 *
 * This array is mutated at runtime by CrtFont when loading an Atari
 * font (it swaps entries 0 and 7 to the Atari's signature blue-on-blue
 * scheme). That's why we declare it `let` and as a plain mutable array
 * rather than `const`/`ReadonlyArray`. The mutation is contained to
 * the font loader.
 */
export const ANSI_COLOURS: number[] = [
  0x000000, 0x0000a8, 0x00a800, 0x00a8a8, 0xa80000, 0xa800a8, 0xa85400, 0xa8a8a8,
  0x545454, 0x5454fc, 0x54fc54, 0x54fcfc, 0xfc5454, 0xfc54fc, 0xfcfc54, 0xfcfcfc,
];

/**
 * 16-entry RGB palette used by C64/PETSCII rendering.
 * Values from CGterm's reference palette (chosen as the closest match
 * to authentic C64 hardware output).
 */
export const PETSCII_COLOURS: ReadonlyArray<number> = [
  0x000000, 0xfdfefc, 0xbe1a24, 0x30e6c6, 0xb41ae2, 0x1fd21e, 0x211bae, 0xdff60a,
  0xb84104, 0x6a3304, 0xfe4a57, 0x424540, 0x70746f, 0x59fe59, 0x5f53fe, 0xa4a7a2,
];

/**
 * PETSCII color name constants. The C64 has the same 16 colors as
 * ANSI but in a different palette order, so these can't share with
 * the ANSI constants above.
 */
export const PETSCIIColor = {
  BLACK: 0,
  WHITE: 1,
  RED: 2,
  CYAN: 3,
  PURPLE: 4,
  GREEN: 5,
  BLUE: 6,
  YELLOW: 7,
  ORANGE: 8,
  BROWN: 9,
  LIGHTRED: 10,
  DARKGRAY: 11,
  GRAY: 12,
  LIGHTGREEN: 13,
  LIGHTBLUE: 14,
  LIGHTGRAY: 15,
} as const;
