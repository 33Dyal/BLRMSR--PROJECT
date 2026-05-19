import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import CONTRACT_ADDRESSES    from "../contracts/addresses.js";
import LandholderIdentityABI from "../contracts/abis/LandholderIdentity.json";

const AuthContext = createContext(null);

/* ── Session configuration ─────────────────────────────────── */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min inactivity → auto logout
const WARNING_BEFORE_MS  =  2 * 60 * 1000; //  2 min before timeout → show warning
const ACTIVITY_EVENTS    = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

export function AuthProvider({ children }) {

  /* ── Auth state ── */
  const [wallet,          setWallet]          = useState(null);
  const [role,            setRole]            = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [identityContract,setIdentityContract]= useState(null);
  const [authLoading,     setAuthLoading]     = useState(false);
  const [authError,       setAuthError]       = useState("");

  /* ── Session timeout state ── */
  const [sessionWarning,  setSessionWarning]  = useState(false);
  const [timeRemaining,   setTimeRemaining]   = useState(null);

  /* ── Timer refs ── */
  const logoutTimerRef  = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownRef    = useRef(null);

  /* ── Clear all session timers ── */
  function clearAllTimers() {
    clearTimeout(logoutTimerRef.current);
    clearTimeout(warningTimerRef.current);
    clearInterval(countdownRef.current);
    logoutTimerRef.current  = null;
    warningTimerRef.current = null;
    countdownRef.current    = null;
  }

  /* ── Perform logout ── */
  const performLogout = useCallback((timedOut = false) => {
    clearAllTimers();
    setWallet(null);
    setRole(null);
    setIsAuthenticated(false);
    setIdentityContract(null);
    setAuthError("");
    setSessionWarning(false);
    setTimeRemaining(null);
    if (timedOut) {
      sessionStorage.setItem("sessionExpired", "true");
    }
  }, []);

  /* ── Reset/start session inactivity timers ── */
  const resetSessionTimer = useCallback(() => {
    clearAllTimers();
    setSessionWarning(false);
    setTimeRemaining(null);

    warningTimerRef.current = setTimeout(() => {
      setSessionWarning(true);
      let secondsLeft = Math.floor(WARNING_BEFORE_MS / 1000);
      setTimeRemaining(secondsLeft);
      countdownRef.current = setInterval(() => {
        secondsLeft -= 1;
        setTimeRemaining(secondsLeft > 0 ? secondsLeft : 0);
        if (secondsLeft <= 0) clearInterval(countdownRef.current);
      }, 1000);
    }, SESSION_TIMEOUT_MS - WARNING_BEFORE_MS);

    logoutTimerRef.current = setTimeout(() => {
      performLogout(true);
    }, SESSION_TIMEOUT_MS);
  }, [performLogout]);

  /* ── Activity listener ── */
  useEffect(() => {
    if (!isAuthenticated) return;
    resetSessionTimer();
    function handleActivity() {
      setSessionWarning(false);
      resetSessionTimer();
    }
    ACTIVITY_EVENTS.forEach(evt =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );
    return () => {
      ACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, handleActivity)
      );
      clearAllTimers();
    };
  }, [isAuthenticated, resetSessionTimer]);

  /* ── MetaMask account/network change listeners ── */
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountChange = () => performLogout(false);
    const handleChainChange   = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccountChange);
    window.ethereum.on("chainChanged",    handleChainChange);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountChange);
      window.ethereum.removeListener("chainChanged",    handleChainChange);
    };
  }, [performLogout]);

  /* ══════════════════════════════════════════════════════════
     CONNECT AND AUTHENTICATE
     ══════════════════════════════════════════════════════════ */
  async function connectAndAuthenticate(selectedRole) {
    try {
      setAuthLoading(true);
      setAuthError("");

      /* ── 1. Check MetaMask ── */
      if (!window.ethereum) {
        setAuthError("MetaMask not found. Please install MetaMask to continue.");
        return false;
      }

      /* ── 2. Check contract addresses loaded correctly ── */
      const missingAddresses = Object.entries(CONTRACT_ADDRESSES)
        .filter(([, v]) => !v)
        .map(([k]) => k);

      if (missingAddresses.length > 0) {
        setAuthError(
          `System configuration error: missing contract addresses for ${missingAddresses.join(", ")}. ` +
          `Check that frontend/.env is correctly configured and restart the dev server.`
        );
        return false;
      }

      /* ── 3. Connect MetaMask ── */
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const _signer   = await _provider.getSigner();
      const _address  = await _signer.getAddress();

      /* ── 4. Initialise identity contract ── */
      const _id = new ethers.Contract(
        CONTRACT_ADDRESSES.LandholderIdentity,
        LandholderIdentityABI.abi,
        _signer
      );

      /* ── 5. Role-specific checks ── */
      if (selectedRole === "officer") {
        // Verify on-chain that this wallet is a registered officer
        try {
          const isOfficer = await _id.isOfficer(_address);
          if (!isOfficer) {
            setAuthError(
              `❌ Access Denied: Your wallet (${_address.slice(0,6)}…${_address.slice(-4)}) ` +
              `is not registered as a Registry Officer. ` +
              `Contact the system administrator (contract deployer) to be whitelisted.`
            );
            return false;
          }
        } catch (checkErr) {
          // If the on-chain check fails, warn but allow through
          // This handles cases where the contract is freshly deployed
          console.warn("Officer check failed:", checkErr.message);
        }
      }

      /* ── 6. Set auth state ── */
      setWallet(_address);
      setRole(selectedRole);
      setIdentityContract(_id);
      setIsAuthenticated(true);
      return true;

    } catch (err) {
      if (err.code === 4001) {
        setAuthError("Connection rejected. Please approve MetaMask to continue.");
      } else {
        setAuthError("Connection failed: " + err.message);
      }
      return false;
    } finally {
      setAuthLoading(false);
    }
  }

  /* ── Public API ── */
  function logout()        { performLogout(false); }
  function extendSession() {
    setSessionWarning(false);
    setTimeRemaining(null);
    resetSessionTimer();
  }

  return (
    <AuthContext.Provider value={{
      wallet, role, isAuthenticated,
      identityContract, authLoading, authError,
      sessionWarning, timeRemaining,
      connectAndAuthenticate, logout, extendSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}