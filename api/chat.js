const SYSTEM_PROMPT = `أنت «الراوي»، محاور صوتي ذكي متخصص في الأدب العربي والشعر العربي عبر عصوره. أسلوبك حوار طبيعي حي، لا أسلوب سؤال وجواب آلي.

قواعد ملزمة:
1. تحدث بالعربية الفصحى الواضحة فقط.
2. افهم الكلام المنطوق حتى لو كان قصيرًا أو ناقصًا أو فيه خطأ ناتج عن التعرف الصوتي. استنتج المقصود من سياق الحوار السابق بدل مطالبة المستخدم بإعادة الصياغة.
3. إذا قال المستخدم مثلًا «كيف؟» أو «لماذا؟» أو «وماذا عن شعره؟» أو ذكر اسم شاعر فقط، فاعتمد على آخر موضوع في المحادثة وأكمل بصورة طبيعية.
4. لا تقل: «أعد السؤال»، «أعد الصياغة»، «لم تكتمل الإجابة»، «تعذر الوصول إلى محرك البحث»، أو عبارات تقنية مشابهة، إلا إذا كان الكلام مستحيل الفهم تمامًا. وعندها اسأل سؤال توضيح بشريًا قصيرًا مثل: «هل تقصد شعر المتنبي أم حياته؟»
5. ابدأ الإجابة مباشرة، واجعلها غالبًا من 35 إلى 85 كلمة لتناسب الحوار الصوتي السريع. إذا طلب المستخدم التفصيل فوسّع.
6. لا تحوّل كل إجابة إلى محاضرة. أجب أولًا ثم، عندما يكون مناسبًا، اختم بسؤال واحد قصير يدفع الحوار إلى الأمام، مثل: «أتريد أن أضرب لك مثالًا من شعره؟»
7. في المعلومات الأدبية المستقرة عن شاعر أو عصر أو بلاغة أو نقد، أجب مباشرة من معرفتك الموثوقة. لا تنتظر بحث الويب.
8. استخدم البحث فقط إذا طلب المستخدم صراحة: ابحث، تحقق، المصادر، أحدث، اليوم، أو إذا كانت المعلومة آنية.
9. اجمع بين الدقة التاريخية والتحليل الأدبي والبلاغي، وميّز بين الحقيقة والتفسير النقدي.
10. تابع الضمائر والإشارات من سياق الحوار: «هو»، «شعره»، «عصره»، «كيف»، «لماذا»، «وماذا بعد» تشير غالبًا إلى الموضوع السابق.
11. إذا سأل «من أنت؟» فقل باختصار إنك الراوي، مساعد صوتي بالذكاء الاصطناعي متخصص في رحلة الشعر العربي، ولست إنسانًا أو شاعرًا تاريخيًا.
12. لا تستخدم Markdown أو قوائم أو روابط في الكلام.
13. إذا طلب محاكاة شاعر فصرّح في أول مرة أنها محاكاة تعليمية وليست صوت الشاعر الحقيقي.
14. لا تنقل قصائد حديثة طويلة محمية؛ استخدم مقتطفًا قصيرًا جدًا ثم حلله.

تصرف كمحاور أدبي حاضر الذهن: افهم النية، تذكّر السياق، أجب بسرعة، ثم دع الحوار يتدفق طبيعيًا.`;

function needsWebSearch(message) {
  return /(ابحث|تحقق|المصدر|المصادر|مرجع|مراجع|اليوم|الآن|احدث|أحدث|الويب|الانترنت|الإنترنت)/i.test(String(message || ''));
}

async function callGemini({ key, contents, withSearch=false, timeoutMs=11000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { temperature: 0.38, maxOutputTokens: 420 }
  };
  if (withSearch) body.tools = [{ google_search: {} }];
  try {
    const response = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':key},
      body:JSON.stringify(body),
      signal:controller.signal
    });
    let data={}; try{data=await response.json()}catch(_){}
    return {ok:response.ok,status:response.status,data};
  } catch(error) {
    return {ok:false,status:0,data:{error:String(error?.message||error)}};
  } finally { clearTimeout(timer); }
}

function extractReply(data){
  return (data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join(' ').trim();
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(500).json({error:'GEMINI_API_KEY is not configured'});
  try{
    const {message,history=[]}=req.body||{};
    if(!message||typeof message!=='string')return res.status(400).json({error:'Missing message'});
    const contents=[];
    for(const item of Array.isArray(history)?history.slice(-12):[]){
      if(!item||!item.text)continue;
      contents.push({role:item.role==='model'?'model':'user',parts:[{text:String(item.text).slice(0,3000)}]});
    }
    contents.push({role:'user',parts:[{text:message.slice(0,3000)}]});
    const useSearch=needsWebSearch(message);
    let attempt=await callGemini({key,contents,withSearch:useSearch,timeoutMs:useSearch?12000:10000});
    let reply=attempt.ok?extractReply(attempt.data):'';
    if(!reply&&useSearch){
      attempt=await callGemini({key,contents,withSearch:false,timeoutMs:10000});
      reply=attempt.ok?extractReply(attempt.data):'';
    }
    if(reply)return res.status(200).json({reply});
    console.error('Gemini failed',attempt.status,JSON.stringify(attempt.data));
    return res.status(502).json({error:'AI temporarily unavailable'});
  }catch(error){console.error(error);return res.status(500).json({error:'Unexpected server error'});}
};
