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

/* ── Mount ──
   Note: StrictMode is intentionally omitted. In development it
   double-invokes effects, which re-fires the MetaMask
   accountsChanged listener and calls performLogout() immediately
   after login — silently resetting isAuthenticated to false.     */
createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <Root />
  </AuthProvider>
);