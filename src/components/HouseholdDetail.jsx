import React, { useState, useEffect } from 'react';
import { getHouseholdById, getMembersByHousehold, updateHousehold, updateMember, createMember, deleteMember } from '../utils/localDataService';
import { getHouseholdDataArray, formatMemberRow } from '../utils/excelGenerator';
import { loadGoogleScripts, handleGoogleLogin, createSpreadsheet, addSheetToSpreadsheet, writeDataToSheet, formatSheet, getSpreadsheet, clearSheet, readSheetData, deleteRow, appendDataToSheet, updateRowInSheet } from '../utils/googleSheetsService';
import ConfirmationModal from './ConfirmationModal';

const HouseholdDetail = ({ householdId, onBack, lang, translations }) => {
    const [household, setHousehold] = useState(null);
    const [members, setMembers] = useState([]);
    const [showMemberModal, setShowMemberModal] = useState(false);
    const [editingMember, setEditingMember] = useState(null);
    const [memberForm, setMemberForm] = useState({
        name: '', relationship: '', gender: 'nam', birthdate: '',
        cccd: '', occupation: '', ethnicity: '', permanent_address: '', current_address: '', phone: '', residence_time: '', residence_status: '', ward: '', house_type: ''
    });
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

    const t = translations[lang];

    const fetchData = async () => {
        try {
            const h = getHouseholdById(householdId);
            setHousehold(h);

            let memberList = getMembersByHousehold(householdId);

            // Check if head is in members, if not add from household data
            const hasHead = memberList.some(m => m.relationship === 'Chủ hộ');
            if (!hasHead && h) {
                const headMember = {
                    id: `head_${h.id}`, // Virtual ID
                    name: h.head_name,
                    cccd: h.cccd,
                    birthdate: h.birthdate,
                    gender: h.gender,
                    ethnicity: h.ethnicity,
                    occupation: h.job,
                    residence_time: h.residence_time,
                    residence_status: h.residence_type,
                    ward: h.ward,
                    house_type: h.house_type,
                    permanent_address: h.permanent_address,
                    current_address: h.address,
                    phone: h.phone,
                    relationship: 'Chủ hộ',
                    household_id: h.id,
                    isVirtualHead: true
                };
                memberList = [headMember, ...memberList];
            }
            
            setMembers(memberList);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchData();
    }, [householdId]);

    useEffect(() => {
        loadGoogleScripts(() => setIsGoogleReady(true));
    }, []);

    const handleMemberSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingMember) {
                if (editingMember.isVirtualHead) {
                    // Update Household info if editing the virtual head
                    const householdUpdate = {
                        head_name: memberForm.name,
                        cccd: memberForm.cccd,
                        birthdate: memberForm.birthdate,
                        gender: memberForm.gender,
                        phone: memberForm.phone,
                        job: memberForm.occupation,
                        residence_time: memberForm.residence_time,
                        residence_type: memberForm.residence_status,
                        ward: memberForm.ward,
                        house_type: memberForm.house_type,
                        ethnicity: memberForm.ethnicity,
                        permanent_address: memberForm.permanent_address,
                        address: memberForm.current_address
                    };
                    await updateHousehold(householdId, householdUpdate);

                    // Sync Household Update to Sheet
                    if (isGoogleReady) {
                        const spreadsheetId = localStorage.getItem('household_g_sheet_id');
                        if (spreadsheetId) {
                             try {
                                 await handleGoogleLogin();
                                 const spreadsheet = await getSpreadsheet(spreadsheetId);
                                 let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
                                 let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                                 let targetSheet = spreadsheet.sheets.find(s => s.properties.title === sheetName);
                                 if (!targetSheet) targetSheet = spreadsheet.sheets.find(s => s.properties.title === `${sheetName}_${household.id}`);

                                 if (targetSheet) {
                                     const updatedHousehold = { ...household, ...householdUpdate };
                                     const updatedMembers = members.map(m => m.id === editingMember.id ? { ...m, ...memberForm } : m);
                                     const sheetData = getHouseholdDataArray(updatedHousehold, updatedMembers);
                                     await clearSheet(spreadsheetId, targetSheet.properties.sheetId);
                                     await writeDataToSheet(spreadsheetId, targetSheet.properties.title, sheetData);
                                     await formatSheet(spreadsheetId, targetSheet.properties.sheetId, sheetData.length);
                                 }
                             } catch (err) { console.error("Sheet sync error", err); }
                        }
                    }
                } else {
                    await updateMember(editingMember.id, { ...memberForm, household_id: householdId });

                    // Sync Member Update to Sheet
                    if (isGoogleReady) {
                        const spreadsheetId = localStorage.getItem('household_g_sheet_id');
                        if (spreadsheetId) {
                             try {
                                 await handleGoogleLogin();
                                 const spreadsheet = await getSpreadsheet(spreadsheetId);
                                 let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
                                 let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                                 let targetSheet = spreadsheet.sheets.find(s => s.properties.title === sheetName);
                                 if (!targetSheet) targetSheet = spreadsheet.sheets.find(s => s.properties.title === `${sheetName}_${household.id}`);

                                 if (targetSheet) {
                                     const rows = await readSheetData(spreadsheetId, `${targetSheet.properties.title}!A1:M200`);
                                     if (rows && rows.length > 0) {
                                         const rowIndex = rows.findIndex(r => r[12] == editingMember.id);
                                         if (rowIndex !== -1) {
                                             const updatedMember = { ...memberForm, id: editingMember.id };
                                             const currentSTT = rows[rowIndex][0];
                                             const rowData = formatMemberRow(updatedMember, currentSTT - 1);
                                             await updateRowInSheet(spreadsheetId, `${targetSheet.properties.title}!A${rowIndex + 1}:M${rowIndex + 1}`, [rowData]);
                                         }
                                     }
                                 }
                             } catch (err) { console.error("Sheet sync error", err); }
                        }
                    }
                }
            } else {
                const newMember = await createMember({ ...memberForm, household_id: householdId });

                // Sync New Member to Sheet
                if (isGoogleReady) {
                    const spreadsheetId = localStorage.getItem('household_g_sheet_id');
                    if (spreadsheetId) {
                         try {
                             await handleGoogleLogin();
                             const spreadsheet = await getSpreadsheet(spreadsheetId);
                             let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
                             let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                             let targetSheet = spreadsheet.sheets.find(s => s.properties.title === sheetName);
                             if (!targetSheet) targetSheet = spreadsheet.sheets.find(s => s.properties.title === `${sheetName}_${household.id}`);

                             if (targetSheet) {
                                 const newMemberRow = { ...memberForm, id: newMember.id, household_id: householdId };
                                 const updatedMembers = [...members, newMemberRow];
                                 const sheetData = getHouseholdDataArray(household, updatedMembers);
                                 await clearSheet(spreadsheetId, targetSheet.properties.sheetId);
                                 await writeDataToSheet(spreadsheetId, targetSheet.properties.title, sheetData);
                                 await formatSheet(spreadsheetId, targetSheet.properties.sheetId, sheetData.length);
                             }
                         } catch (err) { console.error("Sheet sync error", err); }
                    }
                }
            }
            setShowMemberModal(false);
            setEditingMember(null);
            setMemberForm({
                name: '', relationship: '', gender: 'nam', birthdate: '',
                cccd: '', occupation: '', ethnicity: '', permanent_address: '', current_address: '', phone: '', residence_time: '', residence_status: '', ward: '', house_type: ''
            });
            fetchData();
            alert(editingMember ? t.update_success : t.add_success);
        } catch (error) {
            alert(t.error);
        }
    };

    const handleDeleteMember = async (id) => {
        setConfirmModal({
            isOpen: true,
            title: t.confirm_delete_title || "Xác nhận xóa thành viên",
            message: t.confirm_delete_member || "Thành viên sẽ bị xóa khỏi hộ cư trú",
            isDanger: true,
            onConfirm: async () => {
                try {
                    await deleteMember(id);
                    
                    // Ask for Google Sheet deletion
                    if (isGoogleReady) {
                        const spreadsheetId = localStorage.getItem('household_g_sheet_id');
                        if (spreadsheetId) {
                             try {
                                 await handleGoogleLogin();
                                 const spreadsheet = await getSpreadsheet(spreadsheetId);
                                 
                                 // Find Sheet Name
                                 let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
                                 let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                                 
                                 let targetSheet = spreadsheet.sheets.find(s => s.properties.title === sheetName);
                                 if (!targetSheet) {
                                     targetSheet = spreadsheet.sheets.find(s => s.properties.title === `${sheetName}_${household.id}`);
                                 }
                                 
                                 if (targetSheet) {
                                     // Find row by ID
                                     const rows = await readSheetData(spreadsheetId, `${targetSheet.properties.title}!A1:M200`);
                                     if (rows && rows.length > 0) {
                                         const rowIndex = rows.findIndex(r => r[12] == id); 
                                         if (rowIndex !== -1) {
                                             await deleteRow(spreadsheetId, targetSheet.properties.sheetId, rowIndex);
                                         } else {
                                             const member = members.find(m => m.id === id);
                                             if (member) {
                                                 const fuzzyIndex = rows.findIndex(r => r[1] === member.name && r[2] === member.relationship);
                                                 if (fuzzyIndex !== -1) {
                                                     await deleteRow(spreadsheetId, targetSheet.properties.sheetId, fuzzyIndex);
                                                 }
                                             }
                                         }
                                     }
                                 }
                             } catch (e) {
                                 console.error("Sheet delete row error", e);
                             }
                        }
                    }

                    fetchData();
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                } catch (error) {
                    alert(t.error);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };

    const openEditMember = (member) => {
        setEditingMember(member);
        setMemberForm(member);
        setShowMemberModal(true);
    };

    const updateSheetFormat = async () => {
        if (!isGoogleReady) {
            alert("Đang tải thư viện Google, vui lòng đợi...");
            return;
        }
        if (!sheetId) return;

        if (!confirm(t.confirm_update_format || "Bạn có chắc chắn muốn cập nhật lại định dạng cho Google Sheet này không?")) return;

        try {
            await handleGoogleLogin();
            const spreadsheet = await getSpreadsheet(sheetId);
            
            // Find Sheet
            let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
            let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
            let targetSheet = spreadsheet.sheets.find(s => s.properties.title === sheetName);
            if (!targetSheet) targetSheet = spreadsheet.sheets.find(s => s.properties.title === `${sheetName}_${household.id}`);
            
            if (targetSheet) {
                const sheetData = getHouseholdDataArray(household, members);
                await clearSheet(sheetId, targetSheet.properties.sheetId);
                await writeDataToSheet(sheetId, targetSheet.properties.title, sheetData);
                await formatSheet(sheetId, targetSheet.properties.sheetId, sheetData.length);
                alert("Đã cập nhật định dạng thành công!");
            } else {
                alert("Không tìm thấy Sheet tương ứng trong file gốc.");
            }
        } catch (err) {
            console.error("Update format error", err);
            alert("Lỗi cập nhật định dạng: " + err.message);
        }
    };

    const exportGoogleSheets = async () => {
        if (!isGoogleReady) {
            alert("Đang tải thư viện Google, vui lòng thử lại sau vài giây...");
            return;
        }

        if (!household || members.length === 0) {
            alert(t.no_data);
            return;
        }

        setConfirmModal({
            isOpen: true,
            title: "Xuất Google Sheets",
            message: "Dữ liệu sẽ được cập nhật vào bảng tính Google Sheets gần nhất (nếu có). Tiếp tục?",
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

                    const existingSheets = (spreadsheet.sheets || []).reduce((acc, sheet) => {
                        acc[sheet.properties.title] = sheet.properties.sheetId;
                        return acc;
                    }, {});

                    // 3. Get data
                    const values = getHouseholdDataArray(household, members);

                    // Sheet Name
                    let baseName = household.head_name ? household.head_name.trim() : `Household_${household.id}`;
                    let sheetName = baseName.replace(/[\\/?*[\]:]/g, "").substring(0, 30);
                    if (!sheetName) sheetName = `Sheet_${household.id}`;

                    let targetSheetId;
                    let firstSheetId = spreadsheet.sheets && spreadsheet.sheets.length > 0 ? spreadsheet.sheets[0].properties.sheetId : 0;

                    if (existingSheets[sheetName] !== undefined) {
                        targetSheetId = existingSheets[sheetName];
                        await clearSheet(spreadsheetId, targetSheetId);
                    } else if (isNew) {
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
                    } else {
                         // Add new sheet
                        try {
                            const addRes = await addSheetToSpreadsheet(spreadsheetId, sheetName);
                            targetSheetId = addRes.replies[0].addSheet.properties.sheetId;
                        } catch (e) {
                            // Fallback
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

                    // 4. Write data
                    await writeDataToSheet(spreadsheetId, `${sheetName}!A1`, values);
                    await formatSheet(spreadsheetId, targetSheetId, values.length);

                    alert(`Đã xuất thành công vào Google Sheet.`);
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

    if (!household) return <div>Loading...</div>;

    return (
        <div className="section active">
            {/* New Red Header Bar */}
            <div className="detail-header-bar">
                <h2 className="header-title">HỘ: {household.head_name}</h2>
                <div className="header-actions">
                    <button className="btn-header-gray" onClick={onBack}>
                        {t.back || "Quay lại"}
                    </button>
                    <button className="btn-header-gray" onClick={onBack}>
                        {t.back_list || "Danh sách"}
                    </button>
                    {sheetId && (
                        <button className="btn-header-green" onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${sheetId}`, '_blank')} style={{backgroundColor: '#0F9D58', marginRight: '5px'}}>
                            {t.open_sheet || "Mở Google Sheet"}
                        </button>
                    )}
                    {sheetId && (
                        <button className="btn-header-green" onClick={updateSheetFormat} style={{backgroundColor: '#fbbc04', color: '#000', marginRight: '5px'}}>
                            {t.update_format || "Cập nhật định dạng"}
                        </button>
                    )}
                    <button className="btn-header-green" onClick={exportGoogleSheets} style={{backgroundColor: '#1a73e8'}}>
                        {t.export_new || "Xuất file mới"}
                    </button>
                    <button className="btn-header-blue" onClick={() => { setEditingMember(null); setMemberForm({name: '', relationship: '', gender: 'nam', birthdate: '', cccd: '', occupation: '', ethnicity: '', permanent_address: '', current_address: '', phone: ''}); setShowMemberModal(true); }}>
                        {t.add_member || "Thêm thành viên"}
                    </button>
                </div>
            </div>

            {/* Table Container (The white card) */}
            <div className="detail-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>{t.no || "STT"}</th>
                            <th>{t.name || "Thành viên"}</th>
                            <th>{t.cccd || "CCCD"}</th>
                            <th>{t.role || "Vai trò"}</th>
                            <th>{t.relationship_head || "Quan hệ với chủ hộ"}</th>
                            <th style={{textAlign: 'center'}}>{t.actions || "Hành động"}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((m, index) => (
                            <tr key={m.id}>
                                <td>{index + 1}</td>
                                <td>{m.name}</td>
                                <td>{m.cccd}</td>
                                <td>{m.relationship === 'Chủ hộ' ? 'Chủ hộ' : 'Thành viên'}</td>
                                <td>{m.relationship}</td>
                                <td style={{textAlign: 'center'}}>
                                    <div style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-start', width: '110px'}}>
                                        <input type="checkbox" className="action-checkbox" style={{margin: '0 8px 0 0'}} />
                                        <span className="action-text-btn edit" onClick={() => openEditMember(m)}>
                                            {t.edit || "Sửa"}
                                        </span>
                                        {m.relationship !== 'Chủ hộ' && (
                                            <span className="action-text-btn delete" onClick={() => handleDeleteMember(m.id)} style={{marginLeft: '8px'}}>
                                                {t.delete_short || "Xóa"}
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {members.length === 0 && (
                            <tr>
                                <td colSpan="6" style={{textAlign: 'center', padding: '20px'}}>
                                    {t.no_data || "Không có dữ liệu"}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Member Modal */}
            <div className={`modal ${showMemberModal ? 'open' : ''}`}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h2>{editingMember ? t.edit_member || "Sửa thông tin thành viên" : t.add_member || "Thêm thành viên"}</h2>
                        <span className="close" onClick={() => setShowMemberModal(false)}>&times;</span>
                    </div>
                    <form onSubmit={handleMemberSubmit}>
                        <div className="modal-body">
                            <div className="modal-form-grid">
                                <h3 className="section-subtitle full-width">{t.member_info || "Thông tin thành viên"}</h3>
                                
                                <div className="floating-group">
                                    <input required value={memberForm.name} onChange={e => setMemberForm({...memberForm, name: e.target.value})} placeholder=" " />
                                    <label>{t.name || "Họ và tên"}</label>
                                </div>

                                <div className="floating-group">
                                    <select required value={memberForm.relationship} onChange={e => setMemberForm({...memberForm, relationship: e.target.value})}>
                                        <option value=""></option>
                                        {(editingMember && editingMember.relationship === 'Chủ hộ') && (
                                            <option value="Chủ hộ">{t.chuho || "Chủ hộ"}</option>
                                        )}
                                        <option value="Vợ">{t.vo || "Vợ"}</option>
                                        <option value="Chồng">{t.chong || "Chồng"}</option>
                                        <option value="Con">{t.con || "Con"}</option>
                                        <option value="Khác">{t.khac || "Khác"}</option>
                                    </select>
                                    <label>{t.relationship || "Quan hệ chủ hộ"}</label>
                                </div>

                                <div className="floating-group">
                                    <select value={memberForm.gender} onChange={e => setMemberForm({...memberForm, gender: e.target.value})}>
                                        <option value="nam">{t.male || "Nam"}</option>
                                        <option value="nu">{t.female || "Nữ"}</option>
                                    </select>
                                    <label>{t.gender || "Giới tính"}</label>
                                </div>

                                <div className="floating-group">
                                    <input type="date" value={memberForm.birthdate} onChange={e => setMemberForm({...memberForm, birthdate: e.target.value})} placeholder=" " />
                                    <label>{t.birthdate || "Ngày sinh"}</label>
                                </div>

                                <div className="floating-group">
                                    <input value={memberForm.cccd} onChange={e => setMemberForm({...memberForm, cccd: e.target.value})} placeholder=" " />
                                    <label>{t.cccd || "CCCD"}</label>
                                </div>

                                <div className="floating-group">
                                    <select value={memberForm.ethnicity || ''} onChange={e => setMemberForm({...memberForm, ethnicity: e.target.value})}>
                                        <option value=""></option>
                                        <option value="Kinh">Kinh</option>
                                        <option value="Tày">Tày</option>
                                        <option value="Thái">Thái</option>
                                        <option value="Hoa">Hoa</option>
                                        <option value="Khmer">Khmer</option>
                                        <option value="Mường">Mường</option>
                                        <option value="Nùng">Nùng</option>
                                        <option value="Khác">Khác</option>
                                    </select>
                                    <label>{t.ethnicity || "Dân tộc"}</label>
                                </div>

                                <div className="floating-group">
                                    <input value={memberForm.occupation || ''} onChange={e => setMemberForm({...memberForm, occupation: e.target.value})} placeholder=" " />
                                    <label>{t.occupation || "Nghề nghiệp"}</label>
                                </div>

                                <div className="floating-group full-width">
                                    <input value={memberForm.residence_time || ''} onChange={e => setMemberForm({...memberForm, residence_time: e.target.value})} placeholder=" " />
                                    <label>{t.residence_time || "Thời gian cư trú"}</label>
                                </div>

                                <div className="floating-group full-width">
                                    <input value={memberForm.permanent_address || ''} onChange={e => setMemberForm({...memberForm, permanent_address: e.target.value})} placeholder=" " />
                                    <label>{t.permanent_address || "Hộ khẩu thường trú"}</label>
                                </div>

                                <div className="floating-group full-width">
                                    <input value={memberForm.current_address || ''} onChange={e => setMemberForm({...memberForm, current_address: e.target.value})} placeholder=" " />
                                    <label>{t.current_address || "Nơi ở hiện tại"}</label>
                                </div>

                                <div className="floating-group">
                                    <input value={memberForm.phone || ''} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} placeholder=" " />
                                    <label>{t.phone || "Số điện thoại"}</label>
                                </div>

                                <div className="floating-group">
                                    <select value={memberForm.residence_status || ''} onChange={e => setMemberForm({...memberForm, residence_status: e.target.value})}>
                                        <option value=""></option>
                                        <option value="Thường trú">Thường trú</option>
                                        <option value="Tạm trú">Tạm trú</option>
                                        <option value="Tạm vắng">Tạm vắng</option>
                                    </select>
                                    <label>{t.residence_status || "Trạng thái cư trú"}</label>
                                </div>

                                {(editingMember && editingMember.relationship === 'Chủ hộ') && (
                                    <>
                                        <div className="floating-group">
                                            <input value={memberForm.ward || ''} onChange={e => setMemberForm({...memberForm, ward: e.target.value})} placeholder=" " />
                                            <label>{t.ward || "Ấp"}</label>
                                        </div>
                                        <div className="floating-group">
                                            <input value={memberForm.house_type || ''} onChange={e => setMemberForm({...memberForm, house_type: e.target.value})} placeholder=" " />
                                            <label>{t.house_type || "Dạng nhà"}</label>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn-modal-cancel" onClick={() => setShowMemberModal(false)}>
                                {t.cancel || "Hủy"}
                            </button>
                            <button type="submit" className="btn-modal-submit">
                                {editingMember ? (t.update || "Cập nhật") : (t.add || "Thêm")}
                            </button>
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
                confirmText={t.confirm || "Xác nhận"}
                cancelText={t.cancel || "Hủy"}
            />
        </div>
    );
};

export default HouseholdDetail;
