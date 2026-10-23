import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminAccess } from "../features/admin/AdminAccess";
import { AuthDestination } from "../features/auth/AuthDestination";
import { AuthScreen } from "../features/auth/AuthScreen";
import { AuthenticatedRoute } from "../features/auth/AuthenticatedRoute";
import { StartPage } from "../features/start/StartPage";
import { WizardPage } from "../features/wizard/WizardPage";
import { AdminDenied, AdminRoute } from "../features/admin/AdminRoute";
import AdminApp from "../admin/App";
import { QueryProvider } from "./QueryProvider";
import { LanguageProvider } from "./LanguageProvider";
import { MswProvider } from "./MswProvider";

export default function App() {
  return (
    <MswProvider>
      <LanguageProvider>
        <QueryProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<AuthScreen />} />
              <Route
                path="/app/start"
                element={
                  <AuthenticatedRoute>
                    <StartPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/app/wizard"
                element={
                  <AuthenticatedRoute>
                    <WizardPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <AuthenticatedRoute>
                    <AuthDestination destination="dashboard" />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/app/*"
                element={
                  <AuthenticatedRoute>
                    <Navigate to="/app/start" replace />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/admin/login"
                element={<AdminAccess />}
              />
              <Route
                path="/admin/denied"
                element={<AdminDenied />}
              />
              <Route
                path="/admin/*"
                element={
                  <AdminRoute>
                    <AdminApp />
                  </AdminRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </QueryProvider>
      </LanguageProvider>
    </MswProvider>
  );
}
