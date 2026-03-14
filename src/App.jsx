import { Routes, Route } from 'react-router-dom';
import Room from './pages/Room';
import SettingsPage from './pages/Settings';
import Auth from './pages/Auth';
import Profile from './pages/Profile';

function App() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/profile/:username" element={<Profile />} />
      <Route path="/" element={<Room />} />
    </Routes>
  );
}

export default App;