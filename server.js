const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const cleanUrl=v=>{if(!v)return '';try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
async function records(env){const o=await env.BUCKET.get('projects.json');return o?o.json():structuredClone(SEED)}

const repoKey=v=>{try{const u=new URL(v);if(!['github.com','www.github.com'].includes(u.hostname.toLowerCase()))return '';const m=u.pathname.replace(/\/+$/,'').match(/^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)$/);return m?m[1]+'/'+m[2].replace(/\.git$/i,''):''}catch{return ''}};
const publicURL=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)&&!/(^|\.)(localhost|local|internal|test|invalid)$/i.test(u.hostname)?u.href:''}catch{return ''}};
const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(+n,1114111))).trim();
async function getPublic(url){for(let i=0;i<3;i++){url=publicURL(url);if(!url)throw Error('Use a public HTTPS website URL');const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{'User-Agent':'Palawan-Collective-Projects','Accept':'text/html,application/json'}});if(r.status>=300&&r.status<400){url=new URL(r.headers.get('Location'),url).href;continue}return r}throw Error('Too many website redirects')}
async function inspectProject(b){const key=repoKey(b.repo);if(!key)throw Error('Paste a full GitHub repository URL');const warnings=[];let repo={};try{const r=await getPublic('https://api.github.com/repos/'+key);if(r.ok)repo=await r.json();else warnings.push('Repository details are unavailable. Your link is saved; add the live website URL to complete the profile.')}catch{warnings.push('GitHub did not respond. Your repository link is still usable.')}
let live=cleanUrl(b.url||repo.homepage||'');if(live&&!publicURL(live))throw Error('Live website must use a public HTTPS URL');let meta={};if(live){try{const r=await getPublic(live);if(r.ok&&(r.headers.get('Content-Type')||'').includes('text/html')){const reader=r.body.getReader();let html='',bytes=0;const dec=new TextDecoder();while(bytes<524288){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;html+=dec.decode(chunk.value,{stream:true})}await reader.cancel();for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const attrs={};for(const a of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]);const name=attrs.property||attrs.name;if(name&&attrs.content)meta[name.toLowerCase()]=attrs.content}meta.title=meta['og:title']||decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);}else warnings.push('Website metadata could not be read. The live URL has still been saved.')}catch{warnings.push('Website metadata could not be read. The live URL has still been saved.')}}else warnings.push('No live URL found in GitHub. Add it in the Live website field.');
const title=(meta.title||repo.name||key.split('/')[1].replace(/[-_]/g,' ')).split(/\s+[|—]\s+/)[0];let image='';if(meta['og:image']&&live){try{image=publicURL(new URL(meta['og:image'],live).href)}catch{}}
return {project:{name:title.slice(0,100),description:(meta['og:description']||meta.description||repo.description||'').slice(0,500),repo:'https://github.com/'+key,url:live,image,category:'Website',status:live?'Demo':'In progress',featured:true},warnings}}

function repositoriesWithPushDates(inventory) {
  const auditedDates = new Map((inventory.repoAudits || []).map(audit => [audit.repo.toLowerCase(), audit.pushedAt]));
  const knownDates = new Map(INVENTORY.repoAudits.map(audit => [audit.repo.toLowerCase(), audit.pushedAt]));
  const knownRepos = new Map(INVENTORY.repositories.map(repo => [String(repo.id), repo.name.toLowerCase()]));

  return inventory.repositories.map(repo => {
    const name = repo.name.toLowerCase();
    const knownDate = repo.id != null && knownRepos.get(String(repo.id)) === name ? knownDates.get(name) : null;
    const pushedAt = [repo.pushedAt, auditedDates.get(name), knownDate]
      .filter(date => typeof date === 'string' && Number.isFinite(Date.parse(date)))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    return {...repo, pushedAt};
  });
}

const deletionPrefix = 'inventory/github-delete/';

function isInventoryOwner(request) {
  const email = request.headers.get('oai-authenticated-user-email');
  return Boolean(request.headers.get('oai-authenticated-user-id') &&
    email?.toLowerCase() === 'growpalawan@gmail.com');
}

const dashboardRemovalPrefix = 'inventory/dashboard-removed/';

function canManageDashboard(request, env) {
  return isInventoryOwner(request) || Boolean(env.DASHBOARD_BRIDGE_SECRET &&
    request.headers.get('x-dashboard-bridge') === env.DASHBOARD_BRIDGE_SECRET);
}


async function removedDashboardRows(env) {
  const ids = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({prefix: dashboardRemovalPrefix, include: ['customMetadata'], cursor});
    for (const object of page.objects) {
      if (object.customMetadata?.id) ids.push(object.customMetadata.id);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return ids;
}

async function removeDashboardRow(request, env) {
  if (!canManageDashboard(request, env)) {
    return json({error: 'Sign in as the dashboard owner to remove records.'}, 403);
  }
  const {id} = await request.json();
  if (typeof id !== 'string' || !id || id.length > 250) {
    return json({error: 'Invalid dashboard record.'}, 400);
  }

  const snapshot = await env.BUCKET.get('inventory/snapshot.json');
  const inventory = snapshot ? await snapshot.json() : INVENTORY;
  const exists = inventory.repositories.some(repo => repo.name.toLowerCase() === id) ||
    inventory.projects.some(project => (project.repo ? project.repo.toLowerCase() : 'unlinked:' + project.projectId) === id);
  if (!exists) return json({error: 'Dashboard record not found.'}, 404);

  await env.BUCKET.put(dashboardRemovalPrefix + encodeURIComponent(id), '', {customMetadata: {id}});
  return json({id});
}

async function deleteGitHubRepo(request, env) {
  if (!isInventoryOwner(request)) {
    return json({error: 'Sign in as the dashboard owner to delete repositories.'}, 403);
  }
  const {repositoryId, confirmation, token} = await request.json();
  if (!/^\d{1,24}$/.test(String(repositoryId)) ||
      typeof token !== 'string' || !/^github_pat_[A-Za-z0-9_]{20,250}$/.test(token)) {
    return json({error: 'Use a fine-grained GitHub personal access token.'}, 400);
  }

  const snapshot = await env.BUCKET.get('inventory/snapshot.json');
  const inventory = snapshot ? await snapshot.json() : INVENTORY;
  const repo = inventory.repositories.find(item => String(item.id) === String(repositoryId));
  if (!repo || confirmation !== repo.name ||
      !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repo.name) ||
      repo.name.split('/').some(part => part === '.' || part === '..')) {
    return json({error: 'Type the exact owner/repository name shown in the dialog.'}, 400);
  }

  const receiptKey = deletionPrefix + String(repo.id) + '.json';
  const existing = await env.BUCKET.get(receiptKey);
  if (existing) {
    const receipt = await existing.json();
    if (receipt.status === 'deleted') return json(receipt);
    return json({error: 'A deletion was already submitted. Check the repository in GitHub before taking further action.'}, 409);
  }

  const endpoint = 'https://api.github.com/repos/' + repo.name.split('/').map(encodeURIComponent).join('/');
  const githubRequest = method => fetch(endpoint, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Palawan-Collective-Projects',
      'X-GitHub-Api-Version': '2026-03-10'
    }
  });

  let current;
  try {
    const lookup = await githubRequest('GET');
    if (lookup.ok) current = await lookup.json();
    else return json({error: 'GitHub could not verify the repository (HTTP ' + lookup.status + '). Check the token and its repository access.'}, 422);
  } catch {
    return json({error: 'GitHub could not verify the repository. Try again when GitHub is reachable.'}, 502);
  }
  if (String(current.id) !== String(repo.id) || current.full_name?.toLowerCase() !== repo.name.toLowerCase()) {
    return json({error: 'The repository identity changed. Update the inventory before deleting it.'}, 409);
  }
  if (current.permissions?.admin === false) {
    return json({error: 'GitHub requires repository administrator access.'}, 403);
  }

  const receipt = {repositoryId: String(repo.id), repo: repo.name, status: 'submitted', at: new Date().toISOString()};
  const reserved = await env.BUCKET.put(receiptKey, JSON.stringify(receipt), {
    onlyIf: new Headers({'If-None-Match': '*'}),
    customMetadata: receipt
  });
  if (!reserved) return json({error: 'A deletion for this repository is already recorded.'}, 409);

  let result;
  try {
    result = await githubRequest('DELETE');
  } catch {
    return json({error: 'GitHub did not confirm the outcome. Check the repository in GitHub before taking further action.'}, 502);
  }
  if (result.status !== 204) {
    if ([301, 302, 307, 308, 400, 401, 403, 404, 409, 422, 429].includes(result.status)) {
      await env.BUCKET.delete(receiptKey);
      return json({error: 'GitHub refused the deletion (HTTP ' + result.status + '). Check the token’s Administration write permission and repository access.'}, 422);
    }
    return json({error: 'GitHub did not confirm the outcome (HTTP ' + result.status + '). Check the repository in GitHub.'}, 502);
  }

  receipt.status = 'deleted';
  try {
    await env.BUCKET.put(receiptKey, JSON.stringify(receipt), {customMetadata: receipt});
  } catch {
    return json({...receipt, receiptSaved: false});
  }
  return json(receipt);
}

async function githubDeletionState(request, env) {
  if (!isInventoryOwner(request)) return json({enabled: false, receipts: []});
  const receipts = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({prefix: deletionPrefix, include: ['customMetadata'], cursor});
    for (const object of page.objects) {
      if (object.customMetadata?.repositoryId) receipts.push(object.customMetadata);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({enabled: true, receipts});
}

export default{async fetch(req,env){try{const u=new URL(req.url),p=u.pathname;if(p.startsWith('/api/')&&req.method!=='GET'&&req.headers.get('Origin')!==u.origin)return json({error:'Invalid origin'},403);
if((p==='/api/import'||p==='/api/preview')&&req.method==='POST'){const b=await req.json();let result;try{result=await inspectProject(b)}catch(e){return json({error:e.message},400)}if(p==='/api/preview')return json(result);const list=await records(env);const key=repoKey(result.project.repo).toLowerCase();const i=list.findIndex(x=>repoKey(x.repo).toLowerCase()===key);const old=i>=0?list[i]:null;result.project={...result.project,id:old?.id||crypto.randomUUID(),name:result.project.name||old?.name,description:result.project.description||old?.description||'',url:result.project.url||old?.url||'',image:result.project.image||old?.image||''};if(i>=0)list[i]=result.project;else list.unshift(result.project);await env.BUCKET.put('projects.json',JSON.stringify(list),{httpMetadata:{contentType:'application/json'}});return json(result)}
if(p==='/admin'||p==='/admin/')return new Response(ADMIN_HTML,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
if(p==='/api/inventory/github-deletion'&&req.method==='GET')return await githubDeletionState(req,env);
if(p==='/api/inventory/github-deletion'&&req.method==='POST')return await deleteGitHubRepo(req,env);
if(p==='/api/inventory/dashboard-removal'&&req.method==='POST')return await removeDashboardRow(req,env);
if(p==='/api/inventory'&&req.method==='GET'){const stored=await env.BUCKET.get('inventory/snapshot.json');const inv=stored?await stored.json():structuredClone(INVENTORY);const decisions={},health={};const o=await env.BUCKET.get('inventory/decisions.json');if(o)Object.assign(decisions,await o.json());const keys=[...inv.projects.map(d=>d.projectId),...(inv.repoAudits||[]).filter(a=>a.homepage).map(a=>'repo:'+a.repo.toLowerCase())];await Promise.all(keys.map(async key=>{const h=await env.BUCKET.get('inventory/health/'+key+'.json');if(h)health[key]=await h.json()}));const canRemoveRows=canManageDashboard(req,env);const removedRows=canRemoveRows?await removedDashboardRows(env):[];return json({...inv,repositories:repositoriesWithPushDates(inv),decisions,health,canRemoveRows,removedRows})}
if(p==='/api/inventory'&&req.method==='POST'){const b=await req.json();if(!Array.isArray(b.repositories)||!Array.isArray(b.projects)||b.repositories.length>2000||b.projects.length>2000)return json({error:'Invalid inventory file'},400);delete b.decisions;delete b.health;await env.BUCKET.put('inventory/snapshot.json',JSON.stringify(b));return json({ok:true})}
if(p==='/api/inventory/decision'&&req.method==='POST'){const b=await req.json();if(typeof b.id!=='string'||b.id.length>250||!['','Keep','Review','Archive candidate'].includes(b.decision))return json({error:'Invalid review decision'},400);const o=await env.BUCKET.get('inventory/decisions.json'),all=o?await o.json():{};const images=b.images??all[b.id]?.images??[];
if(!Array.isArray(images)||images.length>30||images.some(url=>typeof url!=='string'||!/^\/media\/[a-f0-9-]{36}$/.test(url)))return json({error:'Invalid screenshot list (maximum 30 per review).'},400);
const notes=String(b.notes||'');
if(notes.length>30000)return json({error:'Notes can contain up to 30,000 characters.'},400);
all[b.id]={decision:b.decision,notes,family:String(b.family||'').slice(0,100),images:[...new Set(images)],finishNow:typeof b.finishNow==='boolean'?b.finishNow:all[b.id]?.finishNow===true,updatedAt:new Date().toISOString()};await env.BUCKET.put('inventory/decisions.json',JSON.stringify(all));return json({ok:true})}
if(p==='/api/inventory/check'&&req.method==='POST'){const b=await req.json(),stored=await env.BUCKET.get('inventory/snapshot.json'),inv=stored?await stored.json():INVENTORY,d=inv.projects.find(x=>x.projectId===b.projectId)||(String(b.projectId).startsWith('repo:')?(()=>{const a=(inv.repoAudits||[]).find(a=>'repo:'+a.repo.toLowerCase()===b.projectId);return a?{projectId:b.projectId,deploymentURL:a.homepage}:null})():null);if(!d)return json({error:'Project not found'},404);const url=d.domains?.[0]?'https://'+d.domains[0]:d.deploymentURL;let result={status:'unverified',label:'Not verified',url,checkedAt:new Date().toISOString()};if(url){try{const r=await getPublic(url);if(r.status===401||r.status===403){result.status='protected';result.label='Access restricted · '+r.status}else if(r.ok){result.status='responding';result.label='Responds · HTTP '+r.status;const reader=r.body?.getReader();if(reader){const part=await reader.read();await reader.cancel();const text=new TextDecoder().decode(part.value||new Uint8Array());if(/Authentication Required|Vercel Authentication|Log in to Vercel/i.test(text)){result.status='protected';result.label='Sign-in required'}}}else{result.status='http-error';result.label='HTTP '+r.status}}catch{result.label='Could not verify · timeout or network'}}else result.label='No URL found';const key='inventory/health/'+d.projectId+'.json';await env.BUCKET.put(key,JSON.stringify(result));return json(result)}
if(p==='/api/projects'&&req.method==='GET')return json(await records(env));
if(p==='/api/projects'&&req.method==='POST'){const b=await req.json();if(!b.name||typeof b.name!=='string'||b.name.length>100)return json({error:'A project name under 100 characters is required'},400);const list=await records(env);const id=typeof b.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(b.id)?b.id:crypto.randomUUID();const image=typeof b.image==='string'&&(b.image.startsWith('/media/')||cleanUrl(b.image))?b.image:'';const project={id,name:b.name.trim(),description:String(b.description||'').slice(0,500),repo:cleanUrl(b.repo),url:cleanUrl(b.url),category:['Website','Web app','Automation','Other'].includes(b.category)?b.category:'Other',status:['In progress','Live','Demo','Archived'].includes(b.status)?b.status:'In progress',featured:b.featured===true,image};const i=list.findIndex(x=>x.id===id);if(i<0)list.unshift(project);else list[i]=project;await env.BUCKET.put('projects.json',JSON.stringify(list),{httpMetadata:{contentType:'application/json'}});return json(project)}
if(p.startsWith('/api/projects/')&&req.method==='DELETE'){const list=await records(env);await env.BUCKET.put('projects.json',JSON.stringify(list.filter(x=>x.id!==p.split('/').pop())));return json({ok:true})}
if(p==='/api/upload'&&req.method==='POST'){const type=req.headers.get('Content-Type');if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type))return json({error:'Unsupported image format'},400);const data=await req.arrayBuffer();if(data.byteLength>8388608)return json({error:'Image must be under 8 MB'},400);const id=crypto.randomUUID();await env.BUCKET.put('images/'+id,data,{httpMetadata:{contentType:type}});return json({url:'/media/'+id})}
if(p.startsWith('/media/')&&req.method==='GET'){const id=p.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return new Response('Not found',{status:404});const o=await env.BUCKET.get('images/'+id);if(!o)return new Response('Not found',{status:404});return new Response(o.body,{headers:{'Content-Type':o.httpMetadata.contentType,'Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}})}
if(p==='/api/github'&&req.method==='GET'){
let input=(u.searchParams.get('user')||'').trim().replace(/\/+$/,'');
if(/^(https?:\/\/|www\.|github\.com\/)/i.test(input)){try{const parsed=new URL(/^https?:\/\//i.test(input)?input:'https://'+input);if(!['github.com','www.github.com'].includes(parsed.hostname.toLowerCase()))throw Error();input=parsed.pathname.replace(/^\/|\/$/g,'')}catch{return json({error:'Use a github.com repository link or username'},400)}}
const parts=input.split('/');const user=parts[0],repo=parts[1]?.replace(/\.git$/i,'');if(parts.length>2||!/^[A-Za-z0-9-]{1,39}$/.test(user)||parts.length===2&&!/^[A-Za-z0-9_.-]{1,100}$/.test(repo||''))return json({error:'Enter a GitHub URL, owner/repo, or username'},400);
const headers={'User-Agent':'Palawan-Collective-Projects','Accept':'application/vnd.github+json'};
const pick=({name,full_name,description,html_url,homepage,archived})=>({name,full_name,description,html_url,homepage,archived});
if(repo){const r=await fetch('https://api.github.com/repos/'+user+'/'+repo,{headers});if(r.status===404)return json([{name:repo,full_name:user+'/'+repo,html_url:'https://github.com/'+user+'/'+repo,description:'',homepage:'',archived:false,reference_only:true}]);if(!r.ok)return json({error:'GitHub could not respond. Try again later.'},502);return json([pick(await r.json())])}
let all=[];for(let page=1;page<=10;page++){const r=await fetch('https://api.github.com/users/'+user+'/repos?per_page=100&sort=updated&page='+page,{headers});if(!r.ok)return json({error:r.status===404?'GitHub account not found.':'GitHub could not respond. Try again later.'},r.status===404?404:502);const batch=await r.json();all.push(...batch.map(pick));if(batch.length<100)break}return json(all)}
if(p.startsWith('/api/'))return json({error:'Not found'},404);return new Response(HTML,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}})}catch(err){console.error(err);return json({error:'Could not save or load data. Please try again.'},500)}}};
