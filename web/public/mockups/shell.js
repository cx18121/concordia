(function(){
  var page=(document.body&&document.body.dataset.page)||'';
  var tabs=[['overview','Overview','cinematic.html'],['vote','Vote','vote.html'],['forum','Forum','stitch-forum.html'],['leaderboard','Leaderboard','stitch-leaderboard.html'],['account','Account','account.html']];
  var mark='<div class="mark"><svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5"/></svg></div>';
  var cog='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>';
  var tabsHtml=tabs.map(function(t){return '<span class="tab'+(t[0]===page?' on':'')+'" data-href="'+t[2]+'">'+t[1]+'</span>';}).join('');
  var nav='<nav><span class="sheen"></span>'+
    '<div class="brand" data-href="cinematic.html" style="cursor:pointer">'+mark+'<b>Community Fund</b></div>'+
    '<div class="tabs">'+tabsHtml+'</div>'+
    '<div class="navr"><span class="wal tnum" data-count="43820.50">$43,820.50</span>'+
    '<span class="gear" data-href="stitch-settings.html" aria-label="Settings">'+cog+'</span></div></nav>';
  var root=document.getElementById('nav-root');
  if(root){root.outerHTML=nav;}else{document.body.insertAdjacentHTML('afterbegin',nav);}
  var navEl=document.querySelector('nav');
  if(navEl){navEl.addEventListener('click',function(e){var t=e.target.closest('[data-href]');if(t)window.location.href=t.getAttribute('data-href');});}

  // loading animation: count up numbers
  var RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.countUp=function(el){
    var target=parseFloat(el.getAttribute('data-count'));if(isNaN(target))return;
    var prefix=(el.textContent.match(/^[^0-9.-]*/)||[''])[0];
    var suffix=el.getAttribute('data-suffix')||'';
    var dec=el.getAttribute('data-dec')!=null?+el.getAttribute('data-dec'):2;
    function fmt(v){return prefix+v.toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec})+suffix;}
    if(RM){el.textContent=fmt(target);return;}
    var t0=null,dur=950;
    function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/dur,1),e=1-Math.pow(1-p,3);el.textContent=fmt(target*e);if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  };
  [].forEach.call(document.querySelectorAll('[data-count]'),window.countUp);
})();
