/* Алгоритмы обработки пикселей. Все методы реализованы на уровне массивов RGBA. */
(function(){
  "use strict";
  function grayscale(data){
    const out=new Uint8ClampedArray(data.length);
    for(let i=0;i<data.length;i+=4){
      const y=0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
      out[i]=out[i+1]=out[i+2]=y;out[i+3]=data[i+3];
    }return out;
  }
  function pointOperation(data,operation,opts={}){
    const out=new Uint8ClampedArray(data.length);
    let min=255,max=0;
    if(operation==="contrast"){
      for(let i=0;i<data.length;i+=4){const y=.299*data[i]+.587*data[i+1]+.114*data[i+2];min=Math.min(min,y);max=Math.max(max,y);}
      const low=Math.max(0,Math.min(254,Number(opts.low??0)));
      const high=Math.max(low+1,Math.min(255,Number(opts.high??255)));
      // Линейное растяжение выбранного интервала; за границами — насыщение.
      for(let i=0;i<data.length;i+=4){
        for(let c=0;c<3;c++)out[i+c]=Math.max(0,Math.min(255,(data[i+c]-low)*255/(high-low)));
        out[i+3]=data[i+3];
      }
      return {data:out,range:[Math.round(min),Math.round(max)]};
    }
    const brightness=Number(opts.brightness||0),contrast=Number(opts.contrast??1);
    for(let i=0;i<data.length;i+=4){
      if(operation==="gray"){
        const y=.299*data[i]+.587*data[i+1]+.114*data[i+2];out[i]=out[i+1]=out[i+2]=y;
      }else if(operation==="invert"){
        out[i]=255-data[i];out[i+1]=255-data[i+1];out[i+2]=255-data[i+2];
      }else{
        for(let c=0;c<3;c++)out[i+c]=(data[i+c]-127.5)*contrast+127.5+brightness*1.5;
      }
      out[i+3]=data[i+3];
    }return {data:out,range:[min,max]};
  }
  function integral(gray,w,h){
    const sum=new Float64Array((w+1)*(h+1)),sq=new Float64Array((w+1)*(h+1)),stride=w+1;
    for(let y=1;y<=h;y++){
      let row=0,rowSq=0;
      for(let x=1;x<=w;x++){
        const v=gray[(y-1)*w+x-1];row+=v;rowSq+=v*v;
        const p=y*stride+x;sum[p]=sum[p-stride]+row;sq[p]=sq[p-stride]+rowSq;
      }
    }return {sum,sq,stride,w,h};
  }
  function rect(table,x0,y0,x1,y1){
    const {sum,stride}=table;
    return sum[y1*stride+x1]-sum[y0*stride+x1]-sum[y1*stride+x0]+sum[y0*stride+x0];
  }
  function threshold(data,w,h,opts={}){
    const method=opts.method||"sauvola",win=Math.max(3,Math.floor(Number(opts.window||31))|1),half=Math.floor(win/2);
    const src=grayscale(data),gray=new Float64Array(w*h);
    for(let i=0,j=0;i<src.length;i+=4,j++)gray[j]=src[i];
    const sat=integral(gray,w,h),out=new Uint8ClampedArray(data.length);
    const k=Number(opts.k??.2),sauvolaK=Number(opts.sauvolaK??.2),R=Math.max(1,Number(opts.R??128));
    const dark=opts.foreground!=="light";
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const x0=Math.max(0,x-half),x1=Math.min(w,x+half+1),y0=Math.max(0,y-half),y1=Math.min(h,y+half+1);
      const n=(x1-x0)*(y1-y0),s=rect(sat,x0,y0,x1,y1);
      const mean=s/n;
      const sq=rect({sum:sat.sq,stride:sat.stride},x0,y0,x1,y1);
      const std=Math.sqrt(Math.max(0,sq/n-mean*mean));
      let T=mean;
      if(method==="niblack")T=mean+k*std;
      else if(method==="sauvola")T=mean*(1+sauvolaK*(std/R-1));
      const v=gray[y*w+x],value=dark?(v<=T?0:255):(v>T?255:0);
      const p=(y*w+x)*4;out[p]=out[p+1]=out[p+2]=value;out[p+3]=data[p+3];
    }
    return out;
  }
  window.ImageAlgorithms={grayscale,pointOperation,threshold};
})();