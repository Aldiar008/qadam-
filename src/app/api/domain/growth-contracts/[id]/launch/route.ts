import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/shared.ts';
import { parseLaunchCommand } from '@/domain/runtime.ts';
import { createClient } from '@/lib/supabase/server';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) { try { const db=await createClient(); const {data}=await db.auth.getClaims(); if(!data?.claims?.sub)return NextResponse.json({error:'unauthorized'},{status:401}); const {id}=await params; const command=parseLaunchCommand(await request.json()); const result=await db.rpc('launch_growth_contract',{p_contract_id:id,p_name:command.name,p_channel:command.channel,p_expected_version:command.expectedVersion,p_idempotency_key:command.idempotencyKey}); if(result.error)throw new DomainError('LAUNCH_REJECTED',result.error.message); return NextResponse.json(result.data); } catch(error){const domain=error instanceof DomainError?error:null;return NextResponse.json({error:domain?.code??'INTERNAL_ERROR',message:domain?.message??'Unexpected error'},{status:domain?409:500});} }
