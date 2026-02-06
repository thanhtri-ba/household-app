import React, { useState } from 'react';

const Login = ({ onLogin, lang, translations }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const t = translations[lang];

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!username || !password) {
            setError(t.login_error_empty);
            return;
        }

        const userData = { username };
        onLogin(userData);
    };

    return (
        <div className="login-section active">
            <div className="background-pattern"></div>
            <div className="login-card">
                <h1 className="login-title">{t.login_title}</h1>
                <p className="login-subtitle">{t.login_subtitle}</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>{t.username}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder={t.username}
                        />
                    </div>
                    <div className="form-group">
                        <label>{t.password}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t.password}
                        />
                    </div>
                    {error && <p className="error-text">{error}</p>}
                    <button type="submit" className="login-btn">{t.login_btn}</button>
                </form>
            </div>
        </div>
    );
};

export default Login;
