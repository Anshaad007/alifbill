export const downloadPDF = (studentName: string, invoiceNumber: string, studentClass?: string, elementId: string = "invoicePreview") => {
  setTimeout(function () {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`PDF Error: Could not find element with id ${elementId}`);
      return;
    }
    
    let filename = "ALIF_ONLINE_FEE_RECEIPT";
    if (studentName) {
      const cleanName = studentName.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
      filename = `${cleanName}`;
      
      if (studentClass) {
        const cleanClass = studentClass.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_");
        filename += `_${cleanClass}`;
      }
      
      filename += `_Fee_Receipt`;
    }
    filename += ".pdf";
    
    const opt = {
      margin: [0.1, 0.1, 0.1, 0.1],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        windowHeight: element?.scrollHeight || 1000,
        scrollY: 0,
        scrollX: 0,
      },
      jsPDF: {
        unit: "in",
        format: "a4",
        orientation: "portrait",
      },
    };

    const previewSection = element.closest('.preview-section') as HTMLElement;
    const originalStyle = previewSection ? previewSection.style.cssText : '';
    
    if (previewSection) {
      previewSection.style.maxHeight = 'none';
      previewSection.style.overflow = 'visible';
    }

    // @ts-ignore
    if (window.html2pdf) {
      // @ts-ignore
      window.html2pdf().set(opt).from(element).save().then(() => {
        if (previewSection) {
          previewSection.style.cssText = originalStyle;
        }
      });
    } else {
      alert("PDF Generator is still loading. Please try again in a moment.");
    }
  }, 100);
};

export const getPDFBlob = (elementId: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const element = document.getElementById(elementId);
    if (!element) {
      reject(new Error(`PDF Error: Could not find element with id ${elementId}`));
      return;
    }
    const opt = {
      margin: [0.1, 0.1, 0.1, 0.1],
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        windowHeight: element?.scrollHeight || 1000,
        scrollY: 0,
        scrollX: 0,
      },
      jsPDF: {
        unit: "in",
        format: "a4",
        orientation: "portrait",
      },
    };
    // @ts-ignore
    if (window.html2pdf) {
      // @ts-ignore
      window.html2pdf().set(opt).from(element).output('blob').then((blob: Blob) => {
        resolve(blob);
      }).catch((err: any) => {
        reject(err);
      });
    } else {
      reject(new Error("PDF Generator is still loading."));
    }
  });
};
