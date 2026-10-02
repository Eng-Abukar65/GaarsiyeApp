import React, { useState, useEffect } from 'react';
import { Shield, Truck, Settings, Sparkles, MapPin, Search, ShoppingCart, CheckCircle, Fuel, ArrowRight } from 'lucide-react';

const SCENE_DATA = [
  {
    title: "Fuel Delivery Made Easy",
    subtitle: "FAST • SAFE • RELIABLE",
    badge: "STEP 1 OF 3",
    statusText: "REFUELING IN PROGRESS",
    desc: "Vehicle refueling with quality fuel...",
    previewTitle: "Fuel Delivery",
    previewDesc: "Refueling at your location"
  },
  {
    title: "Fast Gas Cylinder Delivery",
    subtitle: "DELIVERED TO YOUR DOORSTEP",
    badge: "STEP 2 OF 3",
    statusText: "CYLINDER LOADING",
    desc: "LPG cylinder loaded and delivering...",
    previewTitle: "Gas Delivery",
    previewDesc: "LPG cylinder delivery"
  },
  {
    title: "Find Genuine Spare Parts",
    subtitle: "SEARCH • COMPARE • ORDER",
    badge: "STEP 3 OF 3",
    statusText: "ORDER CONFIRMED",
    desc: "Quality service you can trust...",
    previewTitle: "Spare Parts",
    previewDesc: "Genuine auto parts search"
  }
];

const CarouselAnimation = () => {
  const [activeScene, setActiveScene] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveScene((s) => (s + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleSceneSelect = (index) => {
    setActiveScene(index);
  };

  return (
    <div className="w-full flex flex-col h-full justify-between p-8 bg-white font-body select-none overflow-y-auto no-scrollbar">
      {/* CSS Animation Keyframes */}
      <style>{`
        /* Scene 1 Animations */
        @keyframes carTimeline {
          0% { transform: translateX(-160px); }
          15% { transform: translateX(0px); }
          80% { transform: translateX(0px); }
          95% { transform: translateX(240px); }
          100% { transform: translateX(240px); }
        }
        @keyframes wheelTimeline {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(720deg); }
          80% { transform: rotate(720deg); }
          95% { transform: rotate(1440deg); }
          100% { transform: rotate(1440deg); }
        }
        @keyframes smokeFloat {
          0% { transform: translate(0, 0) scale(0.8); opacity: 0; }
          50% { opacity: 0.5; }
          100% { transform: translate(15px, -30px) scale(1.3); opacity: 0; }
        }
        @keyframes attendantTimeline {
          0%, 15% { transform: translateX(0); }
          22% { transform: translateX(-15px); }
          75% { transform: translateX(-15px); }
          80%, 100% { transform: translateX(0); }
        }
        @keyframes attendantArmTimeline {
          0%, 15% { transform: rotate(0deg); }
          22% { transform: rotate(-25deg); }
          75% { transform: rotate(-25deg); }
          80%, 100% { transform: rotate(0deg); }
        }
        @keyframes hoseTimeline {
          0%, 15% { stroke-dasharray: 100; stroke-dashoffset: 100; }
          22%, 75% { stroke-dasharray: 100; stroke-dashoffset: 0; }
          80%, 100% { stroke-dasharray: 100; stroke-dashoffset: 100; }
        }

        /* Scene 2 Animations (Scooter Delivery) */
        @keyframes scooterTimeline {
          0% { transform: translateX(-120px) translateY(0); }
          15% { transform: translateX(0px) translateY(0); }
          48% { transform: translateX(0px) translateY(-2px); }
          50% { transform: translateX(0px) translateY(2px); }
          52% { transform: translateX(0px) translateY(0); }
          80% { transform: translateX(0px) translateY(0); }
          95% { transform: translateX(200px) translateY(0); }
          100% { transform: translateX(200px) translateY(0); }
        }
        @keyframes phoneRouteTimeline {
          0% { stroke-dashoffset: 80; }
          80% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes pinPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; }
        }

        /* Scene 3 Animations */
        @keyframes searchTimeline {
          0% { transform: translate(0, 0); }
          25% { transform: translate(50px, -20px); }
          50% { transform: translate(110px, 15px); }
          75% { transform: translate(60px, -45px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes partTimeline {
          0%, 10% { transform: scale(0); opacity: 0; }
          20%, 65% { transform: scale(1); opacity: 1; }
          75% { transform: translate(65px, 45px) scale(0.3); opacity: 0; }
          100% { transform: translate(65px, 45px) scale(0); opacity: 0; }
        }
        @keyframes cartTimeline {
          0%, 60% { transform: translateX(120px); }
          70%, 90% { transform: translateX(0); }
          95%, 100% { transform: translateX(-150px); }
        }
        @keyframes checkTimeline {
          0%, 75% { transform: scale(0); opacity: 0; }
          85%, 95% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0); opacity: 0; }
        }

        /* Float effects */
        @keyframes floatIcon {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(5deg); }
        }
      `}</style>

      {/* Brand Header */}
      <div className="flex items-center gap-4 text-left mt-2">
        {/* Blue G Mark Logo */}
        <div className="w-14 h-14 bg-gradient-to-br from-[#2563EB] to-[#38BDF8] rounded-2xl flex items-center justify-center text-white shadow-md shadow-[#2563EB]/25 ring-1 ring-white/10">
          <span className="font-headline font-black text-3xl leading-none select-none text-white">G</span>
        </div>
        <div>
          <h1 className="font-headline font-black text-3xl tracking-tight text-slate-800 leading-none">
            Gaarsiis
          </h1>
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1 block">
            System
          </span>
        </div>
      </div>
      
      <p className="text-xs font-semibold text-slate-400 mt-2 text-left">
        Fuel, Gas, Spare Parts & Car Services <span className="mx-1.5">•</span> All in One Platform
      </p>

      {/* Main Illustration Area */}
      <div className="relative flex items-center justify-center h-[260px] my-6 overflow-hidden rounded-3xl bg-slate-50/80 border border-slate-100 shadow-inner">
        {/* Floating background decorative shapes */}
        <div className="absolute top-4 left-6 text-blue-200/50 animate-[floatIcon_5s_ease-in-out_infinite]" style={{ animationDelay: '0s' }}>
          <Sparkles size={24} />
        </div>
        <div className="absolute bottom-6 right-8 text-blue-200/50 animate-[floatIcon_6s_ease-in-out_infinite]" style={{ animationDelay: '1s' }}>
          <Settings size={28} />
        </div>
        <div className="absolute top-10 right-16 text-blue-200/40 animate-[floatIcon_7s_ease-in-out_infinite]" style={{ animationDelay: '2s' }}>
          <Fuel size={20} />
        </div>

        {/* SCENE 1: FUEL STATION */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${activeScene === 0 ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
          <svg className="w-full h-full max-w-[400px] max-h-[220px]" viewBox="0 0 400 220" fill="none">
            {/* Background elements */}
            <rect x="20" y="180" width="360" height="4" rx="2" fill="#E2E8F0" />
            
            {/* Station Canopy */}
            <rect x="100" y="30" width="200" height="24" rx="6" fill="#1E3A8A" />
            <rect x="100" y="50" width="200" height="6" fill="#2563EB" />
            <rect x="120" y="56" width="16" height="60" fill="#CBD5E1" />
            <rect x="264" y="56" width="16" height="60" fill="#CBD5E1" />
            <text x="200" y="47" fill="#FFFFFF" fontSize="11" fontWeight="bold" textAnchor="middle" letterSpacing="2">FUEL STATION</text>

            {/* Fuel Pump */}
            <rect x="230" y="100" width="36" height="80" rx="4" fill="#2563EB" />
            <rect x="234" y="104" width="28" height="72" rx="2" fill="#1E3A8A" />
            <rect x="238" y="110" width="20" height="18" rx="1" fill="#E2E8F0" />
            {/* Digital price indicator */}
            <text x="248" y="122" fill="#1E293B" fontSize="9" fontWeight="bold" textAnchor="middle">
              {activeScene === 0 ? "$50.0" : "$0.0"}
            </text>
            <circle cx="242" cy="136" r="3" fill="#10B981" />
            <circle cx="254" cy="136" r="3" fill="#EF4444" />
            
            {/* Attendant character */}
            <g className="animate-[attendantTimeline_10s_linear_infinite]">
              {/* Head / Cap */}
              <circle cx="205" cy="115" r="7" fill="#F87171" />
              <path d="M200 110 H212 V113 H200 Z" fill="#1E3A8A" />
              {/* Body */}
              <path d="M195 122 C195 122 197 155 197 155 H213 L215 122 Z" fill="#2563EB" />
              {/* Legs */}
              <rect x="198" y="155" width="6" height="25" fill="#1E3A8A" />
              <rect x="206" y="155" width="6" height="25" fill="#1E3A8A" />
              {/* Arm/Hand holding nozzle */}
              <g className="animate-[attendantArmTimeline_10s_linear_infinite]" style={{ transformOrigin: '198px 125px' }}>
                <path d="M198 126 C190 126 182 118 182 118" stroke="#F87171" strokeWidth="4" strokeLinecap="round" />
                {/* Nozzle */}
                <path d="M182 118 L176 112 M176 112 L172 114" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
              </g>
            </g>

            {/* Fuel Hose linking pump to attendant */}
            <path d="M230 140 C 210 160, 200 150, 185 124" stroke="#475569" strokeWidth="2.5" fill="none" strokeDasharray="100" strokeDashoffset="100" className="animate-[hoseTimeline_10s_linear_infinite]" />

            {/* Car Vehicle */}
            <g className="animate-[carTimeline_10s_linear_infinite]">
              {/* Car Body Shadow */}
              <ellipse cx="75" cy="180" rx="65" ry="6" fill="#000000" opacity="0.15" />
              {/* Blue Car Body */}
              <path d="M15 174 C15 174 15 160 22 156 C29 152 42 152 46 142 C50 132 60 126 90 126 C120 126 126 138 132 144 C138 150 144 155 144 174 Z" fill="#1D4ED8" />
              {/* Car Roof Details / Windows */}
              <path d="M52 142 C54 133 62 130 86 130 C110 130 114 133 118 142 Z" fill="#E2E8F0" />
              <line x1="85" y1="130" x2="85" y2="142" stroke="#1D4ED8" strokeWidth="3" />
              {/* Wheels */}
              <g className="animate-[wheelTimeline_10s_linear_infinite]" style={{ transformOrigin: '45px 174px' }}>
                <circle cx="45" cy="174" r="14" fill="#1E293B" />
                <circle cx="45" cy="174" r="6" fill="#94A3B8" />
                <line x1="45" y1="160" x2="45" y2="188" stroke="#FFFFFF" strokeWidth="2" />
                <line x1="31" y1="174" x2="59" y2="174" stroke="#FFFFFF" strokeWidth="2" />
              </g>
              <g className="animate-[wheelTimeline_10s_linear_infinite]" style={{ transformOrigin: '115px 174px' }}>
                <circle cx="115" cy="174" r="14" fill="#1E293B" />
                <circle cx="115" cy="174" r="6" fill="#94A3B8" />
                <line x1="115" y1="160" x2="115" y2="188" stroke="#FFFFFF" strokeWidth="2" />
                <line x1="101" y1="174" x2="129" y2="174" stroke="#FFFFFF" strokeWidth="2" />
              </g>
              {/* Headlights / Taillights */}
              <path d="M14 162 C10 162 10 168 14 168 Z" fill="#FBBF24" />
              <path d="M145 160 C147 160 147 166 145 166 Z" fill="#EF4444" />
              {/* Fuel cap inlet */}
              <circle cx="130" cy="154" r="3" fill="#1E3A8A" />

              {/* Smoke / Steam from exhaust */}
              {activeScene === 0 && (
                <>
                  <circle cx="152" cy="172" r="4" fill="#CBD5E1" className="animate-[smokeFloat_2s_infinite]" style={{ animationDelay: '0s' }} />
                  <circle cx="154" cy="171" r="5" fill="#E2E8F0" className="animate-[smokeFloat_2s_infinite]" style={{ animationDelay: '0.7s' }} />
                </>
              )}
            </g>
          </svg>
        </div>

        {/* SCENE 2: LPG GAS DELIVERY (Scooter + Map Route) */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${activeScene === 1 ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
          <svg className="w-full h-full max-w-[400px] max-h-[220px]" viewBox="0 0 400 220" fill="none">
            {/* Ground Line */}
            <rect x="20" y="180" width="360" height="4" rx="2" fill="#E2E8F0" />
            
            {/* Background elements - small house & tree */}
            <g opacity="0.85">
              {/* House */}
              <rect x="250" y="110" width="46" height="40" fill="#2563EB" opacity="0.2" rx="2" />
              <polygon points="244,110 273,85 302,110" fill="#1D4ED8" opacity="0.3" />
              <rect x="266" y="130" width="14" height="20" fill="#FFFFFF" />
              {/* Tree */}
              <circle cx="60" cy="135" r="15" fill="#10B981" opacity="0.3" />
              <rect x="57" y="150" width="6" height="30" fill="#64748B" opacity="0.5" />
            </g>

            {/* Smartphone standing showing route map */}
            <g transform="translate(315, 60)">
              {/* Phone Shadow */}
              <rect x="-2" y="2" width="46" height="92" rx="10" fill="#000000" opacity="0.08" />
              {/* Phone Body */}
              <rect x="0" y="0" width="46" height="92" rx="10" fill="#1E293B" stroke="#475569" strokeWidth="2.5" />
              {/* Screen */}
              <rect x="3" y="3" width="40" height="86" rx="8" fill="#F8FAFC" />
              {/* Camera Notch */}
              <rect x="15" y="0" width="16" height="5" rx="2.5" fill="#1E293B" />
              
              {/* Map Grid / Route */}
              <path d="M12 75 Q 12 40, 28 40 T 28 15" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="100" strokeDashoffset="100" className="animate-[phoneRouteTimeline_10s_linear_infinite]" fill="none" />
              
              {/* Pins on Phone screen */}
              {/* Start Pin */}
              <circle cx="12" cy="75" r="4.5" fill="#10B981" />
              <circle cx="12" cy="75" r="1.5" fill="#FFFFFF" />
              
              {/* End Pin */}
              <g transform="translate(28, 15)">
                <path d="M0 -7 C-4 -7 -6 -5 -6 -1 C-6 3 0 9 0 9 C0 9 6 3 6 -1 C6 -5 4 -7 0 -7 Z" fill="#EF4444" />
                <circle cx="0" cy="-2" r="2.5" fill="#FFFFFF" />
              </g>
            </g>

            {/* Location Pin floating on the map */}
            <g transform="translate(285, 75)" className="animate-[pinPulse_2s_infinite]" style={{ transformOrigin: 'center' }}>
              <path d="M0 -10 C-6 -10 -9 -7 -9 -1 C-9 5 0 14 0 14 C0 14 9 5 9 -1 C9 -7 6 -10 0 -10 Z" fill="#EF4444" />
              <circle cx="0" cy="-3" r="3.5" fill="#FFFFFF" />
            </g>

            {/* Scooter Rider Delivery */}
            <g className="animate-[scooterTimeline_10s_linear_infinite]">
              {/* Scooter Body Shadow */}
              <ellipse cx="65" cy="180" rx="35" ry="4" fill="#000000" opacity="0.15" />
              
              {/* Scooter Frame */}
              <path d="M40 170 H90 L100 145 H60 Z" fill="#2563EB" />
              <path d="M100 145 L106 120" stroke="#475569" strokeWidth="4.5" strokeLinecap="round" />
              <rect x="52" y="138" width="18" height="10" rx="2" fill="#E2E8F0" />
              
              {/* Gas Cylinder loaded on the back */}
              <rect x="36" y="120" width="16" height="32" rx="4" fill="#1D4ED8" stroke="#1E3A8A" strokeWidth="1" />
              <rect x="40" y="116" width="8" height="4" fill="#475569" />
              <ellipse cx="44" cy="120" rx="8" ry="2" fill="#1E3A8A" />

              {/* Scooter Wheels */}
              <g className="animate-[wheelTimeline_10s_linear_infinite]" style={{ transformOrigin: '35px 172px' }}>
                <circle cx="35" cy="172" r="13" fill="#1E293B" />
                <circle cx="35" cy="172" r="5" fill="#E2E8F0" />
              </g>
              <g className="animate-[wheelTimeline_10s_linear_infinite]" style={{ transformOrigin: '95px 172px' }}>
                <circle cx="95" cy="172" r="13" fill="#1E293B" />
                <circle cx="95" cy="172" r="5" fill="#E2E8F0" />
              </g>

              {/* Rider Character */}
              {/* Head / Helmet */}
              <circle cx="78" cy="98" r="8" fill="#F87171" />
              <path d="M70 98 C70 90, 86 90, 86 98 Z" fill="#1D4ED8" />
              <path d="M78 98 L86 98" stroke="#334155" strokeWidth="2.5" />
              {/* Torso / Jacket */}
              <path d="M72 106 C72 106, 68 138, 68 138 H88 L85 106 Z" fill="#2563EB" />
              {/* Legs */}
              <path d="M72 138 L80 162 H90 L82 138 Z" fill="#1E3A8A" />
              {/* Arm/Handlebars */}
              <path d="M76 114 L98 122" stroke="#F87171" strokeWidth="3.5" strokeLinecap="round" />
            </g>
          </svg>
        </div>

        {/* SCENE 3: SPARE PARTS SEARCH */}
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${activeScene === 2 ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
          <svg className="w-full h-full max-w-[400px] max-h-[220px]" viewBox="0 0 400 220" fill="none">
            {/* Ground Line */}
            <rect x="20" y="180" width="360" height="4" rx="2" fill="#E2E8F0" />

            {/* Shelves */}
            <rect x="50" y="50" width="160" height="6" fill="#94A3B8" />
            <rect x="50" y="95" width="160" height="6" fill="#94A3B8" />
            <rect x="50" y="140" width="160" height="6" fill="#94A3B8" />
            <rect x="46" y="44" width="6" height="136" fill="#64748B" />
            <rect x="208" y="44" width="6" height="136" fill="#64748B" />

            {/* Spare Parts on Shelves */}
            {/* Top Shelf: Oil bottles */}
            <rect x="65" y="32" width="10" height="18" rx="1" fill="#F59E0B" />
            <rect x="80" y="28" width="12" height="22" rx="2" fill="#EF4444" />
            <rect x="98" y="32" width="10" height="18" rx="1" fill="#F59E0B" />
            
            {/* Middle Shelf: Batteries */}
            <rect x="60" y="75" width="22" height="20" rx="2" fill="#334155" />
            <rect x="64" y="71" width="4" height="4" fill="#EF4444" />
            <rect x="74" y="71" width="4" height="4" fill="#2563EB" />

            <circle cx="120" cy="78" r="12" fill="#1E293B" stroke="#94A3B8" strokeWidth="2" />
            <circle cx="120" cy="78" r="4" fill="#E2E8F0" />
            
            {/* Bottom Shelf: Car Gears and parts */}
            <circle cx="80" cy="125" r="10" fill="#64748B" />
            <circle cx="80" cy="125" r="5" fill="#F1F5F9" />
            
            <rect x="140" y="115" width="30" height="25" rx="3" fill="#1E3A8A" />
            <circle cx="155" cy="127" r="6" fill="#10B981" />

            {/* Customer Searching */}
            <g>
              {/* Body */}
              <circle cx="280" cy="100" r="8" fill="#F87171" />
              <path d="M270 110 C270 110 272 165 272 165 H290 L292 110 Z" fill="#0F172A" />
              <rect x="274" y="165" width="6" height="15" fill="#334155" />
              <rect x="282" y="165" width="6" height="15" fill="#334155" />
              {/* Hand/Tablet */}
              <path d="M272 120 L252 120 L248 132" stroke="#F87171" strokeWidth="4" strokeLinecap="round" />
              <rect x="240" y="128" width="14" height="10" rx="1.5" fill="#10B981" />
            </g>

            {/* Floating Search Magnifying Glass scanning */}
            <g className="animate-[searchTimeline_10s_linear_infinite]">
              <circle cx="70" cy="80" r="12" stroke="#2563EB" strokeWidth="3" fill="none" />
              <line x1="79" y1="89" x2="92" y2="102" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" />
            </g>

            {/* Floating Glowing spare part card found */}
            <g className="animate-[partTimeline_10s_linear_infinite]">
              {/* Card wrapper */}
              <rect x="75" y="40" width="55" height="42" rx="6" fill="#FFFFFF" stroke="#10B981" strokeWidth="2" filter="drop-shadow(0 4px 6px rgba(16,185,129,0.15))" />
              {/* Gear Vector inside card */}
              <circle cx="102" cy="56" r="8" fill="#10B981" />
              <circle cx="102" cy="56" r="3" fill="#FFFFFF" />
              <text x="102" y="74" fill="#1F2937" fontSize="6" fontWeight="bold" textAnchor="middle">PART FOUND</text>
            </g>

            {/* Shopping Cart sliding in to catch the item */}
            <g className="animate-[cartTimeline_10s_linear_infinite]">
              <rect x="220" y="145" width="30" height="20" rx="2" fill="none" stroke="#2563EB" strokeWidth="3" />
              <line x1="210" y1="140" x2="220" y2="145" stroke="#2563EB" strokeWidth="3" />
              <line x1="210" y1="130" x2="210" y2="140" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="225" cy="172" r="5" fill="#1E293B" />
              <circle cx="245" cy="172" r="5" fill="#1E293B" />
            </g>

            {/* Success checkout badge */}
            <g className="animate-[checkTimeline_10s_linear_infinite]" style={{ transformOrigin: '200px 100px' }}>
              <circle cx="200" cy="100" r="32" fill="#E8F5E9" stroke="#10B981" strokeWidth="3" />
              {/* Checkmark */}
              <path d="M188 100 L196 108 L212 90" stroke="#10B981" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <text x="200" y="148" fill="#10B981" fontSize="10" fontWeight="extrabold" textAnchor="middle">CHECKOUT SUCCESS</text>
            </g>
          </svg>
        </div>
      </div>



      {/* Dynamic Step Info Box */}
      <div className="w-full bg-[#F8FAFC] border border-slate-100 rounded-3xl p-5 my-2 text-left">
        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
          <span>{SCENE_DATA[activeScene].badge}</span>
          <span className="text-[#2563EB]">{SCENE_DATA[activeScene].statusText}</span>
        </div>
        <p className="text-xs text-slate-400 font-semibold">
          {SCENE_DATA[activeScene].desc}
        </p>
      </div>

      {/* Manual Selection Dots */}
      <div className="flex justify-center gap-2.5 my-2">
        {SCENE_DATA.map((_, index) => (
          <button
            key={index}
            onClick={() => handleSceneSelect(index)}
            className={`h-2.5 rounded-full transition-all duration-300 ${activeScene === index ? 'w-7 bg-[#2563EB]' : 'w-2.5 bg-slate-200 hover:bg-slate-300'}`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Bottom Clickable Previews */}
      <div className="grid grid-cols-3 gap-3 my-3">
        {SCENE_DATA.map((item, index) => {
          const isActive = index === activeScene;
          return (
            <button
              key={index}
              onClick={() => handleSceneSelect(index)}
              className={`text-left p-3 border rounded-2xl transition-all duration-300 group active:scale-[0.98] ${
                isActive 
                  ? 'border-slate-200/80 bg-blue-50/60 shadow-sm' 
                  : 'border-slate-200/65 bg-white hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 flex items-center justify-center text-[10px] font-extrabold rounded-full transition-all duration-300 ${
                    isActive ? 'bg-[#2563EB] text-white shadow-sm scale-105' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {index + 1}
                </span>
                <span
                  className={`text-xs font-bold transition-colors duration-300 ${
                    isActive ? 'text-[#2563EB]' : 'text-slate-700 group-hover:text-[#2563EB]'
                  }`}
                >
                  {item.previewTitle}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                {item.previewDesc}
              </p>
            </button>
          );
        })}
      </div>

      {/* Footer Trust Markers */}
      <div className="border-t border-slate-100 pt-4 mt-2 flex items-center justify-between text-slate-400 px-1 text-[11px] font-semibold">
        <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
          <Shield size={14} className="text-[#2563EB]" />
          <span>Safe & Secure</span>
        </div>
        <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
          <Truck size={14} className="text-[#2563EB]" />
          <span>Fast Delivery</span>
        </div>
        <div className="flex items-center gap-1.5 hover:text-slate-600 transition-colors">
          <Settings size={14} className="text-[#2563EB]" />
          <span>Best Services</span>
        </div>
      </div>
    </div>
  );
};

export default CarouselAnimation;
