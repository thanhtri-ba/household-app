import React from 'react';
import '../App.css';

const ConfirmationModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Xác nhận", cancelText = "Hủy", isDanger = false }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay active">
            <div className="confirm-modal-container">
                <div className="confirm-modal-body">
                    <h3 className="confirm-title">{title}</h3>
                    <p className="confirm-message">{message}</p>
                </div>
                <div className="confirm-modal-footer">
                    <button className="confirm-btn-cancel" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button className={`confirm-btn-action ${isDanger ? 'danger' : ''}`} onClick={onConfirm}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
