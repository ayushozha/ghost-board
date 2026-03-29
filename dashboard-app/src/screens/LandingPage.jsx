import React from 'react';

export default function LandingPage({ onEnterDashboard }) {
  return (
    <div className="dark min-h-screen bg-[#0e0e0e] text-[#e5e2e1] overflow-x-hidden font-['Inter'] selection:bg-[#00ebf9] selection:text-black">
        <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&family=Space+Grotesk:wght@300;500;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined' !important;
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}

          .glass-panel { background: rgba(53, 53, 52, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.05); }
          .depth-gradient-text { background: linear-gradient(135deg, #ffffff 0%, #00ebf9 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .text-[#002022] { color: #002022; }
          .text-[#c6c6c6] { color: #c6c6c6; }
          .text-[#5bffa1] { color: #5bffa1; }
          .bg-[#5bffa1] { background-color: #5bffa1; }
          .text-[#ffb4ab] { color: #ffb4ab; }
          .border-[#00ebf9] { border-color: #00ebf9; }
          .border-[#5bffa1] { border-color: #5bffa1; }
          
          /* Typography mapping for Stitch fonts */
          .font-headline { font-family: 'Space Grotesk', sans-serif; }
          .font-body { font-family: 'Inter', sans-serif; }
          .font-label { font-family: 'Inter', sans-serif; font-weight: 500; letter-spacing: 0.1em; }
          .ghost-border { border: 1px solid rgba(71, 71, 71, 0.15); }
          .ambient-glow { box-shadow: 0 0 40px -10px rgba(91, 255, 161, 0.1); }
          .cyan-glow { box-shadow: 0 0 50px -15px rgba(0, 235, 249, 0.2); }
        `}</style>
        
{/*  TopAppBar  */}
<header className="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-xl border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
<nav className="flex justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">
<div className="flex items-center gap-3">
<span className="material-symbols-outlined text-xl text-white dark:text-[#00ebf9]" data-icon="blur_on">blur_on</span>
<span className="text-xl font-black tracking-tighter text-white dark:text-white uppercase font-headline">GHOST BOARD</span>
</div>
<div className="hidden md:flex gap-8">
<a className="font-['Inter'] tracking-tight font-bold text-sm uppercase text-[#00ebf9]" href="/">HOME</a>
<a className="font-['Inter'] tracking-tight font-bold text-sm uppercase text-white/60 hover:text-white transition-colors" href="/">INTEL</a>
<a className="font-['Inter'] tracking-tight font-bold text-sm uppercase text-white/60 hover:text-white transition-colors" href="/">SWARM</a>
<a className="font-['Inter'] tracking-tight font-bold text-sm uppercase text-white/60 hover:text-white transition-colors" href="/">SECURITY</a>
</div>
<button className="font-['Inter'] tracking-tight font-bold text-sm uppercase text-white dark:text-[#00ebf9] hover:bg-white/5 px-4 py-2 rounded transition-all duration-300 active:scale-95" onClick={onEnterDashboard}>ENTER DASHBOARD</button>
</nav>
</header>
<main>
{/*  Section 1: Hero  */}
<section className="relative min-h-screen flex flex-col items-center justify-center pt-24 px-6 overflow-hidden">
<div className="absolute inset-0 z-0">
<img alt="background" className="w-full h-full object-cover opacity-20" data-alt="deep space atmospheric visualization with subtle cyan digital data points and ethereal shifting smoke textures on black background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBaN9lm_2MlYAyJd3VT1RSjSYLH5bpxAO7yGCDTF9dtO2Dic7gsSnPy_pX-vxQIacXE13pRCH4LZSfDZotqiAp_jYd1RbUgh4zaCASg47sP5z4xHKGzBa3TFvxoTltqyodGbTeNyq_IZiIoqYr3pRL3iRlyXp8uoBVQ6OIHvYaAoxc1B9EZHRwz0Gnc1itNkbJdALAfJizJU2jxm5fSIbHn_wwhG2QyhYM74Q6cXRzuAayj5dae73kCAEUc3ihQiUot-9Mq7hgN_X8" />
<div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0e0e0e]/80 to-[#0e0e0e]"></div>
</div>
<div className="relative z-10 text-center max-w-5xl mx-auto">
<label className="font-label text-sm md:text-base tracking-[0.4em] text-[#5bffa1] mb-8 block uppercase font-medium">Autonomous Executive Systems</label>
<h1 className="font-headline text-5xl md:text-7xl lg:text-[7.5rem] font-black tracking-tight mb-10 leading-[1.05] depth-gradient-text uppercase drop-shadow-2xl">
                    Autonomous<br/>Boardroom.
                </h1>
<p className="font-body text-xl md:text-2xl text-[#c6c6c6] max-w-3xl mx-auto mb-16 leading-relaxed font-light">
                    A high-frequency cognitive stack powered by 5 specialized agents orchestrating over 1M market nodes with zero-latency execution.
                </p>
<div className="flex flex-col md:flex-row gap-8 justify-center items-center">
<button className="relative uppercase text-sm tracking-[0.2em] font-black text-[#002022] bg-gradient-to-r from-[#00ebf9] to-[#5bffa1] rounded-full shadow-[0_0_30px_rgba(0,235,249,0.3)] hover:shadow-[0_0_50px_rgba(0,235,249,0.5)] transition-all duration-300 hover:-translate-y-1 active:scale-95 z-10" style={{ padding: '22px 52px' }} onClick={onEnterDashboard}>INITIATE SIMULATION</button>
<button className="relative uppercase text-sm tracking-[0.2em] font-bold text-white bg-white/5 border border-white/20 rounded-full hover:bg-white/10 hover:border-white/40 transition-all duration-300 hover:-translate-y-1 active:scale-95 z-10 backdrop-blur-md" style={{ padding: '22px 52px' }}>
                        VIEW WHITEPAPER
                    </button>
</div>
</div>
</section>
{/*  Section 2: The Numbers  */}
<section className="py-32 px-6 max-w-7xl mx-auto">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
{/*  Metric Card 1  */}
<div className="glass-panel p-12 rounded-2xl relative overflow-hidden group hover:shadow-[0_0_40px_rgba(0,235,249,0.1)] transition-all duration-500 hover:-translate-y-2">
<div className="relative z-10 flex flex-col h-full">
<label className="font-label text-xs tracking-[0.2em] text-[#00ebf9] opacity-80 uppercase mb-6 block">Cost Delta Optimization</label>
<h3 className="text-3xl lg:text-5xl font-headline font-black mb-10 text-white tracking-tight leading-[1.1]">$0.19 API Cost <br/><span className="text-[#c6c6c6] font-light text-2xl lg:text-3xl line-through opacity-70">vs $15k Human</span></h3>
<div className="h-48 flex items-end gap-4 px-2 mt-auto">
<div className="flex-1 bg-[#333] rounded-t-sm h-[5%]"></div>
<div className="flex-1 bg-[#333] rounded-t-sm h-[10%]"></div>
<div className="flex-1 bg-gradient-to-t from-[#00ebf9]/20 to-[#00ebf9] rounded-t-md h-[95%] shadow-[0_0_20px_rgba(0,235,249,0.5)] z-10 relative"><div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_15px_white]"></div></div>
<div className="flex-1 bg-[#333] rounded-t-sm h-[15%]"></div>
<div className="flex-1 bg-[#333] rounded-t-sm h-[20%]"></div>
<div className="flex-1 bg-[#00ebf9]/30 rounded-t-sm h-[80%]"></div>
</div>
</div>
</div>
{/*  Metric Card 2  */}
<div className="glass-panel p-12 rounded-2xl relative overflow-hidden group hover:shadow-[0_0_40px_rgba(91,255,161,0.1)] transition-all duration-500 hover:-translate-y-2">
<div className="relative z-10 flex flex-col h-full">
<label className="font-label text-xs tracking-[0.2em] text-[#5bffa1] opacity-80 uppercase mb-6 block">Swarm Intelligence Scale</label>
<h3 className="text-3xl lg:text-5xl font-headline font-black mb-10 text-white tracking-tight leading-[1.1]">1M+ Market <br/>Agents</h3>
<div className="relative h-48 w-full flex items-center justify-center mt-auto rounded-xl overflow-hidden border border-white/5">
<img alt="swarm" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen scale-110 group-hover:scale-100 transition-transform duration-1000" data-alt="microscopic view of glowing data swarm particles connecting in complex hexagonal patterns on deep blue black background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDNRljmSL7DurVMWtifGfzPx-VAenrWdIRo25ibnZOpj8oV_jwqsQFNcvxsncCw_r04GZKa9FZcuw48YkOLM7RiZfCpjW4xwPLsP4LOJee45-TG7SkD6ihshBo7jj4HJi2wumjm1fqzH3N3BuiB8F2Z_r2tSOpzbxxxIQ2tX2c9E_zKt65N5zqr64UodMh-NAdIzral0S-16raH24Gv7tkb-CHKnIclehlpbvTA1flMVG1bRml1ygR1URjxrIdZk2zEnUWXdlVF6Hg" />
<div className="absolute text-[#5bffa1] drop-shadow-[0_0_20px_rgba(91,255,161,0.8)] z-10">
<span className="material-symbols-outlined text-6xl" data-icon="hub">hub</span>
</div>
<div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] to-transparent opacity-80"></div>
</div>
</div>
</div>
</div>
</section>
{/*  Section 3: The Event Pipeline  */}
<section className="py-32 px-6 bg-[#0e0e0e]">
<div className="max-w-7xl mx-auto">
<div className="flex justify-between items-end mb-20">
<div>
<label className="font-label text-[#5bffa1] tracking-[0.2em] uppercase text-xs">Processing Architecture</label>
<h2 className="text-5xl font-headline font-black mt-4 uppercase">Event Pipeline</h2>
</div>
<div className="text-right text-[#c6c6c6] font-label text-sm">LATENCY: 4.2ms PER CYCLE</div>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 lg:gap-8 relative">
{/*  Steps  */}
<div className="relative group">
<div className="glass-panel p-8 rounded-2xl ghost-border hover:border-[#00ebf9] hover:shadow-[0_0_30px_rgba(0,235,249,0.1)] transition-all duration-300 hover:-translate-y-2 h-full flex flex-col">
<span className="text-3xl font-headline font-black text-[#c6c6c6]/20 mb-6 block">01</span>
<h4 className="font-headline font-bold text-xl mb-4 text-white uppercase tracking-wide">Ingestion</h4>
<p className="text-[15px] text-[#c6c6c6] leading-relaxed">Multi-source raw telemetry capture & market listening.</p>
</div>
</div>
<div className="relative group">
<div className="glass-panel p-8 rounded-2xl ghost-border hover:border-[#00ebf9] hover:shadow-[0_0_30px_rgba(0,235,249,0.1)] transition-all duration-300 hover:-translate-y-2 h-full flex flex-col">
<span className="text-3xl font-headline font-black text-[#c6c6c6]/20 mb-6 block">02</span>
<h4 className="font-headline font-bold text-xl mb-4 text-white uppercase tracking-wide">Filtering</h4>
<p className="text-[15px] text-[#c6c6c6] leading-relaxed">Noise reduction via cognitive gating networks.</p>
</div>
</div>
<div className="relative group">
<div className="glass-panel p-8 rounded-2xl ghost-border hover:border-[#00ebf9] hover:shadow-[0_0_30px_rgba(0,235,249,0.1)] transition-all duration-300 hover:-translate-y-2 h-full flex flex-col">
<span className="text-3xl font-headline font-black text-[#c6c6c6]/20 mb-6 block">03</span>
<h4 className="font-headline font-bold text-xl mb-4 text-white uppercase tracking-wide">Analysis</h4>
<p className="text-[15px] text-[#c6c6c6] leading-relaxed">Agentic pattern recognition & state-mapping.</p>
</div>
</div>
<div className="relative group">
<div className="glass-panel p-8 rounded-2xl ghost-border hover:border-[#00ebf9] hover:shadow-[0_0_30px_rgba(0,235,249,0.1)] transition-all duration-300 hover:-translate-y-2 h-full flex flex-col">
<span className="text-3xl font-headline font-black text-[#c6c6c6]/20 mb-6 block">04</span>
<h4 className="font-headline font-bold text-xl mb-4 text-white uppercase tracking-wide">Synthesis</h4>
<p className="text-[15px] text-[#c6c6c6] leading-relaxed">Unified cross-agent alignment and consensus block.</p>
</div>
</div>
<div className="relative group">
<div className="glass-panel p-8 rounded-2xl bg-[#00ebf9]/5 border border-[#00ebf9]/30 hover:border-[#00ebf9] hover:shadow-[0_0_30px_rgba(0,235,249,0.2)] transition-all duration-300 hover:-translate-y-2 h-full flex flex-col">
<span className="text-3xl font-headline font-black text-[#00ebf9] mb-6 block drop-shadow-[0_0_10px_rgba(0,235,249,0.5)]">05</span>
<h4 className="font-headline font-bold text-xl mb-4 text-white uppercase tracking-wide">Execution</h4>
<p className="text-[15px] text-[#c6c6c6] leading-relaxed">Autonomous terminal command deployment & execution stream.</p>
</div>
</div>
</div>
</div>
</section>
{/*  Section 4: Executive Nodes  */}
<section className="py-32 px-6 overflow-hidden">
<div className="max-w-7xl mx-auto">
<h2 className="text-4xl font-headline font-black mb-16 text-center tracking-tight uppercase">The Agentic Board</h2>
<div className="flex flex-wrap justify-center gap-8">
{/*  CEO  */}
<div className="glass-panel p-10 rounded-2xl flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(0,235,249,0.15)] group w-full md:w-[calc(33%-1.5rem)] lg:w-[calc(20%-1.6rem)]">
<div className="w-16 h-16 rounded-2xl bg-[#1c1b1b] flex items-center justify-center mb-8 border border-white/10 group-hover:border-[#00ebf9] group-hover:shadow-[0_0_20px_rgba(0,235,249,0.2)] transition-all">
<span className="material-symbols-outlined text-3xl text-[#00ebf9]" data-icon="stars">stars</span>
</div>
<div className="flex-1 flex flex-col">
<h4 className="font-headline font-black text-2xl text-white mb-3 uppercase tracking-wider">CEO</h4>
<p className="text-[11px] font-label text-[#c6c6c6] opacity-70 mb-5 tracking-[0.2em] uppercase">Strategic Alignment</p>
<p className="text-sm text-[#c6c6c6] leading-relaxed">Global mission coherence &amp; objective weighting.</p>
</div>
</div>
{/*  CTO  */}
<div className="glass-panel p-10 rounded-2xl flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(0,235,249,0.15)] group w-full md:w-[calc(33%-1.5rem)] lg:w-[calc(20%-1.6rem)]">
<div className="w-16 h-16 rounded-2xl bg-[#1c1b1b] flex items-center justify-center mb-8 border border-white/10 group-hover:border-[#00ebf9] group-hover:shadow-[0_0_20px_rgba(0,235,249,0.2)] transition-all">
<span className="material-symbols-outlined text-3xl text-[#00ebf9]" data-icon="memory">memory</span>
</div>
<div className="flex-1 flex flex-col">
<h4 className="font-headline font-black text-2xl text-white mb-3 uppercase tracking-wider">CTO</h4>
<p className="text-[11px] font-label text-[#c6c6c6] opacity-70 mb-5 tracking-[0.2em] uppercase">Tech Architecture</p>
<p className="text-sm text-[#c6c6c6] leading-relaxed">Infrastructure integrity &amp; compute orchestration.</p>
</div>
</div>
{/*  CFO  */}
<div className="glass-panel p-10 rounded-2xl flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(0,235,249,0.15)] group w-full md:w-[calc(33%-1.5rem)] lg:w-[calc(20%-1.6rem)]">
<div className="w-16 h-16 rounded-2xl bg-[#1c1b1b] flex items-center justify-center mb-8 border border-white/10 group-hover:border-[#00ebf9] group-hover:shadow-[0_0_20px_rgba(0,235,249,0.2)] transition-all">
<span className="material-symbols-outlined text-3xl text-[#00ebf9]" data-icon="account_balance">account_balance</span>
</div>
<div className="flex-1 flex flex-col">
<h4 className="font-headline font-black text-2xl text-white mb-3 uppercase tracking-wider">CFO</h4>
<p className="text-[11px] font-label text-[#c6c6c6] opacity-70 mb-5 tracking-[0.2em] uppercase">Capital Allocation</p>
<p className="text-sm text-[#c6c6c6] leading-relaxed">Liquidity risk management &amp; yield optimization.</p>
</div>
</div>
{/*  CMO  */}
<div className="glass-panel p-10 rounded-2xl flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(0,235,249,0.15)] group w-full md:w-[calc(40%-1.6rem)] lg:w-[calc(20%-1.6rem)]">
<div className="w-16 h-16 rounded-2xl bg-[#1c1b1b] flex items-center justify-center mb-8 border border-white/10 group-hover:border-[#00ebf9] group-hover:shadow-[0_0_20px_rgba(0,235,249,0.2)] transition-all">
<span className="material-symbols-outlined text-3xl text-[#00ebf9]" data-icon="radar">radar</span>
</div>
<div className="flex-1 flex flex-col">
<h4 className="font-headline font-black text-2xl text-white mb-3 uppercase tracking-wider">CMO</h4>
<p className="text-[11px] font-label text-[#c6c6c6] opacity-70 mb-5 tracking-[0.2em] uppercase">Market Sentiment</p>
<p className="text-sm text-[#c6c6c6] leading-relaxed">Social velocity &amp; behavioral signal capture.</p>
</div>
</div>
{/*  Legal  */}
<div className="glass-panel p-10 rounded-2xl flex flex-col items-center text-center transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(0,235,249,0.15)] group w-full md:w-[calc(40%-1.6rem)] lg:w-[calc(20%-1.6rem)]">
<div className="w-16 h-16 rounded-2xl bg-[#1c1b1b] flex items-center justify-center mb-8 border border-white/10 group-hover:border-[#00ebf9] group-hover:shadow-[0_0_20px_rgba(0,235,249,0.2)] transition-all">
<span className="material-symbols-outlined text-3xl text-[#00ebf9]" data-icon="gavel">gavel</span>
</div>
<div className="flex-1 flex flex-col">
<h4 className="font-headline font-black text-2xl text-white mb-3 uppercase tracking-wider">Legal</h4>
<p className="text-[11px] font-label text-[#c6c6c6] opacity-70 mb-5 tracking-[0.2em] uppercase">Compliance</p>
<p className="text-sm text-[#c6c6c6] leading-relaxed">Regulatory fencing &amp; smart contract auditing.</p>
</div>
</div>
</div>
</div>
</section>
{/*  Section 5: Market Arena Simulation  */}
<section className="py-32 px-6 bg-[#0a0a0b] relative overflow-hidden">
<div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-20">
<div className="flex-1">
<label className="font-label text-[#00ebf9] tracking-[0.3em] font-medium uppercase text-sm block mb-4">Environment: MiroFish</label>
<h2 className="text-4xl lg:text-6xl font-headline font-black mb-10 uppercase leading-[1.1] tracking-tight">MiroFish<br/>Stress-Testing<br/>Arena</h2>
<p className="text-xl text-[#c6c6c6] mb-12 leading-relaxed max-w-xl font-light">
                        A proprietary outer-loop simulation environment where Ghost Board strategies are stress-tested against 1,000,000 synthetic market minds before a single instruction is committed to the mainnet.
                    </p>
<div className="space-y-6">
<div className="flex items-center gap-4">
<div className="w-2 h-2 rounded-full bg-[#5bffa1]"></div>
<span className="text-sm font-label uppercase">99.99% Consensus Required</span>
</div>
<div className="flex items-center gap-4">
<div className="w-2 h-2 rounded-full bg-[#5bffa1]"></div>
<span className="text-sm font-label uppercase">Adversarial Swarm Resistance</span>
</div>
</div>
</div>
<div className="flex-1 relative">
<div className="aspect-square glass-panel rounded-full border border-[#00ebf9]/20 flex items-center justify-center p-8 relative">
<div className="absolute inset-0 rounded-full border-t border-[#00ebf9]/40 animate-spin transition-all duration-[10s]"></div>
<div className="w-full h-full rounded-full border border-white/5 overflow-hidden flex items-center justify-center">
<img alt="simulation" className="w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-700" data-alt="abstract circular radar interface with complex digital scanning lines and glowing cyan data nodes resembling global network connections" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDc9HeKWHlPkp4G3GUbO_2y2i4XDFy5qNeflg59bvKdl0-8bMjU4UbEuV2L9nLg7-AYowMBfAl3KdP_Qf72MT-OW5JwRRMdXXVcCgaLIqDIOpXeLXKUj3Zg9Ut9I2XfBS_q4rY6etJbfsviiO2vUGt52RKJLH8p4XCXBgC5hOUqgcg2SviXmRVQhVh8NwdGizeRIvebr6TJuPX4JZY7i7mdWB9VKv9wEKLiITF1tLlo6d7bzoGVQ4rXtykOVOWyC2jnrztO9d6-xZI" />
<div className="absolute inset-0 bg-radial-gradient from-transparent to-[#0a0a0b]"></div>
</div>
</div>
</div>
</div>
</section>
{/*  Section 6: Architecture Trace  */}
<section className="py-32 px-6">
<div className="max-w-7xl mx-auto">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
<div className="space-y-8">
<div className="h-[2px] w-20 bg-[#00ebf9]"></div>
<h3 className="text-3xl lg:text-5xl font-headline font-black uppercase tracking-tight mb-8">Async Event Bus</h3>
<p className="text-[#c6c6c6] text-lg leading-relaxed mb-8">
                            A zero-block message broker that decouples agent decision-making from execution latency. Ghost Board maintains a persistent state-log accessible to all 5 nodes concurrently.
                        </p>
<div className="bg-[#1c1b1b]/80 p-8 rounded-xl font-label text-sm text-[#00ebf9] tracking-[0.15em] border-l-4 border-[#00ebf9] shadow-lg flex flex-col gap-3">
                            <span className="opacity-90">// TRACE_ID: <span className="text-white">GH-BOARD-8892</span></span>
                            <span className="opacity-90">// BUS_STATE: <span className="text-white">STREAMING...</span></span>
                            <span className="opacity-90">// LATENCY_NOMINAL: <span className="text-white">0.002MS</span></span>
                        </div>
</div>
<div className="space-y-8">
<div className="h-[2px] w-20 bg-[#5bffa1]"></div>
<h3 className="text-3xl lg:text-5xl font-headline font-black uppercase tracking-tight mb-8">Swarm Topology</h3>
<p className="text-[#c6c6c6] text-lg leading-relaxed mb-8">
                            A distributed mesh network of 1M+ specialized sub-agents providing real-time telemetry from every liquidity pool and social vector globally.
                        </p>
<div className="bg-[#1c1b1b]/80 p-8 rounded-xl font-label text-sm text-[#5bffa1] tracking-[0.15em] border-l-4 border-[#5bffa1] shadow-lg flex flex-col gap-3">
                            <span className="opacity-90">// NODE_COUNT: <span className="text-white">1,048,576</span></span>
                            <span className="opacity-90">// TOPOLOGY: <span className="text-white">MESH_HEX</span></span>
                            <span className="opacity-90">// UPTIME: <span className="text-white">99.999%</span></span>
                        </div>
</div>
</div>
</div>
</section>
{/*  Section 7: Ralphthon Constraints  */}
<section className="py-32 px-6 bg-[#1c1b1b] border-y border-white/5">
<div className="max-w-4xl mx-auto">
<div className="text-center mb-16">
<label className="font-label text-[#ffb4ab] tracking-[0.4em] uppercase text-xs mb-4 block">Safety Protocols</label>
<h2 className="text-5xl font-headline font-black uppercase">Ralphthon Constraints</h2>
</div>
<div className="space-y-6">
<div className="flex items-center justify-between p-10 glass-panel bg-[#2a2a2a]/20 border border-white/10 rounded-2xl group hover:border-[#5bffa1]/50 hover:bg-[#5bffa1]/5 hover:shadow-[0_0_30px_rgba(91,255,161,0.1)] transition-all duration-300">
<div className="flex items-center gap-8">
<span className="text-3xl md:text-5xl font-headline font-black text-white/10 group-hover:text-white/20 transition-colors">01</span>
<span className="text-lg md:text-2xl font-headline font-black text-white tracking-widest uppercase">Immutable Sovereignty</span>
</div>
<span className="material-symbols-outlined text-[#5bffa1] text-3xl group-hover:scale-125 group-hover:drop-shadow-[0_0_15px_rgba(91,255,161,0.8)] transition-all" data-icon="verified_user">verified_user</span>
</div>
<div className="flex items-center justify-between p-10 glass-panel bg-[#2a2a2a]/20 border border-white/10 rounded-2xl group hover:border-[#5bffa1]/50 hover:bg-[#5bffa1]/5 hover:shadow-[0_0_30px_rgba(91,255,161,0.1)] transition-all duration-300">
<div className="flex items-center gap-8">
<span className="text-3xl md:text-5xl font-headline font-black text-white/10 group-hover:text-white/20 transition-colors">02</span>
<span className="text-lg md:text-2xl font-headline font-black text-white tracking-widest uppercase">Absolute Verifiability</span>
</div>
<span className="material-symbols-outlined text-[#5bffa1] text-3xl group-hover:scale-125 group-hover:drop-shadow-[0_0_15px_rgba(91,255,161,0.8)] transition-all" data-icon="rule">rule</span>
</div>
<div className="flex items-center justify-between p-10 glass-panel bg-[#2a2a2a]/20 border border-white/10 rounded-2xl group hover:border-[#ffb4ab]/50 hover:bg-[#ffb4ab]/5 hover:shadow-[0_0_30px_rgba(255,180,171,0.1)] transition-all duration-300">
<div className="flex items-center gap-8">
<span className="text-3xl md:text-5xl font-headline font-black text-white/10 group-hover:text-white/20 transition-colors">03</span>
<span className="text-lg md:text-2xl font-headline font-black text-white tracking-widest uppercase text-error">Kill-Switch Finality</span>
</div>
<span className="material-symbols-outlined text-[#ffb4ab] text-3xl group-hover:scale-125 group-hover:drop-shadow-[0_0_15px_rgba(255,180,171,0.8)] transition-all" data-icon="dangerous">dangerous</span>
</div>
</div>
</div>
</section>
{/*  Section 8: Final CTA  */}
<section className="py-40 px-6 relative overflow-hidden flex flex-col items-center">
<div className="absolute inset-0 bg-gradient-to-t from-[#00ebf9]/10 via-transparent to-transparent opacity-30"></div>
<div className="max-w-5xl text-center relative z-10">
<h2 className="text-5xl md:text-7xl font-headline font-black uppercase tracking-tight mb-14 depth-gradient-text leading-[1.1]">Ready for Autonomy?</h2>
<div className="flex flex-col md:flex-row justify-center items-center gap-10">
<button className="relative uppercase text-sm md:text-base tracking-[0.2em] font-black text-[#002022] bg-gradient-to-r from-[#00ebf9] to-[#5bffa1] rounded-full shadow-[0_0_30px_rgba(0,235,249,0.3)] hover:shadow-[0_0_50px_rgba(0,235,249,0.5)] transition-all duration-300 hover:-translate-y-1 active:scale-95 z-10" style={{ padding: '24px 60px' }} onClick={onEnterDashboard}>ENTER DASHBOARD</button>
<div className="flex items-center gap-4 text-[#c6c6c6]/60 font-label text-sm uppercase tracking-widest">
<span className="w-3 h-3 rounded-full bg-[#5bffa1] animate-pulse shadow-[0_0_15px_rgba(91,255,161,0.6)]"></span>
                        SYSTEMS NOMINAL
                    </div>
</div>
</div>
</section>
</main>
{/*  Footer  */}
<footer className="bg-[#0e0e0e] w-full py-16 px-8 border-t border-white/5">
<div className="flex flex-col md:flex-row justify-between items-center gap-8 max-w-7xl mx-auto">
<div className="flex flex-col items-center md:items-start gap-2">
<span className="text-lg font-bold text-white font-headline">GHOST BOARD</span>
<p className="font-['Space_Grotesk'] text-[10px] tracking-[0.2em] uppercase text-white/40">
                    © 2026 GHOST BOARD. AUTONOMOUS EXECUTIVE SYSTEMS.
                </p>
</div>
<div className="flex flex-wrap justify-center gap-8">
<a className="font-['Space_Grotesk'] text-[10px] tracking-[0.2em] uppercase text-white/40 hover:text-[#5bffa1] transition-colors" href="/">INTELLIGENCE</a>
<a className="font-['Space_Grotesk'] text-[10px] tracking-[0.2em] uppercase text-white/40 hover:text-[#5bffa1] transition-colors" href="/">OPERATIONS</a>
<a className="font-['Space_Grotesk'] text-[10px] tracking-[0.2em] uppercase text-white/40 hover:text-[#5bffa1] transition-colors" href="/">SECURITY</a>
<a className="font-['Space_Grotesk'] text-[10px] tracking-[0.2em] uppercase text-white/40 hover:text-[#5bffa1] transition-colors" href="/">TERMINAL</a>
</div>
<div className="flex gap-4">
<div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 cursor-pointer">
<span className="material-symbols-outlined text-sm" data-icon="share">share</span>
</div>
<div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 cursor-pointer">
<span className="material-symbols-outlined text-sm" data-icon="terminal">terminal</span>
</div>
</div>
</div>
</footer>

    </div>
  );
}
