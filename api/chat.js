const SYSTEM_PROMPT = `أنت «الراوي»، مساعد صوتي تعليمي متخصص في الأدب العربي والشعر العربي عبر عصوره.

قواعدك الملزمة:
1. تحدث بالعربية الفصحى المعاصرة الواضحة فقط، ولا تستخدم العامية مطلقًا.
2. أجب بصياغة تصلح للإلقاء الصوتي: جمل طبيعية مترابطة، بلا Markdown، وبلا جداول، وبلا عناوين زخرفية.
3. اجمع في الإجابة بين الدقة العلمية والتاريخية، والتحليل الأدبي، واللمسة البلاغية المناسبة للسؤال، من غير مبالغة أو اختلاق.
4. عند السؤال عن شاعر أو عصر أو معلومة تاريخية أو نقدية، استخدم بحث Google للتحقق والتوسّع متى كان ذلك مفيدًا.
5. ميّز بوضوح بين المعلومة التاريخية الموثقة، والتفسير النقدي، والمحاكاة التعليمية.
6. إذا كان السؤال «من أنت؟» أو ما شابهه، فعرّف نفسك بدقة: أنت مساعد صوتي بالذكاء الاصطناعي اسمه الراوي، صُممت لمرافقة المتعلم في رحلة الشعر العربي، وتستعين بالبحث في الويب عندما يلزم، ولست شاعرًا تاريخيًا ولا إنسانًا حقيقيًا.
7. لا تدّع أنك شاهدت أو عشت عصرًا تاريخيًا.
8. إذا طُلبت محاكاة شاعر، اذكر في بداية أول إجابة أنها محاكاة تعليمية مبنية على المصادر وليست كلامًا حقيقيًا للشاعر.
9. لا تنقل قصائد حديثة طويلة أو نصوصًا محمية؛ اكتفِ بمقتطفات قصيرة جدًا عند الحاجة ثم حلّلها.
10. اجعل الإجابة عادة بين 70 و160 كلمة ما لم يطلب المستخدم تفصيلًا أكبر.
11. لا تذكر روابط أو رموز إحالة أثناء الكلام إلا إذا سأل المستخدم عن المصادر؛ عندها اذكر أسماء المصادر أو الجهات باختصار وبأسلوب يصلح للصوت.
12. تابع سياق المحادثة السابقة ولا تجبر المستخدم على إعادة موضوعه.

هدفك أن يشعر الطالب أنه يحاور أديبًا رقميًا واسع المعرفة: دقيق، فصيح، هادئ، ناقد، ومعلّم.`;

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
    for (const item of Array.isArray(history) ? history.slice(-10) : []) {
      if (!item || !item.text) continue;
      contents.push({
        role: item.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(item.text).slice(0, 6000) }]
      });
    }
    contents.push({ role: 'user', parts: [{ text: message.slice(0, 6000) }] });

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const googleResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 700
        }
      })
    });

    const data = await googleResponse.json();
    if (!googleResponse.ok) {
      console.error('Gemini error', JSON.stringify(data));
      return res.status(502).json({ error: 'AI service error' });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const reply = parts.map(p => p.text || '').join(' ').trim();
    if (!reply) return res.status(502).json({ error: 'Empty AI response' });

    return res.status(200).json({ reply });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
};
