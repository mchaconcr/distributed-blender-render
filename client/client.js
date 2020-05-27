const electron = require('electron');
const { app, BrowserWindow } = require('electron');

if(process.env.ELECTRON_ENV=="development"){
	require('electron-reload')(__dirname,{electron: require('electron')});	
}

function createWindow () {
  const win = new BrowserWindow({
    width: 720,
    height: 350,
    webPreferences: {
      nodeIntegration: true,
	  enableRemoteModule: true      
    }
  })
  win.loadFile('./client.html')
  //win.webContents.openDevTools()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
