import axios from 'axios';
import { Capacitor } from '@capacitor/core';

// IP máy tính của bạn (để điện thoại kết nối được)
// Nếu IP thay đổi, hãy cập nhật lại dòng này
const SERVER_IP = "192.168.1.137"; 

const api = axios.create({
    baseURL: Capacitor.isNativePlatform() 
        ? `http://${SERVER_IP}:5000/api` 
        : '/api',
});

export default api;
