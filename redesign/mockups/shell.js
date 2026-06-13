(function(){
  var page=(document.body&&document.body.dataset.page)||'';
  var tabs=[['overview','Overview','cinematic.html'],['vote','Vote','vote.html'],['forum','Forum','stitch-forum.html'],['leaderboard','Leaderboard','stitch-leaderboard.html'],['account','Account','account.html']];
  var mark='<div class="mark"><svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v5"/></svg></div>';
  var check='<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
  var cog='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>';
  var tabsHtml=tabs.map(function(t){return '<a class="tab'+(t[0]===page?' on':'')+'" href="'+t[2]+'">'+t[1]+'</a>';}).join('');
  var nav='<nav><span class="sheen"></span>'+
    '<div class="brand">'+mark+'<b>Community Fund</b></div>'+
    '<div class="tabs">'+tabsHtml+'</div>'+
    '<div class="navr"><span class="wal"><span>USDC</span> $5,000.00</span>'+
    '<span class="vfy">'+check+'Verified</span>'+
    '<a class="gear" href="stitch-settings.html" title="Settings" aria-label="Settings">'+cog+'</a></div></nav>';
  var root=document.getElementById('nav-root');
  if(root){root.outerHTML=nav;}else{document.body.insertAdjacentHTML('afterbegin',nav);}
})();
