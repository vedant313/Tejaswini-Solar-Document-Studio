import React, { useRef, useState } from "react";
import jsPDF from "jspdf";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
const MB = 1024 * 1024;
const prettySize = n => n >= MB ? (n / MB).toFixed(2) + " MB" : (n / 1024).toFixed(1) + " KB";
export default function PDFCompressor({ onBack }) {
  const [file,setFile]=useState(null), [mode,setMode]=useState("2mb"), [quality,setQuality]=useState(65), [scale,setScale]=useState("1"), [busy,setBusy]=useState(false), [progress,setProgress]=useState(""), [result,setResult]=useState(null);
  const inputRef=useRef(null);
  const chooseFile=next=>{if(!next)return;if(next.type!=="application/pdf"&&!next.name.toLowerCase().endsWith(".pdf")){setProgress("Please choose a PDF file.");return;}if(result?.url)URL.revokeObjectURL(result.url);setFile(next);setResult(null);setProgress("");};
  async function buildCompressedPdf(pdf,renderScale,jpegQuality){
    const output=new jsPDF({orientation:"p",unit:"pt",format:"a4",compress:true,putOnlyUsedFonts:true});
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      setProgress("Processing page "+pageNo+" of "+pdf.numPages+"…");
      const page=await pdf.getPage(pageNo), viewport=page.getViewport({scale:renderScale}), canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
      const ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:ctx,viewport,background:"#ffffff"}).promise;
      const image=canvas.toDataURL("image/jpeg",jpegQuality), pageWidth=page.view[2]-page.view[0], pageHeight=page.view[3]-page.view[1];
      if(pageNo>1)output.addPage([pageWidth,pageHeight]);
      output.addImage(image,"JPEG",0,0,pageWidth,pageHeight,undefined,"FAST");
      canvas.width=1;canvas.height=1;page.cleanup();
    }
    return output.output("blob");
  }
  const compress=async()=>{
    if(!file||busy)return;setBusy(true);setResult(null);let pdf;
    try{
      if(file.size>1024*MB){setProgress("This PDF is over 1 GB and may exceed browser memory. Try splitting it into smaller PDFs first.");return;}
      setProgress("Opening PDF locally in your browser…");
      pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
      let blob,chosen={scale:Number(scale),quality:quality/100};
      if(mode==="manual"){blob=await buildCompressedPdf(pdf,chosen.scale,chosen.quality);}
      else if(mode==="299mb"){
        blob=await buildCompressedPdf(pdf,1.25,0.76);
        if(blob.size>=299*MB){blob=await buildCompressedPdf(pdf,0.8,0.55);chosen={scale:0.8,quality:0.55};}else chosen={scale:1.25,quality:0.76};
      }else{
        const attempts=[{scale:1.1,quality:0.68},{scale:0.9,quality:0.58},{scale:0.75,quality:0.48},{scale:0.6,quality:0.38},{scale:0.45,quality:0.28},{scale:0.35,quality:0.2}];
        for(const attempt of attempts){blob=await buildCompressedPdf(pdf,attempt.scale,attempt.quality);chosen=attempt;if(blob.size<=2*MB)break;}
      }
      const url=URL.createObjectURL(blob), name=file.name.replace(/\.pdf$/i,"")+"-compressed.pdf";
      setResult({blob,url,name,size:blob.size,scale:chosen.scale,quality:chosen.quality});
      if(mode==="2mb"&&blob.size>2*MB)setProgress("Compression finished, but output is "+prettySize(blob.size)+". Reaching 2 MB is not possible for every file without reducing readability further.");
      else if(mode==="299mb"&&blob.size>299*MB)setProgress("Output is "+prettySize(blob.size)+"; it could not be reduced below 299 MB. Try Manual mode with lower quality/scale.");
      else setProgress("Done — "+prettySize(file.size)+" → "+prettySize(blob.size)+". Download the compressed copy below.");
    }catch(error){console.error("PDF compression failed:",error);setProgress("Could not compress this PDF. It may be encrypted, damaged, or too large for available browser memory.");}
    finally{if(pdf){try{await pdf.destroy();}catch{}}setBusy(false);}
  };
  const reset=()=>{if(result?.url)URL.revokeObjectURL(result.url);setFile(null);setResult(null);setProgress("");if(inputRef.current)inputRef.current.value="";};
  return <main className="shell">
    <header className="top"><div className="mark">TS</div><div><p className="eyebrow">TEJASWINI SALES</p><h1>PDF Compressor</h1><p className="muted">Compress PDF files locally in your browser.</p></div><div className="headerActions"><button className="secondary" onClick={onBack}>← Back to Document Studio</button></div></header>
    <section className="intro"><div><span className="introKicker">PDF UTILITIES</span><h2>Make PDFs smaller</h2><p>Choose a size preset or tune quality manually. Your original file is never overwritten and files are not uploaded to a server.</p></div><div className="introMeta"><span>Browser-side processing</span><span>Original file stays unchanged</span></div></section>
    <section className="card"><div className="sectionHead"><div><span className="step">01</span><h2>Select PDF</h2></div><span className="muted">Very large PDFs may need more computer memory.</span></div>
      <label className="upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();chooseFile(e.dataTransfer.files?.[0]);}}><input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={e=>chooseFile(e.target.files?.[0])}/><span className="uploadIcon">↑</span><strong>{file?file.name:"Choose PDF or drag it here"}</strong><small>{file?"Original size: "+prettySize(file.size):"PDF files only"}</small></label>
      {file&&<div className="bottomActions"><button className="secondary" onClick={()=>inputRef.current?.click()}>Choose another PDF</button><button className="secondary" onClick={reset}>Clear</button></div>}
    </section>
    <section className="card"><div className="sectionHead"><div><span className="step">02</span><h2>Compression mode</h2></div></div>
      <div className="compressModes">
        <button className={mode==="299mb"?"compressMode selected":"compressMode"} onClick={()=>setMode("299mb")}><strong>Under 299 MB</strong><span>Balanced compression</span><small>Good starting point for large PDFs</small></button>
        <button className={mode==="2mb"?"compressMode selected":"compressMode"} onClick={()=>setMode("2mb")}><strong>Under 2 MB</strong><span>Smallest practical output</span><small>May reduce image/text sharpness</small></button>
        <button className={mode==="manual"?"compressMode selected":"compressMode"} onClick={()=>setMode("manual")}><strong>Manual</strong><span>Choose quality yourself</span><small>Adjust resolution and JPEG quality</small></button>
      </div>
      {mode==="manual"&&<div className="grid two manualCompression"><Labeled label={"Image quality: "+quality+"%"}><input type="range" min="15" max="95" step="5" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></Labeled><Labeled label="Resolution"><select value={scale} onChange={e=>setScale(e.target.value)}><option value="1.5">High — sharper, larger file</option><option value="1.1">Balanced</option><option value="1">Standard</option><option value="0.7">Low — smaller file</option><option value="0.45">Very low — smallest file</option></select></Labeled></div>}
      <div className="notice">Important: pages are converted to images for strong compression. The output may not keep selectable/searchable text, forms, signatures, or links. Compare it with the original before official use.</div>
      <div className="bottomActions"><button disabled={!file||busy} onClick={compress}>{busy?"Compressing…":"⚡ Compress PDF"}</button></div>
      {progress&&<div className="notice" role="status">{busy?"◌ ":"ℹ "}{progress}</div>}
    </section>
    {result&&<section className="card"><div className="sectionHead"><div><span className="step">03</span><h2>Compressed PDF</h2></div><span className="muted">{prettySize(result.size)}</span></div>
      <div className="compressionStats"><div><span>Original</span><strong>{prettySize(file.size)}</strong></div><div><span>Compressed</span><strong>{prettySize(result.size)}</strong></div><div><span>Reduction</span><strong>{file.size?Math.max(0,Math.round((1-result.size/file.size)*100))+"%":"—"}</strong></div></div>
      <div className="bottomActions"><a className="downloadLink" href={result.url} download={result.name}>↓ Download compressed PDF</a><button className="secondary" onClick={()=>window.open(result.url,"_blank","noopener,noreferrer")}>Preview PDF</button></div>
    </section>}
    <footer><div className="footerBrand"><strong>TEJASWINI SALES</strong><span>Solar Document Studio</span></div><span className="footerCredit">Designed &amp; engineered by <strong>NEXSA TECHNOLOGIES</strong><br/>Check output quality before official submission.</span></footer>
  </main>;
}
function Labeled({label,children}){return <label className="field"><span>{label}</span>{children}</label>;}
