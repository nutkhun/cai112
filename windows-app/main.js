// Blackhole Timer — Electron main process: the window, the system tray, and app-level glue.
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, screen } = require('electron');
const path = require('path');

const WEBSITE = 'https://claude101.getworkdone.space';
// The layout's natural size in CSS pixels. The window shows it zoomed to fit the screen
// (at most 90%), so it never needs scrollbars, even with Windows display scaling.
const DESIGN = { width: 420, height: 850 };
const MAX_ZOOM = 0.9;
const TITLE_BAR = 36;
const ICON = path.join(__dirname, 'assets', 'icon.png');

// Lets Windows show our notifications under the app's own name.
app.setAppUserModelId('com.cai112.blackholetimer');

let win = null;
let tray = null;
let quitting = false;

// One copy at a time: opening it again just brings the window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const zoom = Math.min(MAX_ZOOM, (workArea.height - 24) / DESIGN.height, (workArea.width - 24) / DESIGN.width);
  win = new BrowserWindow({
    width: Math.round(DESIGN.width * zoom),
    height: Math.round(DESIGN.height * zoom),
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#05070d',
    title: 'Blackhole Timer',
    icon: ICON,
    // Our own dark title area, with Windows' minimise/close buttons drawn over it.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#070a14', symbolColor: '#d6dcff', height: Math.round(TITLE_BAR * zoom) },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      zoomFactor: zoom,
      contextIsolation: true,
      nodeIntegration: false,
      // Keep counting down and sounding alarms while the window is hidden,
      // and let alarms play without needing a click first.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.removeMenu();
  // Chromium remembers zoom per page, so set ours every time the page loads.
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(zoom));
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Closing the window keeps the timers running in the tray.
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('focus', () => win.flashFrame(false));
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const image = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('Blackhole Timer');
  tray.on('click', showWindow);
  setTrayMenu([]);
}

function setTrayMenu(timers) {
  const items = timers.map((t) => ({ label: `${t.name} — ${t.text}`, click: showWindow }));
  tray.setContextMenu(Menu.buildFromTemplate([
    ...items,
    ...(items.length ? [{ type: 'separator' }] : []),
    { label: 'Show Blackhole Timer', click: showWindow },
    { label: 'Quit Blackhole Timer', click: () => { quitting = true; app.quit(); } },
  ]));
}

// The window reports the running timers once a second.
let lastTray = '';
ipcMain.on('tray:update', (_event, data) => {
  if (!tray) return;
  const key = JSON.stringify(data);
  if (key === lastTray) return;
  lastTray = key;
  tray.setToolTip(data.tooltip || 'Blackhole Timer');
  setTrayMenu(data.timers || []);
});

// Time is up: bring the window forward and flash it in the taskbar.
ipcMain.on('app:attention', () => {
  showWindow();
  if (win) win.flashFrame(true);
});

ipcMain.on('app:open-website', () => shell.openExternal(WEBSITE));

app.on('before-quit', () => { quitting = true; });
app.on('activate', showWindow);  // macOS (when testing there)
app.on('window-all-closed', () => { /* stay in the tray */ });
