import React, { useMemo, useState } from "react";
import WorkCompletionPage from "./WorkCompletionPage.jsx";
import { createWorker } from "tesseract.js";
import jsPDF from "jspdf";
import { generateModelAgreement } from "./lib/generate-modelaggrement.ts";
import { generateWCR } from "./lib/generate-wcr.ts";
import { generateDCR } from "./lib/generate-dcr.ts";
import { AGREEMENT_PAGES } from "./agreementContent.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read Aadhaar image."));
  reader.readAsDataURL(file);
});

const emails = ["tejaswinisolarenergy@gmail.com", "tejaswinisolarpune@gmail.com"];
const initial = {
  consumerName:"", consumerNumber:"", customerMobile:"", address:"", pincode:"",
  sanctionedCapacity:"", proposedCapacity:"", existingCapacity:"", district:"Dhule",
  applicationDate:"", totalCost:"", moduleManufacturer:"Waaree", moduleWattage:"",
  numberOfModules:"", moduleModelNumber:"", inverterMake:"PV Blink", inverterModel:"", inverterCapacity:"",
  installationDate:todayISO(), installerName:"Tejaswini Sales", companyName:"TEJASWINI SALES",
  vendorName:"TEJASWINI SALES", email:emails[0], installerPhone:"9765312906",
};
function fieldMap(input) {
  // Use OCR word coordinates when available: portal labels and values often sit in separate columns.
  const data = typeof input === "string" ? null : input;
  const text = typeof input === "string" ? input : (input?.text || "");
  const lines = String(text || "").split(/\r?\n/).map(s => s.replace(/[|]+/g, " ").trim()).filter(Boolean);
  const words = (data?.words || []).filter(w => w.text && w.bbox && Number.isFinite(w.bbox.x0) && Number.isFinite(w.bbox.y0));
  const rows = [];
  for (const w of [...words].sort((a,b) => ((a.bbox.y0+a.bbox.y1)/2)-((b.bbox.y0+b.bbox.y1)/2) || a.bbox.x0-b.bbox.x0)) {
    const cy=(w.bbox.y0+w.bbox.y1)/2;
    let row=rows.find(r=>Math.abs(r.cy-cy)<=Math.max(24,(w.bbox.y1-w.bbox.y0)*1.2));
    if(!row){row={cy,words:[]};rows.push(row);} row.words.push(w);
  }
  rows.forEach(r=>r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0));
  const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const fromRightOfLabel = (labelPatterns, valueValidator, options={}) => {
    for(const row of rows){
      const full=row.words.map(w=>w.text).join(" ");
      const nfull=norm(full);
      const matched=labelPatterns.some(p=>p.test(nfull));
      if(!matched) continue;
      // Find the last word belonging to the label, then only consider words to its right.
      let endX=-1;
      for(let i=0;i<row.words.length;i++){
        const upto=norm(row.words.slice(0,i+1).map(w=>w.text).join(" "));
        if(labelPatterns.some(p=>p.test(upto))) endX=Math.max(endX,row.words[i].bbox.x1);
      }
      if(endX<0) continue;
      const candidate=row.words.filter(w=>w.bbox.x0>=endX-1).map(w=>w.text).join(" ").replace(/^[:：=-]+/,"").trim();
      const value=valueValidator(candidate);
      if(value) return value;
    }
    return "";
  };
  const clean = (s) => String(s || "").replace(/^\s*[:：=\-–]+\s*/, "").replace(/\s+/g, " ").trim();
  const getAfter = (patterns) => {
    for (let i = 0; i < lines.length; i++) {
      for (const re of patterns) {
        const m = lines[i].match(re);
        if (!m) continue;
        let v = clean(lines[i].slice(m.index + m[0].length));
        if (!v && lines[i + 1] && !/^(?:division\s*name|district|category\s*name|name\s*as\s*per|existing\s*installed|scheme\s*name|bank|ifsc|account\s*(?:no|number))/i.test(lines[i + 1])) v = clean(lines[i + 1]);
        if (v) return v;
      }
    }
    return "";
  };
  // Cut off common portal labels/metadata, including the PM Surya Ghar scheme title.
  const stopAtMeta = (s) => clean(s).split(/\b(?:division\s*name|name\s*as\s*per|category\s*name|dcr\s*category(?:\s*type)?|existing\s*installed\s*capacity|district\s*:|pincode\s*:|pin\s*code\s*:|scheme\s*name\s*:|pm\s*surya\s*ghar|muft\s*bijli\s*yojana|bank\s*(?:name|details)?|ifsc\s*code|account\s*(?:no|number)|consumer\s*account\s*number|mobile\s*(?:number|no\.?))/i)[0].trim();
  const namePatterns=[/full name of premises owner person/,/customer premises owner name/,/premises owner name/];
  const name = fromRightOfLabel(namePatterns, v=>stopAtMeta(v)) || stopAtMeta(getAfter([/full\s*name\s*of\s*premises\s*owner\s*person\s*:?/i, /customer\s*\/\s*premises\s*owner\s*name\s*:?/i, /premises\s*owner\s*name\s*:?/i]));
  const addressPatterns=[/address of premises for installation/,/installation address/];
  const address = stopAtMeta(fromRightOfLabel(addressPatterns, v=>stopAtMeta(v)) || getAfter([/address\s*of\s*premises\s*for\s*installation\s*:?/i, /installation\s*address\s*:?/i]));

  // MSEDCL consumer numbers are numeric; never accept OCR-confused alphabetic strings like ogle78E3I082.
  const caPatterns=[/consumer account number ca no/,/consumer account number/,/consumer account no/,/ca no/];
  let caRaw = fromRightOfLabel(caPatterns, v=>v) || getAfter([/consumer\s*account\s*number\s*(?:\(\s*ca\s*no\.?\s*\))?\s*:?/i, /\bca\s*no\.?\s*:?/i, /consumer\s*number\s*:?/i]);
  const caDigits = (caRaw.match(/\d[\d\s-]{8,18}\d/) || [""])[0].replace(/\D/g, "");
  const ca = /^\d{10,15}$/.test(caDigits) ? caDigits : "";

  let mobileRaw = fromRightOfLabel([/customer mobile number/,/mobile number/,/^mobile$/], v=>v) || getAfter([/customer\s*mobile\s*(?:number)?\s*:?/i, /^\s*mobile(?:\s*(?:number|no\.?))?\s*:?/i]);
  const mobileMatch = mobileRaw.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b/);
  const mobile = mobileMatch ? mobileMatch[0].replace(/^\+91[\s-]?/, "") : "";

  // Pincode: only a 6-digit value after its own label, or a standalone 6-digit token near address.
  let pinRaw = fromRightOfLabel([/^pincode$/,/^pin code$/], v=>v) || getAfter([/\b(?:pin\s*code|pincode)\s*:?/i]);
  let pincode = (pinRaw.match(/\b[1-9]\d{5}\b/) || [""])[0];
  if (!pincode) {
    const addressLine = getAfter([/address\s*of\s*premises\s*for\s*installation\s*:?/i, /installation\s*address\s*:?/i]);
    pincode = (addressLine.match(/\b[1-9]\d{5}\b/) || [""])[0];
  }

  const capacity = (patterns) => {
    const v = stopAtMeta(getAfter(patterns));
    const m = v.match(/^\s*(\d{1,2}(?:\.\d{1,3})?)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 100) return String(n);
    }
    const compact = v.match(/^\s*([1-9])000\b/);
    return compact ? `${compact[1]}.000` : "";
  };
  const sanctioned = capacity([/sanctioned\s*load\s*\(?\s*kw\s*\)?\s*:?/i]);
  const proposed = capacity([/proposed\s*capacity\s*\(?\s*kwp\s*\)?\s*:?/i]);
  const costRaw = stopAtMeta(getAfter([/total\s*(?:installation\s*)?cost\s*\(?\s*(?:₹|rs\.?|inr)?\s*\)?\s*:?/i]));
  const totalCost = (costRaw.match(/^\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i) || [])[1]?.replace(/,/g, "") || "";
  const dateRaw = getAfter([/portal\s*application\s*date\s*:?/i, /application\s*(?:submission\s*)?date\s*:?/i]);
  const dateMatch = dateRaw.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/);
  const applicationDate = dateMatch?.[1] || "";
  const vendor = stopAtMeta(getAfter([/vendor\s*\/\s*company\s*name\s*:?/i, /name\s*of\s*vendor\s*:?/i, /^vendor\s*name\s*:?/i]));
  const result = { consumerName:name, consumerNumber:ca, customerMobile:mobile, address, pincode, sanctionedCapacity:sanctioned, proposedCapacity:proposed, totalCost, applicationDate, vendorName:vendor };
  return Object.fromEntries(Object.entries(result).filter(([k,v]) => v && !(k === "consumerName" && /division name|category name/i.test(v))));
}
async function readPdfText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const allLines = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = [];
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform?.[5] ?? 0);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x: item.transform?.[4] ?? 0, str: item.str.trim() });
    }
    rows.sort((a,b) => b.y-a.y);
    for (const row of rows) allLines.push(row.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' '));
  }
  return allLines.join('\n');
}
function extractAcknowledgement(text) {
  const t = String(text || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  const pick = (re) => { const m = t.match(re); return m?.[1]?.trim() || ''; };
  const cleanName = (s) => String(s || '')
    .replace(/\s+(?:Date\s*:|Mobile\s*No\.?|Email\s*ID|Consumer Account Number|Application Reference Number)\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ').replace(/^[\s:.-]+|[\s:.-]+$/g, '').trim();

  // Prefer the table's explicit "Name of Applicant" row, but also support the
  // acknowledgement header ("Sh/Smt Vasant Baburao Chaudhari").
  let name = cleanName(pick(/Name\s+of\s+Applicant\s+([A-Za-z][A-Za-z .'-]{2,}?)(?=\s+(?:Mobile\s*No\.?|Email\s*ID|Consumer Account Number|Category of Consumer|Contract Demand|Applied Roof Top|Address of Premises)|$)/i));
  if (!name) {
    name = cleanName(pick(/Sh\s*\/?\s*Smt\.?\s+([A-Za-z][A-Za-z .'-]{2,}?)(?=\s+Date\s*:|\s+1\.\s*Your application|\s+Application Reference Number|$)/i));
  }
  if (!name) {
    const idx = t.search(/Name\s+of\s+Applicant/i);
    if (idx >= 0) {
      const tail = t.slice(idx).replace(/^Name\s+of\s+Applicant/i, '');
      const m = tail.match(/([A-Za-z][A-Za-z .'-]{2,}?)(?=\s+(?:Mobile|Email|Consumer|Category|Contract|Applied|Address)|$)/i);
      if (m) name = cleanName(m[1]);
    }
  }

  const mobile = pick(/Mobile\s*No\.?\s*[:\-]?\s*([6-9]\d{9})\b/i);

  // MSEDCL CA number in this acknowledgement is a 12-digit number. Capture
  // the first contiguous numeric token after the exact Discom label, not
  // neighbouring row digits or bank account details.
  let consumerNumber = '';
  const caLabel = /Consumer\s+Account\s+Number\s+in\s+Discom/i.exec(t);
  if (caLabel) {
    const tail = t.slice(caLabel.index + caLabel[0].length, caLabel.index + caLabel[0].length + 100);
    const candidates = tail.match(/\b\d{10,15}\b/g) || [];
    consumerNumber = candidates.find(v => v.length === 12) || candidates[0] || '';
  }

  const sanctionedCapacity = pick(/(?:Contract Demand\s*\/\s*Sanctioned Load in Discom|Sanctioned Load)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)\s*kW/i);
  const proposedCapacity = pick(/(?:Applied Roof Top Solar Capacity\s*\(in kWp\)|Applied Capacity)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const pincode = pick(/PIN\s*Code\s*:\s*([1-9]\d{5})/i);
  const district = pick(/District\s*:\s*([A-Za-z .'-]+?)(?=\s+(?:State\s*:|PIN\s*Code\s*:))/i);
  const applicationDate = pick(/Application Reference Number\s*\/\s*Date\s+[A-Z0-9-]+\s*\/\s*(\d{2}[-/]\d{2}[-/]\d{4})/i) || pick(/\bDate\s*:\s*(\d{2}[-/]\d{2}[-/]\d{4})/i);
  let address = pick(/Address of Premises for Installation\s*:?\s*([\s\S]*?)(?=\s+3\.\s*Your application|\s+Self-Declaration|$)/i);
  address = address.replace(/\s*(?:District\s*:|State\s*:|PIN\s*Code\s*:)[\s\S]*$/i, '').replace(/\s+/g,' ').replace(/[,:;\s]+$/,'').trim();
  const existingRaw = pick(/Already Installed Roof Top Solar Capacity\s*\(if\s*any\)\s*\(in kWp\)\s*(-|[0-9]+(?:\.[0-9]+)?)/i);
  const existingCapacity = existingRaw && existingRaw !== '-' ? existingRaw : '';
  return Object.fromEntries(Object.entries({
    consumerName:name,
    consumerNumber:/^\d{12}$/.test(consumerNumber)?consumerNumber:'',
    customerMobile:/^[6-9]\d{9}$/.test(mobile)?mobile:'',
    address,pincode,district,sanctionedCapacity,proposedCapacity,existingCapacity,applicationDate,vendorName:''
  }).filter(([k,v])=>v));
}

function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function Labeled({label,children}) { return <label className="field"><span>{label}</span>{children}</label>; }
function textValue(v) { return v == null ? "" : String(v); }

export default function App() {
  const [activePage,setActivePage] = useState("documents");
  const [form,setForm] = useState(initial);
  const [status,setStatus] = useState("");
  const [ocrBusy,setOcrBusy] = useState(false);
  const [ocrText,setOcrText] = useState("");
  const [aadhaar,setAadhaar] = useState(null);
  const [aadhaarPreview,setAadhaarPreview] = useState("");
  const [customPhone,setCustomPhone] = useState("");
  const [phones,setPhones] = useState([{label:"Dhule",number:"9765312906"},{label:"Pune",number:"8485056509"}]);
  const [selectedPhone,setSelectedPhone] = useState("9765312906");
  const inverterSizes = [1, 1.5, 2, 2.5, 3, 3.3, 4, 5, 6, 8, 10, 12, 15];
  const update = (key,value) => setForm(p => {
    const next = {...p, [key]: value};
    if (["moduleWattage","customWattage","numberOfModules"].includes(key)) {
      const wattage = Number(next.moduleWattage === "other" ? next.customWattage : next.moduleWattage);
      const count = Number(next.numberOfModules);
      if (wattage > 0 && count > 0) {
        const kw = wattage * count / 1000;
        const standard = inverterSizes.find(size => size >= kw) ?? Number(kw.toFixed(1));
        next.inverterCapacity = String(standard);
      } else {
        next.inverterCapacity = "";
      }
    }
    return next;
  });
  const onUpload = async (file) => {
    if (!file) return;
    setOcrBusy(true);
    try {
      let extracted = {};
      let text = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setStatus('Reading acknowledgement PDF text…');
        text = await readPdfText(file);
        setOcrText(text);
        extracted = extractAcknowledgement(text);
        if (!Object.keys(extracted).length) {
          setStatus('PDF opened, but expected acknowledgement labels were not found. Please check the PDF is the PM Surya Ghar acknowledgement.');
          return;
        }
      } else if (file.type.startsWith('image/')) {
        setStatus('Reading screenshot with OCR…');
        const worker = await createWorker('eng');
        const result = await worker.recognize(file, { tessedit_pageseg_mode: '6' });
        await worker.terminate();
        text = result.data.text || '';
        setOcrText(text);
        extracted = fieldMap(result.data);
      } else {
        setStatus('Please upload a PDF acknowledgement or PNG/JPG/WebP screenshot.');
        return;
      }
      setForm(p=>({...p,...extracted,installationDate:todayISO(),email:p.email || emails[0],installerPhone:selectedPhone}));
      setStatus(`Read complete. ${Object.keys(extracted).length} fields filled—please verify each field.`);
    } catch (e) {
      console.error(e);
      setStatus('Could not read this file. Try a text-based acknowledgement PDF or a clearer screenshot.');
    } finally { setOcrBusy(false); }
  };
  const onAadhaar = (file) => {
    if (!file) return;
    if (!["image/jpeg","image/png","application/pdf"].includes(file.type)) { setStatus("Aadhaar file must be JPG, PNG, or PDF."); return; }
    if (file.size > 8*1024*1024) { setStatus("Aadhaar file must be smaller than 8 MB."); return; }
    setAadhaar(file);
    if (file.type.startsWith("image/")) setAadhaarPreview(URL.createObjectURL(file)); else setAadhaarPreview("");
    setStatus("Aadhaar file selected. It stays in this browser session unless you choose to export it.");
  };
  const addPhone = () => {
    const n = customPhone.replace(/\D/g,"");
    if (!/^\d{10}$/.test(n)) { setStatus("Enter a valid 10-digit mobile number."); return; }
    if (phones.some(p=>p.number===n)) { setStatus("That mobile number is already listed."); return; }
    const next = [...phones,{label:"Custom",number:n}]; setPhones(next); setSelectedPhone(n); update("installerPhone",n); setCustomPhone(""); setStatus("Mobile number added.");
  };
  const hasValidPanelWattage = () => {
    const value = form.moduleWattage === "other" ? form.customWattage : form.moduleWattage;
    return Number(value) > 0;
  };
  const requirePanelWattage = () => {
    if (hasValidPanelWattage()) return true;
    setStatus("Please select Panel Wattage (Wp) before continuing or downloading.");
    window.alert("Please select Panel Wattage (Wp) before continuing or downloading.");
    return false;
  };
  const saveFields = () => {
    if (!requirePanelWattage()) return;
    const blob = new Blob([JSON.stringify({...form, selectedCompanyMobile:selectedPhone},null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="solar-customer-data.json"; a.click(); URL.revokeObjectURL(url);
  };
  const generatePdf = async (kind) => {
    if (!requirePanelWattage()) return;
    try {
      setStatus(`Generating ${kind} PDF...`);
      const clean = value => String(value ?? "").trim();
      if (kind === "model-agreement") {
        // Reuse the original Tejaswini Sales software's own Model Agreement generation/layout logic.
        const originalForm = {
          consumerName: clean(form.consumerName),
          consumerNumber: clean(form.consumerNumber),
          address: clean(form.address),
          companyName: clean(form.companyName || form.vendorName),
          installedCapacityRooftop: clean(form.proposedCapacity),
          moduleManufacturer: clean(form.moduleManufacturer === "Other" ? form.customModuleManufacturer : form.moduleManufacturer),
          numberOfModules: clean(form.numberOfModules),
          moduleWattage: clean(form.moduleWattage === "other" ? form.customWattage : form.moduleWattage),
          inverterMake: clean(form.inverterMake === "Other" ? form.customInverterMake : form.inverterMake),
          inverterCapacity: clean(form.inverterCapacity),
          totalCost: clean(form.totalCost),
          district: clean(form.district),
          agreementDate: clean(form.applicationDate),
          vendorName: clean(form.vendorName || form.companyName),
          customerSignature: form.customerSignature,
          companyStamp: form.companyStamp
        };
        await generateModelAgreement(originalForm, true);
        setStatus("Model Agreement generated using the original Tejaswini Sales software layout. Review all filled details before signing.");
        return;
      }
      const originalForm = {
        consumerName: clean(form.consumerName),
        consumerNumber: clean(form.consumerNumber),
        mobileNumber: clean(form.customerMobile),
        email: clean(form.email),
        address: clean(form.address),
        reArrangementType: "Net Metering Arrangement",
        reSource: "solar",
        sanctionedCapacity: clean(form.sanctionedCapacity),
        capacityType: "single phase",
        projectModel: "NA",
        installedCapacityRooftop: clean(form.proposedCapacity),
        installedCapacityTotal: clean(form.proposedCapacity),
        installedCapacityGround: "NA",
        installationDate: clean(form.installationDate),
        inverterCapacity: clean(form.inverterCapacity),
        inverterMake: clean(form.inverterMake === "Other" ? form.customInverterMake : form.inverterMake),
        numberOfModules: clean(form.numberOfModules),
        moduleCapacity: clean(form.moduleWattage === "other" ? form.customWattage : form.moduleWattage),
        category: clean(form.category || "Residential"),
        warrantyDetails: clean(form.warrantyDetails),
        sanctionNumber: clean(form.sanctionNumber),
        moduleManufacturer: clean(form.moduleManufacturer === "Other" ? form.customModuleManufacturer : form.moduleManufacturer),
        moduleWattage: clean(form.moduleWattage === "other" ? form.customWattage : form.moduleWattage),
        moduleSerialNumbers: [],
        inverterModel: clean(form.inverterModel),
        inverterRating: clean(form.inverterCapacity),
        chargeControllerType: "",
        earthingCount: "3",
        lightningArrester: "",
        manufacturingYear: "",
        aadharNumber: "",
        cellManufacturer: clean(form.moduleManufacturer === "Other" ? form.customModuleManufacturer : form.moduleManufacturer),
        cellGSTInvoice: "",
        cellGSTDate: "",
        installerName: clean(form.companyName || form.vendorName),
        installerDesignation: "",
        installerPhone: clean(form.companyPhone || ""),
        installerEmail: "",
        companyName: clean(form.companyName || form.vendorName),
        msedclOfficerName: "",
        msedclOfficerDesignation: "",
        msedclInspectionDate: "",
        agreementDate: clean(form.applicationDate),
        consumerAddress: clean(form.address),
        systemCapacity: clean(form.proposedCapacity),
        vendorName: clean(form.vendorName || form.companyName),
        msedclRepresentative: "",
        totalCost: clean(form.totalCost),
        district: clean(form.district),
        invertercapacity: clean(form.inverterCapacity),
        invertermanufacture: clean(form.inverterMake === "Other" ? form.customInverterMake : form.inverterMake),
        aadharImage: (kind === "wcr" && aadhaar && aadhaar.type.startsWith("image/")) ? await fileToDataUrl(aadhaar) : "",
        aadharNumber: "",
      };
      if (kind === "annexure") {
        await generateDCR(originalForm, true);
        setStatus("Annexure-I generated using the original software's DCR/Annexure generator.");
        return;
      }
      if (kind === "wcr") {
        await generateWCR(originalForm, true);
        setStatus("Work Completion Report generated using the original software's WCR generator.");
        return;
      }
    } catch (e) {
      console.error("PDF generation failed:", e);
      const message = e?.message || String(e);
      setStatus(`PDF generation failed: ${message}`);
      window.alert(`PDF generation failed: ${message}`);
    }
  };

  const capacity = useMemo(()=> {
    const w=Number(form.moduleWattage === "other" ? form.customWattage : form.moduleWattage), n=Number(form.numberOfModules);
    return w>0&&n>0 ? ((w*n)/1000).toFixed(3) : "";
  },[form.moduleWattage,form.customWattage,form.numberOfModules]);
  const input = (key,placeholder="",type="text") => <input type={type} value={form[key] ?? ""} placeholder={placeholder} onChange={e=>update(key,e.target.value)} />;
  if (activePage === "wcr") return <WorkCompletionPage onBack={() => setActivePage("documents")} />;
  return <main className="shell">
    <header className="top"><div className="mark">TS</div><div><p className="eyebrow">TEJASWINI SALES</p><h1>Solar Document Studio</h1><p className="muted">Acknowledgement PDF or screenshot · customer details · three PDF drafts</p></div><span className="pill">LOCAL-FIRST MVP</span><button className="secondary" onClick={()=>setActivePage("wcr")}>＋ Work Completion Report</button></header>
    <section className="intro"><div><h2>Upload acknowledgement PDF. Less repetitive typing.</h2><p>Upload the PM Surya Ghar acknowledgement PDF or portal screenshot. Review extracted fields, fill missing details manually, and prepare document drafts.</p></div></section>
    {status && <div className="notice" role="status">{ocrBusy ? "◌ " : "ℹ "}{status}</div>}
    <section className="card">
      <div className="sectionHead"><div><span className="step">01</span><h2>Acknowledgement PDF or screenshot</h2></div><span className="muted">PDF text extraction preferred; verify every field.</span></div>
      <label className="upload" onDragEnter={e=>{e.preventDefault();e.stopPropagation();}} onDragOver={e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect="copy";}} onDrop={e=>{e.preventDefault();e.stopPropagation();const file=e.dataTransfer?.files?.[0];if(file)onUpload(file);}}><input type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/webp" onChange={e=>onUpload(e.target.files?.[0])}/><span className="uploadIcon">↑</span><strong>{ocrBusy?"Reading file…":"Choose acknowledgement PDF or screenshot"}</strong><small>PDF, PNG, JPG or WebP · processed in your browser</small><small>Or drag and drop the file here</small></label>
      {ocrText && <details className="raw"><summary>View OCR text for troubleshooting</summary><pre>{ocrText}</pre></details>}
    </section>
    <section className="card">
      <div className="sectionHead"><div><span className="step">02</span><h2>Company contact settings</h2></div><span className="muted">Used for vendor contact fields, not customer email.</span></div>
      <div className="grid two">
        <Labeled label="Company email"><select value={form.email} onChange={e=>update("email",e.target.value)}>{emails.map(e=><option key={e}>{e}</option>)}</select></Labeled>
        <Labeled label="Company mobile number"><select value={selectedPhone} onChange={e=>{setSelectedPhone(e.target.value);update("installerPhone",e.target.value)}}>{phones.map(p=><option key={p.number} value={p.number}>{p.number.replace(/(\d{5})(\d{5})/,"$1 $2")} — {p.label}</option>)}</select></Labeled>
      </div>
      <div className="addPhone"><input value={customPhone} onChange={e=>setCustomPhone(e.target.value)} inputMode="numeric" placeholder="Add another 10-digit mobile number"/><button className="secondary" onClick={addPhone}>＋ Add number</button></div>
    </section>
    <section className="card">
      <div className="sectionHead"><div><span className="step">03</span><h2>Customer & portal details</h2></div><span className="muted">Review and correct OCR values.</span></div>
      <div className="grid two">
        <Labeled label="Customer / premises owner name">{input("consumerName","Full name")}</Labeled>
        <Labeled label="Consumer account number (CA No.)">{input("consumerNumber","Consumer number")}</Labeled>
        <Labeled label="Customer mobile number">{input("customerMobile","Customer mobile","tel")}</Labeled>
        <Labeled label="District">{input("district","District")}</Labeled>
        <Labeled label="Installation address"><textarea rows="3" value={form.address} onChange={e=>update("address",e.target.value)} placeholder="Full installation address"/></Labeled>
        <Labeled label="Pincode">{input("pincode","6-digit pincode")}</Labeled>
        <Labeled label="Sanctioned load (kW)">{input("sanctionedCapacity","e.g. 0.760")}</Labeled>
        <Labeled label="Proposed capacity (kWp)">{input("proposedCapacity","e.g. 4.000")}</Labeled>
        <Labeled label="Existing installed capacity (kWp)">{input("existingCapacity","e.g. 0.000")}</Labeled>
        <Labeled label="Total installation cost (₹)">{input("totalCost","e.g. 240000")}</Labeled>
        <Labeled label="Portal application date">{input("applicationDate","DD/MM/YYYY")}</Labeled>
        <Labeled label="Installation date">{input("installationDate","","date")}</Labeled>
        <Labeled label="Vendor / company name">{input("companyName","TEJASWINI SALES")}</Labeled>
      </div>
    </section>
    <section className="card">
      <div className="sectionHead"><div><span className="step">04</span><h2>Solar equipment</h2></div><span className="muted">Defaults are editable.</span></div>
      <div className="grid two">
        <Labeled label="Panel manufacturer"><select value={form.moduleManufacturer} onChange={e=>update("moduleManufacturer",e.target.value)}><option>Waaree</option><option>Mundra Solar</option><option>Tata Power Solar</option><option>Other</option></select></Labeled>
        {form.moduleManufacturer==="Other" && <Labeled label="Custom panel brand">{input("customModuleManufacturer","Enter panel brand")}</Labeled>}
        <Labeled label="Panel wattage (Wp)"><select required value={form.moduleWattage} onChange={e=>update("moduleWattage",e.target.value)}><option value="">Select panel wattage</option>{[540,545,550,555,575,585,610,615].map(w=><option key={w} value={String(w)}>{w} W</option>)}<option value="other">Other — enter below</option></select></Labeled>
        {form.moduleWattage==="other" && <Labeled label="Custom wattage (Wp)">{input("customWattage","e.g. 600","number")}</Labeled>}
        <Labeled label="Number of panels">{input("numberOfModules","e.g. 7","number")}</Labeled>
        <Labeled label="ALMM Model Number">{input("moduleModelNumber","Model number")}</Labeled>
        <Labeled label="Calculated panel capacity (kWp)"><input value={capacity || "Enter wattage and quantity"} readOnly/></Labeled>
        <Labeled label="Inverter brand"><select value={form.inverterMake} onChange={e=>update("inverterMake",e.target.value)}><option>PV Blink</option><option>Waaree</option><option>XWatt</option><option>Polycab</option><option>Other</option></select></Labeled>
        {form.inverterMake==="Other" && <Labeled label="Custom inverter brand">{input("customInverterMake","Enter inverter brand")}</Labeled>}
        <Labeled label="Inverter model">{input("inverterModel","Model number")}</Labeled>
        <Labeled label="Inverter capacity (kW)"><select value={form.inverterCapacity} onChange={e=>update("inverterCapacity",e.target.value)}><option value="">Auto from panel capacity</option>{inverterSizes.map(size=><option key={size} value={String(size)}>{size} kW</option>)}</select></Labeled>
      </div>
    </section>
    <section className="card">
      <div className="sectionHead"><div><span className="step">05</span><h2>Aadhaar image (manual upload)</h2></div><span className="muted">Photo is appended after WCR.</span></div>
      <label className="upload compact" onDragEnter={e=>{e.preventDefault();e.stopPropagation();}} onDragOver={e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect="copy";}} onDrop={e=>{e.preventDefault();e.stopPropagation();const file=e.dataTransfer?.files?.[0];if(file)onAadhaar(file);}}><input type="file" accept="image/png,image/jpeg" onChange={e=>onAadhaar(e.target.files?.[0])}/><span className="uploadIcon">＋</span><strong>{aadhaar ? aadhaar.name : "Upload Aadhaar photo (JPG or PNG)"}</strong><small>Or drag and drop the Aadhaar image here</small><small>Max 8 MB. It will be attached as a page after the WCR.</small></label>
      {aadhaarPreview && <img className="aadhaarPreview" src={aadhaarPreview} alt="Aadhaar upload preview"/>}

    </section>
    <section className="card">
      <div className="sectionHead"><div><span className="step">06</span><h2>Generate document drafts</h2></div></div>
      <p className="muted">These PDFs use the supplied Annexure-I, WCR and Model Agreement pages as templates. Review all filled values, placement and signature areas before official submission.</p>
      <div className="docGrid">
        <article className="doc"><span className="docNo">A</span><h3>Annexure</h3><p>Customer, system and vendor summary.</p><button onClick={()=>generatePdf("annexure")}>↓ Download PDF</button></article>
        <article className="doc"><span className="docNo">W</span><h3>Work Completion Report</h3><p>Equipment details and completion summary.</p><button onClick={()=>generatePdf("wcr")}>↓ Download PDF</button></article>
        <article className="doc"><span className="docNo">M</span><h3>Model Agreement</h3><p>Draft agreement details and signature lines.</p><button onClick={()=>generatePdf("model-agreement")}>↓ Download PDF</button></article>
      </div>
      <div className="bottomActions"><button className="secondary" onClick={saveFields}>Export form data (JSON)</button><button className="secondary" onClick={()=>{setForm(initial);setOcrText("");setAadhaar(null);setAadhaarPreview("");setStatus("Form cleared.");}}>Clear form</button></div>
    </section>
    <footer>Tejaswini Solar Document Studio · Independent starter project · Keep customer data and identity documents secure.</footer>
  </main>;
}
