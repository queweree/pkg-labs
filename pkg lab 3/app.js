(function(){
"use strict";
const $=id=>document.getElementById(id);
const originalCanvas=$("originalCanvas"),resultCanvas=$("resultCanvas"),octx=originalCanvas.getContext("2d",{willReadFrequently:true}),rctx=resultCanvas.getContext("2d",{willReadFrequently:true});
let originalImageData=null,imageLabel="",currentPanel="pixel",hasResult=false;
const methodInfo={
 mean:"Порог каждого пикселя равен среднему значению яркости в локальном окне. Интегральное изображение ускоряет вычисление среднего.",
 niblack:"Локальный порог Ниблэка: T = m + k · s, где m — среднее, s — стандартное отклонение яркости.",
 sauvola:"Адаптивный порог Сауволы: T = m · [1 + k · (s / R − 1)]. Хорошо подходит для текста и неоднородного освещения."
};
function setStatus(s){$("statusText").textContent=s}
function showImage(img,name){
 const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
 const w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale)),h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
 originalCanvas.width=resultCanvas.width=w;originalCanvas.height=resultCanvas.height=h;
 octx.clearRect(0,0,w,h);octx.drawImage(img,0,0,w,h);
 originalImageData=octx.getImageData(0,0,w,h);imageLabel=name;hasResult=false;
 $("emptyState").hidden=true;$("resultPlaceholder").hidden=false;
 rctx.clearRect(0,0,w,h);$("imageName").textContent=name;$("imageSize").textContent=`${w} × ${h}`;
 $("statDimensions").textContent=`${w} × ${h}`;$("statPixels").textContent=(w*h).toLocaleString("ru-RU");
 $("statAlgorithm").textContent="Не выбран";$("statTime").textContent="—";$("resultLabel").textContent="Ожидание обработки";
 $("downloadBtn").disabled=true;setStatus("Изображение загружено");
}
function loadFile(file){if(!file)return;if(!file.type.startsWith("image/")){setStatus("Выбери файл изображения");return}
 const url=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{showImage(img,file.name);URL.revokeObjectURL(url);applyProcessing()};
 img.onerror=()=>{URL.revokeObjectURL(url);setStatus("Не удалось открыть изображение")};img.src=url;
}
$("fileInput").addEventListener("change",e=>loadFile(e.target.files[0]));
$("originalWrap").addEventListener("dragover",e=>{e.preventDefault();$("originalWrap").style.outline="2px solid #b7f36b"});
$("originalWrap").addEventListener("dragleave",()=>{$("originalWrap").style.outline=""});
$("originalWrap").addEventListener("drop",e=>{e.preventDefault();$("originalWrap").style.outline="";loadFile(e.dataTransfer.files[0])});
function sampleSvg(type){
 if(type==="document")return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="500"><defs><linearGradient id="bg"><stop stop-color="#bdbdbd"/><stop offset="1" stop-color="#f8f8f8"/></linearGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .6 0 0 0 0 .6 0 0 0 0 .6 0 0 0 .12 0"/></filter></defs><rect width="720" height="500" fill="url(#bg)"/><g transform="rotate(-2 360 250)" fill="#292929" font-family="Georgia,serif"><text x="110" y="95" font-size="28" font-weight="bold">ЛАБОРАТОРНАЯ РАБОТА</text><text x="110" y="132" font-size="17">Основы обработки цифровых изображений</text><path d="M110 155H610" stroke="#444"/><text x="110" y="198" font-size="19">Вариант 11. Пороговая обработка</text><text x="110" y="235" font-size="15">Исследование методов локальной бинаризации</text><text x="110" y="260" font-size="15">при неоднородном освещении изображения.</text><text x="110" y="310" font-size="14">1. Локальный порог по среднему значению</text><text x="110" y="337" font-size="14">2. Метод Ниблэка</text><text x="110" y="364" font-size="14">3. Адаптивный метод Сауволы</text><text x="110" y="420" font-size="13">Дата: 09.10.2026</text></g><rect width="720" height="500" filter="url(#n)" opacity=".6"/></svg>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#333"/><stop offset=".45" stop-color="#e0e0e0"/><stop offset="1" stop-color="#777"/></linearGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="9"/><feColorMatrix values=".3 0 0 0 .2 0 .3 0 0 .2 0 0 .3 0 .2 0 0 0 .3 0"/></filter></defs><rect width="720" height="500" fill="url(#g)"/><rect width="720" height="500" filter="url(#n)" opacity=".6"/><g fill="#282828" font-family="Georgia,serif" opacity=".9"><text x="100" y="150" font-size="30">Текст на сложном фоне</text><text x="100" y="200" font-size="22">Локальная бинаризация</text><text x="100" y="250" font-size="22">Саувола и Ниблэк</text><text x="100" y="300" font-size="20">Порог зависит от окрестности</text></g></svg>`;
}
function loadSample(type){
 const blob=new Blob([sampleSvg(type)],{type:"image/svg+xml"}),url=URL.createObjectURL(blob),img=new Image();
 img.onload=()=>{showImage(img,type==="document"?"sample-document.svg":"sample-uneven.svg");URL.revokeObjectURL(url);applyProcessing()};
 img.src=url;
}
$("sampleDocument").addEventListener("click",()=>loadSample("document"));
$("sampleUneven").addEventListener("click",()=>loadSample("uneven"));
function updatePanel(panel){
 currentPanel=panel;const pixel=panel==="pixel";
 $("pixelControls").hidden=!pixel;$("thresholdControls").hidden=pixel;
 $("pageTitle").textContent=pixel?"Поэлементные операции":"Локальная и адаптивная пороговая обработка";
 $("pageSubtitle").textContent=pixel?"Преобразование яркости каждого пикселя и линейное контрастирование.":"Локальные пороги и адаптивная бинаризация методом Сауволы.";
 $("controlTitle").textContent=pixel?"Настройки преобразования":"Настройки пороговой обработки";
 document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.panel===panel));
 $("statAlgorithm").textContent="Не выбран";
 if(originalImageData)applyProcessing();
}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>updatePanel(b.dataset.panel)));
$("thresholdMethod").addEventListener("change",()=>{
 const m=$("thresholdMethod").value;$("methodDescription").textContent=methodInfo[m];
 $("kBlock").hidden=m!=="niblack";$("sauvolaKBlock").hidden=m!=="sauvola";$("rBlock").hidden=m!=="sauvola";
 applyProcessing();
});
function syncRanges(){
 $("brightnessOut").textContent=$("brightness").value;$("contrastOut").textContent=(+$("contrast").value/100).toFixed(1)+"×";
 $("windowOut").textContent=$("windowSize").value+" px";$("kOut").textContent=(+$("kValue").value/100).toFixed(2);
 $("rOut").textContent=$("rValue2").value;$("sauvolaKOut").textContent=(+$("sauvolaK").value/100).toFixed(2);
}
["brightness","contrast","windowSize","kValue","rValue2","sauvolaK"].forEach(id=>$(id).addEventListener("input",()=>{syncRanges();if(originalImageData)applyProcessing()}));
["operation","lowCut","highCut","foreground"].forEach(id=>$(id).addEventListener("change",()=>{toggleBrightness();if(originalImageData)applyProcessing()}));
function toggleBrightness(){const bright=$("operation").value==="brightness";$("brightnessBlock").style.opacity=bright?"1":".45";$("contrastBlock").style.opacity=bright?"1":".45"}
function applyProcessing(){
 if(!originalImageData){setStatus("Сначала загрузи изображение");return}
 const btn=$("applyBtn");btn.disabled=true;setStatus("Выполняется обработка…");
 // Синхронный расчёт на пиксельных массивах, без высокоуровневых фильтров.
 const start=performance.now();let output,algorithm;
 try{
  if(currentPanel==="pixel"){
   const op=$("operation").value;
   const res=ImageAlgorithms.pointOperation(originalImageData.data,op,{low:$("lowCut").value,high:$("highCut").value,brightness:$("brightness").value,contrast:+$("contrast").value/100});
   output=res.data;algorithm=({contrast:"Линейное контрастирование",gray:"Оттенки серого",invert:"Инверсия",brightness:"Яркость и контраст"})[op];
  }else{
   const method=$("thresholdMethod").value;
   output=ImageAlgorithms.threshold(originalImageData.data,originalCanvas.width,originalCanvas.height,{method,window:$("windowSize").value,k:+$("kValue").value/100,sauvolaK:+$("sauvolaK").value/100,R:$("rValue2").value,foreground:$("foreground").value});
   algorithm=({mean:"Локальное среднее",niblack:"Метод Ниблэка",sauvola:"Метод Сауволы"})[method];
  }
  rctx.putImageData(new ImageData(output,originalCanvas.width,originalCanvas.height),0,0);
  hasResult=true;$("resultPlaceholder").hidden=true;$("downloadBtn").disabled=false;
  const ms=performance.now()-start;$("statAlgorithm").textContent=algorithm;$("statTime").textContent=ms<1000?Math.round(ms)+" мс":(ms/1000).toFixed(2)+" с";
  $("resultLabel").textContent=algorithm;setStatus("Обработка завершена");
 }catch(err){console.error(err);setStatus("Ошибка обработки: "+err.message)}
 finally{btn.disabled=false}
}
$("applyBtn").addEventListener("click",applyProcessing);
$("resetBtn").addEventListener("click",()=>{
 $("operation").value="contrast";$("brightness").value=0;$("contrast").value=100;$("lowCut").value=0;$("highCut").value=255;
 $("thresholdMethod").value="sauvola";$("windowSize").value=31;$("kValue").value=20;$("rValue2").value=128;$("sauvolaK").value=20;$("foreground").value="dark";
 $("methodDescription").textContent=methodInfo.sauvola;$("kBlock").hidden=true;$("sauvolaKBlock").hidden=false;$("rBlock").hidden=false;
 syncRanges();toggleBrightness();if(originalImageData)applyProcessing();
});
$("downloadBtn").addEventListener("click",()=>{
 if(!hasResult)return;const a=document.createElement("a");a.download="lab3-result.png";a.href=resultCanvas.toDataURL("image/png");a.click();
});
syncRanges();toggleBrightness();$("kBlock").hidden=true;
})();