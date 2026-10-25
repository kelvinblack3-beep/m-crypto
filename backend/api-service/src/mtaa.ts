import { Hono } from 'hono'
import { neon } from '@neondatabase/serverless'
import { z } from 'zod'
import type { HonoEnv } from './env'
import { authMiddleware } from './middleware/auth'
import { safeMode, quoteCurve } from './mtaa-domain'

const positive = z.number().int().positive().max(10000000)
const schemas = {
  setup: z.object({ username: z.string().regex(/^[a-z][a-z0-9-]{2,23}$/), terms: z.literal(true) }),
  'contact-check': z.object({ code: z.literal('MTAA-TEST') }),
  deposit: z.object({ amount: positive }),
  'deposit-confirm': z.object({ depositID: z.string().uuid(), outcome: z.enum(['confirmed','failed']) }),
  transfer: z.object({ recipient: z.string().min(3).max(24), amount: positive.max(5000000) }),
  'create-token': z.object({ name: z.string().trim().min(2).max(40), ticker: z.string().regex(/^[A-Z]{2,8}$/), description: z.string().trim().min(10).max(500), supply: z.number().int().min(100).max(1000000), riskAccepted: z.literal(true) }),
  trade: z.object({ tokenID: z.string().uuid(), side: z.enum(['buy','sell']), quantity: positive.max(10000), limit: z.number().int().min(0).max(1000000000000) }),
  post: z.object({ body: z.string().trim().min(1).max(1000), parentID: z.string().uuid().optional() }),
  like: z.object({ target: z.string().uuid() }), block: z.object({ target: z.string().min(1).max(128) }),
  report: z.object({ target: z.string().min(1).max(128), reason: z.string().trim().min(3).max(300) }),
  'delete-post': z.object({ target: z.string().uuid() }),
  moderate: z.object({ target: z.string().uuid(), reason: z.string().trim().min(3).max(300) }),
  reverse: z.object({ reference: z.string().min(10).max(40), reason: z.string().trim().min(3).max(300) }),
} as const

export const mtaaRoutes = new Hono<HonoEnv>()
mtaaRoutes.use('*', async (c,next) => {
  try { safeMode(c.env) } catch { return c.json({ error: 'Unsafe financial configuration rejected' },503) }
  await next()
})
mtaaRoutes.get('/health', async c => {
  const sql=neon(c.env.DATABASE_URL)
  await sql`SELECT 1 FROM api.mtaa_accounts LIMIT 1`
  return c.json({ status:'ok', mode:'test-only', payments:'local-simulation', blockchain:'devnet-adapter-disabled', mainnet:false })
})
mtaaRoutes.post('/payments/callback', c=>c.json({error:'Daraja callback adapter is disabled. No credit posted.'},503))
mtaaRoutes.use('*',authMiddleware)
mtaaRoutes.use('*',async(c,next)=>{
  const sql=neon(c.env.DATABASE_URL)
  const users=await sql`SELECT id FROM auth."user" WHERE id=${c.get('userId')}`
  if(!users.length) return c.json({error:'Sign in again'},401)
  c.header('Cache-Control','no-store')
  await next()
})
mtaaRoutes.get('/snapshot',async c=>{
 const sql=neon(c.env.DATABASE_URL); const id=c.get('userId')
 const [profiles,balances,activity,tokens,holdings,posts,deposits]=await Promise.all([
  sql`SELECT id,username,role,contact_checked,terms FROM api.mtaa_profiles WHERE id=${id}`,
  sql`SELECT balance::text FROM api.mtaa_accounts WHERE id=${id}`,
  sql`SELECT j.*,s.username AS sender_name,r.username AS recipient_name FROM api.mtaa_journals j LEFT JOIN api.mtaa_profiles s ON s.id=j.sender LEFT JOIN api.mtaa_profiles r ON r.id=j.recipient WHERE sender=${id} OR recipient=${id} ORDER BY created_at DESC LIMIT 50`,
  sql`SELECT t.*,p.username AS creator_name FROM api.mtaa_tokens t JOIN api.mtaa_profiles p ON p.id=t.creator ORDER BY created_at DESC LIMIT 50`,
  sql`SELECT h.*,t.name,t.ticker,t.sold FROM api.mtaa_holdings h JOIN api.mtaa_tokens t ON t.id=h.token_id WHERE h.owner=${id}`,
  sql`SELECT p.*,u.username,(SELECT count(*)::int FROM api.mtaa_reactions r WHERE r.target=p.id AND r.kind='like') AS likes,EXISTS(SELECT 1 FROM api.mtaa_reactions r WHERE r.target=p.id AND r.owner=${id} AND r.kind='like') AS liked FROM api.mtaa_posts p JOIN api.mtaa_profiles u ON u.id=p.author WHERE NOT p.hidden AND NOT u.banned AND NOT EXISTS(SELECT 1 FROM api.mtaa_reactions b WHERE b.owner=${id} AND b.kind='block' AND b.target=p.author) ORDER BY p.created_at DESC LIMIT 50`,
  sql`SELECT * FROM api.mtaa_deposits WHERE owner=${id} ORDER BY created_at DESC LIMIT 30`,
 ])
 return c.json({ profile:profiles[0]??null,balance:Number(balances[0]?.balance??0),activity,tokens,holdings,posts,deposits,mode:'test-only' })
})
mtaaRoutes.post('/command/:action',async c=>{
 const action=c.req.param('action'); const schema=schemas[action as keyof typeof schemas]
 if(!schema) return c.json({error:'Unsupported operation'},404)
 const key=c.req.header('Idempotency-Key')??''
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(key)) return c.json({error:'A valid request key is required'},400)
 const parsed=schema.safeParse(await c.req.json().catch(()=>null))
 if(!parsed.success) return c.json({error:parsed.error.issues[0]?.message??'Check your input'},400)
 try{
  const sql=neon(c.env.DATABASE_URL)
  const rows=await sql`SELECT api.mtaa_command(${c.get('userId')},${action},${JSON.stringify(parsed.data)}::jsonb,${key}) AS result`
  return c.json(rows[0]?.result)
 }catch(error){
  const message=error instanceof Error?error.message:''
  if(message.includes('duplicate key')) return c.json({error:'That username, ticker or reversal already exists'},409)
  const permitted=/^(Invalid|Use |Accept |Complete |Test |Daily |Send |Recipient|Insufficient|Request key|Quote changed|Not enough|Token not|Deposit|Too many|Account restricted|Check token|Enter |Add a reason|Post not|Discussion not|A moderation|A reversal|This entry|Wallet not|Unsupported)/
  if(permitted.test(message)) return c.json({error:message},409)
  if(message==='Not authorized') return c.json({error:'Not authorized'},403)
  console.error('mtaa.command.failed',action)
  return c.json({error:'Operation could not be completed. No partial balance change was saved.'},500)
 }
})
mtaaRoutes.get('/quote',async c=>{
 const parsed=z.object({tokenID:z.string().uuid(),side:z.enum(['buy','sell']),quantity:z.coerce.number().int().min(1).max(10000)}).safeParse(c.req.query())
 if(!parsed.success) return c.json({error:'Choose a token, side and whole quantity'},400)
 const sql=neon(c.env.DATABASE_URL); const q=parsed.data
 const rows=await sql`SELECT sold,supply FROM api.mtaa_tokens WHERE id=${q.tokenID}`
 if(!rows.length) return c.json({error:'Token not found'},404)
 try {return c.json({...quoteCurve(Number(rows[0]?.sold),Number(rows[0]?.supply),q.quantity,q.side),source:'deterministic-simulation',quotedAt:new Date().toISOString()})}
 catch {return c.json({error:'Quantity exceeds available simulated supply'},400)}
})
mtaaRoutes.get('/token/:id',async c=>{
 const sql=neon(c.env.DATABASE_URL)
 const rows=await sql`SELECT side,quantity,amount,created_at FROM api.mtaa_trades WHERE token_id=${c.req.param('id')} ORDER BY created_at DESC LIMIT 50`
 return c.json({trades:rows,recordType:'simulated_trade'})
})
mtaaRoutes.get('/admin',async c=>{
 const sql=neon(c.env.DATABASE_URL)
 const role=await sql`SELECT role FROM api.mtaa_profiles WHERE id=${c.get('userId')}`
 if(!['admin','moderator'].includes(String(role[0]?.role))) return c.json({error:'Not authorized'},403)
 const reports=await sql`SELECT * FROM api.mtaa_reports ORDER BY created_at DESC LIMIT 100`
 if(role[0]?.role!=='admin') return c.json({reports})
 const [audit,deposits,unbalanced,projection]=await Promise.all([
 sql`SELECT * FROM api.mtaa_audit ORDER BY created_at DESC LIMIT 100`,sql`SELECT * FROM api.mtaa_deposits ORDER BY created_at DESC LIMIT 100`,
 sql`SELECT j.id FROM api.mtaa_journals j LEFT JOIN api.mtaa_lines l ON l.journal_id=j.id GROUP BY j.id HAVING coalesce(sum(l.delta),0)<>0 OR count(l.id)<>2`,
 sql`SELECT a.id FROM api.mtaa_accounts a LEFT JOIN api.mtaa_lines l ON l.account_id=a.id GROUP BY a.id HAVING a.balance<>coalesce(sum(l.delta),0)`])
 return c.json({reports,audit,deposits,reconciliation:{balanced:unbalanced.length===0,projectionConsistent:projection.length===0},futureControls:['Independent legal review','Identity verification','Sanctions screening','Transaction monitoring']})
})
mtaaRoutes.post('/solana/mint',c=>c.json({error:'External wallet signing and devnet mint submission are not implemented. No mint was created.'},501))
