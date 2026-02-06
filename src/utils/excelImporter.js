import * as XLSX from 'xlsx';

export const readExcelFile = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Get as array of arrays
                
                // Parse data
                // Assume row 0 is header
                if (jsonData.length < 2) {
                    resolve([]);
                    return;
                }

                const headers = jsonData[0].map(h => String(h).trim().toLowerCase());
                const households = [];

                // Map headers to keys with collision detection
                const head_name_idx = headers.findIndex(h => h.includes('tên') || h.includes('name') || h.includes('chủ hộ'));
                
                let cccd_idx = headers.findIndex(h => h.includes('cccd') || h.includes('cmnd'));
                // Prevent Name and CCCD mapping to same column if possible
                if (cccd_idx === head_name_idx && cccd_idx !== -1) {
                    const allMatches = headers.map((h, i) => (h.includes('cccd') || h.includes('cmnd')) ? i : -1).filter(i => i !== -1);
                    const alt = allMatches.find(i => i !== head_name_idx);
                    cccd_idx = alt !== undefined ? alt : -1;
                }

                const map = {
                    head_name: head_name_idx,
                    cccd: cccd_idx,
                    birthdate: headers.findIndex(h => h.includes('sinh') || h.includes('birth')),
                    gender: headers.findIndex(h => h.includes('giới') || h.includes('gender') || h.includes('nam/nữ')),
                    phone: headers.findIndex(h => h.includes('sđt') || h.includes('phone') || h.includes('điện thoại')),
                    address: headers.findIndex(h => h.includes('địa chỉ') || h.includes('address') || h.includes('nơi ở')),
                    ward: headers.findIndex(h => h.includes('ấp') || h.includes('ward')),
                    house_type: headers.findIndex(h => h.includes('dạng nhà') || h.includes('loại nhà')),
                    residence_type: headers.findIndex(h => h.includes('loại cư trú') || h.includes('trạng thái')),
                    ethnicity: headers.findIndex(h => h.includes('dân tộc')),
                    job: headers.findIndex(h => h.includes('nghề')),
                };

                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row || row.length === 0) continue;

                    // Basic validation: Must have name
                    if (map.head_name !== -1 && row[map.head_name]) {
                        households.push({
                            head_name: row[map.head_name],
                            cccd: map.cccd !== -1 ? row[map.cccd] : '',
                            birthdate: map.birthdate !== -1 ? row[map.birthdate] : '',
                            gender: map.gender !== -1 ? row[map.gender] : '',
                            phone: map.phone !== -1 ? row[map.phone] : '',
                            address: map.address !== -1 ? row[map.address] : '',
                            ward: map.ward !== -1 ? row[map.ward] : '',
                            house_type: map.house_type !== -1 ? row[map.house_type] : '',
                            residence_type: map.residence_type !== -1 ? row[map.residence_type] : '',
                            ethnicity: map.ethnicity !== -1 ? row[map.ethnicity] : '',
                            job: map.job !== -1 ? row[map.job] : '',
                        });
                    }
                }

                resolve(households);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};
