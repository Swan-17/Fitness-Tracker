import {NextRequest,NextResponse} from "next/server"; import {healthList} from "@/lib/google-health";
export async function GET(req:NextRequest){
 const raw=req.cookies.get("google_tokens")?.value; if(!raw)return NextResponse.json({error:"Not connected"},{status:401});
 const type=req.nextUrl.searchParams.get("type")||"heart-rate"; const end=new Date(); const start=new Date(end.getTime()-24*60*60*1000);
 try{return NextResponse.json(await healthList(type,JSON.parse(raw),start.toISOString(),end.toISOString()))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unknown error"},{status:502})}
}