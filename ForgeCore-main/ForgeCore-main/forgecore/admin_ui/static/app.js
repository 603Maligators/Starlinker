fetch('/api/modules').then(r=>r.json()).then(d=>{
  const el = document.getElementById('content');
  el.innerText = JSON.stringify(d, null, 2);
});
