import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import CONTRACT_ADDRESSES    from "../contracts/addresses.js";
import LandholderIdentityABI from "../contracts/abis/LandholderIdentity.json";

const AuthContext = createContext(null);

/* ── Session configuration ──────────────────────────────────── */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS  =  2 * 60 * 1000;
const ACTIVITY_EVENTS    = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

/* ══════════════════════════════════════════════════════════════
   ERROR TRANSLATOR
   ══════════════════════════════════════════════════════════════ */
function parseAuthError(err) {
  const code    = err?.code;
  const message = (err?.message || err?.reason || "").toLowerCase();
  const info    = (err?.info?.error?.message || "").toLowerCase();

  if (code === 4001 || message.includes("user rejected") || message.includes("user denied") ||
      message.includes("action_rejected") || info.includes("user denied")) {
    return "You cancelled the request in MetaMask. Click the button and approve when prompted.";
  }
  if (code === 4100)   return "MetaMask is locked. Please unlock MetaMask and try again.";
  if (code === 4902)   return "Sepolia Testnet not found in MetaMask. Please add it and try again.";
  if (code === -32002) return "A MetaMask request is already pending. Open MetaMask and complete it first.";
  if (code === -32603 || message.includes("internal json-rpc error"))
    return "MetaMask encountered an internal error. Refresh the page and try again.";
  if (message.includes("network") || message.includes("could not detect network"))
    return "Cannot connect to the Ethereum network. Check your internet connection and MetaMask settings.";
  if (message.includes("timeout") || message.includes("timed out"))
    return "The network request timed out. Check your connection and try again.";
  if (message.includes("disconnected"))
    return "Lost connection to the blockchain. Refresh the page and reconnect your wallet.";
  if (message.includes("insufficient funds"))
    return "Not enough ETH to cover gas fees. Add Sepolia ETH from a faucet and retry.";
  if (message.includes("no provider") || message.includes("window.ethereum"))
    return "MetaMask is not installed. Please install the MetaMask browser extension.";

  const clean = (err?.reason || err?.message || "Unknown error")
    .replace(/\s*\(action=.*?\)/gs, "")
    .replace(/\s*\(code=.*?\)/gs,   "")
    .replace(/\n[\s\S]*/g,          "")
    .trim();
  return clean || "An unexpected error occurred. Please try again.";
}

/* ══════════════════════════════════════════════════════════════
   AUTH PROVIDER
   ══════════════════════════════════════════════════════════════ */
export function AuthProvider({ children }) {

  /* ── Auth state ── */
  const [wallet,           setWallet]           = useState(null);
  const [role,             setRole]             = useState(null);
  const [isAuthenticated,  setIsAuthenticated]  = useState(false);
  const [identityContract, setIdentityContract] = useState(null);
  const [authLoading,      setAuthLoading]      = useState(false);
  const [authError,        setAuthError]        = useState("");
  const [verifyingRole,    setVerifyingRole]    = useState(false);

  /*
   * pendingAddress — the address returned by eth_requestAccounts.
   * Held in context so LoginPage can show the "Confirm & Sign"
   * panel and pass it back to signAndAuthenticate() without a
   * second eth_requestAccounts call.
   */
  const [pendingAddress,   setPendingAddress]   = useState(null);

  /* ── Session timeout state ── */
  const [sessionWarning, setSessionWarning] = useState(false);
  const [timeRemaining,  setTimeRemaining]  = useState(null);

  /* ── Timer refs ── */
  const logoutTimerRef  = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownRef    = useRef(null);

  /*
   * authInProgressRef — true while signAndAuthenticate() is running.
   * MetaMask emits accountsChanged as it internally commits the session
   * after signMessage resolves. Without this guard that event fires the
   * performLogout listener and silently reverts isAuthenticated back to
   * false immediately after it was set to true.
   * Using a ref (not state) keeps updates synchronous and avoids re-renders.
   */
  const authInProgressRef = useRef(false);

  function clearAllTimers() {
    clearTimeout(logoutTimerRef.current);
    clearTimeout(warningTimerRef.current);
    clearInterval(countdownRef.current);
    logoutTimerRef.current  = null;
    warningTimerRef.current = null;
    countdownRef.current    = null;
  }

  async function revokeWalletPermissions() {
    try {
      if (window.ethereum) {
        await window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      }
    } catch (err) {
      console.warn("Could not revoke wallet permissions:", err.message);
    }
  }

  /* ── Logout ── */
  const performLogout = useCallback(async (timedOut = false) => {
    clearAllTimers();
    await revokeWalletPermissions();
    setWallet(null);
    setRole(null);
    setIsAuthenticated(false);
    setIdentityContract(null);
    setAuthError("");
    setPendingAddress(null);
    setSessionWarning(false);
    setTimeRemaining(null);
    if (timedOut) sessionStorage.setItem("sessionExpired", "true");
  }, []);

  /* ── Session inactivity timers ── */
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

  useEffect(() => {
    if (!isAuthenticated) return;
    resetSessionTimer();
    function handleActivity() { setSessionWarning(false); resetSessionTimer(); }
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearAllTimers();
    };
  }, [isAuthenticated, resetSessionTimer]);

  /*
   * accountsChanged handler — guards against the spurious emit that
   * MetaMask fires while committing a session after signMessage resolves.
   *
   * Rules:
   *   1. If auth is in progress, ignore entirely (authInProgressRef guard).
   *   2. If not yet authenticated, nothing to logout from — ignore.
   *   3. Only logout when the incoming account is genuinely different from
   *      the currently authenticated wallet, or goes empty (disconnected).
   */
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountChange = (accounts) => {
      // Guard: ignore events fired during sign / on-chain verification
      if (authInProgressRef.current) return;

      const newAccount    = accounts?.[0]?.toLowerCase();
      const currentWallet = wallet?.toLowerCase();

      // Only act when the user is authenticated and the account actually changed
      if (isAuthenticated && newAccount !== currentWallet) {
        performLogout(false);
      }
    };

    const handleChainChange = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccountChange);
    window.ethereum.on("chainChanged",    handleChainChange);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountChange);
      window.ethereum.removeListener("chainChanged",    handleChainChange);
    };
  }, [performLogout, isAuthenticated, wallet]);

  /* ══════════════════════════════════════════════════════════════
     STEP 1 — requestAccounts
     ─────────────────────────────────────────────────────────────
     Resolves the connected wallet address. Does NOT call
     signMessage — that is a deliberate second user gesture.

     Strategy (avoids -32002 entirely):
       1. Call eth_accounts first (never throws, never shows popup).
          If the site is already permitted, this returns the address
          instantly — no MetaMask popup needed at all.
       2. Only if eth_accounts returns empty do we escalate to
          eth_requestAccounts, which opens the account picker.
       3. If eth_requestAccounts throws -32002 (a prior request is
          still pending in the MetaMask queue), poll eth_accounts
          every 800 ms and resolve automatically when the user
          approves the existing popup — no extra click required.
     ══════════════════════════════════════════════════════════════ */
  async function requestAccounts() {
    try {
      setAuthLoading(true);
      setAuthError("");
      setPendingAddress(null);

      if (!window.ethereum) {
        setAuthError("MetaMask is not installed. Please install the MetaMask browser extension.");
        return null;
      }

      /* ── Step 1a: check for an already-connected account ───────
         eth_accounts never throws -32002 and never opens a popup.
         If the site was previously permitted, this resolves the
         address immediately and we skip the account picker entirely. */
      const existing = await window.ethereum.request({ method: "eth_accounts" });
      if (existing && existing.length > 0) {
        const address = existing[0];
        setPendingAddress(address);
        return address;
      }

      /* ── Step 1b: no prior permission — open the account picker ─ */
      let accounts;
      try {
        accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

      } catch (reqErr) {
        /* ── -32002: a prior eth_requestAccounts call is still open ─
           Cannot cancel programmatically. Poll eth_accounts (safe,
           no -32002) every 800 ms. Resolves automatically the moment
           the user approves or the pending popup closes.            */
        if (reqErr?.code === -32002) {
          setAuthError(
            "MetaMask already has a connection request open. " +
            "Click the 🦊 MetaMask icon in your browser toolbar to bring it to the front, " +
            "then approve the request. This page will continue automatically."
          );

          const address = await new Promise((resolve) => {
            const intervalId = setInterval(async () => {
              try {
                const polled = await window.ethereum.request({ method: "eth_accounts" });
                if (polled && polled.length > 0) {
                  clearInterval(intervalId);
                  resolve(polled[0]);
                }
              } catch { /* keep polling */ }
            }, 800);

            /* Safety cap: 2 minutes */
            setTimeout(() => { clearInterval(intervalId); resolve(null); }, 120_000);
          });

          if (!address) {
            setAuthError(
              "Connection timed out. Open MetaMask, dismiss any pending requests, then try again."
            );
            return null;
          }

          setAuthError("");
          setPendingAddress(address);
          return address;
        }

        /* All other errors — user rejected, locked, network, etc. */
        setAuthError(parseAuthError(reqErr));
        return null;
      }

      if (!accounts || accounts.length === 0) {
        setAuthError("No accounts found. Please unlock MetaMask and try again.");
        return null;
      }

      const address = accounts[0];
      setPendingAddress(address);
      return address;

    } catch (err) {
      setAuthError(parseAuthError(err));
      return null;
    } finally {
      setAuthLoading(false);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     STEP 2 — signAndAuthenticate
     ─────────────────────────────────────────────────────────────
     Receives an already-resolved address (from requestAccounts or
     requestAndChangeWallet). Calls signMessage then runs the
     on-chain role check. Never calls eth_requestAccounts again.

     STRICT: missing/broken contract = DENY, never allow through.

     authInProgressRef is set to true for the entire duration so
     the accountsChanged listener ignores the spurious emit that
     MetaMask fires when it commits the session after signing.
     ══════════════════════════════════════════════════════════════ */
  async function signAndAuthenticate(selectedRole, resolvedAddress) {
    authInProgressRef.current = true;
    try {
      setAuthLoading(true);
      setAuthError("");

      if (!window.ethereum) {
        setAuthError("MetaMask is not installed. Please install the MetaMask browser extension.");
        return false;
      }

      /* ── Public role — no wallet or contract needed ── */
      if (selectedRole === "public") {
        setPendingAddress(null);
        setRole("public");
        setIsAuthenticated(true);
        return true;
      }

      if (!resolvedAddress) {
        setAuthError("No wallet address available. Please connect MetaMask first.");
        return false;
      }

      const _address  = resolvedAddress;
      const _provider = new ethers.BrowserProvider(window.ethereum);
      const _signer   = await _provider.getSigner(_address);

      /* Switch loading indicator to "verifying" phase */
      setAuthLoading(false);
      setVerifyingRole(true);

      /* ── Build and request signature ── */
      const timestamp   = new Date().toISOString();
      const roleLabel   = selectedRole === "officer" ? "Registry Officer" : "Landholder";
      const signMessage = [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "  Rongai Blockchain Land Registry",
        "  Kajiado County Government — BLRMS",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        `  Role:      ${roleLabel}`,
        `  Wallet:    ${_address}`,
        `  Timestamp: ${timestamp}`,
        `  Network:   Ethereum Sepolia Testnet`,
        "",
        "  By signing you confirm:",
        "  • You are the owner of this wallet",
        "  • You agree to BLRMS terms of access",
        "  • This signature does not cost gas fees",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      ].join("\n");

      let signature;
      try {
        signature = await _signer.signMessage(signMessage);
      } catch (signErr) {
        if (signErr.code === 4001 ||
            (signErr.message || "").toLowerCase().includes("user rejected") ||
            (signErr.message || "").toLowerCase().includes("user denied")) {
          setAuthError("Signature cancelled. You must approve the MetaMask signing prompt to access BLRMS.");
        } else {
          setAuthError(parseAuthError(signErr));
        }
        setVerifyingRole(false);
        return false;
      }

      /* ── Verify recovered address ── */
      const recovered = ethers.verifyMessage(signMessage, signature);
      if (recovered.toLowerCase() !== _address.toLowerCase()) {
        setAuthError("Signature verification failed — wallet address mismatch. Please try again.");
        setVerifyingRole(false);
        return false;
      }

      /* ── Initialise identity contract — STRICT: no address = deny ── */
      const idAddress = CONTRACT_ADDRESSES?.LandholderIdentity;
      if (!idAddress) {
        setAuthError(
          "Contract configuration error: LandholderIdentity address is not set.\n" +
          "Contact the system administrator."
        );
        setVerifyingRole(false);
        return false;
      }

      let _id;
      try {
        _id = new ethers.Contract(idAddress, LandholderIdentityABI.abi, _signer);
      } catch (contractErr) {
        console.error("Could not initialise identity contract:", contractErr.message);
        setAuthError(
          "Could not connect to the identity contract. " +
          "Check your network connection and that MetaMask is on Ethereum Sepolia."
        );
        setVerifyingRole(false);
        return false;
      }

      /* ── Officer on-chain check — STRICT: any failure = deny ── */
      if (selectedRole === "officer") {
        try {
          const isOfficer = await _id.isOfficer(_address);
          if (!isOfficer) {
            setAuthError(
              `Access denied. Your wallet (${_address.slice(0, 6)}…${_address.slice(-4)}) ` +
              `is not registered as a Registry Officer.\n\n` +
              `Contact the system administrator to be added to the officer whitelist.`
            );
            setVerifyingRole(false);
            return false;
          }
        } catch (checkErr) {
          console.error("Officer check error:", checkErr.message);
          setAuthError(
            `Could not verify officer status on-chain.\n\n` +
            `Make sure MetaMask is connected to Ethereum Sepolia and try again.\n\n` +
            `Details: ${parseAuthError(checkErr)}`
          );
          setVerifyingRole(false);
          return false;
        }
      }

      /* ── Landholder on-chain check ─────────────────────────────
         Uses getIdentity() directly — ABI has explicit `exists`
         and `isVerified` booleans; never infer from wallet address.
         Any thrown error = deny (no silent allow-through).
         ────────────────────────────────────────────────────────── */
      if (selectedRole === "landholder") {
        let record;
        try {
          record = await _id.getIdentity(_address);
        } catch (checkErr) {
          console.error("getIdentity call failed:", checkErr.message);
          setAuthError(
            `Could not verify landholder registration on-chain.\n\n` +
            `Make sure MetaMask is connected to Ethereum Sepolia and try again.\n\n` +
            `Details: ${parseAuthError(checkErr)}`
          );
          setVerifyingRole(false);
          return false;
        }

        if (!record?.exists) {
          setAuthError(
            `Access denied. Your wallet (${_address.slice(0, 6)}…${_address.slice(-4)}) ` +
            `is not registered as a Landholder in the Rongai Land Registry.\n\n` +
            `To gain access:\n` +
            `1. Visit your nearest Kajiado County Land Registry office.\n` +
            `2. Provide your wallet address and National ID to the Registry Officer.\n` +
            `3. The officer will register your KYC identity on-chain.\n` +
            `4. Return here and log in once your registration is confirmed.`
          );
          setVerifyingRole(false);
          return false;
        }

        if (!record?.isVerified) {
          setAuthError(
            `Your identity registration is pending KYC verification.\n\n` +
            `Your wallet (${_address.slice(0, 6)}…${_address.slice(-4)}) is registered ` +
            `but has not yet been approved by a Registry Officer.\n\n` +
            `Contact the Kajiado County Land Registry office to have your identity confirmed.`
          );
          setVerifyingRole(false);
          return false;
        }
      }

      /* ── SUCCESS ── */
      setPendingAddress(null);
      setWallet(_address);
      setRole(selectedRole);
      setIdentityContract(_id);
      setIsAuthenticated(true);
      setVerifyingRole(false);
      return true;

    } catch (err) {
      setAuthError(parseAuthError(err));
      setVerifyingRole(false);
      return false;
    } finally {
      setAuthLoading(false);
      setVerifyingRole(false);
      // Always clear the guard — even if an exception escaped a catch block
      authInProgressRef.current = false;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     requestAndChangeWallet
     ─────────────────────────────────────────────────────────────
     Forces MetaMask to open the account picker even when an
     account is already connected, by using wallet_requestPermissions.
     Returns the newly selected address, and stores it as
     pendingAddress so the confirm panel updates immediately.
     ══════════════════════════════════════════════════════════════ */
  async function requestAndChangeWallet() {
    try {
      setAuthError("");
      setAuthLoading(true);

      if (!window.ethereum) {
        setAuthError("MetaMask is not installed. Please install the MetaMask browser extension.");
        return null;
      }

      /* wallet_requestPermissions always opens the account picker */
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      /* After permission granted, read the selected account */
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) {
        setAuthError("No account selected. Please try again.");
        return null;
      }

      const address = accounts[0];
      setPendingAddress(address);
      return address;

    } catch (err) {
      setAuthError(parseAuthError(err));
      return null;
    } finally {
      setAuthLoading(false);
    }
  }

  /* ── Legacy alias used by App.jsx header connect button ── */
  async function connectWallet(forcePrompt = false) {
    try {
      setAuthError("");
      setAuthLoading(true);
      if (!window.ethereum) {
        setAuthError("MetaMask is not installed.");
        return null;
      }
      const method   = forcePrompt ? "eth_requestAccounts" : "eth_accounts";
      const accounts = await window.ethereum.request({ method });
      if (!accounts || accounts.length === 0) return null;
      return accounts[0];
    } catch (err) {
      setAuthError(parseAuthError(err));
      return null;
    } finally {
      setAuthLoading(false);
    }
  }

  function clearPendingAddress() {
    setPendingAddress(null);
    setAuthError("");
  }

  function logout()        { performLogout(false); }
  function extendSession() { setSessionWarning(false); setTimeRemaining(null); resetSessionTimer(); }

  return (
    <AuthContext.Provider value={{
      wallet, role, isAuthenticated,
      identityContract, authLoading, authError, verifyingRole,
      pendingAddress,
      sessionWarning, timeRemaining,
      connectWallet,
      requestAccounts,
      signAndAuthenticate,
      requestAndChangeWallet,
      clearPendingAddress,
      logout,
      extendSession,
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