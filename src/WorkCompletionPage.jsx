import React, { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

const KEY = "tejaswini-wcr-settings-v1";
const DEFAULT_VENDOR = {
  vendorName: "TEJASWINI SALES",
  vendorAddress: "SHREE RAM MANGAL KRYALAY BHIDEBAG DEOPUR DHULE 424002",
  vendorMobile: "9168445719",
  vendorEmail: "tejaswinisolarenergy@gmail.com",
  systemCapacity: "3",
  bankName: "BANK OF BARODA",
  bankBranch: "DHULIA",
  bankIFSC: "",
  bankAddress: "Dhule",
};
const fresh = () => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  return {
    ...DEFAULT_VENDOR, ...saved,
    consumerName: "", consumerNumber: "", customerMobile: "", address: "",
    sanctionNumber: "", sanctionDate: "", loanAmount: "", installationDate: new Date().toISOString().slice(0,10),
    systemCapacity: saved.systemCapacity || "3",
  };
};
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
function extract(text) {
  const t = String(text || "").replace(/\u00a0/g, " ");
  const pick = (re) => (t.match(re)?.[1] || "").trim();
  const name = pick(/(?:Congratulations\s+)([A-Z][A-Za-z .'-]{2,}?)(?=\s+Digital Sanction|\s+Date\s*:)/i);
  const app = pick(/Digital Sanction for your application\s*:\s*([A-Z0-9-]+)/i);
  const date = pick(/Date\s*:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{2}[/-]\d{2}[/-]\d{4})/i);
  const amount = pick(/Loan Amount\s*₹?\s*([\d,]+)/i) || pick(/financing for\s+Rs\.?\s*([\d,]+)/i);
  const bank = /You have received a digital sanction from\s+(.+?)(?:\n|$)/i.exec(t)?.[1]?.trim() || "";
  const branch = pick(/Branch Name\s+([A-Z][A-Z .'-]{2,})/i);
  const ifsc = pick(/IFSC Code\s+([A-Z]{4}0[A-Z0-9]{6})/i);
  const branchAddress = pick(/Branch Address\s+([\s\S]*?)(?=\s+Contact Details|\s+Vendor Details)/i);
  const vendor = pick(/Vendor Name\s+([A-Z0-9& .'-]+?)(?=\s+Vendor Contact|\s+Vendor Address|\n|$)/i);
  const contact = pick(/Vendor Contact\s*\/\s*Email\s+([\s\S]*?)(?=\s+Vendor Address|\n|$)/i);
  const vendorAddress = pick(/Vendor Address\s+([\s\S]*?)(?=\s+The Lender|\n|$)/i);
  const phone = contact.match(/(?:\+91[ -]?)?[6-9]\d{9}/)?.[0]?.replace(/^\+91[ -]?/, "") || "";
  const email = contact.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  return {
    ...(name ? {consumerName: name} : {}),
    ...(app ? {sanctionNumber: app} : {}),
    ...(date ? {sanctionDate: date} : {}),
    ...(amount ? {loanAmount: amount.replace(/,/g, "")} : {}),
    ...(bank ? {bankName: bank} : {}),
    ...(branch ? {bankBranch: clean(branch)} : {}),
    ...(ifsc ? {bankIFSC: ifsc} : {}),
    ...(branchAddress ? {bankAddress: clean(branchAddress)} : {}),
    ...(vendor ? {vendorName: clean(vendor)} : {}),
    ...(phone ? {vendorMobile: phone} : {}),
    ...(email ? {vendorEmail: email} : {}),
    ...(vendorAddress && !/^[-–]+$/.test(clean(vendorAddress)) ? {vendorAddress: clean(vendorAddress)} : {}),
  };
}
async function readPdf(file) {
  const pdf = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const out = [];
  for (let n=1; n<=pdf.numPages; n++) {
    const page = await pdf.getPage(n), content = await page.getTextContent();
    const rows = [];
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform?.[5] || 0);
      let row = rows.find(r => Math.abs(r.y-y) <= 3);
      if (!row) { row={y,items:[]}; rows.push(row); }
      row.items.push({x:item.transform?.[4] || 0, text:item.str.trim()});
    }
    rows.sort((a,b)=>b.y-a.y);
    rows.forEach(r=>out.push(r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(" ")));
  }
  return out.join("\n");
}
const fields = [
  ["consumerName","Consumer Name"],["customerMobile","Mobile Number"],["systemCapacity","System Capacity (KW)"],
  ["bankName","Bank Name"],["bankBranch","Bank Branch"],["bankAddress","Bank Location"],
  ["vendorName","Installer Name"],["vendorMobile","Installer Contact *"],["address","Installation Address *"],["vendorAddress","Installer Address *"]
];
export default function WorkCompletionPage({onBack}) {
  const [form,setForm] = useState(fresh);
  const [status,setStatus] = useState("");
  const [busy,setBusy] = useState(false);
  const update = (k,v) => setForm(p => {
    const next = {...p,[k]:v};
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_VENDOR).map(key=>[key,next[key] || ""])))); } catch {}
    return next;
  });
  const upload = async file => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") { setStatus("Please upload the sanction / approval letter as a PDF."); return; }
    setBusy(true); setStatus("Reading PDF and extracting details…");
    try {
      const text = await readPdf(file);
      const extracted = extract(text);
      setForm(p => {
        const next = {...p,...extracted};
        try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_VENDOR).map(key=>[key,next[key] || ""])))); } catch {}
        return next;
      });
      setStatus(Object.keys(extracted).length ? "Extraction complete. Please verify every field before generating the report." : "PDF text could not be matched automatically. Fill the fields manually and check whether the PDF contains selectable text.");
    } catch (e) { console.error(e); setStatus("Could not read this PDF. Try a text-based PDF or enter the details manually."); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    if (!form.consumerName.trim()) { setStatus("Please enter the customer name before generating."); return; }
    try {
      setStatus("Generating Work Completion Report PDF…");
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 18;
      const vendorName = clean(form.vendorName || "TEJASWINI SALES");
      const customer = clean(form.consumerName);
      const bankName = clean(form.bankName || "BANK OF BARODA");
      const branch = clean(form.bankBranch || "DHULIA");
      const capacity = clean(form.systemCapacity || "3");
      doc.setProperties({title:"Work Completion Report - " + customer, author:vendorName, subject:"Solar Rooftop Work Completion Report"});
      doc.setFont("helvetica","bold"); doc.setFontSize(15);
      doc.text(vendorName, pageWidth/2, 18, {align:"center"});
      doc.setFont("helvetica","normal"); doc.setFontSize(9);
      doc.text("Location: " + clean(form.vendorAddress), pageWidth/2, 25, {align:"center", maxWidth:pageWidth-2*margin});
      doc.text("Mobile No: " + clean(form.vendorMobile) + (form.vendorEmail ? "   |   " + clean(form.vendorEmail) : ""), pageWidth/2, 31, {align:"center", maxWidth:pageWidth-2*margin});
      doc.setFontSize(10);
      doc.text("Date: " + (form.reportDate || new Date().toLocaleDateString("en-IN")), pageWidth-margin, 42, {align:"right"});
      doc.text("To,", margin, 53);
      doc.setFont("helvetica","bold"); doc.text(bankName + ",", margin, 59); doc.text(branch + ",", margin, 65);
      doc.setFont("helvetica","normal"); doc.text(clean(form.bankAddress || "Dhule"), margin, 71);
      doc.setFont("helvetica","bold"); doc.text("Sub: Submission of Work Completion Report and Hypothecation of Solar Rooftop System", margin, 83, {maxWidth:pageWidth-2*margin});
      doc.setFont("helvetica","normal"); doc.text("Respected Sir/Madam,", margin, 94);
      const body = "With reference to the above subject, I hereby confirm that we have successfully completed the installation work of a " + capacity + " KW rooftop solar system at the residence of " + customer + (form.address ? ", at " + clean(form.address) : "") + ", as per the guidelines of DISCOM under the net metering arrangement.";
      const bodyLines = doc.splitTextToSize(body, pageWidth-2*margin);
      doc.text(bodyLines, margin, 102);
      const y2 = 102 + bodyLines.length*5 + 4;
      const hyp = "In accordance with the loan arrangement, I hereby hypothecate the installed " + capacity + " KW solar rooftop system to " + bankName + ", " + branch + " as security for the loan sanctioned to " + customer + " for this installation.";
      const hypLines = doc.splitTextToSize(hyp, pageWidth-2*margin);
      doc.text(hypLines, margin, y2);
      const y3 = y2 + hypLines.length*5 + 4;
      doc.text("We kindly request you to release the pending payment at the earliest.", margin, y3);
      const rows = [
        ["Consumer Name", customer], ["Consumer Number", clean(form.consumerNumber)],
        ["Customer Mobile", clean(form.customerMobile)], ["System Capacity", capacity + " KW"],
        ["Installation Address", clean(form.address)]
      ];
      if (form.sanctionNumber) rows.push(["Digital Sanction / Application No.", clean(form.sanctionNumber)]);
      if (form.sanctionDate) rows.push(["Sanction Date", clean(form.sanctionDate)]);
      if (form.loanAmount) rows.push(["Sanctioned Loan Amount", "Rs. " + clean(form.loanAmount)]);
      if (form.bankIFSC) rows.push(["Bank IFSC Code", clean(form.bankIFSC)]);
      autoTable(doc, {startY:y3+8, head:[["Detail","Information"]], body:rows, theme:"grid", margin:{left:margin,right:margin}, styles:{fontSize:9,cellPadding:2.5,overflow:"linebreak"}, headStyles:{fillColor:[235,235,235],textColor:[20,20,20]}, columnStyles:{0:{cellWidth:55},1:{cellWidth:pageWidth-2*margin-55}}});
      const sy = Math.min((doc.lastAutoTable?.finalY || y3+55)+13, 258);
      doc.text("Yours Sincerely,", margin, sy);
      doc.text("(Signature and Stamp)", margin, sy+24);
      doc.setFont("helvetica","bold"); doc.text("Authorized Representative", margin, sy+30);
      doc.setFont("helvetica","normal"); doc.text(vendorName, margin, sy+36);
      doc.save("Work-Completion-Report.pdf");
      setStatus("Work Completion Report PDF generated. Verify customer, bank and sanction details before signing or submitting.");
    } catch(e) { console.error(e); setStatus("PDF generation failed: " + (e?.message || String(e))); }
  };
  const inputStyle = {width:"100%",boxSizing:"border-box",padding:"11px 12px",border:"1px solid #d1d5db",borderRadius:8,font:"inherit",background:"#fff",color:"#111827"};
  return <main style={{maxWidth:1120,margin:"0 auto",padding:"24px 16px",color:"#111827"}}>
    <header style={{display:"flex",gap:14,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",marginBottom:22}}>
      <div><div style={{fontSize:12,letterSpacing:2,fontWeight:800,color:"#6b7280"}}>TEJASWINI SALES</div><h1 style={{fontSize:30,margin:"6px 0"}}>Work Completion Report</h1><p style={{margin:0,color:"#6b7280"}}>Upload bank sanction PDF → verify extracted details → generate WCR</p></div>
      <button onClick={onBack} style={{padding:"10px 14px",borderRadius:8,border:"1px solid #d1d5db",background:"#fff",cursor:"pointer"}}>← Back to Document Studio</button>
    </header>
    <section style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:20,marginBottom:16}}>
      <h2 style={{marginTop:0}}>1. Upload sanction / approval letter</h2>
      <input type="file" accept=".pdf,application/pdf" disabled={busy} onChange={e=>upload(e.target.files?.[0])}/>
      <p style={{color:"#6b7280",fontSize:13}}>The PDF is processed in this browser. OCR-extracted values may be incomplete; verify them against the original letter.</p>
      {status && <div role="status" style={{background:"#f3f4f6",padding:12,borderRadius:8,marginTop:12}}>{busy?"◌ ":""}{status}</div>}
    </section>
    <section style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:20,marginBottom:16}}>
      <h2 style={{marginTop:0}}>2. Customer, bank & vendor details</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
      {fields.map(([key,label])=><label key={key} style={{display:"grid",gap:6,fontSize:13,fontWeight:650}}>{label}
        {key==="address" || key==="vendorAddress" || key==="bankAddress" ? <textarea rows={2} value={form[key]||""} onChange={e=>update(key,e.target.value)} style={inputStyle}/> :
        <input type={key==="installationDate"?"date":"text"} value={form[key]||""} onChange={e=>update(key,e.target.value)} style={inputStyle}/>}
      </label>)}
      </div>
      <p style={{fontSize:13,color:"#6b7280"}}>Vendor name, address, contact, bank fields and system capacity are saved in this browser for reuse. The default system capacity is 3 kW but remains editable.</p>
    </section>
    <section style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:20}}>
      <h2 style={{marginTop:0}}>3. Generate report</h2>
      <button onClick={generate} style={{padding:"12px 18px",borderRadius:9,border:0,background:"#111827",color:"#fff",fontWeight:750,cursor:"pointer"}}>↓ Generate Work Completion Report PDF</button>
      <p style={{fontSize:13,color:"#6b7280"}}>The WCR uses the existing approved-template generator. Bank and sanction details are extracted and shown for review; if the supplied WCR template has no matching bank fields, they will not be added to the PDF automatically.</p>
    </section>
  </main>;
}
