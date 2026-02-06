import React, { useState, useEffect } from 'react';
import { getHouseholds, createHousehold, deleteHousehold, getMembersByHousehold } from '../utils/localDataService';
import { getHouseholdDataArray } from '../utils/excelGenerator';
import { loadGoogleScripts, handleGoogleLogin, createSpreadsheet, addSheetToSpreadsheet, writeDataToSheet, formatSheet, getSpreadsheet, clearSheet, readSheetData, deleteSheet } from '../utils/googleSheetsService';
import ConfirmationModal from './ConfirmationModal';

const HouseholdList = ({ onViewDetails, lang, translations }) => {
    const t = translations[lang];
    const [households, setHouseholds] = useState([]);
    const [searchParams, setSearchParams] = useState({
        head_name: '', cccd: '', phone: '', ward: '', address: ''
    });
    const [selectedIds, setSelectedIds] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [showAddModal, setShowAddModal] = useState(false);
    const [isGoogleReady, setIsGoogleReady] = useState(false);
    const [sheetId, setSheetId] = useState(localStorage.getItem('household_g_sheet_id'));
    
    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        isDanger: false,
        onConfirm: null
    });

    const [newHousehold, setNewHousehold] = useState({
        head_name: '', cccd: '', phone: '', address: '', ward: '', residence_type: '',
        house_type: '', representative: '', gender: '', birthdate: '', ethnicity: '',
        job: '', residence_time: '', permanent_address: '', current_address: '',
        residence_status: ''
    });

    const fetchHouseholds = async () => {
        try {
            let data = getHouseholds();
            if (searchParams.head_name) data = data.filter(h => h.head_name.toLowerCase().includes(searchParams.head_name.toLowerCase()));
            if (searchParams.cccd) data = data.filter(h => h.cccd && h.cccd.includes(searchParams.cccd));
            if (searchParams.phone) data = data.filter(h => h.phone && h.phone.includes(searchParams.phone));
            if (searchParams.ward) data = data.filter(h => h.ward === searchParams.ward); // Exact match for dropdown
            if (searchParams.address) data = data.filter(h => h.address && h.address.toLowerCase().includes(searchParams.address.toLowerCase()));
            setHouseholds(data);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchHouseholds();
    }, [searchParams]);

    useEffect(() => {
        loadGoogleScripts(() => setIsGoogleReady(true));
    }, []);

    const handleSearchChange = (field, value) => {
        setSearchParams(prev => ({ ...prev, [field]: value }));
    };

    const handleClear = () => {
        setSearchParams({ head_name: '', cccd: '', phone: '', ward: '', address: '' });
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(displayedHouseholds.map(h => h.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;
        
        setConfirmModal({
            isOpen: true,
            title: t.confirm_delete_title || "Xác nhận xóa",
            message: `${t.confirm_delete_household} (${selectedIds.length})`,
            isDanger: true,
            onConfirm: async () => {
                try {
                    // Mock delete loop
                    for (let id of selectedIds) {
                        await deleteHousehold(id);
                    }
                    
                    // Ask for Google Sheet deletion
                    if (isGoogleReady) {
                        const spreadsheetId = localStorage.getItem('household_g_sheet_id');
                        if (spreadsheetId) {
                            try {
                                await handleGoogleLogin();
                                const spreadsheet = await getSpreadsheet(spreadsheetId);
                                const sheets = spreadsheet.sheets || [];
                                
                                for (let id of selectedIds) {
                                    const household = households.find(h => h.id === id);
                                    if (household) {
                                        let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
                                        let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                                        
                                        let targetSheet = sheets.find(s => s.properties.title === sheetName);
                                        if (!targetSheet) {
                                                targetSheet = sheets.find(s => s.properties.title === `${sheetName}_${household.id}`);
                                        }
                                        
                                        if (targetSheet) {
                                            await deleteSheet(spreadsheetId, targetSheet.properties.sheetId);
                                        }
                                    }
                                }
                            } catch (sheetErr) {
                                console.error("Error deleting from sheet", sheetErr);
                            }
                        }
                    }

                    setSelectedIds([]);
                    fetchHouseholds();
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                } catch (error) {
                    alert(t.error);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            const createdHousehold = await createHousehold(newHousehold);

            // Create Google Sheet
            if (isGoogleReady) {
                const spreadsheetId = localStorage.getItem('household_g_sheet_id');
                if (spreadsheetId) {
                     try {
                         await handleGoogleLogin();
                         const spreadsheet = await getSpreadsheet(spreadsheetId);
                         let baseName = createdHousehold.head_name ? createdHousehold.head_name.trim() : `Household_${createdHousehold.id}`;
                         let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                         
                         const existing = spreadsheet.sheets.find(s => s.properties.title === sheetName);
                         if (existing) {
                             sheetName = `${sheetName}_${createdHousehold.id}`;
                         }
                         
                         const sheetId = await addSheetToSpreadsheet(spreadsheetId, sheetName);
                         
                         // Create Virtual Head Member
                         const headMember = {
                             id: `head_${createdHousehold.id}`,
                             name: createdHousehold.head_name,
                             cccd: createdHousehold.cccd,
                             birthdate: createdHousehold.birthdate,
                             gender: createdHousehold.gender,
                             ethnicity: createdHousehold.ethnicity,
                             occupation: createdHousehold.job,
                             residence_time: createdHousehold.residence_time,
                             permanent_address: createdHousehold.permanent_address,
                             current_address: createdHousehold.address,
                             phone: createdHousehold.phone,
                             relationship: 'Chủ hộ',
                             household_id: createdHousehold.id
                         };
                         
                         const sheetData = getHouseholdDataArray(createdHousehold, [headMember]);
                         await writeDataToSheet(spreadsheetId, sheetName, sheetData);
                         await formatSheet(spreadsheetId, sheetId, sheetData.length);
                         
                     } catch (err) {
                         console.error("Error creating sheet for new household", err);
                     }
                }
            }

            setShowAddModal(false);
            setNewHousehold({
                head_name: '', cccd: '', phone: '', address: '', ward: '', residence_type: '',
                house_type: '', representative: '', gender: '', birthdate: '', ethnicity: '',
                job: '', residence_time: '', permanent_address: '', current_address: '',
                residence_status: ''
            });
            fetchHouseholds();
        } catch (error) {
            alert(t.error);
        }
    };

    const exportGoogleSheets = async () => {
        if (!isGoogleReady) {
            alert("Đang tải thư viện Google, vui lòng thử lại sau vài giây...");
            return;
        }

        if (households.length === 0) {
            alert(t.no_data);
            return;
        }

        // Determine which households to export
        const householdsToExport = selectedIds.length > 0 
            ? households.filter(h => selectedIds.includes(h.id))
            : households;

        if (householdsToExport.length === 0) {
            alert(t.no_data);
            return;
        }

        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xuất Google Sheets",
            message: "Bạn sẽ được chuyển hướng đăng nhập Google. Dữ liệu sẽ được cập nhật vào bảng tính gần nhất (nếu có). Tiếp tục?",
            isDanger: false,
            onConfirm: async () => {
                try {
                    // 1. Login
                    await handleGoogleLogin();
                    
                    // 2. Check for existing spreadsheet
                    let spreadsheetId = localStorage.getItem('household_g_sheet_id');
                    let spreadsheet;
                    let isNew = false;

                    // Force Create New if linked, with confirmation
                    if (spreadsheetId) {
                         if (confirm("Hệ thống đang liên kết với một Google Sheet. Bạn có muốn tạo một file MỚI và thay thế liên kết hiện tại không?\n(Chọn Cancel để hủy thao tác)")) {
                             spreadsheetId = null;
                         } else {
                             setConfirmModal(prev => ({ ...prev, isOpen: false }));
                             return;
                         }
                    }

                    if (!spreadsheetId) {
                        const title = `Danh_sach_ho_khau_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}`;
                        const sheetData = await createSpreadsheet(title);
                        spreadsheetId = sheetData.spreadsheetId;
                        spreadsheet = sheetData;
                        isNew = true;
                        localStorage.setItem('household_g_sheet_id', spreadsheetId);
                    }

                    // Map existing sheets by title
                    const existingSheets = (spreadsheet.sheets || []).reduce((acc, sheet) => {
                        acc[sheet.properties.title] = sheet.properties.sheetId;
                        return acc;
                    }, {});

                    let processedCount = 0;
                    let firstSheetId = spreadsheet.sheets && spreadsheet.sheets.length > 0 ? spreadsheet.sheets[0].properties.sheetId : 0;
                    let isFirstOfNewSheet = isNew;

                    // 3. Loop and add/update sheets
                    for (const household of householdsToExport) {
                        // Fetch members
                        let members = getMembersByHousehold(household.id);

                        // Add Head if missing
                        const hasHead = members.some(m => m.relationship === 'Chủ hộ');
                        if (!hasHead) {
                            const headMember = {
                                id: `head_${household.id}`,
                                name: household.head_name,
                                cccd: household.cccd,
                                birthdate: household.birthdate,
                                gender: household.gender,
                                ethnicity: household.ethnicity,
                                occupation: household.job,
                                permanent_address: household.permanent_address,
                                current_address: household.address,
                                phone: household.phone,
                                relationship: 'Chủ hộ',
                                household_id: household.id,
                                isVirtualHead: true
                            };
                            members = [headMember, ...members];
                        }

                        // Prepare Data
                        const values = getHouseholdDataArray(household, members);

                        // Sheet Name
                        let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
                        let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                        if (!sheetName) sheetName = `Sheet_${household.id}`;
                        
                        let targetSheetId;

                        if (existingSheets[sheetName] !== undefined) {
                            // Update existing sheet
                            targetSheetId = existingSheets[sheetName];
                            await clearSheet(spreadsheetId, targetSheetId);
                        } else if (isFirstOfNewSheet) {
                            // Rename default Sheet1
                            targetSheetId = firstSheetId;
                            await window.gapi.client.sheets.spreadsheets.batchUpdate({
                                spreadsheetId,
                                resource: {
                                    requests: [{
                                        updateSheetProperties: {
                                            properties: { sheetId: targetSheetId, title: sheetName },
                                            fields: 'title'
                                        }
                                    }]
                                }
                            });
                            existingSheets[sheetName] = targetSheetId; // Update map
                            isFirstOfNewSheet = false;
                        } else {
                            // Add new sheet
                            try {
                                const addRes = await addSheetToSpreadsheet(spreadsheetId, sheetName);
                                targetSheetId = addRes.replies[0].addSheet.properties.sheetId;
                                existingSheets[sheetName] = targetSheetId;
                            } catch (e) {
                                console.error(e);
                                // Fallback for duplicate names (collision with another household or renamed sheet)
                                const altName = `${sheetName}_${household.id}`;
                                if (existingSheets[altName] !== undefined) {
                                     targetSheetId = existingSheets[altName];
                                     await clearSheet(spreadsheetId, targetSheetId);
                                     sheetName = altName;
                                } else {
                                    const addRes = await addSheetToSpreadsheet(spreadsheetId, altName);
                                    targetSheetId = addRes.replies[0].addSheet.properties.sheetId;
                                    sheetName = altName;
                                }
                            }
                        }

                        // Write and Format
                        await writeDataToSheet(spreadsheetId, `${sheetName}!A1`, values);
                        await formatSheet(spreadsheetId, targetSheetId, values.length);
                        processedCount++;
                    }

                    alert(`Đã xuất thành công ${processedCount} hộ vào Google Sheet.`);
                    window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, '_blank');
                    setSheetId(spreadsheetId);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));

                } catch (error) {
                    console.error("Google Sheet Export Error:", error);
                    let msg = "Có lỗi xảy ra!";
                    if (error.message === "Google Scripts not loaded") msg = "Thư viện chưa tải xong.";
                    if (error.result && error.result.error && error.result.error.code === 403) msg = "Bạn không có quyền truy cập bảng tính này.";
                    if (error.error === "access_denied") msg = "Bạn đã từ chối cấp quyền.";
                    if (JSON.stringify(error).includes("API key not valid")) {
                        msg = "Chưa cấu hình API Key trong mã nguồn.";
                    }
                    alert(msg);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };

    // Pagination Logic (Client-side for now as API returns all)
    const displayedHouseholds = households.slice((page - 1) * limit, page * limit);

    return (
        <div className="section active">
            <div className="search-section">
                <div className="search-grid">
                    <div className="form-group">
                        <label>{t.head_name}</label>
                        <input
                            type="text"
                            value={searchParams.head_name}
                            onChange={(e) => handleSearchChange('head_name', e.target.value)}
                            placeholder={`Nhập ${t.head_name}`}
                        />
                    </div>
                    <div className="form-group">
                        <label>{t.cccd}</label>
                        <input
                            type="text"
                            value={searchParams.cccd}
                            onChange={(e) => handleSearchChange('cccd', e.target.value)}
                            placeholder={`Nhập ${t.cccd}`}
                        />
                    </div>
                    <div className="form-group">
                        <label>{t.phone}</label>
                        <input
                            type="text"
                            value={searchParams.phone}
                            onChange={(e) => handleSearchChange('phone', e.target.value)}
                            placeholder={`Nhập ${t.phone}`}
                        />
                    </div>
                    <div className="form-group">
                        <label>{t.ward}</label>
                        <select
                            value={searchParams.ward}
                            onChange={(e) => handleSearchChange('ward', e.target.value)}
                        >
                            <option value="">{t.select_ward}</option>
                            <option value="Ấp 1">Ấp 1</option>
                            <option value="Ấp 2">Ấp 2</option>
                            <option value="Ấp 3">Ấp 3</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>{t.address}</label>
                        <input
                            type="text"
                            value={searchParams.address}
                            onChange={(e) => handleSearchChange('address', e.target.value)}
                            placeholder={`Nhập ${t.address}`}
                        />
                    </div>
                </div>
                <div className="button-group-right">
                    <button type="button" className="btn btn-clear" onClick={handleClear}>{t.clear}</button>
                    <button type="button" className="btn btn-search" onClick={fetchHouseholds}>{t.search}</button>
                </div>
            </div>

            <div className="table-container">
                <div className="table-toolbar">
                    {sheetId && (
                        <button className="btn btn-excel" onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, '_blank')} style={{backgroundColor: '#0F9D58', marginRight: '10px'}}>
                            {t.open_sheet || "Mở Google Sheet"}
                        </button>
                    )}
                    <button className="btn btn-excel" onClick={exportGoogleSheets} style={{backgroundColor: '#1a73e8', marginRight: '10px'}}>
                        {t.export_new || "Xuất file mới"}
                    </button>
                    <button className="btn btn-add" onClick={() => setShowAddModal(true)}>{t.add_household}</button>
                    <button className="btn btn-delete-multi" onClick={handleDeleteSelected}>{t.delete}</button>
                </div>
                <div className="table-scroll-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{width: '40px'}}><input type="checkbox" onChange={handleSelectAll} checked={selectedIds.length === displayedHouseholds.length && displayedHouseholds.length > 0} /></th>
                                <th>{t.head_name}</th>
                                <th>{t.cccd}</th>
                                <th>{t.phone}</th>
                                <th>{t.ward}</th>
                                <th>{t.address}</th>
                                <th>Đồng bộ lúc</th>
                                <th>{t.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedHouseholds.map((h) => (
                                <tr key={h.id}>
                                    <td><input type="checkbox" checked={selectedIds.includes(h.id)} onChange={() => handleSelectOne(h.id)} /></td>
                                    <td>{h.head_name}</td>
                                    <td>{h.cccd}</td>
                                    <td>{h.phone}</td>
                                    <td>{h.ward}</td>
                                    <td>{h.address}</td>
                                    <td>{new Date().toLocaleDateString('vi-VN')}</td>
                                    <td>
                                        <span className="action-link" onClick={() => onViewDetails(h.id)}>{t.view_details}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="pagination-container">
                    <div className="pagination-info">
                        Kết quả: {households.length}
                    </div>
                    <div className="pagination-controls">
                        <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                        <button className="page-btn active">{page}</button>
                    </div>
                </div>
            </div>

            {/* Add Household Modal */}
            <div className={`modal ${showAddModal ? 'open' : ''}`}>
                <div className="modal-content custom-modal">
                    <div className="modal-header">
                        <h2>{t.add_household_title}</h2>
                        <span className="close" onClick={() => setShowAddModal(false)}>&times;</span>
                    </div>
                    <form onSubmit={handleAddSubmit} className="modal-body-scroll">
                        {/* Section 1 */}
                        <div className="form-group-custom">
                            <label className="custom-label">{t.residence_type}</label>
                            <select value={newHousehold.residence_type} onChange={e => setNewHousehold({...newHousehold, residence_type: e.target.value})}>
                                <option value="">{t.select_residence_type}</option>
                                <option value="1">{t.permanent}</option>
                                <option value="2">{t.temporary}</option>
                            </select>
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.house_type}</label>
                            <input value={newHousehold.house_type} onChange={e => setNewHousehold({...newHousehold, house_type: e.target.value})} placeholder={t.house_type} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.ward}</label>
                            <select value={newHousehold.ward} onChange={e => setNewHousehold({...newHousehold, ward: e.target.value})}>
                                <option value="">{t.select_ward}</option>
                                <option value="Ấp 1">Ấp 1</option>
                                <option value="Ấp 2">Ấp 2</option>
                                <option value="Ấp 3">Ấp 3</option>
                            </select>
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.representative}</label>
                            <input value={newHousehold.representative} onChange={e => setNewHousehold({...newHousehold, representative: e.target.value})} placeholder={t.representative} />
                        </div>

                        {/* Section 2 Header */}
                        <h3 className="section-header">{t.head_info_section}</h3>

                        {/* Section 2 Fields */}
                        <div className="form-group-custom">
                            <label className="custom-label">{t.fullname}</label>
                            <input required value={newHousehold.head_name} onChange={e => setNewHousehold({...newHousehold, head_name: e.target.value})} placeholder={t.fullname} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.head_relation}</label>
                            <input value={t.chuho} disabled className="disabled-input" />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.gender}</label>
                            <select value={newHousehold.gender} onChange={e => setNewHousehold({...newHousehold, gender: e.target.value})}>
                                <option value="">{t.gender}</option>
                                <option value="Nam">{t.male}</option>
                                <option value="Nữ">{t.female}</option>
                            </select>
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.birthdate}</label>
                            <input type="date" value={newHousehold.birthdate} onChange={e => setNewHousehold({...newHousehold, birthdate: e.target.value})} placeholder={t.birthdate} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.cccd}</label>
                            <input value={newHousehold.cccd} onChange={e => setNewHousehold({...newHousehold, cccd: e.target.value})} placeholder={t.cccd} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.ethnicity}</label>
                            <select value={newHousehold.ethnicity} onChange={e => setNewHousehold({...newHousehold, ethnicity: e.target.value})}>
                                <option value="">{t.ethnicity}</option>
                                <option value="Kinh">Kinh</option>
                                <option value="Khác">Khác</option>
                            </select>
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.occupation}</label>
                            <input value={newHousehold.job} onChange={e => setNewHousehold({...newHousehold, job: e.target.value})} placeholder={t.occupation} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.residence_time}</label>
                            <input value={newHousehold.residence_time} onChange={e => setNewHousehold({...newHousehold, residence_time: e.target.value})} placeholder={t.residence_time} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.permanent_address}</label>
                            <input value={newHousehold.permanent_address} onChange={e => setNewHousehold({...newHousehold, permanent_address: e.target.value})} placeholder={t.permanent_address} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.current_address}</label>
                            <input value={newHousehold.address} onChange={e => setNewHousehold({...newHousehold, address: e.target.value})} placeholder={t.current_address} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.phone}</label>
                            <input value={newHousehold.phone} onChange={e => setNewHousehold({...newHousehold, phone: e.target.value})} placeholder={t.phone} />
                        </div>
                        <div className="form-group-custom">
                            <label className="custom-label">{t.residence_status}</label>
                            <select value={newHousehold.residence_status} onChange={e => setNewHousehold({...newHousehold, residence_status: e.target.value})}>
                                <option value="">{t.residence_status}</option>
                                <option value="Thường trú">Thường trú</option>
                                <option value="Tạm trú">Tạm trú</option>
                            </select>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-cancel-custom" onClick={() => setShowAddModal(false)}>{t.cancel}</button>
                            <button type="submit" className="btn btn-add-custom">{t.add}</button>
                        </div>
                    </form>
                </div>
            </div>

            <ConfirmationModal 
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                isDanger={confirmModal.isDanger}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                confirmText={t.confirm}
                cancelText={t.cancel}
            />
        </div>
    );
};

export default HouseholdList;
