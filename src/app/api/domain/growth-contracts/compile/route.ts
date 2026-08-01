import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/shared.ts';
import { parseCompileCommand } from '@/domain/runtime.ts';
import { createClient } from '@/lib/supabase/server';
import { GrowthContractService } from '@/server/domain/growth-contract-service';

export async function POST(request: Request) {
  try { const db=await createClient(); const {data}=await db.auth.getClaims(); const actorId=data?.claims?.sub; if (!actorId) return NextResponse.json({error:'unauthorized'},{status:401}); const command=parseCompileCommand(await request.json()); const result=await new GrowthContractService(db,actorId).compile(command); return NextResponse.json(result,{status:201}); }
  catch(error) { const domain=error instanceof DomainError?error:null; return NextResponse.json({error:domain?.code??'INTERNAL_ERROR',message:domain?.message??'Unexpected error'},{status:domain?.code==='PREVIEW_MISMATCH'?409:domain?422:500}); }
}
