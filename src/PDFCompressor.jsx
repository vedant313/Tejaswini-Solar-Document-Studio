import React, { useRef, useState } from "react";
import jsPDF from "jspdf";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
const MB=1024*1024;
const KB=1024;
const prettySize=n=>n>=MB?(n/MB).toFixed(2)+" MB":(n/1024).toFixed(1)+" KB";
const safeName=name=>name.replace(/\.pdf$/i,"").replace(/[\\/:*?"<>|]/g,"_");
export default function PDFCompressor({onBack}){
 const [files,setFiles]=useState([]),[mode,setMode]=useState("299kb"),[quality,setQuality]=useState(65),[scale,setScale]=useState("1"),[busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[results,setResults]=useState([]);
 const inputRef=useRef(null);
 const chooseFiles=list=>{
  if(!list||!list.length)return;
  const incoming=Array.from(list), valid=incoming.filter(f=>f.type==="application/pdf"||f.name.toLowerCase().endsWith(".pdf")), invalid=incoming.length-valid.length;
  setFiles(prev=>{const all=[...prev,...valid],seen=new Set();return all.filter(f=>{const key=f.name+"|"+f.size+"|"+f.lastModified;if(seen.has(key))return false;seen.add(key);return true;});});
  setResults(prev=>{prev.forEach(r=>URL.revokeObjectURL(r.url));return [];});
  setProgress(invalid?"Skipped "+invalid+" non-PDF file(s).":"");
  if(inputRef.current)inputRef.current.value="";
 };
 const removeFile=index=>{setFiles(prev=>prev.filter((_,i)=>i!==index));setResults(prev=>{prev.forEach(r=>URL.revokeObjectURL(r.url));return [];});};
 async function buildCompressedPdf(pdf,renderScale,jpegQuality,onPage){
  const output=new jsPDF({orientation:"p",unit:"pt",format:"a4",compress:true,putOnlyUsedFonts:true});
  for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
   onPage(pageNo,pdf.numPages);
   const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:renderScale}),canvas=document.createElement("canvas");
   canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
   const ctx=canvas.getContext("2d",{alpha:false});ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
   await page.render({canvasContext:ctx,viewport,background:"#ffffff"}).promise;
   const image=canvas.toDataURL("image/jpeg",jpegQuality),pageWidth=page.view[2]-page.view[0],pageHeight=page.view[3]-page.view[1];
   if(pageNo>1)output.addPage([pageWidth,pageHeight]);
   output.addImage(image,"JPEG",0,0,pageWidth,pageHeight,undefined,"FAST");
   canvas.width=1;canvas.height=1;page.cleanup();
  }
  return output.output("blob");
 }
 async function compressOne(file,index,total){
  if(file.size>1024*MB)throw new Error("over 1 GB; try splitting it first");
  setProgress("Opening PDF "+(index+1)+" of "+total+": "+file.name);
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  try{
   let blob,chosen={scale:Number(scale),quality:quality/100};
   const render=async(s,q)=>buildCompressedPdf(pdf,s,q,(page,pages)=>setProgress("PDF "+(index+1)+"/"+total+" — "+file.name+" — page "+page+"/"+pages));
   if(mode==="manual")blob=await render(chosen.scale,chosen.quality);
   else if(mode==="299kb"){
    const attempts=[{scale:0.65,quality:0.45},{scale:0.5,quality:0.35},{scale:0.4,quality:0.28},{scale:0.3,quality:0.22},{scale:0.22,quality:0.16},{scale:0.16,quality:0.12}];
    for(const attempt of attempts){blob=await render(attempt.scale,attempt.quality);chosen=attempt;if(blob.size<=299*KB)break;}
   }else{
    const attempts=[{scale:1.1,quality:0.68},{scale:0.9,quality:0.58},{scale:0.75,quality:0.48},{scale:0.6,quality:0.38},{scale:0.45,quality:0.28},{scale:0.35,quality:0.2}];
    for(const attempt of attempts){blob=await render(attempt.scale,attempt.quality);chosen=attempt;if(blob.size<=2*MB)break;}
   }
   const name=safeName(file.name)+"-compressed.pdf";
   return {name,blob,url:URL.createObjectURL(blob),size:blob.size,originalSize:file.size,scale:chosen.scale,quality:chosen.quality,tooLarge:(mode==="2mb"&&blob.size>2*MB)||(mode==="299kb"&&blob.size>299*KB)};
  }finally{try{await pdf.destroy();}catch{}}
 }
 const compress=async()=>{
  if(!files.length||busy)return;setBusy(true);setResults([]);setProgress("Starting batch compression…");
  const done=[];
  try{
   for(let i=0;i<files.length;i++){
    try{done.push(await compressOne(files[i],i,files.length));}
    catch(error){done.push({name:safeName(files[i].name)+"-compressed.pdf",error:error?.message||"Could not compress this file",originalSize:files[i].size});}
    setResults([...done]);
   }
   const failed=done.filter(r=>r.error).length,oversized=done.filter(r=>r.tooLarge).length;
   setProgress("Finished "+done.length+" file(s). "+failed+" failed; "+oversized+" could not reach the selected size target.");
  }finally{setBusy(false);}
 };
 const downloadAll=async()=>{
  const successful=results.filter(r=>r.blob);if(!successful.length)return;
  try{
   setProgress("Creating ZIP of "+successful.length+" compressed PDF(s)…");
   const zip=new JSZip();successful.forEach(r=>zip.file(r.name,r.blob));
   const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:3}});
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="compressed-pdfs.zip";document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);setProgress("ZIP downloaded with "+successful.length+" PDF(s).");
  }catch(e){console.error(e);setProgress("Could not create ZIP. Download the files individually instead.");}
 };
 const reset=()=>{results.forEach(r=>{if(r.url)URL.revokeObjectURL(r.url);});setFiles([]);setResults([]);setProgress("");if(inputRef.current)inputRef.current.value="";};
 return <main className="shell">
  <header className="top"><div className="mark">TS</div><div><p className="eyebrow">TEJASWINI SALES</p><h1>PDF Compressor</h1><p className="muted">Compress multiple PDFs locally in your browser.</p></div><div className="headerActions"><button className="secondary" onClick={onBack}>← Back to Document Studio</button></div></header>
  <section className="intro"><div><span className="introKicker">PDF UTILITIES</span><h2>Batch compress PDFs</h2><p>Select 3–4 PDFs or more, compress them one after another, then download individually or together in a ZIP.</p></div><div className="introMeta"><span>Browser-side processing</span><span>Original files stay unchanged</span></div></section>
  <section className="card"><div className="sectionHead"><div><span className="step">01</span><h2>Select multiple PDFs</h2></div><span className="muted">{files.length} file(s) selected</span></div>
   <label className="upload" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();chooseFiles(e.dataTransfer.files);}}><input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" onChange={e=>chooseFiles(e.target.files)}/><span className="uploadIcon">↑</span><strong>Choose multiple PDFs or drag them here</strong><small>Hold Ctrl to select multiple files · PDF only</small></label>
   {files.length>0&&<div className="batchFileList">{files.map((file,i)=><div className="batchFile" key={file.name+"-"+file.size+"-"+file.lastModified}><span className="batchFileIndex">{i+1}</span><div className="batchFileInfo"><strong>{file.name}</strong><small>{prettySize(file.size)}</small></div><button className="secondary" disabled={busy} onClick={()=>removeFile(i)}>Remove</button></div>)}</div>}
   {files.length>0&&<div className="bottomActions"><button className="secondary" disabled={busy} onClick={()=>inputRef.current?.click()}>＋ Add more PDFs</button><button className="secondary" disabled={busy} onClick={reset}>Clear all</button></div>}
  </section>
  <section className="card"><div className="sectionHead"><div><span className="step">02</span><h2>Compression mode</h2></div></div>
   <div className="compressModes">
    <button className={mode==="299kb"?"compressMode selected":"compressMode"} onClick={()=>setMode("299kb")}><strong>Under 299 KB</strong><span>Maximum compression</span><small>Try to bring each PDF under 299 KB; quality may drop</small></button>
    <button className={mode==="2mb"?"compressMode selected":"compressMode"} onClick={()=>setMode("2mb")}><strong>Under 2 MB</strong><span>Smallest practical output</span><small>May reduce image/text sharpness</small></button>
    <button className={mode==="manual"?"compressMode selected":"compressMode"} onClick={()=>setMode("manual")}><strong>Manual</strong><span>Choose quality yourself</span><small>Adjust resolution and JPEG quality</small></button>
   </div>
   {mode==="manual"&&<div className="grid two manualCompression"><Labeled label={"Image quality: "+quality+"%"}><input type="range" min="15" max="95" step="5" value={quality} onChange={e=>setQuality(Number(e.target.value))}/></Labeled><Labeled label="Resolution"><select value={scale} onChange={e=>setScale(e.target.value)}><option value="1.5">High — sharper, larger file</option><option value="1.1">Balanced</option><option value="1">Standard</option><option value="0.7">Low — smaller file</option><option value="0.45">Very low — smallest file</option></select></Labeled></div>}
   <div className="notice">For strong compression, pages are converted to images. Selectable text, signatures, form fields and links may not be preserved. Always compare output with the original before official use. Each PDF is processed sequentially to reduce memory use.</div>
   <div className="bottomActions"><button disabled={!files.length||busy} onClick={compress}>{busy?"Compressing batch…":"⚡ Compress "+files.length+" PDF(s)"}</button></div>
   {progress&&<div className="notice" role="status">{busy?"◌ ":"ℹ "}{progress}</div>}
  </section>
  {results.length>0&&<section className="card"><div className="sectionHead"><div><span className="step">03</span><h2>Compression results</h2></div><span className="muted">{results.filter(r=>r.blob).length} ready</span></div>
   <div className="batchResults">{results.map((r,i)=><div className="batchResult" key={r.name+"-"+i}><div className="batchResultHead"><strong>{r.name}</strong><span className={r.error?"resultFailed":r.tooLarge?"resultWarning":"resultSuccess"}>{r.error?"Failed":r.tooLarge?"Target not reached":"Ready"}</span></div>{r.error?<p className="muted">{r.error}</p>:<><div className="compressionStats"><div><span>Original</span><strong>{prettySize(r.originalSize)}</strong></div><div><span>Compressed</span><strong>{prettySize(r.size)}</strong></div><div><span>Reduction</span><strong>{r.originalSize?Math.max(0,Math.round((1-r.size/r.originalSize)*100))+"%":"—"}</strong></div></div>{r.tooLarge&&<p className="muted">Could not reach the selected target; try Manual mode with lower quality or resolution.</p>}<div className="bottomActions"><a className="downloadLink" href={r.url} download={r.name}>↓ Download this PDF</a></div></>}</div>)}</div>
   <div className="bottomActions"><button disabled={!results.some(r=>r.blob)||busy} onClick={downloadAll}>⬇ Download All as ZIP</button></div>
  </section>}
  <footer><div className="footerBrand"><strong>TEJASWINI SALES</strong><span>Solar Document Studio</span></div><span className="footerCredit">Designed &amp; engineered by <strong>NEXSA TECHNOLOGIES</strong><br/>Check output quality before official submission.</span></footer>
 </main>;
}
function Labeled({label,children}){return <label className="field"><span>{label}</span>{children}</label>;}
