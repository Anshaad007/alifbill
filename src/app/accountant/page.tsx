"use client";
 
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { InvoicePreview } from "@/components/InvoicePreview";
import { downloadPDF, getPDFBlob } from "@/lib/pdf";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import JSZip from "jszip";

export default function AccountantDashboard() {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Filters
  const [filterClass, setFilterClass] = useState("");
  const [filterStudentName, setFilterStudentName] = useState("");
  const [filterInvoiceNumber, setFilterInvoiceNumber] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");


  // Hidden preview state for downloading
  const [activeReceipt, setActiveReceipt] = useState<any>(null);
  
  // Modal preview state
  const [previewModalReceipt, setPreviewModalReceipt] = useState<any>(null);

  // Edit state
  const [editReceipt, setEditReceipt] = useState<any>(null);

  // Analytics Panel modal states
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<"day" | "week" | "month" | "year">("week");

  
  // Custom class management
  const [classList, setClassList] = useState<string[]>(["KIDS", "PLANETS", "STARS"]);
  const [newClassName, setNewClassName] = useState("");

  // Global tax percentage configuration
  const [taxRate, setTaxRate] = useState<number>(18);
  const [taxInput, setTaxInput] = useState<string>("18");

  // Invoice counter override
  const [invoiceCounterInput, setInvoiceCounterInput] = useState("");
  const [currentCounter, setCurrentCounter] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>("admin@alif.com");

  const parseLocalDateComponents = (dateStr: string) => {
    if (!dateStr) return { year: 0, month: 0, day: 0 };
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length < 3) return { year: 0, month: 0, day: 0 };
    return {
      year: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10) - 1, // 0-indexed
      day: parseInt(parts[2], 10)
    };
  };

  const getAnalyticsData = () => {
    const now = new Date();
    let labels: string[] = [];
    let datasets: number[] = [];
    
    const getLocalYYYYMMDD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${date}`;
    };

    if (analyticsTimeframe === "day") {
      const hours = [8, 10, 12, 14, 16, 18, 20, 22];
      labels = hours.map(h => `${String(h).padStart(2, '0')}:00`);
      const todayStr = getLocalYYYYMMDD(now);
      const todayReceipts = receipts.filter(r => (r.creation_date || '').startsWith(todayStr));
      
      datasets = hours.map((hour, idx) => {
        return todayReceipts
          .filter(r => {
            const timePart = r.created_at ? new Date(r.created_at) : null;
            if (!timePart) return false;
            const h = timePart.getHours();
            const nextHour = hours[idx + 1] || 24;
            return h >= hour && h < nextHour;
          })
          .reduce((sum, r) => sum + (Number(r.grand_total) || 0), 0);
      });
    } else if (analyticsTimeframe === "week") {
      const days = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d;
      }).reverse();
      
      labels = days.map(d => {
        const dayLabel = d.toLocaleDateString("en-US", { weekday: 'short' });
        const dateLabel = d.toLocaleDateString("en-US", { day: '2-digit', month: '2-digit' });
        return `${dayLabel} (${dateLabel})`;
      });
      datasets = days.map(d => {
        const dateStr = getLocalYYYYMMDD(d);
        return receipts
          .filter(r => (r.creation_date || '').startsWith(dateStr))
          .reduce((sum, r) => sum + (Number(r.grand_total) || 0), 0);
      });
    } else if (analyticsTimeframe === "month") {
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      labels = [0, 1, 2, 3].map(idx => {
        const startDay = idx * 7 + 1;
        const endDay = idx === 3 ? new Date(currentYear, currentMonth + 1, 0).getDate() : (idx + 1) * 7;
        const pad = (n: number) => String(n).padStart(2, '0');
        const monthNum = pad(currentMonth + 1);
        return `W${idx+1} (${pad(startDay)}/${monthNum}-${pad(endDay)}/${monthNum})`;
      });

      const monthReceipts = receipts.filter(r => {
        const { year, month } = parseLocalDateComponents(r.creation_date);
        return year === currentYear && month === currentMonth;
      });
      
      datasets = [0, 0, 0, 0].map((_, idx) => {
        const startDay = idx * 7 + 1;
        const endDay = idx === 3 ? 31 : (idx + 1) * 7;
        return monthReceipts
          .filter(r => {
            const { day } = parseLocalDateComponents(r.creation_date);
            return day >= startDay && day <= endDay;
          })
          .reduce((sum, r) => sum + (Number(r.grand_total) || 0), 0);
      });
    } else if (analyticsTimeframe === "year") {
      const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentYear = now.getFullYear();
      labels = monthsShort.map(m => `${m} ${currentYear}`);
      
      datasets = monthsShort.map((_, monthIdx) => {
        return receipts
          .filter(r => {
            const { year, month } = parseLocalDateComponents(r.creation_date);
            return year === currentYear && month === monthIdx;
          })
          .reduce((sum, r) => sum + (Number(r.grand_total) || 0), 0);
      });
    }
    
    const classBreakdown: { [key: string]: number } = {};
    classList.forEach(cls => {
      classBreakdown[cls] = 0;
    });
    receipts.forEach(r => {
      const clsName = r.student_class || "UNKNOWN";
      if (classBreakdown[clsName] === undefined) {
        classBreakdown[clsName] = 0;
      }
      classBreakdown[clsName] += Number(r.grand_total) || 0;
    });
    
    return { labels, datasets, classBreakdown };
  };



  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('student_name', '__SYSTEM_CLASSES__')
        .maybeSingle();

      if (data && data.payment_details) {
        const parsed = JSON.parse(data.payment_details);
        if (Array.isArray(parsed)) {
          setClassList(parsed);
        }
      }
    } catch (err) {
      console.error("Error fetching classes:", err);
    }
  };

  const saveClasses = async (list: string[]) => {
    try {
      const { data: existing } = await supabase
        .from('receipts')
        .select('id')
        .eq('student_name', '__SYSTEM_CLASSES__')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('receipts')
          .update({ payment_details: JSON.stringify(list) })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('receipts')
          .insert({
            student_name: '__SYSTEM_CLASSES__',
            invoice_number: 'CONFIG',
            creation_date: new Date().toISOString().split('T')[0],
            student_class: 'SYSTEM',
            grand_total: 0,
            payment_method: 'SYSTEM',
            payment_details: JSON.stringify(list)
          });
        if (error) throw error;
      }
      setClassList(list);
      Swal.fire({ title: 'Success', text: 'Classes updated successfully!', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire('Error!', err.message, 'error');
    }
  };

  const handleAddClass = async () => {
    const cleaned = newClassName.trim().toUpperCase();
    if (!cleaned) return;
    const updated = [...classList, cleaned];
    const unique = Array.from(new Set(updated));
    await saveClasses(unique);
    setNewClassName("");
  };

  const handleRemoveClass = async (clsToRemove: string) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Delete class ${clsToRemove}? This won't affect past receipts, but teachers won't be able to select it for new receipts.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ff4444',
      cancelButtonColor: '#3366FF',
      confirmButtonText: 'Yes, delete it!'
    });
    if (!result.isConfirmed) return;
    
    const updated = classList.filter(c => c !== clsToRemove);
    await saveClasses(updated);
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
          setTaxRate(val);
          setTaxInput(data.payment_details);
        }
      }
    } catch (e) {
      console.error("Failed to fetch tax rate:", e);
    }
  };

  const handleUpdateTax = async () => {
    const val = parseFloat(taxInput.trim());
    if (isNaN(val) || val < 0 || val > 100) {
      Swal.fire('Invalid Tax Rate', 'Please enter a percentage between 0 and 100.', 'warning');
      return;
    }
    try {
      const { data: existing } = await supabase
        .from('receipts')
        .select('id')
        .eq('student_name', '__SYSTEM_TAX__')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('receipts')
          .update({ payment_details: taxInput.trim() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('receipts')
          .insert({
            student_name: '__SYSTEM_TAX__',
            invoice_number: 'CONFIG_TAX',
            creation_date: new Date().toISOString().split('T')[0],
            student_class: 'SYSTEM',
            grand_total: 0,
            payment_method: 'SYSTEM',
            payment_details: taxInput.trim()
          });
        if (error) throw error;
      }
      setTaxRate(val);
      Swal.fire({
        title: 'Tax Rate Saved!',
        text: `Default tax rate updated successfully to ${val}%`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire('Error', 'Failed to save tax setting: ' + err.message, 'error');
    }
  };

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("receipts")
        .select(`
          *,
          receipt_items (*)
        `)
        .neq('student_name', '__SYSTEM_CLASSES__')
        .neq('student_name', '__INVOICE_COUNTER__')
        .order("created_at", { ascending: false });

      if (filterClass) {
        query = query.eq("student_class", filterClass);
      }
      if (filterStudentName) {
        query = query.ilike("student_name", `%${filterStudentName.trim()}%`);
      }
      if (filterInvoiceNumber) {
        query = query.ilike("invoice_number", `%${filterInvoiceNumber.trim()}%`);
      }
      if (filterPaymentMethod) {
        query = query.eq("payment_method", filterPaymentMethod);
      }
      if (filterDateFrom) {
        query = query.gte("creation_date", filterDateFrom);
      }
      if (filterDateTo) {
        query = query.lte("creation_date", filterDateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReceipts(data || []);
    } catch (err: any) {
      console.error(err);
      Swal.fire("Error", "Error fetching receipts: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setFilterClass("");
    setFilterStudentName("");
    setFilterInvoiceNumber("");
    setFilterPaymentMethod("");
    setFilterDateFrom("");
    setFilterDateTo("");
    // Trigger fetch after state reset
    setTimeout(() => {
      // In React, setting state is asynchronous. To ensure the query runs with the empty states:
      supabase
        .from("receipts")
        .select(`
          *,
          receipt_items (*)
        `)
        .neq('student_name', '__SYSTEM_CLASSES__')
        .neq('student_name', '__INVOICE_COUNTER__')
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setReceipts(data);
          }
        });
    }, 50);
  };

  const fetchInvoiceCounter = async () => {
    try {
      const { data } = await supabase
        .from('receipts')
        .select('payment_details')
        .eq('student_name', '__INVOICE_COUNTER__')
        .maybeSingle();
      if (data?.payment_details) {
        setCurrentCounter(data.payment_details);
        setInvoiceCounterInput(data.payment_details);
      }
    } catch (e) { console.error(e); }
  };

  const handleSetInvoiceCounter = async () => {
    const val = invoiceCounterInput.trim().toUpperCase();
    if (!val) return;
    // Validate format: letters then digits e.g. B2C157
    if (!/^[a-zA-Z0-9]+?\d+$/.test(val)) {
      Swal.fire({ title: 'Invalid Format', text: 'Enter a valid invoice number like B2C157', icon: 'warning', confirmButtonColor: '#3366FF' });
      return;
    }
    try {
      const { data: existing } = await supabase
        .from('receipts')
        .select('id')
        .eq('student_name', '__INVOICE_COUNTER__')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from('receipts')
          .update({ payment_details: val })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('receipts').insert({
          student_name: '__INVOICE_COUNTER__',
          invoice_number: 'COUNTER',
          creation_date: new Date().toISOString().split('T')[0],
          student_class: 'SYSTEM',
          grand_total: 0,
          payment_method: 'SYSTEM',
          payment_details: val
        });
        if (error) throw error;
      }
      setCurrentCounter(val);
      Swal.fire({ 
        title: '✅ Counter Set!', 
        html: `Invoice counter set to <b>${val}</b>.<br>Teachers will see <b>${val.replace(/\d+$/, m => String(parseInt(m)+1))}</b> as the next invoice.`,
        icon: 'success', 
        timer: 3000, 
        showConfirmButton: false 
      });
    } catch (err: any) {
      Swal.fire('Error!', err.message, 'error');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/");
      } else {
        if (session.user?.email) {
          setUserEmail(session.user.email);
        }
        fetchReceipts();
        fetchClasses();
        fetchInvoiceCounter();
        fetchTaxSetting();
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
    const classOptionsHtml = classList
      .map(cls => `<option value="${cls}">${cls}</option>`)
      .join('');

    const { value: formValues } = await Swal.fire({
      title: 'Bulk PDF Download Options',
      html: `
        <div style="text-align: left; font-family: var(--font-montserrat);">
          <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom: 5px; font-weight: bold; font-size: 14px; color: #333;">Select Class:</label>
            <select id="swal-bulk-class" class="swal2-input" style="width: 100%; margin: 0; box-sizing: border-box; height: 42px;">
              <option value="">All Classes</option>
              ${classOptionsHtml}
            </select>
          </div>

          <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom: 5px; font-weight: bold; font-size: 14px; color: #333;">From Date:</label>
            <input type="date" id="swal-bulk-from-date" class="swal2-input" style="width: 100%; margin: 0; box-sizing: border-box; height: 42px;">
          </div>

          <div style="margin-bottom: 15px;">
            <label style="display:block; margin-bottom: 5px; font-weight: bold; font-size: 14px; color: #333;">To Date:</label>
            <input type="date" id="swal-bulk-to-date" class="swal2-input" style="width: 100%; margin: 0; box-sizing: border-box; height: 42px;">
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Download PDFs',
      confirmButtonColor: '#3366FF',
      cancelButtonColor: '#ff4444',
      preConfirm: () => {
        const selectedClass = (document.getElementById('swal-bulk-class') as HTMLSelectElement).value;
        const fromDate = (document.getElementById('swal-bulk-from-date') as HTMLInputElement).value;
        const toDate = (document.getElementById('swal-bulk-to-date') as HTMLInputElement).value;
        return { selectedClass, fromDate, toDate };
      }
    });

    if (!formValues) return;

    const { selectedClass, fromDate, toDate } = formValues;

    Swal.fire({
      title: 'Preparing Receipts',
      text: 'Searching database for matching records...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      let query = supabase
        .from('receipts')
        .select('*, receipt_items(*)')
        .neq('student_name', '__SYSTEM_CLASSES__')
        .neq('student_name', '__INVOICE_COUNTER__');

      if (selectedClass) {
        query = query.eq('student_class', selectedClass);
      }
      if (fromDate) {
        query = query.gte('creation_date', fromDate);
      }
      if (toDate) {
        query = query.lte('creation_date', toDate);
      }

      const { data: targetReceipts, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      if (!targetReceipts || targetReceipts.length === 0) {
        Swal.fire({
          title: 'No Receipts Found',
          text: 'No receipts match your selected filters.',
          icon: 'info',
          confirmButtonColor: '#3366FF'
        });
        return;
      }

      Swal.fire({
        title: 'Preparing ZIP',
        text: 'Initializing PDF generator...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const zip = new JSZip();

      for (let i = 0; i < targetReceipts.length; i++) {
        const receipt = targetReceipts[i];
        
        Swal.update({
          title: 'Generating PDFs',
          text: `Processing receipt ${i + 1} of ${targetReceipts.length}: ${receipt.student_name}...`
        });

        setActiveReceipt(receipt);
        
        // Give time for layout update
        await new Promise<void>((resolve) => setTimeout(resolve, 400));

        try {
          const blob = await getPDFBlob("downloadPreview");
          const cleanName = (receipt.student_name || "student").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
          const cleanClass = (receipt.student_class || "class").replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
          const invoiceFileName = `${cleanName}_${cleanClass}_${receipt.invoice_number}.pdf`;
          
          zip.file(invoiceFileName, blob);
        } catch (pdfErr) {
          console.error(`Failed to generate PDF for invoice ${receipt.invoice_number}:`, pdfErr);
        }
      }

      Swal.update({
        title: 'Archiving ZIP',
        text: 'Bundling receipt files... Please wait.'
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const dateSuffix = new Date().toISOString().split('T')[0];
      const zipFileName = `${selectedClass || 'All_Classes'}_${fromDate || 'start'}_to_${toDate || dateSuffix}.zip`.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", zipFileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      Swal.fire({
        title: 'Completed!',
        text: `All ${targetReceipts.length} receipts packaged and downloaded successfully inside ZIP: ${zipFileName}`,
        icon: 'success',
        confirmButtonColor: '#3366FF'
      });
      
    } catch (err: any) {
      console.error(err);
      Swal.fire('Error', 'Failed to perform bulk download: ' + err.message, 'error');
    } finally {
      setActiveReceipt(null);
    }
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
        invoice_number: editReceipt.invoice_number,
        creation_date: editReceipt.creation_date,
        student_name: editReceipt.student_name,
        student_class: editReceipt.student_class,
        student_phone: editReceipt.student_phone,
        grand_total: editReceipt.grand_total,
        payment_method: editReceipt.payment_method,
        payment_details: editReceipt.payment_details
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
    if (receipts.length === 0) {
      Swal.fire('No Data', 'There are no receipts to export.', 'info');
      return;
    }
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
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.map(item => `"${String(item || '').replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Receipts_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
      title: 'CSV Exported!',
      text: `Exported ${receipts.length} receipts successfully.`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    });
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const parseCSV = (data: string) => {
        const lines: string[][] = [];
        let row: string[] = [];
        let inQuotes = false;
        let currentValue = '';

        for (let i = 0; i < data.length; i++) {
          const char = data[i];
          const nextChar = data[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentValue += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            row.push(currentValue.trim());
            currentValue = '';
          } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
              i++;
            }
            row.push(currentValue.trim());
            if (row.length > 0 && row.some(cell => cell !== '')) {
              lines.push(row);
            }
            row = [];
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        if (currentValue || row.length > 0) {
          row.push(currentValue.trim());
          if (row.some(cell => cell !== '')) {
            lines.push(row);
          }
        }
        return lines;
      };

      const parsedRows = parseCSV(text);
      if (parsedRows.length <= 1) {
        Swal.fire('Error', 'The CSV file is empty or has no data rows.', 'error');
        return;
      }

      const headers = parsedRows[0];
      const dataRows = parsedRows.slice(1);

      Swal.fire({
        title: 'Importing Receipts',
        text: `Processing ${dataRows.length} receipts... Please wait.`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      setLoading(true);
      let successCount = 0;
      let failCount = 0;

      try {
        for (const row of dataRows) {
          if (row.length < 7 || !row[0]) {
            failCount++;
            continue;
          }

          const [invoice, date, name, cls, phone, payMethod, total, itemsSummary] = row;

          const parsedItems: { fee_type: string; quantity: number; price: number; total: number }[] = [];
          if (itemsSummary && itemsSummary.trim()) {
            const itemStrings = itemsSummary.split(';');
            for (const itemStr of itemStrings) {
              const trimmed = itemStr.trim();
              if (!trimmed) continue;
              const match = trimmed.match(/^([^(]+)\((\d+)x([\d.]+)\)$/);
              if (match) {
                const fee_type = match[1].trim();
                const quantity = parseInt(match[2], 10) || 1;
                const price = parseFloat(match[3]) || 0;
                parsedItems.push({
                  fee_type,
                  quantity,
                  price,
                  total: quantity * price
                });
              }
            }
          }

          if (parsedItems.length === 0) {
            parsedItems.push({
              fee_type: "Imported Fee",
              quantity: 1,
              price: parseFloat(total) || 0,
              total: parseFloat(total) || 0
            });
          }

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

          if (receiptError) {
            console.error('Receipt Insert Error:', receiptError);
            failCount++;
            continue;
          }

          if (receiptData) {
            let itemErrors = false;
            for (const item of parsedItems) {
              const { error: itemError } = await supabase
                .from('receipt_items')
                .insert({
                  receipt_id: receiptData.id,
                  fee_type: item.fee_type,
                  quantity: item.quantity,
                  price: item.price,
                  total: item.total
                });
              if (itemError) {
                console.error('Item Insert Error:', itemError);
                itemErrors = true;
              }
            }
            if (itemErrors) {
              failCount++;
            } else {
              successCount++;
            }
          } else {
            failCount++;
          }
        }

        Swal.fire({
          title: 'Import Completed',
          html: `Successfully imported <b>${successCount}</b> receipts.<br>Failed: <b>${failCount}</b>.`,
          icon: successCount > 0 ? 'success' : 'error',
          confirmButtonColor: '#3366FF'
        });
        
        fetchReceipts();
      } catch (err: any) {
        console.error(err);
        Swal.fire('Error', 'Failed to import CSV: ' + err.message, 'error');
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
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)", paddingBottom: "60px", fontFamily: "var(--font-montserrat)" }}>
      
      {/* ── Branded Header ── */}
      <header className="dashboard-header" style={{
        position: "sticky", top: 0, zIndex: 200,
        background: "rgba(15, 32, 39, 0.95)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "0 32px",
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
              e.currentTarget.style.display = 'none';
            }}
          />
          <div>
            <div style={{ color: "#EAD7BB", fontWeight: 800, fontSize: "17px", letterSpacing: "0.5px", lineHeight: 1.1 }}>
              ALIF Online Madrassa
            </div>
            <div style={{ color: "rgba(234,215,187,0.55)", fontSize: "11px", fontWeight: 500, letterSpacing: "1.5px", textTransform: "uppercase" }}>
              Accountant Dashboard
            </div>
          </div>
        </div>

        {/* Right: Actions & Logged-in badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={() => setShowAnalyticsModal(true)}
            style={{
              background: "rgba(51, 102, 255, 0.2)",
              border: "1px solid rgba(51, 102, 255, 0.4)",
              color: "#7fa0ff",
              borderRadius: "10px",
              padding: "8px 18px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = "rgba(51, 102, 255, 0.35)"; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = "rgba(51, 102, 255, 0.2)"; }}
          >
            📊 Analytics Reports
          </button>

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

      {/* ── Main Content Container ── */}
      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "30px 20px" }}>

        {/* ── Action Toolbar Strip ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: "30px", flexWrap: "wrap", gap: "15px",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          padding: "15px 25px", borderRadius: "16px"
        }}>
          <div style={{ color: "white", fontSize: "18px", fontWeight: 700 }}>
            Quick Management Tools
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {/* Invoice Counter Controller */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(234, 215, 187, 0.35)",
              borderRadius: "10px",
              padding: "5px 12px",
              marginRight: "5px"
            }}>
              <span style={{ fontSize: "12px", color: "#EAD7BB", fontWeight: 700 }}>
                Counter Floor: <b style={{ color: "#fff" }}>{currentCounter || "None"}</b>
              </span>
              <input 
                type="text"
                placeholder="Set Floor"
                value={invoiceCounterInput}
                onChange={e => setInvoiceCounterInput(e.target.value.toUpperCase())}
                style={{
                  width: "80px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(0,0,0,0.3)",
                  color: "#fff",
                  fontWeight: 700,
                  outline: "none",
                  textAlign: "center"
                }}
              />
              <button 
                onClick={handleSetInvoiceCounter}
                className="btn-success"
                style={{
                  padding: "5px 10px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Set
              </button>
            </div>

            <button 
              onClick={handleBulkDownload}
              className="btn-success"
              style={{ padding: "10px 20px", fontSize: "13px" }}
            >
              Bulk PDF Download
            </button>
            <button 
              onClick={handleExportCSV}
              className="btn-warning"
              style={{ padding: "10px 20px", fontSize: "13px" }}
            >
              Export CSV
            </button>
            <label className="btn-outline" style={{ margin: 0, padding: "10px 20px", fontSize: "13px", color: "white", borderColor: "rgba(255,255,255,0.3)", cursor: "pointer" }}>
              Import CSV
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
            </label>
            <a 
              href="/teacher"
              className="btn-primary"
              style={{ textDecoration: "none", padding: "10px 20px", fontSize: "13px", height: "auto" }}
            >
              + New Bill
            </a>
          </div>
        </div>


      {/* Analytics Dashboard */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap" }}>
        {/* Total Today Card */}
        <div style={{
          flex: "1", minWidth: "250px",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(12px)",
          padding: "25px", borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}>
          <h3 style={{ color: "rgba(234, 215, 187, 0.7)", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 10px 0" }}>Total Collected Today</h3>
          <p style={{ color: "#ffffff", fontSize: "28px", fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>₹{totalToday.toFixed(2)}</p>
        </div>
        
        {/* Revenue By Class Card */}
        <div style={{
          flex: "1.5", minWidth: "300px",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(12px)",
          padding: "25px", borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}>
          <h3 style={{ color: "rgba(234, 215, 187, 0.7)", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 10px 0" }}>Revenue by Class</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {Object.entries(revenueByClass).map(([cls, total]) => (
              <div key={cls} style={{
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                padding: "8px 14px", borderRadius: "8px", fontSize: "12px",
                color: "#ffffff"
              }}>
                <span style={{ fontWeight: "bold", color: "#EAD7BB" }}>{cls}</span>: ₹{Number(total).toFixed(2)}
              </div>
            ))}
          </div>
        </div>

        {/* 7-Day Trend Card */}
        <div style={{
          flex: "1.5", minWidth: "300px",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(12px)",
          padding: "25px", borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}>
          <h3 style={{ color: "rgba(234, 215, 187, 0.7)", fontSize: "13px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 15px 0" }}>7-Day Revenue Trend</h3>
          <div style={{ display: "flex", alignItems: "flex-end", height: "80px", gap: "10px" }}>
            {trendData.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <div style={{ 
                  width: "100%", 
                  height: `${(d.total / maxTrend) * 100}%`, 
                  minHeight: "4px",
                  background: "linear-gradient(180deg, #3366FF 0%, #00F5D4 100%)", 
                  borderRadius: "4px 4px 0 0",
                  boxShadow: "0 2px 10px rgba(0,245,212,0.3)",
                  transition: "height 0.3s ease"
                }} title={`₹${d.total}`}></div>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontWeight: "bold" }}>{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap" }}>
        {/* Filters Card */}
        <div className="responsive-card" style={{
          flex: "2", minWidth: "400px",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(12px)",
          padding: "20px", borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}>
          <h3 style={{ marginBottom: "20px", color: "#EAD7BB", fontSize: "16px", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "10px" }}>Search & Filter Receipts</h3>
          <div className="responsive-filters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "15px", marginBottom: "15px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Class/Section:</label>
              <select 
                value={filterClass} 
                onChange={e => setFilterClass(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", fontSize: "14px", height: "42px", outline: "none" }}
              >
                <option value="" style={{ color: "#113946" }}>All Classes</option>
                {classList.map((cls, idx) => (
                  <option key={idx} value={cls} style={{ color: "#113946" }}>{cls}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Student Name:</label>
              <input 
                type="text" 
                placeholder="Search name..." 
                value={filterStudentName} 
                onChange={e => setFilterStudentName(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", fontSize: "14px", height: "42px", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Invoice Number:</label>
              <input 
                type="text" 
                placeholder="Search invoice..." 
                value={filterInvoiceNumber} 
                onChange={e => setFilterInvoiceNumber(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", fontSize: "14px", height: "42px", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment Method:</label>
              <select 
                value={filterPaymentMethod} 
                onChange={e => setFilterPaymentMethod(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", fontSize: "14px", height: "42px", outline: "none" }}
              >
                <option value="" style={{ color: "#113946" }}>All Methods</option>
                <option value="UPI" style={{ color: "#113946" }}>UPI</option>
                <option value="Cash" style={{ color: "#113946" }}>Cash</option>
                <option value="Bank Transfer" style={{ color: "#113946" }}>Bank Transfer</option>
                <option value="Cheque" style={{ color: "#113946" }}>Cheque</option>
                <option value="Card" style={{ color: "#113946" }}>Card</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>From Date:</label>
              <input 
                type="date" 
                value={filterDateFrom} 
                onChange={e => setFilterDateFrom(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", fontSize: "14px", height: "42px", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>To Date:</label>
              <input 
                type="date" 
                value={filterDateTo} 
                onChange={e => setFilterDateTo(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", fontSize: "14px", height: "42px", outline: "none" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "15px" }}>
            <button 
              onClick={handleResetFilters}
              className="btn-outline"
              style={{ padding: "10px 22px", borderRadius: "8px", cursor: "pointer", fontSize: "14px", border: "1px solid rgba(255, 255, 255, 0.25)", background: "none", color: "white" }}
            >
              Reset Filters
            </button>
            <button 
              onClick={fetchReceipts}
              className="btn-primary"
              style={{ padding: "10px 25px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}
            >
              Apply Filters
            </button>
          </div>
        </div>


        {/* Manage Classes Card */}
        <div className="responsive-card" style={{
          flex: "1", minWidth: "300px",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(12px)",
          padding: "20px", borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}>
          <h3 style={{ marginBottom: "20px", color: "#EAD7BB", fontSize: "16px", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "10px" }}>Manage Classes</h3>
          <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
            <input 
              type="text" 
              placeholder="NEW CLASS NAME" 
              value={newClassName} 
              onChange={e => setNewClassName(e.target.value)}
              style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", flex: 1, textTransform: "uppercase", outline: "none" }}
            />
            <button onClick={handleAddClass} className="btn-primary" style={{ whiteSpace: "nowrap", borderRadius: "8px" }}>
              + Add Class
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "120px", overflowY: "auto", padding: "8px", border: "1px solid rgba(255, 255, 255, 0.08)", background: "rgba(0, 0, 0, 0.15)", borderRadius: "8px" }}>
            {classList.length === 0 ? (
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>No classes defined.</span>
            ) : (
              classList.map((cls, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "rgba(51, 102, 255, 0.15)",
                  border: "1px solid rgba(51, 102, 255, 0.35)",
                  padding: "5px 12px", borderRadius: "8px", fontSize: "12px",
                  fontWeight: "bold", color: "#7fa0ff"
                }}>
                  <span>{cls}</span>
                  <button onClick={() => handleRemoveClass(cls)} style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer", fontWeight: "bold", padding: "0 2px", fontSize: "14px" }}>×</button>
                </div>
              ))
            )}
          </div>

          {/* Tax Setting Section */}
          <h3 style={{ marginTop: "24px", marginBottom: "16px", color: "#EAD7BB", fontSize: "16px", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "10px" }}>Default Tax Setting</h3>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input 
                type="number" 
                placeholder="18" 
                value={taxInput} 
                onChange={e => setTaxInput(e.target.value)}
                style={{ width: "100%", padding: "10px 32px 10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", fontSize: "14px", height: "42px" }}
              />
              <span style={{ position: "absolute", right: "12px", top: "11px", color: "rgba(255,255,255,0.4)", fontSize: "14px", fontWeight: "bold" }}>%</span>
            </div>
            <button onClick={handleUpdateTax} className="btn-primary" style={{ whiteSpace: "nowrap", borderRadius: "8px", height: "42px", padding: "0 20px" }}>
              Save Tax
            </button>
          </div>
        </div>
      </div>

      <div className="responsive-card" style={{
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(12px)",
        padding: "24px", borderRadius: "16px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        color: "#ffffff"
      }}>
        {loading ? (
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px", margin: 0 }}>Loading receipts...</p>
        ) : receipts.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px", margin: 0 }}>No receipts found.</p>
        ) : (
          <div className="table-container">
            <table style={{ width: "100%", borderCollapse: "collapse", color: "#fff" }}>
              <thead>
                <tr style={{ background: "rgba(0, 0, 0, 0.35)", textAlign: "left" }}>
                  <th style={{ padding: "14px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#EAD7BB", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Invoice #</th>
                  <th style={{ padding: "14px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#EAD7BB", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Date</th>
                  <th style={{ padding: "14px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#EAD7BB", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Student Name</th>
                  <th style={{ padding: "14px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#EAD7BB", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Class</th>
                  <th style={{ padding: "14px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#EAD7BB", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Total</th>
                  <th style={{ padding: "14px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#EAD7BB", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Status</th>
                  <th style={{ padding: "14px 16px", borderBottom: "2px solid rgba(255,255,255,0.1)", color: "#EAD7BB", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", transition: "background 0.2s" }} onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.02)"; }} onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}>
                    <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.9)" }}>{r.invoice_number}</td>
                    <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.75)" }}>{formatDate(r.creation_date)}</td>
                    <td style={{ padding: "14px 16px", fontWeight: "bold", color: "#ffffff" }}>{r.student_name}</td>
                    <td style={{ padding: "14px 16px", color: "rgba(255,255,255,0.75)" }}>{r.student_class}</td>
                    <td style={{ padding: "14px 16px", fontWeight: "bold", color: "#00F5D4" }}>₹{Number(r.grand_total).toFixed(2)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <select 
                        value={r.status || 'Pending'}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        style={{ 
                          padding: "6px 12px", 
                          borderRadius: "8px", 
                          outline: "none",
                          fontSize: "12px",
                          border: r.status === 'Verified' ? '1px solid rgba(39, 174, 96, 0.45)' : r.status === 'Disputed' ? '1px solid rgba(255, 107, 107, 0.45)' : '1px solid rgba(243, 156, 18, 0.45)',
                          background: r.status === 'Verified' ? 'rgba(39, 174, 96, 0.2)' : r.status === 'Disputed' ? 'rgba(255, 107, 107, 0.2)' : 'rgba(243, 156, 18, 0.2)',
                          color: r.status === 'Verified' ? '#2ecc71' : r.status === 'Disputed' ? '#ff6b6b' : '#f1c40f',
                          fontWeight: "bold",
                          cursor: "pointer"
                        }}
                      >
                        <option value="Pending" style={{ background: "#113946", color: "#fff" }}>Pending</option>
                        <option value="Verified" style={{ background: "#113946", color: "#fff" }}>Verified</option>
                        <option value="Disputed" style={{ background: "#113946", color: "#fff" }}>Disputed</option>
                      </select>
                    </td>
                    <td style={{ padding: "14px 16px", display: "flex", gap: "8px" }}>
                      <button 
                        onClick={() => setPreviewModalReceipt(r)}
                        className="btn-warning btn-action-small"
                        title="Preview"
                        style={{ borderRadius: "6px" }}
                      >
                        👁️
                      </button>
                      <button 
                        onClick={() => handleDownloadSingle(r)}
                        className="btn-primary btn-action-small"
                        title="Download PDF"
                        style={{ borderRadius: "6px" }}
                      >
                        📄
                      </button>
                      <button 
                        onClick={() => setEditReceipt({...r})}
                        className="btn-success btn-action-small"
                        title="Edit Basic Info"
                        style={{ borderRadius: "6px" }}
                      >
                        ✏️
                      </button>
                      <button 
                        onClick={() => handleDelete(r.id)}
                        className="btn-danger btn-action-small"
                        title="Delete"
                        style={{ borderRadius: "6px" }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", overflowY: "auto", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "rgba(15, 32, 39, 0.98)", border: "1px solid rgba(255,255,255,0.1)", padding: "24px", borderRadius: "16px", width: "90%", maxWidth: "800px", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            <button 
              onClick={() => setPreviewModalReceipt(null)}
              style={{ position: "absolute", top: "20px", right: "20px", background: "#ff4757", color: "white", border: "none", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", boxShadow: "0 4px 10px rgba(255,71,87,0.3)" }}
            >
              ✕
            </button>
            <h2 style={{ marginBottom: "20px", color: "#EAD7BB", fontFamily: "var(--font-montserrat)", fontSize: "20px", fontWeight: "bold" }}>Receipt Preview</h2>
            <div style={{ transform: "scale(0.95)", transformOrigin: "top center", padding: "10px", background: "#FFF2D8", borderRadius: "8px" }}>
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
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.75)", zIndex: 1100, display: "flex", justifyContent: "center", alignItems: "center", overflowY: "auto", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "rgba(15, 32, 39, 0.98)", border: "1px solid rgba(255,255,255,0.1)", padding: "30px", borderRadius: "16px", width: "90%", maxWidth: "500px", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            <h2 style={{ marginBottom: "20px", color: "#EAD7BB", fontFamily: "var(--font-montserrat)", fontSize: "20px", fontWeight: "bold", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "10px" }}>Edit Receipt</h2>
            <form onSubmit={handleEditSave}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Invoice Number</label>
                <input type="text" value={editReceipt.invoice_number} onChange={e => setEditReceipt({...editReceipt, invoice_number: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }} required />
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Creation Date</label>
                <input type="date" value={editReceipt.creation_date ? editReceipt.creation_date.split('T')[0] : ""} onChange={e => setEditReceipt({...editReceipt, creation_date: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }} required />
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Student Name</label>
                <input type="text" value={editReceipt.student_name} onChange={e => setEditReceipt({...editReceipt, student_name: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }} required />
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Class</label>
                <input type="text" value={editReceipt.student_class} onChange={e => setEditReceipt({...editReceipt, student_class: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }} required />
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Phone</label>
                <input type="text" value={editReceipt.student_phone} onChange={e => setEditReceipt({...editReceipt, student_phone: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }} />
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment Method</label>
                <select value={editReceipt.payment_method || "UPI"} onChange={e => setEditReceipt({...editReceipt, payment_method: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }}>
                  <option value="UPI" style={{ color: "#113946" }}>UPI</option>
                  <option value="Cash" style={{ color: "#113946" }}>Cash</option>
                  <option value="Bank Transfer" style={{ color: "#113946" }}>Bank Transfer</option>
                  <option value="Cheque" style={{ color: "#113946" }}>Cheque</option>
                  <option value="Card" style={{ color: "#113946" }}>Card</option>
                </select>
              </div>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Payment Details</label>
                <input type="text" value={editReceipt.payment_details || ""} onChange={e => setEditReceipt({...editReceipt, payment_details: e.target.value})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }} />
              </div>
              <div style={{ marginBottom: "25px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "12px", fontWeight: "bold", color: "rgba(234, 215, 187, 0.85)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Grand Total</label>
                <input type="number" step="0.01" value={editReceipt.grand_total} onChange={e => setEditReceipt({...editReceipt, grand_total: parseFloat(e.target.value)})} style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "rgba(0, 0, 0, 0.25)", color: "white", outline: "none", height: "42px" }} required />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "15px" }}>
                <button type="button" onClick={() => setEditReceipt(null)} className="btn-outline" style={{ padding: "10px 22px", borderRadius: "8px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", color: "white", background: "none" }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: "10px 25px", borderRadius: "8px" }}>Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Analytics Modal Overlay */}
      {showAnalyticsModal && (() => {
        const { labels, datasets, classBreakdown } = getAnalyticsData();
        const maxVal = Math.max(...datasets, 1);
        const totalPeriodRevenue = datasets.reduce((a, b) => a + b, 0);
        
        // Period description helper
        const getPeriodDescription = () => {
          const today = new Date();
          if (analyticsTimeframe === "day") {
            return today.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' });
          } else if (analyticsTimeframe === "week") {
            const startOfWeek = new Date();
            startOfWeek.setDate(today.getDate() - 6);
            return `${startOfWeek.toLocaleDateString("en-GB", { day: '2-digit', month: 'short' })} - ${today.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' })}`;
          } else if (analyticsTimeframe === "month") {
            return today.toLocaleDateString("en-GB", { month: 'long', year: 'numeric' });
          } else {
            return `Year ${today.getFullYear()}`;
          }
        };

        // Build SVG chart coordinates
        const points = datasets.map((val, idx) => {
          const x = 60 + (idx / Math.max(1, datasets.length - 1)) * 380;
          const y = 140 - (val / maxVal) * 90;
          return { x, y, val, label: labels[idx] };
        });
        
        const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaPath = points.length ? `${linePath} L ${points[points.length-1].x} 140 L ${points[0].x} 140 Z` : '';

        // Colors for class breakdown bars
        const classColors: { [key: string]: string } = {
          KIDS: "#FF5E7E",
          PLANETS: "#3366FF",
          STARS: "#00D2FC",
          UNKNOWN: "#888888"
        };
        const getClassColor = (c: string) => classColors[c] || "#FFC93C";

        const totalAllRevenue = Object.values(classBreakdown).reduce((a, b) => a + b, 0);

        return (
          <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0, 0, 0, 0.8)", zIndex: 1200, display: "flex", justifyContent: "center", alignItems: "center", backdropFilter: "blur(10px)" }}>
            <div style={{ background: "rgba(15, 32, 39, 0.98)", border: "1px solid rgba(255,255,255,0.1)", padding: "30px", borderRadius: "16px", width: "95%", maxWidth: "900px", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 20px 50px rgba(0,0,0,0.5)", color: "#fff" }}>
              
              <button 
                onClick={() => setShowAnalyticsModal(false)}
                style={{ position: "absolute", top: "20px", right: "20px", background: "#ff4757", color: "white", border: "none", borderRadius: "50%", width: "32px", height: "32px", cursor: "pointer", fontWeight: "bold", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(255,71,87,0.3)" }}
              >
                ✕
              </button>

              <h2 style={{ marginBottom: "5px", color: "#EAD7BB", fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-montserrat)" }}>Financial Analytics</h2>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px", marginBottom: "25px" }}>Real-time statistics & visual reports across all classes and timeframes.</p>

              {/* Timeframe Selector Tabs */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "25px", background: "rgba(0, 0, 0, 0.35)", padding: "6px", borderRadius: "10px", width: "fit-content", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                {(["day", "week", "month", "year"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAnalyticsTimeframe(t)}
                    style={{
                      padding: "8px 20px",
                      borderRadius: "8px",
                      border: "none",
                      background: analyticsTimeframe === t ? "#3366FF" : "transparent",
                      color: analyticsTimeframe === t ? "white" : "rgba(255,255,255,0.6)",
                      fontWeight: 700,
                      fontSize: "13px",
                      textTransform: "capitalize",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Analytics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "30px" }}>
                
                {/* Timeframe Chart Card */}
                <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                    <h4 style={{ margin: 0, color: "#EAD7BB", fontSize: "15px", fontWeight: 700 }}>Revenue Trend ({getPeriodDescription()})</h4>
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "#00F5D4" }}>₹{totalPeriodRevenue.toFixed(2)}</span>
                  </div>
                  
                  {totalPeriodRevenue === 0 ? (
                    <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                      No collections recorded for this period.
                    </div>
                  ) : (
                    <div>
                      {/* SVG Line Graph */}
                      <svg viewBox="0 0 500 180" style={{ width: "100%", height: "auto" }}>
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00F5D4" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#3366FF" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        
                        {/* Horizontal Gridlines */}
                        <line x1="50" y1="50" x2="460" y2="50" stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="4 4" />
                        <line x1="50" y1="95" x2="460" y2="95" stroke="rgba(255, 255, 255, 0.08)" strokeDasharray="4 4" />
                        <line x1="50" y1="140" x2="460" y2="140" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />

                        {/* Fill Area */}
                        {areaPath && <path d={areaPath} fill="url(#chartGrad)" />}

                        {/* Stroke Path */}
                        {linePath && <path d={linePath} fill="none" stroke="#00F5D4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}

                        {/* Data point markers */}
                        {points.map((p, idx) => (
                          <g key={idx}>
                            <circle cx={p.x} cy={p.y} r="5" fill="white" stroke="#00F5D4" strokeWidth="2" />
                            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#00F5D4">
                              {p.val > 0 ? `₹${Math.round(p.val)}` : ''}
                            </text>
                            <text x={p.x} y="158" textAnchor="middle" fontSize="9" fontWeight="600" fill="rgba(255,255,255,0.7)">
                              {p.label}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  )}
                </div>

                {/* Class Breakdown Card */}
                <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "20px" }}>
                  <h4 style={{ margin: "0 0 15px 0", color: "#EAD7BB", fontSize: "15px", fontWeight: 700 }}>Collections by Class / Grade</h4>
                  
                  {totalAllRevenue === 0 ? (
                    <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                      No classes collection record yet.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                      {Object.entries(classBreakdown).map(([cls, amount]) => {
                        const percent = totalAllRevenue > 0 ? (amount / totalAllRevenue) * 100 : 0;
                        const barColor = getClassColor(cls);
                        return (
                          <div key={cls} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", color: "#ffffff" }}>
                                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: barColor }} />
                                {cls}
                              </div>
                              <div style={{ color: "#00F5D4", fontWeight: 700 }}>
                                ₹{amount.toFixed(2)} <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500, fontSize: "11px", marginLeft: "4px" }}>({percent.toFixed(1)}%)</span>
                              </div>
                            </div>
                            <div style={{ width: "100%", height: "10px", background: "rgba(255,255,255,0.08)", borderRadius: "5px", overflow: "hidden" }}>
                              <div style={{ width: `${percent}%`, height: "100%", background: barColor, borderRadius: "5px", transition: "width 0.5s ease" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
}
