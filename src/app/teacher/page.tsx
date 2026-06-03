"use client";

import React, { useState, useEffect } from "react";
import { InvoicePreview } from "@/components/InvoicePreview";
import { supabase } from "@/lib/supabase";
import { downloadPDF } from "@/lib/pdf";
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
  const [activeReceipt, setActiveReceipt] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  const [items, setItems] = useState([
    {
      id: Date.now(),
      feeType: "",
      period: "",
      customDescription: "",
      quantity: 1,
      price: 0,
      tax: 0,
    },
  ]);

  const fetchRecentData = async (email: string) => {
    try {
      const { data: recent } = await supabase
        .from('receipts')
        .select('*, receipt_items(*)')
        .eq('teacher_email', email)
        .order('created_at', { ascending: false })
        .limit(5);
      if (recent) setRecentSubmissions(recent);

      const { data: allStudents } = await supabase
        .from('receipts')
        .select('student_name, student_class, student_phone')
        .eq('teacher_email', email)
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

  const handleDownloadHistorical = (r: any) => {
    setActiveReceipt(r);
    setTimeout(() => {
      downloadPDF(r.student_name, r.invoice_number, r.student_class, "historicalPreview");
    }, 500);
  };

  const generateNextInvoiceNumber = async () => {
    try {
      // Find the receipt with the highest invoice_number
      // Since it's a string like "B2C100", sorting alphabetically works if prefix is constant and lengths are equal.
      // But to be safer, we can just get all recent ones and find the max numeric part.
      const { data, error } = await supabase
        .from('receipts')
        .select('invoice_number')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        let maxNum = 99; // start slightly below 100
        let prefix = "B2C";
        
        data.forEach(r => {
          const match = r.invoice_number.match(/^([a-zA-Z]+)(\d+)$/);
          if (match) {
            prefix = match[1];
            const num = parseInt(match[2], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        
        setInvoiceNumber(`${prefix}${maxNum + 1}`);
      } else {
        // Fallback for the very first bill
        setInvoiceNumber("B2C100");
      }
    } catch (err) {
      console.error("Error generating invoice number:", err);
      setInvoiceNumber("B2C" + Math.floor(100 + Math.random() * 900));
    }
  };

  useEffect(() => {
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    generateNextInvoiceNumber();
    
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
      { id: Date.now(), feeType: "", period: "", customDescription: "", quantity: 1, price: 0, tax: 0 },
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
    } else if (item.period && (item.feeType === "Monthly Fee" || item.feeType === "Term Fee")) {
      description = `${item.feeType} - ${item.period}`;
    }
    return { ...item, description: description.toUpperCase(), subtotal, taxAmount, total, q, p, t };
  }).filter(i => (i.feeType || i.p > 0) && i.q > 0);

  const grandTotal = derivedItems.reduce((sum, item) => sum + item.total, 0);
  const formattedDate = invoiceDate ? new Date(invoiceDate).toLocaleDateString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }) : "";

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
      // 1. Insert Receipt
      const { data: receiptData, error: receiptError } = await supabase
        .from('receipts')
        .insert({
          invoice_number: invoiceNumber,
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
      
      // 2. Insert Items
      const itemsToInsert = derivedItems.map(item => ({
        receipt_id: receiptData.id,
        fee_type: item.feeType,
        period: item.period,
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
      
      Swal.fire({ title: 'Success!', text: 'Receipt saved successfully!', icon: 'success', timer: 2000, showConfirmButton: false });
      
      // Reset form (or generate new invoice number)
      setStudentName("");
      setStudentClass("");
      setStudentPhone("");
      setPaymentDetails("");
      await generateNextInvoiceNumber();
      setItems([{ id: Date.now(), feeType: "", period: "", customDescription: "", quantity: 1, price: 0, tax: 0 }]);
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
    <>
      <button 
        onClick={handleLogout}
        className="btn-danger"
        style={{ position: "absolute", top: "20px", left: "20px", zIndex: 100 }}
      >
        Logout
      </button>
      <div className="container">
        {/* Form Section */}
        <div className="form-section">
          <h1>Teacher Data Entry</h1>

          {/* Invoice Details */}
          <div className="form-group">
            <h3>Invoice Details</h3>
            <div className="form-row">
              <div className="form-field">
                <label>Invoice Number:</label>
                <input
                  type="text"
                  placeholder="BC3952"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
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
                <label>Class/Section (e.g. PLANETS):</label>
                <input
                  type="text"
                  placeholder="CLASS NAME"
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                />
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
                    <div className="item-field period-field">
                      <label className="period-label">Terms:</label>
                      <select
                        className="item-period"
                        value={item.period}
                        onChange={(e) => handleItemChange(item.id, "period", e.target.value)}
                      >
                        <option value="">Select Term</option>
                        <option value="1st Term">1st Term</option>
                        <option value="2nd Term">2nd Term</option>
                        <option value="3rd Term">3rd Term</option>
                        <option value="4th Term">4th Term</option>
                      </select>
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
              onClick={() => downloadPDF(studentName, invoiceNumber, studentClass)}
            >
              Download PDF
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
                    <th style={{ padding: "10px", borderBottom: "1.5px solid #E0E3EB", color: "#113946" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubmissions.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "10px" }}>{r.invoice_number}</td>
                      <td style={{ padding: "10px", fontWeight: "bold", color: "#113946" }}>{r.student_name}</td>
                      <td style={{ padding: "10px" }}>{r.student_class}</td>
                      <td style={{ padding: "10px", fontWeight: "bold" }}>₹{Number(r.grand_total).toFixed(2)}</td>
                      <td style={{ padding: "10px" }}>
                        <button 
                          onClick={() => handleDownloadHistorical(r)}
                          className="btn-primary btn-action-small"
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Preview Section - Readonly for teacher to review */}
        <div className="preview-section" style={{ opacity: 0.9 }}>
          <h3 style={{ textAlign: "center", marginBottom: "15px" }}>Live Preview</h3>
          <InvoicePreview 
            studentName={studentName}
            studentClass={studentClass}
            studentPhone={studentPhone}
            invoiceNumber={invoiceNumber}
            formattedDate={formattedDate}
            derivedItems={derivedItems}
            grandTotal={grandTotal}
            paymentMethod={paymentMethod}
            paymentDetails={paymentDetails}
          />
        </div>
      </div>
      
      {/* Hidden container for rendering the active historical receipt for PDF generation */}
      {activeReceipt && (
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <InvoicePreview 
            id="historicalPreview"
            studentName={activeReceipt.student_name}
            studentClass={activeReceipt.student_class}
            studentPhone={activeReceipt.student_phone}
            invoiceNumber={activeReceipt.invoice_number}
            formattedDate={activeReceipt.creation_date}
            derivedItems={activeReceipt.receipt_items?.map((item: any) => ({
              ...item,
              description: item.fee_type === 'Other Fee' && item.custom_description 
                ? item.custom_description.toUpperCase()
                : item.period 
                  ? `${item.fee_type} - ${item.period}`.toUpperCase()
                  : item.fee_type.toUpperCase(),
              q: item.quantity,
              p: item.price,
              t: item.tax
            })) || []}
            grandTotal={activeReceipt.grand_total}
            paymentMethod={activeReceipt.payment_method}
            paymentDetails={activeReceipt.payment_details}
          />
        </div>
      )}
    </>
  );
}
