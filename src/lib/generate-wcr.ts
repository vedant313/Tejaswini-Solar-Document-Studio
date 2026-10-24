import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { FormData } from "./types";

const addImageWithFixedSize = async (
  doc: jsPDF,
  imgData: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number
) => {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.src = imgData;

    img.onload = () => {
      let imgWidth = img.width;
      let imgHeight = img.height;
      const aspectRatio = imgWidth / imgHeight;

      // Resize while maintaining aspect ratio
      if (imgWidth > imgHeight) {
        imgWidth = maxWidth;
        imgHeight = maxWidth / aspectRatio;
      } else {
        imgHeight = maxHeight;
        imgWidth = maxHeight * aspectRatio;
      }

      // Add image to PDF without compression
      doc.addImage(imgData, "JPEG", x, y, imgWidth, imgHeight);
      resolve();
    };

    img.onerror = () => resolve(); // Continue without breaking if image fails
  });
};



  
export const generateWCR = async (data: FormData, download = false) => {
  const doc = new jsPDF();

  // Set document properties
  doc.setProperties({
    title: "Work Completion Report",
    subject: "Solar Power Plant",
    author: data.companyName,
    creator: data.installerName,
  });

  // Add header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(
    "Work Completion Report for Solar Power Plant",
    doc.internal.pageSize.width / 2,
    15,
    { align: "center" }
  );

  // Add table with details
  autoTable(doc, {
    startY: 25,
    head: [["Sr.No", "Component", "Observation"]],
    body: [
      ["1", "Name", data.consumerName],
      ["2", "Consumer number", data.consumerNumber],
      ["3", "Site/Location With Complete Address", data.address],
      ["4", "Category: Govt/Private Sector", data.category],
      ["5", "Total Capacity (KWP)", data.sanctionedCapacity],
      [
        "6",
        "Sanctioned Capacity of solar PV system (KW)",
        data.sanctionedCapacity,
      ],
      [
        "",
        "Installed Capacity of solar PV system (KW)",
        data.installedCapacityRooftop,
      ],
      ["7", "Make of Module", data.moduleManufacturer],
      ["", "Wattage per module", data.moduleWattage],
      ["", "No. of Module", data.numberOfModules],
      ["", "ALMM Model Number", ""],
      ["8", "Make & Model Number of Inverter", data.inverterMake],
      ["", "Rating", data.inverterRating],
      ["", "Type of charge controller/ MPPT", data.chargeControllerType],
      ["", "Capacity of Inverter", data.inverterCapacity],
      ["", "HPD", "N.A."],
      ["", "Year of manufacturing", data.manufacturingYear],
      [
        "9",
        "No. of Separate Earthings with Earth Resistance",
        data.earthingCount,
      ],
      [
        "",
        "It is certified that the Earth Resistance measure in presence of Licensed Electrical Contractor/Supervisor and found in order i.e. < 5 Ohms as per MNRE OM Dtd. 07.06.24 for CFA Component.",
        "Yes",
      ],
      ["10", "Lightening Arrester", data.lightningArrester],
    ],
    theme: "grid",
    headStyles: {
      fillColor: [220, 220, 220],
      textColor: [0, 0, 0],
      fontStyle: "bold",
    },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 80 },
      2: { cellWidth: 80 },
    },
  });

  // Add certification text
  const lastY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const certificationText = `This is to Certified above Installed Solar PV System is working properly with electrical safety & Islanding switch in case of any presence of backup inverter an arrangement should be made in such way the backup inverter supply should never be synchronized with solar inverter to avoid any electrical accident due to back feeding. We will be held responsible for non-working of islanding mechanism and back feed to the de-energized grid.`;

  const textLines = doc.splitTextToSize(certificationText, 180);
  doc.text(textLines, 14, lastY);

  // Add a new page for the structural stability certification
doc.addPage(); 
doc.setFontSize(14);
doc.setFont("helvetica", "bold");

// Ensure text is placed at a proper position
const stabilityY = 0; // Start high enough on the page
doc.text("", doc.internal.pageSize.width / 2, stabilityY, { align: "center" });

doc.setFontSize(10);
doc.setFont("helvetica", "normal");

const stabilityText = `We, ${data.companyName} & ${data.consumerName}, bearing Consumer Number ${data.consumerNumber}, have obtained requisite permissions from the concerned authority. If in the future, by virtue of any means due to collapsing or damage to the installed solar power plant, MSEDCL will not be held responsible for any loss to property or human life, if any.`;

const stabilityLines = doc.splitTextToSize(stabilityText, 180);
doc.text(stabilityLines, 14, stabilityY + 20); // Ensure text appears on the second page

// Add signature fields
const signatureY = stabilityY + 60;
doc.rect(30, signatureY - 15, 50, 20); // Box for customer signature
doc.rect(130, signatureY - 15, 50, 20); // Box for vendor signature

doc.text("Signature", 45, signatureY + 10);
doc.text(`${data.companyName}`, 30, signatureY + 15);
doc.text("Signature", 145, signatureY + 10);

const imagePromises = [];

// Add company stamp (Fixed 40x16)
if (data.companyStamp) {
  imagePromises.push(addImageWithFixedSize(doc, data.companyStamp, 35, signatureY - 13, 40, 16));
}

// Add customer signature (Fixed 40x16)
if (data.customerSignature) {
  imagePromises.push(addImageWithFixedSize(doc, data.customerSignature, 135, signatureY - 13, 40, 16));
}

// Instead of adding a third page, continue on the second page
const nextY = 100; // Position after the last table

doc.setFontSize(14);
doc.setFont("helvetica", "bold");
doc.text(
  "Guarantee Certificate Undertaking to be submitted by VENDOR",
  doc.internal.pageSize.width / 2,
  nextY,
  { align: "center" }
);

doc.setFontSize(10);
doc.setFont("helvetica", "normal");
const guaranteeText = `The undersigned will provide the services to the consumers for repairs/maintenance of the RTS plant free of cost for 5 years of the comprehensive Maintenance Contract (CMC) period from the date of commissioning of the plant. Non-performing/under-performing system component will be replaced/repaired free of cost in the CMC period.`;

const guaranteeLines = doc.splitTextToSize(guaranteeText, 180);
doc.text(guaranteeLines, 14, nextY + 15);

// Vendor signature placement
const guaranteeSignY = nextY + 50;
if (data.vendorSignature) {
    imagePromises.push(addImageWithFixedSize(doc, data.vendorSignature, doc.internal.pageSize.width - 80, guaranteeSignY - 15, 40, 16));
  }
  
  // Wait for all images to load before finalizing PDF
  await Promise.all(imagePromises)
doc.text("Vendor Signature ", doc.internal.pageSize.width - 75, guaranteeSignY + 10);

doc.text(`Consumer Number: ${data.consumerNumber}`, 14, guaranteeSignY + 20);
doc.text(`Aadhar Number:     ${data.aadharNumber}`, 14, guaranteeSignY + 25);

// Place Aadhaar image in the existing Aadhaar area on the final WCR page.
if (data.aadharImage) {
  const aadharY = guaranteeSignY + 40;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const left = 14;
  const maxWidth = pageWidth - 28;
  const maxHeight = Math.max(24, Math.min(72, pageHeight - aadharY - 8));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Aadhar Card:", left, aadharY - 5);
  const img = new Image();
  img.src = data.aadharImage;
  await new Promise((resolve) => {
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
      const width = img.width * ratio;
      const height = img.height * ratio;
      doc.addImage(data.aadharImage, data.aadharImage.startsWith("data:image/png") ? "PNG" : "JPEG",
        left, aadharY, width, height);
      resolve(true);
    };
    img.onerror = () => resolve(false);
  });
}

  // Instead of saving directly, return blob for preview or save for download
  if (download) {
    doc.save("WCR.pdf");
  } else {
    return doc.output("blob");
  }
};
