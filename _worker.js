// =========================================================
// _worker.js - Cloudflare Pages / Worker 고급 진입점
// POST 요청 시 OneSignal 푸시를 안전하게 발송하고, GET 요청 시 정적 자산을 서빙합니다.
// =========================================================

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // CORS Preflight (OPTIONS) 처리
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 푸시 발송 POST 요청 처리
    if (request.method === "POST") {
      try {
        const { title, message } = await request.json();

        const ONESIGNAL_APP_ID = env.ONESIGNAL_APP_ID || "5405c7d7-4164-4bc8-af32-7863626eaa06";
        const ONESIGNAL_REST_API_KEY = env.ONESIGNAL_REST_API_KEY;

        if (!ONESIGNAL_REST_API_KEY) {
          return new Response(
            JSON.stringify({ error: "ONESIGNAL_REST_API_KEY is not configured in Cloudflare environment" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const oneSignalRes = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Key ${ONESIGNAL_REST_API_KEY}`,
          },
          body: JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            included_segments: ["Subscribed Users", "Total Subscriptions"],
            headings: { en: title, ko: title },
            contents: { en: message, ko: message },
            url: "https://agreesin.github.io/ryuwithagree/",
            web_url: "https://agreesin.github.io/ryuwithagree/",
          }),
        });

        const data = await oneSignalRes.json();
        return new Response(JSON.stringify(data), {
          status: oneSignalRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 일반 정적 파일 요청 서빙 (Pages fallback)
    if (env.ASSETS && env.ASSETS.fetch) {
      return env.ASSETS.fetch(request);
    }

    return new Response("OK", { headers: corsHeaders });
  },
};
