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
 * Minimal ambient declaration for the `file-saver` npm package.
 *
 * The package itself is pure JavaScript with no shipped types, and
 * the community `@types/file-saver` package isn't currently a project
 * dependency. We only use the `saveAs` function, so a one-export
 * declaration is enough.
 *
 * The original fTelnet used FileSaver.js as a script-tag global,
 * with a 4-line `FileSaver.d.ts` declaring `saveAs` globally. We
 * now import it as a module instead — cleaner, lets the bundler
 * tree-shake, and avoids polluting the global namespace.
 *
 * If a future Phase 4 swap brings in `@types/file-saver`, this file
 * can be deleted.
 */
declare module 'file-saver' {
  /**
   * Triggers a browser download for the given Blob with the given
   * suggested filename.
   *
   * The `Blob` arg can be a `Blob` or a `File`. The third arg
   * (`disableAutoBOM`) is rarely used and omitted here.
   */
  export function saveAs(blob: Blob, filename?: string): void;
}
