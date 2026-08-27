// =========================================================
// Cloudflare Worker: Firebase Cloud Messaging (FCM HTTP v1) 푸시 중계 서버
// =========================================================

const SA = {
  project_id: "ryuwithagree",
  client_email: "firebase-adminsdk-fbsvc@ryuwithagree.iam.gserviceaccount.com",
  private_key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC4/ItHeJ4csChd
lG6Q8wPtWTD2VRIYdf5zaVN/u8sPmg7VYoBjfs6VNtfM0UTldcGUjw7Hirvqz3hK
I6PpfQaO+JVcWXbu+MUpbFV1KHSlem0PNHmZBaUpFlvOTZPfoHs4OUi4Hgfpq8+3
L7wwhmr7eOl8mynwtRRgXLJzMLCofDmCIBNg0tZBzgndp52P+Fc6eEFSsDqAJOSF
7z0/0FzJyo3m4cF+e0kI6o7n4w025/FSHtyudafziDlSqHLy8xG10K1gt1AVrSyE
lBAfCeDwqb+0DhIueM0xiueDhMN/D4xQw9lC3Lw/vJrzbwwJpLS7TZO2GoEZHchR
cm4qcf+7AgMBAAECggEABBTeZddNdciVO2tY/S2/em8rW2QJIC0KTjWWuAzGsDNv
/FlOB+P2Xuh03noHkSCGAucdJl3zQ30MZGZg6XfuuxzU/tKigydOAln3kLwxxqzq
1xkLTcsIF938bJLdnmOGFHl/F0DiX8+Ap8QP3Oo6Vg4W6L7rr/nu1yl0boI2g6Eg
ao26l3w4rU2hmGaxOkKRs5A2XnJZ1pm7zxTk4cDsyhyle/h6Pq6jGorEMR0Y2Lee
9Pp+zYasrhXaD1EUgl53PIfJ2J+RkdST0cY8mJxbtXXAQrWdFxmCLbtG8STg6lLu
pjker9c+G3JEvELO/a/DYWcyfUjdHOaoaxtGZqdc4QKBgQDqYiZ4fj3PJO9E2NPd
RieduWw/fR9DriSzms2l7Sh9TvBO87b0sQl/6cbSU9tVbbfy7pjozJAR7nXU3JQi
J7KimFT9wWC2pQN89dphYdS3UGnD68diudCf8QdXOHFwJz1sAjAyWuKwVq2eZpgz
OLaV/p5Of1Mj2WDFRW7OFBAJAwKBgQDKDB7vS5maI+WxL0QPbwedJ3rYpO4JawoI
aLSKdhkVHdRMS7GqmwJJzE7N8wyunNg9TxVk1IjHz4L21/Uv9kbgmTrSmnwZA+8l
wg6YotY2Z7FWsw22w91qpHX9RoEUdTyIM7Ug5M1xDiuihSFWEqfSweTBaSw07OyU
QvNswidE6QKBgCeWLkM5pzzeUx9As//ygmxsTfEnM+mddwtywPseZDFN7N6Y4TTQ
1fbpyC/sA+aY4nHAhMkFC+xLZ1FtdAOUyuIVcn1tdOVEV6N6bsj12hSgG00A/Ksb
ETaCYigEG3zC0+fzMqq+mP0JlsdjMp+sG4KX/6robGVoqKSJBp792nt7AoGBAKgm
ekBQvJ7prSlO2ue1UbLavoQ6jthLuufQrCBntOw8DQkKHeyMYNUmMZd45V8UrWoo
vPdTYhpYevgQNsAZyFb3b1sCsrDm80qLPDaPnpNcrNwo3Ar06vrrsD5/RMHP5/a6
gc3EXa3vSyVQgrPthroCH+1PKDlLzIB/T7N9ycyxAoGBAMMyM5GmwbTdD2KrQZO0
cs6+Wdeh3Js1d72byTDYoijy6G5VQij75VOgT3jLcmwaOpwdSW9hdIFioQD4EQO0
rKlU6pWkc52Rqz4+lT8ez55uy5GQ+b/XFSvtsbJUhQhXX1JKK8FczFTDRlDTTZNe
4wQx0gUqe3gCgC6Vy6yH/n4Q
-----END PRIVATE KEY-----`,
};

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function arrayBufferToBase64Url(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && tokenExpiresAt > now + 60) {
    return cachedAccessToken;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: SA.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encClaim = base64UrlEncode(JSON.stringify(claimSet));
  const unsignedJwt = `${encHeader}.${encClaim}`;

  const keyBuffer = pemToArrayBuffer(SA.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedJwt)
  );

  const signature = arrayBufferToBase64Url(signatureBuffer);
  const jwt = `${unsignedJwt}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 토큰 획득 실패: ${errText}`);
  }

  const data = await tokenRes.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + data.expires_in;
  return cachedAccessToken;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const isAllowed =
      origin === "https://agreesin.github.io" ||
      origin.includes("localhost") ||
      origin.includes("127.0.0.1");

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowed ? origin : "https://agreesin.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST 메서드만 지원합니다." }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      let tokens = body.tokens || (body.token ? [body.token] : []);
      const title = body.title || "류이어리 💌";
      const message = body.message || "새로운 소식이 도착했습니다 ✨";
      const url = body.url || "https://agreesin.github.io/ryuwithagree/";

      if (!tokens || tokens.length === 0) {
        return new Response(JSON.stringify({ error: "발송 대상 토큰이 없습니다." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = await getGoogleAccessToken();
      const sendResults = [];

      for (const token of tokens) {
        try {
          const fcmPayload = {
            message: {
              token: token,
              notification: {
                title: title,
                body: message,
              },
              webpush: {
                notification: {
                  title: title,
                  body: message,
                  icon: "https://agreesin.github.io/ryuwithagree/icons/icon-192.png",
                  badge: "https://agreesin.github.io/ryuwithagree/icons/icon-192.png",
                },
                fcm_options: {
                  link: url,
                },
              },
              data: {
                title: title,
                message: message,
                url: url,
              },
            },
          };

          const fcmRes = await fetch(
            `https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(fcmPayload),
            }
          );

          const resData = await fcmRes.json().catch(() => null);
          sendResults.push({
            token: token.substring(0, 10) + "...",
            status: fcmRes.status,
            success: fcmRes.ok,
            data: resData,
          });
        } catch (tokenErr) {
          sendResults.push({
            token: token.substring(0, 10) + "...",
            success: false,
            error: tokenErr.message,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: tokens.length,
          results: sendResults,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          success: false,
          error: err.message || "서버 내부 오류",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  },
};



