import {google} from "googleapis";

export const SCOPES=[
 "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
 "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
 "https://www.googleapis.com/auth/googlehealth.sleep.readonly"
];

export function oauthClient(){
 const c=new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_REDIRECT_URI);
 if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET||!process.env.GOOGLE_REDIRECT_URI) throw new Error("Missing Google OAuth environment variables");
 return c;
}
export function authUrl(state:string){return oauthClient().generateAuthUrl({access_type:"offline",scope:SCOPES,include_granted_scopes:true,state,prompt:"consent"});}
export async function healthList(type:string, tokens:any, start:string, end:string){
 const client=oauthClient(); client.setCredentials(tokens);
 const {token}=await client.getAccessToken();
 if(!token) throw new Error("Unable to refresh Google access token");
 const field=type.replaceAll("-","_");
 const u=new URL(`https://health.googleapis.com/v4/users/me/dataTypes/${type}/dataPoints`);
 u.searchParams.set("pageSize","10000");
 u.searchParams.set("dataSourceFamily","users/me/dataSourceFamilies/google-wearables");
 u.searchParams.set("filter",`${field}.start_time >= "${start}" AND ${field}.start_time < "${end}"`);
 const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store"});
 if(!r.ok) throw new Error(`Google Health API ${r.status}: ${await r.text()}`);
 return r.json();
}