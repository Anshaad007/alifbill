"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Swal from "sweetalert2";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [assignedClass, setAssignedClass] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        routeUser(session.user.email);
      }
    });
  }, []);

  const routeUser = (userEmail: string | undefined) => {
    if (userEmail === "admin@alif.com") {
      router.push("/accountant");
    } else {
      router.push("/teacher");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        if (!fullName || !assignedClass) {
          Swal.fire({ title: 'Missing Info', text: 'Please fill in your Full Name and Assigned Class.', icon: 'warning', confirmButtonColor: '#113946' });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        if (data.user) {
          // If session is null, email confirmation is required
          if (!data.session) {
            Swal.fire({
              title: 'Email Confirmation Required',
              text: "Account created, but Supabase requires Email Confirmation! Please turn off 'Confirm Email' in Supabase Auth Settings, or click the link in your email.",
              icon: 'info',
              confirmButtonColor: '#113946'
            });
            setLoading(false);
            return;
          }

          // Save the teacher profile
          const { error: profileError } = await supabase.from('user_profiles').insert({
            id: data.user.id,
            email: data.user.email,
            full_name: fullName,
            assigned_class: assignedClass,
            role: 'teacher'
          });

          if (profileError) {
            console.error("Profile Error:", profileError);
            throw new Error("Failed to save teacher profile. Is the user_profiles table created?");
          }

          Swal.fire({ title: 'Welcome!', text: 'Teacher Account created successfully! You are now logged in.', icon: 'success', timer: 2000, showConfirmButton: false });
          routeUser(data.user.email);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) routeUser(data.user.email);
      }
    } catch (err: any) {
      Swal.fire({ title: 'Authentication Error', text: err.message, icon: 'error', confirmButtonColor: '#113946' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #fdfbfb 0%, #EAD7BB 100%)", fontFamily: "var(--font-montserrat)" }}>
      <div style={{ background: "white", padding: "40px", borderRadius: "24px", boxShadow: "0 10px 40px rgba(17,57,70,0.1)", width: "100%", maxWidth: "420px", position: "relative", overflow: "hidden" }}>

        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "6px", background: "linear-gradient(90deg, #BCA37F, #113946)" }}></div>

        <h2 style={{ textAlign: "center", color: "#113946", marginBottom: "30px", fontFamily: "var(--font-playfair)", fontSize: "28px" }}>
          ALIF Online School<br />
          <span style={{ fontSize: "16px", fontWeight: "normal", color: "#666", fontFamily: "var(--font-montserrat)" }}>
            {isSignUp ? "Create a New Account" : "Welcome Back"}
          </span>
        </h2>

        <form onSubmit={handleAuth}>
          {isSignUp && (
            <>
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", marginBottom: "8px", color: "#113946", fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ width: "100%", padding: "14px", border: "2px solid #E0E3EB", borderRadius: "12px", outline: "none", fontSize: "15px", transition: "all 0.3s" }}
                  placeholder="e.g. John Doe"
                  required={isSignUp}
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", marginBottom: "8px", color: "#113946", fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Assigned Class/Section</label>
                <input
                  type="text"
                  value={assignedClass}
                  onChange={(e) => setAssignedClass(e.target.value)}
                  style={{ width: "100%", padding: "14px", border: "2px solid #E0E3EB", borderRadius: "12px", outline: "none", fontSize: "15px", transition: "all 0.3s" }}
                  placeholder="e.g. PLANETS"
                  required={isSignUp}
                />
              </div>
            </>
          )}

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", marginBottom: "8px", color: "#113946", fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "14px", border: "2px solid #E0E3EB", borderRadius: "12px", outline: "none", fontSize: "15px", transition: "all 0.3s" }}
              placeholder="e.g. teacher@alif.com"
              required
            />
          </div>

          <div style={{ marginBottom: "30px" }}>
            <label style={{ display: "block", marginBottom: "8px", color: "#113946", fontWeight: "700", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: "14px", border: "2px solid #E0E3EB", borderRadius: "12px", outline: "none", fontSize: "15px", transition: "all 0.3s" }}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: "100%", padding: "16px", fontSize: "16px" }}
          >
            {loading ? "Please wait..." : (isSignUp ? "Create Account" : "Sign In")}
          </button>
        </form>

        <div style={{ marginTop: "25px", textAlign: "center" }}>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: "none", border: "none", color: "#3366FF", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}
          >
            {isSignUp ? "Already have an account? Sign In" : "Need an account? Sign Up"}
          </button>
        </div>

        <div style={{ marginTop: "30px", textAlign: "center", fontSize: "12px", color: "#888", background: "#fdfbfb", padding: "15px", borderRadius: "8px" }}>
          <p style={{ marginBottom: "5px" }}><strong>Accountant Login:</strong> <code>admin@alif.com</code></p>
          <p><strong>Teacher Login:</strong> Use any other email.</p>
        </div>
      </div>
    </div>
  );
}
