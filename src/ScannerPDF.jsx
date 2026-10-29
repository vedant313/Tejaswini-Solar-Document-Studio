import React, { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

const KB = 1024, MB = 1024 * KB;
const prettySize = n => n >= MB ? (n / MB).toFixed(2) + " MB" : (n / KB).toFixed(1) + " KB";
const safeName = name => name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_");
const keyOf = f => f.name + "|" + f.size + "|" + f.lastModified;
const isPdf = f => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isImage = f => f.type.startsWith("image/") && /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(f.name);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not open image: " + file.name)); };
    img.src = url;
  });
}
async function sourcePages(file, dpi, onProgress) {
  const pages = [];
  if (isImage(file)) {
    const img = await loadImage(file), canvas = document.createElement("canvas");
    const factor = Math.min(2, Math.max(1, dpi / 150));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    pages.push({ canvas, sourceName: file.name });
    return pages;
  }
  if (isPdf(file)) {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        onProgress("Preparing source page " + i + " of " + pdf.numPages + "…");
        const page = await pdf.getPage(i), viewport = page.getViewport({ scale: Math.min(2.5, Math.max(1, dpi / 72)) });
        const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d", { alpha: false }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, background: "#ffffff" }).promise;
        pages.push({ canvas, sourceName: file.name }); page.cleanup();
      }
    } finally { await pdf.destroy(); }
    return pages;
  }
  throw new Error("Unsupported file type: " + file.name);
}
async function recognizePages(pages, onProgress) {
  const worker = await createWorker("eng");
  try {
    const words = [], textParts = [];
    for (let i = 0; i < pages.length; i++) {
      onProgress("OCR text recognition: page " + (i + 1) + " of " + pages.length + "…");
      const result = await worker.recognize(pages[i].canvas);
      const c = pages[i].canvas;
      textParts.push(result.data.text || "");
      words.push((result.data.words || []).filter(w => w.text?.trim() && w.bbox).map(w => ({
        text: w.text.trim(),
        x: w.bbox.x0 / c.width, y: w.bbox.y0 / c.height,
        w: (w.bbox.x1 - w.bbox.x0) / c.width, h: (w.bbox.y1 - w.bbox.y0) / c.height
      })));
    }
    return { words, text: textParts.join("\n").toLowerCase() };
  } finally { await worker.terminate(); }
}
function detectDocumentType(text) {
  const t = (text || "").toLowerCase();
  if (/work completion report|work completion certificate|completion of work|installation completion/.test(t)) return "wcr";
  if (/annexure\s*[-–:]?\s*i|annexure-i|dcr certificate|detailed project report|module serial number|solar photovoltaic modules/.test(t)) return "annexure";
  if (/model agreement|agreement between|consumer.*vendor|vendor.*consumer|terms and conditions/.test(t)) return "model";
  return "unknown";
}
function targetForDocument(type) { return type === "model" ? "2mb" : type === "wcr" || type === "annexure" ? "299kb" : "custom"; }
async function makePdf(pages, ocrWords, scale, quality, searchable, onProgress) {
  let out = new jsPDF({ orientation: "p", unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  for (let i = 0; i < pages.length; i++) {
    onProgress("Building PDF page " + (i + 1) + " of " + pages.length + "…");
    const source = pages[i].canvas;
    const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const pageW = 595.28, pageH = 841.89, margin = 20;
    const ratio = Math.min((pageW - margin * 2) / width, (pageH - margin * 2) / height);
    const drawW = width * ratio, drawH = height * ratio, x = (pageW - drawW) / 2, y = (pageH - drawH) / 2;
    if (i > 0) out.addPage("a4", "portrait");
    out.addImage(canvas.toDataURL("image/jpeg", quality), "JPEG", x, y, drawW, drawH, undefined, "FAST");
    if (searchable && ocrWords?.[i]?.length) {
      out.setFont("helvetica", "normal"); out.setTextColor(0, 0, 0);
      for (const word of ocrWords[i]) {
        const fontSize = Math.max(2, Math.min(18, word.h * drawH));
        out.setFontSize(fontSize);
        out.text(word.text, x + word.x * drawW, y + (word.y + word.h * 0.85) * drawH, { renderingMode: "invisible", charSpace: 0 });
      }
    }
    canvas.width = 1; canvas.height = 1;
  }
  return out.output("blob");
}

export default function ScannerPDF({ onBack }) {
  const [files, setFiles] = useState([]);
  const [dpi, setDpi] = useState("200");
  const [colorMode, setColorMode] = useState("color");
  const [target, setTarget] = useState("auto");
  const [documentType, setDocumentType] = useState("auto");
  const [scannerReady, setScannerReady] = useState(false);
  const [customKB, setCustomKB] = useState("1000");
  const [quality, setQuality] = useState(65);
  const [searchable, setSearchable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

  const addFiles = list => {
    const picked = Array.from(list || []);
    const accepted = picked.filter(f => isPdf(f) || isImage(f));
    const skipped = picked.length - accepted.length;
    setFiles(prev => { const all = [...prev, ...accepted], seen = new Set(); return all.filter(f => { const k = keyOf(f); if (seen.has(k)) return false; seen.add(k); return true; }); });
    setResult(null);
    setStatus(skipped ? "Skipped " + skipped + " unsupported file(s). Use PDF, JPG, PNG or WebP." : "");
    if (inputRef.current) inputRef.current.value = "";
  };
  const removeFile = index => { setFiles(prev => prev.filter((_, i) => i !== index)); setResult(null); };
  const reset = () => { setFiles([]); setResult(null); setStatus(""); if (inputRef.current) inputRef.current.value = ""; };

  const process = async () => {
    if (!files.length || busy) return;
    setBusy(true); setResult(null);
    const pages = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setStatus("Opening file " + (i + 1) + " of " + files.length + ": " + files[i].name);
        const next = await sourcePages(files[i], Number(dpi), setStatus);
        pages.push(...next);
      }
      if (!pages.length) throw new Error("No pages were found in the selected files.");
      const ocrResult = searchable ? await recognizePages(pages, setStatus) : { words: [], text: "" };
      const detected = documentType === "auto" ? detectDocumentType(ocrResult.text) : documentType;
      const effectiveTarget = target === "auto" ? targetForDocument(detected) : target;
      let blob;
      const attempts = effectiveTarget === "299kb"
        ? [{ scale: 0.55, quality: 0.48 }, { scale: 0.42, quality: 0.36 }, { scale: 0.32, quality: 0.27 }, { scale: 0.24, quality: 0.2 }, { scale: 0.17, quality: 0.14 }]
        : effectiveTarget === "2mb"
          ? [{ scale: 1, quality: 0.68 }, { scale: 0.82, quality: 0.55 }, { scale: 0.65, quality: 0.42 }, { scale: 0.5, quality: 0.3 }, { scale: 0.38, quality: 0.22 }]
          : effectiveTarget === "custom"
            ? [{ scale: 1, quality: quality / 100 }, { scale: 0.82, quality: Math.max(0.25, quality / 100 - 0.12) }, { scale: 0.65, quality: Math.max(0.2, quality / 100 - 0.22) }, { scale: 0.5, quality: Math.max(0.16, quality / 100 - 0.32) }, { scale: 0.38, quality: 0.18 }]
            : [{ scale: 1, quality: quality / 100 }];
      const limit = effectiveTarget === "299kb" ? 299 * KB : effectiveTarget === "2mb" ? 2 * MB : Number(customKB) * KB;
      for (let i = 0; i < attempts.length; i++) {
        const chosen = attempts[i];
        blob = await makePdf(pages, ocrResult.words, chosen.scale, chosen.quality, searchable, setStatus);
        if (effectiveTarget === "quality" || blob.size <= limit) break;
      }
      const typeName = { model: "model-agreement", wcr: "work-completion-report", annexure: "annexure", unknown: "document" }[detected] || "document";
      const name = (files.length === 1 ? safeName(files[0].name) : "canon-scan-" + new Date().toISOString().slice(0, 10)) + "-" + typeName + ".pdf";
      const tooLarge = effectiveTarget !== "quality" && blob.size > limit;
      setResult({ blob, url: URL.createObjectURL(blob), name, size: blob.size, pages: pages.length, tooLarge, searchable, detected, effectiveTarget });
      setStatus("Finished. Detected: " + (typeName.replace(/-/g, " ")) + ". Target: " + (effectiveTarget === "299kb" ? "under 300 KB" : effectiveTarget === "2mb" ? "under 2 MB" : effectiveTarget === "quality" ? "high quality" : customKB + " KB") + (tooLarge ? "; target not reached, please review quality." : "."));
    } catch (error) {
      console.error(error); setStatus("Could not finish scanning PDF: " + (error?.message || "Unknown error"));
    } finally {
      pages.forEach(p => { if (p.canvas) { p.canvas.width = 1; p.canvas.height = 1; } });
      setBusy(false);
    }
  };

  const connectScanner = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8765/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Bridge response " + response.status);
      const data = await response.json();
      setScannerReady(Boolean(data.ready));
      setStatus(data.ready ? "Canon scanner bridge is connected. You can scan directly from this website." : "Scanner bridge is not ready.");
    } catch {
      setScannerReady(false);
      setStatus("Scanner helper is not running. Start TejaswiniScannerBridge.exe on this Windows PC, then click Connect again.");
    }
  };
  const scanFromWebsite = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setStatus("Sending scan request to the local Canon/WIA scanner…");
      const response = await fetch("http://127.0.0.1:8765/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dpi: Number(dpi), colorMode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scanner request failed");
      const blob = await (await fetch(data.dataUrl)).blob();
      const file = new File([blob], data.fileName || ("canon-scan-" + Date.now() + ".jpg"), { type: "image/jpeg", lastModified: Date.now() });
      setFiles(prev => [...prev, file]);
      setResult(null);
      setStatus("Scan received in the website. Scan the next page if needed, then choose document type/size and create PDF.");
      setScannerReady(true);
    } catch (error) {
      setScannerReady(false);
      setStatus("Could not scan directly: " + (error?.message || "Start the Windows scanner helper and confirm WIA support."));
    } finally { setBusy(false); }
  };
  const openWindowsScanHelp = () => setStatus("For direct website scanning, the local Tejaswini Windows Scanner Bridge must be running and your Canon driver must support WIA. The bridge source and setup notes are in the project's windows-scanner-bridge folder.");
  return <main className="shell">
    <header className="top"><div className="mark">TS</div><div><p className="eyebrow">TEJASWINI SALES</p><h1>Scanner &amp; PDF</h1><p className="muted">Prepare scanned documents, optimize file size and add searchable OCR text.</p></div><div className="headerActions"><button className="secondary" onClick={onBack}>← Back to Document Studio</button></div></header>
    <section className="intro"><div><span className="introKicker">CANON USB SCANNER WORKFLOW</span><h2>Scan, optimize and save</h2><p>Scan with Canon’s Windows software, then combine pages, add OCR text and target the PDF size required for your solar paperwork.</p></div><div className="introMeta"><span>PDF or image input</span><span>OCR: English</span><span>Processed locally in browser</span></div></section>
    <section className="card"><div className="sectionHead"><div><span className="step">01</span><h2>Scan from your Canon printer</h2></div></div>
      <div className="scannerGuide"><div><strong>Recommended scan settings</strong><p>Text documents: 200 DPI, Grayscale or Black &amp; White. Photos or faint documents: 300 DPI, Color.</p><small>In Windows, open <b>Windows Scan</b> or <b>Canon IJ Scan Utility</b>, choose the Canon scanner, then save scanned pages as PDF or JPG. Save multiple pages as separate images or one PDF.</small></div><button className="secondary" onClick={openWindowsScanHelp}>How to open scanner software</button></div>
      <div className="grid two scannerSettings"><label className="field"><span>Recommended DPI (set this in Canon software)</span><select value={dpi} onChange={e=>setDpi(e.target.value)}><option value="150">150 DPI — smaller files</option><option value="200">200 DPI — text documents</option><option value="300">300 DPI — clearer detail</option></select></label><label className="field"><span>Suggested scan color mode</span><select value={colorMode} onChange={e=>setColorMode(e.target.value)}><option value="color">Color</option><option value="grayscale">Grayscale</option><option value="bw">Black &amp; White</option></select></label></div>
      <p className="muted">These are guidance settings only; choose the same DPI and color mode in the Canon scanning app before scanning. This webpage cannot directly control a USB scanner by itself.</p>
    </section>
    <section className="card"><div className="sectionHead"><div><span className="step">02</span><h2>Import scanned pages</h2></div><span className="muted">{files.length} file(s)</span></div>
      <label className="upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}><input ref={inputRef} type="file" multiple accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/bmp,image/tiff" onChange={e=>addFiles(e.target.files)}/><span className="uploadIcon">↑</span><strong>Select scanned PDFs or images</strong><small>PDF, JPG, PNG, WebP, BMP or TIFF · multiple files supported</small></label>
      {files.length > 0 && <div className="batchFileList">{files.map((f,i)=><div className="batchFile" key={keyOf(f)}><span className="batchFileIndex">{i+1}</span><div className="batchFileInfo"><strong>{f.name}</strong><small>{prettySize(f.size)}</small></div><button className="secondary" disabled={busy} onClick={()=>removeFile(i)}>Remove</button></div>)}</div>}
      {files.length > 0 && <div className="bottomActions"><button className="secondary" disabled={busy} onClick={()=>inputRef.current?.click()}>＋ Add more files</button><button className="secondary" disabled={busy} onClick={reset}>Clear all</button></div>}
    </section>
    <section className="card"><div className="sectionHead"><div><span className="step">03</span><h2>PDF quality and file size</h2></div></div>
      <div className="compressModes">
        <button className={target==="299kb"?"compressMode selected":"compressMode"} onClick={()=>setTarget("299kb")}><strong>Under 299 KB</strong><span>Maximum compression</span><small>Best effort; readability may drop</small></button>
        <button className={target==="2mb"?"compressMode selected":"compressMode"} onClick={()=>setTarget("2mb")}><strong>Under 2 MB</strong><span>Balanced</span><small>Good for many official uploads</small></button>
        <button className={target==="quality"?"compressMode selected":"compressMode"} onClick={()=>setTarget("quality")}><strong>High quality</strong><span>Prioritize clarity</span><small>Output size may be larger</small></button>
      </div>
      <div className="grid two scannerSettings"><label className="field"><span>Image quality: {quality}% (used for High quality)</span><input type="range" min="35" max="95" step="5" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></label><label className="field"><span>Custom target (KB)</span><input type="number" min="100" max="20000" value={customKB} onChange={e=>{setCustomKB(e.target.value);setTarget("custom");}}/><small>Enter a limit like 500 KB or 1000 KB.</small></label></div>
      <label className="scannerCheckbox"><input type="checkbox" checked={searchable} onChange={e=>setSearchable(e.target.checked)}/><span><strong>Make PDF searchable (OCR)</strong><small>Recognizes English text and adds a searchable text layer. OCR can misread faint or handwritten content; always verify the original.</small></span></label>
      <div className="notice">Important: strong compression can reduce readability. The 299 KB and 2 MB targets are best-effort, not guaranteed. Always check the PDF before official submission. Original files are not modified or uploaded to a server.</div>
      <div className="bottomActions"><button disabled={!files.length||busy} onClick={process}>{busy?"Processing…":"⚡ Create PDF"+(searchable?" + OCR":"")}</button></div>
      {status && <div className="notice" role="status">{busy?"◌ ":"ℹ "}{status}</div>}
    </section>
    {result && <section className="card"><div className="sectionHead"><div><span className="step">04</span><h2>PDF ready</h2></div><span className={result.tooLarge?"resultWarning":"resultSuccess"}>{result.tooLarge?"Target not reached":"Ready to download"}</span></div>
      <div className="compressionStats"><div><span>PDF size</span><strong>{prettySize(result.size)}</strong></div><div><span>Pages</span><strong>{result.pages}</strong></div><div><span>OCR text layer</span><strong>{result.searchable?"Enabled":"Off"}</strong></div></div>
      {result.tooLarge && <p className="muted">The selected size target could not be reached without further quality loss. Try fewer pages or a less detailed scan.</p>}
      <div className="bottomActions"><a className="downloadLink" href={result.url} download={result.name}>↓ Download {result.name}</a><a className="downloadLink" href={result.url} target="_blank" rel="noreferrer">Preview PDF</a></div>
    </section>}
    <footer><div className="footerBrand"><strong>TEJASWINI SALES</strong><span>Solar Document Studio</span></div><span className="footerCredit">Designed &amp; engineered by <strong>NEXSA TECHNOLOGIES</strong><br/>Review all scanned pages before official use.</span></footer>
  </main>;
}
