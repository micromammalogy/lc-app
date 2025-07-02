const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');

let mainWindow;
let server;
const PORT = 3001;

function createServer() {
    const expressApp = express();
    expressApp.use(cors());
    expressApp.use(express.json());
    expressApp.use(express.static('public'));

    if (!fs.existsSync('responses')) {
        fs.mkdirSync('responses');
    }

    expressApp.post('/api/zonos', async (req, res) => {
        try {
            const { credentialToken, mutation } = req.body;
            
            console.log('=== DEBUG: Request received ===');
            console.log('Mutation:', JSON.stringify(mutation, null, 2));
            console.log('Calling Zonos API...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch('https://api.zonos.com/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'credentialToken': credentialToken
                },
                body: JSON.stringify(mutation),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('Zonos API responded with status:', response.status);
            
            const result = await response.json();
            console.log('Zonos API result:', JSON.stringify(result, null, 2));
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `zonos-response-${timestamp}.json`;
            fs.writeFileSync(`responses/${filename}`, JSON.stringify(result, null, 2));
            
            console.log('Sending response back to frontend...');
            
            if (result.errors && result.errors.length > 0) {
                console.log('GraphQL errors found:', result.errors);
                res.json({ 
                    success: false, 
                    error: result.errors[0].message,
                    savedTo: filename,
                    fullResponse: result
                });
            } else {
                res.json({ success: true, data: result.data, savedTo: filename });
            }
            console.log('Response sent successfully');
            
        } catch (error) {
            console.error('Error proxying request:', error);
            
            let errorMessage = error.message;
            if (error.name === 'AbortError') {
                errorMessage = 'Request timed out after 30 seconds';
            }
            
            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    });

    expressApp.get('/api/settings', (req, res) => {
        try {
            const settingsPath = path.join(__dirname, 'settings.json');
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                res.json(settings);
            } else {
                res.json({ credentialToken: '' });
            }
        } catch (error) {
            res.json({ credentialToken: '' });
        }
    });

    expressApp.post('/api/settings', (req, res) => {
        try {
            const settingsPath = path.join(__dirname, 'settings.json');
            fs.writeFileSync(settingsPath, JSON.stringify(req.body, null, 2));
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    server = expressApp.listen(PORT, () => {
        console.log(`Desktop app server running on port ${PORT}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            allowRunningInsecureContent: false
        },
        titleBarStyle: 'default',
        show: false
    });

    mainWindow.loadURL(`http://localhost:${PORT}`);
    
    mainWindow.webContents.on('context-menu', (event, params) => {
        const { Menu, MenuItem } = require('electron');
        const menu = new Menu();

        if (params.isEditable) {
            menu.append(new MenuItem({
                label: 'Cut',
                role: 'cut',
                enabled: params.editFlags.canCut
            }));
            
            menu.append(new MenuItem({
                label: 'Copy',
                role: 'copy',
                enabled: params.editFlags.canCopy
            }));
            
            menu.append(new MenuItem({
                label: 'Paste',
                role: 'paste',
                enabled: params.editFlags.canPaste
            }));
            
            menu.append(new MenuItem({ type: 'separator' }));
            
            menu.append(new MenuItem({
                label: 'Select All',
                role: 'selectall'
            }));
        } else if (params.selectionText) {
            menu.append(new MenuItem({
                label: 'Copy',
                role: 'copy'
            }));
        }

        if (menu.items.length > 0) {
            menu.popup({
                window: mainWindow,
                x: params.x,
                y: params.y
            });
        }
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Open Responses Folder',
                    click: () => {
                        const { shell } = require('electron');
                        shell.openPath(path.join(__dirname, 'responses'));
                    }
                },
                { type: 'separator' },
                {
                    label: 'Quit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectall' }
            ]
        },
        {
            label: 'Settings',
            submenu: [
                {
                    label: 'Clear Saved Credential Token',
                    click: async () => {
                        const response = await dialog.showMessageBox(mainWindow, {
                            type: 'question',
                            buttons: ['Cancel', 'Clear'],
                            defaultId: 0,
                            message: 'Are you sure you want to clear the saved credential token?'
                        });
                        
                        if (response.response === 1) {
                            try {
                                const settingsPath = path.join(__dirname, 'settings.json');
                                fs.writeFileSync(settingsPath, JSON.stringify({ credentialToken: '' }, null, 2));
                                mainWindow.reload();
                            } catch (error) {
                                console.error('Error clearing settings:', error);
                            }
                        }
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createServer();
    setTimeout(createWindow, 1000);
});

app.on('window-all-closed', () => {
    if (server) {
        server.close();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    if (server) {
        server.close();
    }
});
