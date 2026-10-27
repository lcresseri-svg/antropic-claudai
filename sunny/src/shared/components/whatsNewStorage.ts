/** Acknowledgement is scoped to the signed-in user and release on this device. */
const key=(userId:string,version:string)=>`sunny_whatsnew_seen_${version}_${userId}`;
export function hasSeenWhatsNew(userId:string,version:string):boolean{
 try{return localStorage.getItem(key(userId,version))==='1';}catch{return true;}
}
export function markWhatsNewSeen(userId:string,version:string):void{
 try{localStorage.setItem(key(userId,version),'1');}catch{/* Storage may be unavailable. */}
}
