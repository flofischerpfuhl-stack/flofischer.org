/** Card hitboxes share the exact layout used for painting, including after rotation. */
export function choiceLayout(w,h,n) {
  const stack=w<480||(w<640&&h>=430),compact=!stack&&h<430;
  const gap=stack?12:compact?12:18,pad=16;
  const cw=stack?Math.min(w-pad*2,380):Math.min(214,(w-pad*2-(n-1)*gap)/n);
  const ch=stack?Math.min(96,Math.floor((h-112-(n-1)*gap)/n)):compact?Math.min(194,h-104):272;
  const totalW=stack?cw:n*cw+(n-1)*gap,totalH=stack?n*ch+(n-1)*gap:ch;
  const x=(w-totalW)/2,y=Math.max(compact?88:100,Math.min(h-totalH-12,(h-totalH)/2+20));
  return{stack,compact,cw,ch,gap,x,y};
}
