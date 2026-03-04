import React, { useState, useEffect } from 'react';
import './App.css';
import { translations } from './translations';
import Login from './components/Login';
import HouseholdList from './components/HouseholdList';
import HouseholdDetail from './components/HouseholdDetail';

function App() {
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState('vi');
  const [view, setView] = useState('list'); // list, detail
  const [currentHouseholdId, setCurrentHouseholdId] = useState(null);

  const t = translations[lang];

  useEffect(() => {
    // Check localStorage for user session if implemented
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    } else {
      const guest = { username: 'offline' };
      setUser(guest);
      localStorage.setItem('user', JSON.stringify(guest));
    }

    // Attempt to sync old data from localStorage to MySQL
    import('./utils/localDataService').then(module => {
      module.syncLocalDataToServer().then(res => {
        if (res.success && res.message && !res.message.includes('Không có')) {
          alert(res.message);
        }
      });
    });

  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    setView('list');
    setCurrentHouseholdId(null);
  };

  const handleViewDetails = (id) => {
    setCurrentHouseholdId(id);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setCurrentHouseholdId(null);
  };

  if (!user) {
    return <Login onLogin={handleLogin} lang={lang} translations={translations} />;
  }

  return (
    <div className="main-container">
      <header className="app-header">
        <div className="header-content">
          <h1>{t.header_title}</h1>
          <span style={{ marginLeft: 12, fontSize: 12, background: '#eee', padding: '2px 6px', borderRadius: 4 }}>Offline</span>
        </div>
        <div className="header-right-controls">
          <div className="language-select">
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
          <button className="logout-btn" onClick={handleLogout}>{t.logout}</button>
        </div>
      </header>

      {view === 'list' && (
        <HouseholdList
          onViewDetails={handleViewDetails}
          lang={lang}
          translations={translations}
        />
      )}

      {view === 'detail' && (
        <HouseholdDetail
          householdId={currentHouseholdId}
          onBack={handleBack}
          lang={lang}
          translations={translations}
        />
      )}
    </div>
  );
}

export default App;
