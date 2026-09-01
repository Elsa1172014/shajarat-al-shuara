const SYSTEM_PROMPT = `أنت «الراوي»، مساعد صوتي تعليمي متخصص في الأدب العربي والشعر العربي عبر عصوره.

قواعدك الملزمة:
1. تحدث بالعربية الفصحى المعاصرة الواضحة فقط، ولا تستخدم العامية مطلقًا.
2. أجب بصياغة تصلح للإلقاء الصوتي: جمل طبيعية مترابطة، بلا Markdown، وبلا جداول، وبلا عناوين زخرفية.
3. اجمع في الإجابة بين الدقة العلمية والتاريخية، والتحليل الأدبي، واللمسة البلاغية المناسبة للسؤال، من غير مبالغة أو اختلاق.
4. في الأسئلة الأدبية المعروفة عن الشعراء والعصور والبلاغة والنقد، أجب مباشرة من معرفتك الموثوقة ولا تؤخر الإجابة بسبب البحث.
5. استخدم البحث في الويب فقط عندما يطلب المستخدم صراحة التحقق أو المصادر أو معلومة حديثة، أو عندما تكون المعلومة غير مستقرة زمنيًا.
6. ميّز بوضوح بين المعلومة التاريخية الموثقة، والتفسير النقدي، والمحاكاة التعليمية.
7. إذا كان السؤال «من أنت؟» أو ما شابهه، فعرّف نفسك بدقة: أنت مساعد صوتي بالذكاء الاصطناعي اسمه الراوي، صُممت لمرافقة المتعلم في رحلة الشعر العربي، ولست شاعرًا تاريخيًا ولا إنسانًا حقيقيًا.
8. لا تدّع أنك شاهدت أو عشت عصرًا تاريخيًا.
9. إذا طُلبت محاكاة شاعر، اذكر في بداية أول إجابة أنها محاكاة تعليمية مبنية على المصادر وليست كلامًا حقيقيًا للشاعر.
10. لا تنقل قصائد حديثة طويلة أو نصوصًا محمية؛ اكتفِ بمقتطفات قصيرة جدًا عند الحاجة ثم حلّلها.
11. اجعل الإجابة عادة بين 55 و120 كلمة، وابدأ بجواب مباشر خلال الجملة الأولى.
12. لا تذكر روابط أو رموز إحالة أثناء الكلام إلا إذا سأل المستخدم عن المصادر.
13. تابع سياق المحادثة السابقة ولا تجبر المستخدم على إعادة موضوعه.
14. لا تقل مطلقًا «تعذر الوصول إلى محرك البحث» في سؤال أدبي عادي. إذا تعذر البحث فاستمر من معرفتك العامة الموثوقة.

هدفك أن يشعر الطالب أنه يحاور أديبًا رقميًا واسع المعرفة: سريع، دقيق، فصيح، هادئ، ناقد، ومعلّم.`;

function needsWebSearch(message) {
  const text = String(message || '');
  return /(ابحث|تحقق|المصدر|المصادر|مرجع|مراجع|حديث|حديثة|اليوم|الآن|اخر|آخر|أحدث|الويب|الانترنت|الإنترنت)/i.test(text);
}

async function callGemini({ key, contents, model, withSearch = false, timeoutMs = 9000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { temperature: 0.28, maxOutputTokens: 430 }
  };
  if (withSearch) body.tools = [{ google_search: {} }];

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: String(error?.message || error) } };
  } finally {
    clearTimeout(timer);
  }
}

function extractReply(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join(' ').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });

  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Missing message' });

    const contents = [];
    for (const item of Array.isArray(history) ? history.slice(-8) : []) {
      if (!item || !item.text) continue;
      contents.push({ role: item.role === 'model' ? 'model' : 'user', parts: [{ text: String(item.text).slice(0, 3500) }] });
    }
    contents.push({ role: 'user', parts: [{ text: message.slice(0, 3500) }] });

    const useSearch = needsWebSearch(message);
    let attempt;

    // المسار السريع: الأسئلة الأدبية العادية لا تحتاج بحثًا في كل مرة.
    if (!useSearch) {
      attempt = await callGemini({ key, contents, model: 'gemini-2.5-flash', withSearch: false, timeoutMs: 7500 });
      let reply = attempt.ok ? extractReply(attempt.data) : '';
      if (reply) return res.status(200).json({ reply });

      // مسار احتياطي أخف وأسرع إذا تعذر النموذج الأول.
      console.error('Primary Gemini failed', attempt.status, JSON.stringify(attempt.data));
      attempt = await callGemini({ key, contents, model: 'gemini-2.5-flash-lite', withSearch: false, timeoutMs: 6500 });
      reply = attempt.ok ? extractReply(attempt.data) : '';
      if (reply) return res.status(200).json({ reply });
    } else {
      // البحث يُستخدم فقط عند طلبه أو عند الحاجة إلى معلومة آنية.
      attempt = await callGemini({ key, contents, model: 'gemini-2.5-flash', withSearch: true, timeoutMs: 9000 });
      let reply = attempt.ok ? extractReply(attempt.data) : '';
      if (reply) return res.status(200).json({ reply });

      console.error('Grounded Gemini failed', attempt.status, JSON.stringify(attempt.data));
      attempt = await callGemini({ key, contents, model: 'gemini-2.5-flash', withSearch: false, timeoutMs: 7000 });
      reply = attempt.ok ? extractReply(attempt.data) : '';
      if (reply) return res.status(200).json({ reply });
    }

    console.error('All Gemini attempts failed', attempt?.status, JSON.stringify(attempt?.data || {}));
    return res.status(502).json({ error: 'AI temporarily unavailable' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
