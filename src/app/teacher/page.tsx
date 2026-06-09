"use client";

import React, { useState, useEffect } from "react";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

export default function TeacherEntryPage() {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [studentPhone, setStudentPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [classList, setClassList] = useState<string[]>(["KIDS", "PLANETS", "STARS"]);
  const [defaultTax, setDefaultTax] = useState<number>(18);
  const router = useRouter();

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('payment_details')
        .eq('student_name', '__SYSTEM_CLASSES__')
        .maybeSingle();

      if (data && data.payment_details) {
        const parsed = JSON.parse(data.payment_details);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClassList(parsed);
        }
      }
    } catch (e) {
      console.log("No custom classes found, using defaults", e);
    }
  };

  const fetchTaxSetting = async () => {
    try {
      const { data } = await supabase
        .from('receipts')
        .select('payment_details')
        .eq('student_name', '__SYSTEM_TAX__')
        .maybeSingle();

      if (data?.payment_details) {
        const val = parseFloat(data.payment_details);
        if (!isNaN(val)) {
          setDefaultTax(val);
          setItems(prevItems => prevItems.map(item => ({
            ...item,
            tax: item.tax === 18 ? val : item.tax
          })));
        }
      }
    } catch (e) {
      console.log("No custom tax setting found, using default 18%", e);
    }
  };

  const [items, setItems] = useState([
    {
      id: Date.now(),
      feeType: "",
      period: "",
      termFrom: "",
      termTo: "",
      customDescription: "",
      quantity: 1,
      price: 0,
      tax: 18,
    },
  ]);

  const fetchRecentData = async (email: string) => {
    try {
      const { data: recent } = await supabase
        .from('receipts')
        .select('*, receipt_items(*)')
        .eq('teacher_email', email)
        .neq('student_name', '__SYSTEM_CLASSES__')
        .order('created_at', { ascending: false })
        .limit(5);
      if (recent) setRecentSubmissions(recent);

      const { data: allStudents } = await supabase
        .from('receipts')
        .select('student_name, student_class, student_phone')
        .eq('teacher_email', email)
        .neq('student_name', '__SYSTEM_CLASSES__')
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (allStudents) {
        const unique = Array.from(new Map(allStudents.map(s => [s.student_name.toUpperCase(), s])).values());
        setStudents(unique);
      }
    } catch (err) {
      console.error("Error fetching recent data:", err);
    }
  };


  // Shared helper — fetches whole DB + accountant override, returns { prefix, maxNum, nextInvoice }
  const calcNextInvoice = async () => {
    const { data, error } = await supabase
      .from('receipts')
      .select('invoice_number, student_name, payment_details')
      .neq('student_name', '__SYSTEM_CLASSES__');

    if (error) throw error;

    let maxNum = 99;
    let prefix = "B2C";

    (data || []).forEach(r => {
      // Accountant override row — treat its stored value as the floor
      if (r.student_name === '__INVOICE_COUNTER__') {
        const m = r.payment_details?.match(/^([a-zA-Z0-9]+?)(\d+)$/);
        if (m) {
          const n = parseInt(m[2], 10);
          if (n > maxNum) { maxNum = n; prefix = m[1]; }
        }
        return;
      }
      // Real receipt rows
      const m = r.invoice_number?.match(/^([a-zA-Z0-9]+?)(\d+)$/);
      if (m) {
        const n = parseInt(m[2], 10);
        if (n > maxNum) { maxNum = n; prefix = m[1]; }
      }
    });

    return { prefix, maxNum, nextInvoice: `${prefix}${maxNum + 1}` };
  };

  const generateNextInvoiceNumber = async () => {
    try {
      const { nextInvoice } = await calcNextInvoice();
      setInvoiceNumber(nextInvoice);
    } catch (err) {
      console.error("Error generating invoice number:", err);
      setInvoiceNumber("B2C100");
    }
  };


  useEffect(() => {
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    generateNextInvoiceNumber();
    fetchClasses();
    fetchTaxSetting();
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/");
      } else {
        setUserEmail(session.user.email || null);
        setUserId(session.user.id);
        if (session.user.email) {
          fetchRecentData(session.user.email);
        }
      }
    });
  }, [router]);

  const handleAddItem = () => {
    setItems([
      ...items,
      { id: Date.now(), feeType: "", period: "", termFrom: "", termTo: "", customDescription: "", quantity: 1, price: 0, tax: defaultTax },
    ]);
  };

  const handleRemoveItem = (id: number) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const handleItemChange = (id: number, field: string, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          const newItem = { ...item, [field]: value };
          if (field === "feeType") {
             newItem.period = "";
             newItem.termFrom = "";
             newItem.termTo = "";
             newItem.customDescription = "";
          }
          return newItem;
        }
        return item;
      })
    );
  };

  // Calculations for Preview & DB Save
  const derivedItems = items.map(item => {
    const q = parseFloat(item.quantity.toString()) || 0;
    const p = parseFloat(item.price.toString()) || 0;
    const t = parseFloat(item.tax.toString()) || 0;
    const subtotal = q * p;
    const taxAmount = (subtotal * t) / 100;
    const total = subtotal + taxAmount;
    let description = item.feeType || "Item";
    if (item.feeType === "Other Fee" && item.customDescription) {
      description = item.customDescription;
    } else if (item.feeType === "Term Fee" && item.termFrom && item.termTo) {
      description = `Term Fee - ${item.termFrom} to ${item.termTo}`;
    } else if (item.feeType === "Term Fee" && item.termFrom) {
      description = `Term Fee - From ${item.termFrom}`;
    } else if (item.period && item.feeType === "Monthly Fee") {
      description = `${item.feeType} - ${item.period}`;
    }
    return { ...item, description: description.toUpperCase(), subtotal, taxAmount, total, q, p, t };
  }).filter(i => (i.feeType || i.p > 0) && i.q > 0);

  const grandTotal = derivedItems.reduce((sum, item) => sum + item.total, 0);


  const handleStudentNameChange = (val: string) => {
    setStudentName(val);
    const match = students.find(s => s.student_name.toUpperCase() === val.toUpperCase());
    if (match) {
      if (!studentClass) setStudentClass(match.student_class);
      if (!studentPhone) setStudentPhone(match.student_phone);
    }
  };

  const handleWhatsApp = () => {
    if (!studentPhone) {
      Swal.fire({ title: 'Missing Info', text: 'Please enter a student phone number first.', icon: 'warning', confirmButtonColor: '#3366FF' });
      return;
    }
    const msg = `Hello ${studentName},\n\nYour fee receipt (${invoiceNumber}) for ₹${grandTotal} has been generated.\nThank you!`;
    const url = `https://wa.me/91${studentPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handleSaveToDatabase = async () => {
    if (!studentName || !studentClass || derivedItems.length === 0) {
      Swal.fire({ title: 'Missing Info', text: 'Please fill in Student Name, Class, and add at least one fee item.', icon: 'warning', confirmButtonColor: '#3366FF' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      // 1. Fetch latest invoice numbers dynamically right before saving (includes accountant override)
      const { prefix, maxNum, nextInvoice: finalInvoiceNumber } = await calcNextInvoice();

      // 2. Insert Receipt
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          invoice_number: finalInvoiceNumber,
          creation_date: invoiceDate,
          student_name: studentName,
          student_class: studentClass,
          student_phone: studentPhone,
          payment_method: paymentMethod,
          payment_details: paymentDetails,
          grand_total: grandTotal,
          teacher_email: userEmail,
          teacher_id: userId
        })
        .select()
        .single();
        
      if (receiptError) throw receiptError;
      
      // 3. Insert Items
      const itemsToInsert = derivedItems.map(item => ({
        receipt_id: receiptData.id,
        fee_type: item.feeType,
        period: item.period || (item.feeType === "Term Fee" ? `${item.termFrom} to ${item.termTo}` : ""),
        custom_description: item.customDescription,
        quantity: item.q,
        price: item.p,
        tax: item.t,
        total: item.total
      }));
      
      const { error: itemsError } = await supabase
        .from('receipt_items')
        .insert(itemsToInsert);
        
      if (itemsError) throw itemsError;
      
      Swal.fire({ 
        title: 'Success!', 
        text: `Receipt ${finalInvoiceNumber} saved successfully!`, 
        icon: 'success', 
        timer: 2000, 
        showConfirmButton: false 
      });
      
      // Reset form
      setStudentName("");
      setStudentClass("");
      setStudentPhone("");
      setPaymentDetails("");
      setInvoiceNumber(`${prefix}${maxNum + 2}`); // optimistic next
      setItems([{ id: Date.now(), feeType: "", period: "", termFrom: "", termTo: "", customDescription: "", quantity: 1, price: 0, tax: 0 }]);
      if (userEmail) fetchRecentData(userEmail);
      
    } catch (err: any) {
      console.error(err);
      Swal.fire('Error!', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" }}>

      {/* ── Branded Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 200,
        background: "rgba(15, 32, 39, 0.95)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "70px",
        boxShadow: "0 4px 30px rgba(0,0,0,0.3)"
      }}>
        {/* Left: Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <img 
            src="/logo.png" 
            alt="Alif Logo" 
            style={{
              width: "44px",
              height: "44px",
              objectFit: "contain",
              flexShrink: 0,
              filter: "drop-shadow(0 2px 8px rgba(188,163,127,0.3))"
            }}
            onError={(e) => {
              // fallback if logo fails
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            <div style={{ color: "#EAD7BB", fontWeight: 800, fontSize: "17px", letterSpacing: "0.5px", lineHeight: 1.1 }}>
              ALIF Online Madrassa
            </div>
            <div style={{ color: "rgba(234,215,187,0.55)", fontSize: "11px", fontWeight: 500, letterSpacing: "1.5px", textTransform: "uppercase" }}>
              Fee Receipt Portal
            </div>
          </div>
        </div>


        {/* Center: Page title */}
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: 600, letterSpacing: "2px", textTransform: "uppercase" }}>
          Teacher&nbsp;Data&nbsp;Entry
        </div>

        {/* Right: Teacher badge + Logout */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {userEmail && (
            <div style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "20px", padding: "6px 14px",
              color: "rgba(234,215,187,0.85)", fontSize: "12px", fontWeight: 600,
              display: "flex", alignItems: "center", gap: "7px"
            }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2ecc71", display: "inline-block", boxShadow: "0 0 6px #2ecc71" }} />
              {userEmail}
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,71,87,0.15)", border: "1px solid rgba(255,71,87,0.35)",
              color: "#ff6b6b", borderRadius: "10px", padding: "8px 18px",
              fontWeight: 700, fontSize: "13px", cursor: "pointer",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = "rgba(255,71,87,0.3)"; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = "rgba(255,71,87,0.15)"; }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "36px 20px 60px" }}>

        {/* Page heading strip */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            background: "rgba(188,163,127,0.15)", border: "1px solid rgba(188,163,127,0.3)",
            borderRadius: "30px", padding: "8px 22px", marginBottom: "14px"
          }}>
            <span style={{ color: "#BCA37F", fontSize: "13px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>
              📋 New Fee Receipt
            </span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
            Fill in the details below — invoice number is assigned automatically
          </div>
        </div>

        {/* Card wrapper */}
        <div style={{
          background: "rgba(255,255,255,0.97)",
          borderRadius: "24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          overflow: "hidden"
        }}>
          {/* Card header accent */}
          <div style={{ height: "5px", background: "linear-gradient(90deg, #113946, #BCA37F, #EAD7BB)" }} />

          <div style={{ padding: "40px" }}>


          {/* Invoice Details */}
          <div className="form-group">
            <h3>Invoice Details</h3>
            <div className="form-row">
              <div className="form-field">
                <label>Invoice Number: <span style={{ fontSize: "11px", color: "#888", fontWeight: 400 }}>(auto)</span></label>
                <input
                  type="text"
                  value={invoiceNumber}
                  readOnly
                  style={{ background: "#f0f4ff", cursor: "not-allowed", color: "#3366FF", fontWeight: 700, letterSpacing: "1px" }}
                />
              </div>
              <div className="form-field">
                <label>Creation Date:</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Student Information */}
          <div className="form-group">
            <h3>Student Information</h3>
            <div className="form-row">
              <div className="form-field">
                <label>Student Name:</label>
                <input
                  type="text"
                  list="students-list"
                  placeholder="STUDENT NAME"
                  value={studentName}
                  onChange={(e) => handleStudentNameChange(e.target.value)}
                />
                <datalist id="students-list">
                  {students.map((s, idx) => (
                    <option key={idx} value={s.student_name} />
                  ))}
                </datalist>
              </div>
              <div className="form-field">
                <label>Class/Section:</label>
                <select
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #ccc",
                    background: "white",
                    height: "42px",
                    fontSize: "14px"
                  }}
                >
                  <option value="">Select Class</option>
                  {classList.map((cls, idx) => (
                    <option key={idx} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Phone:</label>
                <input
                  type="text"
                  placeholder="PHONE NUMBER"
                  value={studentPhone}
                  onChange={(e) => setStudentPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div className="form-group">
            <h3>Invoice Items</h3>
            <div id="itemsContainer">
              {items.map((item) => (
                <div className="item-row" key={item.id}>
                  <div className="item-field">
                    <label>Fee Type:</label>
                    <select
                      className="item-description"
                      value={item.feeType}
                      onChange={(e) => handleItemChange(item.id, "feeType", e.target.value)}
                    >
                      <option value="">Select Fee Type</option>
                      <option value="Term Fee">Term Fee</option>
                      <option value="Monthly Fee">Monthly Fee</option>
                      <option value="Book Fee">Book Fee</option>
                      <option value="Admission Fee">Admission Fee</option>
                      <option value="Other Fee">Other Fee</option>
                    </select>
                  </div>

                  {item.feeType === "Monthly Fee" && (
                    <div className="item-field period-field">
                      <label className="period-label">Months:</label>
                      <select
                        className="item-period"
                        value={item.period}
                        onChange={(e) => handleItemChange(item.id, "period", e.target.value)}
                      >
                        <option value="">Select Months</option>
                        <option value="January">January</option>
                        <option value="February">February</option>
                        <option value="March">March</option>
                        <option value="April">April</option>
                        <option value="May">May</option>
                        <option value="June">June</option>
                        <option value="July">July</option>
                        <option value="August">August</option>
                        <option value="September">September</option>
                        <option value="October">October</option>
                        <option value="November">November</option>
                        <option value="December">December</option>
                      </select>
                    </div>
                  )}

                  {item.feeType === "Term Fee" && (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div className="item-field period-field">
                        <label className="period-label">From Month:</label>
                        <select
                          className="item-period"
                          value={item.termFrom}
                          onChange={(e) => handleItemChange(item.id, "termFrom", e.target.value)}
                        >
                          <option value="">Select Month</option>
                          <option value="January">January</option>
                          <option value="February">February</option>
                          <option value="March">March</option>
                          <option value="April">April</option>
                          <option value="May">May</option>
                          <option value="June">June</option>
                          <option value="July">July</option>
                          <option value="August">August</option>
                          <option value="September">September</option>
                          <option value="October">October</option>
                          <option value="November">November</option>
                          <option value="December">December</option>
                        </select>
                      </div>
                      <div className="item-field period-field">
                        <label className="period-label">To Month:</label>
                        <select
                          className="item-period"
                          value={item.termTo}
                          onChange={(e) => handleItemChange(item.id, "termTo", e.target.value)}
                        >
                          <option value="">Select Month</option>
                          <option value="January">January</option>
                          <option value="February">February</option>
                          <option value="March">March</option>
                          <option value="April">April</option>
                          <option value="May">May</option>
                          <option value="June">June</option>
                          <option value="July">July</option>
                          <option value="August">August</option>
                          <option value="September">September</option>
                          <option value="October">October</option>
                          <option value="November">November</option>
                          <option value="December">December</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {item.feeType === "Other Fee" && (
                    <div className="item-field custom-fee-field">
                      <label>Custom Fee Description:</label>
                      <input
                        type="text"
                        className="item-custom-description"
                        placeholder="Enter custom fee description"
                        value={item.customDescription}
                        onChange={(e) => handleItemChange(item.id, "customDescription", e.target.value)}
                      />
                    </div>
                  )}

                  <div className="item-field">
                    <label>Quantity:</label>
                    <input
                      type="number"
                      className="item-quantity"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="item-field">
                    <label>Unit Price (₹):</label>
                    <input
                      type="number"
                      className="item-price"
                      placeholder="500.00"
                      step="0.1"
                      value={item.price}
                      onChange={(e) => handleItemChange(item.id, "price", e.target.value)}
                    />
                  </div>
                  <div className="item-field">
                    <label>Tax (%):</label>
                    <input
                      type="number"
                      className="item-tax"
                      placeholder="18"
                      step="0.1"
                      value={item.tax}
                      onChange={(e) => handleItemChange(item.id, "tax", e.target.value)}
                    />
                  </div>
                  {items.length > 1 && (
                    <button type="button" className="remove-item" onClick={() => handleRemoveItem(item.id)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" id="addItem" className="btn-outline" style={{ marginTop: "10px" }} onClick={handleAddItem}>
              + Add Another Item
            </button>
          </div>

          {/* Payment Method */}
          <div className="form-group">
            <h3>Payment Method</h3>
            <div className="form-row">
              <div className="form-field">
                <label>Payment Method:</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Card">Card</option>
                </select>
              </div>
              <div className="form-field">
                <label>
                  {paymentMethod === "UPI" ? "UPI Transaction ID:" : 
                   paymentMethod === "Bank Transfer" ? "Bank Reference Number:" : 
                   "Payment Details:"}
                </label>
                <input
                  type="text"
                  placeholder="Enter payment details"
                  id="paymentDetails"
                  value={paymentDetails}
                  onChange={(e) => setPaymentDetails(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="responsive-buttons" style={{ display: "flex", gap: "15px", marginTop: "30px", flexWrap: "wrap" }}>
            <button 
              type="button" 
              className="btn-success responsive-full-width-btn"
              onClick={handleSaveToDatabase}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save to Database"}
            </button>

            <button 
              type="button" 
              className="btn-primary responsive-full-width-btn"
              style={{ background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)", boxShadow: "0 4px 15px rgba(37,211,102,0.3)" }}
              onClick={handleWhatsApp}
            >
              Share on WhatsApp
            </button>
          </div>

          {/* Recent Submissions */}
          <div className="form-group" style={{ marginTop: "40px" }}>
            <h3>My Recent Submissions</h3>
            {recentSubmissions.length === 0 ? (
              <p style={{ fontSize: "14px", color: "#666" }}>No recent submissions.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f5f6fa", textAlign: "left" }}>
                    <th style={{ padding: "10px", borderBottom: "1.5px solid #E0E3EB", color: "#113946" }}>Inv #</th>
                    <th style={{ padding: "10px", borderBottom: "1.5px solid #E0E3EB", color: "#113946" }}>Name</th>
                    <th style={{ padding: "10px", borderBottom: "1.5px solid #E0E3EB", color: "#113946" }}>Class</th>
                    <th style={{ padding: "10px", borderBottom: "1.5px solid #E0E3EB", color: "#113946" }}>Total</th>

                  </tr>
                </thead>
                <tbody>
                  {recentSubmissions.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "10px" }}>{r.invoice_number}</td>
                      <td style={{ padding: "10px", fontWeight: "bold", color: "#113946" }}>{r.student_name}</td>
                      <td style={{ padding: "10px" }}>{r.student_class}</td>
                      <td style={{ padding: "10px", fontWeight: "bold" }}>₹{Number(r.grand_total).toFixed(2)}</td>

                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
