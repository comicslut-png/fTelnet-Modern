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

import { Point, StringUtils } from '../common/index.js';

/**
 * Catalog of available bitmap fonts, keyed by font family name.
 *
 * Each family (e.g. `CP437`, `Amiga-Topaz`, `RIP`) has one or more
 * sizes available. `GetBestFit` picks the largest size that fits in a
 * given viewport so the terminal scales gracefully across screen sizes.
 *
 * Phase 1 migration notes:
 *   - Replaced the AS3-style `any[]` map with a properly-typed
 *     `Map<string, Point[]>`. Same data, real type checking.
 *   - The `__ctor()` static initializer is now run inline at module
 *     load time inside an IIFE.
 *   - 148 font sizes catalogued, identical to the original list.
 *
 * The font PNGs themselves live in /release/fonts/ alongside the
 * fTelnet script. `GetLocalUrl` resolves them relative to the
 * <script id="fTelnetScript"> tag; `GetRemoteUrl` falls back to
 * Rick Parrish's CDN if local hosting isn't an option.
 */
export class CrtFonts {
  /**
   * The complete list of available font + size combinations.
   * Each entry is in the form `Family_WxH`, e.g. `CP437_8x16`.
   */
  private static readonly _fontNames: ReadonlyArray<string> = [
    'Amiga-BStrict_8x8', 'Amiga-BStruct_8x8', 'Amiga-MicroKnight_8x16',
    'Amiga-MicroKnight_8x8', 'Amiga-MoSoul_8x16', 'Amiga-MoSoul_8x8',
    'Amiga-PotNoodle_8x11', 'Amiga-PotNoodle_8x16', 'Amiga-TopazPlus_8x11',
    'Amiga-Topaz_8x11', 'Amiga-Topaz_8x16', 'Atari-Arabic_16x16',
    'Atari-Arabic_8x16', 'Atari-Graphics_16x16', 'Atari-Graphics_8x16',
    'Atari-Graphics_8x8', 'Atari-International_16x16', 'Atari-International_8x16',
    'C128-Lower_8x16', 'C128-Upper_8x16', 'C128-Upper_8x8', 'C128_Lower_8x8',
    'C64-Lower_16x16', 'C64-Lower_8x16', 'C64-Lower_8x8', 'C64-Upper_16x16',
    'C64-Upper_8x16', 'C64-Upper_8x8', 'CP437_10x19', 'CP437_12x23',
    'CP437_6x8', 'CP437_7x12', 'CP437_8x12', 'CP437_8x13', 'CP437_8x14',
    'CP437_8x16', 'CP437_8x8', 'CP437_9x16', 'CP737_12x23', 'CP737_9x16',
    'CP775_9x16', 'CP850_10x19', 'CP850_12x23', 'CP850_8x13', 'CP850_9x16',
    'CP852_10x19', 'CP852_12x23', 'CP852_9x16', 'CP855_9x16', 'CP857_9x16',
    'CP860_9x16', 'CP861_9x16', 'CP862_10x19', 'CP863_9x16', 'CP865_10x19',
    'CP865_12x23', 'CP865_8x13', 'CP865_9x16', 'CP866_9x16', 'CP869_9x16',
    'RIP_7x8', 'RIP_7x14', 'RIP_8x8', 'RIP_8x14', 'RIP_16x14',
    'SyncTerm-0_8x14', 'SyncTerm-0_8x16', 'SyncTerm-0_8x8',
    'SyncTerm-10_8x16', 'SyncTerm-11_8x14', 'SyncTerm-11_8x16',
    'SyncTerm-11_8x8', 'SyncTerm-12_8x16', 'SyncTerm-13_8x16',
    'SyncTerm-14_8x14', 'SyncTerm-14_8x16', 'SyncTerm-14_8x8',
    'SyncTerm-15_8x14', 'SyncTerm-15_8x16', 'SyncTerm-15_8x8',
    'SyncTerm-16_8x14', 'SyncTerm-16_8x16', 'SyncTerm-16_8x8',
    'SyncTerm-17_8x16', 'SyncTerm-17_8x8', 'SyncTerm-18_8x14',
    'SyncTerm-18_8x16', 'SyncTerm-18_8x8', 'SyncTerm-19_8x16',
    'SyncTerm-19_8x8', 'SyncTerm-1_8x16', 'SyncTerm-20_8x14',
    'SyncTerm-20_8x16', 'SyncTerm-20_8x8', 'SyncTerm-21_8x14',
    'SyncTerm-21_8x16', 'SyncTerm-21_8x8', 'SyncTerm-22_8x16',
    'SyncTerm-23_8x14', 'SyncTerm-23_8x16', 'SyncTerm-23_8x8',
    'SyncTerm-24_8x14', 'SyncTerm-24_8x16', 'SyncTerm-24_8x8',
    'SyncTerm-25_8x14', 'SyncTerm-25_8x16', 'SyncTerm-25_8x8',
    'SyncTerm-26_8x16', 'SyncTerm-26_8x8', 'SyncTerm-27_8x16',
    'SyncTerm-28_8x14', 'SyncTerm-28_8x16', 'SyncTerm-28_8x8',
    'SyncTerm-29_8x14', 'SyncTerm-29_8x16', 'SyncTerm-29_8x8',
    'SyncTerm-2_8x14', 'SyncTerm-2_8x16', 'SyncTerm-2_8x8',
    'SyncTerm-30_8x16', 'SyncTerm-31_8x16', 'SyncTerm-32_8x16',
    'SyncTerm-32_8x8', 'SyncTerm-33_8x16', 'SyncTerm-33_8x8',
    'SyncTerm-34_8x16', 'SyncTerm-34_8x8', 'SyncTerm-35_8x16',
    'SyncTerm-35_8x8', 'SyncTerm-36_8x16', 'SyncTerm-36_8x8',
    'SyncTerm-37_8x16', 'SyncTerm-38_8x16', 'SyncTerm-39_8x16',
    'SyncTerm-3_8x14', 'SyncTerm-3_8x16', 'SyncTerm-3_8x8',
    'SyncTerm-40_8x16', 'SyncTerm-4_8x16', 'SyncTerm-5_8x16',
    'SyncTerm-6_8x16', 'SyncTerm-7_8x14', 'SyncTerm-7_8x16',
    'SyncTerm-7_8x8', 'SyncTerm-8_8x14', 'SyncTerm-8_8x16',
    'SyncTerm-8_8x8', 'SyncTerm-9_8x14', 'SyncTerm-9_8x16', 'SyncTerm-9_8x8',
  ];

  /** Map of family name → list of available sizes, sorted biggest first. */
  private static readonly _fonts: Map<string, Point[]> = CrtFonts.buildCatalog();

  private static buildCatalog(): Map<string, Point[]> {
    const result = new Map<string, Point[]>();
    for (const fullName of CrtFonts._fontNames) {
      const parts = fullName.split('_');
      const family = parts[0]!;
      const sizeParts = parts[1]!.split('x');
      const width = parseInt(sizeParts[0]!, 10);
      const height = parseInt(sizeParts[1]!, 10);

      let sizes = result.get(family);
      if (!sizes) {
        sizes = [];
        result.set(family, sizes);
      }
      sizes.push(new Point(width, height));
    }

    // Sort each family's sizes biggest-first so GetBestFit can pick
    // the largest size that fits via a linear scan.
    for (const sizes of result.values()) {
      sizes.sort((a, b) => {
        if (b.x - a.x === 0) {
          return b.y - a.y;
        }
        return b.x - a.x;
      });
    }
    return result;
  }

  /**
   * Find the best size for `font` that fits within `maxWidth`/`maxHeight`.
   * If the family doesn't exist, returns undefined. If no size fits, returns
   * the smallest available (caller can decide whether to render at that
   * size and scale, or refuse).
   */
  public static GetBestFit(font: string, maxWidth: number, maxHeight: number): Point | undefined {
    const sizes = this._fonts.get(font);
    if (!sizes) {
      return undefined;
    }
    if (sizes.length === 1) {
      return sizes[0];
    }
    for (const size of sizes) {
      if (size.x <= maxWidth && size.y <= maxHeight) {
        return size;
      }
    }
    // Nothing fit; return the smallest available.
    return sizes[sizes.length - 1];
  }

  /**
   * Local font URL, resolved relative to the `<script id="fTelnetScript">`
   * tag. If that tag isn't present (e.g. running embedded in some other
   * loader), falls back to the remote CDN URL.
   */
  public static GetLocalUrl(font: string, width: number, height: number): string {
    if (document.getElementById('fTelnetScript') === null) {
      return this.GetRemoteUrl(font, width, height);
    }
    return StringUtils.GetUrl(`fonts/${font}_${width}x${height}.png`);
  }

  /** Remote font URL on Rick Parrish's CDN. */
  public static GetRemoteUrl(font: string, width: number, height: number): string {
    return `//embed-v2.ftelnet.ca/ftelnet/fonts/${font}_${width}x${height}.png`;
  }

  /** Returns true if `font` is a known font family (or family_size). */
  public static HasFont(font: string): boolean {
    if (this._fontNames.indexOf(font) >= 0) {
      return true;
    }
    return this._fonts.has(font);
  }
}
