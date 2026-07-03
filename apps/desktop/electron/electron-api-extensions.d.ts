// Electron 42.3.2 ships the runtime symbol `app.setDesktopName` (it controls the
// Wayland xdg_toplevel app_id and the X11 WM_CLASS second slot) but its bundled
// electron.d.ts does not declare it yet. Declare-merge the missing member onto
// Electron.App until upstream types catch up.
declare namespace Electron {
  interface App {
    /**
     * Sets the desktop file name used to resolve the window manager identity.
     * On Wayland this becomes the xdg_toplevel app_id; on X11 it feeds WM_CLASS.
     * Must be called before the `ready` event.
     *
     * @platform linux
     */
    setDesktopName(name: string): void
  }
}
