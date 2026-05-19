import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import App from "./App.jsx";
import "./index.css";

/* ── Inner component that reads auth state ── */
function Root() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <App /> : <LoginPage />;
}

/* ── Mount ── */
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>
);