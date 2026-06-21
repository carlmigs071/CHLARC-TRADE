import React, { useState, useEffect, useRef } from "react";
import { fmt } from "./market.js";

export default function Candles({ candles, ma7, ma25, intraday, volume }) {
  const W = 780, H = 380, VOL_H = 56, PL = 6, PR = 64, PT = 14, PB = 26;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const dragRef = useRef(null);

  const lastLenRef = useRef(candles?.length);
  useEffect(() => {
    if (candles?.length !== lastLenRef.current) {
      setZoom(1); setPan(0); lastLenRef.current = candles?.length;
    }
  }, [candles]);

  if (!candles || candles.length < 2) {
    return <div className="chart-empty">Loading chart…</div>;
  }

  const MIN_VISIBLE = 8;
  const totalN = candles.length;
  const visibleN = Math.max(MIN_VISIBLE, Math.round(totalN / zoom));
  const maxStart = Math.max(0, totalN - visibleN);
  const start = Math.round((1 - pan) * maxStart);
  const view = candles.slice(start, start + visibleN);
  const ma7v = ma7 ? ma7.slice(start, start + visibleN) : null;
  const ma25v = ma25 ? ma25.slice(start, start + visibleN) : null;
  const volV = volume ? volume.slice(start, start + visibleN) : null;

  const priceTop = PT, priceBottom = H - PB - VOL_H - 8;
  const pw = W - PL - PR, ph = priceBottom - priceTop;
  let max = Math.max(...view.map((c) => c.h));
  let min = Math.min(...view.map((c) => c.l));
  const pad = (max - min) * 0.08 || max * 0.02;
  max += pad; min -= pad;
  const n = view.length;
  const x = (i) => PL + ((i + 0.5) / n) * pw;
  const y = (p) => priceTop + (1 - (p - min) / (max - min)) * ph;
  const cw = Math.max(1, (pw / n) * 0.62);
  const grid = Array.from({ length: 5 }, (_, k) => min + ((max - min) * k) / 4);
  const mapPath = (arr) =>
    arr
      .map((v, i) => (v == null ? null : `${i === 0 || arr[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const ticks = n >= 3 ? [0, Math.floor(n / 2), n - 1] : [0, n - 1];
  const lab = (t) =>
    intraday
      ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const volTop = priceBottom + 8, volBottom = H - PB;
  const maxVol = volV && volV.length ? Math.max(...volV.filter((v) => v != null), 1) : 1;
  const volY = (v) => volBottom - ((v || 0) / (maxVol || 1)) * (volBottom - volTop);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const zoomBy = (factor) => setZoom((z) => clamp(z * factor, 1, Math.max(4, totalN / MIN_VISIBLE)));
  const resetView = () => { setZoom(1); setPan(0); };

  const onWheel = (e) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18);
  };
  const onMouseDown = (e) => { dragRef.current = { x: e.clientX, pan }; };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    setPan(clamp(dragRef.current.pan - dx / pw, 0, 1));
  };
  const endDrag = () => { dragRef.current = null; };

  const touchRef = useRef({ mode: null, startDist: 0, startZoom: 1, startX: 0, startPan: 0 });
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      touchRef.current = { mode: "pinch", startDist: dist(e.touches), startZoom: zoom, startX: 0, startPan: pan };
    } else if (e.touches.length === 1) {
      touchRef.current = { mode: "pan", startDist: 0, startZoom: zoom, startX: e.touches[0].clientX, startPan: pan };
    }
  };
  const onTouchMove = (e) => {
    e.preventDefault();
    const t = touchRef.current;
    if (t.mode === "pinch" && e.touches.length === 2) {
      const d = dist(e.touches);
      setZoom(clamp(t.startZoom * (d / (t.startDist || d)), 1, Math.max(4, totalN / MIN_VISIBLE)));
    } else if (t.mode === "pan" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - t.startX;
      setPan(clamp(t.startPan - dx / pw, 0, 1));
    }
  };
  const onTouchEnd = () => { touchRef.current = { mode: null, startDist: 0, startZoom: zoom, startX: 0, startPan: pan }; };

  return (
    <div className="chart-zoom-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="candles"
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: "none", cursor: dragRef.current ? "grabbing" : "grab" }}
      >
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y(g)} y2={y(g)} className="grid-line" />
            <text x={W - PR + 5} y={y(g) + 3} className="axis-text">{fmt(g)}</text>
          </g>
        ))}
        {ma7v && <path d={mapPath(ma7v)} className="ma ma7" fill="none" />}
        {ma25v && <path d={mapPath(ma25v)} className="ma ma25" fill="none" />}
        {view.map((c, i) => {
          const up = c.c >= c.o;
          const yo = y(c.o), yc = y(c.c);
          return (
            <g key={i} className={`candle ${up ? "up" : "down"}`}>
              <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} className="wick" />
              <rect x={x(i) - cw / 2} y={Math.min(yo, yc)} width={cw} height={Math.max(1, Math.abs(yc - yo))} className="body" />
            </g>
          );
        })}
        <line x1={PL} x2={W - PR} y1={volTop - 4} y2={volTop - 4} className="grid-line" />
        {volV && view.map((c, i) => {
          const up = c.c >= c.o;
          const vy = volY(volV[i]);
          return <rect key={i} x={x(i) - cw / 2} y={vy} width={cw} height={Math.max(1, volBottom - vy)} className={`vol-bar ${up ? "up" : "down"}`} />;
        })}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} className="axis-text" textAnchor="middle">{lab(view[i].t)}</text>
        ))}
      </svg>
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1 / 1.5)} title="Zoom out">−</button>
        <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomBy(1.5)} title="Zoom in">+</button>
        {(zoom !== 1 || pan !== 0) && <button className="zoom-reset" onClick={resetView}>⟲</button>}
      </div>
    </div>
  );
}
