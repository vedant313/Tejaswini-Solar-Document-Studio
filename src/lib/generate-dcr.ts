import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { FormData } from "./types"
import { formatDate } from "./utils"

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



export const generateDCR = async (data: FormData, download = false) => {
  const doc = new jsPDF()

  // Set document properties
  doc.setProperties({
    title: "Annexure-I Commissioning Report",
    subject: "Renewable Energy Generating System",
    author: data.companyName,
    creator: data.installerName,
  })

  // Add header
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("Renewable Energy Generating System", doc.internal.pageSize.width / 2, 15, { align: "center" })

  doc.setFontSize(14)
  doc.text("Annexure-I", doc.internal.pageSize.width / 2, 22, { align: "center" })
  doc.text("(Commissioning Report for RE System)", doc.internal.pageSize.width / 2, 29, { align: "center" })

  // Add table with consumer details
  autoTable(doc, {
    startY: 35,
    head: [["SNo.", "Particulars", "As Commissioned"]],
    body: [
      ["1", "Name of the Consumer", data.consumerName],
      ["2", "Consumer Number", data.consumerNumber],
      ["3", "Mobile Number", data.mobileNumber],
      ["4", "E-mail", data.email],
      ["5", "Address of Installation", data.address],
      ["6", "RE Arrangement Type", data.reArrangementType],
      ["7", "RE Source", data.reSource],
      ["8", "Sanctioned Capacity(KW)", data.sanctionedCapacity],
      ["9", "Capacity Type", data.capacityType],
      ["10", "Project Model", data.projectModel],
      ["11", "RE installed Capacity(Rooftop)(KW)", data.installedCapacityRooftop],
      ["12", "RE installed Capacity(Rooftop + Ground)(KW)", data.installedCapacityTotal],
      ["13", "RE installed Capacity(Ground)(KW)", data.installedCapacityGround],
      ["14", "Installation date", formatDate(data.installationDate)],
      ["15", "SolarPV Details Inverter Capacity(KW)", data.inverterCapacity],
      ["", "Inverter Make", data.inverterMake],
      ["", "No .of PV Modules", data.numberOfModules],
      ["", "Module Capacity (KW)", data.moduleCapacity],
    ],
    theme: "grid",
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 80 },
      2: { cellWidth: 80 },
    },
  })

  // After the table ends, add a new page
  doc.addPage()
  
  // Add the title in center alignment
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("Proforma-A", doc.internal.pageSize.width / 2, 20, { align: "center" })
  
  doc.setFontSize(14)
  doc.text("COMMISSIONING REPORT (PROVISIONAL) FOR GRID CONNECTED SOLAR", doc.internal.pageSize.width / 2, 30, { align: "center" })
  doc.text("PHOTOVOLTAIC POWER PLANT (with Net-metering facility)", doc.internal.pageSize.width / 2, 40, { align: "center" })

  // Add certification text
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  const certificationText = `Certified that a Grid Connected SPV Power Plant of ${data.sanctionedCapacity} KWp capacity has been installed at the site ${data.address} District ${data.address.split(" ").pop()} of MAHARASHTRA which has been installed by M/S ${data.companyName} on ${formatDate(data.installationDate)}.\nThe system is as per BIS/MNRE specifications. The system has been checked for its performance and found in order for further commissioning.`

  const textLines = doc.splitTextToSize(certificationText, 180)
  doc.text(textLines, 14, 60)

  // Add signature fields
  const signatureY = 100
  doc.setFontSize(10)

  // Add signature boxes with increased size
  const boxWidth = 60
  const boxHeight = 30
  doc.rect(20, signatureY - 15, boxWidth, boxHeight) // Box for beneficiary signature
  doc.rect(120, signatureY - 15, boxWidth, boxHeight) // Box for agency signature

  // Add signature labels
  doc.text("Signature of the beneficiary", 30, signatureY + 20)
  doc.text("Signature of the agency with name, seal and date", 110, signatureY + 20)

  const imagePromises = [];

  // Usage for customer signature (Fixed 50x30)
  if (data.customerSignature) {
    imagePromises.push(addImageWithFixedSize(doc, data.customerSignature, 25, signatureY - 13, 50, 30));
  }

  // Usage for company stamp (Fixed 50x30)
  if (data.companyStamp) {
    imagePromises.push(addImageWithFixedSize(doc, data.companyStamp, 125, signatureY - 13, 50, 30));
  }
  await Promise.all(imagePromises);

  // Add MSEDCL inspection text
  const inspectionY = signatureY + 50
  doc.setFontSize(10)
  doc.text(
    "The above RTS installation has been inspected by me for Pre-Commissioning Testing of Roof Top Solar",
    14,
    inspectionY,
  )
  doc.text(
    `Connection on DT ${formatDate(data.msedclInspectionDate)} as per guidelines issued by the office of The Chief Engineer vide letter no 21653 on`,
    14,
    inspectionY + 5,
  )
  doc.text("dt.18.08.2022 and found in order for commissioning.", 14, inspectionY + 10)

  // Add MSEDCL officer signature
  const officerY = inspectionY + 25
  doc.text("Signature of the MSEDCL Officer", 14, officerY + 20)
  doc.text(`Name: ${data.msedclOfficerName}`, 14, officerY + 25)
  doc.text(`Designation: ${data.msedclOfficerDesignation}`, 14, officerY + 30)
  doc.text("Date and seal", 14, officerY + 35)

  // Instead of saving directly, return blob for preview or save for download
  if (download) {
    doc.save("Annexure-DCR.pdf")
  } else {
    return doc.output('blob')
  }
}

