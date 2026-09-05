import QRCode from "qrcode";

export async function qrResponse(request, isAllowed = () => true) {
  const requestUrl = new URL(request.url);
  const targetText = requestUrl.searchParams.get("u") || "";
  if (!targetText.startsWith("/") || targetText.startsWith("//")) return errorResponse();
  let target;
  try {
    target = new URL(targetText, requestUrl.origin);
  } catch {
    return errorResponse();
  }

  const allowedPath = target.pathname === "/vote"
    || target.pathname === "/pad/rosa"
    || target.pathname === "/pad/blau"
    || target.pathname === "/buzzer/rosa"
    || target.pathname === "/buzzer/blau";
  const token = target.searchParams.get("t") || "";
  if (!allowedPath || !/^[a-f0-9]{32}$/i.test(token) || [...target.searchParams.keys()].some((key) => key !== "t") || !isAllowed(target)) {
    return errorResponse();
  }

  const svg = await QRCode.toString(target.href, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

export function qrMatchesGame(data, target) {
  const token = target.searchParams.get("t") || "";
  if (target.pathname === "/vote") return Object.values(data.vote?.tokens || {}).includes(token);
  if (target.pathname === "/pad/rosa") return data.map?.tokens.rosa === token;
  if (target.pathname === "/pad/blau") return data.map?.tokens.blau === token;
  return false;
}

function errorResponse() {
  return Response.json({ ok: false, error: "invalid_qr_target" }, {
    status: 400,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
