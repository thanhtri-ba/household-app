// Frontend-only data service using localStorage
const H_KEY = 'households';
const M_KEY = 'members';

function read(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function genId(prefix = '') {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}

// Seed minimal data if empty
function ensureSeed() {
  const households = read(H_KEY);
  if (households.length === 0) {
    const seedHousehold = {
      id: genId('hh_'),
      head_name: 'Nguyễn Văn A',
      cccd: '012345678901',
      birthdate: '1980-01-01',
      gender: 'nam',
      phone: '0900000000',
      address: 'Ấp 1, Xã ABC',
      ward: 'Ấp 1',
      house_type: 'Nhà cấp 4',
      residence_type: 'Thường trú',
      ethnicity: 'Kinh',
      job: 'Nông dân',
      residence_time: '10 năm',
      permanent_address: 'Ấp 1, Xã ABC',
      current_address: 'Ấp 1, Xã ABC'
    };
    const seedHousehold2 = {
      id: genId('hh_'),
      head_name: 'Trần Thị B',
      cccd: '987654321000',
      birthdate: '1985-05-12',
      gender: 'nữ',
      phone: '0911111111',
      address: 'Ấp 2, Xã DEF',
      ward: 'Ấp 2',
      house_type: 'Nhà kiên cố',
      residence_type: 'Tạm trú',
      ethnicity: 'Kinh',
      job: 'Công nhân',
      residence_time: '3 năm',
      permanent_address: 'Ấp 5, Xã XYZ',
      current_address: 'Ấp 2, Xã DEF'
    };
    const seedHousehold3 = {
      id: genId('hh_'),
      head_name: 'Phạm Văn C',
      cccd: '123123123123',
      birthdate: '1972-07-07',
      gender: 'nam',
      phone: '0922222222',
      address: 'Ấp 3, Xã GHI',
      ward: 'Ấp 3',
      house_type: 'Nhà bán kiên cố',
      residence_type: 'Thường trú',
      ethnicity: 'Kinh',
      job: 'Thợ hồ',
      residence_time: '20 năm',
      permanent_address: 'Ấp 3, Xã GHI',
      current_address: 'Ấp 3, Xã GHI'
    };
    write(H_KEY, [seedHousehold, seedHousehold2, seedHousehold3]);
    write(M_KEY, []);
  }
}

ensureSeed();

export function getHouseholds() {
  return read(H_KEY);
}

export function getHouseholdById(id) {
  return read(H_KEY).find(h => h.id === id) || null;
}

export function createHousehold(data) {
  const households = read(H_KEY);
  const id = genId('hh_');
  const newH = { id, ...data };
  households.push(newH);
  write(H_KEY, households);
  return newH;
}

export function updateHousehold(id, patch) {
  const households = read(H_KEY);
  const idx = households.findIndex(h => h.id === id);
  if (idx === -1) return null;
  households[idx] = { ...households[idx], ...patch };
  write(H_KEY, households);
  return households[idx];
}

export function deleteHousehold(id) {
  const households = read(H_KEY).filter(h => h.id !== id);
  write(H_KEY, households);
  const members = read(M_KEY).filter(m => m.household_id !== id);
  write(M_KEY, members);
  return true;
}

export function getMembersByHousehold(householdId) {
  return read(M_KEY).filter(m => m.household_id === householdId);
}

export function createMember(data) {
  const members = read(M_KEY);
  const id = genId('mb_');
  const newM = { id, ...data };
  members.push(newM);
  write(M_KEY, members);
  return newM;
}

export function updateMember(id, patch) {
  const members = read(M_KEY);
  const idx = members.findIndex(m => m.id === id);
  if (idx === -1) return null;
  members[idx] = { ...members[idx], ...patch };
  write(M_KEY, members);
  return members[idx];
}

export function deleteMember(id) {
  const members = read(M_KEY).filter(m => m.id !== id);
  write(M_KEY, members);
  return true;
}
