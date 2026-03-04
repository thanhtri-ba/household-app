import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Helper to convert Google Sheet data array to ExcelJS rows
// The data array from getHouseholdDataArray is a 2D array of strings
export const exportToExcel = async (household, members, dataArray, fileName = 'Household_Export') => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1', {
        pageSetup: { paperSize: 9, orientation: 'landscape' } // A4 Landscape
    });

    // 1. Add Data
    // dataArray includes headers and title rows already constructed in getHouseholdDataArray
    // But getHouseholdDataArray returns a raw 2D array.
    // We can just add these rows directly.
    sheet.addRows(dataArray);

    // 2. Formatting Logic (Mirroring googleSheetsService.js)
    
    // Define Styles
    const fontMain = { name: 'Times New Roman', size: 11 };
    const fontTitle = { name: 'Times New Roman', size: 14, bold: true };
    const fontBold = { name: 'Times New Roman', size: 11, bold: true };
    const borderStyle = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };
    const alignCenter = { vertical: 'middle', horizontal: 'center', wrapText: true };
    const alignLeft = { vertical: 'middle', horizontal: 'left', wrapText: true };

    const rowCount = dataArray.length;
    const safeRowCount = Math.max(rowCount, 20); // Ensure minimal size

    // A. Main Title (Row 1 - Index 1 in ExcelJS)
    const titleRow = sheet.getRow(1);
    titleRow.height = 30;
    sheet.mergeCells(1, 1, 1, 12); // Merge A1:L1
    titleRow.getCell(1).font = fontTitle;
    titleRow.getCell(1).alignment = alignCenter;

    // B. Subtitles (Rows 2-3)
    sheet.mergeCells(2, 1, 2, 12); // Merge A2:L2
    const subTitle1 = sheet.getRow(2);
    subTitle1.getCell(1).font = fontBold;
    subTitle1.getCell(1).alignment = alignLeft;

    sheet.mergeCells(3, 1, 3, 12); // Merge A3:L3
    const subTitle2 = sheet.getRow(3);
    subTitle2.getCell(1).font = fontBold;
    subTitle2.getCell(1).alignment = alignLeft;

    // C. Header Row (Row 5 - Index 5)
    // In Google Sheets logic, data starts at index 0. 
    // Title is 0, Subtitles 1,2. Empty 3. Header 4.
    // ExcelJS is 1-based. So Header is Row 5.
    const headerRow = sheet.getRow(5);
    headerRow.height = 40; // Taller for headers
    for (let col = 1; col <= 12; col++) {
        const cell = headerRow.getCell(col);
        cell.font = fontBold;
        cell.alignment = alignCenter;
        cell.border = borderStyle;
    }

    // D. Data Rows (From Row 6 to End)
    // The dataArray contains the title rows, so rowCount is the total rows.
    // Data starts at index 5 (Row 6)
    for (let r = 6; r <= rowCount - 3; r++) { // -3 for footer
        const row = sheet.getRow(r);
        row.height = 30; // Min height
        for (let col = 1; col <= 12; col++) {
            const cell = row.getCell(col);
            cell.font = fontMain;
            cell.alignment = alignCenter; // Default center for data
            cell.border = borderStyle;
            
            // Override alignment for specific columns if needed (e.g. Name left aligned?)
            // For now, keeping consistent with Google Sheets logic (everything centered/middle)
        }
    }

    // E. Footer (Last few rows)
    // Signature block is at rowCount (last row)
    // Merge last 3 columns for signature
    const footerRowIndex = rowCount; 
    // ExcelJS is 1-based, dataArray length is exactly the number of rows added.
    
    // Check if footer exists in data (it should be there from getHouseholdDataArray)
    const footerRow = sheet.getRow(footerRowIndex);
    sheet.mergeCells(footerRowIndex, 10, footerRowIndex, 12); // Merge J-L
    
    // Style the footer
    for (let col = 1; col <= 12; col++) {
        const cell = footerRow.getCell(col);
        cell.font = fontBold; // Bold for signature/date
        cell.alignment = alignCenter;
    }

    // F. Column Widths
    sheet.columns = [
        { width: 5 },  // A: STT
        { width: 20 }, // B: Ho ten
        { width: 15 }, // C: Ngay sinh
        { width: 8 },  // D: Gioi tinh
        { width: 10 }, // E: Dan toc
        { width: 15 }, // F: Nghe nghiep
        { width: 15 }, // G: Noi lam viec
        { width: 12 }, // H: CCCD
        { width: 12 }, // I: Ngay cap
        { width: 12 }, // J: Noi cap
        { width: 15 }, // K: Quan he
        { width: 15 }, // L: Ghi chu
    ];

    // Generate Buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${fileName}.xlsx`);
};

export const exportMultipleToExcel = async (householdsData, fileName = 'Households_Export') => {
    // householdsData: Array of { household, members, dataArray }
    const workbook = new ExcelJS.Workbook();
    
    for (const item of householdsData) {
        const { household, members, dataArray } = item;
        let sheetName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
        // Clean sheet name
        sheetName = sheetName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
        // Ensure unique sheet names if duplicates exist (simple counter logic handled by user or just append ID if conflict)
        // ExcelJS throws if duplicate name. Let's append ID if needed or just use ID if name is generic.
        // For simplicity, let's use name + ID to be safe.
        sheetName = `${sheetName}_${household.id}`.substring(0, 31); // Max 31 chars for Excel sheet name

        const sheet = workbook.addWorksheet(sheetName, {
            pageSetup: { paperSize: 9, orientation: 'landscape' }
        });

        // Reuse formatting logic (refactor later if too much duplication, but copy-paste is safer for now to avoid breaking single export)
        
        // 1. Add Data
        sheet.addRows(dataArray);

        // 2. Formatting
        const fontMain = { name: 'Times New Roman', size: 11 };
        const fontTitle = { name: 'Times New Roman', size: 14, bold: true };
        const fontBold = { name: 'Times New Roman', size: 11, bold: true };
        const borderStyle = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        const alignCenter = { vertical: 'middle', horizontal: 'center', wrapText: true };
        const alignLeft = { vertical: 'middle', horizontal: 'left', wrapText: true };

        const rowCount = dataArray.length;

        // A. Main Title
        const titleRow = sheet.getRow(1);
        titleRow.height = 30;
        sheet.mergeCells(1, 1, 1, 12); 
        titleRow.getCell(1).font = fontTitle;
        titleRow.getCell(1).alignment = alignCenter;

        // B. Subtitles
        sheet.mergeCells(2, 1, 2, 12);
        const subTitle1 = sheet.getRow(2);
        subTitle1.getCell(1).font = fontBold;
        subTitle1.getCell(1).alignment = alignLeft;

        sheet.mergeCells(3, 1, 3, 12);
        const subTitle2 = sheet.getRow(3);
        subTitle2.getCell(1).font = fontBold;
        subTitle2.getCell(1).alignment = alignLeft;

        // C. Header
        const headerRow = sheet.getRow(5);
        headerRow.height = 40;
        for (let col = 1; col <= 12; col++) {
            const cell = headerRow.getCell(col);
            cell.font = fontBold;
            cell.alignment = alignCenter;
            cell.border = borderStyle;
        }

        // D. Data
        for (let r = 6; r <= rowCount - 3; r++) {
            const row = sheet.getRow(r);
            row.height = 30;
            for (let col = 1; col <= 12; col++) {
                const cell = row.getCell(col);
                cell.font = fontMain;
                cell.alignment = alignCenter;
                cell.border = borderStyle;
            }
        }

        // E. Footer
        const footerRowIndex = rowCount; 
        sheet.mergeCells(footerRowIndex, 10, footerRowIndex, 12); 
        const footerRow = sheet.getRow(footerRowIndex);
        for (let col = 1; col <= 12; col++) {
            const cell = footerRow.getCell(col);
            cell.font = fontBold; 
            cell.alignment = alignCenter;
        }

        // F. Columns
        sheet.columns = [
            { width: 5 },  { width: 20 }, { width: 15 }, { width: 8 },  { width: 10 }, { width: 15 }, 
            { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 15 },
        ];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${fileName}.xlsx`);
};
