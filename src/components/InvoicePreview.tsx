import React from "react";

export function InvoicePreview({
  studentName,
  studentClass,
  studentPhone,
  invoiceNumber,
  formattedDate,
  derivedItems,
  grandTotal,
  paymentMethod,
  paymentDetails,
  logoSrc = "/logo.png",
  id = "invoicePreview"
}: any) {
  return (
    <div id={id} className="invoice-preview">
      <div className="invoice-header">
        <div className="school-info">
          <div className="school-header">
            <div className="school-details">
              <h2>ALIF ONLINE MORAL SCHOOL</h2>
              <p>Othukkungal (PO)</p>
              <p>Malappuram</p>
              <p>Kerala - 676531</p>
              <p>9061711444, 9061811444, 9061911444</p>
              <p>info1alifonlinemoralschool@gmail.com</p>
              <p>www.alifonlinemoralschool.com</p>
            </div>
            <img 
              src={logoSrc} 
              alt="School Logo" 
              className="school-logo-right" 
              onError={(e) => e.currentTarget.style.display = 'none'} 
            />
          </div>
          <div className="gstin-student-row">
            <span>GSTIN: 32ACAFA0267H1ZY</span>
            <span className="student-name">
              <strong>{(studentName || "STUDENT NAME").toUpperCase()}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="invoice-details">
        <div className="bill-to">
          <h3>Bill To</h3>
          <p>
            <strong>{(studentName || "STUDENT NAME").toUpperCase()}</strong>
          </p>
          <p>{(studentClass || "Class/Section").toUpperCase()}</p>
          <p>{(studentPhone || "Phone Number").toUpperCase()}</p>
        </div>
        <div className="invoice-meta">
          <p>
            <strong>Invoice #</strong> {invoiceNumber || "INV001"}
          </p>
          <p>
            <strong>Creation Date</strong> {formattedDate}
          </p>
        </div>
      </div>

      <table className="invoice-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>QTY</th>
            <th>Price</th>
            <th>Tax</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {derivedItems.map((item: any, index: number) => (
            <tr key={index}>
              <td>{item.description}</td>
              <td>{item.quantity || item.q}</td>
              <td>₹{Number(item.price || item.p).toFixed(2)}</td>
              <td>{item.tax || item.t}%</td>
              <td className="amount">₹{Number(item.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-total">
        <div className="total-box">Total: ₹{Number(grandTotal).toFixed(2)}</div>
      </div>

      <div className="payment-info">
        <h4>Payment Method</h4>
        <p>
          {paymentMethod || "payment method"}: {paymentDetails}
        </p>
      </div>
    </div>
  );
}
