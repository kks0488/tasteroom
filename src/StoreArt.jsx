import React from "react";

// Original vector artwork shares the empty unit's viewpoint. No external media.
export default function StoreArt({ after = false, direction = "calm", business = "Cafe", photo }) {
  const warm = direction === "warm";
  return <div className={`store-art ${after ? "after" : "before"}`}>
    <img src={after ? "/empty-storefront.svg" : photo || "/empty-storefront.svg"}
      alt={after ? "Original concept moodboard in an illustrated shop" : photo ? "Your uploaded space reference" : "Original neutral illustration of an empty shop"} />
    {after && <svg viewBox="0 0 960 720" aria-label={`Conceptual ${business.toLowerCase()} illustration`} role="img">
      <path d="M0 0h960v490L0 550z" fill={warm ? "#c98466" : "#c5c9ae"} opacity=".38" />
      <path d="m0 550 960-60v230H0z" fill="#b2936e" opacity=".4" />
      <path d="M560 160h300v180H560z" fill={warm ? "#874f3d" : "#52604b"} />
      <text x="710" y="236" fill="#f6efdd" textAnchor="middle" fontFamily="Georgia,serif" fontSize="37">a place to stay</text>
      <text x="710" y="279" fill="#f6efdd" textAnchor="middle" fontFamily="Arial,sans-serif" letterSpacing="6" fontSize="15">{business.toUpperCase()}</text>
      {[610, 750, 870].map(x => <g key={x}><path d={`M${x} 0v117`} stroke="#4f503e" strokeWidth="4"/><path d={`m${x-38} 150 15-38h46l15 38z`} fill="#e9d5a4"/><ellipse cx={x} cy="150" rx="38" ry="7" fill="#f5e3ab"/></g>)}
      <path d="m510 407 350-12 70 40-364 23z" fill="#e4dac3"/>
      <path d="m566 458 364-23v130l-364 28z" fill={warm ? "#966344" : "#8b9475"}/>
      {Array.from({length:14},(_,i)=><path key={i} d={`m${582+i*25} 464 0 106`} stroke="#594f36" opacity=".25" strokeWidth="3"/>)}
      <path d="m510 407 56 51v135l-56-50z" fill="#9f875e"/>
      {business === "Bookstore" || business === "Boutique" ? <g>{[0,1,2].map(i=><g key={i}><path d={`M54 ${260+i*65}h129v9H54z`} fill="#775d40"/>{[0,1,2,3,4].map(j=><path key={j} d={`M${65+j*22} ${225+i*65}h14v35H${65+j*22}z`} fill={["#7d8a6a","#e6d7b7","#b86c4d"][j%3]}/>)}</g>)}</g> : <g>
        <path d="m90 490 208-13 28 23-209 18z" fill="#805e44"/><path d="M118 518v87h16v-88m163-10v78h15v-80" fill="#5d5844"/>
        <path d="M60 447q0-25 29-25h30v82H60zM294 430h34q25 0 25 24v42h-59z" fill={warm ? "#b3694e" : "#778267"}/>
        <path d="M64 503v68m46-66v62m195-74v57m37-56v53" stroke="#60523f" strokeWidth="7"/>
      </g>}
      <ellipse cx="388" cy="612" rx="94" ry="30" fill="#a5845e"/><path d="M384 640v58" stroke="#5d5844" strokeWidth="12"/>
      <path d="M359 577h31v25h-31zM406 582h22v20h-22z" fill="#eee2c8"/>
      <path d="M42 566h45l-6 67H49z" fill="#b06d4c"/>
      <path d="M65 567V425m0 72-30-40m30 18 36-34" stroke="#5e6c4c" strokeWidth="5"/>
      <ellipse cx="62" cy="440" rx="16" ry="37" fill="#6f7b56"/><ellipse cx="95" cy="456" rx="14" ry="30" fill="#7c8762" transform="rotate(35 95 456)"/>
    </svg>}
    <span className="store-art-label">{after ? "AFTER / CONCEPT MOODBOARD" : photo ? "BEFORE / YOUR REFERENCE" : "BEFORE / ORIGINAL ILLUSTRATION"}</span>
  </div>;
}
