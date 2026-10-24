import { jsPDF } from 'jspdf';
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

// Create a function to generate the agreement PDF
async function generateAgreement(formData: Partial<FormData> = {}, download: boolean = false) {
  // Initialize PDF document
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Set initial position with more space at the top
  let y = 230;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 20;
  const textWidth = pageWidth - (margin * 2);

  // Helper functions
  function addTitle(text: string) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const textLines = doc.splitTextToSize(text, textWidth);
    
    // Center the title
    textLines.forEach(line => {
      const textWidth = doc.getStringUnitWidth(line) * 12 / doc.internal.scaleFactor;
      const textOffset = (pageWidth - textWidth) / 2;
      doc.text(line, textOffset, y);
      y += 7;
    });
    
    return y;
  }

  function addBoldText(text: string): string {
    return `**${text}**`;
  }

  function addParagraph(text: string, indent: number = 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    // Split text into parts based on bold markers
    const parts = text.split(/(\*\*.*?\*\*)/g);
    let currentX = margin + indent;
    let currentY = y;
    let currentLine = '';
    
    parts.forEach(part => {
      if (part.startsWith('**') && part.endsWith('**')) {
        // This is bold text
        const boldText = part.slice(2, -2);
        doc.setFont('helvetica', 'bold');
        
        // Check if adding this text would exceed line width
        const textWidth = doc.getStringUnitWidth(boldText) * 10 / doc.internal.scaleFactor;
        if (currentX + textWidth > pageWidth - margin) {
          // Start new line
          doc.text(currentLine, margin + indent, currentY);
          currentY += 2;
          currentX = margin + indent;
          currentLine = '';
        }
        
        // Add bold text
        doc.text(boldText, currentX, currentY);
        currentX += textWidth;
        doc.setFont('helvetica', 'normal');
      } else if (part) {
        // This is normal text
        const words = part.split(' ');
        words.forEach(word => {
          const wordWidth = doc.getStringUnitWidth(word + ' ') * 10 / doc.internal.scaleFactor;
          
          if (currentX + wordWidth > pageWidth - margin) {
            // Start new line
            doc.text(currentLine, margin + indent, currentY);
            currentY += 5;
            currentX = margin + indent;
            currentLine = '';
          }
          
          currentLine += word + ' ';
          currentX += wordWidth;
        });
      }
    });
    
    // Add any remaining text
    if (currentLine) {
      doc.text(currentLine, margin + indent, currentY);
      currentY += 5;
    }
    
    y = currentY + 2; // Add some space after paragraph
    return y;
  }

  function addBulletPoint(text: string, indent: number = 5) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const textLines = doc.splitTextToSize(text, textWidth - indent - 5);
    
    checkPageBreak();
    doc.text('-', margin + indent, y);
    doc.text(textLines[0], margin + indent + 5, y);
    y += 5;
    
    // Handle multi-line bullet points
    for (let i = 1; i < textLines.length; i++) {
      checkPageBreak();
      doc.text(textLines[i], margin + indent + 5, y);
      y += 5;
    }
    
    return y;
  }

  function addNumberedSection(number: string, title: string, bold: boolean = true) {
    checkPageBreak();
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.text(`${number}.`, margin, y);
    doc.text(title, margin + 10, y);
    y += 7;
    return y;
  }

  function addSubSection(letter: string, text: string, indent: number = 10) {
    checkPageBreak();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`(${letter})`, margin + indent, y);
    
    const textLines = doc.splitTextToSize(text, textWidth - indent - 10);
    doc.text(textLines[0], margin + indent + 10, y);
    y += 5;
    
    // Handle multi-line subsections
    for (let i = 1; i < textLines.length; i++) {
      checkPageBreak();
      doc.text(textLines[i], margin + indent + 10, y);
      y += 5;
    }
    
    return y;
  }

  function addRomanNumeral(numeral: string, text: string, indent: number = 10) {
    checkPageBreak();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`(${numeral})`, margin + indent, y);
    
    const textLines = doc.splitTextToSize(text, textWidth - indent - 10);
    doc.text(textLines[0], margin + indent + 10, y);
    y += 5;
    
    // Handle multi-line text
    for (let i = 1; i < textLines.length; i++) {
      checkPageBreak();
      doc.text(textLines[i], margin + indent + 10, y);
      y += 5;
    }
    
    return y;
  }

  function addSpace(space: number = 5) {
    y += space;
    return y;
  }

  function checkPageBreak() {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }
  function addCenteredBoldParagraph(text: string) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, textWidth);
    for (const line of lines) {
      checkPageBreak();
      doc.text(line, pageWidth / 2, y, { align: "center" });
      y += 5;
    }
    y += 2;
  }
  

  // Start creating the document
  // Title
  addTitle('Model Agreement');
  addTitle('Between');
  addCenteredBoldParagraph('Applicant and the registered/empanelled Vendor for installation of rooftop solar system in residential house of the Applicant under simplified procedure of Rooftop Solar Programme Ph- II');

  // Agreement date
  const currentDate = new Date();
  addParagraph(`This agreement is executed on ${`${currentDate.getDate()}${["th", "st", "nd", "rd"][((currentDate.getDate() % 100) - 20) % 10] || "th"}`} (Day) ${currentDate.toLocaleString('en-IN', { month: 'long' })} (Month) ${String(currentDate.getFullYear())} (Year) for design, installation, commissioning and five years comprehensive maintenance of rooftop solar system to be installed under simplified procedure of Rooftop Solar Programme Ph-II.`);
  
  addTitle('Between');

  addParagraph(`${formData.consumerName} (Name of Applicant) having residential electricity connection with consumer number ${formData.consumerNumber}  MSEDCL  ${formData.address} hereinafter referred as Applicant).`);
  
  
  // Add page break before vendor details
  doc.addPage();
  y = 20; // Reset y position to top of new page
  
  // Vendor details
  addParagraph(`${formData.companyName} (Name of Vendor) is registered/ empanelled with the Maharashtra state Electricity Distribution Company Limited (hereinafter referred as DISCOM) and is having registered/functional office at ${formData.installerDesignation}. (hereinafter referred as Vendor). Both Applicant and the Vendor are jointly referred as Parties.`);
  
  
  // Whereas section
  addBoldText('Whereas');
  addBulletPoint('The Applicant intends to install rooftop solar system under simplified procedure of Rooftop Solar Programme Ph-II of the MNRE.');
  addBulletPoint('The Vendor is registered/empanelled vendor with DISCOM for installation of rooftop solar under MNRE Schemes. The Vendor satisfies all the existing regulation pertaining to electrical safety and license in the respective state and it is not debarred or blacklisted from undertaking any such installations by any state/central Government agency.');
  addBulletPoint('Both the parties are mutually agreed and understand their roles and responsibilities and have no liability to any other agency/firm/stakeholder especially to DISCOM and MNRE.');
  
  // Section 1
  addNumberedSection('1', 'GENERAL TERMS:');
  addParagraph('The Applicant hereby represents and warrants that the Applicant has the sole legal capacity to enter into this Agreement and authorise the construction, installation and commissioning of the Rooftop Solar System ("RTS System") which is inclusive of Balance of System ("BoS") on the Applicant\'s premises ("Applicant Site"). The Vendor reserves its right to verify ownership of the Applicant Site and Applicant covenants to co-operate and provide all information and documentation required by the Vendor for the same.', 5);
  addParagraph('Vendor may propose changes to the scope, nature and or schedule of the services being performed under this Agreement. All proposed changes must be mutually agreed between the Parties. If Parties fail to agree on the variation proposed, either Party may terminate this Agreement by serving notice as per Clause 13.', 5);
  addParagraph('The Applicant understands and agrees that future changes in load, electricity usage patterns and/or electricity tariffs may affect the economics of the RTS System and these factors have not been and cannot be considered in any analysis or quotation provided by Vendor or its Authorized Persons (defined below).', 5);
  
  // Section 2
  addNumberedSection('2', 'RTS System');
  addParagraph(`Total capacity of RTS System will be minimum **${formData.installedCapacityRooftop} kWp**.`, 5);
  y -= 2; // Reduce space between paragraphs
  addParagraph('The Solar modules, inverters and BoS will confirm to minimum specifications and DCR requirement of MNRE.', 5);
  y -= 2; // Reduce space between paragraphs
  addParagraph(`Solar modules of ${formData.moduleManufacturer} make, ${formData.numberOfModules} module, ${formData.moduleWattage} Wp capacity each and 17.28  % efficiency will be procured and installed by the Vendor`, 5);
  y -= 2; // Reduce space between paragraphs
  addParagraph(`Solar inverter of ${formData.inverterMake} make, ${formData.inverterCapacity} kW rated output capacity will be procured and installed by the Vendor`, 5);
  y -= 2; // Reduce space between paragraphs
  addParagraph('Module mounting structure has to withstand minimum wind load pressure as specified by MNRE. Other BoS installations shall be as per best industry practice with all safety and protection gears installed by the vendor.', 5);
  
  // Section 3
  addNumberedSection('3', 'PRICE AND PAYMENT TERMS');
  addParagraph(`The cost of RTS System will be Rs **${formData.totalCost} /- **                (to be decided mutually). The Applicant shall pay the total cost to the Vendor as under:`, 5);
  
  addRomanNumeral('i', '50% as an advance on confirmation of the order;');
  addRomanNumeral('ii', '25% against Proforma Invoice (PI) before dispatch of solar panels, inverters and other BoS items to be delivered;');
  addRomanNumeral('iii', '25% after installation and commissioning of the RTS System.');
  
  addParagraph('The order value and payment terms are fixed and will not be subject to any adjustment except as approved in writing by Vendor. The payment shall be made only through bankers\' cheque / NEFT / RTGS / online payment portal as intimated by Vendor. No cash payments shall be accepted by Vendor or its Authorised Person.', 5);
  
  // Section 4
  addNumberedSection('4', 'REPRESENTATIONS MADE BY THE APPLICANT:');
  addParagraph('The Applicant acknowledges and agrees that:', 5);
  y -= 2; // Reduce space
  
  addParagraph('any timeline or schedule shared by Vendor for the provision of services and delivery of the RTS System is only an estimate and Vendor will not be liable for any delay that is not attributable to Vendor;', 5);
  y -= 2; // Reduce space
  
  // Check for page break before continuing
  checkPageBreak();
  
  addParagraph('all information disclosed by the Applicant to Vendor in connection with the supply of the RTS System (or any part thereof), services and generation estimation (including, without limitation, the load profile and power bill) are true and accurate, and acknowledges that Vendor has relied on the information produced by the Applicant to customise the RTS System layout and BoS design for the purposes of this Agreement;', 5);
  y -= 2; // Reduce space
  
  addParagraph('all descriptive specifications, illustrations, drawings, data, dimensions, quotation, fact sheets, price lists and any advertising material circulated/published/provided by Vendor are approximate only;', 5);
  y -= 2; // Reduce space
  
  addParagraph('any drawings, pre-feasibility report, specifications and plans composed by Vendor shall require the Applicant\'s approval within 5 (five) days of its receipt by electronic mail to Vendor and if the Applicant does not respond within this period, the drawings, specifications or plans shall be final and deemed to have been approved by the Applicant;', 5);
  y -= 2; // Reduce space
  
  addParagraph('the Applicant shall not use the RTS System or any part thereof, other than in accordance with the product manufacturer\'s specifications, and covenants that any risk arising from misuse or/and misappropriate use shall be to the account of the Applicant alone.', 5);
  y -= 2; // Reduce space
  
  addParagraph('The Applicant represents, warrants and covenants that:', 5);
  y -= 2; // Reduce space
  
  addRomanNumeral('i', 'all electrical and plumbing infrastructure at the Applicant Site are in conformity with applicable laws;');
  y -= 1; // Reduce space between roman numerals
  addRomanNumeral('ii', 'the Applicant has the legal capacity to permit unfettered access to Vendor and its Authorized Persons for the purposes of execution and performance of this Agreement;');
  y -= 1;
  addRomanNumeral('iii', 'the Applicant has and will provide requisite power, water and other requisite resources and storage facilities for construction, installation, operation and maintenance of the RTS System;');
  y -= 1;
  addRomanNumeral('iv', 'the Applicant will provide support for site fabrication of structure, assembly and fitting of module mounting structure at Applicant Site;');
  y -= 1;
  addRomanNumeral('v', 'the Applicant will ensure that the Applicant Site is shadow free and free of all encumbrances during the lifetime of the RTS System;');
  y -= 1;
  addRomanNumeral('vi', 'Applicant should ensure that the Applicant regularly cleans and ensures accessibility and safety to the RTS System, as required by Vendor and dusting frequency in the premises.');
  y -= 1;
  addRomanNumeral('vii', 'Vendor is entitled to permit geo-tagging of the Applicant Site as a Vendor installation site;');
  y -= 1;
  addRomanNumeral('viii', 'Unless otherwise intimated by the Applicant in writing, Vendor is entitled to take photographs, videos and testimonials of the Applicant and the Applicant Site, and to create content which will become the property of Vendor and the same can be freely used by Vendor as part of its promotional and marketing activities across all platforms as it deems fit;');
  y -= 1;
  addRomanNumeral('ix', 'the Applicant validates the stability of the Applicant Site for the installation of the RTS System.');
  
  // Section 5
  addNumberedSection('5', 'MAINTENANCE:');
  y -= 2;
  addParagraph('Vendor shall provide five-year free workmanship maintenance. Vendor shall visit the Applicant\'s premises at least once every quarter after commissioning of the RTS System for maintenance purposes.', 5);
  y -= 2;
  addParagraph('During such maintenance visit, Vendor shall check all nuts and bolts, fuses, earth resistance and other consumables in respect of the RTS System to ensure that it is in good working condition.', 5);
  y -= 2;
  addParagraph('Cleaning requirement/expectation from the Applicant side – Applicant responsibility, minimum expectation from Applicant that it will be cleaned regularly as per the dusting frequency.', 5);
  
  
  // Section 6
  addNumberedSection('6', 'ACCESS AND RIGHT OF ENTRY:');
  addParagraph('The Applicant hereby grants permission to Vendor and its authorized personnel, representatives, associates, officers, employees, financing agents, subcontractors ("Authorized Persons") to enter the Applicant Site for the purposes of:', 5);
  
  addSubSection('a', 'conducting feasibility study;');
  addSubSection('b', 'storing the RTS System/any part thereof;');
  addSubSection('c', 'installing the RTS System;');
  addSubSection('d', 'inspecting the RTS System;');
  addSubSection('e', 'conducting repairs and maintenance to the RTS System;');
  addSubSection('f', 'removing the RTS System (or any part thereof), if necessary for any reason whatsoever;');
  addSubSection('g', 'Such other matters as necessary to execute and perform its rights and obligations under this Agreement.');
  
  addParagraph('The Applicant shall ensure that third-party consents necessary for the Authorized Persons to access the Applicant Site are obtained prior to commencement of services under this Agreement.', 5);
  
  // Section 7
  addNumberedSection('7', 'WARRANTIES:');
  addParagraph('Product Warranty: The Applicant shall be entitled to manufacturers\' warranty. Any warranty in relation to RTS System supplied to the Applicant by Vendor under this Agreement is limited to the warranty given by the manufacturer of the RTS System (or any part thereof) to Vendor.', 5);
  addParagraph('Installation Warranty: Vendor warrants that all installations shall be free from workmanship defects or BOS defects for a period of five years from the date of installation of the RTS System. The warranty is limited to Vendor rectifying the workmanship or BOS defects at Vendor\'s expense in respect of those defects reported by the Applicant, in writing. The Applicant is obliged and liable to report such defects within 15 (fifteen) days of occurrence of such defect.', 5);
  addParagraph('Subject to manufacturer warranty, Vendor warrants that the solar modules supplied herein shall have tolerance within a five percentage range (+/-5%). The peak-power point voltage and the peak-power point current of any supplied solar module and/or any module string (series connected modules) shall not vary by more than 5% (five percent) from the respective arithmetic means for all modules and/or for all module strings, as the case may be, provided the RTS System is properly maintained and the Applicant Site is free from shadow at the time of operation of the RTS System.', 5);
  
  addParagraph('Exceptions for warranty:', 5);
  
  addSubSection('a', 'Any attempt by any person other than Vendor or its Authorised Persons to adjust, modify, repair or provide maintenance to the RTS System, shall disentitle the Applicant of the warranty provided by Vendor hereunder.');
  addSubSection('b', 'Vendor shall not be liable for any degeneration or damage to the RTS System due to any action or inaction on the part of the Applicant.');
  addSubSection('c', 'Vendor shall not be bound or liable to remedy any damage, fault, failure or malfunction of the RTS System owing to external causes, including but not limited to accidents, misuse, neglect, if usage and/or storage and/or installation are non-confirming to product instructions, modifications by the Applicant leading to shading or accessibility issues, failure to perform required maintenance, normal wear and tear, Force Majeure Event, or negligence or default attributable to the Applicant.');
  addSubSection('d', 'Vendor shall not be liable to repair or remedy any accessories or parts added to the RTS System that were not originally sourced by Vendor to the Applicant.');
  
  // Section 8
  addNumberedSection('8', 'PERFORMANCE GUARANTEE');
  addParagraph('Vendor guarantees minimum system performance ratio of 75% as per performance ratio test carried out in adherence to IEC 61724 or equivalent BIS for a period of five years.', 5);
  
  // Section 9
  addNumberedSection('9', 'INSURANCE:');
  addParagraph('Vendor may, at its sole discretion, obtain insurance covering risks of loss/damage to the RTS System (any part thereof) during transit from Vendor\'s warehouse until delivery to the Applicant Site and until installation and commissioning.', 5);
  addParagraph('Thereafter, all risk shall pass on to the Applicant and the Applicant may accordingly procure relevant insurances.', 5);
  
  // Section 10
  addNumberedSection('10', 'CANCELLATION:');
  addParagraph('The Applicant may cancel the order placed on Vendor within 7 (seven) days from the date of remittance of advance money or the date of order acceptance, whichever is earlier ("Order Confirmation") by serving notice as per Clause 13.', 5);
  addParagraph('If the Applicant cancels the order after the expiry of 7 (seven) days from the date of Order Form, the Applicant shall be liable to pay Vendor, a cancellation fee of XX% of the total order value plus costs and expenses incurred by Vendor, including, costs for labour, design, return of products, administrative costs, subvention costs.', 5);
  addParagraph('Notwithstanding the aforesaid, the Applicant shall not be entitled to cancel the Order Form after Vendor has dispatched the RTS System (or any part thereof, including BOS) to the Applicant Site. If Applicant chooses to terminate the Order Form after dispatch, the entire amount paid by the Applicant till date, shall be forfeited by Vendor.', 5);
  
  // Section 11
  addNumberedSection('11', 'LIMITATION OF LIABILITY AND INDEMNITY:');
  addParagraph('To the extent that terms implied by law apply to the RTS System and the services rendered under this Agreement, Vendor\'s liability for any breach of those terms is limited to:', 5);
  
  addSubSection('a', 'repairing or replacing the RTS System/any part thereof, as applicable; or');
  addSubSection('b', 'Refund of the moneys paid by the Applicant to Vendor, if Vendor cannot fulfil the order.');
  
  // Section 12
  addNumberedSection('12', 'SUSPENSION AND TERMINATION:');
  addParagraph('If the Applicant fails to pay any sum due under this Agreement on the due date, Vendor may, in addition to its other rights under this Agreement, suspend its obligations under this Agreement until all outstanding amounts (including interest due) are paid.', 5);
  
  // Section 13
  addNumberedSection('13', 'NOTICES:');
  addParagraph('Any notice or other communication under this Agreement to Vendor and or to the Applicant, shall be in writing, in English language and shall be delivered or sent: (a) by electronic mail and/or (b) by hand delivery or registered post/courier, at the registered address of Applicant/Vendor.', 0);
  
  // Section 14
  addNumberedSection('14', 'FORCE MAJEURE EVENT:');
  addParagraph('Neither Party shall be in default due to any delay or failure to perform its/his/her/their obligations under this Agreement which arises from or is a consequence of occurrence of an event which is beyond the reasonable control of such Party, and which makes performance of its/his/her/their obligations under this Agreement impossible or so impractical as reasonably to be considered impossible in the circumstances, and includes, but is not limited to, war, riot, civil disorder, earthquake, fire, explosion, storm, flood or other adverse weather conditions, pandemic, epidemic, embargo, strikes, lockouts, labour difficulties, other industrial action, acts of government, unavailability of equipment from vendor, changes requested by the Applicant ("Force Majeure Event").', 5);
  
  // Section 15
  addNumberedSection('15', 'GOVERNING LAW AND DISPUTE RESOLUTION:');
  addParagraph('The interpretation and enforcement of this Agreement shall be governed by the laws of India', 5);
  addParagraph('In the event of any dispute, controversy or difference between the Parties arising out of, or relating to this Agreement ("Dispute"), both Parties shall make an effort to resolve the Dispute in good faith, failing which, any Party to the Dispute shall be entitled to refer the Dispute to arbitration to resolve the Dispute in the manner set out in this Clause. The rights and obligations of the Parties under this Agreement shall remain in full force and effect pending the award in such arbitration proceeding.', 5);
  addParagraph('The arbitration proceeding shall be governed by the provisions of the Arbitration and Conciliation Act, 1996 and shall be settled by a sole arbitrator mutually appointed by the Parties.', 5);
  
  // Signature section
  addSpace(10);
  
  // Left side signature
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  
  // Ensure y position is valid
  checkPageBreak();
  
  // Add signature labels with proper spacing
  doc.text('(Applicant)', margin + 20, y);
  y += 5;
  
  // Switch back to normal font for names
  doc.setFont('helvetica', 'normal');
  
  // Ensure applicant name exists and is a string
  const applicantName = formData.consumerName || 'Applicant Name';
  doc.text(applicantName, margin + 20, y);
  
  // Right side signature
  doc.setFont('helvetica', 'bold');
  doc.text('(Vendor)', margin + 100, y - 5);
  
  // Switch back to normal font for vendor name
  doc.setFont('helvetica', 'normal');
  
  // Ensure vendor name exists and is a string
  const vendorName = formData.companyName;
  doc.text(vendorName, margin + 100, y);
  
  // Witness
  y += 10;
  doc.setFont('helvetica', 'bold');
    // Add signature images if available
    const imagePromises = [];
  
    // Add customer signature in the first left box
    if (formData.customerSignature) {
      imagePromises.push(addImageWithFixedSize(doc, formData.customerSignature, margin + 10, y - 0, 50, 25));
    }
    
    // Add company stamp in the first right box
    if (formData.companyStamp) {
      imagePromises.push(addImageWithFixedSize(doc, formData.companyStamp, margin + 100, y - 0, 50, 25));
    }
    
  
    // Wait for all images to be added
    await Promise.all(imagePromises);
  // Save the PDF
  if (download) {
    doc.save("model-agreement.pdf");
  } else {
    return doc.output("blob");
  }
}

// Remove the example usage since we're exporting the function
export const generateModelAgreement = generateAgreement;