"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { InvoicePreview } from "@/components/InvoicePreview";
import { downloadPDF } from "@/lib/pdf";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

export default function AccountantDashboard() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Filters
  const [filterClass, setFilterClass] = useState("");
  const [filterDate, setFilterDate] = useState("");

  // Hidden preview state for downloading
  const [activeReceipt, setActiveReceipt] = useState<any>(null);
  
  // Modal preview state
  const [previewModalReceipt, setPreviewModalReceipt] = useState<any>(null);

  // Edit state
  const [editReceipt, setEditReceipt] = useState<any>(null);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("receipts")
        .select(`
          *,
          receipt_items (*)
        `)
        .order("created_at", { ascending: false });

      if (filterClass) {
        query = query.ilike("student_class", `%${filterClass}%`);
      }
      if (filterDate) {
        query = query.eq("creation_date", filterDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReceipts(data || []);
    } catch (err: any) {
      console.error(err);
      alert("Error fetching receipts: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/");
      } else {
        fetchReceipts();
      }
    });
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleDownloadSingle = async (receipt: any) => {
    setActiveReceipt(receipt);
    // Wait for state to update and render the hidden preview
    setTimeout(() => {
      downloadPDF(receipt.student_name, receipt.invoice_number, receipt.student_class, "downloadPreview");
    }, 500);
  };

  const handleBulkDownload = async () => {
    if (receipts.length === 0) return;
    
    Swal.fire({
      title: 'Starting Bulk Download',
      text: `Downloading ${receipts.length} receipts... Please allow multiple file downloads in your browser.`,
      icon: 'info',
      timer: 3000,
      showConfirmButton: false
    });
    
    // Sequential download
    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      setActiveReceipt(receipt);
      
      // Wait for render, then download, then wait before next
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          downloadPDF(receipt.student_name, receipt.invoice_number, receipt.student_class, "downloadPreview");
          setTimeout(() => resolve(), 1500); // 1.5s delay between downloads
        }, 500);
      });
    }
    
    alert("Bulk download completed!");
    setActiveReceipt(null);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('receipts').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      setReceipts(receipts.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (err: any) {
      alert("Error updating status: " + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#3366FF',
      confirmButtonText: 'Yes, delete it!'
    });

    if (!result.isConfirmed) return;
    try {
      const { error } = await supabase.from('receipts').delete().eq('id', id);
      if (error) throw error;
      setReceipts(receipts.filter(r => r.id !== id));
      Swal.fire('Deleted!', 'Receipt has been deleted.', 'success');
    } catch (err: any) {
      Swal.fire('Error!', err.message, 'error');
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editReceipt) return;
    try {
      const { error } = await supabase.from('receipts').update({
        student_name: editReceipt.student_name,
        student_class: editReceipt.student_class,
        student_phone: editReceipt.student_phone,
        grand_total: editReceipt.grand_total
      }).eq('id', editReceipt.id);
      
      if (error) throw error;
      Swal.fire({ title: 'Success', text: 'Receipt updated successfully!', icon: 'success', timer: 2000, showConfirmButton: false });
      setEditReceipt(null);
      fetchReceipts();
    } catch (err: any) {
      Swal.fire('Error!', err.message, 'error');
    }
  };
  const handleExportCSV = () => {
    if (receipts.length === 0) return;
    const headers = ["Invoice Number", "Date", "Student Name", "Class", "Phone", "Payment Method", "Total", "Items Summary"];
    const rows = receipts.map(r => [
      r.invoice_number,
      r.creation_date,
      r.student_name,
      r.student_class,
      r.student_phone,
      r.payment_method,
      r.grand_total,
      r.receipt_items?.map((i: any) => `${i.fee_type}(${i.quantity}x${i.price})`).join("; ") || ""
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(e => e.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(","))].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Receipts_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const rows = text.split('\n').map(row => row.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
      // Basic validation: skip header
      const dataRows = rows.slice(1).filter(r => r.length >= 7 && r[0]);
      
      if (dataRows.length === 0) {
        alert("No valid data found in CSV");
        return;
      }

      setLoading(true);
      try {
        for (const row of dataRows) {
          const [invoice, date, name, cls, phone, payMethod, total] = row;
          const { data: receiptData, error: receiptError } = await supabase
            .from('receipts')
            .insert({
              invoice_number: invoice,
              creation_date: date || new Date().toISOString().split('T')[0],
              student_name: name,
              student_class: cls,
              student_phone: phone,
              payment_method: payMethod || 'Cash',
              payment_details: 'Imported via CSV',
              grand_total: parseFloat(total) || 0
            })
            .select()
            .single();
            
          if (receiptData && !receiptError) {
             await supabase.from('receipt_items').insert({
               receipt_id: receiptData.id,
               fee_type: "Imported Fee",
               quantity: 1,
               price: parseFloat(total) || 0,
               total: parseFloat(total) || 0
             });
          }
        }
        alert(`Successfully imported ${dataRows.length} receipts!`);
        fetchReceipts();
      } catch (err: any) {
        console.error(err);
        alert("Error importing: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Analytics Calculations
  const today = new Date().toISOString().split('T')[0];
  const totalToday = receipts
    .filter(r => (r.creation_date || '').startsWith(today))
    .reduce((sum, r) => sum + (Number(r.grand_total) || 0), 0);
    
  const revenueByClass = receipts.reduce((acc, r) => {
    const cls = r.student_class || 'Unknown';
    acc[cls] = (acc[cls] || 0) + (Number(r.grand_total) || 0);
    return acc;
  }, {} as Record<string, number>);

  const last7Days = Array.from({length: 7}).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const trendData = last7Days.map(date => {
    const total = receipts
      .filter(r => (r.creation_date || '').startsWith(date))
      .reduce((sum, r) => sum + (Number(r.grand_total) || 0), 0);
    return { date: date.slice(5), total };
  });
  const maxTrend = Math.max(...trendData.map(d => d.total), 1);

  return (
    <div className="responsive-padding" style={{ padding: "40px", fontFamily: "var(--font-montserrat)" }}>
      <div className="responsive-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <h1 style={{ color: "#113946" }}>Accountant Dashboard</h1>
        <div className="responsive-buttons" style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <button 
            onClick={handleBulkDownload}
            className="btn-success"
          >
            Bulk PDF Download
          </button>
          <button 
            onClick={handleExportCSV}
            className="btn-warning"
          >
            Export CSV
          </button>
          <label className="btn-outline" style={{ margin: 0 }}>
            Import CSV
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
          </label>
          <a 
            href="/teacher"
            className="btn-primary"
            style={{ textDecoration: "none" }}
          >
            + New Bill
          </a>
          <button 
            onClick={handleLogout}
            className="btn-danger"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap" }}>
        {/* Total Today Card */}
        <div style={{ flex: "1", minWidth: "250px", background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
          <h3 style={{ color: "#666", fontSize: "14px", margin: "0 0 10px 0" }}>Total Collected Today</h3>
          <p style={{ color: "#113946", fontSize: "28px", fontWeight: "bold", margin: 0 }}>₹{totalToday.toFixed(2)}</p>
        </div>
        
        {/* Revenue By Class Card */}
        <div style={{ flex: "1.5", minWidth: "300px", background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
          <h3 style={{ color: "#666", fontSize: "14px", margin: "0 0 10px 0" }}>Revenue by Class</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {Object.entries(revenueByClass).map(([cls, total]) => (
              <div key={cls} style={{ background: "#f5f6fa", padding: "8px 12px", borderRadius: "8px", fontSize: "13px" }}>
                <span style={{ fontWeight: "bold", color: "#113946" }}>{cls}</span>: ₹{Number(total).toFixed(2)}
              </div>
            ))}
          </div>
        </div>

        {/* 7-Day Trend Card */}
        <div style={{ flex: "1.5", minWidth: "300px", background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
          <h3 style={{ color: "#666", fontSize: "14px", margin: "0 0 15px 0" }}>7-Day Revenue Trend</h3>
          <div style={{ display: "flex", alignItems: "flex-end", height: "80px", gap: "8px" }}>
            {trendData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                <div style={{ 
                  width: "100%", 
                  height: `${(d.total / maxTrend) * 100}%`, 
                  minHeight: "2px",
                  background: "#3366FF", 
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.3s ease"
                }} title={`₹${d.total}`}></div>
                <span style={{ fontSize: "10px", color: "#888" }}>{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="responsive-card" style={{ background: "white", padding: "20px", borderRadius: "10px", marginBottom: "30px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        <h3 style={{ marginBottom: "15px", color: "#113946" }}>Filters</h3>
        <div className="responsive-filters" style={{ display: "flex", gap: "20px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "14px" }}>Class/Section:</label>
            <input 
              type="text" 
              placeholder="e.g. PLANETS" 
              value={filterClass} 
              onChange={e => setFilterClass(e.target.value)}
              style={{ padding: "10px", borderRadius: "5px", border: "1px solid #ccc" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "5px", fontSize: "14px" }}>Date:</label>
            <input 
              type="date" 
              value={filterDate} 
              onChange={e => setFilterDate(e.target.value)}
              style={{ padding: "10px", borderRadius: "5px", border: "1px solid #ccc" }}
            />
          </div>
          <div className="responsive-buttons" style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
            <button 
              onClick={fetchReceipts}
              className="btn-primary"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      <div className="responsive-card" style={{ background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
        {loading ? (
          <p>Loading receipts...</p>
        ) : receipts.length === 0 ? (
          <p>No receipts found.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f5f6fa", textAlign: "left" }}>
                <th style={{ padding: "12px", borderBottom: "2px solid #E0E3EB" }}>Invoice #</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #E0E3EB" }}>Date</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #E0E3EB" }}>Student Name</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #E0E3EB" }}>Class</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #E0E3EB" }}>Total</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #E0E3EB" }}>Status</th>
                <th style={{ padding: "12px", borderBottom: "2px solid #E0E3EB" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #E0E3EB" }}>
                  <td style={{ padding: "12px" }}>{r.invoice_number}</td>
                  <td style={{ padding: "12px" }}>{formatDate(r.creation_date)}</td>
                  <td style={{ padding: "12px", fontWeight: "bold" }}>{r.student_name}</td>
                  <td style={{ padding: "12px" }}>{r.student_class}</td>
                  <td style={{ padding: "12px" }}>₹{Number(r.grand_total).toFixed(2)}</td>
                  <td style={{ padding: "12px" }}>
                    <select 
                      value={r.status || 'Pending'}
                      onChange={(e) => handleStatusChange(r.id, e.target.value)}
                      style={{ 
                        padding: "6px", 
                        borderRadius: "4px", 
                        border: "1px solid #ccc",
                        background: r.status === 'Verified' ? '#e8f8f5' : r.status === 'Disputed' ? '#fdedec' : '#fcf3cf',
                        color: r.status === 'Verified' ? '#27ae60' : r.status === 'Disputed' ? '#c0392b' : '#f39c12',
                        fontWeight: "bold"
                      }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Verified">Verified</option>
                      <option value="Disputed">Disputed</option>
                    </select>
                  </td>
                  <td style={{ padding: "12px", display: "flex", gap: "10px" }}>
                    <button 
                      onClick={() => setPreviewModalReceipt(r)}
                      className="btn-warning btn-action-small"
                      title="Preview"
                    >
                      👁️
                    </button>
                    <button 
                      onClick={() => handleDownloadSingle(r)}
                      className="btn-primary btn-action-small"
                      title="Download PDF"
                    >
                      📄
                    </button>
                    <button 
                      onClick={() => setEditReceipt({...r})}
                      className="btn-success btn-action-small"
                      title="Edit Basic Info"
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => handleDelete(r.id)}
                      className="btn-danger btn-action-small"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Hidden container for rendering the active receipt for PDF generation */}
      {activeReceipt && (
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <InvoicePreview 
            id="downloadPreview"
            studentName={activeReceipt.student_name}
            studentClass={activeReceipt.student_class}
            studentPhone={activeReceipt.student_phone}
            invoiceNumber={activeReceipt.invoice_number}
            formattedDate={formatDate(activeReceipt.creation_date)}
            derivedItems={activeReceipt.receipt_items.map((item: any) => ({
              ...item,
              description: item.fee_type === 'Other Fee' && item.custom_description 
                ? item.custom_description.toUpperCase()
                : item.period 
                  ? `${item.fee_type} - ${item.period}`.toUpperCase()
                  : item.fee_type.toUpperCase(),
              q: item.quantity,
              p: item.price,
              t: item.tax
            }))}
            grandTotal={activeReceipt.grand_total}
            paymentMethod={activeReceipt.payment_method}
            paymentDetails={activeReceipt.payment_details}
          />
        </div>
      )}

      {/* Visual Preview Modal */}
      {previewModalReceipt && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", overflowY: "auto" }}>
          <div style={{ background: "white", padding: "20px", borderRadius: "10px", width: "90%", maxWidth: "800px", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <button 
              onClick={() => setPreviewModalReceipt(null)}
              style={{ position: "absolute", top: "20px", right: "20px", background: "#ff4444", color: "white", border: "none", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer", fontWeight: "bold" }}
            >
              X
            </button>
            <h2 style={{ marginBottom: "20px" }}>Receipt Preview</h2>
            <div style={{ transform: "scale(0.9)", transformOrigin: "top center" }}>
              <InvoicePreview 
                studentName={previewModalReceipt.student_name}
                studentClass={previewModalReceipt.student_class}
                studentPhone={previewModalReceipt.student_phone}
                invoiceNumber={previewModalReceipt.invoice_number}
                formattedDate={formatDate(previewModalReceipt.creation_date)}
                derivedItems={previewModalReceipt.receipt_items.map((item: any) => ({
                  ...item,
                  description: item.fee_type === 'Other Fee' && item.custom_description 
                    ? item.custom_description.toUpperCase()
                    : item.period 
                      ? `${item.fee_type} - ${item.period}`.toUpperCase()
                      : item.fee_type.toUpperCase(),
                  q: item.quantity,
                  p: item.price,
                  t: item.tax
                }))}
                grandTotal={previewModalReceipt.grand_total}
                paymentMethod={previewModalReceipt.payment_method}
                paymentDetails={previewModalReceipt.payment_details}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editReceipt && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ background: "white", padding: "30px", borderRadius: "12px", width: "90%", maxWidth: "500px", position: "relative" }}>
            <h2 style={{ marginBottom: "20px", color: "#113946" }}>Edit Receipt</h2>
            <form onSubmit={handleEditSave}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Student Name</label>
                <input type="text" value={editReceipt.student_name} onChange={e => setEditReceipt({...editReceipt, student_name: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }} required />
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Class</label>
                <input type="text" value={editReceipt.student_class} onChange={e => setEditReceipt({...editReceipt, student_class: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }} required />
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Phone</label>
                <input type="text" value={editReceipt.student_phone} onChange={e => setEditReceipt({...editReceipt, student_phone: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }} />
              </div>
              <div style={{ marginBottom: "25px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Grand Total</label>
                <input type="number" step="0.01" value={editReceipt.grand_total} onChange={e => setEditReceipt({...editReceipt, grand_total: parseFloat(e.target.value)})} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ccc" }} required />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" onClick={() => setEditReceipt(null)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
