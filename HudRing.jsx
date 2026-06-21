import React from "react";

export default function HudRing({ size = 130, label = "C.H.L.A.R.C.", tone = "idle" }) {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const long = i % 5 === 0;
    return (
      <line
        key={i}
        x1="100" y1={long ? 12 : 16}
        x2="100" y2={long ? 21 : 19}
        transform={`rotate(${(i / 60) * 360} 100 100)`}
        className={long ? "hud-tick long" : "hud-tick"}
      />
    );
  });
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={`hud hud-${tone}`}>
      <circle cx="100" cy="100" r="92" className="hud-ring spin-cw" fill="none" strokeDasharray="4 9" />
      <g className="hud-ticks">{ticks}</g>
      <circle cx="100" cy="100" r="74" className="hud-thin" fill="none" />
      <circle cx="100" cy="100" r="64" className="hud-arc spin-ccw" fill="none" strokeDasharray="200 202" strokeLinecap="round" transform="rotate(-90 100 100)" />
      <circle cx="100" cy="100" r="64" className="hud-arc-amber spin-ccw" fill="none" strokeDasharray="34 368" strokeLinecap="round" transform="rotate(150 100 100)" />
      <circle cx="100" cy="100" r="50" className="hud-thin2 spin-cw" fill="none" strokeDasharray="2 12" />
      <circle cx="100" cy="100" r="40" className="hud-core" />
      {label && <text x="100" y="104" textAnchor="middle" className="hud-label">{label}</text>}
    </svg>
  );
}
