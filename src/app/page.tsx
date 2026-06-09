"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LandingPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        const userEmail = session.user.email;
        if (userEmail === "admin@alif.com") {
          router.push("/accountant");
        } else {
          router.push("/teacher");
        }
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  if (checkingSession) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #fdfbfb 0%, #EAD7BB 100%)", fontFamily: "var(--font-montserrat)" }}>
        <div style={{ color: "#113946", fontWeight: "bold" }}>Verifying Session...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fdfbfb 0%, #EAD7BB 100%)", fontFamily: "var(--font-montserrat)", color: "#113946", overflowX: "hidden" }}>
      
      {/* Navbar */}
      <nav style={{ display: "flex", justifyContent: "space-between", padding: "20px 5%", alignItems: "center", background: "rgba(255, 255, 255, 0.6)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.4)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ fontFamily: "var(--font-playfair)", fontSize: "28px", fontWeight: "900", color: "#113946", letterSpacing: "-0.5px" }}>
          ALIF <span style={{ color: "#3366FF" }}>Online School</span>
        </div>
        <div>
          <Link href="/login" style={{ padding: "12px 28px", background: "#113946", color: "#FFF2D8", borderRadius: "30px", textDecoration: "none", fontWeight: "bold", fontSize: "15px", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: "0 4px 15px rgba(17,57,70,0.15)", display: "inline-block" }}
            onMouseOver={e => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseOut={e => (e.currentTarget.style.transform = "translateY(0)")}
          >
            Login to Portal
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="hero-container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 20px 100px 20px", textAlign: "center", position: "relative" }}>
        
        {/* Decorative background blur */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(51,102,255,0.08) 0%, rgba(255,255,255,0) 70%)", zIndex: 0, pointerEvents: "none" }}></div>

        <div style={{ position: "relative", zIndex: 1, background: "rgba(255, 255, 255, 0.7)", padding: "10px 24px", borderRadius: "30px", marginBottom: "35px", fontSize: "14px", fontWeight: "bold", color: "#3366FF", border: "1px solid rgba(51,102,255,0.2)", backdropFilter: "blur(8px)", display: "inline-block" }}>
          ✨ The Next Generation of School Billing
        </div>
        
        <h1 style={{ position: "relative", zIndex: 1, fontFamily: "var(--font-playfair)", fontSize: "clamp(3em, 6vw, 5.5em)", fontWeight: "900", margin: "0 0 24px 0", lineHeight: "1.1", maxWidth: "900px", color: "#0a222a" }}>
          Simplify Your <br/> <span style={{ color: "#3366FF", background: "linear-gradient(90deg, #3366FF, #00C6FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Fee Management</span>
        </h1>
        
        <p style={{ position: "relative", zIndex: 1, fontSize: "clamp(1.1em, 2vw, 1.3em)", color: "#555", maxWidth: "650px", margin: "0 auto 45px auto", lineHeight: "1.6", fontWeight: "500" }}>
          A powerful, automated cloud billing system designed exclusively for modern teachers and accountants. Instantly generate PDF receipts, track revenue, and notify parents on WhatsApp.
        </p>
        
        <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center" }}>
          <button 
            onClick={() => router.push('/login')}
            style={{ padding: "18px 45px", background: "#3366FF", color: "white", border: "none", borderRadius: "30px", fontSize: "18px", fontWeight: "bold", cursor: "pointer", transition: "all 0.3s", boxShadow: "0 10px 30px rgba(51,102,255,0.3)" }}
            onMouseOver={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 15px 35px rgba(51,102,255,0.4)" }}
            onMouseOut={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 10px 30px rgba(51,102,255,0.3)" }}
          >
            Get Started Now
          </button>
        </div>
      </div>

      {/* Feature Highlights */}
      <div style={{ display: "flex", justifyContent: "center", gap: "30px", padding: "0 5% 100px 5%", flexWrap: "wrap", position: "relative", zIndex: 1 }}>
        
        {/* Card 1 */}
        <div style={{ flex: "1", minWidth: "280px", maxWidth: "380px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", padding: "40px 30px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 32px rgba(17,57,70,0.06)", transition: "transform 0.3s" }}
             onMouseOver={e => (e.currentTarget.style.transform = "translateY(-5px)")}
             onMouseOut={e => (e.currentTarget.style.transform = "translateY(0)")}>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>🧑‍🏫</div>
          <h3 style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", marginBottom: "15px", color: "#113946", fontWeight: "800" }}>Teacher Portals</h3>
          <p style={{ color: "#555", lineHeight: "1.7", fontSize: "15px" }}>Dedicated logins for teachers with student auto-complete, historical tracking, and one-click WhatsApp receipt sharing.</p>
        </div>

        {/* Card 2 */}
        <div style={{ flex: "1", minWidth: "280px", maxWidth: "380px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", padding: "40px 30px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 32px rgba(17,57,70,0.06)", transition: "transform 0.3s" }}
             onMouseOver={e => (e.currentTarget.style.transform = "translateY(-5px)")}
             onMouseOut={e => (e.currentTarget.style.transform = "translateY(0)")}>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>💼</div>
          <h3 style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", marginBottom: "15px", color: "#113946", fontWeight: "800" }}>Accountant Dashboard</h3>
          <p style={{ color: "#555", lineHeight: "1.7", fontSize: "15px" }}>Advanced financial analytics, live verification workflows, simple CSV importing, and bulk PDF exporting capabilities.</p>
        </div>

        {/* Card 3 */}
        <div style={{ flex: "1", minWidth: "280px", maxWidth: "380px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", padding: "40px 30px", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.8)", boxShadow: "0 8px 32px rgba(17,57,70,0.06)", transition: "transform 0.3s" }}
             onMouseOver={e => (e.currentTarget.style.transform = "translateY(-5px)")}
             onMouseOut={e => (e.currentTarget.style.transform = "translateY(0)")}>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>☁️</div>
          <h3 style={{ fontFamily: "var(--font-playfair)", fontSize: "24px", marginBottom: "15px", color: "#113946", fontWeight: "800" }}>Secure Cloud</h3>
          <p style={{ color: "#555", lineHeight: "1.7", fontSize: "15px" }}>All transaction data is safely stored in Supabase with real-time syncing, Row Level Security, and automated backups.</p>
        </div>

      </div>

      {/* Footer */}
      <footer style={{ padding: "30px", textAlign: "center", borderTop: "1px solid rgba(17,57,70,0.1)", color: "#666", fontSize: "14px" }}>
        &copy; {new Date().getFullYear()} ALIF Online School. All rights reserved.
      </footer>
      
    </div>
  );
}
