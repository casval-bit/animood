// ─── FrameSVG React Component ─────────────────────────────────────────────────
export function FrameSVG({ frame, size = 80, children }) {
  if(!frame) return <>{children}</>;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      {children}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible",pointerEvents:"none"}}
        viewBox={`0 0 ${size} ${size}`}
        dangerouslySetInnerHTML={{__html: frame.svg(size)}}/>
    </div>
  );
}
