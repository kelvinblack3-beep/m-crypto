ALTER TABLE api.mtaa_profiles ADD CONSTRAINT profile_role CHECK(role IN ('user','moderator','admin'));
ALTER TABLE api.mtaa_accounts ADD CONSTRAINT nonnegative_wallet CHECK(id LIKE 'system:%' OR balance >= 0);
ALTER TABLE api.mtaa_journals ADD CONSTRAINT positive_journal CHECK(amount > 0 AND amount <= 1000000000000);
ALTER TABLE api.mtaa_lines ADD CONSTRAINT nonzero_line CHECK(delta <> 0);
ALTER TABLE api.mtaa_deposits ADD CONSTRAINT deposit_state CHECK(status IN ('pending','confirmed','failed','expired','reversed'));
ALTER TABLE api.mtaa_deposits ADD CONSTRAINT local_only CHECK(mode = 'local');
ALTER TABLE api.mtaa_tokens ADD CONSTRAINT token_supply CHECK(supply BETWEEN 100 AND 1000000 AND sold BETWEEN 0 AND supply AND reserve >= 0);
ALTER TABLE api.mtaa_holdings ADD CONSTRAINT holding_positive CHECK(quantity >= 0 AND cost >= 0);
INSERT INTO api.mtaa_accounts(id,balance) VALUES ('system:faucet',0);
INSERT INTO api.mtaa_profiles(id,username,contact_checked,terms) VALUES ('fixture-neighbour','mtaa-lab',true,true);
INSERT INTO api.mtaa_accounts(id,balance) VALUES ('fixture-neighbour',0);
--> statement-breakpoint
CREATE FUNCTION api.mtaa_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted accounting records are immutable'; END; $$;
CREATE TRIGGER immutable_lines BEFORE UPDATE OR DELETE ON api.mtaa_lines FOR EACH ROW EXECUTE FUNCTION api.mtaa_immutable();
CREATE TRIGGER immutable_journals BEFORE UPDATE OR DELETE ON api.mtaa_journals FOR EACH ROW EXECUTE FUNCTION api.mtaa_immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON api.mtaa_audit FOR EACH ROW EXECUTE FUNCTION api.mtaa_immutable();
CREATE FUNCTION api.mtaa_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE jid text; n bigint; total numeric;
BEGIN
 jid := NEW.journal_id;
 SELECT count(*), coalesce(sum(delta),0) INTO n,total FROM api.mtaa_lines WHERE journal_id=jid;
 IF n <> 2 OR total <> 0 THEN RAISE EXCEPTION 'Unbalanced journal'; END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON api.mtaa_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION api.mtaa_balanced();
CREATE FUNCTION api.mtaa_journal_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT count(*) FROM api.mtaa_lines WHERE journal_id=NEW.id) <> 2 THEN RAISE EXCEPTION 'Journal must have two lines'; END IF;
 RETURN NEW;
END; $$;
CREATE CONSTRAINT TRIGGER complete_journal AFTER INSERT ON api.mtaa_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION api.mtaa_journal_complete();
--> statement-breakpoint
CREATE FUNCTION api.mtaa_post(p_actor text,p_kind text,p_from text,p_to text,p_amount bigint,p_meta jsonb DEFAULT '{}',p_reverse text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE ref text := 'MT-' || upper(replace(gen_random_uuid()::text,'-','')); b bigint;
BEGIN
 IF p_amount <= 0 OR p_amount > 1000000000000 OR p_from=p_to THEN RAISE EXCEPTION 'Invalid amount or recipient'; END IF;
 PERFORM id FROM api.mtaa_accounts WHERE id IN(p_from,p_to) ORDER BY id FOR UPDATE;
 SELECT balance INTO b FROM api.mtaa_accounts WHERE id=p_from;
 IF b IS NULL OR NOT EXISTS(SELECT 1 FROM api.mtaa_accounts WHERE id=p_to) THEN RAISE EXCEPTION 'Wallet not found'; END IF;
 IF p_from NOT LIKE 'system:%' AND b < p_amount THEN RAISE EXCEPTION 'Insufficient test funds'; END IF;
 INSERT INTO api.mtaa_journals(id,kind,actor,sender,recipient,amount,metadata,reversal_of) VALUES(ref,p_kind,p_actor,p_from,p_to,p_amount,p_meta,p_reverse);
 INSERT INTO api.mtaa_lines(id,journal_id,account_id,delta) VALUES(gen_random_uuid()::text,ref,p_from,-p_amount),(gen_random_uuid()::text,ref,p_to,p_amount);
 UPDATE api.mtaa_accounts SET balance=balance-p_amount WHERE id=p_from;
 UPDATE api.mtaa_accounts SET balance=balance+p_amount WHERE id=p_to;
 RETURN jsonb_build_object('reference',ref,'amount',p_amount,'fee',0,'kind',p_kind,'status','posted','recordType','ksh_simulated_ledger','sender',p_from,'recipient',p_to,'createdAt',now());
END; $$;
--> statement-breakpoint
CREATE FUNCTION api.mtaa_command(p_actor text,p_action text,p_body jsonb,p_key text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE prior api.mtaa_requests; prof api.mtaa_profiles; tok api.mtaa_tokens; dep api.mtaa_deposits; hold api.mtaa_holdings; oldj api.mtaa_journals;
 result jsonb; payload jsonb := jsonb_build_object('action',p_action,'body',p_body); recipient text; ref text; amt bigint; qty bigint; allocated_cost bigint; n bigint; lim bigint; side text; account text; did text; newqty bigint;
BEGIN
 -- Deliberately serialise mutations across this small test laboratory. This lock is transaction-scoped, including HTTP SQL calls.
 PERFORM pg_advisory_xact_lock(74819823);
 IF p_key !~ '^[A-Za-z0-9_-]{8,128}$' THEN RAISE EXCEPTION 'Invalid request key'; END IF;
 SELECT * INTO prior FROM api.mtaa_requests WHERE actor=p_actor AND key=p_key;
 IF FOUND THEN
  IF prior.payload <> payload THEN RAISE EXCEPTION 'Request key already used with different details'; END IF;
  RETURN prior.result;
 END IF;
 INSERT INTO api.mtaa_profiles(id,username) VALUES(p_actor,'user-'||substr(md5(p_actor),1,12)) ON CONFLICT(id) DO NOTHING;
 INSERT INTO api.mtaa_accounts(id,balance) VALUES(p_actor,0) ON CONFLICT DO NOTHING;
 SELECT * INTO prof FROM api.mtaa_profiles WHERE id=p_actor;
 IF prof.banned THEN RAISE EXCEPTION 'Account restricted'; END IF;
 IF p_action IN ('deposit','deposit-confirm','transfer','trade','create-token') AND NOT prof.contact_checked THEN RAISE EXCEPTION 'Complete the sandbox contact check first'; END IF;
 INSERT INTO api.mtaa_limits(key,count,expires) VALUES(p_actor||':'||p_action,1,now()+interval '1 minute')
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN api.mtaa_limits.expires<now() THEN 1 ELSE api.mtaa_limits.count+1 END,expires=CASE WHEN api.mtaa_limits.expires<now() THEN now()+interval '1 minute' ELSE api.mtaa_limits.expires END RETURNING count INTO n;
 IF n>30 THEN RAISE EXCEPTION 'Too many requests. Try again in one minute'; END IF;
 CASE p_action
 WHEN 'setup' THEN
  recipient := lower(trim(p_body->>'username'));
  IF recipient !~ '^[a-z][a-z0-9-]{2,23}$' OR recipient='mtaa-lab' THEN RAISE EXCEPTION 'Use 3–24 lowercase letters, numbers or hyphens'; END IF;
  IF p_body->>'terms' <> 'true' THEN RAISE EXCEPTION 'Accept the test-only terms'; END IF;
  UPDATE api.mtaa_profiles SET username=recipient,terms=true WHERE id=p_actor;
  result := jsonb_build_object('status','saved');
 WHEN 'contact-check' THEN
  -- Local sandbox challenge only; never marks the actual auth email as verified.
  IF p_body->>'code' <> 'MTAA-TEST' THEN RAISE EXCEPTION 'Enter the sandbox code shown on screen'; END IF;
  UPDATE api.mtaa_profiles SET contact_checked=true WHERE id=p_actor;
  result := jsonb_build_object('status','sandbox_checked','realContactVerified',false);
 WHEN 'deposit' THEN
  amt := (p_body->>'amount')::bigint;
  IF amt IS NULL OR amt<100 OR amt>10000000 THEN RAISE EXCEPTION 'Test deposits must be KSh 1–100,000'; END IF;
  SELECT coalesce(sum(amount),0) INTO n FROM api.mtaa_deposits WHERE owner=p_actor AND status='confirmed' AND created_at>now()-interval '1 day';
  IF n+amt>20000000 THEN RAISE EXCEPTION 'Daily test funding limit is KSh 200,000'; END IF;
  did := gen_random_uuid()::text;
  INSERT INTO api.mtaa_deposits(id,owner,amount) VALUES(did,p_actor,amt);
  result := jsonb_build_object('id',did,'amount',amt,'status','pending','mode','local','recordType','simulated_deposit');
 WHEN 'deposit-confirm' THEN
  SELECT * INTO dep FROM api.mtaa_deposits WHERE id=p_body->>'depositID' AND owner=p_actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deposit not found'; END IF;
  IF dep.status <> 'pending' THEN RAISE EXCEPTION 'Deposit is no longer pending'; END IF;
  IF dep.created_at<now()-interval '15 minutes' THEN
   UPDATE api.mtaa_deposits SET status='expired' WHERE id=dep.id;
   result := jsonb_build_object('status','expired');
  ELSIF p_body->>'outcome'='failed' THEN
   UPDATE api.mtaa_deposits SET status='failed' WHERE id=dep.id;
   result := jsonb_build_object('status','failed');
  ELSIF p_body->>'outcome'='confirmed' THEN
   SELECT coalesce(sum(amount),0) INTO n FROM api.mtaa_deposits WHERE owner=p_actor AND status='confirmed' AND created_at>now()-interval '1 day';
   IF n+dep.amount>20000000 THEN RAISE EXCEPTION 'Daily test funding limit is KSh 200,000'; END IF;
   result := api.mtaa_post(p_actor,'simulated_deposit','system:faucet',p_actor,dep.amount,jsonb_build_object('depositID',dep.id));
   UPDATE api.mtaa_deposits SET status='confirmed' WHERE id=dep.id;
  ELSE RAISE EXCEPTION 'Invalid simulated outcome'; END IF;
 WHEN 'transfer' THEN
  amt := (p_body->>'amount')::bigint;
  IF amt IS NULL OR amt<100 OR amt>5000000 THEN RAISE EXCEPTION 'Send KSh 1–50,000 per transfer'; END IF;
  SELECT id INTO recipient FROM api.mtaa_profiles WHERE username=lower(trim(p_body->>'recipient')) AND contact_checked=true AND banned=false;
  IF recipient IS NULL THEN RAISE EXCEPTION 'Recipient not found or not sandbox-checked'; END IF;
  result := api.mtaa_post(p_actor,'transfer',p_actor,recipient,amt,jsonb_build_object('recipientUsername',p_body->>'recipient'));
 WHEN 'create-token' THEN
  qty := (p_body->>'supply')::bigint;
  IF length(trim(p_body->>'name')) NOT BETWEEN 2 AND 40 OR (p_body->>'ticker') !~ '^[A-Z]{2,8}$' OR length(trim(p_body->>'description')) NOT BETWEEN 10 AND 500 OR qty IS NULL OR qty NOT BETWEEN 100 AND 1000000 OR p_body->>'riskAccepted'<>'true' THEN RAISE EXCEPTION 'Check token details and accept the risk disclosure'; END IF;
  ref := gen_random_uuid()::text;
  INSERT INTO api.mtaa_tokens(id,creator,name,ticker,description,supply) VALUES(ref,p_actor,trim(p_body->>'name'),p_body->>'ticker',trim(p_body->>'description'),qty);
  INSERT INTO api.mtaa_accounts(id,balance) VALUES('system:curve:'||ref,0);
  result := jsonb_build_object('id',ref,'recordType','simulated_token','mint',NULL,'creatorAllocation',0,'decimals',0);
 WHEN 'trade' THEN
  qty := (p_body->>'quantity')::bigint; lim := (p_body->>'limit')::bigint; side := p_body->>'side';
  IF qty IS NULL OR qty<1 OR qty>10000 OR lim IS NULL OR lim<0 OR side NOT IN ('buy','sell') THEN RAISE EXCEPTION 'Invalid trade'; END IF;
  SELECT * INTO tok FROM api.mtaa_tokens WHERE id=p_body->>'tokenID' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Token not found'; END IF;
  INSERT INTO api.mtaa_holdings(id,owner,token_id) VALUES(p_actor||':'||tok.id,p_actor,tok.id) ON CONFLICT DO NOTHING;
  SELECT * INTO hold FROM api.mtaa_holdings WHERE owner=p_actor AND token_id=tok.id FOR UPDATE;
  account := 'system:curve:'||tok.id;
  IF side='buy' THEN
   IF tok.sold+qty>tok.supply THEN RAISE EXCEPTION 'Not enough simulated supply'; END IF;
   amt := qty*100 + (qty*(2*tok.sold+qty-1))/2;
   IF amt>lim THEN RAISE EXCEPTION 'Quote changed beyond your price limit. Get a fresh quote'; END IF;
   result := api.mtaa_post(p_actor,'simulated_buy',p_actor,account,amt,jsonb_build_object('tokenID',tok.id,'quantity',qty));
   UPDATE api.mtaa_tokens SET sold=sold+qty,reserve=reserve+amt WHERE id=tok.id;
   UPDATE api.mtaa_holdings SET quantity=quantity+qty,cost=cost+amt WHERE id=hold.id;
  ELSE
   IF hold.quantity<qty THEN RAISE EXCEPTION 'Insufficient token quantity'; END IF;
   amt := qty*100 + (qty*(2*tok.sold-qty-1))/2;
   IF amt<lim THEN RAISE EXCEPTION 'Quote changed beyond your price limit. Get a fresh quote'; END IF;
   IF tok.reserve<amt THEN RAISE EXCEPTION 'Curve reserve invariant failed'; END IF;
   allocated_cost := (hold.cost*qty)/hold.quantity;
   result := api.mtaa_post(p_actor,'simulated_sell',account,p_actor,amt,jsonb_build_object('tokenID',tok.id,'quantity',qty));
   UPDATE api.mtaa_tokens SET sold=sold-qty,reserve=reserve-amt WHERE id=tok.id;
   UPDATE api.mtaa_holdings SET quantity=quantity-qty,cost=cost-allocated_cost,realized=realized+amt-allocated_cost WHERE id=hold.id;
  END IF;
  INSERT INTO api.mtaa_trades(id,owner,token_id,side,quantity,amount,journal_id) VALUES(gen_random_uuid()::text,p_actor,tok.id,side,qty,amt,result->>'reference');
  result := result||jsonb_build_object('recordType','simulated_trade','quantity',qty,'side',side);
 WHEN 'post' THEN
  IF NOT prof.terms THEN RAISE EXCEPTION 'Accept community terms first'; END IF;
  IF length(trim(p_body->>'body')) NOT BETWEEN 1 AND 1000 OR (p_body->>'body') ~* '(https?://|<[^>]*>|seed phrase|guaranteed return|kill yourself)' THEN RAISE EXCEPTION 'Use plain text without links, abuse or investment promises'; END IF;
  IF p_body->>'parentID' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM api.mtaa_posts WHERE id=p_body->>'parentID' AND NOT hidden) THEN RAISE EXCEPTION 'Discussion not found'; END IF;
  ref:=gen_random_uuid()::text;
  INSERT INTO api.mtaa_posts(id,author,body,parent_id) VALUES(ref,p_actor,trim(p_body->>'body'),p_body->>'parentID');
  result:=jsonb_build_object('id',ref,'status','published');
 WHEN 'like' THEN
  IF NOT EXISTS(SELECT 1 FROM api.mtaa_posts WHERE id=p_body->>'target' AND NOT hidden) THEN RAISE EXCEPTION 'Post not found'; END IF;
  ref:=p_actor||':like:'||(p_body->>'target');
  DELETE FROM api.mtaa_reactions WHERE id=ref;
  IF NOT FOUND THEN INSERT INTO api.mtaa_reactions(id,owner,target,kind) VALUES(ref,p_actor,p_body->>'target','like'); END IF;
  result:=jsonb_build_object('status','saved');
 WHEN 'report' THEN
  IF length(trim(p_body->>'reason')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'Add a reason for your report'; END IF;
  INSERT INTO api.mtaa_reports(id,actor,target,reason) VALUES(gen_random_uuid()::text,p_actor,p_body->>'target',p_body->>'reason');
  result:=jsonb_build_object('status','reported');
 WHEN 'block' THEN
  INSERT INTO api.mtaa_reactions(id,owner,target,kind) VALUES(p_actor||':block:'||(p_body->>'target'),p_actor,p_body->>'target','block') ON CONFLICT DO NOTHING;
  result:=jsonb_build_object('status','blocked');
 WHEN 'delete-post' THEN
  DELETE FROM api.mtaa_posts WHERE id=p_body->>'target' AND author=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
  result:=jsonb_build_object('status','deleted');
 WHEN 'moderate' THEN
  IF prof.role NOT IN ('admin','moderator') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(trim(p_body->>'reason')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'A moderation reason is required'; END IF;
  UPDATE api.mtaa_posts SET hidden=true WHERE id=p_body->>'target';
  UPDATE api.mtaa_reports SET status='resolved' WHERE target=p_body->>'target';
  result:=jsonb_build_object('status','hidden');
 WHEN 'reverse' THEN
  IF prof.role<>'admin' THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF length(trim(p_body->>'reason')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'A reversal reason is required'; END IF;
  SELECT * INTO oldj FROM api.mtaa_journals WHERE id=p_body->>'reference';
  IF NOT FOUND OR oldj.kind NOT IN ('transfer','simulated_deposit') THEN RAISE EXCEPTION 'This entry cannot be reversed'; END IF;
  result:=api.mtaa_post(p_actor,'reversal',oldj.recipient,oldj.sender,oldj.amount,jsonb_build_object('reason',p_body->>'reason'),oldj.id);
  IF oldj.kind='simulated_deposit' THEN UPDATE api.mtaa_deposits SET status='reversed' WHERE id=oldj.metadata->>'depositID'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported operation';
 END CASE;
 INSERT INTO api.mtaa_requests(id,actor,key,payload,result) VALUES(gen_random_uuid()::text,p_actor,p_key,payload,result);
 INSERT INTO api.mtaa_audit(id,actor,action,details) VALUES(gen_random_uuid()::text,p_actor,p_action,jsonb_build_object('key',p_key,'reference',coalesce(result->>'reference',result->>'id'),'status',result->>'status'));
 RETURN result;
END; $$;
