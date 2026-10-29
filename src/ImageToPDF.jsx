import React, { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";

const A4_P = [595.28, 841.89];
const A4_L = [841.89, 595.28];
const prettySize = n => n >= 1024 * 1024 ? (n / (1024 * 1024)).toFixed(2) + " MB" : (n / 1024).toFixed(1) + " KB";
const keyOf = f => f.name + "|" + f.size + "|" + f.lastModified;

export default function ImageToPDF({ onBack }) {
  const [images, setImages] = useState([]);
  const [pageSize, setPageSize] = useState("a4");
  const [orientation, setOrientation] = useState("auto");
  const [fit, setFit] = useState("contain");
  const [margin, setMargin] = useState(24);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("images.pdf");
  const inputRef = useRef(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const addFiles = list => {
    const picked = Array.from(list || []);
    const accepted = picked.filter(f => f.type.startsWith("image/") && /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(f.name));
    const skipped = picked.length - accepted.length;
    setImages(prev => {
      const all = [...prev, ...accepted], seen = new Set();
      return all.filter(f => { const k = keyOf(f); if (seen.has(k)) return false; seen.add(k); return true; });
    });
    if (inputRef.current) inputRef.current.value = "";
    setStatus(skipped ? "Skipped " + skipped + " unsupported file(s). Use JPG, PNG, WebP, GIF, BMP or TIFF images." : "");
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(""); }
  };
  const remove = i => { setImages(prev => prev.filter((_, j) => j !== i)); if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(""); } };
  const move = (i, delta) => setImages(prev => { const next = [...prev], target = i + delta; if (target < 0 || target >= next.length) return prev; [next[i], next[target]] = [next[target], next[i]]; return next; });
  const clear = () => { setImages([]); setStatus(""); if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(""); } if (inputRef.current) inputRef.current.value = ""; };

  const createPDF = async () => {
    if (!images.length || busy) return;
    setBusy(true); setStatus("Preparing " + images.length + " image(s)…");
    try {
      let doc = null;
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        setStatus("Converting image " + (i + 1) + " of " + images.length + ": " + file.name);
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read " + file.name));
          reader.readAsDataURL(file);
        });
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Could not open image: " + file.name));
          image.src = dataUrl;
        });
        const naturalW = img.naturalWidth, naturalH = img.naturalHeight;
        const isLandscape = orientation === "landscape" || (orientation === "auto" && naturalW > naturalH);
        const format = pageSize === "a4" ? (isLandscape ? A4_L : A4_P) : (isLandscape ? [612, 792].reverse() : [612, 792]);
        const [pw, ph] = format;
        if (!doc) doc = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "pt", format: pageSize === "a4" ? "a4" : "letter", compress: true });
        else doc.addPage(pageSize === "a4" ? "a4" : "letter", isLandscape ? "landscape" : "portrait");
        const availableW = pw - margin * 2, availableH = ph - margin * 2;
        const ratio = fit === "fill" ? Math.max(availableW / naturalW, availableH / naturalH) : Math.min(availableW / naturalW, availableH / naturalH);
        const drawW = naturalW * ratio, drawH = naturalH * ratio;
        const x = (pw - drawW) / 2, y = (ph - drawH) / 2;
        let type = "JPEG";
        if (/\.png$/i.test(file.name) || file.type === "image/png") type = "PNG";
        else if (/\.webp$/i.test(file.name) || file.type === "image/webp") type = "WEBP";
        else if (/\.gif$/i.test(file.name) || file.type === "image/gif") type = "GIF";
        else if (/\.bmp$/i.test(file.name) || file.type === "image/bmp") type = "BMP";
        // Re-encode through canvas for consistent browser support and a smaller PDF.
        const canvas = document.createElement("canvas");
        canvas.width = naturalW; canvas.height = naturalH;
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, naturalW, naturalH); ctx.drawImage(img, 0, 0);
        const jpeg = canvas.toDataURL("image/jpeg", 0.92);
        doc.addImage(jpeg, "JPEG", x, y, drawW, drawH, undefined, "FAST");
        canvas.width = 1; canvas.height = 1;
      }
      if (!doc) throw new Error("Choose at least one image.");
      const blob = doc.output("blob"), url = URL.createObjectURL(blob);
      setPdfUrl(old => { if (old) URL.revokeObjectURL(old); return url; });
      setPdfName("images-to-pdf.pdf");
      setStatus("Done! " + images.length + " image(s) converted to PDF (" + prettySize(blob.size) + "). Review the preview before using it.");
    } catch (e) {
      console.error(e); setStatus(e?.message || "Could not create PDF. Try fewer or smaller images.");
    } finally { setBusy(false); }
  };

  return <main className="shell">
    <header className="top"><div className="mark">TS</div><div><p className="eyebrow">TEJASWINI SALES</p><h1>Image to PDF</h1><p className="muted">Convert photos and scans into one PDF.</p></div><div className="headerActions"><button className="secondary" onClick={onBack}>← Back to Document Studio</button></div></header>
    <section className="intro"><div><span className="introKicker">PDF UTILITIES</span><h2>Turn images into a PDF</h2><p>Select one or more images, arrange their order, and create a single PDF directly in your browser.</p></div><div className="introMeta"><span>Multiple images supported</span><span>Processed on your device</span></div></section>
    <section className="card"><div className="sectionHead"><div><span className="step">01</span><h2>Select images</h2></div><span className="muted">{images.length} image(s)</span></div>
      <label className="upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}><input ref={inputRef} type="file" multiple accept="image/*" onChange={e=>addFiles(e.target.files)}/><span className="uploadIcon">↑</span><strong>Choose images or drag them here</strong><small>JPG, JPEG, PNG, WebP, GIF, BMP and TIFF · select multiple files</small></label>
      {images.length > 0 && <div className="imagePdfList">{images.map((file,i)=><div className="imagePdfItem" key={keyOf(file)}><ImageThumbnail file={file}/><div className="imagePdfInfo"><strong>{file.name}</strong><small>{prettySize(file.size)}</small></div><div className="imagePdfActions"><button className="secondary" disabled={busy||i===0} onClick={()=>move(i,-1)} aria-label="Move image up">↑</button><button className="secondary" disabled={busy||i===images.length-1} onClick={()=>move(i,1)} aria-label="Move image down">↓</button><button className="secondary" disabled={busy} onClick={()=>remove(i)}>Remove</button></div></div>)}</div>}
      {images.length>0&&<div className="bottomActions"><button className="secondary" disabled={busy} onClick={()=>inputRef.current?.click()}>＋ Add more images</button><button className="secondary" disabled={busy} onClick={clear}>Clear all</button></div>}
    </section>
    <section className="card"><div className="sectionHead"><div><span className="step">02</span><h2>PDF settings</h2></div></div>
      <div className="grid two">
        <Labeled label="Page size"><select value={pageSize} onChange={e=>setPageSize(e.target.value)}><option value="a4">A4</option><option value="letter">US Letter</option></select></Labeled>
        <Labeled label="Orientation"><select value={orientation} onChange={e=>setOrientation(e.target.value)}><option value="auto">Auto — follow image shape</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></Labeled>
        <Labeled label="Image fit"><select value={fit} onChange={e=>setFit(e.target.value)}><option value="contain">Fit inside page (no crop)</option><option value="fill">Fill page (may crop edges)</option></select></Labeled>
        <Labeled label={"Page margin: "+margin+" pt"}><input type="range" min="0" max="60" step="4" value={margin} onChange={e=>setMargin(Number(e.target.value))}/></Labeled>
      </div>
      <div className="notice">Images are converted into page images. The PDF will not contain searchable text unless OCR is applied separately. Very large images may use significant browser memory.</div>
      <div className="bottomActions"><button disabled={!images.length||busy} onClick={createPDF}>{busy?"Converting images…":"▣ Convert "+images.length+" image(s) to PDF"}</button></div>
      {status&&<div className="notice" role="status">{busy?"◌ ":"ℹ "}{status}</div>}
    </section>
    {pdfUrl&&<section className="card"><div className="sectionHead"><div><span className="step">03</span><h2>PDF preview</h2></div><a className="downloadLink" href={pdfUrl} download={pdfName}>↓ Download PDF</a></div><iframe className="pdfFrame" src={pdfUrl} title="Converted PDF preview" style={{width:"100%",height:"70vh",border:"1px solid #343530",borderRadius:7}}/><div className="bottomActions"><a className="downloadLink" href={pdfUrl} download={pdfName}>↓ Download images-to-pdf.pdf</a></div></section>}
    <footer><div className="footerBrand"><strong>TEJASWINI SALES</strong><span>Solar Document Studio</span></div><span className="footerCredit">Designed &amp; engineered by <strong>NEXSA TECHNOLOGIES</strong><br/>Check page order and readability before official submission.</span></footer>
  </main>;
}
function Labeled({label,children}){return <label className="field"><span>{label}</span>{children}</label>;}

function ImageThumbnail({file}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img src={src} alt="" />;
}
