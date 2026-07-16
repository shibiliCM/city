"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<any>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      // Store token in localStorage as fallback (cookies handled server-side)
      if (res.access_token) {
        localStorage.setItem("access_token", res.access_token);
      }
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--city-bg)", padding: 24, marginLeft: "calc(-1 * var(--sidebar-width))",
      width: "calc(100% + var(--sidebar-width))",
    }}>
      {/* Background glow */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: "radial-gradient(ellipse 60% 60% at 50% 0%, rgba(20,184,166,0.12) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 80% 80%, rgba(59,130,246,0.08) 0%, transparent 60%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
            background: "linear-gradient(135deg, #0d9488, #0891b2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 40px rgba(20,184,166,0.35)",
          }}>
            <Globe size={28} color="white" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--city-text)", marginBottom: 6 }}>CityTwin AI</h1>
          <p style={{ fontSize: 14, color: "var(--city-text-muted)" }}>Urban Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="card" style={{ border: "1px solid rgba(20,184,166,0.2)", background: "rgba(17,24,39,0.9)", backdropFilter: "blur(16px)" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: "var(--city-text)" }}>Sign in</h2>
          <p style={{ fontSize: 13, color: "var(--city-text-muted)", marginBottom: 24 }}>Access your city intelligence console</p>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label>Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="admin@citytwin.ai"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  className="input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: 40 }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--city-text-muted)", display: "flex" }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 8 }}>
                <AlertCircle size={14} color="#fb7185" />
                <span style={{ fontSize: 12, color: "#fb7185" }}>{error}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: "100%", justifyContent: "center", padding: "11px", fontSize: 14, marginTop: 4 }}>
              {loading
                ? <span className="animate-spin" style={{ display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
                : <LogIn size={15} />
              }
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--city-border)", fontSize: 12, color: "var(--city-text-muted)", textAlign: "center" }}>
            Don't have an account?{" "}
            <span style={{ color: "var(--city-teal)", cursor: "pointer" }}
              onClick={() => alert("Register via POST /api/v1/auth/register")}>
              Register
            </span>
          </div>
        </div>

        {/* Demo hint */}
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--city-text-muted)" }}>
          First time? Register an account via the API, then sign in.
        </div>
      </div>
    </div>
  );
}
