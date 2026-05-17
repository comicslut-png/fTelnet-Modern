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
export {
  FMenuPopup,
  type MenuActionDetail,
  type MenuActionName,
  type ScreenSizeChangeDetail,
} from './FMenuPopup.js';
export { FScrollbackBar } from './FScrollbackBar.js';
export {
  FSettingsPanel,
  type SettingsMuteChangeDetail,
  type SettingsThemeChangeDetail,
  type SettingsVibrateChangeDetail,
  type ThemeChoice,
} from './FSettingsPanel.js';
export { FStatusBar, type MenuClickDetail } from './FStatusBar.js';
export {
  FTransferProgress,
  type TransferAbortDetail,
} from './FTransferProgress.js';
export { FVirtualKeyboard, type VKKeyEventDetail } from './FVirtualKeyboard.js';
