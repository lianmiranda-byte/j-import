const path = require("node:path");
const { app, BrowserWindow, dialog } = require("electron");
const { createServer } = require("../server");

let serverInstance;

if (process.platform === "win32") app.setAppUserModelId("com.jiports.oficina");

async function openWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f5f5f6",
    icon: path.join(__dirname, "..", "assets", "j-iports.ico"),
    title: "J-Iports · Gestão da oficina",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await window.loadURL(`http://127.0.0.1:${serverInstance.port}`);
}

app.whenReady().then(async () => {
  try {
    serverInstance = await createServer({
      host: "127.0.0.1",
      port: 0,
      dataDirectory: path.join(app.getPath("userData"), "database")
    });
    await openWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow().catch(showStartupError);
    });
  } catch (error) {
    showStartupError(error);
  }
});

function showStartupError(error) {
  console.error("Não foi possível abrir o J-Iports:", error);
  dialog.showErrorBox("J-Iports não iniciou", error.message);
  app.quit();
}

app.on("window-all-closed", async () => {
  if (serverInstance) {
    const runningServer = serverInstance;
    serverInstance = null;
    await runningServer.close().catch((error) => console.error("Erro ao encerrar o servidor local:", error));
  }
  if (process.platform !== "darwin") app.quit();
});
