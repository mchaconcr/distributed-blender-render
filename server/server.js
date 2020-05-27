const electron = require('electron');
const { app, BrowserWindow } = require('electron');

if(process.env.ELECTRON_ENV=="development"){
	require('electron-reload')(__dirname,{electron: require('electron')});	
}


function createWindow () {
	const win = new BrowserWindow({
		width: 720,
		height: 480,
		webPreferences: {
			nodeIntegration: true,
			enableRemoteModule: true      
		}
	})
	win.loadFile('server.html');
// 	win.webContents.openDevTools()
}

console.log(app.getName());

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
    app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
