/**
 * Phase 12 — deterministic semantic grammar.
 * Preserves compound action/role relationships before task-title rendering.
 * No LLM, model, network, or probabilistic generation.
 */
export type SemanticItem = { text: string; quantity: number | null };
export type GrammarFrame = {
  primaryVerb: string | null;
  personText: string | null;
  purposeText: string | null;
  subjectText: string | null;
  locationText: string | null;
  objectText: string | null;
  items: SemanticItem[];
  relations: string[];
};

const ACTIONS='(?:call|ring|phone|email|text|message|contact|ask|tell|confirm|check|inspect|measure|fix|repair|send|write|book|pay|finish|review|meet|visit|order|clean|install|remove|replace|update|change|chase|follow\\s*up|pick\\s*up|pickup|grab|collect|fetch|get|buy|purchase|drop\\s+off|dropoff|deliver|take|leave|remind|schedule|go|head|drive|travel|walk|return)';
const COMMUNICATION=/^(?:call|ring|phone|email|text|message|contact|ask|tell|chase|follow\s*up)$/i;
const DELIVERY=/^(?:drop\s+off|dropoff|deliver|take|leave)$/i;
const MOVEMENT=/^(?:go|head|drive|travel|walk|return)$/i;
const PICKUP=/^(?:pick\s*up|pickup|grab|collect|fetch|get|buy|purchase)$/i;

function clean(v:string|null|undefined):string|null{const x=v?.replace(/\s+/g,' ').replace(/^[,;\s]+|[,;.?!\s]+$/g,'').trim();return x||null;}
function verbFrom(text:string):string|null{
 const lead=text.replace(/^\s*(?:um+|uh+|er+|erm+)\b[,:-]?\s*/i,'').replace(/^\s*(?:actually|okay|ok|right|well)\s*[,:-]?\s*/i,'').replace(/^\s*(?:i\s+need\s+to|i\s+have\s+to|i\s+got\s+to)\s+/i,'');
 const m=lead.match(new RegExp('^('+ACTIONS+')\\b','i')); return clean(m?.[1])?.toLowerCase()??null;
}
function parseItem(s:string):SemanticItem{const m=s.trim().match(/^(\d+(?:\.\d+)?)\s+(.+)$/);if(!m)return{text:clean(s)??'',quantity:null};const q=Number(m[1]);return{text:clean(m[2])??'',quantity:Number.isFinite(q)?q:null};}
function splitItems(s:string):SemanticItem[]{const x=clean(s);if(!x)return[];return x.split(/\s+and\s+(?=\d+(?:\.\d+)?\s+)/i).map(parseItem).filter(i=>!!i.text);}
function base(v:string):GrammarFrame{return{primaryVerb:v,personText:null,purposeText:null,subjectText:null,locationText:null,objectText:null,items:[],relations:[]};}

function communication(text:string,v:string):GrammarFrame{
 const after=text.match(/\b(?:call|ring|phone|email|text|message|contact|ask|tell|confirm|check|chase|follow\s*up)\s+(.+)$/i)?.[1];
 if(!after)return base(v);
 const m=after.match(/^(.+?)(?=\s+(?:to|about|regarding|on|for|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))(?:\s+|$)|$)/i);
 const person=clean(m?.[1]??after), rem=m?clean(after.slice(m[0].length)):null;
 if(!rem)return{...base(v),personText:person,objectText:person,relations:['action→person']};
 const lm=rem.match(/\s+for\s+([A-Z][A-Za-z0-9' .-]{1,80})\s*$/);
 const location=clean(lm?.[1]);
 const purpose=clean(lm?rem.slice(0,lm.index).trim():rem);
 const subject=clean(purpose?.replace(/^(?:to\s+)?(?:get|grab|pick\s*up|collect|fetch|check|inspect|confirm|ask|find\s+out|find|sort\s+out|sort)\s+(?:the\s+|a\s+|an\s+)?/i,''));
 return{...base(v),personText:person,purposeText:purpose,subjectText:subject??purpose,locationText:location,objectText:subject??purpose,relations:['action→person','action→purpose','purpose→subject',...(location?['purpose→location']:[])]};
}
function movement(text:string,v:string):GrammarFrame{
 const after=text.match(new RegExp('^.*?\\b'+v.replace(/\s+/g,'\\s+')+'\\s+to\\s+(.+)
 const purpose=clean(rem?.match(/^(?:to|and|for)\s+(.+)$/i)?.[1]);
 const nested=purpose?.match(new RegExp('^('+ACTIONS+')\\s+(.+)$','i'));
 const nv=clean(nested?.[1])?.toLowerCase()??null, no=clean(nested?.[2]);
 const items=nv&&PICKUP.test(nv)&&no?splitItems(no):[];
 const object=items.length?items.map(i=>i.quantity!=null?i.quantity+' '+i.text:i.text).join(' and '):no;
 return{...base(v),purposeText:purpose,subjectText:no,locationText:destination,objectText:object,items,relations:['action→destination',...(purpose?['destination→purpose']:[]),...(no?['purpose→object']:[])]};
}
function delivery(text:string,v:string):GrammarFrame{
 const after=text.match(new RegExp('^.*?\\b'+v.replace(/\s+/g,'\\s+')+'\\s+(.+)$','i'))?.[1];
 if(!after)return base(v);
 // Remove trailing scheduling language before extracting the delivery destination.
 const withoutTime=clean(after.replace(/\s+(?:today|tomorrow|tonight|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)).*$/i,''));
 const m=withoutTime?.match(/^(.+?)\s+to\s+(.+)$/i);
 if(!m)return base(v);
 const object=clean(m[1]),destination=clean(m[2]),items=splitItems(object??'');
 return{...base(v),subjectText:object,objectText:items.length?items.map(i=>i.quantity!=null?i.quantity+' '+i.text:i.text).join(' and '):object,locationText:destination,items,relations:['action→object','action→destination']};
}
function pickup(text:string,v:string):GrammarFrame{
 const after=text.match(new RegExp('^.*?\\b'+v.replace(/\s+/g,'\\s+')+'\\s+(.+)$','i'))?.[1];const object=clean(after),items=splitItems(object??'');
 return{...base(v),subjectText:object,objectText:items.length?items.map(i=>i.quantity!=null?i.quantity+' '+i.text:i.text).join(' and '):object,items,relations:object?['action→object']:[]};
}
export function parseSemanticGrammar(rawText:string):GrammarFrame{
 const text=rawText.replace(/\s+/g,' ').trim(),v=verbFrom(text);
 if(!v)return base('');
 if(COMMUNICATION.test(v))return communication(text,v);
 if(MOVEMENT.test(v))return movement(text,v);
 if(DELIVERY.test(v))return delivery(text,v);
 if(PICKUP.test(v))return pickup(text,v);
 // For verbs without a confident role pattern, leave the legacy parser in charge.
 // In particular, do not turn temporal/object phrases after “check” into a person.
 return base(v);
}
,'i'))?.[1];if(!after)return base(v);
 // A temporal aside between the destination and purpose ("go to Bunnings
 // this morning to grab...") belongs to the schedule, not the place name.
 // Consume that aside as part of the boundary so it cannot leak into the
 // destination or break purpose extraction.
 const temporalAside='(?:(?:this\\s+(?:morning|afternoon|evening|weekend)|today|tomorrow|next\\s+week|next\\s+month|on\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\\s+)?';
 const boundary=new RegExp('\\s+'+temporalAside+'(?=(?:to|and|for)\\s+(?:'+ACTIONS+'|the\\s+site\\s+meeting|the\\s+meeting|a\\s+meeting)\\b)','i');
 const boundaryMatch=boundary.exec(after);
 const destination=clean(boundaryMatch?after.slice(0,boundaryMatch.index):after);
 const rem=boundaryMatch?clean(after.slice(boundaryMatch.index+boundaryMatch[0].length)):null;
 const purpose=clean(rem?.match(/^(?:to|and|for)\s+(.+)$/i)?.[1]);
 const nested=purpose?.match(new RegExp('^('+ACTIONS+')\\s+(.+)$','i'));
 const nv=clean(nested?.[1])?.toLowerCase()??null, no=clean(nested?.[2]);
 const items=nv&&PICKUP.test(nv)&&no?splitItems(no):[];
 const object=items.length?items.map(i=>i.quantity!=null?i.quantity+' '+i.text:i.text).join(' and '):no;
 return{...base(v),purposeText:purpose,subjectText:no,locationText:destination,objectText:object,items,relations:['action→destination',...(purpose?['destination→purpose']:[]),...(no?['purpose→object']:[])]};
}
function delivery(text:string,v:string):GrammarFrame{
 const after=text.match(new RegExp('^.*?\\b'+v.replace(/\s+/g,'\\s+')+'\\s+(.+)$','i'))?.[1];
 if(!after)return base(v);
 // Remove trailing scheduling language before extracting the delivery destination.
 const withoutTime=clean(after.replace(/\s+(?:today|tomorrow|tonight|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)).*$/i,''));
 const m=withoutTime?.match(/^(.+?)\s+to\s+(.+)$/i);
 if(!m)return base(v);
 const object=clean(m[1]),destination=clean(m[2]),items=splitItems(object??'');
 return{...base(v),subjectText:object,objectText:items.length?items.map(i=>i.quantity!=null?i.quantity+' '+i.text:i.text).join(' and '):object,locationText:destination,items,relations:['action→object','action→destination']};
}
function pickup(text:string,v:string):GrammarFrame{
 const after=text.match(new RegExp('^.*?\\b'+v.replace(/\s+/g,'\\s+')+'\\s+(.+)$','i'))?.[1];const object=clean(after),items=splitItems(object??'');
 return{...base(v),subjectText:object,objectText:items.length?items.map(i=>i.quantity!=null?i.quantity+' '+i.text:i.text).join(' and '):object,items,relations:object?['action→object']:[]};
}
export function parseSemanticGrammar(rawText:string):GrammarFrame{
 const text=rawText.replace(/\s+/g,' ').trim(),v=verbFrom(text);
 if(!v)return base('');
 if(COMMUNICATION.test(v))return communication(text,v);
 if(MOVEMENT.test(v))return movement(text,v);
 if(DELIVERY.test(v))return delivery(text,v);
 if(PICKUP.test(v))return pickup(text,v);
 // For verbs without a confident role pattern, leave the legacy parser in charge.
 // In particular, do not turn temporal/object phrases after “check” into a person.
 return base(v);
}
