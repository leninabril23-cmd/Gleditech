import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import crypto from 'node:crypto';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {Pool}=pg;
const app=express();
const dir=path.dirname(fileURLToPath(import.meta.url));
const databaseUrl=String(process.env.DATABASE_URL||'').trim();
if(!databaseUrl){
 console.error('CONFIGURACIÓN INCOMPLETA: falta DATABASE_URL. En Render, vincula una base PostgreSQL al servicio web y configura DATABASE_URL con su Internal Database URL.');
 process.exit(1);
}
let databaseHost='';
try{databaseHost=new URL(databaseUrl).hostname;}catch{
 console.error('CONFIGURACIÓN INVÁLIDA: DATABASE_URL no tiene un formato PostgreSQL válido.');
 process.exit(1);
}
if(['localhost','127.0.0.1','::1'].includes(databaseHost)){
 console.error('CONFIGURACIÓN INVÁLIDA: DATABASE_URL apunta a localhost. Render necesita la Internal Database URL de tu servicio PostgreSQL, no 127.0.0.1.');
 process.exit(1);
}
const pool=new Pool({
 connectionString:databaseUrl,
 ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined,
 connectionTimeoutMillis:10000,
 idleTimeoutMillis:30000,
 max:10
});
const uuid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const isProduction=process.env.NODE_ENV==='production';
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:'5mb'}));
app.use(cookieParser());
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024}});
const query=(sql,values=[])=>pool.query(sql,values);
const fault=(res,status,detail)=>res.status(status).json({detail});
const safe=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
function publicUser(u){return {id:u.id,username:u.username,name:u.name,email:u.email||'',role:u.role,active:u.active,must_change:u.must_change};}
async function audit(req,action,entity,details=''){try{await query('INSERT INTO audit(username,action,entity,details,ip) VALUES($1,$2,$3,$4,$5)',[req.user?.username||'sistema',action,entity,String(details).slice(0,600),req.ip]);}catch(e){console.error('audit',e.message)}}
async function init(){
 await query(`CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL,email text,role text NOT NULL CHECK(role IN ('admin','technician')),password_hash text NOT NULL,active boolean NOT NULL DEFAULT true,must_change boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash text UNIQUE NOT NULL,csrf text NOT NULL,created_at timestamptz DEFAULT now(),last_used timestamptz DEFAULT now(),expires_at timestamptz NOT NULL);
 CREATE TABLE IF NOT EXISTS records(entity text NOT NULL,id uuid NOT NULL,data jsonb NOT NULL,PRIMARY KEY(entity,id));
 CREATE TABLE IF NOT EXISTS audit(id bigserial PRIMARY KEY,created_at timestamptz DEFAULT now(),username text,action text,entity text,details text,ip text);
 CREATE TABLE IF NOT EXISTS blobs(id uuid PRIMARY KEY,content bytea NOT NULL,mime text NOT NULL,name text NOT NULL);
 CREATE TABLE IF NOT EXISTS password_resets(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);`);
 const r=await query('SELECT COUNT(*)::int AS n FROM users');
 if(r.rows[0].n===0){const name=process.env.ADMIN_USER||'admin',password=process.env.ADMIN_PASSWORD;
  if(!password||password.length<12)throw new Error('Define ADMIN_PASSWORD de al menos 12 caracteres antes de iniciar.');
  await query('INSERT INTO users(id,username,name,role,password_hash,active,must_change) VALUES($1,$2,$3,$4,$5,true,true)',[uuid(),name,process.env.ADMIN_NAME||'Administrador','admin',await bcrypt.hash(password,12)]);
  console.log('Cuenta administradora inicial creada. Cambio de contraseña requerido.');
 }
 const cfg=await query("SELECT 1 FROM records WHERE entity='company' LIMIT 1");
 if(!cfg.rowCount){let company={name:'GLEDITECH',ruc:'',address:'',phone:'',email:'',city:'Quito',terms:''};await putRecord('company',uuid(),company);}
}
async function getRecords(entity){const r=await query('SELECT data FROM records WHERE entity=$1',[entity]);return r.rows.map(x=>x.data)}
async function getRecord(entity,id){const r=await query('SELECT data FROM records WHERE entity=$1 AND id=$2',[entity,id]);return r.rows[0]?.data}
async function putRecord(entity,id,obj){await query('INSERT INTO records(entity,id,data) VALUES($1,$2,$3) ON CONFLICT(entity,id) DO UPDATE SET data=EXCLUDED.data',[entity,id,JSON.stringify(obj)]);return obj}
async function deleteRecord(entity,id){await query('DELETE FROM records WHERE entity=$1 AND id=$2',[entity,id])}
const r2=n=>(Math.round((Number(n)||0)*100)/100).toFixed(2);
function calcDocument(data={}){const totals={subtotal:0,discount:0,net:0,tax:0,total:0,cost:0,profit:0,margin:0};const items=(data.items||[]).map(x=>{const sub=+(+x.quantity*+x.price).toFixed(2),dis=+(sub*(+data.discount||0)/100).toFixed(2),net=+(sub-dis).toFixed(2),tax=+(net*(+x.vat||0)/100).toFixed(2),cost=+(+x.quantity*(+x.cost||0)).toFixed(2);Object.assign(totals,{subtotal:totals.subtotal+sub,discount:totals.discount+dis,net:totals.net+net,tax:totals.tax+tax,total:totals.total+net+tax,cost:totals.cost+cost,profit:totals.profit+net-cost});return {...x,subtotal:r2(sub),net:r2(net),tax:r2(tax),total:r2(net+tax),cost:r2(cost)}});totals.margin=totals.net?(totals.profit/totals.net*100):0;return {items,totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,r2(v)]))}}
async function report(start='',end=''){const all=await getRecords('documents'),documents=all.filter(d=>(!start||d.date>=start)&&(!end||d.date<=end));const quotes=documents.filter(d=>d.kind==='quote'&&['Emitida','Enviada','Aceptada'].includes(d.status)),accepted=quotes.filter(d=>d.status==='Aceptada'),projects=await getRecords('projects');const sum=(list,k)=>r2(list.reduce((n,d)=>n+ +(d.totals?.[k]||0),0)),monthly={},statuses={},categories={};for(const d of documents){const month=(d.date||now()).slice(0,7);monthly[month]??={month,estimated:0,accepted:0,cost:0};if(quotes.includes(d)){monthly[month].estimated+= +(d.totals?.net||0);monthly[month].cost+= +(d.totals?.cost||0);for(const i of d.data?.items||[])categories[i.category||'Otros']=(categories[i.category||'Otros']||0)+ +(i.net||0)}if(accepted.includes(d))monthly[month].accepted+= +(d.totals?.net||0);statuses[d.status]=(statuses[d.status]||0)+1;}return {start,end,estimated:sum(quotes,'net'),accepted:sum(accepted,'net'),cost:sum(quotes,'cost'),profit:sum(quotes,'profit'),quotes:documents.filter(d=>d.kind==='quote').length,budgets:documents.filter(d=>d.kind==='budget').length,issued:quotes.length,monthly:Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month)),statuses,categories,projects:projects.map(p=>({id:p.id,name:p.name,status:p.status,estimated:'0.00',accepted:'0.00',cost:'0.00',profit:'0.00'}))}}
function auth(req,res,next){const token=req.cookies.gleditech_session;if(!token)return fault(res,401,'Debes iniciar sesión.');safe(async()=>{const r=await query('SELECT s.*,u.* ,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true',[sha(token)]);if(!r.rowCount)return fault(res,401,'Sesión no válida o expirada.');req.user=r.rows[0];req.sessionId=r.rows[0].session_id;req.csrf=r.rows[0].csrf;await query('UPDATE sessions SET last_used=now() WHERE id=$1',[req.sessionId]);next() })(req,res,next)}
function csrf(req,res,next){if(['GET','HEAD','OPTIONS'].includes(req.method))return next();if(req.headers['x-csrf-token']!==req.csrf)return fault(res,403,'Token de seguridad incorrecto.');next()}
function admin(req,res,next){if(req.user.role!=='admin')return fault(res,403,'Acceso exclusivo del administrador.');next()}
function writable(req,res,next){if(req.user.must_change)return fault(res,403,'Debes cambiar tu contraseña inicial.');next()}
function passwordOk(p){return typeof p==='string'&&p.length>=12&&p.length<=128}
function issueCookie(res,token){res.cookie('gleditech_session',token,{httpOnly:true,secure:isProduction,sameSite:'lax',maxAge:7*86400000,path:'/'})}
app.get('/health',safe(async(req,res)=>{await query('SELECT 1');res.json({ok:true})}));
app.post('/api/auth/login',safe(async(req,res)=>{const username=String(req.body.username||'').trim(),password=String(req.body.password||'');const r=await query('SELECT * FROM users WHERE lower(username)=lower($1)',[username]);const u=r.rows[0];if(!u||!u.active||!(await bcrypt.compare(password,u.password_hash)))return fault(res,401,'Usuario o contraseña incorrectos.');const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(32).toString('hex');await query("INSERT INTO sessions(id,user_id,token_hash,csrf,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",[uuid(),u.id,sha(token),csrf]);issueCookie(res,token);req.user=u;await audit(req,'login','auth');res.json({user:publicUser(u),csrf})}));
app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser(req.user),csrf:req.csrf}));
app.post('/api/auth/logout',auth,csrf,safe(async(req,res)=>{await query('DELETE FROM sessions WHERE id=$1',[req.sessionId]);res.clearCookie('gleditech_session',{path:'/'});await audit(req,'logout','auth');res.json({ok:true})}));
app.get('/api/auth/sessions',auth,safe(async(req,res)=>{const r=await query('SELECT id,created_at,last_used FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY last_used DESC',[req.user.id]);res.json(r.rows.map(s=>({...s,current:s.id===req.sessionId})))}));
app.delete('/api/auth/sessions',auth,csrf,safe(async(req,res)=>{await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2',[req.user.id,req.sessionId]);res.json({ok:true})}));
app.post('/api/auth/password',auth,csrf,safe(async(req,res)=>{const b=req.body;if(!passwordOk(b.new_password))return fault(res,400,'La contraseña requiere al menos 12 caracteres.');if(b.confirm_password&&b.confirm_password!==b.new_password)return fault(res,400,'Las contraseñas no coinciden.');if(!(await bcrypt.compare(String(b.current_password||''),req.user.password_hash)))return fault(res,400,'Contraseña actual incorrecta.');await query('UPDATE users SET password_hash=$1,must_change=false WHERE id=$2',[await bcrypt.hash(b.new_password,12),req.user.id]);await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2',[req.user.id,req.sessionId]);await audit(req,'change_password','users');res.json({ok:true,user:{...publicUser(req.user),must_change:false}})}));
app.post('/api/auth/forgot',(req,res)=>res.json({message:'La recuperación automática por correo no está configurada. Solicita al administrador que te asigne una contraseña temporal.'}));
app.post('/api/auth/reset',(req,res)=>fault(res,400,'La recuperación por correo no está configurada. Contacta a tu administrador.'));
app.use('/api',auth,csrf,writable);
app.get('/api/users',admin,safe(async(req,res)=>{const r=await query('SELECT id,username,name,email,role,active,must_change,created_at FROM users ORDER BY created_at');res.json(r.rows)}));
app.post('/api/users',admin,safe(async(req,res)=>{const b=req.body;if(!/^[\w.\-]{3,80}$/.test(b.username||''))return fault(res,400,'Usuario inválido.');if(!passwordOk(b.password))return fault(res,400,'Contraseña de al menos 12 caracteres requerida.');if(!['admin','technician'].includes(b.role))return fault(res,400,'Rol inválido.');const id=uuid();try{await query('INSERT INTO users(id,username,name,email,role,password_hash,active,must_change) VALUES($1,$2,$3,$4,$5,$6,$7,true)',[id,b.username,b.name||b.username,b.email||null,b.role,await bcrypt.hash(b.password,12),b.active!==false]);}catch(e){if(e.code==='23505')return fault(res,409,'Ese usuario ya existe.');throw e}await audit(req,'create','users',b.username);res.status(201).json({id,username:b.username})}));
app.put('/api/users/:id',admin,safe(async(req,res)=>{const {id}=req.params,b=req.body;const u=await query('SELECT * FROM users WHERE id=$1',[id]);if(!u.rowCount)return fault(res,404,'Usuario no encontrado.');if(!['admin','technician'].includes(b.role))return fault(res,400,'Rol inválido.');if(id===req.user.id&&(b.role!=='admin'||b.active===false))return fault(res,400,'No puedes quitarte el acceso de administrador.');if(b.password&&!passwordOk(b.password))return fault(res,400,'La contraseña debe tener al menos 12 caracteres.');const active=b.active===true||b.active==='true';await query('UPDATE users SET name=$1,email=$2,role=$3,active=$4,password_hash=COALESCE($5,password_hash),must_change=CASE WHEN $5 IS NULL THEN must_change ELSE true END WHERE id=$6',[b.name,b.email||null,b.role,active,b.password?await bcrypt.hash(b.password,12):null,id]);if(!active||b.password)await query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2',[id,req.sessionId]);await audit(req,'update','users',u.rows[0].username);res.json({ok:true})}));
app.get('/api/company',safe(async(req,res)=>res.json((await getRecords('company'))[0]||{})));
app.put('/api/company',admin,safe(async(req,res)=>{const old=(await getRecords('company'))[0]||{};const value={...old,...req.body};await putRecord('company',old.id||uuid(),value);await audit(req,'update','company');res.json(value)}));
app.get('/api/system',admin,safe(async(req,res)=>res.json({database:'PostgreSQL',storage:'PostgreSQL persistente',smtp:false,production:isProduction,backup_hours:0,backup_keep:0,backups:[]})));
app.get('/api/audit',admin,safe(async(req,res)=>{const offset=Math.max(0,Number(req.query.offset)||0),q=String(req.query.q||'');const r=await query('SELECT * FROM audit WHERE username ILIKE $1 OR action ILIKE $1 OR entity ILIKE $1 OR details ILIKE $1 ORDER BY id DESC LIMIT 100 OFFSET $2',['%'+q+'%',offset]);res.json(r.rows)}));
app.get('/api/notifications',safe(async(req,res)=>res.json([])));
app.post('/api/notifications/read',(req,res)=>res.json({ok:true}));
app.get('/api/dashboard',safe(async(req,res)=>{const r=await report();const clients=await getRecords('clients'),projects=await getRecords('projects');res.json({quote_count:r.issued,budget_count:r.budgets,client_count:clients.length,estimated:r.estimated,accepted:r.accepted,active_projects:projects.filter(p=>p.status==='En ejecución').length,completed_projects:projects.filter(p=>p.status==='Finalizado').slice(0,3),projects:projects.slice(0,6),monthly:r.monthly,quotes:(await getRecords('documents')).filter(d=>d.kind==='quote').slice(0,6),recent_documents:(await getRecords('documents')).slice(0,6)})}));
app.get('/api/reports',admin,safe(async(req,res)=>res.json(await report(String(req.query.start||''),String(req.query.end||'')))));
app.get('/api/search',safe(async(req,res)=>{const q=String(req.query.q||'').toLowerCase();if(!q)return res.json([]);const entries=await Promise.all(['clients','projects','prices','documents'].map(getRecords));res.json(entries.flatMap((xs,i)=>xs.filter(x=>String(x.name||x.description||x.title||'').toLowerCase().includes(q)).slice(0,6).map(x=>({id:x.id,title:x.name||x.description||x.title,type:['clients','projects','prices','documents'][i],label:['Cliente','Proyecto','Precio','Documento'][i]}))))}));
for(const entity of ['clients','projects','prices','expenses']){
 app.get('/api/'+entity,safe(async(req,res)=>{let xs=await getRecords(entity);if(req.query.project_id)xs=xs.filter(x=>x.project_id===req.query.project_id);res.json(xs)}));
 app.get('/api/'+entity+'/:id',safe(async(req,res)=>{const x=await getRecord(entity,req.params.id);if(!x)return fault(res,404,'Registro no encontrado.');const r={...x};if(entity==='clients')r.projects=(await getRecords('projects')).filter(p=>p.client_id===x.id);if(entity==='projects')r.documents=(await getRecords('documents')).filter(d=>d.project_id===x.id);res.json(r)}));
 app.get('/api/'+entity+'/:id/history',(req,res)=>res.json([]));
 app.post('/api/'+entity,safe(async(req,res)=>{if(entity==='prices'&&req.user.role!=='admin')return fault(res,403,'Solo administrador.');const b=req.body,id=uuid();const r={...b,id,version:1,created_at:now(),updated_at:now(),demo:false};if(entity==='projects')r.code=r.code||'PRY-'+new Date().getFullYear()+'-'+id.slice(0,6).toUpperCase();if(entity==='prices'){r.total=r2(+(b.quantity||1)*+(b.price||0)*(1+(+b.vat||0)/100));}await putRecord(entity,id,r);await audit(req,'create',entity,id);res.status(201).json(r)}));
 app.put('/api/'+entity+'/:id',safe(async(req,res)=>{if(entity==='prices'&&req.user.role!=='admin')return fault(res,403,'Solo administrador.');const x=await getRecord(entity,req.params.id);if(!x)return fault(res,404,'Registro no encontrado.');const r={...x,...req.body,id:x.id,version:(x.version||0)+1,updated_at:now()};await putRecord(entity,x.id,r);await audit(req,'update',entity,x.id);res.json(r)}));
 app.delete('/api/'+entity+'/:id',safe(async(req,res)=>{if(entity==='prices'&&req.user.role!=='admin')return fault(res,403,'Solo administrador.');const x=await getRecord(entity,req.params.id);if(!x)return fault(res,404,'Registro no encontrado.');if(entity==='clients'&&((await getRecords('projects')).some(p=>p.client_id===x.id)||(await getRecords('documents')).some(d=>d.client_id===x.id)))return fault(res,409,'El cliente tiene registros asociados.');if(entity==='projects'&&(await getRecords('documents')).some(d=>d.project_id===x.id))return fault(res,409,'El proyecto tiene documentos asociados.');await deleteRecord(entity,x.id);await audit(req,'delete',entity,x.id);res.json({ok:true})}));
}
app.get('/api/documents',safe(async(req,res)=>{let rows=await getRecords('documents');if(req.query.kind)rows=rows.filter(d=>d.kind===req.query.kind);res.json(rows)}));
app.get('/api/documents/:id',safe(async(req,res)=>{const x=await getRecord('documents',req.params.id);return x?res.json(x):fault(res,404,'Documento no encontrado.')}));
async function saveDoc(req,res,old){if(old&&old.status!=='Borrador')return fault(res,409,'Los documentos emitidos no pueden modificarse.');const b=req.body,id=old?.id||uuid(),kind=old?.kind||b.kind||'budget',c=calcDocument(b.data||{}),clients=await getRecords('clients'),projects=await getRecords('projects');const r={...old,...b,id,kind,code:old?.code||((kind==='quote'?'PRO':'PRE')+'-'+new Date().getFullYear()+'-'+id.slice(0,6).toUpperCase()),date:b.date||now().slice(0,10),status:'Borrador',version:(old?.version||0)+1,created_by:old?.created_by||req.user.id,created_at:old?.created_at||now(),updated_at:now(),demo:false,client_name:clients.find(x=>x.id===b.client_id)?.name||'',project_name:projects.find(x=>x.id===b.project_id)?.name||'',data:{...(b.data||{}),items:c.items},totals:c.totals};await putRecord('documents',id,r);await audit(req,old?'update':'create','documents',id);res.json(r)}
app.post('/api/documents',safe((req,res)=>saveDoc(req,res)));
app.put('/api/documents/:id',safe(async(req,res)=>{const old=await getRecord('documents',req.params.id);if(!old)return fault(res,404,'Documento no encontrado.');return saveDoc(req,res,old)}));
app.delete('/api/documents/:id',safe(async(req,res)=>{const old=await getRecord('documents',req.params.id);if(!old)return fault(res,404,'Documento no encontrado.');if(old.status!=='Borrador')return fault(res,409,'No se puede eliminar un documento emitido.');await deleteRecord('documents',old.id);await audit(req,'delete','documents',old.id);res.json({ok:true})}));
app.post('/api/documents/:id/duplicate',safe(async(req,res)=>{const old=await getRecord('documents',req.params.id);if(!old)return fault(res,404,'Documento no encontrado.');req.body={...old,kind:old.kind,title:old.title+' · copia',data:old.data};await saveDoc(req,res)}));
app.post('/api/documents/:id/convert',safe(async(req,res)=>{const old=await getRecord('documents',req.params.id);if(!old)return fault(res,404,'Documento no encontrado.');req.body={...old,kind:'quote',source_id:old.id};await saveDoc(req,res)}));
app.post('/api/documents/:id/status',safe(async(req,res)=>{const x=await getRecord('documents',req.params.id);if(!x)return fault(res,404,'Documento no encontrado.');if(!['Borrador','Emitida','Enviada','Aceptada','Rechazada','Anulada'].includes(req.body.status))return fault(res,400,'Estado inválido.');x.status=req.body.status;x.updated_at=now();await putRecord('documents',x.id,x);await audit(req,'status','documents',x.status);res.json(x)}));
app.get('/api/files',safe(async(req,res)=>{let xs=await getRecords('files');if(req.query.purpose)xs=xs.filter(x=>x.purpose===req.query.purpose);if(req.query.project_id)xs=xs.filter(x=>x.project_id===req.query.project_id);res.json(xs)}));
app.post('/api/files',upload.single('file'),safe(async(req,res)=>{if(!req.file)return fault(res,400,'Selecciona un archivo.');const id=uuid(),b=req.body;await query('INSERT INTO blobs(id,content,mime,name) VALUES($1,$2,$3,$4)',[id,req.file.buffer,req.file.mimetype,req.file.originalname]);const record={id,name:req.file.originalname,mime:req.file.mimetype,size:req.file.size,purpose:b.purpose||'document',project_id:b.project_id||null,stage:b.stage||'',caption:b.caption||'',created_at:now(),uploaded_by:req.user.username};await putRecord('files',id,record);await audit(req,'upload','files',id);res.status(201).json(record)}));
app.get('/api/files/:id/content',safe(async(req,res)=>{const r=await query('SELECT * FROM blobs WHERE id=$1',[req.params.id]);if(!r.rowCount)return fault(res,404,'Archivo no encontrado.');res.set('Content-Type',r.rows[0].mime);res.set('X-Content-Type-Options','nosniff');res.set('Content-Disposition',`attachment; filename="${r.rows[0].name.replace(/["\\\r\n]/g,'_')}"`);res.send(r.rows[0].content)}));
app.delete('/api/files/:id',safe(async(req,res)=>{await deleteRecord('files',req.params.id);await query('DELETE FROM blobs WHERE id=$1',[req.params.id]);await audit(req,'delete','files',req.params.id);res.json({ok:true})}));
app.post('/api/apu/calculate',(req,res)=>fault(res,501,'Cálculo APU avanzado pendiente de integrar.'));
app.post('/api/prices/bulk',admin,(req,res)=>fault(res,501,'Importación masiva pendiente de integrar.'));
app.post('/api/prices/import',admin,(req,res)=>fault(res,501,'Importación Excel pendiente de integrar.'));
app.post('/api/import/legacy',admin,(req,res)=>fault(res,501,'Importación antigua pendiente de integrar.'));
app.post('/api/backups',admin,(req,res)=>fault(res,501,'Respaldo ZIP pendiente de integrar; utiliza copias de PostgreSQL de Render.'));
app.delete('/api/demo',admin,(req,res)=>fault(res,501,'El proyecto no carga registros de demostración.'));
app.use('/api',(req,res)=>fault(res,501,'Esta función requiere integración adicional del servidor.'));
app.use(express.static(path.join(dir,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(dir,'public','index.html')));
app.use((err,req,res,next)=>{console.error(err);if(err instanceof multer.MulterError)return fault(res,400,err.message);if(err.code==='22P02')return fault(res,400,'Identificador inválido.');if(err.code==='23505')return fault(res,409,'Ya existe un registro con ese valor.');return fault(res,500,'Error del servidor. Revisa los registros de Render.');});
const port=Number(process.env.PORT||3000);
init().then(()=>app.listen(port,'0.0.0.0',()=>console.log('GLEDITECH escuchando en '+port))).catch(e=>{console.error('Error de inicio:',e);process.exit(1)});
