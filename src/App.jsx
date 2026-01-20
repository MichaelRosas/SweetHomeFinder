import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import RoleRoute from './auth/RoleRoute';

// Pages
import Welcome from './pages/Welcome.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import Onboarding from './pages/Onboarding.jsx';

import Dashboard from './pages/Dashboard.jsx';

import Pets from './pages/Pets.jsx';
import PetDetail from './pages/PetDetail.jsx';
import EditPet from './pages/EditPet.jsx';

import PetQuiz from './pages/PetQuiz.jsx';
import Profile from './pages/Profile.jsx';

import Applications from './pages/Applications.jsx';
import ShelterApplications from './pages/ShelterApplications.jsx';
import ShelterListPet from './pages/ShelterListPet.jsx';

import Chat from './pages/Chat.jsx';
import './styles/App.css'; // page-scoped helpers (e.g., not-found)

// Simple not-found boundary
function NotFound() {
  return (
    <div className="auth-container">
      <main className="auth-content">
        <div className="auth-card text-left">
          <h1>Page not found</h1>
          <p>The page you’re looking for doesn’t exist.</p>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Welcome />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        {/* Onboarding (any signed-in user who still needs onboarding) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Role-aware dashboards */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Browse & details */}
        <Route
          path="/pets"
          element={
            <ProtectedRoute>
              <Pets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pets/:id"
          element={
            <ProtectedRoute>
              <PetDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pets/:id/edit"
          element={
            <ProtectedRoute>
              <RoleRoute allow={['shelter', 'admin']}>
                <EditPet />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        {/* Adopter quiz/preferences */}
        <Route
          path="/quiz"
          element={
            <ProtectedRoute>
              <RoleRoute allow={['adopter']}>
                <PetQuiz />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Applications */}
        <Route
          path="/applications"
          element={
            <ProtectedRoute>
              <RoleRoute allow={['adopter']}>
                <Applications />
              </RoleRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/shelter/applications"
          element={
            <ProtectedRoute>
              <RoleRoute allow={['shelter', 'admin']}>
                <ShelterApplications />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        {/* Shelter create listing */}
        <Route
          path="/shelter/list"
          element={
            <ProtectedRoute>
              <RoleRoute allow={['shelter', 'admin']}>
                <ShelterListPet />
              </RoleRoute>
            </ProtectedRoute>
          }
        />

        {/* Chat for all signed-in roles (adopter/shelter/admin) */}
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        {/* Canonical auth redirects */}
        <Route path="/home" element={<Navigate to="/dashboard" replace />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
