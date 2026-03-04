import api from '../api';

const H_KEY = 'households';
const M_KEY = 'members';

// Helper to keep old sync logic accessible for one-time manual sync if needed
function readLocal(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Syncs any data currently sitting in localStorage to the real backend.
 * Meant to be called once by App.jsx or manually if migrating.
 */
export async function syncLocalDataToServer() {
  const localHouseholds = readLocal(H_KEY);
  const localMembers = readLocal(M_KEY);

  if (localHouseholds.length === 0 && localMembers.length === 0) {
    return { success: true, message: "Không có dữ liệu cũ cần đồng bộ." };
  }

  try {
    let syncedCount = 0;
    // We sync households first
    for (const h of localHouseholds) {
      // Create household on server
      const { id, ...dataToSync } = h; // remove the fake local 'hh_xxx' ID
      const resHousehold = await api.post('/households', dataToSync);
      const newHouseholdId = resHousehold.data.id;

      // Find members that belonged to this household
      const membersToSync = localMembers.filter(m => m.household_id === h.id);
      for (const m of membersToSync) {
        const { id: mId, household_id, ...memberData } = m;
        await api.post('/members', { ...memberData, household_id: newHouseholdId });
      }
      syncedCount++;
    }

    // After success, clear local storage so it doesn't run again
    localStorage.removeItem(H_KEY);
    localStorage.removeItem(M_KEY);

    return { success: true, message: `Đã đồng bộ thành công ${syncedCount} hộ gia đình từ máy lên máy chủ!` };
  } catch (err) {
    console.error("Lỗi đồng bộ dữ liệu cũ:", err);
    return { success: false, message: "Lỗi đồng bộ dữ liệu cũ: " + err.message };
  }
}

// ==========================================
// REAL API IMPLEMENTATION
// ==========================================

export async function getHouseholds() {
  const res = await api.get('/households');
  return res.data;
}

export async function getHouseholdById(id) {
  // Current server API doesn't have a specific GET /households/:id, 
  // so we fetch all and find, or we can just hope it's not too large.
  // For large scale, the backend needs GET /households/:id
  const res = await api.get('/households');
  return res.data.find(h => h.id == id) || null;
}

export async function createHousehold(data) {
  const res = await api.post('/households', data);
  return res.data;
}

export async function updateHousehold(id, patch) {
  const res = await api.put(`/households/${id}`, patch);
  return res.data;
}

export async function deleteHousehold(id) {
  await api.delete(`/households/${id}`);
  return true;
}

export async function getMembersByHousehold(householdId) {
  const res = await api.get(`/households/${householdId}/members`);
  return res.data;
}

export async function createMember(data) {
  const res = await api.post('/members', data);
  return res.data;
}

export async function updateMember(id, patch) {
  const res = await api.put(`/members/${id}`, patch);
  return res.data;
}

export async function deleteMember(id) {
  await api.delete(`/members/${id}`);
  return true;
}
