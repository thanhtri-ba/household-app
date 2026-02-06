export const formatMemberRow = (m, index) => {
    // Helper to determine gender safely (Copied logic to keep it pure or move getGender out)
    // To avoid duplication, we should move getGender out or just duplicate small logic.
    // Let's duplicate small logic for safety as getGender was inside getHouseholdDataArray scope.
    const getGender = (m) => {
        if (m.relationship) {
            const rel = m.relationship.toLowerCase().trim();
            if (['vợ', 'mẹ', 'bà', 'con gái', 'chị', 'em gái', 'cháu gái', 'cô', 'dì', 'mợ', 'thím', 'con dâu'].some(k => rel.includes(k))) return 'nu';
            if (['chồng', 'cha', 'bố', 'ông', 'con trai', 'anh', 'em trai', 'cháu trai', 'chú', 'bác', 'cậu', 'con rể'].some(k => rel.includes(k))) return 'nam';
        }
        let g = m.gender ? String(m.gender).toLowerCase().trim() : '';
        if (['nam', 'male', 'man', 'trai'].includes(g)) return 'nam';
        if (['nu', 'nữ', 'female', 'woman', 'gái'].includes(g)) return 'nu';
        return g;
    };

    const formatDate = (d) => {
        if (!d) return '';
        // Check for YYYY-MM-DD (Simple string split to avoid timezone issues)
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
            const [year, month, day] = d.split('-');
            return `${day}/${month}/${year}`;
        }
        // Attempt to parse if it's an ISO string or other format, but fallback to original if strictly needed
        // For this app, assuming YYYY-MM-DD is the primary storage format.
        return d;
    };

    const gender = getGender(m);
    const dob = formatDate(m.birthdate);

    return [
        index + 1,
        m.name,
        m.relationship,
        gender === 'nam' ? dob : '',
        gender === 'nu' ? dob : '',
        m.cccd,
        m.ethnicity,
        m.occupation,
        m.residence_time || '',
        m.permanent_address,
        m.current_address,
        m.phone,
        m.id // Hidden ID Column
    ];
};

/**
 * Generates an Excel worksheet for a household with detailed formatting
 * @param {Object} household - The household object
 * @param {Array} members - The list of members in the household
 * @returns {Object} The generated worksheet
 */
export const getHouseholdDataArray = (household, members) => {
    // Helper to determine gender safely
    const getGender = (m) => {
        // Prioritize relationship inference (fixes cases where gender data might be wrong, e.g. Vợ marked as Nam)
        if (m.relationship) {
            const rel = m.relationship.toLowerCase().trim();
            if (['vợ', 'mẹ', 'bà', 'con gái', 'chị', 'em gái', 'cháu gái', 'cô', 'dì', 'mợ', 'thím', 'con dâu'].some(k => rel.includes(k))) return 'nu';
            if (['chồng', 'cha', 'bố', 'ông', 'con trai', 'anh', 'em trai', 'cháu trai', 'chú', 'bác', 'cậu', 'con rể'].some(k => rel.includes(k))) return 'nam';
        }

        let g = m.gender ? String(m.gender).toLowerCase().trim() : '';
        // Explicit checks
        if (['nam', 'male', 'man', 'trai'].includes(g)) return 'nam';
        if (['nu', 'nữ', 'female', 'woman', 'gái'].includes(g)) return 'nu';
        
        return g; // Return original if still unknown
    };

    // Helper to format residence type
    const getResidenceType = (type) => {
        if (!type) return '...........................';
        const t = String(type).trim();
        if (t === '1' || t.toLowerCase() === 'thường trú') return 'Thường trú';
        if (t === '2' || t.toLowerCase() === 'tạm trú') return 'Tạm trú';
        if (t === '3' || t.toLowerCase().includes('khai báo')) return 'Khai báo nơi ở hiện tại';
        return t;
    };

    // Helper to format Ward (prevent double "Ấp" or empty "Ấp")
    const getWardDisplay = (w) => {
        if (!w) return 'Ấp ......';
        const ward = String(w).trim();
        if (ward.toLowerCase().startsWith('ấp')) return ward;
        return `Ấp ${ward}`;
    };

    // Member data mapping
    const memberData = members.map((m, index) => formatMemberRow(m, index));

    // Pad with empty rows to reach at least 6 rows
    const MIN_ROWS = 6;
    while (memberData.length < MIN_ROWS) {
        memberData.push([
            memberData.length + 1, // STT
            '', '', '', '', '', '', '', '', '', '', '', ''
        ]);
    }

    const data = [
        [`MẪU PHÚC TRA NHÂN, HỘ KHẨU TRÊN ĐỊA BÀN ${getWardDisplay(household.ward).toUpperCase()}`], // Row 0
        [`Loại cư trú (Thường trú, tạm trú, khai báo nơi ở hiện tại): ${getResidenceType(household.residence_type)}; Dạng nhà (Nhà thuê nguyên căn, nhà trọ): ${household.house_type || '....................................................................'}`], // Row 1
        [`Địa chỉ: ${household.address || '........................................'}, ${getWardDisplay(household.ward)}, xã Vĩnh Lộc, huyện Bình Chánh, TP.HCM`], // Row 2
        ['STT', 'HỌ VÀ TÊN', 'QUAN HỆ VỚI CHỦ HỘ', 'NGÀY SINH', '', 'SỐ CCCD', 'DÂN TỘC', 'NGHỀ NGHIỆP', 'THỜI GIAN CƯ TRÚ', 'HỘ KHẨU THƯỜNG TRÚ', 'NƠI Ở HIỆN TẠI', 'SỐ ĐIỆN THOẠI', 'ID'], // Row 3
        ['', '', '', 'NAM', 'NỮ', '', '', '', '', '', '', '', ''], // Row 4
        ...memberData,
        [], // Empty row for padding visual
        [], // Empty row for spacing (Replaces Date Row)
        ['', '', '', '', '', '', '', '', '', 'ĐẠI DIỆN HỘ GIA ĐÌNH', '', '', ''] // Signature Title Row
    ];

    return data;
};
