import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

const CLIENT_ID = '105264513863-b5odo8o74n65f3kc0mgqmfv6ptq8l627.apps.googleusercontent.com';
const API_KEY = 'AIzaSyA6XCkMc380JdLRcC4PrY8k9yyFrse7QQQ';
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let gapiInited = false;
let gisInited = false;
let tokenClient;
let nativeAccessToken = null; // Store native token here

// Helper to reliably load a script
const loadScript = (src, globalVar) => {
    return new Promise((resolve, reject) => {
        if (window[globalVar]) {
            resolve();
            return;
        }
        let script = document.querySelector(`script[src="${src}"]`);
        if (script) {
            let count = 0;
            const interval = setInterval(() => {
                if (window[globalVar]) {
                    clearInterval(interval);
                    resolve();
                }
                count++;
                if (count > 200) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        } else {
            script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.body.appendChild(script);
        }
    });
};

export const loadGoogleScripts = async (callback) => {
    // 0. Initialize Capacitor Google Auth if Native
    if (Capacitor.isNativePlatform()) {
        try {
            GoogleAuth.initialize({
                clientId: CLIENT_ID,
                scopes: [SCOPES],
                grantOfflineAccess: true,
            });
            // Skip loading scripts on Native to avoid network errors if GAPI/GIS can't load
            if (callback) callback();
            return true;
        } catch (e) {
            console.error("Failed to initialize GoogleAuth plugin", e);
        }
    }

    try {
        await Promise.all([
            loadScript("https://apis.google.com/js/api.js", "gapi"),
            loadScript("https://accounts.google.com/gsi/client", "google")
        ]);

        if (!gapiInited) {
            await new Promise((resolve) => {
                if (!window.gapi) {
                    resolve();
                    return;
                }
                window.gapi.load('client', async () => {
                    try {
                        await window.gapi.client.init({
                            apiKey: API_KEY,
                            discoveryDocs: DISCOVERY_DOCS,
                        });
                        gapiInited = true;
                    } catch (error) {
                        console.error("Lỗi khởi tạo Google API:", error);
                    }
                    resolve();
                });
            });
        }

        if (!gisInited) {
            if (window.google && window.google.accounts) {
                try {
                    tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: CLIENT_ID,
                        scope: SCOPES,
                        callback: '',
                    });
                    gisInited = true;
                } catch (error) {
                    console.error("Lỗi khởi tạo GIS:", error);
                }
            }
        }

        if (callback) callback();
        return true;
    } catch (error) {
        console.error("Error loading Google Scripts", error);
        return false;
    }
};

export const handleGoogleLogin = () => {
    return new Promise(async (resolve, reject) => {
        // --- 1. Native Handling ---
        if (Capacitor.isNativePlatform()) {
            try {
                const status = await Network.getStatus();
                if (!status.connected) {
                    reject(new Error("Vui lòng kết nối Internet để sử dụng tính năng này."));
                    return;
                }

                const user = await GoogleAuth.signIn();
                if (user.authentication && user.authentication.accessToken) {
                    nativeAccessToken = user.authentication.accessToken;
                    resolve(user);
                } else {
                    reject(new Error("Không lấy được Access Token từ Google"));
                }
            } catch (error) {
                console.error("Native Google Login Error", error);
                let msg = error.message || JSON.stringify(error);
                if (msg.includes("10")) msg = "Lỗi cấu hình Google Cloud (Error 10). Vui lòng kiểm tra SHA-1 Fingerprint.";
                reject(new Error("Lỗi đăng nhập Native: " + msg));
            }
            return;
        }

        // --- 2. Web Handling ---
        if (!tokenClient) {
            if (window.google && window.google.accounts) {
                try {
                    tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: CLIENT_ID,
                        scope: SCOPES,
                        callback: '',
                    });
                    gisInited = true;
                } catch (err) {
                    reject(new Error("Lỗi khởi tạo Google Token Client: " + err.message));
                    return;
                }
            } else {
                reject(new Error("Google Scripts not loaded. Vui lòng kiểm tra kết nối mạng."));
                return;
            }
        }

        tokenClient.callback = async (resp) => {
            if (resp.error) {
                reject(resp);
            }
            resolve(resp);
        };

        try {
            if (gapi.client.getToken() === null) {
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                tokenClient.requestAccessToken({ prompt: '' });
            }
        } catch (e) {
            reject(e);
        }
    });
};

// Helper for Native REST Calls
const callNativeREST = async (method, endpoint, body = null) => {
    if (!nativeAccessToken) throw new Error("Chưa đăng nhập Google (No Native Token)");

    const status = await Network.getStatus();
    if (!status.connected) throw new Error("Không có kết nối Internet. Vui lòng kiểm tra mạng.");

    const url = `https://sheets.googleapis.com/v4/spreadsheets${endpoint}`;
    const options = {
        method: method,
        headers: {
            'Authorization': `Bearer ${nativeAccessToken}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw data.error || new Error("Google API Error");
    }
    return data;
};

export const createSpreadsheet = async (title) => {
    if (Capacitor.isNativePlatform()) {
        const data = await callNativeREST('POST', '', { properties: { title } });
        return data;
    }
    try {
        const response = await gapi.client.sheets.spreadsheets.create({
            resource: { properties: { title } },
        });
        return response.result;
    } catch (err) {
        throw err;
    }
};

export const addSheetToSpreadsheet = async (spreadsheetId, title) => {
    const resource = {
        requests: [{ addSheet: { properties: { title } } }]
    };

    if (Capacitor.isNativePlatform()) {
        const data = await callNativeREST('POST', `/${spreadsheetId}:batchUpdate`, resource);
        return data;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource
        });
        return response.result;
    } catch (err) {
        throw err;
    }
};

export const writeDataToSheet = async (spreadsheetId, range, values) => {
    const resource = { values };

    if (Capacitor.isNativePlatform()) {
        // range format for URL: Sheet1!A1:B2
        // REST Endpoint: PUT /v4/spreadsheets/{spreadsheetId}/values/{range}?valueInputOption=RAW
        const encodedRange = encodeURIComponent(range);
        const url = `/${spreadsheetId}/values/${encodedRange}?valueInputOption=RAW`;
        await callNativeREST('PUT', url, resource);
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource
        });
    } catch (err) {
        throw err;
    }
};

export const readSheetData = async (spreadsheetId, range) => {
    if (Capacitor.isNativePlatform()) {
        const encodedRange = encodeURIComponent(range);
        const data = await callNativeREST('GET', `/${spreadsheetId}/values/${encodedRange}`);
        return data.values;
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });
        return response.result.values;
    } catch (err) {
        throw err;
    }
};

export const formatSheet = async (spreadsheetId, sheetId, rowCount = 50) => {
    if (sheetId === undefined || sheetId === null) {
        console.error("formatSheet: Invalid sheetId", sheetId);
        return;
    }

    const safeRowCount = Math.max(rowCount, 20);
    const requests = [
        { unmergeCells: { range: { sheetId } } },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: safeRowCount, startColumnIndex: 0, endColumnIndex: 13 },
                cell: { userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 11 } } },
                fields: "userEnteredFormat(textFormat)"
            }
        },
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
                cell: { userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", textFormat: { fontFamily: "Times New Roman", bold: true, fontSize: 14 }, wrapStrategy: "WRAP" } },
                fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat,wrapStrategy)"
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 },
                cell: { userEnteredFormat: { horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", textFormat: { fontFamily: "Times New Roman", bold: true, fontSize: 11 }, wrapStrategy: "WRAP" } },
                fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat,wrapStrategy)"
            }
        },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 2, endColumnIndex: 3 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 5, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 6, endColumnIndex: 7 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 7, endColumnIndex: 8 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 8, endColumnIndex: 9 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 9, endColumnIndex: 10 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 10, endColumnIndex: 11 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 11, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
        { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 3, endColumnIndex: 5 }, mergeType: "MERGE_ALL" } },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 12 },
                cell: {
                    userEnteredFormat: {
                        horizontalAlignment: "CENTER",
                        verticalAlignment: "MIDDLE",
                        wrapStrategy: "WRAP",
                        textFormat: { fontFamily: "Times New Roman", bold: true, fontSize: 10 }
                    }
                },
                fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)"
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 5, endRowIndex: Math.max(5, rowCount - 3), startColumnIndex: 0, endColumnIndex: 12 },
                cell: {
                    userEnteredFormat: {
                        verticalAlignment: "MIDDLE",
                        wrapStrategy: "WRAP"
                    }
                },
                fields: "userEnteredFormat(verticalAlignment,wrapStrategy)"
            }
        },
        {
            updateBorders: {
                range: { sheetId, startRowIndex: 3, endRowIndex: Math.max(3, rowCount - 3), startColumnIndex: 0, endColumnIndex: 12 },
                top: { style: "SOLID", width: 1, color: { red: 0, green: 0, blue: 0 } },
                bottom: { style: "SOLID", width: 1, color: { red: 0, green: 0, blue: 0 } },
                left: { style: "SOLID", width: 1, color: { red: 0, green: 0, blue: 0 } },
                right: { style: "SOLID", width: 1, color: { red: 0, green: 0, blue: 0 } },
                innerHorizontal: { style: "SOLID", width: 1, color: { red: 0, green: 0, blue: 0 } },
                innerVertical: { style: "SOLID", width: 1, color: { red: 0, green: 0, blue: 0 } },
            }
        },
        { mergeCells: { range: { sheetId, startRowIndex: rowCount - 1, endRowIndex: rowCount, startColumnIndex: 9, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: rowCount - 1, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 12 },
                cell: { userEnteredFormat: { horizontalAlignment: "CENTER", textFormat: { fontFamily: "Times New Roman", bold: true, fontSize: 11 } } },
                fields: "userEnteredFormat(horizontalAlignment,textFormat)"
            }
        },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 35 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 200 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 80 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 5 }, properties: { pixelSize: 50 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 60 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 10 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 10, endIndex: 11 }, properties: { pixelSize: 120 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 12, endIndex: 13 }, properties: { pixelSize: 100 }, fields: "pixelSize" } },
    ];

    if (Capacitor.isNativePlatform()) {
        await callNativeREST('POST', `/${spreadsheetId}:batchUpdate`, { requests });
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });
    } catch (err) {
        throw err;
    }
};

export const getSpreadsheet = async (spreadsheetId) => {
    if (Capacitor.isNativePlatform()) {
        const data = await callNativeREST('GET', `/${spreadsheetId}`);
        return data; // REST returns the spreadsheet object directly
    }

    try {
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId
        });
        return response.result;
    } catch (err) {
        throw err;
    }
};

export const clearSheet = async (spreadsheetId, range) => {
    if (Capacitor.isNativePlatform()) {
        const encodedRange = encodeURIComponent(range);
        await callNativeREST('POST', `/${spreadsheetId}/values/${encodedRange}:clear`);
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId,
            range
        });
    } catch (err) {
        throw err;
    }
};

export const deleteSheet = async (spreadsheetId, sheetId) => {
    const requests = [
        { deleteSheet: { sheetId } }
    ];

    if (Capacitor.isNativePlatform()) {
        await callNativeREST('POST', `/${spreadsheetId}:batchUpdate`, { requests });
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });
    } catch (err) {
        throw err;
    }
};

export const updateRowInSheet = async (spreadsheetId, range, values) => {
    return writeDataToSheet(spreadsheetId, range, values);
};

export const deleteRow = async (spreadsheetId, sheetId, rowIndex) => {
    const requests = [
        {
            deleteDimension: {
                range: {
                    sheetId,
                    dimension: "ROWS",
                    startIndex: rowIndex,
                    endIndex: rowIndex + 1
                }
            }
        }
    ];

    if (Capacitor.isNativePlatform()) {
        await callNativeREST('POST', `/${spreadsheetId}:batchUpdate`, { requests });
        return;
    }

    try {
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });
    } catch (err) {
        throw err;
    }
};

export const appendDataToSheet = async (spreadsheetId, range, values) => {
    const resource = { values };
    if (Capacitor.isNativePlatform()) {
        const encodedRange = encodeURIComponent(range);
        await callNativeREST('POST', `/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=RAW`, resource);
        return;
    }
    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            resource
        });
    } catch (err) {
        throw err;
    }
};
