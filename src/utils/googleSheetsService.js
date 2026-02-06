// Service to handle Google Sheets API interactions

const CLIENT_ID = '105264513863-b5odo8o74n65f3kc0mgqmfv6ptq8l627.apps.googleusercontent.com'; // Placeholder - User needs to fill this
const API_KEY = 'AIzaSyA6XCkMc380JdLRcC4PrY8k9yyFrse7QQQ';       // Placeholder - User needs to fill this
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let gapiInited = false;
let gisInited = false;
let tokenClient;

// Helper to reliably load a script
const loadScript = (src, globalVar) => {
    return new Promise((resolve, reject) => {
        // 1. Check if global variable already exists (e.g. window.gapi)
        if (window[globalVar]) {
            resolve();
            return;
        }

        // 2. Check if script tag exists
        let script = document.querySelector(`script[src="${src}"]`);
        if (script) {
            // Script exists but global var not ready. Poll for it.
            let count = 0;
            const interval = setInterval(() => {
                if (window[globalVar]) {
                    clearInterval(interval);
                    resolve();
                }
                count++;
                if (count > 200) { // ~20 seconds timeout
                     clearInterval(interval);
                     console.warn(`Timeout waiting for ${globalVar} from ${src}`);
                     // Try resolving anyway, maybe it's there but something else is wrong.
                     // Or reject? Let's resolve and let init fail if needed.
                     resolve(); 
                }
            }, 100);
        } else {
            // 3. Load new script
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
    try {
        // Wait for both scripts to be physically loaded and globals available
        await Promise.all([
            loadScript("https://apis.google.com/js/api.js", "gapi"),
            loadScript("https://accounts.google.com/gsi/client", "google")
        ]);

        // Initialize GAPI Client
        if (!gapiInited) {
            await new Promise((resolve) => {
                if (!window.gapi) {
                    console.error("GAPI loaded but window.gapi is missing");
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
                        console.error("Lỗi khởi tạo Google API (Kiểm tra API Key):", error);
                        // Don't alert here, just log. The action will fail later if needed.
                    }
                    resolve();
                });
            });
        }

        // Initialize GIS Token Client
        if (!gisInited) {
            if (window.google && window.google.accounts) {
                try {
                    tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: CLIENT_ID,
                        scope: SCOPES,
                        callback: '', // defined at request time
                    });
                    gisInited = true;
                } catch (error) {
                    console.error("Lỗi khởi tạo Google Identity Services:", error);
                }
            } else {
                console.error("GIS loaded but window.google.accounts is missing");
            }
        }

        // Notify ready
        if (callback) callback();

    } catch (err) {
        console.error("Critical error loading Google Scripts:", err);
        alert("Không thể kết nối đến máy chủ Google. Vui lòng kiểm tra kết nối mạng.");
    }
};

export const handleGoogleLogin = () => {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            // Try to re-init if missing?
            if (window.google && window.google.accounts) {
                 tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: '',
                });
                gisInited = true;
            } else {
                reject("Google Scripts not loaded");
                return;
            }
        }

        tokenClient.callback = async (resp) => {
            if (resp.error) {
                reject(resp);
            }
            resolve(resp);
        };

        if (gapi.client.getToken() === null) {
            tokenClient.requestAccessToken({prompt: 'consent'});
        } else {
            tokenClient.requestAccessToken({prompt: ''});
        }
    });
};

export const createSpreadsheet = async (title) => {
    try {
        const response = await gapi.client.sheets.spreadsheets.create({
            resource: {
                properties: {
                    title: title,
                },
            },
        });
        return response.result;
    } catch (err) {
        console.error("Error creating spreadsheet", err);
        throw err;
    }
};

export const addSheetToSpreadsheet = async (spreadsheetId, title) => {
    try {
        const response = await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: title,
                            },
                        },
                    },
                ],
            },
        });
        return response.result;
    } catch (err) {
        // console.error("Error adding sheet", err); 
        // Don't log here to avoid noise on duplicate check
        throw err;
    }
};

export const writeDataToSheet = async (spreadsheetId, range, values) => {
    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            resource: {
                values: values,
            },
        });
    } catch (err) {
        console.error("Error writing data", err);
        throw err;
    }
};

export const readSheetData = async (spreadsheetId, range) => {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: range,
        });
        return response.result.values;
    } catch (err) {
        console.error("Error reading sheet", err);
        throw err;
    }
};

export const formatSheet = async (spreadsheetId, sheetId, rowCount = 50) => {
    if (sheetId === undefined || sheetId === null) {
        console.error("formatSheet: Invalid sheetId", sheetId);
        return;
    }
    try {
        const safeRowCount = Math.max(rowCount, 20);
        const requests = [
            // 0. Unmerge all cells first to avoid conflicts
            {
                unmergeCells: {
                    range: { sheetId }
                }
            },
            // 1. Global Font
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: safeRowCount, startColumnIndex: 0, endColumnIndex: 13 },
                    cell: { userEnteredFormat: { textFormat: { fontFamily: "Times New Roman", fontSize: 11 } } },
                    fields: "userEnteredFormat(textFormat)"
                }
            },
            
            // 2. Merge Title Rows (0, 1, 2)
            { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
            { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
            { mergeCells: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },

            // 3. Center & Bold Titles (Main Title Only)
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 12 },
                    cell: { userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", textFormat: { fontFamily: "Times New Roman", bold: true, fontSize: 14 }, wrapStrategy: "WRAP" } },
                    fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat,wrapStrategy)"
                }
            },
            // 3.1 Subtitles (Rows 1-2) - Center Align & Bold
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 12 },
                    cell: { userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", textFormat: { fontFamily: "Times New Roman", bold: true, fontSize: 11 }, wrapStrategy: "WRAP" } },
                    fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat,wrapStrategy)"
                }
            },
            
            // 4. Merge Headers (Rows 3-4)
            // Vertical Merges
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 1 }, mergeType: "MERGE_ALL" } }, // STT
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 }, mergeType: "MERGE_ALL" } }, // Name
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 2, endColumnIndex: 3 }, mergeType: "MERGE_ALL" } }, // Relation
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 5, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } }, // CCCD
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 6, endColumnIndex: 7 }, mergeType: "MERGE_ALL" } }, // Ethnic
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 7, endColumnIndex: 8 }, mergeType: "MERGE_ALL" } }, // Job
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 8, endColumnIndex: 9 }, mergeType: "MERGE_ALL" } }, // ResTime
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 9, endColumnIndex: 10 }, mergeType: "MERGE_ALL" } }, // PermAddr
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 10, endColumnIndex: 11 }, mergeType: "MERGE_ALL" } }, // CurrAddr
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: 11, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } }, // Phone
            // Horizontal Merge for DOB
            { mergeCells: { range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 3, endColumnIndex: 5 }, mergeType: "MERGE_ALL" } }, // DOB Header

            // 5. Header Styles
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
            
            // 5.1 Data Rows Styles (Vertical Align Middle + Wrap)
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
            
            // 6. Borders (Rows 3 to rowCount - 3)
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

            // 7. Footer Alignment (Signature)
            // Merge Columns J-L (Index 9-11) for signature block at rowCount - 1
            { mergeCells: { range: { sheetId, startRowIndex: rowCount - 1, endRowIndex: rowCount, startColumnIndex: 9, endColumnIndex: 12 }, mergeType: "MERGE_ALL" } },
            
            {
                repeatCell: {
                    range: { sheetId, startRowIndex: rowCount - 1, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: 12 },
                    cell: { userEnteredFormat: { horizontalAlignment: "CENTER", textFormat: { fontFamily: "Times New Roman", bold: true, fontSize: 11 } } },
                    fields: "userEnteredFormat(horizontalAlignment,textFormat)"
                }
            },
            
            // 8. Column Widths (Adjusted for better readability)
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 35 }, fields: "pixelSize" } }, // STT
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 200 }, fields: "pixelSize" } }, // Name
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 80 }, fields: "pixelSize" } }, // Rel
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 3, endIndex: 5 }, properties: { pixelSize: 50 }, fields: "pixelSize" } }, // DOB (Nam/Nu)
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 110 }, fields: "pixelSize" } }, // CCCD
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 50 }, fields: "pixelSize" } }, // Ethnic
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // Job
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 90 }, fields: "pixelSize" } }, // ResTime
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 9, endIndex: 11 }, properties: { pixelSize: 150 }, fields: "pixelSize" } }, // Addr
            { updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 100 }, fields: "pixelSize" } }, // Phone
            
            // 9. Row Heights (Detailed - Editable per row 0-15)
            // Row 1 (Index 0): Tiêu đề chính
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 34 }, fields: "pixelSize" } },
            // Row 2 (Index 1): Tiêu đề phụ
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 30 }, fields: "pixelSize" } },
            // Row 3 (Index 2): Địa chỉ
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 2, endIndex: 3 }, properties: { pixelSize: 30 }, fields: "pixelSize" } },
            // Row 4 (Index 3): Header Top
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 3, endIndex: 4 }, properties: { pixelSize: 30 }, fields: "pixelSize" } },
            // Row 5 (Index 4): Header Bottom
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 4, endIndex: 5 }, properties: { pixelSize: 26 }, fields: "pixelSize" } },
            
            // Data Rows (Explicitly listed for manual adjustment)
            // Row 6 (Index 5) - STT 1
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 5, endIndex: 6 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 7 (Index 6) - STT 2
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 6, endIndex: 7 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 8 (Index 7) - STT 3
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 7, endIndex: 8 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 9 (Index 8) - STT 4
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 8, endIndex: 9 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 10 (Index 9) - STT 5
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 9, endIndex: 10 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 11 (Index 10) - STT 6
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 10, endIndex: 11 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 12 (Index 11)
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 11, endIndex: 12 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 13 (Index 12)
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 12, endIndex: 13 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 14 (Index 13)
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 13, endIndex: 14 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            // Row 15 (Index 14)
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 14, endIndex: 15 }, properties: { pixelSize: 90 }, fields: "pixelSize" } },
            
            // Rows 15+ (Remaining Data)
            ...(Math.max(5, rowCount - 3) > 15 ? [{
                updateDimensionProperties: {
                    range: { sheetId, dimension: "ROWS", startIndex: 15, endIndex: rowCount - 3 },
                    properties: { pixelSize: 40 },
                    fields: "pixelSize"
                }
            }] : []),

            // Ensure Empty Rows & Footer are normal height (override hardcoded 90px if needed)
            { updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: Math.max(5, rowCount - 3), endIndex: rowCount }, properties: { pixelSize: 30 }, fields: "pixelSize" } },
            
             // 10. Hide ID Column
             {
                updateDimensionProperties: {
                    range: { sheetId, dimension: "COLUMNS", startIndex: 12, endIndex: 13 },
                    properties: { hiddenByUser: true },
                    fields: "hiddenByUser"
                }
            }
        ];
        
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: { requests }
        });
    } catch (err) {
        console.error("Error formatting sheet", err);
        throw err; // Re-throw to notify UI
    }
};

export const getSpreadsheet = async (spreadsheetId) => {
    try {
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
        });
        return response.result;
    } catch (err) {
        console.error("Error getting spreadsheet", err);
        throw err;
    }
};

export const appendDataToSheet = async (spreadsheetId, range, values) => {
    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: {
                values: values,
            },
        });
    } catch (err) {
        console.error("Error appending data", err);
        throw err;
    }
};

export const updateRowInSheet = async (spreadsheetId, range, values) => {
    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'RAW',
            resource: {
                values: values,
            },
        });
    } catch (err) {
        console.error("Error updating row", err);
        throw err;
    }
};

export const deleteSheet = async (spreadsheetId, sheetId) => {
    try {
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [
                    {
                        deleteSheet: {
                            sheetId: sheetId
                        }
                    }
                ]
            }
        });
    } catch (err) {
        console.error("Error deleting sheet", err);
        throw err;
    }
};

export const deleteRow = async (spreadsheetId, sheetId, rowIndex) => {
    try {
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: "ROWS",
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }
                ]
            }
        });
    } catch (err) {
        console.error("Error deleting row", err);
        throw err;
    }
};

export const clearSheet = async (spreadsheetId, sheetId) => {
    try {
        // 1. Unmerge all cells first to avoid conflicts
        // 2. Clear values and formatting using repeatCell with empty data
        const requests = [
            {
                unmergeCells: {
                    range: { sheetId: sheetId } // Unmerge everything
                }
            },
            {
                repeatCell: {
                    range: { sheetId: sheetId },
                    cell: {}, // Empty cell data
                    fields: "userEnteredValue,userEnteredFormat,userEnteredFormat(textFormat,borders,backgroundColor)" // Clear everything
                }
            }
        ];
        
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: { requests }
        });
    } catch (err) {
        console.error("Error clearing sheet", err);
        throw err;
    }
};
