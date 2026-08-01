import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/shared.ts';
import { parseTransitionCommand } from '@/domain/runtime.ts';
import { createClient } from '@/lib/supabase/server';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) { try { const db=await createClient(); const {data}=await db.auth.getClaims(); if(!data?.claims?.sub)return NextResponse.json({error:'unauthorized'},{status:401}); const {id}=await params; const command=parseTransitionCommand(await request.json()); const result=await db.rpc('transition_domain_entity',{p_entity_type:'growth_contract',p_entity_id:id,p_to_status:command.toStatus,p_expected_version:command.expectedVersion,p_idempotency_key:command.idempotencyKey}); if(result.error)throw new DomainError('TRANSITION_REJECTED',result.error.message); return NextResponse.json(result.data); } catch(error){const domain=error instanceof DomainError?error:null;return NextResponse.json({error:domain?.code??'INTERNAL_ERROR',message:domain?.message??'Unexpected error'},{status:domain?409:500});} }
