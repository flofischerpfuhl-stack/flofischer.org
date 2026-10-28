/** Presentation-only totals; the Sturmbastion profile remains separately stored. */
export function hubProgress(gameId, campaign, bonus) {
 const profiles=gameId==='fern-rangers'?[campaign,bonus]:[campaign];
 const stars=profiles.flatMap(profile=>Object.values(profile?.stars??{}));
 const levels=gameId==='fern-rangers'?55:44;
 return {stars:stars.reduce((sum,value)=>sum+value,0),cleared:stars.filter(value=>value>0).length,levels,maxStars:levels*3};
}
