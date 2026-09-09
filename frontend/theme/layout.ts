/**
 * Height a bottom tab bar occupies *above* the device's safe-area inset. Shared so anything that
 * has to float clear of the tab bar (the undo toast, for one) computes the same number the tab
 * bar itself uses, instead of guessing.
 */
export const BASE_TAB_BAR_HEIGHT = 56;
